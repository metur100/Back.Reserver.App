# Store release – BackReserve mobile app (iOS & Android)

> **Status (2026-11-02): The app has NOT been submitted to the Apple App Store or Google Play.**
> Android is ready for a first upload: package `com.certidevelopment.backreserve`, a locally signed release AAB
> 1.0.0 (versionCode 2) against the production API, the upload keystore, Play graphics from real emulator captures of
> the release build, and a copy-paste sheet for every Play Console field in
> [`apps/mobile/store-assets/android/GOOGLE-PLAY-CONSOLE.md`](../apps/mobile/store-assets/android/GOOGLE-PLAY-CONSOLE.md).
> iOS: listing texts, review notes, age rating / privacy answers and iPhone 6.9" / 6.3" / iPad 13" screenshots are in
> [`apps/mobile/store-assets/ios/APP-STORE-CONNECT.md`](../apps/mobile/store-assets/ios/APP-STORE-CONNECT.md); no iOS
> build exists yet (EAS Build needed, no Mac).
> Done on 2026-11-02 (ships with versionCode/build 3, not built yet): complete privacy policy and imprint, account
> deletion page and support page on the landing site; privacy/imprint links inside the app (Apple 5.1.1(i));
> `ios.privacyManifests`; `SYSTEM_ALERT_WINDOW` blocked; review bakery inventory extended to 2027-01-31.
> Still open: rebuild the AAB (versionCode 3) and recapture screenshots, Play Console / App Store Connect app records,
> `assetlinks.json` / `apple-app-site-association`, EAS project, push.

The app is an Expo (SDK 57) / React Native app in `apps/mobile` with Expo Router. It is used by **customers**
(reserve bakery products without an account, pay at pickup) and by **bakery staff** (sign in, process today's orders,
record pickups by code or QR scan). It talks to the same BackReserve API as the web app.

---

## 1. Identifiers and remaining placeholders

| What | Where | Value |
|---|---|---|
| iOS bundle identifier / Android package | `apps/mobile/app.config.ts` (`BUNDLE_ID`) | `com.certidevelopment.backreserve` (preview/dev builds get `.preview` / `.dev` suffixes so all three can be installed side by side) |
| Universal / App Link domain | `app.config.ts` (`UNIVERSAL_LINK_HOST` or env `UNIVERSAL_LINK_HOST`) | `reserver-app.gentlegroup.de` (the web app) |
| Production API | `eas.json` → `build.production.env.EXPO_PUBLIC_API_URL` (and the `production` default in `app.config.ts`) | `https://backreserve.runasp.net` |
| Preview builds API | `eas.json` → `build.preview.env.EXPO_PUBLIC_API_URL` | `https://backreserve.runasp.net` (there is no separate staging API) |
| EAS project id / owner | env `EAS_PROJECT_ID`, `EAS_OWNER` (read in `app.config.ts`) | **not set** |
| App Store Connect app id | `eas.json` → `submit.production.ios.ascAppId` | **placeholder** `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` |
| Website / marketing URL | Store listings | `https://reserver.gentlegroup.de/` (landing page, repo `metur100/Back.Reserver.Landing`; HTTP 200 on 2026-11-02) |
| Privacy policy URL | Store listings | `https://reserver.gentlegroup.de/datenschutz.html` – complete (2026-11-02), linked in the app |
| Imprint (Impressum) | Store listings (required for German publishers) | `https://reserver.gentlegroup.de/impressum.html` – complete (operator Berk-Can Atesoglu, Gentle Group Studios, Wuppertal) |
| Account/data deletion URL | Play Data safety | `https://reserver.gentlegroup.de/konto-loeschen.html` (linked in the app under Team → Konto) |
| Support URL | App Store Connect (required) | `https://reserver.gentlegroup.de/support.html` |
| Support e-mail | Store listings | `certidevelopment@gmail.com` (developer account contact) |

Release builds only talk to **HTTPS** APIs: Android release builds block cleartext HTTP and iOS ATS blocks it as well.
`http://…:5280` only works in development builds / Expo Go.

## 2. Versioning

`eas.json` uses `"appVersionSource": "local"`. Before every store build bump in `app.config.ts`:

- `VERSION` (user-visible, e.g. `1.0.1`) → `version` on both platforms
- `BUILD_NUMBER` (integer, must increase for every upload) → iOS `buildNumber` and Android `versionCode`

