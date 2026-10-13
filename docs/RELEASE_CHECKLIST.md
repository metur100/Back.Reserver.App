# Release checklist

Use for every production release. Items marked **(first launch)** apply to the initial go-live.

## Code and quality
- [ ] CI green on the release commit: backend build (warnings as errors), unit tests, SQL Server integration tests (incl. concurrency and security suites), EF "no pending model changes", vulnerable-package check, web typecheck/lint/tests/build/audit, mobile typecheck/lint/tests/bundle, Playwright e2e.
- [ ] No skipped or quarantined tests hidden in the run.
- [ ] Migrations reviewed: backward compatible for one release, no destructive changes without the expand/contract plan; idempotent script generated and reviewed.
- [ ] Changelog / release notes written.

## Security and privacy
- [ ] No secrets in the diff (`git diff` review, secret scanning enabled on the repository).
- [ ] Production config: `ASPNETCORE_ENVIRONMENT=Production`, `Billing__AllowDevelopmentPlanChanges=false`, `Seed__DemoData` not set, Swagger and dev mailbox return 404.
- [ ] CORS origins limited to the production web origin(s).
- [ ] `ForwardedHeaders` configured with known proxies; Cloudflare rate-limit rules for `/api/v1/public/orders` and `/api/v1/auth/*`.
- [ ] **(first launch)** Privacy notice, terms (AGB), imprint (Impressum) published and linked from the web app and stores; placeholders removed.
- [ ] **(first launch)** DPAs signed with hosting, database, email and Cloudflare; sub-processor list published; AVV template for bakeries ready.
- [ ] **(first launch)** Penetration test / security review done; findings resolved or accepted.
- [ ] **(first launch)** Bootstrap platform admin password changed; bootstrap variables removed.

## Infrastructure
- [ ] Database backup verified (restore test within the last quarter); PITR enabled.
- [ ] Uploads volume backed up / persistent.
- [ ] At least one always-on instance with `Jobs__Enabled=true`.
- [ ] Health probes configured (`/health/live`, `/health/ready`), alerts active (see OPERATIONS.md).
- [ ] SMTP sender domain has SPF, DKIM, DMARC; test email received.
- [ ] TLS: Cloudflare Full (strict), HSTS.

## Deployment
- [ ] Migrations applied once with `--migrate-only` (or reviewed script).
- [ ] New image deployed; readiness green on all instances.
- [ ] Web app built with the production `VITE_API_BASE_URL`, SPA fallback works, cache headers correct.

## Smoke test after deploy (staging tenant)
- [ ] Public bakery page loads on a phone (375 px) and desktop.
- [ ] Place a reservation → confirmation page with pickup code + QR → confirmation email received.
- [ ] Dashboard shows the order; prepare → ready → collect via pickup code; second collect is refused.
- [ ] Customer cancellation within the deadline restores availability.
- [ ] `GET /api/v1/platform/health`: no outbox backlog or failures.
- [ ] Error logs clean for 30 minutes.

## Mobile (when releasing apps)
- [ ] See `docs/STORE_RELEASE.md`: version/build numbers bumped, production API URL, store listing and privacy declarations up to date, tested on real iOS and Android devices.
