# Operations

Runbook for operating the BackReserve API in production.

## Health and monitoring

| Signal | Where | Action |
|---|---|---|
| Liveness | `GET /health/live` | Restart instance if failing. |
| Readiness | `GET /health/ready` (database check) | Take instance out of rotation; check SQL connectivity. |
| Outbox backlog | `GET /api/v1/platform/health` (platform admin): `pendingOutbox`, `failedOutbox`, `oldestPendingOutbox` | Pending older than ~5 min ⇒ workers not running or SMTP down. Failed > 0 ⇒ inspect `OutboxMessages.LastError`. |
| Logs | JSON console logs (collect with the platform's log service) | Alert on level `Error`, especially categories below. |
| Inventory drift | Log message "Inventory reconciliation mismatch" (error) | See "Inventory reconciliation". |
| Order transitions | Log message "Inventory counter mismatch …" (error) | A transition was aborted to protect stock; investigate the order. |
| Rate limiting | HTTP 429 rate | Spikes may indicate abuse; add Cloudflare rules. |

Recommended alerts: readiness failing > 2 min; any `Error` from `BackReserve.Infrastructure.Jobs.*`; outbox pending > 50 or older than 15 min; 5xx rate > 1 %.

## Background jobs

Implemented as in-process hosted services (enabled with `Jobs:Enabled=true`):

| Job | Interval | Idempotency | Notes |
|---|---|---|---|
| Outbox delivery (`OutboxWorker`) | `Jobs:OutboxIntervalSeconds` (10 s) | Rows claimed with `UPDATE TOP … WITH (READPAST, UPDLOCK)`; processed rows marked; exponential backoff; `Failed` after `Jobs:MaxOutboxAttempts` (8). | At-least-once delivery (an SMTP timeout after acceptance can cause a duplicate email). |
| Cleanup | maintenance interval (5 min) | Deletes expired idempotency records (> 24 h), old refresh tokens (> 30 days after expiry/revocation), processed outbox rows (> 14 days). | |
| Pickup reminders | maintenance interval | `ReminderSentAt` claimed with a conditional update ⇒ at most one reminder per order. | Only for tenants with reminders enabled and a plan including email notifications. Time window: `PickupReminderHoursBefore` before `PickupStartUtc` (UTC, so DST-safe). |
| Retention anonymisation | maintenance interval | Only touches contacts not yet anonymised. | `TenantSettings.CustomerDataRetentionDays` after pickup date, only finished orders. Disable globally with `Jobs:RetentionEnabled=false`. |
| Inventory reconciliation | maintenance interval | Read-only. | Logs mismatches; never auto-corrects. |

No-shows are **never** set automatically.

**Hosting requirement:** in-process workers only run while an instance is running. On platforms that scale to zero or idle apps (e.g. App Service without "Always On", Container Apps with min replicas 0), configure at least one always-on instance. Alternatively run a dedicated worker instance of the same image with `Jobs__Enabled=true` and set `Jobs__Enabled=false` on web-facing instances. Without running workers, reservations still work, but emails stay queued — the outbox backlog in platform health makes this visible.

Time zones: all job timing uses UTC instants stored on orders; local pickup times are only used for display.

## Common procedures

### Suspend / reactivate a bakery
Platform admin: `POST /api/v1/platform/tenants/{id}/suspend` `{ "reason": "…" }` (public page disappears, dashboard read-only, existing data kept) and `…/reactivate`. Both are audit logged.

### Inventory reconciliation
If the reconciliation log reports a mismatch for an inventory row:
1. Stop and think: a mismatch means a bug or a manual database edit. Do not "fix" blindly.
2. Compare counters with order lines:
```sql
DECLARE @inv uniqueidentifier = '<inventory id>';
SELECT i.ReservedQuantity, i.CollectedQuantity, i.NoShowQuantity,
       SUM(CASE WHEN o.Status IN (1,2,3) THEN oi.Quantity ELSE 0 END) AS ReservedByOrders,
       SUM(CASE WHEN o.Status = 4 THEN oi.Quantity ELSE 0 END)       AS CollectedByOrders,
       SUM(CASE WHEN o.Status = 6 THEN oi.Quantity ELSE 0 END)       AS NoShowByOrders
FROM DailyInventories i
LEFT JOIN OrderItems oi ON oi.DailyInventoryId = i.Id
LEFT JOIN Orders o ON o.Id = oi.OrderId
WHERE i.Id = @inv
GROUP BY i.ReservedQuantity, i.CollectedQuantity, i.NoShowQuantity;
```
(Status values: 1 Confirmed, 2 Preparing, 3 ReadyForPickup, 4 Collected, 5 Cancelled, 6 NoShow.)
3. After understanding the cause, correct inside a transaction with `UPDLOCK`, document the change in the audit log table, and file a bug.

### Customer data request (access / export)
Until a self-service export exists, run for the requested email (inform the responsible bakery — it is the controller):
```sql
SELECT t.Name AS Bakery, o.PublicReference, o.PickupDate, o.SlotStart, o.Status, o.Total, o.CustomerNote,
       c.FirstName, c.LastName, c.Email, c.Phone, oi.ProductName, oi.Quantity, oi.UnitPrice
FROM CustomerContacts c
JOIN Orders o ON o.CustomerContactId = c.Id
JOIN Tenants t ON t.Id = o.TenantId
JOIN OrderItems oi ON oi.OrderId = o.Id
WHERE c.Email = @email
ORDER BY o.PickupDate;
```

### Customer data deletion
Cancel active orders first (bakery dashboard), then anonymise:
```sql
UPDATE CustomerContacts
SET FirstName = 'Anonymisiert', LastName = NULL, Email = 'anonymisiert@invalid', Phone = NULL, AnonymizedAt = SYSDATETIMEOFFSET()
WHERE Email = @email AND AnonymizedAt IS NULL;
UPDATE o SET CustomerNote = NULL
FROM Orders o JOIN CustomerContacts c ON c.Id = o.CustomerContactId
WHERE c.AnonymizedAt IS NOT NULL AND o.CustomerNote IS NOT NULL;
```

### Failed emails
```sql
SELECT Id, Type, CreatedAt, Attempts, LastError FROM OutboxMessages WHERE Failed = 1 ORDER BY CreatedAt DESC;
-- Retry after fixing the cause:
UPDATE OutboxMessages SET Failed = 0, Attempts = 0, NextAttemptAt = SYSDATETIMEOFFSET() WHERE Id = @id;
```
Payloads are encrypted; they can only be read by the application.

### Unlock a staff account
Lockout ends automatically after 15 minutes; a password reset also clears it.

### Rotate secrets
- **JWT signing key:** deploy the new key; all sessions end (users log in again).
- **SMTP / database passwords:** update the secret store, restart instances.
- **Data Protection keys:** rotate automatically (90 days) and are stored in `DataProtectionKeys`.

## Incident response (outline)
1. Detect & triage (alerts, user reports). 2. Contain (suspend tenant, block IPs at Cloudflare, rotate secrets). 3. Assess personal data impact — GDPR requires notifying the supervisory authority within 72 hours for reportable breaches and informing affected bakeries (controllers) without undue delay. 4. Recover from backups if needed. 5. Post-mortem with action items.