Current: `VERSION = '1.0.0'`, `BUILD_NUMBER = 3` (versionCode 1 was built on 2026-10-29 but never uploaded; the
2026-11-02 bundle uses 2; 3 is for the next bundle with the in-app legal links). Signed bundles are kept next to the key as
`C:\Users\TurkesMedin\keystore\backreserve\backreserve-<version>-<versionCode>-release.aab`.

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

Google Play listing graphics are in `apps/mobile/store-assets/android/`: `icon-512.png` (512×512, opaque),
`feature-graphic-1024x500.png` (24-bit PNG, no transparency), 8 phone screenshots (1080×1920) and 8 screenshots each
for 7" (1200×2134) and 10" tablets (1620×2880). App Store screenshots and `app-icon-1024.png` are in
`apps/mobile/store-assets/ios/` (§5).

## 4. Store listings

All store texts (names, subtitles, short/full descriptions, keywords, promotional text, release notes, review notes),
category, contact and URLs, age-rating and privacy answers are maintained in two copy-paste sheets – edit them there,
not here:

- Google Play: [`apps/mobile/store-assets/android/GOOGLE-PLAY-CONSOLE.md`](../apps/mobile/store-assets/android/GOOGLE-PLAY-CONSOLE.md)
- App Store Connect: [`apps/mobile/store-assets/ios/APP-STORE-CONNECT.md`](../apps/mobile/store-assets/ios/APP-STORE-CONNECT.md)

Languages: German (de-DE) is the primary and only app language; both sheets also contain an optional en-US listing.
Every length-limited field is a `(max N)` block; check them with `cd apps/mobile && node scripts/check-store-texts.mjs`
(exit code 1 if a text is over its limit). Summary: Play title `BackReserve – Vorbestellen`, iOS name `BackReserve`,
iOS subtitle `Beim Bäcker vorbestellen`, category Food & Drink (iOS secondary: Shopping), rating 4+ / USK 0, free, no
in-app purchases. Review account: `berkcan@gentlegroup.de` (password in GentleHub → project → Testfirma-Login; never
commit it), owner of the review bakery “Bäckerei Berkcan” (`baeckerei-berkcan`, details in GOOGLE-PLAY-CONSOLE.md §7).
Accounts are not created in the app (bakeries register on the web, staff are invited), therefore the in-app account
deletion requirement (App Store Guideline 5.1.1(v)) does not apply; still publish an account-deletion request page for
the Play listing (see 6).

## 5. Screenshots

All store screenshots (2026-11-02) are real captures of the **release build** on the Android emulator
(AVD `Pixel_10_Pro_XL`) against the production API, logged in as the review account / browsing the review bakery,
in Android demo mode (clock 09:30, full battery and Wi-Fi, no notifications). Raw captures are framed with a German
headline by `apps/mobile/scripts/store-screenshots.mjs` (needs `@napi-rs/canvas@0.1.65` via `NODE_PATH`; fonts
Georgia Bold / Segoe UI Semibold). Screens: 1 bakery & pickup day · 2 products · 3 pickup slot · 4 pickup code + QR ·
5 “Meine Bestellungen” · 6 staff “Heute” · 7 staff order detail · 8 staff pickup by code.

Capture sizes (`adb shell wm size` / `wm density`; reset both and `demo exit` afterwards):

| Set | Emulator screen | Logical size | Profile / crop |
|---|---|---|---|
| Play phone | native 1344×2992 @ 480 dpi | 448×997 dp | `phone` (status bar kept, demo mode) |
| Play 7" tablet | 1200×1920 @ 320 dpi | 600×960 dp | `tablet-7` |
| Play 10" tablet | 1600×2560 @ 320 dpi | 800×1280 dp | `tablet-10` |
| App Store iPhone 6.9" / 6.3" | 1320×2868 @ 480 dpi | 440×956 dp | `iphone-6.9`, `iphone-6.3` with status/nav bar cropped |
| App Store iPad 13" | 2064×2752 @ 320 dpi | 1032×1376 dp | `ipad-13` with status/nav bar cropped |

