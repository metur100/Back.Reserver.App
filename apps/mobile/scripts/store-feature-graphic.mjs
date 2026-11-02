// Google Play feature graphic (1024×500, opaque PNG) from a raw release-build capture of the pickup-code screen.
// Usage (needs @napi-rs/canvas via NODE_PATH, see store-screenshots.mjs):
//   node scripts/store-feature-graphic.mjs <raw c4-confirmation.png> store-assets/android/feature-graphic-1024x500.png [cropTop]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const [, , capture, out, cropTopArg = '0'] = process.argv;
if (!capture || !out) throw new Error('usage: store-feature-graphic.mjs <capture.png> <out.png> [cropTop]');
const fontDir = process.env.FONT_DIR || 'C:/Windows/Fonts';
GlobalFonts.registerFromPath(`${fontDir}/georgiab.ttf`, 'BRSerif');
GlobalFonts.registerFromPath(`${fontDir}/seguisb.ttf`, 'BRSans');

const W = 1024;
const H = 500;
const c = createCanvas(W, H);
const ctx = c.getContext('2d');
const g = ctx.createLinearGradient(0, 0, W, H);
g.addColorStop(0, '#BC5C2E');
g.addColorStop(1, '#8E3F1C');
ctx.fillStyle = g;
ctx.fillRect(0, 0, W, H);

// App icon + name + claim on the left.
const icon = await loadImage(new URL('../assets/images/icon.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
ctx.save();
ctx.shadowColor = 'rgba(40,16,4,0.35)';
ctx.shadowBlur = 18;
ctx.shadowOffsetY = 6;
ctx.beginPath();
ctx.roundRect(64, 118, 96, 96, 22);
ctx.clip();
ctx.drawImage(icon, 64, 118, 96, 96);
ctx.restore();
ctx.fillStyle = '#FFFFFF';
ctx.font = '62px BRSerif';
ctx.fillText('BackReserve', 184, 188);
ctx.fillStyle = '#F8DDC9';
ctx.font = '30px BRSans';
['Brötchen, Kuchen & mehr beim Bäcker', 'vorbestellen – bezahlt wird bei', 'Abholung.'].forEach((line, i) =>
  ctx.fillText(line, 64, 278 + i * 42),
);

// Tilted phone with the real capture on the right (bleeds off the bottom edge).
const img = await loadImage(capture);
const cropTop = Number(cropTopArg);
const sw = 300;
const srcH = img.height - cropTop;
const sh = Math.round((srcH * sw) / img.width);
ctx.save();
ctx.translate(800, 40);
ctx.rotate((6 * Math.PI) / 180);
ctx.shadowColor = 'rgba(40,16,4,0.45)';
ctx.shadowBlur = 30;
ctx.shadowOffsetY = 12;
ctx.beginPath();
ctx.roundRect(-sw / 2 - 12, -12, sw + 24, sh + 24, 44);
ctx.fillStyle = '#2B211C';
ctx.fill();
ctx.shadowColor = 'transparent';
ctx.beginPath();
ctx.roundRect(-sw / 2, 0, sw, sh, 34);
ctx.clip();
ctx.drawImage(img, 0, cropTop, img.width, srcH, -sw / 2, 0, sw, sh);
ctx.restore();

writeFileSync(out, c.toBuffer('image/png'));
console.log(out, `${W}x${H}`);
