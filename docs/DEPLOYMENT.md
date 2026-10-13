# Deployment

BackReserve consists of three deployables: the **API** (container or any ASP.NET Core 10 host), a **SQL Server** database, and the **web app** (static files). The mobile app is distributed through the stores (see `STORE_RELEASE.md`). GitHub hosts code and CI only — it does not host the API or the database. Cloudflare provides DNS, TLS at the edge, caching/WAF and optionally R2 storage; it does not run the API or SQL Server.

## Current deployment (demo instance)

| Part | Where | URL |
|---|---|---|
| Web app | GitHub Pages, workflow `.github/workflows/pages.yml` (on push to `main` touching `apps/web/**`, or manually) | https://metur100.github.io/Back.Reserver.App/ |
| Landing page | GitHub Pages, repository `metur100/Back.Reserver.Landing` | https://metur100.github.io/Back.Reserver.Landing/ |
| API | MonsterASP (IIS shared hosting, 32-bit application pool), deployed with `scripts/deploy-monsterasp.ps1` | https://backreserve.runasp.net (`/health/ready`) |
| Database | MonsterASP SQL Server (only reachable from inside the provider network) | — |
| Email | SMTP via Gmail (`smtp.gmail.com`, port 587 / STARTTLS, app password; settings in `.run/monsterasp.env`). Gmail caps sending at ~500 mails/day | — |

