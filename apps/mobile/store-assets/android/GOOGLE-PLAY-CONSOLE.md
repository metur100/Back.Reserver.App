# Google Play Console – copy-paste checklist (BackReserve 1.0.0, versionCode 2)

Everything needed to create the app in Play Console and submit the first release. Go top to bottom; each block says
which Console page it belongs to. Status as of 2026-11-02. **Nothing has been uploaded yet.**
Character limits are checked with `node scripts/check-store-texts.mjs` (run in `apps/mobile`; counts every `(max N)`
block in this file; results in §8). The App Store counterpart is
[`../ios/APP-STORE-CONNECT.md`](../ios/APP-STORE-CONNECT.md).

| | |
|---|---|
| Package name | `com.certidevelopment.backreserve` |
| Developer | Medin Turkes · Certi Development (same developer account as AngebotPilot) |
| Version | versionName `1.0.0`, versionCode `2` (built from `main` on 2026-11-02); **next upload: versionCode `3`** (`BUILD_NUMBER = 3` in `app.config.ts`, adds the in-app legal links and blocks `SYSTEM_ALERT_WINDOW`; AAB not built yet) |
| Default language | German – de-DE. The app UI is **German only** (`src/i18n/de.ts`); an en-US listing translation is optional (texts below) |
| App or game | App · Free · no in-app purchases (customers pay in the bakery; bakeries' subscriptions are not sold via Play) |
| Backend | production API `https://backreserve.runasp.net`, web app `https://reserver-app.gentlegroup.de` |

Related docs: [docs/STORE_RELEASE.md](../../../../docs/STORE_RELEASE.md) (privacy rationale §6, build steps §9,
pre-submission checklist §10).

> **Status 2026-11-02 (after the store-readiness fixes):**
> - Privacy policy, imprint, account-deletion page and support page on `reserver.gentlegroup.de` are complete (operator
>   Berk-Can Atesoglu (Gentle Group Studios), Girardetstraße 17, 42109 Wuppertal, +49 175 4701892, office@gentlegroup.de); no placeholders left.
> - The app links privacy policy and imprint on the start screen, at checkout and on the team sign-in, plus
>   privacy/imprint/help/account deletion under Team → Konto. These changes ship with **versionCode 3** (not built yet –
>   rebuild the AAB and recapture screenshots before uploading; the versionCode 2 AAB below lacks them).
> - Review bakery: daily inventory extended to **2027-01-31**; its trial date (2026-11-28) cannot be changed through the
>   product (see §7) – the date is shown only and not enforced by the backend.
> - Still open: `/.well-known/assetlinks.json` on `reserver-app.gentlegroup.de` returns 404, so App Links (`autoVerify`)
>   do not verify; add it after the first upload with the **Play App Signing** SHA-256 (STORE_RELEASE.md §8). Not a
>   review blocker.
>
> Internal testing can start right away.

---

## 1. Create app (All apps → Create app)

| Field | Value |
|---|---|
| App name | `BackReserve – Vorbestellen` |
| Default language | `Deutsch (Deutschland) – de-DE` |
| App or game | App |
| Free or paid | Free |
| Declarations | Tick Developer Program Policies and US export laws |

## 2. Release artefact (Test and release → Internal testing / Closed testing → Create new release)

| Item | Value |
|---|---|
| Signed AAB (upload this) | `C:\Users\TurkesMedin\keystore\backreserve\backreserve-1.0.0-2-release.aab` (outside Git) |
| Upload keystore | `C:\Users\TurkesMedin\keystore\backreserve\backreserve-upload.jks` (PKCS12, RSA 4096, valid until 2056-10-21) · alias `backreserve-upload` |
| Keystore password | in `C:\Users\TurkesMedin\keystore\backreserve-password.txt` (store and key password are identical) – never commit, never paste anywhere |
| Upload certificate | `CN=Medin Turkes, O=Medin Turkes, C=DE` |
| Upload certificate SHA-256 | `38:44:AF:DF:3D:BE:18:5C:D8:15:69:C1:35:CC:70:B8:22:6D:A3:4B:B4:D5:F2:DB:75:8A:F7:8D:98:91:C6:FD` |
| AAB SHA-256 | `d32ff78ea8cbea0d4960c8c6e0712d6e576a0644ae1b677456ffb525f96eadb3` (89,577,536 bytes, built 2026-11-02) |
| Verification | `jarsigner -verify` → "jar verified"; signer certificate SHA-256 = keystore entry above; `applicationId` `com.certidevelopment.backreserve`, label `BackReserve`; JS bundle contains `https://backreserve.runasp.net` and no `localhost` / `10.0.2.2` |
| Manifest | minSdk 24 · targetSdk 36 · App Links host `reserver-app.gentlegroup.de` · no `AD_ID`. Permissions: INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE, CAMERA (QR scan), POST_NOTIFICATIONS, VIBRATE, RECEIVE_BOOT_COMPLETED, WAKE_LOCK, USE_BIOMETRIC/USE_FINGERPRINT (expo-secure-store), c2dm RECEIVE (expo-notifications), launcher-badge permissions, READ/WRITE_EXTERNAL_STORAGE (maxSdk 32), SYSTEM_ALERT_WINDOW merged in from a library – **blocked** via `android.blockedPermissions` from versionCode 3 on (the app never draws overlays) |

- **Older bundle** `backreserve-1.0.0-1-release.aab` (versionCode 1, 2026-10-29) was never uploaded – do not upload it;
  versionCode 1 is simply skipped.
- **Back up** the keystore and the password file to a second secure location – losing the upload key means a key
  reset request to Google.
- **Play App Signing:** accept the default (Google manages the app signing key; you keep the upload key above). After
  the first upload copy the *App signing key certificate* SHA-256 from *Test and release → App integrity* into
  `assetlinks.json`.
- New personal developer accounts need a **closed test with at least 12 testers opted in for 14 consecutive days**
  before production access.
- Rebuild: see STORE_RELEASE.md §9 “Local signed build”. Bump `BUILD_NUMBER` (and `VERSION` for user-visible
  releases) in `app.config.ts` for every upload.

### Release name and notes

Release name: `1.0.0 (2)`

Release notes – paste both into the release notes field, each wrapped in its language tag
(`<de-DE>` … `</de-DE>`, `<en-US>` … `</en-US>`).

Release notes de-DE (max 500):
```text
Erste Version von BackReserve:
• Brötchen, Brot, Kuchen & mehr bei deiner Bäckerei vorbestellen – ohne Kundenkonto
• Standort, Abholtag und freies Zeitfenster wählen
• Abholcode und QR-Code für die Theke, bezahlt wird bei Abholung
• „Meine Bestellungen“: Status ansehen und rechtzeitig stornieren
• Für Bäckerei-Teams: Bestellungen des Tages, Vorbereitung und Abholung per Code oder QR-Scan
```

Release notes en-US (max 500):
```text
First release of BackReserve:
• Pre-order rolls, bread, cakes & more at your bakery – no customer account needed
• Choose location, pickup day and a free time slot
• Pickup code and QR code for the counter – pay when you collect
• "Meine Bestellungen" (my orders): check the status and cancel in time
• For bakery teams: today's orders, preparation and pickup by code or QR scan
```

## 3. Main store listing (Grow users → Store presence → Main store listing)

### de-DE

App name (max 30):
```text
BackReserve – Vorbestellen
```

Short description (max 80):
```text
Brötchen, Kuchen & mehr beim Bäcker vorbestellen – bezahlt wird bei Abholung.
```

Full description (max 4000):
```text
Nie wieder vor leeren Regalen stehen: Mit BackReserve reservierst du Brötchen, Brot, Croissants, Kuchen und Frühstücksboxen bei deiner Bäckerei – bequem vorab und ganz ohne Kundenkonto.

SO FUNKTIONIERT'S
• Bäckerei über ihren Link oder ihr Kürzel öffnen – zuletzt besuchte Bäckereien findest du direkt auf der Startseite
• Standort und Abholtag wählen – du siehst sofort, was noch verfügbar ist und bis wann du bestellen kannst
• Produkte mit Preisen, Allergenen und Hinweisen wie „vegan“ ansehen und in den Warenkorb legen
• Ein freies Abholzeitfenster aussuchen
• Name und E-Mail angeben, reservieren – fertig

BEZAHLT WIRD BEI ABHOLUNG
Es gibt keine Online-Zahlung und keine Gebühren für dich. Du bezahlst wie gewohnt in der Bäckerei.

DEIN ABHOLCODE
Nach der Reservierung erhältst du einen kurzen Abholcode, einen QR-Code und eine Bestätigung per E-Mail. Zeige den Code einfach an der Theke – deine Bestellung liegt bereit. Auf Wunsch erinnert dich die App eine Stunde vor der Abholung.

FLEXIBEL BLEIBEN
Unter „Meine Bestellungen“ siehst du jederzeit den aktuellen Status – bestätigt, in Vorbereitung, abholbereit – und kannst bis zum Stornierungsschluss der Bäckerei kostenlos stornieren.

FÜR BÄCKEREI-TEAMS
Mitarbeitende melden sich mit ihrem BackReserve-Zugang an und sehen alle Bestellungen des Tages nach Abholzeit gruppiert – filterbar nach Standort, Zeitfenster und offenen Bestellungen, mit automatischer Aktualisierung. Bestellungen werden mit einem Fingertipp vorbereitet und als bereit markiert, die Abholung wird per Code-Eingabe oder QR-Scan erfasst. Abholprobleme lassen sich direkt an der Bestellung vermerken.

DATENSCHUTZ
Kein Tracking, keine Werbung, keine Analyse-Tools. Wir verarbeiten nur die Daten, die für deine Reservierung nötig sind. Deine Bestellzugänge werden verschlüsselt auf deinem Gerät gespeichert. Die Kamera wird nur im Team-Bereich zum Scannen von Abholcodes genutzt.

BackReserve ist ein Service für lokale Bäckereien. Produkte, Preise, Abholzeiten und Allergenangaben stammen von der jeweiligen Bäckerei.
```

### en-US (optional: Add translation → English (United States) – en-US)

App name (max 30):
```text
BackReserve – Bakery Pre-order
```

Short description (max 80):
```text
Pre-order rolls, cakes & more at your local bakery – pay when you pick up.
```

Full description (max 4000):
```text
Never face empty shelves again: with BackReserve you reserve rolls, bread, croissants, cakes and breakfast boxes at your local bakery – in advance and without a customer account.

HOW IT WORKS
• Open your bakery via its link or short name – recently visited bakeries are right on the start screen
• Choose a location and pickup day – you see right away what is still available and the order deadline
• Browse products with prices, allergens and labels such as "vegan" and add them to your basket
• Pick a free pickup time slot
• Enter your name and e-mail, reserve – done

PAY WHEN YOU PICK UP
There is no online payment and no fee for you. You pay in the bakery as usual.

YOUR PICKUP CODE
After reserving you get a short pickup code, a QR code and a confirmation e-mail. Just show the code at the counter – your order is ready. If you like, the app reminds you one hour before pickup.

STAY FLEXIBLE
Under "Meine Bestellungen" (my orders) you always see the current status – confirmed, being prepared, ready for pickup – and can cancel free of charge until the bakery's cancellation deadline.

FOR BAKERY TEAMS
Staff sign in with their BackReserve account and see all of today's orders grouped by pickup time – filterable by location, time slot and open orders, refreshed automatically. Orders are prepared and marked ready with one tap, the pickup is recorded by entering the code or scanning the QR code. Pickup problems can be noted directly on the order.

PRIVACY
No tracking, no ads, no analytics. We only process the data needed for your reservation. Your order access keys are stored encrypted on your device. The camera is only used in the staff area to scan pickup codes.

BackReserve is a service for local bakeries. Products, prices, pickup times and allergen information are provided by each bakery. The app is currently available in German.
```

### Graphics (same files for both languages)

All files are in `apps/mobile/store-assets/android/` (absolute:
`C:\Users\TurkesMedin\repos\Medin\BackReserve\apps\mobile\store-assets\android\`). Screenshots are real captures of
the **release build** (versionCode 2) on the Android emulator against the production API with the review bakery
“Bäckerei Berkcan” (fictitious customers, `@example.com` addresses), Android demo mode for a clean status bar (09:30,
full battery/Wi-Fi, no notifications), framed with a headline. Regenerate with `scripts/store-screenshots.mjs`
(STORE_RELEASE.md §5).

| Slot | File(s) | Format |
|---|---|---|
| App icon | `icon-512.png` | 512×512 PNG, 24-bit, opaque |
| Feature graphic | `feature-graphic-1024x500.png` | 1024×500 PNG, 24-bit, no transparency |
| Phone screenshots (8) | `phone-screenshots/phone-01-…jpg` … | 1080×1920 JPEG (9:16) |
| 7-inch tablet (8) | `tablet-7-screenshots/tablet-7-01-…jpg` … | 1200×2134 JPEG (9:16) |
| 10-inch tablet (8) | `tablet-10-screenshots/tablet-10-01-…jpg` … | 1620×2880 JPEG (9:16) |

Order: 1 bakery, location & pickup day · 2 products with availability & allergens · 3 pickup slot · 4 pickup code +
QR · 5 “Meine Bestellungen” · 6 staff “Heute” · 7 staff order detail · 8 staff pickup by code (tablets: same order,
same captions). No video. Play rejects screenshots whose long side is more than twice the short side, so the
1344×2992 raw captures are always framed into 9:16.

## 4. Store settings (Grow users → Store presence → Store settings)

| Field | Value |
|---|---|
| App category | **Food & Drink** (Essen & Trinken) |
| Tags (up to 5 from Play's list) | choose the closest available, e.g. Food ordering, Bakery, Local, Shopping |
| Email address | `certidevelopment@gmail.com` |
| Phone | leave empty (optional) |
| Website | `https://reserver.gentlegroup.de/` (HTTP 200, checked 2026-11-02); help/contact page: `https://reserver.gentlegroup.de/support.html` |
| External marketing | your choice (default on) |

## 5. App content (Policy → App content)

### Privacy policy
```text
https://reserver.gentlegroup.de/datenschutz.html
```
(HTTP 200; complete privacy policy since 2026-11-02, also linked inside the app from versionCode 3 on.)

### Ads
**No, my app does not contain ads.**

### App access
**All or some functionality is restricted** → Add instructions:

| Field | Value |
|---|---|
| Name | `Bäckerei-Team / Bakery staff` |
| Username | `berkcan@gentlegroup.de` |
| Password | from GentleHub → project → Testfirma-Login (never commit it – this repository is public) |
| Any other information | text below |

Any other information (max 500):
```text
Customers need no login: start screen > enter "baeckerei-berkcan" > "Öffnen". Pick location, day, products and a time slot, enter any name and e-mail to reserve. Payment is in the shop (no digital goods).
Staff: start screen > "Zum Team-Bereich" > sign in (owner of the fictitious demo bakery, no 2FA). Tabs: "Heute" (today's orders), "Abholung" (enter a pickup code or scan the QR code; camera only used for this), "Konto".
```

### Content rating (IARC questionnaire)
- Email: `certidevelopment@gmail.com` · Category: **All Other App Types** (ordering/utility – not a game, not social,
  not news/reference).
- Violence, fear, sexuality, nudity, profanity/crude humour, drugs/alcohol/tobacco, gambling or simulated gambling,
  hate speech: **No** to every question. (A cake description mentions “Kirschwasser” – that is a product ingredient
  supplied by the bakery, not alcohol content/promotion; answer **No**.)
- Does the app allow users to interact or exchange content with other users? **No** – customers send a reservation
  (optional order note) only to the bakery they order from; nothing is public and there is no user-to-user chat.
- Does the app share the user's current physical location with other users? **No**
- Does the app allow users to purchase digital goods? **No** (physical goods, paid in the shop)
- Is the app a web browser or search engine? **No**
- Expected result: USK 0 / PEGI 3 / Everyone.

### Target audience and content
- Target age group: **18 and over** (STORE_RELEASE.md §6; adding 16–17 is possible, but under-18 groups bring extra
  policy requirements).
- Is the app appealing to children? **No**.

### News app
**No.**

### COVID-19 contact tracing and status apps
**My app is not a publicly available COVID-19 contact tracing or status app.**

### Data safety
From STORE_RELEASE.md §6 (re-check against the final privacy policy):

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (release builds talk HTTPS only) |
| Which account creation methods does your app support? | Staff log in with username (e-mail) + password; accounts are created on the web (bakery registration / staff invitation), **not** in the app. Customers need no account. |
| Do you provide a way for users to request that their data be deleted? | **Yes** – `https://reserver.gentlegroup.de/konto-loeschen.html` (e-mail request to `office@gentlegroup.de`); customers can also ask their bakery |

Data types (all: Collected = **yes**, Shared = **no** – the bakery is the service the user orders from, our processing
is on its behalf; Processed ephemerally = **no**):

| Category → type | Required? | Purposes |
|---|---|---|
| Personal info → Name | Required | App functionality; Account management (staff) |
| Personal info → Email address | Required | App functionality; Account management; Developer communications (order confirmation e-mail) |
| Personal info → Phone number | Optional (unless the bakery requires it) | App functionality |
| Personal info → Other info (order note) | Optional | App functionality |
| Financial info → Purchase history (reservations/orders) | Required | App functionality |

Not collected: location, contacts, photos/videos (camera frames are only processed on the device to read pickup QR
codes), audio, files, calendar, health, messages, web history, app activity/analytics, crash logs/diagnostics, device
or other IDs (the Expo push token is created on the device only and not sent to a server in 1.0.0 – update this answer
to *Device or other IDs* once server push is added). No data is used for advertising or tracking.

### Account deletion
Delete account URL:
```text
https://reserver.gentlegroup.de/konto-loeschen.html
```
Accounts cannot be created in the app. Staff/bakery accounts are deleted on request (e-mail to `office@gentlegroup.de`,
processed manually by the operator – there is no self-service deletion endpoint); the bakery owner can also deactivate a
team member on the web. Customers have no account: their contact data is anonymised by the bakery's retention setting
(default 365 days after pickup) or earlier on request. In the app the page is linked under Team → Konto → "Konto
löschen" (versionCode 3).

### Government apps
**No.**

### Financial features
**My app doesn't provide any financial features** (no payments in the app – customers pay in the shop).

### Health apps
**My app does not have any health features.**

### Advertising ID
**No** – the app does not use the advertising ID (no `AD_ID` permission in the manifest).

### Photo and video permissions / Foreground service / Exact alarms / Full-screen intent
Not applicable. Camera is requested at runtime for QR scanning only (staff), which needs no extra declaration;
`RECORD_AUDIO` is explicitly blocked. Customer reminders are ordinary (inexact) local notifications.

### EU Digital Services Act – trader status
**I'm a trader** (business). The trader details (name, address, e-mail, phone) are shown publicly and must match the
developer account. The Impressum names Berk-Can Atesoglu (Gentle Group Studios), Girardetstraße 17, 42109 Wuppertal, +49 175 4701892, office@gentlegroup.de – owner to align with the Play developer account.

## 6. Pricing and distribution
- Free. Countries: start with **Germany** (the UI and bakeries are German); add Austria/Switzerland later if needed.
- Contains ads: No. Devices: phones and tablets (the app supports tablets; portrait only).

## 7. Test account data (for your own reference)

Created on 2026-10-29 through the normal registration flow on the production API (e-mail marked confirmed in the DB).

| | |
|---|---|
| Bakery | “Bäckerei Berkcan”, slug `baeckerei-berkcan`, published |
| Owner login | `berkcan@gentlegroup.de` / (see GentleHub → project → Testfirma-Login) |
| Staff logins (accepted invitations, same password – see GentleHub) | `leitung@example.com` (Manager, both locations) · `verkauf.lindenstrasse@example.com` (Staff, Stammhaus) · `verkauf.bilk@example.com` (Staff, Filiale) |
| Locations | Stammhaus Lindenstraße (Mo–Fr 7–18, Sa 7–12:30, So 8–11 pickup) · Filiale Bilker Allee (Mo–Fr 7:30–17:30, Sa 8–12:30, So closed) |
| Catalog | 8 categories, 40 products with prices, allergens, ingredients, labels and images; daily inventory per location **until 2027-01-31** (extended on 2026-11-02 with the dashboard's own "Tag kopieren" endpoint `POST /api/v1/admin/inventory/copy-day`, logged in as the review owner: each day 2026-11-12 … 2027-01-31 copied from the same weekday of 2026-11-05 … 11, `overwrite: false`; 81 days × 2 locations, 6,480 product-day rows, no other data touched) |
| Orders | 37 orders from 25 Oct to 2 Nov (2026-10-29), plus on 2026-11-02 for the screenshots: 6 orders for 2 Nov at Stammhaus (Lena Wagner, Thomas Becker, Fatma Yilmaz, Jonas Schmidt, Marie Klein, Peter Neumann – all `@example.com`) and 2 orders placed through the app on the emulator for the screenshots (Anna Berger, `anna.berger@example.com`: `BR-SNGQEN` 3 Nov 08:00 Stammhaus, set to "In Vorbereitung"; `BR-ZQE5BU` 5 Nov 10:00 Filiale); statuses advanced in the demo bakery only. All customer addresses are `@example.com` |
| Subscription | trial of the *Multi-Location* plan (set in the DB, needed for 2 locations) – `trialEndsAt` **2026-11-28**. There is no supported way to change it (the only plan endpoint is development-only, the platform admin can only suspend/reactivate). The backend does **not** enforce `trialEndsAt` (it is only displayed in the web settings), so the bakery keeps working after that date. Changing the date would need a platform-admin endpoint (or an owner-run SQL update) |

Do not use it for real customer data. Reviewers may place additional test orders; that is fine.

## 8. Character counts (`node scripts/check-store-texts.mjs`, 2026-11-02)

| Field | Limit | de-DE | en-US (optional) |
|---|---|---|---|
| App name | 30 | 26 | 30 |
| Short description | 80 | 77 | 74 |
| Full description | 4000 | 2049 | 1855 |
| Release notes | 500 | 390 | 378 |
| App access – other information (shared) | 500 | 424 | – |
