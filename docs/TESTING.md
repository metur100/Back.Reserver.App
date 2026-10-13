# Testing

| Layer | Location | Tooling | Runs against |
|---|---|---|---|
| Backend unit tests | `backend/BackReserve.Tests` | xUnit | pure code (no database) |
| Backend integration tests | `tests/integration/BackReserve.IntegrationTests` | xUnit + `WebApplicationFactory` | the real API in-process + **real SQL Server** |
| Web unit/component tests | `apps/web/src/**/*.test.ts(x)` | Vitest + React Testing Library (jsdom) | mocked fetch |
| Mobile unit/component tests | `apps/mobile/src/__tests__` | jest-expo + React Native Testing Library | mocked fetch; optional live suite |
| End-to-end | `tests/e2e` | Playwright (desktop + iPhone 13 viewport, Chromium) | web dev server + live Development API + SQL Server |
| HTTP smoke test | `scripts/smoke-test.sh` | bash + curl | a running Development API |

## Running

```bash
# Backend: unit + integration (integration uses the compose SQL Server when the variable is set,
# otherwise starts a disposable SQL Server container via Testcontainers — Docker required either way)
export BACKRESERVE_TEST_SQLSERVER="Server=localhost,14333;User Id=sa;Password=BackReserve_Dev_2026!;TrustServerCertificate=True"
dotnet test backend/BackReserve.sln

# Web
cd apps/web && npm run typecheck && npm run lint && npm test && npm run build

# Mobile
cd apps/mobile && npm run typecheck && npm run lint && npm test
npm run test:live                      # optional: mobile API client against http://localhost:5280 (creates real dev orders)
npx expo export --platform android     # bundle compile check

# End-to-end (API must run in Development on :5280, see tests/e2e/README.md)
cd tests/e2e && npm ci && npx playwright install chromium && npx playwright test
```

PowerShell: `$env:BACKRESERVE_TEST_SQLSERVER = "Server=localhost,14333;..."`.

## Why real SQL Server

Stock and slot capacity rely on SQL Server locking semantics (conditional `UPDATE`, `UPDLOCK, HOLDLOCK`, `READPAST`), CHECK constraints and unique-index races. SQLite or the EF in-memory provider would not prove any of that, so integration tests always use SQL Server 2022 (locally via Docker, in CI via a service container). Each test run creates its own database (`BackReserveTests_<timestamp>_<guid>`) and drops it afterwards; each test creates its own isolated bakery, so tests never share stock.

The integration host uses a `FakeTimeProvider` (advancing 1 ms per read) for business time, so tests can move past cutoffs and pickup windows deterministically. Authentication tokens always use the real clock.

## Coverage map (spec → tests)

### Backend unit tests (`BackReserve.Tests`, 65 tests)
- Pickup calendar: slot generation, partial slots, closed days, **DST spring-forward gap and fall-back ambiguity**, cutoff in local time, local "today" around midnight, min notice and product lead time, cancellation cutoff, time-zone validation.
- Order state machine: allowed transitions, specific error codes for double collect / cancel, which states hold stock.
- Codes: reference format/alphabet/uniqueness, staff input normalisation, token entropy and hash comparison, slugs (German and BCS characters), money rounding and exact decimal totals.
- Permissions: owner/manager/staff ceilings, custom grants capped, admin context location checks.
- Inventory model math, availability thresholds, CSV formula-injection escaping, image magic-byte detection.

### Backend integration tests (46 tests)
**Concurrency (`ConcurrencyTests`)** — the eight required scenarios:
1. Two customers race for the last unit → exactly one 201, one 409, reserved = 1.
2. 40 concurrent reservations never exceed stock; counters equal order lines.
3. Concurrent duplicate submissions with one idempotency key → one order, identical responses; sequential replay returns the same token; key reuse with another body → 422.
4. Ten concurrent cancellations restore stock and slot capacity exactly once (one history entry).
5. Eight concurrent collects → one success, others 409; collected units are never sellable again.
6. Concurrent staff actions (prepare/ready/collect) leave a consistent history chain; cancel vs. collect race has a single outcome with consistent stock (5 rounds).
7. Slot order capacity and slot item capacity cannot be exceeded under concurrency.
8. Reducing stock below reservations is rejected (also racing with reservations); marking unavailable / unpublishing keeps confirmed reservations; archiving with open reservations is refused.
Plus: multi-product orders locking in opposite order neither deadlock nor oversell.

**Security (`SecurityTests`)** — tenant A cannot read/modify tenant B orders, products, inventory, locations or reports (also not by forging `X-Tenant-Id`); staff of one location cannot access another; staff/manager cannot perform owner operations; platform endpoints closed to bakeries; admin endpoints require auth; public order access requires the capability token (wrong token ≙ unknown reference, no PII echoed); unpublished products/tenants invisible; suspended tenant hidden and read-only; client-supplied prices/totals/tenant ignored; over-quantity and foreign products rejected; expired and used invitations rejected; refresh token rotation with reuse detection; browser refresh needs cookie + anti-CSRF header (cookie flags verified); login does not reveal accounts and locks out after 5 failures; uploads accept only real images with server-generated names.

**Flows (`FlowTests`)** — full onboarding → registration (generic response, email confirmation via outbox) → location/schedule → category/product/publish → stock → publish page → public catalog/availability/slots → reservation with idempotency key → confirmation email (token only in URL fragment) → prepare/ready/collect with history → production overview per slot → ready email → price snapshot preserved after price change. Also: customer cancellation and deadline, closed dates / unknown slots / past dates, closures blocked by active orders, product lead time, no-show only after the pickup window, bakery cancellation with reason + email + audit, pickup problem reports, staff invitation flow, password reset, copy-day/apply-defaults never undercutting reservations, tenant-scoped reports and CSV injection safety, plan limits and features, dashboard, German validation problem details, malformed request contract, idempotent maintenance jobs with zero reconciliation drift.

### Web (54 tests)
Basket cents math, limits, persistence and reconciliation; checkout Zod schema (German messages, required last name toggle); product card stepper (respects remaining, sold-out disabled); pickup code normalisation; status labels; download helper; formatting; API client (refresh single-flight, problem details); admin components (inventory violation rendering, role/permission display); empty/error states.

### Mobile (61 tests + 4 live)
Basket cents math and persistence; pickup code normalisation; checkout schema; date/currency formatting incl. DST; auth single-flight refresh, 401 retry, session expiry; API client headers/errors; saved orders; staff action rules; components (stepper, product row, badges, order history). The live suite exercises catalog, idempotent reservation, token lookup, cancellation, staff login with concurrent refresh, lookup/prepare/problem/ready/collect and 409 on double collect against the running API.

### End-to-end (18 Playwright tests)
The ten required journeys (register → confirm email → location & schedule → products → publish & stock → customer checkout on a phone viewport → confirmation with code, QR and email → bakery sees order → in preparation → collect by code with "bereits abgeholt" on retry → another tenant gets not found), public page checks on desktop and mobile (availability states, non-orderable days, drafts hidden, basket persistence, friendly not-found pages) and screenshot capture of all main screens at 390 px and 1440 px.

## What is not automated yet
- Native mobile behaviour on devices/emulators (camera scanning, notifications, SecureStore, deep links) — verified by code review, types and bundling only.
- Visual regression testing (screenshots are captured but not compared).
- Accessibility audits with axe and screen readers (components follow WCAG patterns; run an audit before launch).
- Load testing beyond the concurrency tests (recommended: k6 against staging for the public order endpoint).
- Email rendering across mail clients.
