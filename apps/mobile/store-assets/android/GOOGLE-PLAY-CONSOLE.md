# Google Play Console – copy-paste checklist (BackReserve 1.0.0, versionCode 1)

Everything needed to create the app in Play Console and submit the first release. Go top to bottom; each block says
which Console page it belongs to. Status as of 2026-10-29. **Nothing has been uploaded yet.**

| | |
|---|---|
| Package name | `com.certidevelopment.backreserve` |
| Developer | Medin Turkes · Certi Development (same developer account as AngebotPilot) |
| Version | versionName `1.0.0`, versionCode `1` |
| Default language | German – de-DE (add English – en-US as a second listing language; the app UI itself is German only) |
| App or game | App · Free · no in-app purchases (customers pay in the bakery; bakeries' subscriptions are not sold via Play) |
| Backend | production API `https://backreserve.runasp.net`, web app `https://reserver-app.gentlegroup.de` |

Related docs: [docs/STORE_RELEASE.md](../../../../docs/STORE_RELEASE.md) (listing texts, privacy declarations §6,
pre-submission checklist §10).

> **Blocking before production (and strongly recommended before any review):**
> 1. `https://reserver.gentlegroup.de/datenschutz.html` and `/impressum.html` are still **placeholders**
>    ("Platzhalter … [Angaben werden ergänzt]"). Google reviews the privacy policy URL – it must name the controller,
>    describe the app's data (see §6 of STORE_RELEASE.md) and be reachable without login. Fill both pages first.
> 2. There is **no account/data deletion page** yet. Add a section `#loeschung` to the privacy page (or a separate
>    page) explaining how customers and staff request deletion (e-mail to `certidevelopment@gmail.com` or via the
>    bakery owner), then use that URL below.
> 3. `/.well-known/assetlinks.json` on `reserver-app.gentlegroup.de` is not deployed yet, so App Links
>    (`autoVerify`) will not verify; links open in the browser instead. Add it after the first upload with the
>    **Play App Signing** SHA-256 (STORE_RELEASE.md §8). Not a review blocker.
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
| Signed AAB (upload this) | `C:\Users\TurkesMedin\keystore\backreserve\backreserve-1.0.0-1-release.aab` (outside Git) |
| Upload keystore | `C:\Users\TurkesMedin\keystore\backreserve\backreserve-upload.jks` (PKCS12, RSA 4096, valid until 2056-10-21) · alias `backreserve-upload` |
| Keystore password | in `C:\Users\TurkesMedin\keystore\backreserve-password.txt` (store and key password are identical) – never commit, never paste anywhere |
| Upload certificate | `CN=Medin Turkes, O=Medin Turkes, C=DE` |
| Upload certificate SHA-256 | `38:44:AF:DF:3D:BE:18:5C:D8:15:69:C1:35:CC:70:B8:22:6D:A3:4B:B4:D5:F2:DB:75:8A:F7:8D:98:91:C6:FD` |
| AAB SHA-256 | `0bb26e637d052cc20d88cb33a89e5611e6bda370a2dd8edb5f2887492b1e695b` (89,577,526 bytes, built 2026-10-29 11:24) |
| Manifest | minSdk 24 · targetSdk 36 · `keytool -printcert -jarfile` shows the upload certificate · JS bundle points at `https://backreserve.runasp.net` · App Links host `reserver-app.gentlegroup.de` · no `AD_ID`. Main permissions: INTERNET, ACCESS_NETWORK_STATE, CAMERA (QR scan), POST_NOTIFICATIONS, VIBRATE, RECEIVE_BOOT_COMPLETED, WAKE_LOCK, USE_BIOMETRIC/USE_FINGERPRINT (expo-secure-store), c2dm RECEIVE (expo-notifications), launcher-badge permissions, plus SYSTEM_ALERT_WINDOW merged in from a library – review and block it via `android.blockedPermissions` in a later build if not needed (no Play declaration is required for it) |

- **Back up** the keystore and the password file to a second secure location – losing the upload key means a key
  reset request to Google.
- **Play App Signing:** accept the default (Google manages the app signing key; you keep the upload key above). After
  the first upload copy the *App signing key certificate* SHA-256 from *Test and release → App integrity* into
  `assetlinks.json`.
- New personal developer accounts need a **closed test with at least 12 testers opted in for 14 consecutive days**
  before production access.
- Rebuild: see STORE_RELEASE.md §9 “Local signed build”. Bump `VERSION` / `BUILD_NUMBER` in `app.config.ts` for every
  upload.

### Release name and notes

Release name: `1.0.0 (1)`

```text
<de-DE>
Erste Version von BackReserve:
• Brötchen, Brot, Kuchen & mehr bei deiner Bäckerei vorbestellen – ohne Kundenkonto
• Standort, Abholtag und freies Zeitfenster wählen
• Abholcode und QR-Code für die Theke, bezahlt wird bei Abholung
• „Meine Bestellungen“: Status ansehen und rechtzeitig stornieren
• Für Bäckerei-Teams: Bestellungen des Tages, Vorbereitung und Abholung per Code oder QR-Scan
</de-DE>
<en-US>
First release of BackReserve:
• Pre-order rolls, bread, cakes & more at your bakery – no customer account needed
• Choose location, pickup day and a free time slot
• Pickup code and QR code for the counter – pay when you collect
• "My orders": check the status and cancel in time
• For bakery teams: today's orders, preparation and pickup by code or QR scan
</en-US>
```

## 3. Main store listing (Grow users → Store presence → Main store listing)

### de-DE

**App name (≤ 30):**
```text
BackReserve – Vorbestellen
```

**Short description (≤ 80):**
```text
Brötchen, Kuchen & mehr beim Bäcker vorbestellen – bezahlt wird bei Abholung.
```

**Full description (≤ 4000):**
```text
Nie wieder vor leeren Regalen stehen: Mit BackReserve reservierst du Brötchen, Croissants, Kuchen und Frühstücksboxen bei deiner Bäckerei – bequem vorab und ganz ohne Kundenkonto.

So funktioniert's
• Bäckerei über ihren Link oder ihr Kürzel öffnen
• Standort und Abholtag wählen – du siehst sofort, was noch verfügbar ist
• Produkte in den Warenkorb legen und ein Abholzeitfenster aussuchen
• Name und E-Mail angeben, reservieren – fertig

Bezahlt wird bei Abholung. Es gibt keine Online-Zahlung und keine Gebühren für dich.

Dein Abholcode
Nach der Reservierung erhältst du einen kurzen Abholcode und einen QR-Code. Zeige ihn einfach an der Theke – deine Bestellung liegt bereit. Auf Wunsch erinnert dich die App eine Stunde vor der Abholung.

Flexibel bleiben
Unter „Meine Bestellungen“ siehst du jederzeit den aktuellen Status und kannst bis zum Stornierungsschluss der Bäckerei kostenlos stornieren.

Für Bäckerei-Teams
Mitarbeitende melden sich mit ihrem BackReserve-Zugang an, sehen alle Bestellungen des Tages nach Abholzeit sortiert, bereiten sie mit einem Fingertipp vor und erfassen die Abholung per Code-Eingabe oder QR-Scan. Abholprobleme lassen sich direkt an der Bestellung vermerken.

Datenschutz
Kein Tracking, keine Werbung. Wir verarbeiten nur die Daten, die für deine Reservierung nötig sind. Deine Bestellzugänge werden verschlüsselt auf deinem Gerät gespeichert.

BackReserve ist ein Service für lokale Bäckereien. Allergenangaben stammen von der jeweiligen Bäckerei.
```

### en-US (Add translation → English (United States) – en-US)

**App name (≤ 30):**
```text
BackReserve – Bakery Pre-order
```

**Short description (≤ 80):**
```text
Pre-order rolls, cakes & more at your local bakery – pay when you pick up.
```

**Full description (≤ 4000):**
```text
Never face empty shelves again: with BackReserve you reserve rolls, croissants, cakes and breakfast boxes at your local bakery – in advance and without a customer account.

How it works
• Open your bakery via its link or short name
• Choose a location and pickup day – you see right away what is still available
• Add products to your basket and pick a pickup time slot
• Enter your name and e-mail, reserve – done

You pay when you pick up. There is no online payment and no fee for you.

Your pickup code
After reserving you get a short pickup code and a QR code. Just show it at the counter – your order is ready. If you like, the app reminds you one hour before pickup.

Stay flexible
Under "My orders" you can always see the current status and cancel free of charge until the bakery's cancellation deadline.

For bakery teams
Staff sign in with their BackReserve account, see all of today's orders sorted by pickup time, prepare them with one tap and record the pickup by entering the code or scanning the QR code. Pickup problems can be noted directly on the order.

Privacy
No tracking, no ads. We only process the data needed for your reservation. Your order access keys are stored encrypted on your device.

BackReserve is a service for local bakeries. Allergen information is provided by each bakery. The app is currently available in German.
```

### Graphics (same files for both languages)

All files are in `apps/mobile/store-assets/android/` (absolute: `C:\Users\TurkesMedin\repos\Medin\BackReserve\apps\mobile\store-assets\android\`).
Screenshots show the real app UI (the Expo app rendered by react-native-web against the production API with the
review bakery “Bäckerei Berkcan”), framed with a headline for the phone set.

| Slot | File(s) | Format |
|---|---|---|
| App icon | `icon-512.png` | 512×512 PNG, 24-bit, opaque |
| Feature graphic | `feature-graphic-1024x500.png` | 1024×500 PNG, 24-bit, no transparency |
| Phone screenshots (8) | `phone-screenshots/phone-01-c1-bakery.jpg` … `phone-08-s4-pickup-found.jpg` | 1080×1920 JPEG (9:16) |
| 7-inch tablet (6) | `tablet-7-screenshots/tablet-7-01-…jpg` … `tablet-7-06-…jpg` | 1200×1920 JPEG |
| 10-inch tablet (6) | `tablet-10-screenshots/tablet-10-01-…jpg` … `tablet-10-06-…jpg` | 1600×2560 JPEG |

Phone order: 1 bakery & pickup day · 2 products with allergens · 3 pickup slot · 4 pickup code + QR · 5 “Meine
Bestellungen” · 6 staff “Heute” · 7 staff order detail · 8 staff pickup by code.
No video. (Note: Play rejects screenshots whose long side is more than twice the short side, so 1080×2400 is not
used.)

## 4. Store settings (Grow users → Store presence → Store settings)

| Field | Value |
|---|---|
| App category | **Food & Drink** (Essen & Trinken) |
| Tags (up to 5 from Play's list) | Food & drink, Ordering / Food ordering, Shopping, Local, Bakery (choose the closest available) |
| Email address | `certidevelopment@gmail.com` |
| Phone | leave empty (optional) |
| Website | `https://reserver.gentlegroup.de/` |
| External marketing | your choice (default on) |

## 5. App content (Policy → App content)

### Privacy policy
```text
https://reserver.gentlegroup.de/datenschutz.html
```
(Placeholder content today – see the blocking note at the top.)

### Ads
**No, my app does not contain ads.**

### App access
**All or some functionality is restricted** → Add instructions:

| Field | Value |
|---|---|
| Name | `Bäckerei-Team / Bakery staff` |
| Username | `berkcan@gentlegroup.de` |
| Password | `Runderbaum12` |
| Any other information | see text below |

```text
Customer flow (no login): on the start screen enter the bakery short name "baeckerei-berkcan" and tap "Öffnen" (or open https://reserver-app.gentlegroup.de/b/baeckerei-berkcan). Choose a location and pickup day, add products, pick a time slot and enter any name and e-mail to reserve. Payment happens in the shop – there is no online payment and no digital goods.

Staff flow: start screen → "Zum Team-Bereich" → sign in with the credentials above (owner of the demo bakery "Bäckerei Berkcan", no 2FA/OTP). Tabs: "Heute" (today's orders by pickup time, prepare/ready/collected), "Abholung" (enter a pickup code such as one shown in the list, or scan the QR code with the camera – the camera is used only for this), "Konto" (sign out). The bakery is a fictitious review tenant with sample data.
```

### Content rating (IARC questionnaire)
- Email: `certidevelopment@gmail.com` · Category: **All Other App Types** (ordering/utility – not a game, not social,
  not news/reference).
- Violence, fear, sexuality, nudity, profanity/crude humour, drugs/alcohol/tobacco, gambling or simulated gambling,
  hate speech: **No** to every question. (A cake description mentions “Kirschwasser” – that is a product ingredient,
  not alcohol content/promotion; answer **No**.)
- Does the app allow users to interact or exchange content with other users? **No** – customers send a reservation
  (optional order note) only to the bakery they order from; nothing is public and there is no user-to-user chat.
- Does the app share the user's current physical location with other users? **No**
- Does the app allow users to purchase digital goods? **No**
- Is the app a web browser or search engine? **No**
- Expected result: USK 0 / PEGI 3 / Everyone.

### Target audience and content
- Target age group: **18 and over** (as decided in STORE_RELEASE.md §6; adding 16–17 is possible, but under-18 groups
  bring extra policy requirements).
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
| Do you provide a way for users to request that their data be deleted? | **Yes** – deletion request URL (to be published, see top) and e-mail `certidevelopment@gmail.com`; customers can also ask their bakery |

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
```text
https://reserver.gentlegroup.de/datenschutz.html#loeschung
```
(Section still has to be added – see top.) Accounts cannot be created in the app; staff accounts are deleted by the
bakery owner (remove the team member on the web) or on request via `certidevelopment@gmail.com`; customer data is
deleted by the bakery's retention setting or on request.

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
`RECORD_AUDIO` is explicitly blocked.

### EU Digital Services Act – trader status
**I'm a trader** (business). The trader details (name, address, e-mail, phone) are shown publicly – use the same data
as in the Impressum once its placeholder is filled in.

## 6. Pricing and distribution
- Free. Countries: start with **Germany** (the UI and bakeries are German); add Austria/Switzerland later if needed.
- Contains ads: No. Devices: phones and tablets (the app supports tablets).

## 7. Test account data (for your own reference)

Created on 2026-10-29 through the normal registration flow on the production API (e-mail marked confirmed in the DB).

| | |
|---|---|
| Bakery | “Bäckerei Berkcan”, slug `baeckerei-berkcan`, published |
| Owner login | `berkcan@gentlegroup.de` / `Runderbaum12` |
| Staff logins (accepted invitations, same password `Runderbaum12`) | `leitung@example.com` (Manager, both locations) · `verkauf.lindenstrasse@example.com` (Staff, Stammhaus) · `verkauf.bilk@example.com` (Staff, Filiale) |
| Locations | Stammhaus Lindenstraße (Mo–Fr 7–18, Sa 7–12:30, So 8–11 pickup) · Filiale Bilker Allee (Mo–Fr 7:30–17:30, Sa 8–12:30, So closed) |
| Catalog | 8 categories, 40 products with prices, allergens, ingredients, labels and images; daily inventory for 14 days per location (some items limited/sold out, seasonal stollen unavailable until 1 Nov) |
| Orders | 37 orders from 25 Oct to 2 Nov in every status (new, in preparation, ready, collected, cancelled by customer/bakery, no-show, pickup problems noted), all with `@example.com` customer addresses |
| Subscription | trial of the *Multi-Location* plan (set in the DB, needed for 2 locations) – ends **2026-11-28**; extend it before then if review or the closed test runs longer |

Do not use it for real customer data. Reviewers may place additional test orders; that is fine.
