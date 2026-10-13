# Store release – BackReserve mobile app (iOS & Android)

> **Status: The app has NOT been submitted to the Apple App Store or Google Play.** No store listing, no EAS project,
> no signing credentials and no push credentials exist yet. Everything below is preparation: what is configured in
> `apps/mobile`, what is still a placeholder, and the steps for a first release.

The app is an Expo (SDK 57) / React Native app in `apps/mobile` with Expo Router. It is used by **customers**
(reserve bakery products without an account, pay at pickup) and by **bakery staff** (sign in, process today's orders,
record pickups by code or QR scan). It talks to the same BackReserve API as the web app.

---

## 1. Placeholders to replace before the first release

| What | Where | Current placeholder |
|---|---|---|
| iOS bundle identifier / Android package | `apps/mobile/app.config.ts` (`BUNDLE_ID`) | `de.backreserve.app` (preview/dev builds get `.preview` / `.dev` suffixes so all three can be installed side by side) |
| Universal / App Link domain | `app.config.ts` (`UNIVERSAL_LINK_HOST` or env `UNIVERSAL_LINK_HOST`) | `app.backreserve.example` |
| Production API | `eas.json` → `build.production.env.EXPO_PUBLIC_API_URL` | `https://api.backreserve.example` |
| Staging API (preview builds) | `eas.json` → `build.preview.env.EXPO_PUBLIC_API_URL` | `https://staging-api.backreserve.example` |
| EAS project id / owner | env `EAS_PROJECT_ID`, `EAS_OWNER` (read in `app.config.ts`) | not set |
| App Store Connect app id | `eas.json` → `submit.production.ios.ascAppId` | `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` |
| Privacy policy URL | Store listings | `https://backreserve.example/datenschutz` (placeholder) |
| Support URL / e-mail | Store listings | `https://backreserve.example/hilfe`, `support@backreserve.example` (placeholders) |
| Imprint (Impressum) | Store listings (required for German publishers) | `https://backreserve.example/impressum` (placeholder) |

Release builds only talk to **HTTPS** APIs: Android release builds block cleartext HTTP and iOS ATS blocks it as well.
`http://…:5280` only works in development builds / Expo Go.

## 2. Versioning

`eas.json` uses `"appVersionSource": "local"`. Before every store build bump in `app.config.ts`:

- `VERSION` (user-visible, e.g. `1.0.1`) → `version` on both platforms
- `BUILD_NUMBER` (integer, must increase for every upload) → iOS `buildNumber` and Android `versionCode`

(Alternatively switch to `"appVersionSource": "remote"` with `"autoIncrement": true` for the production profile.)

## 3. Assets

Generated in brand colours by `npm run generate:assets` (`scripts/generate-assets.js`, writes `assets/images/`):

| File | Use | Requirement |
|---|---|---|
| `icon.png` 1024×1024, opaque | iOS app icon / generic icon | App Store: 1024×1024 PNG, **no transparency**, no rounded corners (the system masks it) |
| `adaptive-icon.png` 1024×1024, transparent, motif inside the 66 % safe zone | Android adaptive icon foreground (background colour `#B5562B`) | Google Play additionally needs a **512×512 32-bit PNG** hi-res icon in the listing (export from `icon.png`) |
| `adaptive-icon-monochrome.png` | Android 13+ themed icon | white silhouette on transparent |
| `splash-icon.png` | splash screen (cream background `#FAF6F0`) | via `expo-splash-screen` plugin |
| `notification-icon.png` 96×96 | Android notification small icon | white on transparent |
| `favicon.png` | web preview | – |

Google Play also requires a **feature graphic 1024×500** (JPEG or 24-bit PNG, no transparency) – still to be designed.

## 4. Store listing (German, store-facing)

**App name (iOS, ≤ 30):** `BackReserve`
**Untertitel (iOS, ≤ 30):** `Beim Bäcker vorbestellen`
**Titel (Google Play, ≤ 30):** `BackReserve – Vorbestellen`

**Kurzbeschreibung (Google Play, ≤ 80 Zeichen, 77):**
> Brötchen, Kuchen & mehr beim Bäcker vorbestellen – bezahlt wird bei Abholung.

**Beschreibung (DE):**

