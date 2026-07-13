// Generate responsive AVIF + WebP variants for every raster image under public/assets
// (plus the root logos). Variants land beside the original as <name>-{w}.{avif,webp}.
// Idempotent: skips variants that already exist and are newer than the source.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'public');
// Quality drops as width rises: large renditions sit under navy scrims where
// compression artefacts are invisible, and they dominate transfer size.
const TIERS = [
  { w: 480,  avif: 60, webp: 75 },
  { w: 768,  avif: 55, webp: 72 },
  { w: 1200, avif: 44, webp: 64 },
  { w: 1440, avif: 38, webp: 60 },
  { w: 1920, avif: 34, webp: 56 },
];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const sources = [
  ...[...walk(path.join(ROOT, 'assets'))],
  path.join(ROOT, 'banco-logo-light.png'),
  path.join(ROOT, 'banco-logo-dark.png'),
  path.join(ROOT, 'banco-mark.png'),
  path.join(ROOT, 'herovideo-poster.jpg'),
].filter(p => /\.(jpe?g|png|webp|avif)$/i.test(p) && !/-\d+\.(avif|webp)$/i.test(p) && !/-\d+w?\.(jpe?g|png)$/i.test(p));

let made = 0, skipped = 0;
for (const src of sources) {
  const img = sharp(src);
  const meta = await img.metadata();
  const base = src.replace(/\.(jpe?g|png|webp|avif)$/i, '');
  // never upscale; always provide at least the smallest width
  let tiers = TIERS.filter(t => t.w <= meta.width);
  if (!tiers.length) tiers = [{ ...TIERS[0], w: meta.width }];
  for (const t of tiers) {
    for (const ext of ['avif', 'webp']) {
      const out = `${base}-${t.w}.${ext}`;
      if (fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(src).mtimeMs) { skipped++; continue; }
      await sharp(src).resize({ width: t.w }).toFormat(ext, { quality: t[ext] }).toFile(out);
      made++;
    }
  }
}
console.log(`variants written: ${made}, up-to-date: ${skipped}, sources: ${sources.length}`);
