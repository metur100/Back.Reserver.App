# Architecture

BackReserve is a **modular monolith**: one ASP.NET Core API backed by one SQL Server database, consumed by a React web app (customer ordering page + bakery dashboard) and an Expo/React Native app. The backend is the single source of truth for prices, stock, pickup slots and order state; clients never compute anything authoritative.

```
┌──────────────┐   ┌──────────────┐
│  apps/web    │   │ apps/mobile  │      React + Vite / Expo (React Native)
└──────┬───────┘   └──────┬───────┘
       │  HTTPS, JSON /api/v1 (JWT bearer for staff, capability token for guests)
┌──────▼──────────────────▼───────┐
│ BackReserve.Api                 │  controllers (thin), auth, tenant filter, validation filter,
│                                 │  problem details, rate limiting, security headers, static media
├─────────────────────────────────┤
│ BackReserve.Application         │  use cases (services), DTOs, validators, email templates
├─────────────────────────────────┤
│ BackReserve.Domain              │  entities, enums, pure rules (state machine, pickup calendar, codes)
├─────────────────────────────────┤
│ BackReserve.Infrastructure      │  EF Core + SQL Server, Identity, JWT, outbox, SMTP, file storage,
│                                 │  background jobs, seeding
└──────────────┬──────────────────┘
               ▼
        Microsoft SQL Server
```

## Projects

| Project | Responsibility | Depends on |
|---|---|---|
| `BackReserve.Domain` | Entities, enums, pure business rules: `OrderStateMachine`, `PickupCalendar` (slots, cutoffs, DST), `Codes` (references, tokens, slugs, money rounding), `RolePermissions`. No I/O. | Identity stores (only for `IdentityUser`) |
| `BackReserve.Application` | Use-case services (`ReservationService`, `OrderLifecycleService`, `AdminOrderService`, `InventoryService`, `ProductService`, `LocationService`, `StaffService`, `SettingsService`, `ReportService`, `DashboardService`, `SubscriptionService`, `PlatformService`), DTO contracts, FluentValidation validators, German email templates. Uses EF Core abstractions through `IAppDbContext`. | Domain |
| `BackReserve.Infrastructure` | `AppDbContext`, entity configuration and migrations, SQL Server–specific primitives (`ISlotCounterStore`, error classification), ASP.NET Core Identity, JWT/refresh tokens, `AuthService`, outbox + SMTP sender, local file storage, background workers, seeding. | Application |
| `BackReserve.Api` | HTTP surface: controllers, `TenantMemberFilter`, `ValidationFilter`, `ApiExceptionHandler`, JSON conventions, rate limiting, CORS, OpenAPI, health checks. | Infrastructure |
| `BackReserve.Tests` | Unit tests of domain rules and helpers. | Application, Infrastructure |
| `tests/integration` | API integration tests with `WebApplicationFactory` against real SQL Server. | Api |

Pragmatic choice: the Application layer references `Microsoft.EntityFrameworkCore.Relational` and works with `IAppDbContext` directly instead of repository interfaces. This keeps queries explicit and efficient (projections, `ExecuteUpdate`) without a pass-through repository layer. Anything SQL Server–specific that LINQ cannot express sits behind an interface in Infrastructure.

## Key decisions

### 1. Reservation concurrency (the most critical part)

**Goal:** stock and slot capacity can never be oversold, even when many customers submit simultaneously.

**Strategy: atomic conditional updates inside one READ COMMITTED transaction.** A naive "read remaining, check, write" is never used.

1. **Slot capacity.** `PickupSlotCounters` holds one row per (location, date, slot start). The row is created lazily with
   `INSERT … SELECT … WHERE NOT EXISTS (SELECT 1 … WITH (UPDLOCK, HOLDLOCK) …)` — the key-range lock serialises the first two concurrent reservations of a slot instead of letting them race into a duplicate key. Capacity is then claimed with a single statement:
   `UPDATE PickupSlotCounters SET OrderCount = OrderCount + 1, ItemCount = ItemCount + @n WHERE … AND OrderCount < @max AND (@maxItems IS NULL OR ItemCount + @n <= @maxItems)`.
   0 rows affected ⇒ `409 slot_full`.
2. **Stock.** For each order line (sorted by inventory id to keep lock order deterministic):
   `UPDATE DailyInventories SET ReservedQuantity = ReservedQuantity + @q WHERE Id = @id AND IsUnavailable = 0 AND PlannedQuantity - SafetyBuffer - ReservedQuantity - CollectedQuantity - NoShowQuantity >= @q`.
   0 rows ⇒ roll back everything ⇒ `409 insufficient_stock` with the remaining quantity.
3. The order, lines (with snapshotted name/price), status history, notification, outbox email and idempotency record are inserted and the transaction commits.

SQL Server takes update/exclusive row locks for the `UPDATE`; a concurrent statement on the same row waits and re-evaluates the predicate against the committed value. This also holds with `READ_COMMITTED_SNAPSHOT` enabled (Azure SQL default), because data-modification statements read the latest committed row version under update locks.

