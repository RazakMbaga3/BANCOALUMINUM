// POST /api/careers — careers application form → email to HR, CV attached.
//
// Vercel Node.js function (Web-standard signature), deployed beside the static
// Astro build. Sends through Resend's HTTP API, so there are no dependencies.
//
// Environment (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY      required — Resend API key
//   CAREERS_FROM_EMAIL  required — sender on a Resend-verified domain,
//                       e.g. "Banco Aluminium Careers <careers@bancoaluminium.com>"
//   CAREERS_TO_EMAIL    optional — recipient(s), comma-separated
//                       (default career@bancoaluminium.com)
//
// Responds with JSON when the request asks for it (the page's fetch submit),
// otherwise redirects (plain HTML form post, no JavaScript).

const TO_DEFAULT = 'career@bancoaluminium.com';
// Vercel caps a function request body at 4.5 MB; keep the file under that with
// room for the other fields and multipart overhead.
const MAX_CV_BYTES = 4 * 1024 * 1024;
const SUCCESS_URL = '/about/careers/application-received';
const ERROR_URL = '/about/careers?application=error#apply';

const FIELDS = {
  full_name:    { label: 'Full name',                 required: true,  max: 120 },
  email:        { label: 'Email',                     required: true,  max: 160 },
  phone:        { label: 'Phone',                     required: true,  max: 40 },
  department:   { label: 'Department',                required: true,  max: 80 },
  experience:   { label: 'Total experience',          required: true,  max: 40 },
  position:     { label: 'Position applied for',      required: true,  max: 160 },
  organisation: { label: 'Current / last organisation', required: false, max: 160 },
  education:    { label: 'Education',                 required: true,  max: 200 },
  reason:       { label: 'Why Banco?',                required: true,  max: 4000 },
};

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;

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
  if (String(form.get('company_website') || '').trim() !== '') {
    return reply(request, 200, { ok: true });
  }

  const data = {};
  for (const [name, rule] of Object.entries(FIELDS)) {
    const raw = form.get(name);
    let value = typeof raw === 'string' ? raw : '';
    value = name === 'reason' ? value.replace(/\r\n?/g, '\n').trim() : oneLine(value);
    if (rule.required && !value) return reply(request, 400, { ok: false, error: 'missing_field', field: name });
    if (value.length > rule.max) return reply(request, 400, { ok: false, error: 'field_too_long', field: name });
    data[name] = value;
  }
  if (!EMAIL_RE.test(data.email)) return reply(request, 400, { ok: false, error: 'invalid_email', field: 'email' });

  const cv = form.get('cv');
  if (!cv || typeof cv === 'string' || cv.size === 0) {
    return reply(request, 400, { ok: false, error: 'missing_cv', field: 'cv' });
  }
  if (cv.size > MAX_CV_BYTES) return reply(request, 413, { ok: false, error: 'cv_too_large', field: 'cv' });
  const bytes = Buffer.from(await cv.arrayBuffer());
  // Trust the file's own header, not its name or the browser-supplied type.
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return reply(request, 400, { ok: false, error: 'cv_not_pdf', field: 'cv' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CAREERS_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error('careers: RESEND_API_KEY / CAREERS_FROM_EMAIL not configured');
    return reply(request, 503, { ok: false, error: 'not_configured' });
  }
  const to = (process.env.CAREERS_TO_EMAIL || TO_DEFAULT).split(',').map((s) => s.trim()).filter(Boolean);

  const safeName = data.full_name.replace(/[^\p{L}\p{N} ._-]+/gu, '').trim().slice(0, 80) || 'Applicant';
  const filename = `CV - ${safeName}.pdf`;
  const subject = `Job application: ${data.position} · ${data.full_name}`.slice(0, 200);

  const rows = Object.entries(FIELDS)
    .filter(([name]) => name !== 'reason')
    .map(([name, rule]) => [rule.label, data[name] || '—']);

  const text = [
    `New application from the website careers page.`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Why Banco?',
    data.reason,
    '',
    `CV attached: ${filename} (${Math.round(cv.size / 1024)} KB)`,
    'Reply to this email to answer the applicant directly.',
  ].join('\n');

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0E2A47;font-size:14px;line-height:1.5">
<p style="margin:0 0 16px">New application from the website careers page.</p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="color:#555;border-bottom:1px solid #ddd;white-space:nowrap">${escapeHtml(k)}</td><td style="border-bottom:1px solid #ddd">${escapeHtml(v)}</td></tr>`).join('\n')}
</table>
<p style="margin:20px 0 4px;color:#555">Why Banco?</p>
<p style="margin:0;white-space:pre-wrap">${escapeHtml(data.reason)}</p>
<p style="margin:20px 0 0;color:#555">CV attached: ${escapeHtml(filename)} (${Math.round(cv.size / 1024)} KB). Reply to this email to answer the applicant directly.</p>
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
        attachments: [{ filename, content: bytes.toString('base64') }],
      }),
    });
  } catch (err) {
    console.error('careers: Resend request failed', err);
    return reply(request, 502, { ok: false, error: 'send_failed' });
  }
  if (!res.ok) {
    console.error('careers: Resend rejected the email', res.status, await res.text().catch(() => ''));
    return reply(request, 502, { ok: false, error: 'send_failed' });
  }
  return reply(request, 200, { ok: true });
}

// Anything but POST: say so rather than fall through to a 404.
export function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
}
