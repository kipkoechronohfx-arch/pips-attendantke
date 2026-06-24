const sgMail = require('@sendgrid/mail');

/**
 * Send an email via SendGrid. Falls back to console logging in dev/missing config.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML body
 */
async function sendEmail(to, subject, htmlContent) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (
    !apiKey ||
    !fromEmail ||
    apiKey === 'your_sendgrid_api_key_here' ||
    fromEmail === 'your_verified_sender@email.com'
  ) {
    console.log('\n========================================');
    console.log('[Email Simulation] To: ' + to + '\nSubject: ' + subject);
    console.log('========================================\n');
    return;
  }

  sgMail.setApiKey(apiKey);

  try {
    await sgMail.send({
      to,
      from: fromEmail,
      subject,
      html: htmlContent,
    });
    console.log(`[SendGrid] Email sent to ${to} — ${subject}`);
    return { ok: true };
  } catch (error) {
    const errorMsg = error.response?.body?.errors ? JSON.stringify(error.response.body.errors) : error.message || error;
    console.error('[SendGrid Error]', errorMsg);
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

module.exports = { sendEmail, buildReceiptHtml };