**Defence in depth:** a CHECK constraint on `DailyInventories` guarantees `PlannedQuantity - SafetyBuffer >= Reserved + Collected + NoShow` and that all counters are non-negative, so even a buggy code path cannot persist oversold or negative stock. Slot counters have a non-negative CHECK as well.

**Lock ordering** is always: order row (for transitions) → slot counter → inventory rows sorted by id. Deadlocks (SQL error 1205) are still possible in theory and are retried up to 4 times with jitter.

These guarantees are covered by tests in `tests/integration/BackReserve.IntegrationTests/ConcurrencyTests.cs` running against real SQL Server (never SQLite or in-memory).

### 2. Inventory model

One `DailyInventory` row per (location, product, pickup date):

| Field | Meaning |
|---|---|
| `PlannedQuantity` | What the bakery plans to produce for that day. |
| `SafetyBuffer` | Units held back from online sale. |
| `ReservedQuantity` | Units held by **active** orders (Confirmed, Preparing, ReadyForPickup). |
| `CollectedQuantity` | Units handed over to customers. |
| `NoShowQuantity` | Units of orders marked "not collected" (produced, so they stay committed). |
| `IsUnavailable` | Bakery switched the product off for the day: blocks new reservations, keeps existing ones. |

`Sellable = Planned − Buffer`, `Remaining = Sellable − Reserved − Collected − NoShow` (0 if unavailable).

**Counter maintenance.** Counters are only changed by conditional `UPDATE`s in the same transaction as the order change that causes them: reserve (+Reserved), cancel (−Reserved), collect (Reserved→Collected), no-show (Reserved→NoShow). Because the order status change is itself a conditional update on the expected current status, each effect is applied **exactly once**, even with concurrent duplicate requests.

**Reconciliation.** `MaintenanceJobs.ReconcileInventoryAsync` recomputes counters from order lines for recent dates and logs every mismatch at error level. It deliberately does not auto-correct: a mismatch indicates a bug and needs a human decision (see `docs/OPERATIONS.md`).

**Planning changes** (`PUT /admin/inventory/daily`, copy-day, apply-defaults) use the same conditional pattern: a new planned quantity/buffer is only written if it still covers the committed units, otherwise `409 quantity_below_reservations` lists the affected products. Reservations are never cancelled automatically.

### 3. Order lifecycle

```
Confirmed ──► Preparing ──► ReadyForPickup ──► Collected
    │             │               │
    ├─────────────┴───────────────┴──► Cancelled   (customer within deadline, or bakery with reason)
    └─────────────┴───────────────┴──► NoShow      (manual, only after the pickup window ended)
Confirmed/Preparing can also go directly to Collected.
```

There is no "Pending" state: a reservation that passed all checks is confirmed immediately (no manual approval, no online payment in the MVP). Transitions are applied with `UPDATE Orders SET Status = @to … WHERE Id = @id AND Status = @from`; 0 rows ⇒ a concurrent change won ⇒ `409` with a specific code (`order_already_collected`, `order_already_cancelled`, `order_modified_concurrently`). Every transition writes `OrderStatusHistory` and, for staff actions, an `AuditLog` entry.

No-shows are never set automatically in the MVP (a late-running job must not punish customers). An automatic expiry, if introduced, must be idempotent and use the same transition service.

### 4. Pickup calendar and time zones

All bakery configuration is wall-clock time in the location's IANA time zone (`LocationSettings.TimeZoneId`, default `Europe/Berlin`). `PickupCalendar` converts to UTC in one place:

- Slots are generated from the weekday rule (`PickupStart`…`PickupEnd` in steps of `SlotMinutes`); partial trailing slots are not generated.
- **Spring forward:** local times inside the gap do not exist; such slots are skipped. A configured cutoff inside the gap is moved forward by the gap.
- **Fall back:** ambiguous times resolve to the earlier instant.
- A date is orderable when the location accepts orders, the date lies within `[today, today + MaxDaysAhead]` (in local time), it is not a closure day, the weekday is open and `now < cutoff` where cutoff = `OrderCutoffTime` on `date − OrderCutoffDaysBefore`.
- A slot additionally needs `slotStart ≥ now + max(MinAdvanceMinutes, max product LeadTimeHours)` and free capacity.

Orders store both the local slot (`PickupDate`, `SlotStart`, `SlotEnd`) and the UTC instants (`PickupStartUtc`, `PickupEndUtc`), so later schedule changes never alter existing bookings.

### 5. Multi-tenancy and authorisation

