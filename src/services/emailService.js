const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY || '');

/**
 * Send an email via Resend. Falls back to console logging in dev/missing config.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML body
 */
async function sendEmail(to, subject, htmlContent) {
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.RESEND_FROM_EMAIL ||
    process.env.RESEND_API_KEY === 'your_resend_api_key_here' ||
    process.env.RESEND_FROM_EMAIL === 'your_verified_sender@email.com'
  ) {
    console.log('\n========================================');
    console.log('[Email Simulation] To: ' + to + '\nSubject: ' + subject);
    console.log('========================================\n');
    return;
  }
  try {
    const { data, error } = await resend.emails.send({
      to,
      from: process.env.RESEND_FROM_EMAIL,
      subject,
      html: htmlContent
    });

    if (error) {
      console.error('[Resend Error]', error);
    }
  } catch (error) {
    console.error('[Resend Exception]', error.message || error);
  }
}

module.exports = { sendEmail };
