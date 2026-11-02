// Composes store screenshots (opaque JPEG, no alpha) from raw emulator captures of the release build.
//
// Usage (needs @napi-rs/canvas, e.g. in a scratch folder: npm i @napi-rs/canvas@0.1.65, then NODE_PATH=<scratch>/node_modules):
//   node scripts/store-screenshots.mjs <srcDir> <outDir> <profile> [cropTop] [cropBottom]
//   profiles: phone | tablet-7 | tablet-10 (Google Play) · iphone-6.9 | iphone-6.3 | ipad-13 (App Store)
//   e.g. node scripts/store-screenshots.mjs raw/phone store-assets/android/phone-screenshots phone
//        node scripts/store-screenshots.mjs raw/iphone store-assets/ios/iphone-6.9 iphone-6.9 141 72
// cropTop / cropBottom (source pixels) cut the Android status bar and navigation bar off the raw capture – required
// for the App Store sets, which must not show Android system UI. Missing source files are skipped.
// Fonts: Georgia Bold (the app's serif on iOS) for the headline, Segoe UI Semibold for the caption (Windows fonts;
// pass FONT_DIR to use another folder with georgiab.ttf / seguisb.ttf).
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url); // honours NODE_PATH, unlike ESM imports
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const [, , srcDir, outDir, profile = 'phone', cropTopArg = '0', cropBottomArg = '0'] = process.argv;
if (!srcDir || !outDir) throw new Error('usage: store-screenshots.mjs <srcDir> <outDir> <profile> [cropTop] [cropBottom]');
const cropTop = Number(cropTopArg);
const cropBottom = Number(cropBottomArg);
const fontDir = process.env.FONT_DIR || 'C:/Windows/Fonts';
GlobalFonts.registerFromPath(`${fontDir}/georgiab.ttf`, 'BRSerif');
GlobalFonts.registerFromPath(`${fontDir}/seguisb.ttf`, 'BRSans');
mkdirSync(outDir, { recursive: true });

// [raw file name, headline, caption] – order = store order.
const shots = [
  ['c1-bakery', 'Beim Bäcker vorbestellen', 'Bäckerei öffnen, Standort und Abholtag wählen'],
  ['c2-products', 'Sehen, was noch da ist', 'Verfügbarkeit, Preise und Allergene'],
  ['c3-slot', 'Abholzeit aussuchen', 'Freie Zeitfenster auf einen Blick'],
  ['c4-confirmation', 'Abholcode statt Warten', 'QR-Code an der Theke zeigen, vor Ort bezahlen'],
  ['c5-my-orders', 'Meine Bestellungen', 'Status ansehen und rechtzeitig stornieren'],
  ['s1-today', 'Für Bäckerei-Teams', 'Alle Bestellungen des Tages nach Abholzeit'],
  ['s2-order', 'Vorbereiten per Fingertipp', 'Produkte, Anmerkung und Verlauf je Bestellung'],
  ['s3-pickup', 'Abholung in Sekunden', 'Abholcode eingeben oder QR-Code scannen'],
];

// Output sizes. Play: phone 9:16; tablets 9:16 with sides ≥ 1080 px. App Store: exact pixel sizes per display class.
const sizes = {
  phone: [1080, 1920],
  'tablet-7': [1200, 2134],
  'tablet-10': [1620, 2880],
  'iphone-6.9': [1320, 2868],
  'iphone-6.3': [1206, 2622],
  'ipad-13': [2064, 2752],
};
if (!sizes[profile]) throw new Error(`unknown profile ${profile}`);
const [W, H] = sizes[profile];
const s = W / 1080; // layout scale by width
const wide = W / H > 0.6; // iPad: scale captions by height so they stay proportionate
const t = wide ? H / 1920 : s;

function fitFont(ctx, text, family, size, maxWidth) {
  let px = size;
  ctx.font = `${Math.round(px)}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && px > 10) {
    px -= 2;
    ctx.font = `${Math.round(px)}px ${family}`;
  }
}

let i = 1;
for (const [name, title, subtitle] of shots) {
  const file = `${srcDir}/${name}.png`;
  if (!existsSync(file)) continue;
  const img = await loadImage(file);
  const srcH = img.height - cropTop - cropBottom;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // Background: BackReserve terracotta gradient (accent #B5562B).
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, '#BC5C2E');
  g.addColorStop(1, '#8E3F1C');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  fitFont(ctx, title, 'BRSerif', 76 * t, W - 90 * s);
  ctx.fillText(title, W / 2, 150 * t);
  ctx.fillStyle = '#F8DDC9';
  fitFont(ctx, subtitle, 'BRSans', 38 * t, W - 90 * s);
  ctx.fillText(subtitle, W / 2, 220 * t);

  // Device: dark bezel around the real capture, fully visible.
  const bezel = 16 * t;
  const top = 290 * t;
  const maxH = H - top - 56 * t - 2 * bezel;
  const maxW = W - 120 * s - 2 * bezel;
  let h = maxH;
  let w = Math.round((img.width * h) / srcH);
  if (w > maxW) {
    w = maxW;
    h = Math.round((srcH * w) / img.width);
  }
  const x = (W - w) / 2;
  const y = top + bezel;
  const r = 40 * t;
  ctx.save();
  ctx.shadowColor = 'rgba(40,16,4,0.45)';
  ctx.shadowBlur = 50 * t;
  ctx.shadowOffsetY = 18 * t;
  ctx.beginPath();
  ctx.roundRect(x - bezel, y - bezel, w + 2 * bezel, h + 2 * bezel, r + bezel);
  ctx.fillStyle = '#2B211C';
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = '#FAF6F0';
  ctx.fillRect(x, y, w, h);
  ctx.drawImage(img, 0, cropTop, img.width, srcH, x, y, w, h);
  ctx.restore();

  const out = `${outDir}/${profile}-${String(i++).padStart(2, '0')}-${name}.jpg`;
  writeFileSync(out, c.toBuffer('image/jpeg', 92)); // JPEG: opaque, no alpha channel
  console.log(out, `${W}x${H}`);
}
