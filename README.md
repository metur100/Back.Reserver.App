# BackReserve

**Vorbestellen. Sicher abholen. Frisch genießen.**

BackReserve is a pre-ordering and pickup platform for bakeries, donut shops, pastry and cake shops in the DACH region. Customers reserve products for a pickup date and time slot without an account and pay at the counter; bakeries plan production, see reservations as they come in, prepare orders and hand them over with a pickup code or QR code.

| Part | Path | Stack |
|---|---|---|
| API | `backend/` | ASP.NET Core 10, EF Core 10, SQL Server, ASP.NET Core Identity + JWT, FluentValidation |
| Web app (customer ordering page + bakery dashboard + platform admin) | `apps/web/` | React 19, TypeScript (strict), Vite, React Router, Tailwind CSS v4, Radix-based components, TanStack Query, React Hook Form + Zod |
| Mobile app (customers + bakery staff) | `apps/mobile/` | Expo, React Native, Expo Router, TanStack Query, SecureStore, expo-camera, expo-notifications |
| Integration tests | `tests/integration/` | xUnit, WebApplicationFactory, real SQL Server |
| End-to-end tests | `tests/e2e/` | Playwright |

UI language: German (`de-DE`). Payment mode in the MVP: **Reservieren und bei Abholung bezahlen** — no online payments.

## Quick start

```bash
docker compose up -d                                              # SQL Server (localhost:14333) + Mailpit (http://localhost:8026)
dotnet run --project backend/BackReserve.Api --launch-profile http # API on http://localhost:5280 (migrates + seeds demo data)
cd apps/web && npm ci && npm run dev                              # http://localhost:5173
```

- Customer page: http://localhost:5173/b/baeckerei-rheinblick
- Dashboard: http://localhost:5173/login — `inhaber@rheinblick.example` / `BackReserve-Demo-2026` (fictional demo data, Development only)
- Swagger: http://localhost:5280/swagger
- Mobile: `cd apps/mobile && npm ci && npx expo start`

Details: [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md).

## Features

**Customers** — branded bakery page, location and pickup-date selection, live availability ("Nur noch 3", "Ausverkauft"), allergen information as supplied by the bakery, basket, four-step checkout, pickup slot selection, confirmation with pickup code + QR code + calendar file + email, self-service status and cancellation via a secure link, "Meine Bestellungen" on the device.

**Bakeries** — dashboard with today/tomorrow KPIs and pickup schedule; order list (table and slot view) with filters and search; order detail with status history; prepare → ready → collect, cancel with reason, no-show, pickup problem reports; fast pickup screen with code entry and QR scanning; products and categories with images, publication and archival; daily stock planning with safety buffer, copy previous day, default quantities and a production overview per slot; locations with time zones, weekly pickup schedules, slot capacities, cutoffs and closures; staff invitations with roles, permissions and location assignment; reports with CSV export; settings, branding and subscription overview.

**Platform** — multi-tenant isolation, plan limits enforced on the server, tenant suspension, outbox health.

**Reliability** — stock and slot capacity reserved with atomic conditional updates (no overselling under concurrency, enforced additionally by database CHECK constraints), idempotent order creation, exactly-once stock restoration, transactional outbox for emails, DST-correct pickup calendar.

## Commands

| | |
|---|---|
| Backend tests (unit + SQL Server integration) | `dotnet test backend/BackReserve.sln` (set `BACKRESERVE_TEST_SQLSERVER` to use the compose SQL Server, otherwise Testcontainers) |
| Web checks | `cd apps/web && npm run typecheck && npm run lint && npm test && npm run build` |
| Mobile checks | `cd apps/mobile && npm run typecheck && npm run lint && npm test` |
| End-to-end | `cd tests/e2e && npx playwright test` (API running on :5280) |
| API container | `docker build -f backend/Dockerfile -t backreserve-api .` |
| Migrations | see [docs/DATABASE.md](docs/DATABASE.md) |

## Documentation

| Document | Content |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, key decisions: reservation concurrency, inventory model, lifecycle, time zones, tenancy, capability tokens, idempotency, outbox |
| [SECURITY.md](docs/SECURITY.md) | Implemented controls, privacy design, what is required before production |
| [DATABASE.md](docs/DATABASE.md) | Schema, integrity rules, migrations, seeding |
| [API.md](docs/API.md) | Conventions, error codes, endpoint overview |
| [LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) | Setup, demo accounts, common tasks |
| [TESTING.md](docs/TESTING.md) | Test layers, how to run, coverage map |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production topology, configuration, release procedure |
| [OPERATIONS.md](docs/OPERATIONS.md) | Monitoring, background jobs, runbooks |
| [RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | Per-release checklist |
| [STORE_RELEASE.md](docs/STORE_RELEASE.md) | App Store / Google Play preparation |

## Live demo

| | |
|---|---|
| Web app (customer page + dashboard) | https://metur100.github.io/Back.Reserver.App/ — demo bakery: https://metur100.github.io/Back.Reserver.App/b/baeckerei-rheinblick |
| Landing page | https://metur100.github.io/Back.Reserver.Landing/ |
| API | https://backreserve.runasp.net (health: `/health/ready`) |

Demo accounts exist for the fictional "Bäckerei Rheinblick"; the password is not published here. Hosting details: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#current-deployment-demo-instance).

## Status

Implemented and tested locally against SQL Server 2022 in Docker, and deployed as a demo instance (GitHub Pages + MonsterASP). The mobile app has **not** been submitted to any store, and no billing provider is connected (plans exist; plan changes are a development-only test mode). Legal texts (privacy policy, terms, imprint) are placeholders and need legal review before launch — see the "Required before production" section in [SECURITY.md](docs/SECURITY.md).

Not in the MVP by design: delivery, marketplace, loyalty programmes, online payments, real billing, server-sent push notifications (mobile client side is prepared).
