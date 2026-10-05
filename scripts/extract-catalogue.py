"""
Extract the Architectural Series Profile Catalogue into site data + assets.

    python scripts/extract-catalogue.py "<path to Profile Catalogue.pdf>"

Source of truth: the Sept 2026 42-page catalogue (Drive 1A4FOXbKyWjuNz5gYg-jERimv2CZaZTf6,
local copy "D:/Banco Data/website redesign/assets/Profile Catalogue Sept 2026.pdf").
Older May/July versions exist — do not extract from them (see CATALOGUE-DISCREPANCIES.md).

Per series (scene page + detail page) it writes, under public/assets/architectural/series/<slug>/:
  scene.jpg            the catalogue's lifestyle render (embedded original, not a page render)
  render-N.png         3D cut-away renders, transparent, trimmed
  profiles/<art>.svg   section drawings, re-inked catalogue green -> Heritage navy
                       (PNG fallback when the vector copy does not match the page render)
and src/data/architectural-series.json with names, copy, profile list and BOM tables.

Every BOM row is validated (kg/m x 1.2 = weight, weight x count = net, sum = total, and the
section no. must be a drawing in the same series with the same kg/m). Failing tables are
marked hold=true and the page shows a catalogue reference instead of the numbers.

Re-runnable: wipes and regenerates public/assets/architectural/series/. Run
`node scripts/optimize-images.mjs` afterwards for the AVIF/WebP variants.
"""
import io
import json
import math
import re
import shutil
import sys
from pathlib import Path

import fitz
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'public' / 'assets' / 'architectural' / 'series'
OUT_URL = '/assets/architectural/series'
DATA = ROOT / 'src' / 'data' / 'architectural-series.json'

NAVY = (0x0E, 0x2A, 0x47)
INK = '#33373B'
PAGE_OFFSET = 4  # printed page number = pdf page - 4 (catalogue index numbering)

# pdf pages are 1-based. scene = lifestyle page, detail = drawings/spec page.
SERIES = [
    # ── Window systems · sliding ──────────────────────────────────────────
    dict(slug='18mm-sliding',          name='18 mm Series',                  family='Sliding windows', category='window-systems', group='sliding',  width='18 mm',      scene=6,  detail=7),
    dict(slug='25mm-sliding',          name='25 mm Series',                  family='Sliding windows', category='window-systems', group='sliding',  width='25 mm',      scene=8,  detail=9, renders=[('clip', (760, 90, 1060, 585))]),
    dict(slug='26mm-premium-economic', name='26 mm Premium Economic Series', family='Sliding windows', category='window-systems', group='sliding',  width='26 mm',      scene=10, detail=11),
    dict(slug='27mm-euro',             name='27 mm Euro Series',             family='Sliding windows', category='window-systems', group='sliding',  width='27 mm',      scene=12, detail=13),
    dict(slug='27mm-slim',             name='27 mm Slim Series',             family='Sliding windows', category='window-systems', group='sliding',  width='27 mm',      scene=14, detail=15),
    dict(slug='29mm-sliding',          name='29 mm Series',                  family='Sliding windows', category='window-systems', group='sliding',  width='29 mm',      scene=16, detail=17, renders=[('img', 2)]),
    dict(slug='31mm-gulf',             name='31 mm Gulf Series',             family='Sliding windows', category='window-systems', group='sliding',  width='31 mm',      scene=18, detail=19, renders=[('img', 2), ('clip', (640, 118, 1135, 212))]),
    dict(slug='35mm-gulf',             name='35 mm Gulf Series',             family='Sliding windows', category='window-systems', group='sliding',  width='35 mm',      scene=20, detail=21, renders=[('clip', (700, 262, 1112, 494)), ('clip', (640, 118, 1135, 242))]),
    dict(slug='35x75mm-euro',          name='35 × 75 mm Euro Series',        family='Sliding windows', category='window-systems', group='sliding',  width='35 × 75 mm', scene=22, detail=23, renders=[('img', 2), ('img', 1)]),
    # ── Window systems · casement ─────────────────────────────────────────
    dict(slug='40mm-casement',         name='40 mm Casement Series',         family='Casement windows', category='window-systems', group='casement', width='40 mm',     scene=24, detail=25),
    dict(slug='45mm-casement',         name='45 mm Casement Series',         family='Casement windows', category='window-systems', group='casement', width='45 mm',     scene=26, detail=27, renders=[('clip', (840, 100, 1010, 725))]),
    dict(slug='50mm-casement',         name='50 mm Casement Series',         family='Casement windows', category='window-systems', group='casement', width='50 mm',     scene=28, detail=29,
         copy_fix=('sliding system', 'casement system')),
    # ── Door systems ──────────────────────────────────────────────────────
    dict(slug='50mm-casement-door',    name='50 mm Casement Door Series',    family='Casement doors',  category='door-systems',   group='doors',    width='50 mm',      scene=30, detail=31, renders=[('clip', (740, 85, 1112, 712))]),
    dict(slug='50mm-sliding-folding',  name='50 mm Sliding & Folding Series', family='Casement doors', category='door-systems',   group='doors',    width='50 mm',      scene=32, detail=33),
    dict(slug='door-profiles',         name='Door Profiles',                 family='Doors',           category='door-systems',   group='doors',    width=None,         scene=38, detail=39),
    # ── Façade systems ────────────────────────────────────────────────────
    dict(slug='38mm-slim-curtain-wall', name='38 mm Slim Curtain Wall',      family='Curtain wall',    category='facade-systems', group='facade',   width='38 mm',      scene=34, detail=35),
    dict(slug='45mm-curtain-wall',     name='45 mm Curtain Wall',            family='Curtain wall',    category='facade-systems', group='facade',   width='45 mm',      scene=36, detail=37),
    dict(slug='louvers',               name='Louvers',                       family='Louvers',         category='facade-systems', group='facade',   width=None,         scene=40, detail=41, renders=[]),
]

