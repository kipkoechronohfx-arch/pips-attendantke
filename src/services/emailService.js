const sgMail = require('@sendgrid/mail');
const logger = require('../utils/logger');

/**
 * Send an email via SendGrid. Falls back to console logging in dev/missing config.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML body
 */
async function sendEmail(to, subject, htmlContent, attachments = []) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (
    !apiKey ||
    !fromEmail ||
    apiKey === 'your_sendgrid_api_key_here' ||
    fromEmail === 'your_verified_sender@email.com'
  ) {
    logger.warn(`[Email Simulation] No API key set. Skipping email to: ${to} | Subject: ${subject}`);
    return;
  }

  sgMail.setApiKey(apiKey);

  try {
    const msg = {
      to,
      from: fromEmail,
      subject,
      html: htmlContent,
    };
    if (attachments && attachments.length > 0) {
      msg.attachments = attachments;
    }
    await sgMail.send(msg);
    logger.info(`[SendGrid] Email sent to ${to} — ${subject}`);
    return { ok: true };
  } catch (error) {
    const errorMsg = error.response?.body?.errors ? JSON.stringify(error.response.body.errors) : error.message || error;
    logger.error(`[SendGrid Error] to=${to} subject="${subject}" error=${errorMsg}`);
    throw new Error(`SendGrid API Error: ${errorMsg}`);
  }
}

function buildReceiptHtml({ ref, userName, userEmail, plan, amount, currency, method, days, expiryDate }) {
  const planLabel = { '1month': '1 Month', '2months': '2 Months', '3months': '3 Months', '6months': '6 Months' }[plan] || plan;
  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#0d0800;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#111827;border-radius:16px;border:1px solid rgba(251,191,36,0.2);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#f59e0b,#fbbf24);padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#0d0800;font-size:22px;font-weight:800;">🧾 Payment Receipt</h1>
      <p style="margin:6px 0 0;color:#78350f;font-size:13px;">Pips Attendant VIP</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#9ca3af;font-size:14px;margin:0 0 24px;">Hello <strong style="color:#f9fafb;">${userName || 'Trader'}</strong>, thank you for your payment. Here is your receipt.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid rgba(255,255,255,0.08);"><td style="color:#6b7280;padding:10px 0;font-size:13px;">Reference</td><td style="color:#f9fafb;padding:10px 0;font-size:13px;text-align:right;font-family:monospace;">${ref}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.08);"><td style="color:#6b7280;padding:10px 0;font-size:13px;">Plan</td><td style="color:#f9fafb;padding:10px 0;font-size:13px;text-align:right;">${planLabel} VIP Access</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.08);"><td style="color:#6b7280;padding:10px 0;font-size:13px;">Duration</td><td style="color:#f9fafb;padding:10px 0;font-size:13px;text-align:right;">${days} days</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.08);"><td style="color:#6b7280;padding:10px 0;font-size:13px;">Amount Paid</td><td style="color:#10b981;padding:10px 0;font-size:15px;font-weight:700;text-align:right;">${currency} ${amount}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.08);"><td style="color:#6b7280;padding:10px 0;font-size:13px;">Payment Method</td><td style="color:#f9fafb;padding:10px 0;font-size:13px;text-align:right;">${method}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.08);"><td style="color:#6b7280;padding:10px 0;font-size:13px;">Date</td><td style="color:#f9fafb;padding:10px 0;font-size:13px;text-align:right;">${new Date().toUTCString()}</td></tr>
        <tr><td style="color:#6b7280;padding:10px 0;font-size:13px;">VIP Expires</td><td style="color:#fbbf24;padding:10px 0;font-size:13px;font-weight:600;text-align:right;">${expiryDate}</td></tr>
      </table>
      <div style="margin-top:28px;text-align:center;">
        <a href="${process.env.APP_URL || 'https://www.pipsattendant.com'}/premium.html" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#0d0800;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;display:inline-block;">Access VIP Area →</a>
      </div>
    </div>
    <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
      <p style="color:#4b5563;font-size:11px;margin:0;">Pips Attendant | support@pipsattendant.com | This is an automated receipt — no action required.</p>
    </div>
  </div>
  </body></html>`;
}


function buildLeadMagnetHtml(name) {
  const appUrl = process.env.APP_URL || 'https://www.pipsattendant.com';
  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#0d0800;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#111827;border-radius:16px;border:1px solid rgba(251,191,36,0.2);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#f59e0b,#fbbf24);padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#0d0800;font-size:22px;font-weight:800;">📊 Your Free Risk Workbook is Ready!</h1>
      <p style="margin:6px 0 0;color:#78350f;font-size:13px;">Pips Attendant</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#9ca3af;font-size:14px;margin:0 0 20px;">Hello <strong style="color:#f9fafb;">${name || 'Trader'}</strong> 👋,</p>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 20px;">Welcome to the Pips Attendant family! We're thrilled to have you.</p>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 28px;">As promised, here is your <strong style="color:#fbbf24;">Free Risk Management Workbook</strong>. This guide covers position sizing, lot calculation, and the drawdown rules professional traders use every day.</p>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${appUrl}/premium.html" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#0d0800;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;display:inline-block;">Download Workbook →</a>
      </div>
      <div style="background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.15);border-radius:12px;padding:20px;margin-bottom:24px;">
        <p style="color:#fbbf24;font-size:13px;font-weight:700;margin:0 0 8px;">🚀 Want More? Upgrade to VIP</p>
        <p style="color:#6b7280;font-size:12px;margin:0;">Get access to daily premium signals, live market analysis, prop firm challenge support, and our exclusive community.</p>
      </div>
      <p style="color:#4b5563;font-size:12px;margin:0;">Follow us on <a href="https://t.me/pipsattendant" style="color:#fbbf24;text-decoration:none;">Telegram</a> for free daily updates.</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
      <p style="color:#4b5563;font-size:11px;margin:0;">Pips Attendant | You received this because you subscribed on our website.</p>
    </div>
  </div>
  </body></html>`;
}

