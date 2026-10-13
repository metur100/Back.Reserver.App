# API

REST API, versioned under `/api/v1`, JSON (camelCase). The live OpenAPI document is available in Development at `http://localhost:5280/openapi/v1.json` with Swagger UI at `http://localhost:5280/swagger`. The C# DTOs in `backend/BackReserve.Application/Contracts/*.cs` are the source of truth.

## Conventions

| Topic | Convention |
|---|---|
| Enums | PascalCase strings: order status `Confirmed`, `Preparing`, `ReadyForPickup`, `Collected`, `Cancelled`, `NoShow`; roles `Owner`, `Manager`, `Staff`; `dayOfWeek` `Monday`…; availability `Available`, `Low`, `SoldOut`. |
| Dates / times | `DateOnly` = `"2026-10-14"`, `TimeOnly` = `"07:30"` (local time of the location), instants = ISO 8601 with offset (UTC). |
| Money | JSON number with two decimals, currency in a separate field (`EUR`). Server-calculated. |
| Paging | `?page=1&pageSize=25` (max 100) → `{ items, page, pageSize, totalCount }`. |
| Errors | RFC 7807 `application/problem+json`: `{ status, title, code, traceId, …extensions }`. `title` is a German user-facing message; `code` is stable for client logic. Validation errors (400) add `errors: { "customer.firstName": ["…"] }`. |
| Auth | `Authorization: Bearer <accessToken>` for staff endpoints; `X-Tenant-Id: <guid>` selects the bakery when a user has several memberships. |
| Guests | `X-Order-Token: <accessToken>` for public order lookup/cancel. |
| Idempotency | `Idempotency-Key: <8–100 chars>` on `POST /public/orders`. |
| Rate limits | 429 with code `rate_limited`. |

### Important error codes

| Code | Status | Meaning |
|---|---|---|
| `validation_failed` | 400 | Field errors in `errors`. |
| `invalid_credentials`, `email_not_confirmed`, `locked_out`, `invalid_refresh_token` | 401 | Auth failures. |
| `forbidden`, `location_forbidden`, `no_membership`, `tenant_selection_required`, `tenant_read_only`, `csrf_header_missing` | 403 | Authorisation. |
| `plan_limit_locations`, `plan_limit_products`, `plan_limit_staff`, `plan_feature_unavailable`, `billing_not_configured` | 403 | Subscription limits. |
| `bakery_not_found`, `location_not_found`, `order_not_found`, `product_not_found` | 404 | Not found (also used for foreign objects). |
| `insufficient_stock` (+ `productId`, `remaining`), `slot_full`, `product_not_available_on_date` | 409 | Reservation conflicts. |
| `order_already_collected`, `order_already_cancelled`, `order_cancelled`, `order_modified_concurrently`, `invalid_status_transition` (+ `currentStatus`) | 409 | Lifecycle conflicts. |
| `quantity_below_reservations` (+ `violations[]`), `product_has_active_reservations`, `closure_has_orders`, `category_in_use`, `slug_taken` | 409 | Changes that would invalidate existing data. |
| `pickup_date_unavailable` (+ `reason`), `invalid_slot`, `slot_too_soon`, `product_unavailable`, `last_name_required`, `phone_required`, `cancellation_window_closed`, `no_show_too_early`, `reason_required`, `idempotency_key_reused`, `invalid_token`, `invitation_invalid`, `invalid_image`, `file_too_large` | 422 | Business rule violations. |

## Endpoints

### Public catalogue (no auth)
| Method | Path | Description |
|---|---|---|
| GET | `/public/bakeries/{slug}` | Bakery profile, locations (opening hours, cutoffs), categories. Only published, active tenants. |
| GET | `/public/bakeries/{slug}/locations` | Active locations. |
| GET | `/public/bakeries/{slug}/availability?locationId=` | Next `MaxDaysAhead` dates with `isOrderable`, `status` (`open`, `closed`, `no_pickup`, `cutoff_passed`, …), `orderCutoffAt`. |
| GET | `/public/bakeries/{slug}/products?locationId=&date=` | Published products with stock for that date: `price`, `remaining`, `availability`. |
| GET | `/public/locations/{locationId}/pickup-slots?date=&productIds=` | Slots with `available`, `remainingOrders`, `unavailableReason` (`too_soon`, `full`). `productIds` apply product lead times. |