LABEL = re.compile(r'^(ART|SPS|HAD|RTU|RET)[\s\u00a0]?(\d{7})$')
KGM = re.compile(r'^(\d+\.\d+)\s*kg\s*/\s*m$')


def is_green(c):
    return c is not None and len(c) == 3 and c[1] > 0.45 and c[0] < 0.2


def norm_section(s):
    m = re.match(r'^\s*([A-Z]{3})\s*(\d{7})\s*$', s.replace('\u00a0', ' '))
    return f'{m.group(1)} {m.group(2)}' if m else s.strip()


def num(s):
    try:
        return float(str(s).strip())
    except ValueError:
        return None


# ── images ────────────────────────────────────────────────────────────────
def pil_from_xref(doc, xref, smask):
    pix = fitz.Pixmap(doc, xref)
    if smask:
        mask = fitz.Pixmap(doc, smask)
        pix = fitz.Pixmap(pix, mask)
    if pix.n - pix.alpha >= 4:  # CMYK
        pix = fitz.Pixmap(fitz.csRGB, pix)
    mode = 'RGBA' if pix.alpha else 'RGB'
    return Image.frombytes(mode, (pix.width, pix.height), pix.samples)


def trim_white(img, frac=0.9):
    """Drop page-white bands (p3's photo carries a white header strip with the logo baked in)."""
    g = img.convert('L')
    w, h = g.size
    px = g.load()
    white = lambda y: sum(px[x, y] > 235 for x in range(0, w, 4)) / len(range(0, w, 4)) > frac
    top = 0
    while top < h // 3 and white(top):
        top += 1
    bot = h - 1
    while bot > 2 * h // 3 and white(bot):
        bot -= 1
    return img.crop((0, top + 4 if top else 0, w, bot - 3 if bot < h - 1 else h))


def save_scene(doc, page, dest, trim=False):
    imgs = [im for im in page.get_images(full=True) if not im[1]]
    xref = max(imgs, key=lambda im: im[2] * im[3])[0]
    img = pil_from_xref(doc, xref, 0).convert('RGB')
    if trim:
        img = trim_white(img)
    img.save(dest, 'JPEG', quality=90, optimize=True, progressive=True)
    return img.size


