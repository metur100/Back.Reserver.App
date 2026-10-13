# BackReserve – End-to-end tests (Playwright)

Browser tests for the web app in `apps/web`, run against the **live development API**.

## Prerequisites

1. SQL Server + Mailpit: `docker compose up -d` (repo root)
2. Development API on http://localhost:5280 with demo data:
   `powershell -File scripts/run-dev-api.ps1` (must run with `ASPNETCORE_ENVIRONMENT=Development`, which enables the
   dev mailbox `GET /api/v1/dev/mailbox` used to read confirmation e-mails)
3. Node 22 / npm 10, dependencies installed in `apps/web` (`npm ci`)

## Run

```bash
cd tests/e2e
npm ci
npx playwright install chromium
npx playwright test            # all projects
npx playwright test --project=desktop-chromium specs/full-flow.spec.ts
npx playwright show-report     # HTML report
```

Playwright starts the Vite dev server automatically (`npm run dev` in `apps/web`, bound to `127.0.0.1:5173`) or reuses
one that is already running there. `127.0.0.1` is used instead of `localhost` on purpose, so another local server bound
to `[::1]:5173` is never hit by accident.

Environment overrides: `E2E_HOST`, `E2E_PORT`, `E2E_BASE_URL` (web app), `E2E_API_URL` (API for helper calls, default
`http://localhost:5280`).

## Projects and specs

| Project            | Viewport              | Specs                                  |
| ------------------ | --------------------- | -------------------------------------- |
| `desktop-chromium` | 1280 × 900            | all                                    |
| `mobile-chromium`  | iPhone 13 (Chromium)  | `public.spec.ts`                       |

- `specs/full-flow.spec.ts` – serial journey with unique data per run (`owner+<ts>@e2e.example`):
  1. bakery owner registers → confirms the e-mail via the dev mailbox link → logs in
  2. creates a location and edits the weekly pickup schedule
  3. creates a category and products, publishes two (one stays a draft)
  4. publishes the order page (Einstellungen) and sets daily quantities for the first orderable date
  5. a customer (new mobile context) opens the public page, adds products, picks a slot and checks out
  6. sees the confirmation with pickup code + QR; the confirmation e-mail arrives in the dev mailbox
  7. the owner sees the order in *Bestellungen*
  8. marks it as *In Vorbereitung*
  9. collects it on the *Abholung* screen by code (also reports a pickup problem); a second lookup shows *bereits abgeholt*
  10. another tenant (`inhaber@donut-atelier.example`) gets *not found* for the code and for the order URL
  Draft products are verified to be invisible on the public page.
- `specs/public.spec.ts` – demo bakery page: products with availability text, disabled non-orderable days, sold-out
  handling, draft products hidden, basket persistence, friendly not-found pages.
- `specs/screenshots.spec.ts` – full-page screenshots of the main screens at 390 px and 1440 px → `screenshots/`
  (git-ignored).

## Notes

- The API rate-limits per IP (auth endpoints 20/min, order creation 10/min). The suite stays within these limits
  (one worker, client-side navigation inside the dashboard). Running the whole suite several times within one minute
  can trigger `429` responses – wait a minute and rerun.
- New bakeries start without a location; the next orderable date depends on the cutoff (18:00 the day before,
  Europe/Berlin) and is read from the availability endpoint, never hard-coded.
- Each full-flow run creates a new fictional bakery tenant in the development database.
