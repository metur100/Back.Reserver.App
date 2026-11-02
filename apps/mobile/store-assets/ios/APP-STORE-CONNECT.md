# Apple App Store – App Store Connect copy-paste sheet (BackReserve 1.0.0)

Status as of 2026-11-02: **nothing has been submitted; no iOS build exists yet** (no Mac – build with EAS, see §9).
Bundle id `com.certidevelopment.backreserve`, developer Medin Turkes · Certi Development, contact
`certidevelopment@gmail.com`. Primary language **German (de-DE)** – the app UI is German only (`src/i18n/de.ts`,
`CFBundleLocalizations: ['de']`); an English (U.S.) localization of the listing is optional (texts below).
Texts match the app as of `main` on 2026-11-02 and are identical in substance to the Google Play listing
([`../android/GOOGLE-PLAY-CONSOLE.md`](../android/GOOGLE-PLAY-CONSOLE.md)).

Character limits are checked with `node scripts/check-store-texts.mjs` (run in `apps/mobile`; counts every `(max N)`
block in this file in Unicode code points). Results are in §10.

Related: [docs/STORE_RELEASE.md](../../../../docs/STORE_RELEASE.md) (privacy rationale §6, push §7, Universal Links §8,
checklist §10).

> **Before submitting for review:**
> 1. Privacy policy and imprint on `reserver.gentlegroup.de` are **placeholders** (HTTP 200, content "[Angaben werden
>    ergänzt]"). Apple checks the privacy policy URL.
> 2. There is **no support/contact page** on the landing site (`/support.html` → 404, the start page has no contact
>    details). App Store Connect requires a Support URL that leads to contact information – add a support/contact page
>    (repo `metur100/Back.Reserver.Landing`) and enter it below instead of the interim start page.
> 3. Guideline 5.1.1(i) expects the privacy policy to be reachable **inside the app** as well; the app currently only
>    mentions "Datenschutzhinweise" in the checkout consent text without a link. Add a link (e.g. on the start screen
>    and next to the checkout consent) in the next build.
> 4. `apple-app-site-association` is not deployed on `reserver-app.gentlegroup.de` yet (STORE_RELEASE.md §8); not a
>    review blocker.

## 1. New app (Apps → + → New App)

| Field | Value |
|---|---|
| Platforms | iOS |
| Name | `BackReserve` |
| Primary language | German |
| Bundle ID | `com.certidevelopment.backreserve` (register it under Certificates, IDs & Profiles first, or let EAS create it) |
| SKU | `backreserve-ios` |
| User access | Full access |

Then put the numeric Apple ID of the app into `apps/mobile/eas.json` → `submit.production.ios.ascAppId` (currently
`REPLACE_WITH_APP_STORE_CONNECT_APP_ID`).

## 2. App information (General → App Information)

| Field | Value |
|---|---|
| Category | Primary **Food & Drink**, secondary **Shopping** |
| Content rights | "Does your app contain, show, or access third-party content?" → **Yes** – product names, photos, prices and allergen data are supplied by the bakeries that use BackReserve; confirm that you have the rights (granted by the bakeries under the BackReserve terms – make sure the published terms say so) |
| Age rating | see §6 (expected result **4+**) |
| EU Digital Services Act | **Trader** – name, address, e-mail, phone are shown on the EU storefronts. Use the same data as the Impressum once its placeholder is filled in |
| License agreement | Apple standard EULA |

### de-DE

Name (max 30):
```text
BackReserve
```

Subtitle (max 30):
```text
Beim Bäcker vorbestellen
```

Privacy policy URL:
```text
https://reserver.gentlegroup.de/datenschutz.html
```

### en-US (optional: add localization English (U.S.))

Name (max 30):
```text
BackReserve
```

Subtitle (max 30):
```text
Pre-order at your bakery
```

Privacy policy URL (German page – there is no English version):
```text
https://reserver.gentlegroup.de/datenschutz.html
```

## 3. Pricing and availability