def embedded_renders(doc, page):
    """Transparent cut-away renders embedded on the page, largest first, trimmed."""
    seen, out = set(), []
    imgs = [im for im in page.get_images(full=True) if im[1] and im[2] * im[3] > 300 * 300 and (im[2], im[3]) != (410, 133)]
    imgs.sort(key=lambda im: -im[2] * im[3])
    for im in imgs:
        if im[0] in seen:
            continue
        seen.add(im[0])
        img = pil_from_xref(doc, im[0], im[1])
        bbox = img.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if bbox:
            out.append(img.crop(bbox))
    return out


def clip_render(page, rect):
    """What the page actually shows inside rect (for masked, layered or rotated renders),
    with the white page background knocked out to transparency."""
    pix = page.get_pixmap(clip=fitz.Rect(rect), dpi=216)
    img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    mask = img.convert('L').point(lambda v: 255 if v > 244 else 0)
    w, h = mask.size
    seeds = [(x, 0) for x in range(0, w, 6)] + [(x, h - 1) for x in range(0, w, 6)] + \
            [(0, y) for y in range(0, h, 6)] + [(w - 1, y) for y in range(0, h, 6)]
    for xy in seeds:
        if mask.getpixel(xy) == 255:
            ImageDraw.floodfill(mask, xy, 128)
    alpha = mask.point(lambda v: 0 if v == 128 else 255)
    img.putalpha(alpha)
    bbox = alpha.getbbox()
    return img.crop(bbox) if bbox else img


def save_renders(doc, page, folder, slug, spec=None):
    """spec: None = every embedded render; otherwise a list of ('img', n) picking the n-th
    embedded render (1-based, largest first) or ('clip', (x0, y0, x1, y1)) in page points."""
    embedded = embedded_renders(doc, page)
    picks = [img for img in embedded] if spec is None else [
        embedded[arg - 1] if kind == 'img' else clip_render(page, arg) for kind, arg in spec]
    out = []
    for img in picks:
        img = img.copy()
        img.thumbnail((1600, 1600), Image.LANCZOS)
        n = len(out) + 1
        img.save(folder / f'render-{n}.png', optimize=True)
        out.append(dict(src=f'{OUT_URL}/{slug}/render-{n}.png', w=img.width, h=img.height))
    return out


# ── section drawings ──────────────────────────────────────────────────────
def find_tiles(page):
    labels = []
    for b in page.get_text('dict')['blocks']:
        for line in b.get('lines', []):
            for s in line['spans']:
                m = LABEL.match(s['text'].strip())
                if m:
                    labels.append((f'{m.group(1)} {m.group(2)}', fitz.Rect(s['bbox'])))
    drawings = page.get_drawings()
    borders = [
        dr['rect'] for dr in drawings
        if 50 < dr['rect'].width < 420 and 40 < dr['rect'].height < 320
        and len(dr['items']) == 1 and dr['items'][0][0] == 're'
        and (is_green(dr.get('fill')) or is_green(dr.get('color')))
    ]
    tiles = []
    for art, lr in labels:
        hits = [r for r in borders if r.contains(lr)]
        if not hits:
            continue  # a BOM table cell, not a drawing
        outer = fitz.Rect(hits[0])
        for r in hits[1:]:
            outer |= r
        if any(abs(t['rect'].x0 - outer.x0) < 2 and abs(t['rect'].y0 - outer.y0) < 2 for t in tiles):
            continue
        kgm, kgm_rect = None, None
        for b in page.get_text('dict', clip=outer)['blocks']:
            for line in b.get('lines', []):
                for s in line['spans']:
                    m = KGM.match(s['text'].strip())
                    if m:
                        kgm, kgm_rect = float(m.group(1)), fitz.Rect(s['bbox'])
        tops = [dr['rect'].y0 for dr in drawings if outer.contains(dr['rect'])
                and not (dr['rect'].width > 0.9 * outer.width and dr['rect'].height > 0.9 * outer.height)
                and not (dr['type'] == 'f' and dr.get('fill') == (0.0, 0.0, 0.0))]
        for b in page.get_text('dict', clip=outer)['blocks']:
            for line in b.get('lines', []):
                for s in line['spans']:
                    t = s['text'].strip()
                    if t and not LABEL.match(t) and not KGM.match(t):
                        tops.append(s['bbox'][1])
        tiles.append(dict(art=art, kgm=kgm, rect=outer, label_rect=lr, kgm_rect=kgm_rect,
                          content_top=min(tops) if tops else outer.y1))
    # reading order: rows top→bottom, then left→right
    tiles.sort(key=lambda t: (round(t['rect'].y0 / 20), t['rect'].x0))
    return tiles