| Store | Device class | Size (portrait) | Delivered |
|---|---|---|---|
| App Store | iPhone 6.9" | 1320×2868 | 8 in `store-assets/ios/iphone-6.9/` (**required**; scaled down for smaller iPhones) |
| App Store | iPhone 6.3" | 1206×2622 | 8 in `store-assets/ios/iphone-6.3/` (optional) |
| App Store | iPad 13" (`supportsTablet: true`) | 2064×2752 | 8 in `store-assets/ios/ipad-13/` (**required** because iPad is supported) |
| Google Play | Phone | 1080×1920 (9:16; long side ≤ 2× short side) | 8 in `store-assets/android/phone-screenshots/` |
| Google Play | 7" tablet | 1200×2134 (9:16) | 8 in `store-assets/android/tablet-7-screenshots/` |
| Google Play | 10" tablet | 1620×2880 (9:16, sides ≥ 1080 px) | 8 in `store-assets/android/tablet-10-screenshots/` |

JPEG (opaque, no alpha), no device frames that misrepresent the app (the plain dark bezel is generic).

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
      support; staff accounts: via bakery owner or support). URL: `https://reserver.gentlegroup.de/konto-loeschen.html`
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
- [x] Privacy manifest: `ios.privacyManifests` in `app.config.ts` declares the collected data types above and the
      required-reason APIs (UserDefaults, file timestamps, boot time, disk space); verify after the first iOS upload.
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
2. **Android (FCM v1):** create a Firebase project with package `com.certidevelopment.backreserve`, download `google-services.json`
   and reference it via `android.googleServicesFile` in `app.config.ts` (do not commit secrets beyond this public
   config file), then upload a Google service account key for FCM v1: `eas credentials` → Android → *Google Service Account Key for Push Notifications (FCM V1)*.
3. **iOS (APNs):** `eas credentials` → iOS → *Push Notifications: Manage your Apple Push Notifications Key* (EAS can create the key in your Apple Developer account). Set the notifications plugin `mode` to `production` (already done for `APP_ENV=production`).
4. Backend: add e.g. `POST /api/v1/admin/devices {expoPushToken, platform}` (+ delete on logout), send via the Expo Push API or FCM/APNs directly; then call it from `registerForPushNotifications()` and the logout flow (marked `TODO(backend milestone)`).
5. Update the privacy declarations (device identifiers).

## 8. Deep links, Universal Links and App Links

Configured routes:
- `backreserve://b/{slug}` → bakery page
- `backreserve://bestellung/{ref}?t={token}` → order (token is saved to "Meine Bestellungen")
- `https://reserver-app.gentlegroup.de/b/{slug}` and `https://reserver-app.gentlegroup.de/bestellung/{ref}#t={token}` (the
  format used in confirmation e-mails). Fragments are not passed to routes, so `src/app/+native-intent.tsx` rewrites
  `#t=` into `?t=`.

`app.config.ts` declares `ios.associatedDomains: ["applinks:reserver-app.gentlegroup.de"]` and an Android intent filter with
`autoVerify: true` for `/b/` and `/bestellung/`. For **verification** the web host must serve (HTTPS, no redirects,
`Content-Type: application/json`) – these files belong to the web deployment (`apps/web`), not to this app:

`https://reserver-app.gentlegroup.de/.well-known/assetlinks.json`
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.certidevelopment.backreserve",
    "sha256_cert_fingerprints": ["<SHA-256 of the Play App Signing certificate>"]
  }
}]
```
Get the fingerprint from Play Console → *App integrity → App signing* (and from `eas credentials` for internally
distributed builds). Verify: `adb shell pm get-app-links com.certidevelopment.backreserve` → `verified`, or
`adb shell pm verify-app-links --re-verify com.certidevelopment.backreserve`.

`https://reserver-app.gentlegroup.de/.well-known/apple-app-site-association` (no file extension)
```json
{
  "applinks": {
    "details": [{
      "appIDs": ["<TEAM_ID>.com.certidevelopment.backreserve"],
      "components": [
        { "/": "/b/*" },
        { "/": "/bestellung/*" }
      ]
    }]
  }
}
```
Apple fetches it via its CDN (`https://app-site-association.cdn-apple.com/a/v1/reserver-app.gentlegroup.de`); test on a
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

### Local signed build (Android, without EAS) – how the 1.0.0 AABs were made

`plugins/withAndroidReleaseSigning.js` adds a `release` signing config that reads `BACKRESERVE_UPLOAD_STORE_FILE`,
`BACKRESERVE_UPLOAD_STORE_PASSWORD`, `BACKRESERVE_UPLOAD_KEY_ALIAS`, `BACKRESERVE_UPLOAD_KEY_PASSWORD` from environment
variables or Gradle properties (e.g. `%USERPROFILE%\.gradle\gradle.properties`); without them release builds fall back to
the debug key (never upload those). `plugins/withLocalCmakeDir.js` writes `ANDROID_CMAKE_DIR` into
`android/local.properties` – needed on Windows because the SDK's CMake 3.22 ninja fails on long paths.

