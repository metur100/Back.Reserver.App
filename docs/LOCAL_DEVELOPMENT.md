# Local development

Everything runs locally without paid services: SQL Server and Mailpit in Docker, the API with `dotnet`, the web app with Vite, the mobile app with Expo.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| .NET SDK | 10.0.x | `dotnet --list-sdks` |
| Node.js | 22.x (npm 10) | |
| Docker | Docker Desktop / Engine with Compose v2 | SQL Server 2022 container (x64; on Apple Silicon enable Rosetta emulation in Docker Desktop) |
| EF Core tools | 10.x | `dotnet tool install --global dotnet-ef` (only needed to create migrations) |
| Expo Go / emulator | optional | Android Studio emulator or Xcode simulator (macOS) for the mobile app |

## 1. Start infrastructure

```bash
cp .env.example .env        # optional: override ports/passwords for docker compose
docker compose up -d        # SQL Server on localhost:14333, Mailpit SMTP 1026 / UI http://localhost:8026
```

Ports are deliberately non-default (14333, 1026, 8026, 5280) to avoid clashes with other local projects.

## 2. Run the API

```bash
dotnet run --project backend/BackReserve.Api --launch-profile http
# → http://localhost:5280, Swagger UI at http://localhost:5280/swagger
```

In Development the API automatically
- applies EF Core migrations,
- seeds the plan catalogue and **fictional demo data**,
- sends emails to Mailpit (http://localhost:8026) **and** keeps a copy in the dev mailbox (`GET http://localhost:5280/api/v1/dev/mailbox`),
- allows plan changes without payment (clearly marked as test mode).

Alternative that keeps `backend/bin` unlocked while you run tests or rebuild (recommended when working on the frontends):

```powershell
powershell -File scripts/run-dev-api.ps1     # publishes to .run/api and runs from there
```

### Demo accounts (Development only)

Password for all: `BackReserve-Demo-2026`

| Email | Role |
|---|---|
| `inhaber@rheinblick.example` | Owner of "Bäckerei Rheinblick" (slug `baeckerei-rheinblick`, location Düsseldorf Altstadt) |
| `leitung@rheinblick.example` | Manager (location Düsseldorf Altstadt) |
| `team@rheinblick.example` | Staff (orders and pickup only) |
| `inhaber@donut-atelier.example` | Owner of a second bakery "Donut Atelier" (for tenant isolation checks) |
| `admin@backreserve.example` | Platform administrator |

Demo bakery rules: Sundays closed, pickup Mon–Fri 07:00–17:00 and Sat 07:00–12:00 in 30-minute slots, order cutoff 18:00 the day before (Europe/Berlin). The demo data contains confirmed, preparing, ready and cancelled orders and stock for the next 7 days.

## 3. Run the web app

```bash
cd apps/web
npm ci
npm run dev          # http://localhost:5173 (proxies /api and /media to http://localhost:5280)
```

- Customer page: http://localhost:5173/b/baeckerei-rheinblick
- Bakery dashboard: http://localhost:5173/login

## 4. Run the mobile app

```bash
cd apps/mobile
npm ci
npx expo start       # press a (Android emulator), i (iOS simulator, macOS) or scan the QR code with Expo Go
```

API URL (`EXPO_PUBLIC_API_URL`):
- Android emulator: `http://10.0.2.2:5280` (default in development)
- iOS simulator / web: `http://localhost:5280`
- Physical device: your computer's LAN IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:5280 npx expo start`. The API listens on localhost by default; to reach it from a phone run it with `ASPNETCORE_URLS=http://0.0.0.0:5280` and allow the port in your firewall.

Notes:
- Camera (QR scanning) and push-token registration need a **development build** (`eas build --profile development`); Expo Go may lack some native modules. Manual pickup-code entry always works.
- Staff login: use the demo staff accounts above. Customer flow: open `baeckerei-rheinblick` on the start screen.
- Deep links: `backreserve://b/baeckerei-rheinblick`, `backreserve://bestellung/<REF>?t=<token>`.
- Live API check of the mobile client code: `npm run test:live` (creates a few real orders in the dev database).

## 5. Common tasks

| Task | Command |
|---|---|
| Backend unit tests | `dotnet test backend/BackReserve.Tests` |
| Backend integration tests (uses the compose SQL Server) | `BACKRESERVE_TEST_SQLSERVER="Server=localhost,14333;User Id=sa;Password=BackReserve_Dev_2026!;TrustServerCertificate=True" dotnet test tests/integration/BackReserve.IntegrationTests` — without the variable a disposable SQL Server container is started via Testcontainers |
| All backend tests | `dotnet test backend/BackReserve.sln` |
| Web checks | `cd apps/web && npm run typecheck && npm run lint && npm test && npm run build` |
| Mobile checks | `cd apps/mobile && npm run typecheck && npm run lint && npm test` |
| End-to-end tests | see `tests/e2e/README.md` |
| HTTP smoke test (bash) | `API=http://localhost:5280 ./scripts/smoke-test.sh` |
| New migration | `dotnet ef migrations add <Name> -p backend/BackReserve.Infrastructure -s backend/BackReserve.Api -o Persistence/Migrations` |
| Reset database | `docker compose down -v && docker compose up -d`, then restart the API |
| Production build (API) | `docker build -f backend/Dockerfile -t backreserve-api .` |
| Production build (web) | `cd apps/web && VITE_API_BASE_URL=https://api.example npm run build` |

## Mock email
Mailpit catches all SMTP mail locally (UI http://localhost:8026). Nothing is ever sent to real recipients in development; demo data uses `.example` addresses. Confirmation, password-reset and invitation links point to `http://localhost:5173` and carry their tokens in the URL fragment.

## Troubleshooting
- **Port already in use:** another project may use 5080/1433/1025; BackReserve uses 5280/14333/1026. Change `MSSQL_PORT` etc. in `.env` and the connection string in `appsettings.Development.json` if needed.
- **`Login failed for user 'sa'`:** the SQL container needs ~20 s on first start; check `docker compose ps` for `healthy`.
- **Windows file locks during `dotnet build`:** stop `dotnet run` or use `scripts/run-dev-api.ps1`.
- **Umlauts broken after scripted edits on Windows:** Windows PowerShell 5.1 `Get-Content` reads BOM-less UTF-8 as ANSI; edit files with an editor or explicit UTF-8 APIs.