def body_rect(tile):
    """Tile minus its header strip (ART no. + kg/m are rendered in HTML), but never
    cutting into a dimension that sits level with the header."""
    r = fitz.Rect(tile['rect'])
    head = tile['label_rect'].y1
    if tile['kgm_rect']:
        head = max(head, tile['kgm_rect'].y1)
    r.y0 = max(tile['label_rect'].y0, min(head + 1.5, tile['content_top'] - 1.0))
    return r


def hexcol(c, fill):
    if c is None:
        return 'none'
    if is_green(c):
        return '#%02X%02X%02X' % NAVY
    if not fill and max(c) < 0.25:
        return INK
    return '#%02x%02x%02x' % tuple(int(round(x * 255)) for x in c[:3])


def tile_svg(page, tile, with_text=True, B=None):
    T = tile['rect']
    B = B or body_rect(tile)
    f = lambda pt: f'{pt.x - B.x0:.2f} {pt.y - B.y0:.2f}'
    parts, paths = [], 0
    for dr in page.get_drawings():
        r = dr['rect']
        if not T.contains(r):
            continue
        if r.width > 0.9 * T.width and r.height > 0.9 * T.height:
            continue  # tile border / mask artefact
        if dr['type'] == 'f' and dr.get('fill') == (0.0, 0.0, 0.0) and len(dr['items']) == 1 and dr['items'][0][0] == 're':
            continue  # black mask rect behind the profile (invisible in the PDF)
        if r.y1 <= B.y0:
            continue
        d, cur = [], None
        for it in dr['items']:
            k = it[0]
            if k in ('l', 'c'):
                a = it[1]
                if cur is None or abs(cur.x - a.x) > 0.01 or abs(cur.y - a.y) > 0.01:
                    d.append('M' + f(a))
                if k == 'l':
                    d.append('L' + f(it[2]))
                    cur = it[2]
                else:
                    d.append('C' + f(it[2]) + ' ' + f(it[3]) + ' ' + f(it[4]))
                    cur = it[4]
            elif k == 're':
                rr = it[1]
                d.append(f'M{rr.x0 - B.x0:.2f} {rr.y0 - B.y0:.2f}h{rr.width:.2f}v{rr.height:.2f}h{-rr.width:.2f}z')
                cur = None
            elif k == 'qu':
                q = it[1]
                d.append('M' + 'L'.join(f(p) for p in (q.ul, q.ur, q.lr, q.ll)) + 'z')
                cur = None
        if dr.get('closePath'):
            d.append('z')
        if not d:
            continue
        fill = hexcol(dr.get('fill'), True) if 'f' in dr['type'] else 'none'
        stroke = hexcol(dr.get('color'), False) if 's' in dr['type'] else 'none'
        sw = f' stroke-width="{dr.get("width") or 0.5:.2f}"' if stroke != 'none' else ''
        eo = ' fill-rule="evenodd"' if dr.get('even_odd') else ''
        parts.append(f'<path d="{"".join(d)}" fill="{fill}" stroke="{stroke}"{sw}{eo}/>')
        paths += 1
    for b in (page.get_text('dict', clip=T)['blocks'] if with_text else []):
        for line in b.get('lines', []):
            for s in line['spans']:
                t = s['text'].strip()
                if not t or LABEL.match(t) or KGM.match(t):
                    continue
                x, y = s['origin']
                if y < B.y0:
                    continue
                dx, dy = line['dir']
                rot = math.degrees(math.atan2(dy, dx))
                tf = f' transform="rotate({rot:.0f} {x - B.x0:.2f} {y - B.y0:.2f})"' if abs(rot) > 1 else ''
                parts.append(
                    f'<text x="{x - B.x0:.2f}" y="{y - B.y0:.2f}" font-size="{s["size"]:.1f}"{tf}>'
                    f'{t.replace(chr(160), " ").replace("&", "&amp;").replace("<", "&lt;")}</text>'
                )
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {B.width:.2f} {B.height:.2f}" '
        f'width="{B.width:.0f}" height="{B.height:.0f}">'
        f'<g font-family="Inter, Helvetica, Arial, sans-serif" fill="{INK}">' + ''.join(parts) + '</g></svg>'
    )
    return svg, paths


