#!/usr/bin/env bash
# End-to-end smoke test against a running Development API with demo data.
# Usage: API=http://localhost:5280 ./scripts/smoke-test.sh
set -euo pipefail
API="${API:-http://localhost:5280}"
PASS="${DEMO_PASSWORD:-BackReserve-Demo-2026}"
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log(eval('o'+process.argv[1]))})" "$1"; }
ok() { echo "  ✔ $*"; }
fail() { echo "  ✘ $*"; exit 1; }

echo "1) Public catalog"
BAKERY=$(curl -sf "$API/api/v1/public/bakeries/baeckerei-rheinblick")
LOC=$(echo "$BAKERY" | j '.locations[0].id'); ok "bakery loaded, location $LOC"
DATES=$(curl -sf "$API/api/v1/public/bakeries/baeckerei-rheinblick/availability?locationId=$LOC")
DATE=$(echo "$DATES" | j '.filter(d=>d.isOrderable)[0].date'); ok "first orderable date $DATE"
PRODUCTS=$(curl -sf "$API/api/v1/public/bakeries/baeckerei-rheinblick/products?locationId=$LOC&date=$DATE")
PID=$(echo "$PRODUCTS" | j '.products.find(p=>p.leadTimeHours===0&&p.remaining>2).id')
DRAFTS=$(echo "$PRODUCTS" | j '.products.filter(p=>p.name.includes("Entwurf")).length')
[ "$DRAFTS" = "0" ] && ok "draft product not public" || fail "draft product exposed"
SLOT=$(curl -sf "$API/api/v1/public/locations/$LOC/pickup-slots?date=$DATE" | j '.slots.find(s=>s.available).start'); ok "slot $SLOT"

echo "2) Reservation + idempotency"
KEY="smoke-$(date +%s%N)"
BODY="{\"locationId\":\"$LOC\",\"pickupDate\":\"$DATE\",\"slotStart\":\"$SLOT\",\"items\":[{\"productId\":\"$PID\",\"quantity\":2}],\"customer\":{\"firstName\":\"Test\",\"lastName\":\"Kunde\",\"email\":\"test@kunde.example\"},\"note\":null,\"acceptTerms\":true}"
R1=$(curl -sf -X POST "$API/api/v1/public/orders" -H 'Content-Type: application/json' -H "Idempotency-Key: $KEY" -d "$BODY")
R2=$(curl -sf -X POST "$API/api/v1/public/orders" -H 'Content-Type: application/json' -H "Idempotency-Key: $KEY" -d "$BODY")
REF=$(echo "$R1" | j '.order.publicReference'); TOKEN=$(echo "$R1" | j '.accessToken')
[ "$REF" = "$(echo "$R2" | j '.order.publicReference')" ] && ok "duplicate submit returned same order $REF" || fail "duplicate order created"
TAMPER=$(echo "$BODY" | sed 's/"quantity":2/"quantity":2,"unitPrice":0.01/')
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/v1/public/orders/$REF"); [ "$CODE" = "404" ] && ok "lookup without token -> 404" || fail "lookup without token -> $CODE"
curl -sf "$API/api/v1/public/orders/$REF" -H "X-Order-Token: $TOKEN" >/dev/null && ok "lookup with token works"

echo "3) Staff pickup"
LOGIN=$(curl -sf -X POST "$API/api/v1/auth/login" -H 'Content-Type: application/json' -H 'X-Client-Type: mobile' -d "{\"email\":\"team@rheinblick.example\",\"password\":\"$PASS\"}")
AT=$(echo "$LOGIN" | j '.accessToken'); ok "staff logged in"
ORDER=$(curl -sf "$API/api/v1/admin/orders/lookup?code=${REF#BR-}" -H "Authorization: Bearer $AT")
OID=$(echo "$ORDER" | j '.id'); ok "lookup by code without prefix found $OID"
curl -sf -X POST -d "" "$API/api/v1/admin/orders/$OID/collect" -H "Authorization: Bearer $AT" >/dev/null && ok "collected"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -d "" "$API/api/v1/admin/orders/$OID/collect" -H "Authorization: Bearer $AT")
[ "$CODE" = "409" ] && ok "second collect -> 409" || fail "second collect -> $CODE"

echo "4) Tenant isolation"
OTHER=$(curl -sf -X POST "$API/api/v1/auth/login" -H 'Content-Type: application/json' -H 'X-Client-Type: mobile' -d "{\"email\":\"inhaber@donut-atelier.example\",\"password\":\"$PASS\"}" | j '.accessToken')
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/v1/admin/orders/$OID" -H "Authorization: Bearer $OTHER"); [ "$CODE" = "404" ] && ok "other tenant cannot read order (404)" || fail "other tenant got $CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/v1/admin/orders/lookup?code=$REF" -H "Authorization: Bearer $OTHER"); [ "$CODE" = "404" ] && ok "other tenant cannot look up code (404)" || fail "other tenant lookup $CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/v1/admin/orders/$OID/cancel" -H "Authorization: Bearer $OTHER" -H 'Content-Type: application/json' -d '{"reason":"x"}'); [ "$CODE" = "404" ] && ok "other tenant cannot cancel (404)" || fail "other tenant cancel $CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/v1/admin/staff" -H "Authorization: Bearer $AT"); [ "$CODE" = "403" ] && ok "staff cannot manage staff (403)" || fail "staff got $CODE"
echo "All smoke checks passed."
