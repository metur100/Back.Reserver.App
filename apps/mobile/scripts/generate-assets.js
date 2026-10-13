/* eslint-disable */
/**
 * Generates the BackReserve app icon, Android adaptive icon layers, splash image, notification icon and favicon
 * as real PNG files in the brand colours (terracotta #B5562B, cream #FAF6F0, espresso #2B211C).
 *
 * The motif is a scored bread loaf drawn with signed-distance shapes and 4x4 supersampling for smooth edges.
 * Run: npm run generate:assets  (outputs to assets/images)
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const OUT = path.join(__dirname, '..', 'assets', 'images');
fs.mkdirSync(OUT, { recursive: true });

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const TERRACOTTA = hex('#B5562B');
const CREAM = hex('#FAF6F0');
const CRUST = hex('#F3D7AE');
const CRUST_SHADE = hex('#E2B57A');
const ESPRESSO = hex('#2B211C');
const WHITE = [255, 255, 255];

// ---- shapes in normalised coordinates (centre 0,0; unit = full width) ----
function loafInside(x, y, scale) {
  // superellipse loaf, slightly flattened at the bottom
  const a = 0.36 * scale;
  const b = 0.24 * scale;
  const yy = y > 0 ? y * 1.25 : y;
  const n = 2.6;
  return Math.pow(Math.abs(x / a), n) + Math.pow(Math.abs(yy / b), n) <= 1;
}

function capsuleDist(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  const dx = pax - bax * h, dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy);
}

function scoreInside(x, y, scale) {
  const w = 0.028 * scale;
  const s = scale;
  const cuts = [
    [-0.2, 0.07, -0.09, -0.11],
    [-0.04, 0.09, 0.07, -0.11],
    [0.12, 0.08, 0.22, -0.08],
  ];
  return cuts.some(([ax, ay, bx, by]) => capsuleDist(x, y, ax * s, ay * s, bx * s, by * s) <= w);
}

function shadeInside(x, y, scale) {
  // lower crust band for depth
  return loafInside(x, y, scale) && y > 0.1 * scale;
}

/**
 * @param size pixel size
 * @param opts.bg background rgb or null for transparent
 * @param opts.scale loaf scale (1 = icon, smaller for adaptive safe zone)
 * @param opts.mono draw a single-colour silhouette (rgb)
 * @param opts.circle draw cream circle behind the loaf
 */
function render(size, opts) {
  const png = new PNG({ width: size, height: size });
  const SS = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size - 0.5;
          const y = (py + (sy + 0.5) / SS) / size - 0.5 - 0.02;
          let col = opts.bg;
          let alpha = opts.bg ? 1 : 0;
          if (opts.circle && x * x + (y - 0.02) * (y - 0.02) <= Math.pow(0.4 * opts.scale, 2)) {
            col = CREAM; alpha = 1;
          }
          if (loafInside(x, y, opts.scale)) {
            if (opts.mono) { col = opts.mono; alpha = 1; }
            else { col = shadeInside(x, y, opts.scale) ? CRUST_SHADE : CRUST; alpha = 1; }
            if (scoreInside(x, y, opts.scale)) {
              if (opts.mono) { alpha = 0; col = opts.bg; }
              else col = TERRACOTTA;
            }
          }
          if (alpha > 0 && col) { r += col[0]; g += col[1]; b += col[2]; a += 1; }
        }
      }
      const n = SS * SS;
      const idx = (size * py + px) << 2;
      if (a === 0) {
        png.data[idx] = 0; png.data[idx + 1] = 0; png.data[idx + 2] = 0; png.data[idx + 3] = 0;
      } else {
        png.data[idx] = Math.round(r / a);
        png.data[idx + 1] = Math.round(g / a);
        png.data[idx + 2] = Math.round(b / a);
        png.data[idx + 3] = Math.round((a / n) * 255);
      }
    }
  }
  return PNG.sync.write(png);
}

const files = {
  // iOS / generic app icon: opaque, no transparency allowed by Apple
  'icon.png': render(1024, { bg: TERRACOTTA, scale: 1.05, circle: false }),
  // Android adaptive icon layers: foreground must keep the motif inside the 66% safe zone
  'adaptive-icon.png': render(1024, { bg: null, scale: 0.85 }),
  'adaptive-icon-monochrome.png': render(1024, { bg: null, scale: 0.85, mono: WHITE }),
  // Splash: loaf on transparent background; splash background colour is cream (set in app.config.ts)
  'splash-icon.png': render(512, { bg: null, scale: 1.1, circle: false }),
  // Android notification icon: white silhouette on transparent
  'notification-icon.png': render(96, { bg: null, scale: 1.3, mono: WHITE }),
  'favicon.png': render(48, { bg: TERRACOTTA, scale: 1.1 }),
};

for (const [name, buf] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`wrote assets/images/${name} (${buf.length} bytes)`);
}
void ESPRESSO;
