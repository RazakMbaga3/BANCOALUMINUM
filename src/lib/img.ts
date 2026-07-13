/** Srcset helpers for the pre-generated responsive variants
 *  (see scripts/optimize-images.mjs — <base>-{w}.{avif,webp} beside each original).
 *  Runs at build time (SSG), so each candidate is checked against the filesystem:
 *  sources narrower than a tier have no variant there, and phantom srcset entries
 *  would 404 in the browser. */
import fs from 'node:fs';
import path from 'node:path';

export const VARIANT_WIDTHS = [480, 768, 1200, 1440, 1920] as const;

// astro build/dev always runs from the project root; import.meta.url is unreliable
// here because Vite relocates this module into a bundled chunk.
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const existsCache = new Map<string, boolean>();

function variantExists(publicPath: string): boolean {
  let hit = existsCache.get(publicPath);
  if (hit === undefined) {
    hit = fs.existsSync(path.join(PUBLIC_DIR, publicPath));
    existsCache.set(publicPath, hit);
  }
  return hit;
}

/** "/a/b.jpg" → "/a/b-480.avif 480w, /a/b-768.avif 768w, …" capped at maxW, existing files only */
export function optSrcset(src: string, ext: 'avif' | 'webp', maxW = 1920): string {
  const base = src.replace(/\.(jpe?g|png|webp|avif)$/i, '');
  return VARIANT_WIDTHS.filter((w) => w <= maxW)
    .map((w) => `${base}-${w}.${ext}`)
    .filter(variantExists)
    .map((p) => `${p} ${p.match(/-(\d+)\.\w+$/)![1]}w`)
    .join(', ');
}