Upload key: `C:\Users\TurkesMedin\keystore\backreserve\backreserve-upload.jks`, alias `backreserve-upload`,
password in `C:\Users\TurkesMedin\keystore\backreserve-password.txt` (never commit; back both up). The file is a
small labelled note, not a bare password: use the value after the colon on its password line (store and key password
are identical) and check it with `keytool -list -keystore … -storepass:env KP` before building.

```bash
cd apps/mobile
export APP_ENV=production EXPO_PUBLIC_API_URL=https://backreserve.runasp.net
export ANDROID_CMAKE_DIR="$ANDROID_HOME/cmake/3.31.6"            # Windows
export BACKRESERVE_UPLOAD_STORE_FILE=C:/Users/TurkesMedin/keystore/backreserve/backreserve-upload.jks
export BACKRESERVE_UPLOAD_KEY_ALIAS=backreserve-upload
export BACKRESERVE_UPLOAD_STORE_PASSWORD=… BACKRESERVE_UPLOAD_KEY_PASSWORD=…   # from the password file
npx expo prebuild --platform android --clean --no-install
cd android && ./gradlew app:bundleRelease app:assembleRelease
# → app/build/outputs/bundle/release/app-release.aab (+ apk/release/app-release.apk for the emulator screenshots)
# the build log must NOT contain "signed with the DEBUG key"
jarsigner -verify app/build/outputs/bundle/release/app-release.aab             # "jar verified"
keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab   # CN=Medin Turkes, SHA-256 38:44:AF:…:C6:FD
# aapt2 dump badging app/build/outputs/apk/release/app-release.apk → package com.certidevelopment.backreserve + versionCode
cp app/build/outputs/bundle/release/app-release.aab \
   C:/Users/TurkesMedin/keystore/backreserve/backreserve-<version>-<versionCode>-release.aab
```
`expo prebuild` rewrites the `android`/`ios` scripts in `package.json` (`expo run:*`) – revert that before committing.
A release build needs ~2.5 GB in `android/app/build`; delete that folder once the AAB is copied and verified.
The running app shows the API it talks to under Team-Bereich → Konto ("Server: https://backreserve.runasp.net").
`android/` is generated and git-ignored. Bump `VERSION` / `BUILD_NUMBER` in `app.config.ts` for every upload.

## 10. Pre-submission checklist

- [x] Android package / link host / production API set (section 1); production API reachable over HTTPS
- [ ] Remaining placeholders in section 1 (EAS project, ASC app id, legal pages, deletion URL, support URL)
- [x] Version 1.0.0 / build 2 – signed Android AAB built and verified 2026-11-02 (see GOOGLE-PLAY-CONSOLE.md §2)
- [x] Privacy policy linked inside the app (Apple 5.1.1(i)) and `ios.privacyManifests` declared (APP-STORE-CONNECT.md §7) – build 3
- [x] Review bakery inventory extended to 2027-01-31 – [ ] trial date 2026-11-28 unchanged (no supported way; not enforced by the backend)
- [ ] Tested on real devices: iPhone (current iOS), Android phone (Android 10+), one tablet; large font sizes; bright light
- [ ] Customer flow end-to-end on production: reserve, confirmation e-mail link opens the app, cancel, reminder
- [ ] Staff flow: login, tenant switch, "Heute", QR scan + manual entry, collect, "Problem melden", logout
- [x] Privacy policy, imprint, support and account-deletion pages live – [ ] entered in both listings
- [ ] Data safety form and App Privacy answers match section 6
- [x] Review account created (berkcan@gentlegroup.de, review bakery with sample data) – [ ] notes entered in the consoles
- [x] Store texts for both stores within limits (`node scripts/check-store-texts.mjs`) – [ ] entered in the consoles
- [x] Play screenshots (phone, 7", 10"), icon, feature graphic; App Store screenshots (6.9", 6.3", iPad 13") – [ ] uploaded
- [ ] `assetlinks.json` / `apple-app-site-association` deployed and verified

**Reminder: nothing has been submitted to any store yet.** Field-by-field sheets:
`apps/mobile/store-assets/android/GOOGLE-PLAY-CONSOLE.md` and `apps/mobile/store-assets/ios/APP-STORE-CONNECT.md`.