def ink_mask(img):
    g = img.convert('L').point(lambda v: 255 if v < 200 else 0)
    return g.filter(ImageFilter.MaxFilter(5))


def recolour_png(img):
    """Catalogue green → navy, keeping anti-aliasing (raster fallback)."""
    img = img.convert('RGB')
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b = px[x, y]
            if g > r + 20 and g > b:
                t = (255 - r) / 255
                px[x, y] = tuple(int(255 * (1 - t) + c * t) for c in NAVY)
    return img


def compare(page, tile):
    """IoU of drawing ink (text and tile border excluded) between the page render and the
    SVG render of the same clip. Text is excluded because the SVG falls back to system fonts."""
    B = body_rect(tile) + (2.5, 0, -2.5, -2.5)
    svg, _ = tile_svg(page, tile, with_text=False, B=B)
    ref = page.get_pixmap(clip=B, dpi=144)
    ref_img = Image.frombytes('RGB', (ref.width, ref.height), ref.samples)
    k = ref.width / B.width
    draw = ImageDraw.Draw(ref_img)
    for b in page.get_text('dict', clip=B)['blocks']:
        for line in b.get('lines', []):
            for sp in line['spans']:
                r = fitz.Rect(sp['bbox']) & B
                if not r.is_empty:
                    draw.rectangle([(r.x0 - B.x0) * k - 2, (r.y0 - B.y0) * k - 2, (r.x1 - B.x0) * k + 2, (r.y1 - B.y0) * k + 2], fill='white')
    sdoc = fitz.open(stream=svg.encode('utf8'), filetype='svg')
    spx = sdoc[0].get_pixmap(dpi=144)
    svg_img = Image.frombytes('RGB', (spx.width, spx.height), spx.samples).resize(ref_img.size)
    a, b = ink_mask(ref_img), ink_mask(svg_img)
    inter = ImageChops.multiply(a, b).histogram()[255]
    union = ImageChops.lighter(a, b).histogram()[255]
    return inter / union if union else 1.0


def save_profiles(page, folder, slug):
    folder.mkdir(parents=True, exist_ok=True)
    out, used = [], {}
    for t in find_tiles(page):
        base = t['art'].lower().replace(' ', '-')
        used[base] = used.get(base, 0) + 1
        name = base if used[base] == 1 else f'{base}-{used[base]}'
        B = body_rect(t)
        svg, paths = tile_svg(page, t)
        iou = compare(page, t) if paths else 0.0
        if paths >= 3 and iou >= 0.35:  # failures are gross (clip-drawn shapes fill as blocks)
            (folder / f'{name}.svg').write_text(svg, encoding='utf8')
            src, kind = f'{OUT_URL}/{slug}/profiles/{name}.svg', 'svg'
        else:
            B = B + (5, 0, -5, -5)  # keep the catalogue's tile frame out (the site draws its own)
            pix = page.get_pixmap(clip=B, dpi=216)
            img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            k = pix.width / B.width
            for hr in (t['label_rect'], t['kgm_rect']):
                if hr and hr.intersects(B):
                    ImageDraw.Draw(img).rectangle([(hr.x0 - B.x0) * k - 3, (hr.y0 - B.y0) * k - 3,
                                                   (hr.x1 - B.x0) * k + 3, (hr.y1 - B.y0) * k + 3], fill='white')
            img = recolour_png(img)
            img.save(folder / f'{name}.png', optimize=True)
            src, kind = f'{OUT_URL}/{slug}/profiles/{name}.png', 'png'
        out.append(dict(art=t['art'], kgm=t['kgm'], src=src, kind=kind,
                        w=round(B.width, 1), h=round(B.height, 1), match=round(iou, 3)))
    return out


# ── bill of materials ─────────────────────────────────────────────────────
SECTION = re.compile(r'^(ART|SPS|HAD|RTU|RET)(\d{7})$')
NUMBER = re.compile(r'^\d+(\.\d+)?$')


