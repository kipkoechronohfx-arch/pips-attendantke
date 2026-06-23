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

module.exports = { sendEmail };