- Price: **Free** (USD 0). No in-app purchases. Customers reserve **physical goods** and pay in the shop
  (guideline 3.1.5(a)); bakery subscriptions are not sold or linked in the app.
- Availability: start with **Germany** (same as Google Play; add Austria/Switzerland later if needed).
- iPad: **yes** – `ios.supportsTablet: true`, so App Store Connect requires iPad screenshots (provided, §4).
  Mac (Apple silicon) / Apple Vision Pro: untick unless tested.

## 4. Version page (iOS App → 1.0 Prepare for Submission)

### de-DE

Promotional text (max 170):
```text
Brötchen, Kuchen & Frühstück vorab reservieren, mit Abholcode an der Theke abholen und vor Ort bezahlen. Ohne Kundenkonto, ohne Werbung, ohne Tracking.
```

Keywords (max 100):
```text
Bäckerei,Brötchen,Brot,Kuchen,Torte,Croissant,Frühstück,Abholung,Abholcode,reservieren,Bestellung
```

Description (max 4000):
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

Support URL (interim – replace with a support/contact page, see the note at the top):
```text
https://reserver.gentlegroup.de/
```

Marketing URL:
```text
https://reserver.gentlegroup.de/
```

### en-US (optional)

Promotional text (max 170):
```text
Reserve rolls, cakes & breakfast in advance, collect them with a pickup code at the counter and pay in the shop. No customer account, no ads, no tracking.
```

Keywords (max 100):
```text
bakery,preorder,bread,rolls,cake,croissant,breakfast,pickup,reservation,click and collect,baker
```

Description (max 4000):
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

Support URL / Marketing URL: same as de-DE.

### Shared version fields

| Field | Value |
|---|---|
| Version | `1.0.0` (`VERSION` in `apps/mobile/app.config.ts`); build number `2` (`BUILD_NUMBER` → `ios.buildNumber`, same counter as Android `versionCode`) |
| Copyright | `2026 Medin Turkes` |
| Routing app coverage file | none |
| Sign in with Apple | not offered (staff use e-mail/password of their bakery account, no third-party login → guideline 4.8 does not apply) |
| Release | Manually release this version |

"What's New in This Version" is not shown for the first version. For the next update (max 4000), e.g.:
```text
<de-DE> Fehlerbehebungen und Verbesserungen.
<en-US> Bug fixes and improvements.
```

### Screenshots (App Store Connect → Previews and Screenshots)

Real captures of the Android **release build** (versionCode 2, same JavaScript bundle as the iOS app) against the
production API with the review bakery “Bäckerei Berkcan” (fictitious customers, `@example.com` addresses), captured at
the iPhone / iPad logical screen widths (440 dp iPhone, 1032 dp iPad); the Android status and navigation bars are
cropped away. Same captions and framing as the Play set. Regenerate with `scripts/store-screenshots.mjs` (profiles
`iphone-6.9`, `iphone-6.3`, `ipad-13`; STORE_RELEASE.md §5). Captions are German – use the same set for en-US or leave
en-US empty (falls back to the primary language).

| Display size | Folder | Files | Pixels |
|---|---|---|---|
| iPhone 6.9" | `store-assets/ios/iphone-6.9/` | 8 × JPEG (no alpha) | 1320 × 2868 |
| iPhone 6.3" | `store-assets/ios/iphone-6.3/` | 8 × JPEG (no alpha) | 1206 × 2622 |
| iPad 13" | `store-assets/ios/ipad-13/` | 8 × JPEG (no alpha) | 2064 × 2752 |

Order: 01 Bäckerei & Abholtag · 02 Produkte · 03 Abholzeit · 04 Abholcode + QR · 05 Meine Bestellungen · 06 Team
„Heute“ · 07 Bestelldetails · 08 Abholung per Code.
Upload the 6.9" set (App Store Connect scales it down for smaller iPhones); the 6.3" set is optional. The iPad set is
required because the app supports iPad. App icon: `store-assets/ios/app-icon-1024.png` (1024 × 1024, opaque, copy of
`assets/images/icon.png`) – it comes from the build, not uploaded separately.

