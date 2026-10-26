// POST /api/contact — quote / enquiry form → email to sales, drawing attached.
//
// Vercel Node.js function (Web-standard signature), deployed beside the static
// Astro build. Sends through Resend's HTTP API, so there are no dependencies.
// Mirrors api/careers.js.
//
// Environment (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY      required — Resend API key
//   CONTACT_FROM_EMAIL  required — sender on a Resend-verified domain,
//                       e.g. "Banco Aluminium <enquiries@bancoaluminium.com>"
//   CONTACT_TO_EMAIL    optional — recipient(s), comma-separated. Overrides
//                       the default routing below entirely (including the
//                       architectural split) when set.
//                       (default sales@bancoaluminium.com, or for
//                       ?src=architectural: ajit@ + nilesh.gohil@)
//
// Responds with JSON when the request asks for it (the page's fetch submit),
// otherwise redirects (plain HTML form post, no JavaScript).

const TO_DEFAULT = 'sales@bancoaluminium.com';
// Architectural-sourced enquiries (?src=architectural, set via the hidden
// enquiry_source field) route to the architectural team directly (client
// correction F4), not the general sales inbox.
const TO_ARCHITECTURAL = ['ajit@bancoaluminium.com', 'nilesh.gohil@bancoaluminium.com'];
// Vercel caps a function request body at 4.5 MB; keep the attachment under
// that with room for the other fields and multipart overhead.
const MAX_DRAWING_BYTES = 4 * 1024 * 1024;
const SUCCESS_URL = '/contact/success';
const ERROR_URL = '/contact?enquiry=error#quote';

const PRODUCT_LABELS = {
  industrial: 'Industrial profiles (OEM)',
  architectural: 'Architectural systems',
  cast: 'Cast products (billets)',
  standard: 'Standard sections',
  custom: 'Custom profiles',
  other: 'Other / not sure',
};

const FIELDS = {
  company:      { label: 'Company name',       required: true,  max: 160 },
  name:         { label: 'Contact name',        required: true,  max: 120 },
  email:        { label: 'Email',               required: true,  max: 160 },
  country:      { label: 'Country',             required: false, max: 80 },
  product_type: { label: 'Product / application', required: true, max: 40 },
};

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
const ALLOWED_DRAWING_EXT = /\.(pdf|dxf|dwg|step|stp|png|jpe?g)$/i;

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Single-line fields: collapse whitespace and strip control characters.
const oneLine = (s) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

function reply(request, status, body) {
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');
  if (wantsJson) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(null, { status: 303, headers: { location: body.ok ? SUCCESS_URL : ERROR_URL } });
}

export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(request, 400, { ok: false, error: 'invalid_form' });
  }

  // Honeypot: real visitors never see or fill this field. Pretend success so
  // bots get no signal, but send nothing.
  if (String(form.get('bot-field') || '').trim() !== '') {
    return reply(request, 200, { ok: true });
  }

  const data = {};
  for (const [name, rule] of Object.entries(FIELDS)) {
    const raw = form.get(name);
    const value = oneLine(typeof raw === 'string' ? raw : '');
    if (rule.required && !value) return reply(request, 400, { ok: false, error: 'missing_field', field: name });
    if (value.length > rule.max) return reply(request, 400, { ok: false, error: 'field_too_long', field: name });
    data[name] = value;
  }
  if (!EMAIL_RE.test(data.email)) return reply(request, 400, { ok: false, error: 'invalid_email', field: 'email' });
  if (data.product_type && !PRODUCT_LABELS[data.product_type]) {
    return reply(request, 400, { ok: false, error: 'missing_field', field: 'product_type' });
  }

  const message = String(form.get('message') || '').replace(/\r\n?/g, '\n').trim().slice(0, 4000);
  const enquirySource = oneLine(String(form.get('enquiry_source') || '')).slice(0, 40);

  let attachment = null;
  const drawing = form.get('drawing');
  if (drawing && typeof drawing !== 'string' && drawing.size > 0) {
    if (!ALLOWED_DRAWING_EXT.test(drawing.name || '')) {
      return reply(request, 400, { ok: false, error: 'drawing_bad_type', field: 'drawing' });
    }
    if (drawing.size > MAX_DRAWING_BYTES) {
      return reply(request, 413, { ok: false, error: 'drawing_too_large', field: 'drawing' });
    }
    const bytes = Buffer.from(await drawing.arrayBuffer());
    const safeName = (drawing.name || 'drawing').replace(/[^\p{L}\p{N} ._-]+/gu, '').trim().slice(0, 100) || 'drawing';
    attachment = { filename: safeName, content: bytes.toString('base64') };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error('contact: RESEND_API_KEY / CONTACT_FROM_EMAIL not configured');
    return reply(request, 503, { ok: false, error: 'not_configured' });
  }
  const to = process.env.CONTACT_TO_EMAIL
    ? process.env.CONTACT_TO_EMAIL.split(',').map((s) => s.trim()).filter(Boolean)
    : (enquirySource === 'architectural' ? TO_ARCHITECTURAL : [TO_DEFAULT]);

  const subject = `Quote enquiry: ${data.company} · ${PRODUCT_LABELS[data.product_type] || data.product_type}`.slice(0, 200);

  const rows = [
    ['Company', data.company],
    ['Contact name', data.name],
    ['Email', data.email],
    ['Country', data.country || '—'],
    ['Product / application', PRODUCT_LABELS[data.product_type] || data.product_type],
  ];
  if (enquirySource) rows.push(['Source page', enquirySource]);

  const text = [
    `New enquiry from the website quote form.`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Requirement details',
    message || '—',
    '',
    attachment ? `Drawing attached: ${attachment.filename}` : 'No drawing attached.',
    'Reply to this email to answer the enquirer directly.',
  ].join('\n');

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0E2A47;font-size:14px;line-height:1.5">
<p style="margin:0 0 16px">New enquiry from the website quote form.</p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="color:#555;border-bottom:1px solid #ddd;white-space:nowrap">${escapeHtml(k)}</td><td style="border-bottom:1px solid #ddd">${escapeHtml(v)}</td></tr>`).join('\n')}
</table>
<p style="margin:20px 0 4px;color:#555">Requirement details</p>
<p style="margin:0;white-space:pre-wrap">${escapeHtml(message || '—')}</p>
<p style="margin:20px 0 0;color:#555">${attachment ? `Drawing attached: ${escapeHtml(attachment.filename)}.` : 'No drawing attached.'} Reply to this email to answer the enquirer directly.</p>
</body></html>`;

  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        reply_to: data.email,
        subject,
        text,
        html,
        ...(attachment ? { attachments: [attachment] } : {}),
      }),
    });
  } catch (err) {
    console.error('contact: Resend request failed', err);
    return reply(request, 502, { ok: false, error: 'send_failed' });
  }
  if (!res.ok) {
    console.error('contact: Resend rejected the email', res.status, await res.text().catch(() => ''));
    return reply(request, 502, { ok: false, error: 'send_failed' });
  }
  return reply(request, 200, { ok: true });
}

// Anything but POST: say so rather than fall through to a 404.
export function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
}