> Nie wieder vor leeren Regalen stehen: Mit BackReserve reservierst du Brötchen, Croissants, Kuchen und Frühstücksboxen bei deiner Bäckerei – bequem vorab und ganz ohne Kundenkonto.
>
> **So funktioniert's**
> • Bäckerei über ihren Link oder ihr Kürzel öffnen
> • Standort und Abholtag wählen – du siehst sofort, was noch verfügbar ist
> • Produkte in den Warenkorb legen und ein Abholzeitfenster aussuchen
> • Name und E-Mail angeben, reservieren – fertig
>
> **Bezahlt wird bei Abholung.** Es gibt keine Online-Zahlung und keine Gebühren für dich.
>
> **Dein Abholcode**
> Nach der Reservierung erhältst du einen kurzen Abholcode und einen QR-Code. Zeige ihn einfach an der Theke – deine Bestellung liegt bereit. Auf Wunsch erinnert dich die App eine Stunde vor der Abholung.
>
> **Flexibel bleiben**
> Unter „Meine Bestellungen“ siehst du jederzeit den aktuellen Status und kannst bis zum Stornierungsschluss der Bäckerei kostenlos stornieren.
>
> **Für Bäckerei-Teams**
> Mitarbeitende melden sich mit ihrem BackReserve-Zugang an, sehen alle Bestellungen des Tages nach Abholzeit sortiert, bereiten sie mit einem Fingertipp vor und erfassen die Abholung per Code-Eingabe oder QR-Scan. Abholprobleme lassen sich direkt an der Bestellung vermerken.
>
> **Datenschutz**
> Kein Tracking, keine Werbung. Wir verarbeiten nur die Daten, die für deine Reservierung nötig sind. Deine Bestellzugänge werden verschlüsselt auf deinem Gerät gespeichert.
>
> BackReserve ist ein Service für lokale Bäckereien. Allergenangaben stammen von der jeweiligen Bäckerei.

**Schlüsselwörter (iOS, ≤ 100 Zeichen, 92):**
`Bäckerei,vorbestellen,Brötchen,Kuchen,Abholung,Reservierung,Bäcker,Croissant,Donut,Frühstück`

**Werbetext (iOS Promotional Text, ≤ 170):**
> Jetzt neu: Erinnerung eine Stunde vor der Abholung – und für Bäckerei-Teams die Abholung per QR-Scan.

**Kategorie:** iOS primär *Essen & Trinken* (Food & Drink), sekundär *Shopping*; Google Play *Essen & Trinken*.
**Altersfreigabe:** 4+ (Apple), IARC/USK „ab 0 Jahren“ – no user-generated public content, no ads, no purchases.
**Preis:** kostenlos, keine In-App-Käufe.

**App Review notes (Apple) / Zugangsdaten für die Prüfung (Google):**
The staff area requires a login. Provide a review account on the **production** system (a dedicated review bakery with
demo products), e.g. `review@backreserve.example` with role *Staff*, and a public bakery slug the reviewer can open
(customer flow needs no account). Explain that payment happens in the shop (no digital goods → no IAP required).
Accounts are not created in the app (bakeries register on the web, staff are invited), therefore the in-app account
deletion requirement (App Store Guideline 5.1.1(v)) does not apply; still link an account-deletion request page in the
Play listing (see 6).

## 5. Screenshots

Take screenshots in German from a production-like build (demo bakery), at least: start screen, bakery with products,
pickup slot selection, confirmation with QR code, "Meine Bestellungen", staff "Heute" list, staff pickup screen.

| Store | Device class | Size (portrait) | Count |
|---|---|---|---|
| App Store | iPhone 6.9" (iPhone 16/17 Pro Max) | 1320×2868 (or 1290×2796) | 1–10, **required** (6.9" set is scaled down for smaller iPhones) |
| App Store | iPhone 6.7" | 1290×2796 | optional if 6.9" provided |
| App Store | iPhone 6.5" | 1284×2778 or 1242×2688 | optional if 6.9" provided |
| App Store | iPad 13" (`supportsTablet: true`) | 2064×2752 (or 2048×2732 for 12.9") | 1–10, **required** because iPad is supported |
| Google Play | Phone | 9:16, e.g. 1080×1920 or 1080×2400 (min 320 px, max 3840 px per side) | 2–8, required |
| Google Play | 7" tablet | e.g. 1200×1920 | up to 8, recommended (needed for tablet visibility) |
| Google Play | 10" tablet | e.g. 1600×2560 | up to 8, recommended |

PNG or JPEG, no transparency, no device frames that misrepresent the app.

## 6. Privacy declarations (based on what the app actually handles)

Data flows of the app:

| Data | Who | Purpose | Where |
|---|---|---|---|
| First name (required), last name (optional or required per bakery), e-mail (required), phone (optional or required per bakery), order note (optional) | customers | create and manage the reservation; bakery identifies the order; confirmation e-mail | sent to the BackReserve API, processed for the bakery (data processor relationship); retention per bakery setting |
| Order data (products, quantities, pickup date/slot, location, reference) | customers | the reservation itself | API |
| Order capability tokens + reference, bakery name, pickup date | customers | "Meine Bestellungen" without an account | **only on the device**, encrypted (iOS Keychain / Android Keystore via expo-secure-store) |
| Basket contents, recently visited bakeries | customers | convenience | only on the device (AsyncStorage), no personal data |
| Local reminder schedule | customers (opt-in) | "Abholung in 1 Stunde" | only on the device (local notification) |
| Staff e-mail + password, name, role | staff | sign-in, permission checks | API; refresh token stored encrypted on the device; access token in memory only |
| Customer name / contact shown to staff | staff | process pickups (contact only with permission `CustomerContactView`) | displayed, not stored on the device |
| Camera | staff | scan pickup QR codes | processed on the device, **no images are stored or transmitted** |
| Expo push token | staff (opt-in, button in "Konto") | future "new order" pushes | currently only created on the device, **not sent to any server** (backend endpoint is a later milestone) |