How it is configured:
- **Secrets live only on the server** (as environment variables in the deployed `web.config`) and in the git-ignored local file `.run/monsterasp.env` on the deploying machine. Nothing secret is in the repository. Keys in that file: `MSDEPLOY_SITE`, `MSDEPLOY_HOST`, `MSDEPLOY_USER`, `MSDEPLOY_PASSWORD`, `PUBLIC_API_URL`, plus every app setting (`ConnectionStrings__Default`, `Jwt__SigningKey`, `App__WebBaseUrl`, `Cors__AllowedOrigins__0`, `Email__*`, `Auth__*`, `Seed__*`, …).
- **Deploy the API:** `powershell -File scripts/deploy-monsterasp.ps1` publishes self-contained for `win-x86` (the host's application pool is 32-bit; a 64-bit build fails with HTTP 500.32), syncs via Web Deploy with an app-offline step, preserves `App_Data` (uploads) and waits for `/health/ready`. `-StdoutLog` enables startup logs in `logs\` for diagnosing failures; `-SkipBuild` redeploys configuration only.
- **Migrations** run on application start (`Database__MigrateOnStartup=true`) because the database is not reachable from outside the provider network.
- **Demo data** is enabled explicitly for this public demo (`Seed__DemoData=true`, `Seed__AllowOutsideDevelopment=true`, random `Seed__DemoPassword`). Disable both before onboarding real bakeries on this instance.
- **Cross-site setup:** the web app (github.io) and API (runasp.net) are different sites, so the refresh cookie uses `Auth__RefreshCookieSameSite=None` (Secure) and CORS allows only `https://metur100.github.io`. Browsers that block third-party cookies (Safari by default, Firefox strict mode) will not keep the session across page reloads — users then simply log in again. Fix for production: serve web app and API under one registrable domain (e.g. `app.example.de` + `api.example.de`) and switch back to `Strict`.
- **IIS specifics:** shared hosting locks `<requestFiltering>` (do not add it to `web.config`, it causes HTTP 500.19); body-less POST requests must send `Content-Length: 0` (browsers do; for curl use `-d ""`), otherwise IIS answers 411.
- **Background jobs** run in-process; the application pool may idle when there is no traffic, which delays queued emails until the next request wakes the app.

---

The rest of this document describes the recommended production setup for a real launch.

## Suggested topology

```
app.backreserve.example  ──► Cloudflare (DNS, TLS, cache) ──► static web hosting (Cloudflare Pages or any static host)
api.backreserve.example  ──► Cloudflare (DNS, TLS, WAF)   ──► API container (EU region, ≥1 always-on instance)
                                                                   │
                                                                   ├──► SQL Server (managed, EU region, backups, TLS)
                                                                   ├──► SMTP provider (EU)
                                                                   └──► persistent volume or object storage for uploads
```

Compatible hosts for the API: Azure App Service (Linux, container) or Azure Container Apps, AWS App Runner/ECS, Hetzner/IONOS VMs with Docker, Render, Fly.io. Compatible databases: Azure SQL Database (General Purpose), Amazon RDS for SQL Server, SQL Server 2019+ on a VM. Choose EU regions (GDPR) and sign DPAs with each provider.

Keep `app.` and `api.` on the **same registrable domain**: the refresh cookie is `SameSite=Strict`, which works across subdomains of one site.

## 1. Database

1. Provision SQL Server (e.g. Azure SQL Database, ≥ S1/GP_S_Gen5_1), EU region, TLS enforced, automated backups with point-in-time restore (≥ 7–35 days), geo-redundant backup if available.
2. Create a dedicated contained user for the app with `db_datareader`, `db_datawriter`, `db_ddladmin` (DDL only needed if migrations run with the app's identity; otherwise use a separate migration user with `db_owner` and give the app only read/write + `EXECUTE`).
3. Restrict network access (private endpoint/firewall to the API host and admin IPs).
4. Connection string example: `Server=tcp:<host>,1433;Database=BackReserve;User Id=<user>;Password=<secret>;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30`.

## 2. API

### Build the image
```bash
docker build -f backend/Dockerfile -t <registry>/backreserve-api:<version> .
docker push <registry>/backreserve-api:<version>
```
The image runs as a non-root user, listens on port 8080, includes IANA time zone data, and expects uploads under `/data/uploads` (mount persistent storage there).

### Required configuration (environment variables)

| Variable | Example / notes |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ConnectionStrings__Default` | see above (secret) |
| `Jwt__SigningKey` | ≥ 32 random bytes, e.g. `openssl rand -base64 48` (secret). Rotating it logs everybody out. |
| `Jwt__Issuer`, `Jwt__Audience` | defaults `backreserve` / `backreserve-clients` |
| `App__WebBaseUrl` | `https://app.backreserve.example` (used in email links) |
| `Cors__AllowedOrigins__0` | `https://app.backreserve.example` (add more with `__1`, …) |
| `Email__Provider` | `Smtp` (or `None` = nothing sent) |
| `Email__SmtpHost`, `Email__SmtpPort`, `Email__Security` (`StartTls`/`SslOnConnect`), `Email__Username`, `Email__Password` (secret), `Email__FromAddress`, `Email__FromName` | EU SMTP provider with SPF/DKIM/DMARC configured for the sender domain |
| `Storage__LocalPath` | `/data/uploads` (persistent volume) |
| `ForwardedHeaders__Enabled` | `true` behind Cloudflare/load balancer |
| `ForwardedHeaders__KnownProxies__0..n` | IPs of your reverse proxy (required so rate limiting sees real client IPs; for Cloudflare use the proxy in front of the app or restrict ingress to Cloudflare ranges) |
| `Jobs__Enabled` | `true` on always-on instances |
| `Database__MigrateOnStartup` | `false` (recommended; run migrations as a release step) |
| `Billing__Provider` / `Billing__AllowDevelopmentPlanChanges` | `None` / `false` until billing is integrated |
| `PlatformAdmin__Email`, `PlatformAdmin__Password` | optional bootstrap admin, from a secret store; remove after first login and change the password |

Store secrets in the platform's secret manager (Azure Key Vault references, AWS Secrets Manager, GitHub environment secrets for CI) — never in images or the repository.

### Release procedure
1. CI green on `main` (build, unit, integration, web, mobile, e2e).
2. Back up / verify point-in-time restore of the database.
3. Run migrations once: `docker run --rm -e ConnectionStrings__Default=… -e Jwt__SigningKey=… <image> --migrate-only` (or apply the reviewed `dotnet ef migrations script --idempotent` output). This also upserts the plan catalogue.
4. Deploy the new image (rolling / slot swap). Health probes: liveness `GET /health/live`, readiness `GET /health/ready` (checks the database).
5. Smoke test: open a public bakery page, place a test order on a staging tenant, check `/api/v1/platform/health` for outbox backlog.
6. Roll back by redeploying the previous image. Migrations must be backward compatible for one release (expand/contract); destructive schema changes require a separate, reviewed step.

### HTTPS
TLS terminates at Cloudflare/the load balancer. Use Cloudflare SSL mode **Full (strict)** with an origin certificate, enable "Always use HTTPS", and HSTS. The API sends HSTS and redirects plain HTTP when it sees a non-HTTPS forwarded request (`ASPNETCORE_HTTPS_PORT=443` is set in the image); health endpoints are exempt.

### Scaling notes
- Stateless API; any number of instances. Data Protection keys are shared via the database.
- Background workers are safe on multiple instances (outbox claiming with `READPAST`, conditional updates in jobs). At least one instance must be always on (see OPERATIONS.md).
- Rate limits are per instance (in-memory). With many instances, add Cloudflare rate limiting rules for `/api/v1/public/orders` and `/api/v1/auth/*`.
- Uploads on local disk require a shared volume when running more than one instance; otherwise implement an S3-compatible `IFileStorage` (Cloudflare R2) — the interface exists, the provider is not implemented yet.

## 3. Web app

Build with the production API URL and upload `apps/web/dist` to a static host:
```bash
cd apps/web
npm ci
VITE_API_BASE_URL=https://api.backreserve.example npm run build
```
- Configure SPA fallback (all unknown paths → `index.html`), e.g. Cloudflare Pages `_redirects`: `/* /index.html 200`.
- Long-term caching for hashed assets (`/assets/*`), no caching for `index.html`.
- Security headers on the web host: `Content-Security-Policy` (allow `connect-src https://api.backreserve.example`, `img-src 'self' https://api.backreserve.example data: blob:`), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(self)` (needed for QR scanning on the pickup screen).

## 4. Email
- Use an EU provider (e.g. Brevo, Mailjet, Amazon SES eu-central-1, Postmark EU) via SMTP.
- Configure SPF, DKIM and DMARC for the sender domain; use a dedicated subdomain (`mail.backreserve.example`).
- Test with a staging tenant; never send emails from seeded test data (demo data uses `.example` addresses and is only created in Development).

## 5. File storage
- Default: local disk under `Storage__LocalPath` (mount a persistent volume, include it in backups).
- Optional later: Cloudflare R2 via an S3-compatible `IFileStorage` implementation and a public bucket/custom domain for images.

## 6. Backups and recovery
- Database: provider PITR + periodic long-term backups; test a restore quarterly. RPO/RTO targets to be defined (suggestion: RPO ≤ 15 min, RTO ≤ 4 h).
- Uploads volume: daily snapshot.
- Configuration/secrets: documented in the secret store; JWT key loss only forces re-login, Data Protection key loss invalidates pending email confirmation/reset tokens and idempotency replays (keys live in the database backup).

## 7. Mobile app
See `docs/STORE_RELEASE.md`. Set `EXPO_PUBLIC_API_URL=https://api.backreserve.example` for preview/production EAS builds.
