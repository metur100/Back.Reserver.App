# Database

Microsoft SQL Server (developed and tested on SQL Server 2022 Developer in Docker; works with Azure SQL Database / SQL Managed Instance and SQL Server 2019+). Schema is managed with EF Core 10 migrations in `backend/BackReserve.Infrastructure/Persistence/Migrations`.

## Tables

| Area | Table | Notes |
|---|---|---|
| Identity | `AspNetUsers`, `AspNetRoles`, `AspNetUserRoles`, … | `ApplicationUser` adds `FirstName`, `LastName`, `CreatedAt`. Role `PlatformAdmin`. |
| | `RefreshTokens` | Hashed, rotated refresh tokens. |
| | `DataProtectionKeys` | ASP.NET Data Protection key ring (shared by all instances). |
| Tenancy | `Tenants` | Bakery business; unique `Slug`; `IsPublished`, `Status`. |
| | `TenantSettings` | 1:1. Customer field requirements, notification switches, texts, `CustomerDataRetentionDays`, currency. |
| | `TenantMemberships` | User ↔ tenant with `Role` and optional `CustomPermissions` (flags). Unique (TenantId, UserId). |
| | `LocationMemberships` | Location grants for managers/staff. |
| | `Invitations` | Hashed single-use token, expiry, role, locations. |
| | `SubscriptionPlans`, `Subscriptions` | Plan catalogue (seeded) and the tenant's subscription (trial/active/…). |
| Locations | `Locations` (`BakeryLocation`) | Address, contact, active flag. |
| | `LocationSettings` | 1:1. IANA time zone, cutoffs, minimum notice, booking horizon, cancellation cutoff. |
| | `PickupScheduleRules` | One row per weekday: opening hours, pickup window, slot length, capacities. Unique (LocationId, DayOfWeek). |
| | `LocationClosures` | Closed dates. Unique (LocationId, Date). |
| | `PickupSlotCounters` | Authoritative slot capacity counters. Unique (LocationId, Date, SlotStart). |
| Catalogue | `ProductCategories` | Per tenant, unique slug. |
| | `Products` | Price `decimal(10,2)`, publication/archival flags, allergens, lead time, default daily quantity, `RowVersion`. Never hard-deleted. |
| | `DailyInventories` | Stock per (location, product, date) — the "product availability" record. See ARCHITECTURE.md §2. |
| Orders | `Orders` | Public reference (unique), access-token hash, local + UTC pickup times, status, snapshotted totals, timestamps, `RowVersion`. |
| | `OrderItems` | Snapshotted product name, unit price, quantity, line total, link to the inventory row; `TaxRate` reserved. |
| | `OrderStatusHistory` | Every transition with actor and note. |
| | `CustomerContacts` | Guest contact data (separately anonymisable). |
| | `IdempotencyRecords` | Order idempotency keys (unique) with encrypted response replay, 24 h retention. |
| Ops | `Notifications` | In-app notifications for bakery staff. |
| | `OutboxMessages` | Reliable email delivery queue (encrypted payload). |
| | `AuditLogs` | Sensitive operations (no customer PII). |

The spec's `ProductAvailability`, `DailyInventory`, `PickupSchedule` and `PickupSlot` concepts map to `DailyInventories`, `PickupScheduleRules` and `PickupSlotCounters`. Product images are stored as URLs (`Products.ImageUrl`); files live in file storage, not in SQL Server.

## Integrity rules

- **Money:** all `decimal` columns are `decimal(10,2)` (tax rate `decimal(5,2)`); no floating point anywhere.
- **Tenant consistency:** composite FKs `(TenantId, X) → (TenantId, Id)` for orders→locations, orders→customer contacts, order items→orders, order items→products, order history→orders, inventory→locations/products, slot counters→locations, location grants→locations, products→categories.
- **CHECK constraints:**
  - `CK_DailyInventories_Quantities`: all counters ≥ 0 and `Planned − Buffer ≥ Reserved + Collected + NoShow`.
  - `CK_PickupSlotCounters_NonNegative`, `CK_PickupScheduleRules_Capacity`, `CK_Orders_Amounts` (totals ≥ 0, ItemCount > 0), `CK_OrderItems_Quantity` (quantity > 0, prices ≥ 0), `CK_Products_Price`.
- **Unique indexes:** tenant slug, product/category slug per tenant, order public reference, idempotency key, invitation token hash, refresh token hash, (location, product, date) inventory, (location, date, slot) counters, (tenant, user) membership.
- **Delete behaviour:** `Restrict` everywhere (except Identity internals and refresh tokens). Business data is archived or anonymised, never cascaded away. Historical orders keep their product names and prices even if products are renamed, repriced or archived.
- **Concurrency:** stock and slot capacity via conditional `UPDATE`s (ARCHITECTURE.md §1); `RowVersion` on products (optimistic concurrency for edits) and orders.
- **Time:** all instants are `datetimeoffset` (UTC); pickup dates/times are `date`/`time` in the location's time zone, which is stored per location.
- **Indexes for operations:** orders by (tenant, location, pickup date, status), (tenant, created), (status, pickup start); inventory by (tenant, location, date); outbox by (processed, failed, next attempt); audit by (tenant, created); notifications by (tenant, read, created).

## Working with migrations

Tools: `dotnet tool install --global dotnet-ef` (version 10.x).

```bash
# Create a migration after changing entities/configuration
dotnet ef migrations add <Name> -p backend/BackReserve.Infrastructure -s backend/BackReserve.Api -o Persistence/Migrations

# Apply to the database configured in appsettings.Development.json / ConnectionStrings__Default
dotnet ef database update -p backend/BackReserve.Infrastructure -s backend/BackReserve.Api

# Generate an idempotent SQL script for review / DBA-run deployments
dotnet ef migrations script --idempotent -p backend/BackReserve.Infrastructure -s backend/BackReserve.Api -o migrate.sql

# CI guard: fails if the model changed without a migration
dotnet ef migrations has-pending-model-changes -p backend/BackReserve.Infrastructure -s backend/BackReserve.Api
```

- **Development:** the API applies migrations and seeds reference data + demo data automatically on startup.
- **Production:** migrations are **not** applied on startup by default (`Database:MigrateOnStartup=false`). Run them as an explicit deployment step — either `dotnet BackReserve.Api.dll --migrate-only` (applies migrations and the plan catalogue, then exits) or the reviewed idempotent SQL script. EF Core 10 takes a migration lock, so concurrent runs are safe, but run the step once per deployment.
- Never run destructive migrations (dropping columns/tables with data) without a reviewed, backed-up, two-phase process (expand → migrate data → contract).

## Seeding

| Data | When | Where |
|---|---|---|
| `PlatformAdmin` role, subscription plan catalogue (starter/business/multi) | Every environment, idempotent, on migrate | `DataSeeder.SeedReferenceDataAsync` |
| Bootstrap platform admin | Only if `PlatformAdmin:Email` and `PlatformAdmin:Password` are set (secret store) | same |
| Demo data (Bäckerei Rheinblick, Donut Atelier, demo users, products, stock, orders) | **Development environment only** and `Seed:DemoData=true` with `Seed:DemoPassword` set | `DataSeeder.SeedDemoDataAsync` |

All demo data is fictional (`.example` domains, invented names and addresses).

## Resetting the local database

```bash
docker compose down -v      # removes the SQL Server volume
docker compose up -d
# start the API again; it recreates the schema and demo data
```