No analytics SDK, no advertising, no tracking, no location, no contacts, no photos, no third-party login.

### Google Play – Data safety

- [ ] Does your app collect or share user data? **Yes (collect)**; shared with third parties: **No** (the bakery is the
      service the user orders from / data processor; no sale or advertising)
- [ ] Data encrypted in transit: **Yes** (HTTPS only in release builds)
- [ ] Users can request deletion: **Yes** – provide a deletion request URL/e-mail (customers: via the bakery or
      support; staff accounts: via bakery owner or support). Placeholder: `https://backreserve.example/datenschutz#loeschung`
- [ ] Personal info → **Name**: collected, required, purpose *App functionality* (and *Account management* for staff)
- [ ] Personal info → **Email address**: collected, required, *App functionality*, *Account management*, *Developer communications* (order confirmation)
- [ ] Personal info → **Phone number**: collected, optional (unless the bakery requires it), *App functionality*
- [ ] Personal info → **Other info** (order note): optional, *App functionality*
- [ ] Financial info → **Purchase history** (reservations/orders): collected, *App functionality*
- [ ] App activity / Device IDs: **not collected** (update to *Device or other IDs* once push tokens are sent to the server)
- [ ] Photos/videos: **not collected** (camera frames are only processed on the device)
- [ ] Location, contacts, health, files, audio, web history: **not collected**
- [ ] Ephemeral processing: no
- [ ] Target audience: 18+ / general, not designed for children (Families policy not applicable)

### Apple – App Privacy ("nutrition label")

- [ ] **Data Used to Track You:** none
- [ ] **Data Linked to You:**
  - Contact Info → Name, Email Address, Phone Number (optional) – purpose *App Functionality*
  - Purchases → Purchase History (reservations) – *App Functionality*
  - User Content → Other User Content (order note) – *App Functionality*
  - Identifiers → User ID (staff accounts only) – *App Functionality*
- [ ] **Data Not Linked to You:** none
- [ ] Not collected: Location, Contacts, Photos or Videos (camera frames processed on device only), Health, Financial Info (no payment data), Browsing/Search History, Diagnostics, Usage Data
- [ ] Privacy manifest: Expo SDK 57 modules ship their `PrivacyInfo.xcprivacy`; AsyncStorage/SecureStore use
      "required reason" APIs (`UserDefaults`, file timestamps) – verify the generated manifest in the iOS build and add
      reasons under `ios.privacyManifests` in `app.config.ts` if App Store Connect reports missing ones.
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption = false` is set (only standard HTTPS/OS encryption).

Permission texts (German, in `app.config.ts`):
- Camera (`NSCameraUsageDescription` / Android `CAMERA`): *„BackReserve verwendet die Kamera nur, um Abholcodes (QR-Codes) von Reservierungen an der Theke zu scannen.“*
- Notifications: requested **in context** only (customer taps "Erinnerung 1 Stunde vorher" after an explanation; staff taps "Gerät registrieren"). Android 13+ `POST_NOTIFICATIONS` is declared.
- Microphone is explicitly not requested (`RECORD_AUDIO` blocked).

## 7. Push notifications (setup steps – server pushes are a later milestone)

Implemented in the app (`src/notifications/notifications.ts`): notification handler, Android channel, permission flow,
local reminders, and `registerForPushNotifications()` which returns an Expo push token. **The backend has no endpoint
to store device tokens yet; the app does not send the token anywhere and no server push is faked.**

When the backend milestone lands:
1. `npx eas-cli@latest init` → creates the EAS project; set `EAS_PROJECT_ID` (and `EAS_OWNER`) for builds (EAS env or `eas.json` env).
2. **Android (FCM v1):** create a Firebase project with package `de.backreserve.app`, download `google-services.json`
   and reference it via `android.googleServicesFile` in `app.config.ts` (do not commit secrets beyond this public
   config file), then upload a Google service account key for FCM v1: `eas credentials` → Android → *Google Service Account Key for Push Notifications (FCM V1)*.
3. **iOS (APNs):** `eas credentials` → iOS → *Push Notifications: Manage your Apple Push Notifications Key* (EAS can create the key in your Apple Developer account). Set the notifications plugin `mode` to `production` (already done for `APP_ENV=production`).
4. Backend: add e.g. `POST /api/v1/admin/devices {expoPushToken, platform}` (+ delete on logout), send via the Expo Push API or FCM/APNs directly; then call it from `registerForPushNotifications()` and the logout flow (marked `TODO(backend milestone)`).
5. Update the privacy declarations (device identifiers).

## 8. Deep links, Universal Links and App Links

Configured routes:
- `backreserve://b/{slug}` → bakery page
- `backreserve://bestellung/{ref}?t={token}` → order (token is saved to "Meine Bestellungen")
- `https://app.backreserve.example/b/{slug}` and `https://app.backreserve.example/bestellung/{ref}#t={token}` (the
  format used in confirmation e-mails). Fragments are not passed to routes, so `src/app/+native-intent.tsx` rewrites
  `#t=` into `?t=`.