## 5. App Review information

| Field | Value |
|---|---|
| Sign-in required | **Yes** (staff area only) |
| User name | `berkcan@gentlegroup.de` |
| Password | from GentleHub → project → Testfirma-Login (never commit it – this repository is public) |
| Contact first / last name | Medin / Turkes |
| Contact phone | **owner to fill** (required by App Store Connect) |
| Contact email | `certidevelopment@gmail.com` |
| Attachment | none |

Notes (max 4000):
```text
BackReserve lets customers reserve bakery products (bread, rolls, cakes) for pickup at a local bakery and lets bakery staff process these reservations. Customers pay in the shop when they collect their order; there is no payment in the app and no digital content.

CUSTOMER FLOW (no account needed)
1. On the start screen enter "baeckerei-berkcan" in "Bäckerei-Link oder Kürzel" and tap "Öffnen". This is a fictitious demo bakery with sample products.
2. Choose a location ("Standort") and a pickup day ("Abholtag"), add products, tap the basket bar, choose a pickup time slot and enter any name and e-mail address (e.g. test@example.com).
3. Tap "Verbindlich reservieren": the app shows a pickup code and QR code. The reservation appears under "Meine Bestellungen" on the start screen and can be cancelled there until the bakery's cancellation deadline.
4. "Erinnerung 1 Stunde vorher" schedules a local notification on the device only (permission is requested at that moment).

STAFF FLOW (sign-in required)
Start screen > "Zum Team-Bereich" > sign in with the demo account above (owner of the demo bakery, e-mail + password, no 2FA).
- "Heute": today's orders grouped by pickup time; open an order to prepare it, mark it ready or report a pickup problem.
- "Abholung": enter a pickup code from the list (format BR-XXXXXX) or scan a customer's QR code. The camera is used only for this scan; frames are processed on the device and never stored or uploaded.
- "Konto": bakery, role, sign out.
Please do not cancel or delete the demo bakery's data; placing additional test orders is fine.

OTHER NOTES
- Accounts cannot be created in the app: bakeries register on the web and invite their staff there, so there is no in-app sign-up. Staff accounts are removed by the bakery owner on the web or on request via certidevelopment@gmail.com.
- No ads, no tracking, no analytics SDKs. Push notifications for staff are not active yet (no server component); customer reminders are local notifications.
- The UI is German only.
- Backend: https://backreserve.runasp.net (production).
```

## 6. Age rating (App Information → Age Rating → Edit)

Apple's age-rating questionnaire (current version with 13+/16+/18+ tiers). Answer:

| Section | Question | Answer |
|---|---|---|
| Features | Parental controls | No |
| | Age assurance | No |
| | Unrestricted web access | No – the app has no browser; it only opens `tel:` / `mailto:` links and the system settings |
| | User-generated content (shared with other users/the public) | No – a reservation and its optional note go only to the bakery; nothing is published |
| | Messaging and chat | No |
| | Advertising | No |
| | Social-media capabilities | No |
| Mature themes | Profanity, horror/fear, alcohol/tobacco/drugs, mature/suggestive themes | None (product descriptions may list ingredients such as "Kirschwasser" in a Black Forest cake – an ingredient, not alcohol use or promotion) |
| Medical / wellness | Medical or treatment information, health topics | None (allergen labels are product information supplied by the bakery) |
| Sexuality / nudity | all | None |
| Violence | cartoon, realistic, prolonged/graphic, guns | None |
| Chance-based activities | Gambling, simulated gambling, contests, loot boxes | None / No |

Expected rating: **4+**. Made for Kids: **No**.

## 7. App Privacy (App Store Connect → App Privacy)

Privacy policy URL: `https://reserver.gentlegroup.de/datenschutz.html`. Reasoning: STORE_RELEASE.md §6.

"Do you or your third-party partners collect data from this app?" → **Yes**. For every type below: **Linked to the
user: Yes · Used for tracking: No · Purpose: App Functionality** only.