def extract_boms(page):
    """Parse the 1.2 x 1.2 m specification tables from word positions.

    find_tables() mis-splits the side-by-side tables (29 mm, 40 mm), so each table is
    located by its "SPECIFICATION" heading and read row by row: a section no. anchors
    a row, the four numbers to its right are kg/m, weight, count and net weight, and
    the words to its left (possibly wrapped over two lines) are the profile name."""
    words = [dict(t=w[4], r=fitz.Rect(w[:4])) for w in page.get_text('words')]
    heads = sorted([w for w in words if w['t'].upper().startswith('SPECIFICATION')], key=lambda w: w['r'].x0)
    boms = []
    for i, h in enumerate(heads):
        x0 = h['r'].x0 - 15
        x1 = next((o['r'].x0 - 5 for o in heads[i + 1:] if abs(o['r'].y0 - h['r'].y0) < 150 and o['r'].x0 > h['r'].x0 + 50), page.rect.width)
        title = ' '.join(w['t'] for w in sorted(
            [w for w in words if abs(w['r'].y0 - h['r'].y0) < 3 and x0 <= w['r'].x0 < x1], key=lambda w: w['r'].x0))
        below = sorted([w for w in words if x0 <= w['r'].x0 < x1 and w['r'].y0 > h['r'].y1], key=lambda w: w['r'].y0)
        hdr = next((w for w in below if w['t'].upper() == 'PROFILE'), None)
        tot = next((w for w in below if w['t'].lower().startswith('total')), None)
        if not hdr or not tot:
            continue
        # stop at the next table heading below this one (stacked tables, e.g. 40 mm)
        nxt_head = next((o for o in heads if o is not h and o['r'].y0 > h['r'].y1 and x0 - 20 <= o['r'].x0 < x1), None)
        if nxt_head and tot['r'].y0 > nxt_head['r'].y0:
            continue
        region = [w for w in below if w['r'].y0 <= tot['r'].y1 + 2]
        size = ' '.join(w['t'] for w in sorted([w for w in region if w['r'].y1 <= hdr['r'].y0 + 1], key=lambda w: (round(w['r'].y0), w['r'].x0)))
        total_words = [w for w in region if abs(w['r'].y0 - tot['r'].y0) < 3 and w['r'].x0 > tot['r'].x0 and NUMBER.match(w['t'])]
        total = float(total_words[0]['t']) if total_words else None
        body = [w for w in region if hdr['r'].y1 + 12 < w['r'].y0 < tot['r'].y0 - 1]
        # anchors: section numbers, possibly split as "SPS" "2047201"
        anchors = []
        for w in body:
            m = SECTION.match(w['t'])
            if m:
                anchors.append(dict(sec=f'{m.group(1)} {m.group(2)}', r=w['r']))
            elif re.match(r'^(ART|SPS|HAD|RTU|RET)$', w['t']):
                nxt = [o for o in body if abs(o['r'].y0 - w['r'].y0) < 3 and 0 <= o['r'].x0 - w['r'].x1 < 8 and re.match(r'^\d{7}$', o['t'])]
                if nxt:
                    anchors.append(dict(sec=f"{w['t']} {nxt[0]['t']}", r=w['r'] | nxt[0]['r']))
        anchors.sort(key=lambda a: a['r'].y0)
        rows = []
        for j, a in enumerate(anchors):
            yc = (a['r'].y0 + a['r'].y1) / 2
            nums = sorted([w for w in body if w['r'].x0 > a['r'].x1 and abs((w['r'].y0 + w['r'].y1) / 2 - yc) < 4 and NUMBER.match(w['t'])], key=lambda w: w['r'].x0)
            lo = (anchors[j - 1]['r'].y1 + a['r'].y0) / 2 if j else hdr['r'].y1 + 12
            hi = (a['r'].y1 + anchors[j + 1]['r'].y0) / 2 if j + 1 < len(anchors) else tot['r'].y0
            name = ' '.join(w['t'] for w in sorted([w for w in body if w['r'].x1 <= a['r'].x0 + 1 and lo <= (w['r'].y0 + w['r'].y1) / 2 < hi], key=lambda w: (round(w['r'].y0), w['r'].x0)))
            vals = [float(w['t']) for w in nums[:4]] + [None] * (4 - min(4, len(nums)))
            rows.append(dict(name=re.sub(r'\s+', ' ', name).strip().rstrip('.'), section=a['sec'],
                             kgm=vals[0], weight=vals[1], count=int(vals[2]) if vals[2] is not None else None, net=vals[3]))
        m = re.search(r'WIDTH\s*([\d.]+)\s*M.*?HEIGHT\s*([\d.]+)\s*M', size or '', re.I)
        size = f'{m.group(1)} m × {m.group(2)} m' if m else None
        boms.append(dict(title=title, windowSize=size, rows=rows, total=total))
    return boms