async function sendLeadMagnetEmail(email, name) {
  const subject = '📊 Your Free Risk Management Workbook — Pips Attendant';
  return sendEmail(email, subject, buildLeadMagnetHtml(name));
}

// ── IP Geo-Lookup ────────────────────────────────────────────────
// Uses ip-api.com (free, no API key, 45 req/min). Returns safe defaults on error.
// Private/local IPs (127.x, ::1) are automatically skipped by the caller.
async function lookupIpGeo(ip) {
  try {
    const fetch = require('node-fetch');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,city,isp`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const data = await res.json();
    if (data.status === 'success') {
      return {
        country: data.country || 'Unknown',
        countryCode: (data.countryCode || '').toLowerCase(),
        city: data.city || 'Unknown',
        isp: data.isp || 'Unknown'
      };
    }
  } catch (_) { /* network error or timeout — fall through */ }
  return { country: 'Unknown', countryCode: '', city: 'Unknown', isp: 'Unknown' };
}

// ── New Login Alert Email ────────────────────────────────────────
function buildNewLoginAlertHtml({ userName, userEmail, ip, geo, loginAt }) {
  const appUrl = process.env.APP_URL || 'https://www.pipsattendant.com';
  const resetLink = `${appUrl}/premium.html?action=forgot-password`;
  const flag = geo.countryCode ? `https://flagcdn.com/20x15/${geo.countryCode}.png` : '';
  const formattedTime = loginAt ? new Date(loginAt).toUTCString() : new Date().toUTCString();

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:540px;margin:0 auto;background:#111827;border-radius:16px;border:1px solid rgba(239,68,68,0.3);overflow:hidden;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#7f1d1d,#991b1b,#b91c1c);padding:32px 28px;text-align:center;">
    <div style="font-size:48px;margin-bottom:8px;">🔐</div>
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.5px;">New Login Detected</h1>
    <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px;">Security alert for your Pips Attendant account</p>
  </div>

  <!-- Body -->
  <div style="padding:32px 28px;">
    <p style="color:#d1d5db;font-size:15px;margin:0 0 6px;">Hi <strong style="color:#fbbf24;">${userName || 'Trader'}</strong>,</p>
    <p style="color:#9ca3af;font-size:14px;line-height:1.7;margin:0 0 28px;">
      We detected a login to your Pips Attendant account from a <strong style="color:#f87171;">new IP address</strong> or location. 
      If this was you, no action is needed. If not, secure your account immediately.
    </p>

    <!-- Login Details Card -->
    <div style="background:#1f2937;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid rgba(239,68,68,0.15);">
      <p style="color:#ef4444;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 16px;">Login Details</p>

      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <td style="color:#6b7280;padding:9px 0;font-size:13px;width:40%;">🌐 IP Address</td>
          <td style="color:#f9fafb;padding:9px 0;font-size:13px;font-family:monospace;text-align:right;">${ip}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <td style="color:#6b7280;padding:9px 0;font-size:13px;">
            ${flag ? `<img src="${flag}" alt="" style="vertical-align:middle;margin-right:4px;">` : '🌍'} Country
          </td>
          <td style="color:#f9fafb;padding:9px 0;font-size:13px;text-align:right;">${geo.country}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <td style="color:#6b7280;padding:9px 0;font-size:13px;">🏙️ City</td>
          <td style="color:#f9fafb;padding:9px 0;font-size:13px;text-align:right;">${geo.city}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <td style="color:#6b7280;padding:9px 0;font-size:13px;">🏢 ISP / Network</td>
          <td style="color:#f9fafb;padding:9px 0;font-size:13px;text-align:right;">${geo.isp}</td>
        </tr>
        <tr>
          <td style="color:#6b7280;padding:9px 0;font-size:13px;">🕐 Time</td>
          <td style="color:#f9fafb;padding:9px 0;font-size:13px;text-align:right;">${formattedTime}</td>
        </tr>
      </table>
    </div>

    <!-- CTA Buttons -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:28px;">
      <a href="${resetLink}"
         style="background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;font-weight:700;padding:13px 24px;border-radius:10px;text-decoration:none;display:inline-block;font-size:14px;">
        🚨 This wasn't me — Secure Account
      </a>
      <a href="${appUrl}/premium.html"
         style="background:#1f2937;color:#9ca3af;font-weight:600;padding:13px 24px;border-radius:10px;text-decoration:none;display:inline-block;font-size:14px;border:1px solid rgba(255,255,255,0.1);">
        ✅ This was me
      </a>
    </div>

    <!-- Tips -->
    <div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:10px;padding:16px;margin-bottom:8px;">
      <p style="color:#fbbf24;font-size:12px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">🔒 Security Tips</p>
      <p style="color:#6b7280;font-size:12px;margin:0 0 4px;">• Use a strong, unique password you don't use elsewhere</p>
      <p style="color:#6b7280;font-size:12px;margin:0 0 4px;">• Never share your login code with anyone</p>
      <p style="color:#6b7280;font-size:12px;margin:0;">• Contact support if you notice any suspicious activity</p>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
    <p style="color:#374151;font-size:11px;margin:0;">
      Pips Attendant · <a href="mailto:support@pipsattendant.com" style="color:#4b5563;text-decoration:none;">support@pipsattendant.com</a>
      <br>This alert was sent to ${userEmail} because a new login was detected on your account.
    </p>
  </div>
</div>
</body></html>`;
}

async function sendNewLoginAlertEmail(user, ip, geo) {
  const subject = '🔐 New Login Detected — Pips Attendant Security Alert';
  const html = buildNewLoginAlertHtml({
    userName: user.name,
    userEmail: user.email,
    ip,
    geo,
    loginAt: new Date().toISOString()
  });
  return sendEmail(user.email, subject, html);
}

// ── Account Lockout Alert Email ────────────────────────────────
function buildLockoutAlertHtml(userName, lockedUntil) {
  const appUrl = process.env.APP_URL || 'https://www.pipsattendant.com';
  const resetLink = `${appUrl}/premium.html?action=forgot-password`;
  const timeStr = new Date(lockedUntil).toLocaleTimeString();

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:540px;margin:0 auto;background:#111827;border-radius:16px;border:1px solid rgba(239,68,68,0.3);overflow:hidden;">
  <div style="background:linear-gradient(135deg,#7f1d1d,#991b1b,#b91c1c);padding:32px 28px;text-align:center;">
    <div style="font-size:48px;margin-bottom:8px;">🛑</div>
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Account Locked</h1>
  </div>
  <div style="padding:32px 28px;">
    <p style="color:#d1d5db;font-size:15px;margin:0 0 6px;">Hi <strong style="color:#fbbf24;">${userName || 'Trader'}</strong>,</p>
    <p style="color:#9ca3af;font-size:14px;line-height:1.7;margin:0 0 28px;">
      There have been too many failed login attempts on your account. For your security, your account has been temporarily locked until <strong>${timeStr}</strong>.
    </p>
    <div style="text-align:center;margin-bottom:28px;">
      <a href="${resetLink}"
         style="background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;font-weight:700;padding:13px 24px;border-radius:10px;text-decoration:none;display:inline-block;font-size:14px;">
        Reset Password to Unlock
      </a>
    </div>
  </div>
</div>
</body></html>`;
}

async function sendLockoutAlertEmail(email, name, lockedUntil) {
  return sendEmail(email, '🛑 Account Temporarily Locked — Pips Attendant', buildLockoutAlertHtml(name, lockedUntil));
}

// ── Email Verification Email ──────────────────────────────────
function buildVerificationHtml(userName, token, email) {
  const appUrl = process.env.APP_URL || 'https://www.pipsattendant.com';
  // Use publicRoutes endpoint for verification
  const verifyLink = `${appUrl}/api/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:540px;margin:0 auto;background:#111827;border-radius:16px;border:1px solid rgba(16,185,129,0.3);overflow:hidden;">
  <div style="background:linear-gradient(135deg,#064e3b,#047857,#059669);padding:32px 28px;text-align:center;">
    <div style="font-size:48px;margin-bottom:8px;">✅</div>
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Verify Your Email</h1>
  </div>
  <div style="padding:32px 28px;">
    <p style="color:#d1d5db;font-size:15px;margin:0 0 6px;">Hi <strong style="color:#fbbf24;">${userName || 'Trader'}</strong>,</p>
    <p style="color:#9ca3af;font-size:14px;line-height:1.7;margin:0 0 28px;">
      Welcome to Pips Attendant! Please click the button below to verify your email address. This link expires in 24 hours.
    </p>
    <div style="text-align:center;margin-bottom:28px;">
      <a href="${verifyLink}"
         style="background:linear-gradient(135deg,#10b981,#34d399);color:#064e3b;font-weight:700;padding:13px 24px;border-radius:10px;text-decoration:none;display:inline-block;font-size:14px;">
        Verify Email Address
      </a>
    </div>
  </div>
</div>
</body></html>`;
}

async function sendVerificationEmail(email, name, token) {
  return sendEmail(email, '✅ Verify Your Email Address — Pips Attendant', buildVerificationHtml(name, token, email));
}

module.exports = { 
  sendEmail, 
  buildReceiptHtml, 
  sendLeadMagnetEmail, 
  lookupIpGeo, 
  sendNewLoginAlertEmail,
  sendLockoutAlertEmail,
  sendVerificationEmail
};
