/**
 * Architectural series data — generated from the Sept 2026 Profile Catalogue by
 * scripts/extract-catalogue.py (do not hand-edit the JSON; re-run the script).
 * This module adds types, ordering and presentation helpers on top of it.
 */
import data from '../data/architectural-series.json';

export interface Img { src: string; w: number; h: number }
export interface Profile { art: string; kgm: number | null; src: string; kind: 'svg' | 'png'; w: number; h: number; match: number }
export interface BomRow { name: string; section: string; kgm: number | null; weight: number | null; count: number | null; net: number | null }
export interface Bom { title: string; windowSize: string | null; rows: BomRow[]; total: number | null; issues: string[]; hold: boolean }
export type Category = 'window-systems' | 'door-systems' | 'facade-systems';
export interface Series {
  slug: string;
  name: string;
  family: string;
  category: Category;
  group: 'sliding' | 'casement' | 'doors' | 'facade';
  width: string | null;
  description: string;
  copyFixes: string[];
  cataloguePages: [number, number];
  scene: Img;
  renders: Img[];
  profiles: Profile[];
  boms: Bom[];
}

export const catalogue = data as unknown as {
  source: { title: string; pages: number; version: string; driveId: string };
  intro: string;
  features: { title: string; desc: string }[];
  shared: { livingSpaces: Img; technicalFeatures: Img };
  series: Series[];
};

export const ALL_SERIES: Series[] = catalogue.series;

export const CATEGORY_LABEL: Record<Category, string> = {
  'window-systems': 'Window systems',
  'door-systems': 'Door systems',
  'facade-systems': 'Façade systems',
};

export const seriesHref = (s: Series) => `/products/architectural/${s.category}/${s.slug}`;

export const byCategory = (c: Category) => ALL_SERIES.filter((s) => s.category === c);
export const byGroup = (g: Series['group']) => ALL_SERIES.filter((s) => s.group === g);

/** Named system series (excludes the Doors and Louvers profile ranges). */
export const countSeries = () => ALL_SERIES.filter((s) => s.width).length;

/** Previous / next within the same category, for in-page navigation. */
export function prevNext(s: Series) {
  const list = byCategory(s.category);
  const i = list.findIndex((x) => x.slug === s.slug);
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
}

/** Card visual: the cut-away render where the catalogue has one, else the scene. */
export const cardImage = (s: Series) => s.renders[0] ?? null;

/**
 * The catalogue's Technical Features page (sealing, glazing, air permeability…)
 * describes glazed systems. Louvers are open ventilation screens, so it would
 * contradict their own description — those pages skip the section.
 */
const NO_GLAZING_FEATURES = new Set(['louvers']);
export const showsFeatures = (s: Series) => !NO_GLAZING_FEATURES.has(s.slug);

/** "0.104 – 1.811" kg/m across the drawings in a series. */
export function kgmRange(s: Series) {
  const w = s.profiles.map((p) => p.kgm).filter((k): k is number => k != null);
  if (!w.length) return null;
  const lo = Math.min(...w), hi = Math.max(...w);
  return lo === hi ? lo.toFixed(3) : `${lo.toFixed(2)}–${hi.toFixed(2)}`;
}

/** Catalogue profile names are mixed case ("2 TRACK", "ReinForce Interlock") — normalise. */
export function profileName(n: string) {
  return n
    .split(' ')
    .map((w) => {
      if (/^(SGU)$/.test(w)) return w;
      if (/^in$/i.test(w)) return 'in';
      return w
        .split('/')
        .map((p) => (/[a-z]/i.test(p) ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
        .join('/');
    })
    .join(' ');
}

/** "SPECIFICATION - 27 MM EURO SERIES - GRILL" → "Grill configuration". */
export function bomLabel(b: Bom) {
  const t = b.title.toUpperCase();
  if (t.includes('GRILL')) return 'Grill configuration';
  if (t.includes('SLIM')) return 'Slim-interlock configuration';
  return 'Standard configuration';
}

/** Standard configuration first, then variants. */
export const orderedBoms = (s: Series) =>
  [...s.boms].sort((a, b) => Number(bomLabel(a) !== 'Standard configuration') - Number(bomLabel(b) !== 'Standard configuration'));

export const kg = (n: number | null, dp = 3) => (n == null ? '—' : n.toFixed(dp));

/**
 * Trailing-tile spans so a grid never ends on an empty cell: for each column count,
 * the last item stretches across the leftover cells. Returned as CSS custom
 * properties for the last item (consumed by `.span-fill` rules in global.css).
 */
export function fillSpans(count: number, cols: number[] = [4, 3, 2]) {
  return cols
    .map((c) => {
      const left = count % c;
      return `--span-${c}:${left === 0 ? 1 : c - left + 1}`;
    })
    .join(';');
}
