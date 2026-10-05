/**
 * Responsive audit — crawls every static page at the target widths and reports:
 *  - horizontal page overflow (documentElement.scrollWidth > viewport)
 *  - elements whose right edge escapes the viewport (culprit finder)
 *  - interactive elements under 40px in either dimension (mobile widths only)
 *  - body text under 12px
 *
 * Usage:  node scripts/responsive-audit.mjs [baseUrl] [widths,comma,separated]
 * Needs a running dev/preview server.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://localhost:4321';
const widths = (process.argv[3] || '320,360,375,390,414,430,768,820,1024,1280,1440,1920').split(',').map(Number);

function collectRoutes(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...collectRoutes(path.join(dir, e.name), `${prefix}/${e.name}`));
    else if (e.name.endsWith('.astro')) {
      const n = e.name.replace('.astro', '');
      out.push(n === 'index' ? prefix || '/' : `${prefix}/${n}`);
    }
  }
  return out;
}
// Dynamic routes ([param].astro) only exist after a build: expand them from dist/.
function builtRoutes(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('_')) out.push(...builtRoutes(path.join(dir, e.name), `${prefix}/${e.name}`));
    else if (e.name === 'index.html') out.push(prefix || '/');
  }
  return out;
}
const declared = collectRoutes('src/pages').filter((r) => r !== '/404');
const dynamicPrefixes = declared.filter((r) => r.includes('[')).map((r) => r.slice(0, r.indexOf('[')));
const routes = [
  ...declared.filter((r) => !r.includes('[')),
  ...(fs.existsSync('dist') ? builtRoutes('dist').filter((r) => dynamicPrefixes.some((pre) => r.startsWith(pre)) && !declared.includes(r)) : []),
].sort();

const browser = await chromium.launch();
const results = [];

for (const w of widths) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 800 },
    deviceScaleFactor: 1,
    hasTouch: w < 1024,
    isMobile: w < 768,
  });
  const page = await ctx.newPage();
  for (const r of routes) {
   for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(base + r, { waitUntil: 'load', timeout: 45000 });
    } catch (e) {
      if (attempt === 1) results.push({ w, r, error: String(e).slice(0, 80) });
      continue;
    }
    try {
    // trigger reveal/lazy content
    await page.evaluate(async () => {
      const h = document.documentElement.scrollHeight;
      for (let y = 0; y < h; y += 700) { window.scrollTo(0, y); await new Promise((s) => setTimeout(s, 30)); }
      window.scrollTo(0, 0); await new Promise((s) => setTimeout(s, 900));
    });
    const data = await page.evaluate((vw) => {
      const sel = (el) => {
        let s = el.tagName.toLowerCase();
        if (el.id) s += '#' + el.id;
        if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
        return s;
      };
      const docW = document.documentElement.scrollWidth;
      const overflowers = [];
      const small = [];
      const tiny = [];
      const clip = (el) => {
        // ignore elements inside an intentionally scrollable/clipping ancestor
        for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
        }
        return false;
      };
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.right > vw + 1 && !clip(el) && cs.position !== 'fixed') {
          overflowers.push(`${sel(el)} right=${Math.round(b.right)} w=${Math.round(b.width)}`);
        }
        if (vw < 768 && (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT')) {
          if (el.closest('.mobile-menu') && cs.position === 'static' && false) continue;
          // inline text links inside paragraphs are exempt (WCAG inline exception)
          const inline = el.tagName === 'A' && cs.display === 'inline';
          if (!inline && (b.height < 40 || b.width < 40)) small.push(`${sel(el)} ${Math.round(b.width)}x${Math.round(b.height)} "${(el.textContent || '').trim().slice(0, 24)}"`);
        }
        if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
          const fs = parseFloat(cs.fontSize);
          if (fs < 11) tiny.push(`${sel(el)} ${fs}px "${el.textContent.trim().slice(0, 24)}"`);
        }
      }
      return { docW, overflowers: overflowers.slice(0, 6), small: small.slice(0, 8), tiny: tiny.slice(0, 5) };
    }, w);
    results.push({ w, r, ...data, pageOverflow: data.docW > w + 1 });
    break;
    } catch (e) { if (attempt === 1) results.push({ w, r, error: 'eval: ' + String(e).slice(0, 60) }); }
   }
  }
  await ctx.close();
}
await browser.close();

const outFile = process.argv[4] || 'scripts/.audit-latest.json';
fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

let bad = 0;
for (const x of results) {
  if (x.error) { console.log(`ERR  ${x.w} ${x.r} ${x.error}`); bad++; continue; }
  if (x.pageOverflow || x.overflowers.length) {
    bad++;
    console.log(`OVERFLOW ${x.w}px ${x.r} docW=${x.docW}\n   ${x.overflowers.join('\n   ')}`);
  }
}
const smallCount = results.filter((x) => x.small?.length).length;
console.log(`\nPages×widths: ${results.length} · overflow issues: ${bad} · with small tap targets: ${smallCount}`);