`app.config.ts` declares `ios.associatedDomains: ["applinks:app.backreserve.example"]` and an Android intent filter with
`autoVerify: true` for `/b/` and `/bestellung/`. For **verification** the web host must serve (HTTPS, no redirects,
`Content-Type: application/json`) – these files belong to the web deployment (`apps/web`), not to this app:

`https://app.backreserve.example/.well-known/assetlinks.json`
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "de.backreserve.app",
    "sha256_cert_fingerprints": ["<SHA-256 of the Play App Signing certificate>"]
  }
}]
```
Get the fingerprint from Play Console → *App integrity → App signing* (and from `eas credentials` for internally
distributed builds). Verify: `adb shell pm get-app-links de.backreserve.app` → `verified`, or
`adb shell pm verify-app-links --re-verify de.backreserve.app`.

`https://app.backreserve.example/.well-known/apple-app-site-association` (no file extension)
```json
{
  "applinks": {
    "details": [{
      "appIDs": ["<TEAM_ID>.de.backreserve.app"],
      "components": [
        { "/": "/b/*" },
        { "/": "/bestellung/*" }
      ]
    }]
  }
}
```
Apple fetches it via its CDN (`https://app-site-association.cdn-apple.com/a/v1/app.backreserve.example`); test on a
device by long-pressing a link in Notes/Mail. Preview/dev builds use different bundle ids (`.preview`, `.dev`) – add
them to both files if links should open those builds.

## 9. Build and submission

Prerequisites: Apple Developer Program membership (organisation account, D-U-N-S), Google Play Console account
(organisation verification), App Store Connect app record and Play Console app created with the final ids.

```bash
cd apps/mobile
npm ci
npm run typecheck && npm run lint && npm test      # must be green
npx expo-doctor
npx eas-cli@latest login
npx eas-cli@latest init                             # once; note the project id → EAS_PROJECT_ID

# Internal test builds
npx eas-cli@latest build --profile development --platform android   # dev client APK
npx eas-cli@latest build --profile preview --platform android       # installable APK against staging API
npx eas-cli@latest build --profile preview --platform ios           # ad-hoc (register devices: eas device:create)

# Store builds (EAS manages keystore / certificates / provisioning profiles; never commit them)
npx eas-cli@latest build --profile production --platform all

# Submission
npx eas-cli@latest submit --profile production --platform ios       # → TestFlight / App Store Connect
npx eas-cli@latest submit --profile production --platform android   # → Play internal track (draft)
```

Notes:
- Google Play: the very first AAB usually has to be uploaded manually in the Play Console; afterwards `eas submit`
  works with a Google service account JSON (configure via `eas credentials`, keep the key out of git).
- Roll out via TestFlight (internal/external testers) and the Play *internal testing* → *closed testing* → *production* tracks.
- OTA updates (`eas update`) can ship JS-only fixes on the `production` channel; native changes need a new build.
- Signing material (`*.jks`, `*.p8`, `*.p12`, `*.mobileprovision`) is git-ignored and must stay in EAS / a secret store.

## 10. Pre-submission checklist

- [ ] Placeholders in section 1 replaced; production API reachable over HTTPS
- [ ] Version / build number bumped
- [ ] Tested on real devices: iPhone (current iOS), Android phone (Android 10+), one tablet; large font sizes; bright light
- [ ] Customer flow end-to-end on production: reserve, confirmation e-mail link opens the app, cancel, reminder
- [ ] Staff flow: login, tenant switch, "Heute", QR scan + manual entry, collect, "Problem melden", logout
- [ ] Privacy policy, imprint, support page live and linked in both listings
- [ ] Data safety form and App Privacy answers match section 6
- [ ] Review account and notes entered
- [ ] Screenshots and feature graphic uploaded
- [ ] `assetlinks.json` / `apple-app-site-association` deployed and verified

**Reminder: nothing has been submitted to any store yet.**