- Every tenant-owned table has a `TenantId`. Key relationships use **composite foreign keys** `(TenantId, XId) → X(TenantId, Id)` (orders → locations, order items → orders/products, inventory → locations/products, location grants → locations, products → categories), so the database itself rejects cross-tenant references.
- Admin requests pass through `TenantMemberFilter`: it loads the caller's **active membership** (optionally selecting a tenant via `X-Tenant-Id`, which is only a selector), computes effective permissions (`RolePermissions`, custom grants capped by a per-role ceiling) and the accessible location set, and stores an `AdminContext` for the request. Suspended tenants or ended subscriptions become read-only.
- Every service query is explicitly filtered by `TenantId` (and by location for managers/staff). Global EF query filters are intentionally **not** used as the security boundary; isolation is tested end-to-end in `SecurityTests.cs`.
- Objects of other tenants return `404` (no existence oracle); explicitly requested foreign location filters return `403`.
- Platform administrators (`PlatformAdmin` role) see tenant metadata and outbox health only — no orders or customer data.

### 6. Guest access via capability tokens

Customers do not need accounts. On order creation the server generates a 256-bit random access token, stores only its SHA-256 hash, and returns the token once (plus in the confirmation email link). Public lookup/cancel require the token in the `X-Order-Token` header; a wrong token is indistinguishable from an unknown reference. Links put the token in the **URL fragment** (`/bestellung/BR-7K4M9X#t=…`), which browsers never send to servers or in `Referer`. The short public reference (e.g. `BR-7K4M9X`, 31⁶ combinations, no ambiguous characters) is used for pickup at the counter, always together with staff authentication and tenant/location scoping. QR codes contain only that reference.

### 7. Idempotent order creation

Clients send an `Idempotency-Key` header (one UUID per checkout submission). The key, a hash of the request body, the order id and a Data-Protection-encrypted copy of the response are stored **in the same transaction** as the order (unique index on the key). A retry or double-click returns the original order and token; a concurrent duplicate loses the unique-index race and replays the winner's response; a reused key with a different body returns `422 idempotency_key_reused`. Records expire after 24 hours.

### 8. Reliable notifications (outbox)

Emails are written to `OutboxMessages` inside the business transaction (payload encrypted with ASP.NET Data Protection, because links contain capability tokens). `OutboxWorker` claims batches with `UPDATE TOP (n) … WITH (ROWLOCK, READPAST, UPDLOCK) … OUTPUT`, so several instances can run without double sending, retries with exponential backoff and marks permanent failures. An email failure therefore never rolls back a valid reservation. With no email provider configured, messages are marked "not sent" — never "delivered". Delivery is at-least-once.

### 9. Authentication

ASP.NET Core Identity (PBKDF2 password hashing, lockout after 5 failures) with short-lived JWT access tokens (15 min) and rotating refresh tokens (30 days, stored hashed, reuse ⇒ whole token family revoked). Browser clients receive the refresh token only as an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth` and must send `X-Requested-With` to refresh (CSRF defence in depth); the access token lives in memory. Native clients send `X-Client-Type: mobile` and store the refresh token in the OS keychain (SecureStore). Registration and password reset respond identically for known and unknown emails.

### 10. Payments and billing

MVP payment mode is **"Reservieren und bei Abholung bezahlen"** (`PaymentMode.PayAtPickup`); nothing pretends a payment happened. Plans and limits (`SubscriptionPlan`) are enforced on the backend (`SubscriptionGuard`). No billing provider is integrated: `Billing:Provider = None`, and plan changes are only possible with `Billing:AllowDevelopmentPlanChanges` (development). Online payment and billing are separate milestones. Extension points: `IPaymentGateway` (`Application/Payments`, currently `PayAtPickupGateway`, invoked inside the reservation transaction; an online provider will add signed webhooks, idempotent reconciliation and refunds), `Order.PaymentMode`, and `Subscription.BillingProvider/ExternalReference`. The reservation service refuses any gateway result that claims a payment until online payment is properly implemented.

### 11. Background jobs

In-process `BackgroundService`s (outbox delivery every few seconds; maintenance every 5 minutes: idempotency/token/outbox cleanup, pickup reminders, retention anonymisation, inventory reconciliation). All jobs are idempotent and safe on multiple instances. They need an always-on host; if the hosting platform idles the app, run the API with a minimum of one always-on instance or move the job entry points to an external scheduler (see `docs/OPERATIONS.md`). Disable with `Jobs:Enabled=false`.

### 12. Localisation

The UI and all user-facing API messages are German (`de-DE`). Backend messages live with the use cases (German problem-details titles; stable `code`s for client logic); client UI strings live in `src/i18n/de.ts` in each app to enable English and Bosnian/Croatian/Serbian later.

## Request pipeline (API)

Forwarded headers (if enabled) → exception handler (RFC 7807 problem details, German titles, stable `code`) → HSTS/HTTPS redirect (non-dev; health probes excluded) → security headers → static media (`/media/demo`, `/media/uploads`) → CORS (explicit origins) → authentication → rate limiting (global + per-endpoint policies) → authorisation → controllers (validation filter, tenant filter on `/api/v1/admin`).

## What is intentionally not in the MVP

Delivery, marketplace, loyalty, online payments, real billing, push notifications from the server (mobile integration is prepared), SignalR live updates (dashboards poll every ~20 s), custom domains per bakery, VAT reporting (`OrderItem.TaxRate` reserved).
