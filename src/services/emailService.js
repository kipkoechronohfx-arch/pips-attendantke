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
        <a href="${process.env.APP_URL || 'https://pipsattendant.top'}/premium.html" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#0d0800;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;display:inline-block;">Access VIP Area →</a>
      </div>
    </div>
    <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
      <p style="color:#4b5563;font-size:11px;margin:0;">Pips Attendant | support@pipsattendant.com | This is an automated receipt — no action required.</p>
    </div>
  </div>
  </body></html>`;
}


function buildLeadMagnetHtml(name) {
  const appUrl = process.env.APP_URL || 'https://pipsattendant.top';
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

module.exports = { sendEmail, buildReceiptHtml, sendLeadMagnetEmail };
