/**
 * FAR.E Group — Contact form API
 *
 * POST /api/contact
 * Body JSON: { firstName, lastName, email, company?, role?, type?, message, privacy, lang, website (honeypot) }
 *
 * Invia l'email tramite Microsoft Graph (OAuth2 client_credentials)
 * usando un'app registrata in Entra ID con permission applicativa Mail.Send.
 *
 * App Settings necessarie su Azure Static Web Apps:
 *   MS_TENANT_ID         GUID del tenant Microsoft 365 di FAR.E
 *   MS_CLIENT_ID         Application (client) ID dell'app registrata
 *   MS_CLIENT_SECRET     Client secret (custodire in App Settings, non nel repo)
 *   MS_SENDER            Mailbox mittente (es. info@fare-group.com)
 *   CONTACT_RECIPIENT    Destinatario delle richieste (default: info@fare-group.com)
 */

const RECIPIENT_DEFAULT = 'info@fare-group.com';

const MAX_LEN = {
  firstName: 100,
  lastName: 100,
  email: 200,
  company: 200,
  role: 200,
  type: 100,
  message: 5000
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Rimuove CR/LF (anti header-injection) e limita la lunghezza. */
function sanitizeLine(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\u0000]/g, ' ').trim().slice(0, max);
}

/* Limita la lunghezza preservando i newline (per il body messaggio). */
function sanitizeMultiline(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

async function getGraphToken(context) {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Entra ID configuration (MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET)');
  }

  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default'
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    context.log.error('Token request failed', response.status, text);
    throw new Error('token_request_failed');
  }

  const json = await response.json();
  return json.access_token;
}

async function sendViaGraph(context, token, mailPayload) {
  const sender = process.env.MS_SENDER || RECIPIENT_DEFAULT;
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(mailPayload)
  });

  if (!response.ok && response.status !== 202) {
    const text = await response.text();
    context.log.error('sendMail failed', response.status, text);
    throw new Error('graph_send_failed');
  }
}

module.exports = async function (context, req) {
  context.res = {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  };

  if (req.method !== 'POST') {
    context.res.status = 405;
    context.res.body = { ok: false, error: 'method_not_allowed' };
    return;
  }

  const data = (req.body && typeof req.body === 'object') ? req.body : {};

  // Honeypot: se il campo "website" è valorizzato, è un bot.
  // Restituiamo 200 per non rivelare il rilevamento.
  if (typeof data.website === 'string' && data.website.trim() !== '') {
    context.log.warn('Honeypot triggered', { ua: req.headers['user-agent'] });
    context.res.status = 200;
    context.res.body = { ok: true };
    return;
  }

  const fields = {
    firstName: sanitizeLine(data.firstName, MAX_LEN.firstName),
    lastName:  sanitizeLine(data.lastName,  MAX_LEN.lastName),
    email:     sanitizeLine(data.email,     MAX_LEN.email).toLowerCase(),
    company:   sanitizeLine(data.company,   MAX_LEN.company),
    role:      sanitizeLine(data.role,      MAX_LEN.role),
    type:      sanitizeLine(data.type,      MAX_LEN.type),
    message:   sanitizeMultiline(data.message, MAX_LEN.message),
    privacy:   data.privacy === true || data.privacy === 'true' || data.privacy === 'on',
    lang:      data.lang === 'en' ? 'en' : 'it'
  };

  const errors = [];
  if (!fields.firstName) errors.push('firstName');
  if (!fields.lastName) errors.push('lastName');
  if (!fields.email || !EMAIL_RE.test(fields.email)) errors.push('email');
  if (!fields.message) errors.push('message');
  if (!fields.privacy) errors.push('privacy');

  if (errors.length > 0) {
    context.res.status = 400;
    context.res.body = { ok: false, error: 'validation_failed', fields: errors };
    return;
  }

  const recipient = process.env.CONTACT_RECIPIENT || RECIPIENT_DEFAULT;
  const isEn = fields.lang === 'en';
  const subject = isEn
    ? `[Website] New request from ${fields.firstName} ${fields.lastName}`
    : `[Sito] Nuova richiesta da ${fields.firstName} ${fields.lastName}`;

  const labels = isEn
    ? { name: 'Name', email: 'Email', company: 'Company', role: 'Role', type: 'Type', lang: 'Language', msg: 'Message' }
    : { name: 'Nome', email: 'Email', company: 'Azienda', role: 'Ruolo', type: 'Tipologia', lang: 'Lingua', msg: 'Messaggio' };

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:640px">
      <h2 style="margin:0 0 16px 0">${isEn ? 'New contact request' : 'Nuova richiesta dal form contatti'}</h2>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td><strong>${labels.name}:</strong></td><td>${escapeHtml(fields.firstName)} ${escapeHtml(fields.lastName)}</td></tr>
        <tr><td><strong>${labels.email}:</strong></td><td><a href="mailto:${escapeHtml(fields.email)}">${escapeHtml(fields.email)}</a></td></tr>
        <tr><td><strong>${labels.company}:</strong></td><td>${escapeHtml(fields.company || '—')}</td></tr>
        <tr><td><strong>${labels.role}:</strong></td><td>${escapeHtml(fields.role || '—')}</td></tr>
        <tr><td><strong>${labels.type}:</strong></td><td>${escapeHtml(fields.type || '—')}</td></tr>
        <tr><td><strong>${labels.lang}:</strong></td><td>${escapeHtml(fields.lang)}</td></tr>
      </table>
      <hr style="margin:20px 0;border:none;border-top:1px solid #e0e0e0">
      <h3 style="margin:0 0 8px 0">${labels.msg}</h3>
      <div style="white-space:pre-wrap;background:#f7f7f7;padding:12px;border-radius:4px;border:1px solid #e0e0e0">${escapeHtml(fields.message)}</div>
    </div>
  `;

  const mailPayload = {
    message: {
      subject,
      body: { contentType: 'HTML', content: html },
      toRecipients: [{ emailAddress: { address: recipient } }],
      replyTo: [{ emailAddress: { address: fields.email, name: `${fields.firstName} ${fields.lastName}` } }]
    },
    saveToSentItems: false
  };

  try {
    const token = await getGraphToken(context);
    await sendViaGraph(context, token, mailPayload);
    context.log.info('Contact email sent', { recipient, lang: fields.lang });
    context.res.status = 200;
    context.res.body = { ok: true };
  } catch (err) {
    context.log.error('Contact send failed', err && err.message);
    context.res.status = 500;
    context.res.body = { ok: false, error: 'send_failed' };
  }
};