| Category | Data type | Collected |
|---|---|---|
| Contact Info | Name | Yes (customer first/last name for the reservation; staff account name) |
| Contact Info | Email Address | Yes (reservation confirmation; staff sign-in) |
| Contact Info | Phone Number | Yes (optional, or required by the bakery) |
| Purchases | Purchase History | Yes (the reservations/orders) |
| User Content | Other User Content | Yes (optional order note, pickup-problem notes by staff) |
| Identifiers | User ID | Yes (staff accounts only) |

Not collected: Health & Fitness, Financial Info (no payment data), Location, Sensitive Info, Contacts, Emails or Text
Messages, Photos or Videos (camera frames stay on the device), Audio, Browsing/Search History, Usage Data,
Diagnostics, Device ID (the Expo push token is not sent to any server in 1.0.0 – revisit when server push is added),
Advertising Data, Other Data. Tracking: **No**.

Privacy manifest: `app.config.ts` does not declare `ios.privacyManifests` yet; the Expo SDK 57 modules ship their own
`PrivacyInfo.xcprivacy` (required-reason APIs). **Before the first iOS build** add `ios.privacyManifests` with
`NSPrivacyTracking: false` and `NSPrivacyCollectedDataTypes` for Name, Email Address, Phone Number, Purchase History,
Other User Content and User ID (linked, not tracking, purpose App Functionality) so the manifest matches the answers
above, and check App Store Connect's validation e-mail after the first upload for missing required reasons.

## 8. Compliance items

| Topic | Answer / implementation | Status |
|---|---|---|
| Export compliance | Only standard HTTPS through the OS → exempt. `ITSAppUsesNonExemptEncryption: false` is set in `app.config.ts`, so App Store Connect does not ask per build | set |
| Account deletion (5.1.1(v)) | Not applicable – accounts cannot be created in the app (see review notes). Deletion on request via `certidevelopment@gmail.com` / bakery owner; publish a deletion page (see top) | page missing |
| Privacy policy in the app (5.1.1(i)) | Not linked in the app yet | **open – next build** |
| Camera permission text | `NSCameraUsageDescription`: "BackReserve verwendet die Kamera nur, um Abholcodes (QR-Codes) von Reservierungen an der Theke zu scannen." | set |
| Notifications | Requested in context only (reminder button; staff "Gerät registrieren"). No server push in 1.0.0 | set |
| Tracking (ATT) | not used | – |
| Physical goods / payments (3.1.5(a)) | Reservations of physical goods, paid in the shop; no IAP needed | – |
| Build requirements | uploads must be built with the current Xcode/iOS SDK; Expo SDK 57 via EAS Build uses a compliant image | via EAS |

## 9. Build path (blocked on the owner)

- No macOS/Xcode on the build machine → **EAS Build (cloud)** + **EAS Submit**; `eas.json` profile `production`
  (`APP_ENV=production`, `EXPO_PUBLIC_API_URL=https://backreserve.runasp.net`, `appVersionSource: local`).
- Needs the **Apple Developer Program** (99 USD/year), an Expo account and `npx eas-cli@latest init` (sets
  `EAS_PROJECT_ID`, STORE_RELEASE.md §7).
- [ ] **Owner:** enrol, create the app record (§1), `cd apps/mobile && npx eas-cli@latest build -p ios --profile production`,
      then `npx eas-cli@latest submit -p ios --profile production` → TestFlight → submit for review.

## 10. Character counts (`node scripts/check-store-texts.mjs`, 2026-11-02)

| Field | Limit | de-DE | en-US (optional) |
|---|---|---|---|
| Name | 30 | 11 | 11 |
| Subtitle | 30 | 24 | 24 |
| Promotional text | 170 | 151 | 154 |
| Keywords (comma-separated, no spaces after commas) | 100 | 97 | 95 |
| Description | 4000 | 2049 | 1855 |
| What's New example (shared) | 4000 | 80 | – |
| Review notes (shared, English) | 4000 | 2074 | – |