def validate_boms(boms, own, everywhere):
    """own: {art: kgm} for this series' drawings; everywhere: {art: {kgm,...}} for the whole catalogue."""
    for b in boms:
        issues = []
        for row in b['rows']:
            n = row['name'] or row['section']
            if None in (row['kgm'], row['weight'], row['count'], row['net']):
                issues.append(f'{n}: a number could not be read')
                continue
            if abs(row['kgm'] * 1.2 - row['weight']) > 0.0025:
                issues.append(f"{n}: weight {row['weight']:.3f} is not {row['kgm']:.3f} kg/m × 1.2 m (= {row['kgm'] * 1.2:.3f})")
            if abs(row['weight'] * row['count'] - row['net']) > 0.006 and abs(row['kgm'] * 1.2 * row['count'] - row['net']) > 0.006:
                issues.append(f"{n}: net weight {row['net']:.3f} is not {row['weight']:.3f} × {row['count']}")
            sec = row['section']
            if sec in own:
                if own[sec] is not None and abs(own[sec] - row['kgm']) > 0.0015:
                    issues.append(f"{n}: {sec} is {own[sec]:.3f} kg/m on its drawing but {row['kgm']:.3f} kg/m in the table")
            elif sec in everywhere:
                if all(abs(k - row['kgm']) > 0.0015 for k in everywhere[sec] if k is not None):
                    issues.append(f"{n}: {sec} (drawn in another series) is {', '.join(f'{k:.3f}' for k in everywhere[sec])} kg/m, table says {row['kgm']:.3f}")
            else:
                same = sorted(a for a, k in own.items() if k is not None and abs(k - row['kgm']) < 0.0015)
                hint = f" (the {row['kgm']:.3f} kg/m drawing in this series is {', '.join(same)})" if same else ''
                issues.append(f"{n}: section {sec} does not appear on any drawing in the catalogue{hint}")
        if b['rows'] and b['total'] is not None:
            tot = sum(r['net'] or 0 for r in b['rows'])
            if abs(tot - b['total']) > 0.012:
                issues.append(f"Total {b['total']:.3f} is not the sum of the net weights ({tot:.3f})")
        if b['rows'] and b['total'] is None:
            issues.append('Total could not be read')
        b['issues'] = issues
        b['hold'] = bool(issues)
    return boms


# ── page copy ─────────────────────────────────────────────────────────────
def scene_description(page):
    blocks = [b[4] for b in page.get_text('blocks') if b[6] == 0]
    blocks = [' '.join(b.split()) for b in blocks]
    return max(blocks, key=lambda b: len(b.split()))


def intro_paragraph(page):
    blocks = sorted([b for b in page.get_text('blocks') if b[6] == 0], key=lambda b: b[1])
    title = next(b for b in blocks if 'ENGINEERING MODERN LIVING SPACES' in b[4].upper())
    return ' '.join(' '.join(b[4].split()) for b in blocks if b[1] > title[1] + 2)


FEATURE_TITLES = ['AIR PERMEABILITY', 'WATER TIGHTNESS', 'STRUCTURAL INTEGRITY', 'WIND LOAD', 'SOUND INSULATION', 'THERMAL PERFORMANCE']


