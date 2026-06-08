// Dynamic XML sitemap — served at /sitemap.xml
// Astro picks this up via file-based routing; the .xml.ts extension signals a text/xml response.

const BASE = 'https://bancoaluminium.com';

const staticPages = [
  { url: '/',                              changefreq: 'weekly',  priority: '1.0' },
  { url: '/products/industrial',           changefreq: 'monthly', priority: '0.9' },
  { url: '/products/architectural',        changefreq: 'monthly', priority: '0.9' },
  { url: '/products/cast-products',        changefreq: 'monthly', priority: '0.9' },
  { url: '/products/standard-sections',    changefreq: 'monthly', priority: '0.8' },
  { url: '/capabilities/extrusion',        changefreq: 'monthly', priority: '0.8' },
  { url: '/capabilities/foundry',          changefreq: 'monthly', priority: '0.8' },
  { url: '/capabilities/die-shop',         changefreq: 'monthly', priority: '0.7' },
  { url: '/capabilities/heat-treatment',   changefreq: 'monthly', priority: '0.7' },
  { url: '/capabilities/machining',        changefreq: 'monthly', priority: '0.7' },
  { url: '/capabilities/cold-drawing',     changefreq: 'monthly', priority: '0.7' },
  { url: '/capabilities/surface-finishing',changefreq: 'monthly', priority: '0.7' },
  { url: '/capabilities/packing',          changefreq: 'monthly', priority: '0.6' },
  { url: '/industries',                    changefreq: 'monthly', priority: '0.8' },
  { url: '/industries/automotive',         changefreq: 'monthly', priority: '0.7' },
  { url: '/industries/electrical',         changefreq: 'monthly', priority: '0.7' },
  { url: '/industries/heat-management',    changefreq: 'monthly', priority: '0.7' },
  { url: '/industries/hydraulics',         changefreq: 'monthly', priority: '0.7' },
  { url: '/industries/forging',            changefreq: 'monthly', priority: '0.7' },
  { url: '/industries/building',           changefreq: 'monthly', priority: '0.7' },
  { url: '/industries/aerospace',          changefreq: 'monthly', priority: '0.7' },
  { url: '/industries/machinery',          changefreq: 'monthly', priority: '0.6' },
  { url: '/industries/railways',           changefreq: 'monthly', priority: '0.6' },
  { url: '/industries/solar',              changefreq: 'monthly', priority: '0.6' },
  { url: '/industries/material-handling',  changefreq: 'monthly', priority: '0.6' },
  { url: '/industries/pumps-motors',       changefreq: 'monthly', priority: '0.6' },
  { url: '/about',                         changefreq: 'monthly', priority: '0.8' },
  { url: '/about/quality',                 changefreq: 'monthly', priority: '0.7' },
  { url: '/about/global-reach',            changefreq: 'monthly', priority: '0.7' },
  { url: '/about/careers',                 changefreq: 'monthly', priority: '0.6' },
  { url: '/sustainability',                changefreq: 'monthly', priority: '0.7' },
  { url: '/downloads',                     changefreq: 'monthly', priority: '0.7' },
  { url: '/contact',                       changefreq: 'monthly', priority: '0.8' },
  { url: '/privacy',                       changefreq: 'yearly',  priority: '0.3' },
];

const today = new Date().toISOString().split('T')[0];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(p => `  <url>
    <loc>${BASE}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

export async function GET() {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
