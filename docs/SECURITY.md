# Security and privacy

This document describes the implemented controls and what remains to be done before production. Technical controls alone do not make the product GDPR compliant; the organisational items at the end are required as well.

## Implemented controls

### Authentication
- ASP.NET Core Identity with PBKDF2 password hashing (Identity v3 format); password policy: ≥ 10 characters with letters and digits.
- Account lockout: 5 failed attempts ⇒ 15 minutes. Login error messages are identical for unknown accounts and wrong passwords; unknown-account logins still compute a hash to equalise timing.
- Email confirmation required before login (`Auth:RequireConfirmedEmail`). Registration and "forgot password" return the same response whether or not the email exists; existing users receive an informational email instead.
- JWT access tokens (HMAC-SHA256, 15 min, issuer/audience/lifetime validated). Signing key ≥ 32 bytes from configuration/secret store — the API refuses to start without it.
- Refresh tokens: 256-bit random, stored as SHA-256 hashes, rotated on every use, reuse of a rotated token revokes the whole family; revoked on password reset.
- Browser refresh token only in an `HttpOnly; Secure; SameSite=Strict` cookie with `Path=/api/v1/auth`; refresh additionally requires an `X-Requested-With` header (custom headers cannot be sent cross-site without a CORS preflight). Access tokens are kept in memory by the web app. Mobile: SecureStore.

### Authorisation and tenant isolation
- Every admin request resolves an `AdminContext` from a verified, active `TenantMembership`; `X-Tenant-Id` is only a selector.
- Role permissions with per-role ceilings: managers never receive ownership, staff management, settings or subscription rights; staff are limited to orders and pickup.
- Location scoping for managers/staff on every order, inventory, location, dashboard, report and notification query.
- Composite foreign keys `(TenantId, Id)` prevent cross-tenant references in the database.
- Foreign objects return 404 (no existence oracle). Tests: `tests/integration/.../SecurityTests.cs`.
- Suspended tenants / cancelled subscriptions: public pages disappear, dashboard becomes read-only.
- Platform administrators cannot read orders or customer data through any endpoint.

### Public (guest) endpoints
- Prices, totals, tenant and stock are always computed server-side; unknown JSON fields (e.g. `unitPrice`, `total`, `tenantId`) are ignored.
- Order lookup/cancellation require a 256-bit capability token (`X-Order-Token`), stored hashed and compared in constant time. Links carry it in the URL fragment. Short references alone never grant access.
- Order IDs are never sequential or exposed publicly.
- Idempotency keys prevent duplicate orders; capacity/stock checks are atomic.
- Rate limiting per client IP: global 600/min, public catalog 240/min, order creation 10/min, order lookup/cancel 30/min, auth 20/min (HTTP 429 with German problem details). Behind a proxy, configure `ForwardedHeaders:Enabled` and `KnownProxies` so the real client IP is used.
- QR codes contain only the public reference — no personal data.

### Input handling
- FluentValidation on every request DTO (German messages); length limits on all strings; enum and range checks.
- Uploads: authenticated users with product or settings permission only; max 5 MB; type detected from magic bytes (JPEG/PNG/WebP only — SVG/HTML rejected); random server-generated file names; path traversal check; served as static files with `X-Content-Type-Options: nosniff`, never executed.
- Image URLs entered manually must be `https://` or our own `/media/` paths.
- CSV exports: semicolon-separated, cells beginning with `= + - @ \t \r | %` are prefixed with `'` (formula injection), quoting for separators.

### Transport and headers
- HSTS and HTTPS redirection outside Development (TLS terminated at the edge; health probes excluded).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, restrictive `Content-Security-Policy` for API responses, `Cache-Control: no-store` on API responses, `Permissions-Policy`.
- CORS: explicit origin list only (`Cors:AllowedOrigins`), credentials allowed only for those origins.
- Swagger UI and the dev mailbox exist only in the Development environment (verified against the production container).

### Error handling and logging
- RFC 7807 problem details with German titles and stable codes; internal exception details are never returned outside Development.
- Structured JSON logs in production. Logs contain ids, references and categories — not email addresses, phone numbers, tokens or request bodies. EF Core parameter values are not logged.
- Audit log (`AuditLogs`) for sensitive operations: order status changes by staff, product price changes/publication/archival, inventory changes, location/schedule/settings changes, staff invitations and role changes, report exports, uploads, tenant suspension, development plan changes. Audit details never contain customer personal data.

### Secrets
- No secrets in the repository. `appsettings.json` contains empty placeholders; `appsettings.Development.json` contains only local-only values (Docker SQL password, dev JWT key, demo password) that are useless outside a developer machine.
- Production values come from environment variables or the hosting provider's secret store (see `docs/DEPLOYMENT.md`). Data Protection keys are stored in the database (`DataProtectionKeys`); restrict database access accordingly and consider key encryption at rest (e.g. Azure Key Vault) in production.

## Privacy (GDPR) design

| Principle | Implementation |
|---|---|
| Data minimisation | Guest checkout needs first name and email only; last name/phone only if the bakery requires them; note ≤ 500 chars. No customer accounts required. |
| Purpose limitation | Customer data is used for the reservation, confirmation and pickup only. |
| Access control | Contact details only for users with `CustomerContactView`; staff see names. Platform admins see no customer data. |
| Retention | `TenantSettings.CustomerDataRetentionDays` (default 365; 0 disables): the periodic maintenance job anonymises customer contacts and notes of finished orders older than the period; order lines/totals remain for the bakery's records. |
| Separation | Customer contact data lives in `CustomerContacts`, separate from orders, enabling targeted deletion/anonymisation. |
| Security of processing | See controls above. |
| Logging | Privacy-conscious logs (no PII). |

### Data subject requests (current procedure)
- **Access / export:** the bakery (controller) can view a customer's orders by searching the name in the dashboard. A dedicated self-service export endpoint is **not** implemented yet; until then the operator runs a documented SQL query (see `docs/OPERATIONS.md`).
- **Deletion:** anonymise the `CustomerContacts` row(s) for the email (same statement as the retention job, see `docs/OPERATIONS.md`). Active orders should be cancelled first.

## Required before production (not solvable by code alone)
- Privacy notice (Datenschutzerklärung) and terms (AGB) — the web app contains placeholders only. Legal review required.
- Data processing agreements (AVV) with each bakery (BackReserve is the processor, bakeries are controllers) and with sub-processors: hosting provider, SQL Server provider, email provider, Cloudflare.
- Record of processing activities, TOMs documentation, sub-processor list.
- Hosting in the EU; verify data transfer mechanisms for every sub-processor.
- Incident response process (72-hour notification duty), contact for data protection requests, decide whether a DPO is needed.
- Allergen information: bakeries are responsible for accuracy (LMIV); the UI shows the bakery's text and disclaimer only. Legal review recommended.
- Penetration test and dependency audit before launch; secret rotation procedure.
- Decide cookie/consent requirements for the web app (currently only a functional refresh cookie and localStorage for basket/tenant selection — no tracking).

## Reporting vulnerabilities
Until a public security contact exists, report issues privately to the project owner; do not open public issues for vulnerabilities.