### Guest reservations
| Method | Path | Description |
|---|---|---|
| POST | `/public/orders` | Create reservation. Body: `{ locationId, pickupDate, slotStart, items:[{productId, quantity}], customer:{firstName, lastName?, email, phone?}, note?, acceptTerms:true }`. 201 → `{ order, accessToken }`. Header `Idempotency-Key` recommended. |
| GET | `/public/orders/{reference}` | Order status (header `X-Order-Token`). |
| POST | `/public/orders/{reference}/cancel` | Cancel within the cancellation window (header `X-Order-Token`). Idempotent. |

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register-bakery` | Owner account + bakery (trial). Always 202 with a generic message. |
| POST | `/auth/confirm-email` | `{ userId, token }` from the email link fragment. |
| POST | `/auth/login` | `{ email, password }` → `{ accessToken, accessTokenExpiresAt, refreshToken, user }`. Browser: refresh token as cookie (body `null`); mobile (`X-Client-Type: mobile`): in body. |
| POST | `/auth/refresh` | Browser: cookie + `X-Requested-With`; mobile: `{ refreshToken }`. Rotates the refresh token. |
| POST | `/auth/logout` | Revokes the refresh token. |
| POST | `/auth/forgot-password`, `/auth/reset-password` | Password reset (generic response). |
| POST | `/auth/invitations/inspect`, `/auth/invitations/accept` | Staff invitation (token in body). |
| GET | `/auth/me` | Current user with memberships, effective permissions and location ids. |

### Bakery administration (`/admin`, Bearer + membership)
| Area | Endpoints | Permission |
|---|---|---|
| Dashboard | `GET /dashboard?locationId=` | OrdersView |
| Orders | `GET /orders` (filters `locationId, dateFrom, dateTo, status[], slotStart, search, page, pageSize`), `GET /orders/{id}`, `GET /orders/lookup?code=` | OrdersView (customer contact fields need CustomerContactView) |
| | `POST /orders/{id}/prepare`, `/ready` | OrdersProcess |
| | `POST /orders/{id}/collect` | PickupCollect |
| | `POST /orders/{id}/cancel` `{reason}`, `POST /orders/{id}/no-show` | OrdersCancel |
| Products | `GET/POST /products`, `GET/PUT /products/{id}`, `POST /products/{id}/publish|unpublish|archive|restore|copy` | ProductsManage (read: OrdersView) |
| Categories | `GET/POST /categories`, `PUT/DELETE /categories/{id}` | ProductsManage |
| Inventory | `GET /inventory?locationId&date` (production overview, plan feature), `GET/PUT /inventory/daily`, `POST /inventory/copy-day` (plan feature), `POST /inventory/apply-defaults` | InventoryManage (read: OrdersView) |
| Locations | `GET/POST /locations`, `GET/PUT /locations/{id}` | LocationsManage (read: OrdersView) |
| | `PUT /locations/{id}/settings`, `POST /locations/{id}/closures`, `DELETE /locations/{id}/closures/{closureId}`, `GET/PUT /pickup-schedules` | PickupScheduleManage |
| Staff | `GET /staff`, `POST /staff/invite`, `DELETE /staff/invitations/{id}`, `PUT /staff/{membershipId}` | StaffManage |
| Reports | `GET /reports/summary|orders|products|reservations?from&to&locationId`, `GET /reports/{orders|products|slots}/export` (CSV, plan feature) | ReportsView |
| Settings | `GET/PUT /settings` | SettingsManage (read: OrdersView) |
| Subscription | `GET /subscription`, `GET /subscription/plans`, `POST /subscription/change-plan` (development only) | SubscriptionManage for changes |
| Notifications | `GET /notifications?unreadOnly=`, `POST /notifications/read-all` | OrdersView |
| Uploads | `POST /uploads/images` (multipart `file`) → `{ url }` | ProductsManage or SettingsManage |

### Platform (`/platform`, role PlatformAdmin)
`GET /platform/tenants?search=`, `POST /platform/tenants/{id}/suspend|reactivate` `{reason}`, `GET /platform/health` (tenant counts, outbox backlog).

### Development only
`GET /dev/mailbox?to=` (captured emails incl. confirmation/invitation links; flushes the outbox first), `DELETE /dev/mailbox`. Returns 404 unless the environment is Development and `Email:CaptureInDevMailbox=true`.

### Operations
`GET /health/live` (process up), `GET /health/ready` (database reachable). Static files: `/media/demo/*` (demo images), `/media/uploads/*` (uploaded images).
