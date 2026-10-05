/** Quick structural a11y + asset audit: alt attrs, h1 count, heading skips, unnamed controls, failed requests. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const base = process.argv[2] || 'http://localhost:4321';
function collectRoutes(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...collectRoutes(path.join(dir, e.name), `${prefix}/${e.name}`));
    else if (e.name.endsWith('.astro')) { const n = e.name.replace('.astro', ''); out.push(n === 'index' ? prefix || '/' : `${prefix}/${n}`); }
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
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const p = await ctx.newPage(); const failed = new Map();
p.on('response', r => { if (r.status() >= 400) failed.set(r.url().replace(base, ''), r.status()); });
let issues = 0;
for (const r of routes) {
  await p.goto(base + r, { waitUntil: 'load' });
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(s => setTimeout(s, 40)); } });
  const d = await p.evaluate(() => {
    const out = [];
    const imgs = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt'));
    if (imgs.length) out.push(`img without alt attr: ${imgs.map(i => i.getAttribute('src')).slice(0, 3).join(', ')}`);
    const h1 = document.querySelectorAll('h1').length; if (h1 !== 1) out.push(`h1 count = ${h1}`);
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => +h.tagName[1]);
    for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) { out.push(`heading jump h${hs[i - 1]}→h${hs[i]}`); break; }
    const unnamed = [...document.querySelectorAll('a,button')].filter(e => !(e.textContent || '').trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.querySelector('img[alt]:not([alt=""])'));
    if (unnamed.length) out.push(`unnamed controls: ${unnamed.slice(0, 3).map(e => e.className || e.tagName).join(', ')}`);
    if (!document.querySelector('meta[name=viewport]')) out.push('no viewport meta');
    return out;
  });
  if (d.length) { issues += d.length; console.log(r, '\n   ' + d.join('\n   ')); }
}
console.log('\nFailed requests:', [...failed.entries()].map(([u, s]) => `${s} ${u}`).join('\n  ') || 'none');
console.log('structure issues:', issues);
await b.close();