def technical_features(page):
    """Titles and descriptions sit in separate blocks (one is merged); pair them by position."""
    blocks = [(fitz.Rect(b[:4]), ' '.join(b[4].split())) for b in page.get_text('blocks') if b[6] == 0]
    feats = []
    for t in FEATURE_TITLES:
        r, text = next((r, x) for r, x in blocks if x.upper().startswith(t))
        desc = text[len(t):].strip()
        if not desc:
            below = [(br, x) for br, x in blocks if 0 <= br.y0 - r.y1 < 20 and abs(br.x0 - r.x0) < 10]
            desc = below[0][1] if below else ''
        feats.append(dict(title=t.capitalize(), desc=desc))
    return feats


def main(pdf_path):
    doc = fitz.open(pdf_path)
    if doc.page_count != 42:
        sys.exit(f'Expected the 42-page Sept 2026 catalogue, got {doc.page_count} pages. Check the source file.')
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for child in OUT_DIR.iterdir():  # clear contents, not the folder (it may be open in a shell)
        shutil.rmtree(child) if child.is_dir() else child.unlink()
    shared = OUT_DIR / '_shared'
    shared.mkdir(parents=True)

    # Shared imagery: p3 living-space render, p5 technical-features cut-away.
    w3 = save_scene(doc, doc[2], shared / 'living-spaces.jpg', trim=True)
    w5 = save_scene(doc, doc[4], shared / 'technical-features.jpg')
    feats = technical_features(doc[4])
    intro = intro_paragraph(doc[2])

    series = []
    for cfg in SERIES:
        slug = cfg['slug']
        folder = OUT_DIR / slug
        folder.mkdir(parents=True)
        scene_page, detail_page = doc[cfg['scene'] - 1], doc[cfg['detail'] - 1]
        sw, sh = save_scene(doc, scene_page, folder / 'scene.jpg')
        renders = save_renders(doc, detail_page, folder, slug, cfg.get('renders'))
        profiles = save_profiles(detail_page, folder / 'profiles', slug)
        boms = extract_boms(detail_page)
        desc = scene_description(scene_page)
        copy_fixes = []
        if cfg.get('copy_fix'):
            old, new = cfg['copy_fix']
            if old in desc:
                desc = desc.replace(old, new)
                copy_fixes.append(f'"{old}" → "{new}" (catalogue p.{cfg["scene"] - PAGE_OFFSET})')
        series.append(dict(
            slug=slug, name=cfg['name'], family=cfg['family'], category=cfg['category'], group=cfg['group'],
            width=cfg['width'], description=desc, copyFixes=copy_fixes,
            cataloguePages=[cfg['scene'] - PAGE_OFFSET, cfg['detail'] - PAGE_OFFSET],
            scene=dict(src=f'{OUT_URL}/{slug}/scene.jpg', w=sw, h=sh),
            renders=renders, profiles=profiles, boms=boms,
        ))

    everywhere = {}
    for s_ in series:
        for p_ in s_['profiles']:
            everywhere.setdefault(p_['art'], set()).add(p_['kgm'])
    for s_ in series:
        own = {}
        for p_ in s_['profiles']:
            own.setdefault(p_['art'], p_['kgm'])
        validate_boms(s_['boms'], own, everywhere)
        held = sum(b['hold'] for b in s_['boms'])
        fb = sum(p_['kind'] == 'png' for p_ in s_['profiles'])
        print(f"{s_['slug']:24} scene {s_['scene']['w']}x{s_['scene']['h']}  renders {len(s_['renders'])}  "
              f"drawings {len(s_['profiles'])} (png {fb})  BOM {len(s_['boms'])} (held {held})")
        for b in s_['boms']:
            for i in b['issues']:
                print(f'    ! {b["title"]}: {i}')

    data = dict(
        source=dict(title='Architectural Series Product Catalogue', pages=42, version='September 2026',
                    driveId='1A4FOXbKyWjuNz5gYg-jERimv2CZaZTf6'),
        intro=intro,
        features=feats,
        shared=dict(
            livingSpaces=dict(src=f'{OUT_URL}/_shared/living-spaces.jpg', w=w3[0], h=w3[1]),
            technicalFeatures=dict(src=f'{OUT_URL}/_shared/technical-features.jpg', w=w5[0], h=w5[1]),
        ),
        series=series,
    )
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf8')
    print(f'\nfeatures: {len(feats)}  series: {len(series)}  drawings: {sum(len(s["profiles"]) for s in series)}')
    print(f'wrote {DATA.relative_to(ROOT)}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
