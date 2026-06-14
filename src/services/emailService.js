const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

/**
 * Send an email via SendGrid. Falls back to console logging in dev/missing config.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML body
 */
async function sendEmail(to, subject, htmlContent) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    console.log('\n========================================');
    console.log('[Email Simulation] To: ' + to + '\nSubject: ' + subject);
    console.log('========================================\n');
    return;
  }
  try {
    await sgMail.send({
      to,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject,
      html: htmlContent
    });
  } catch (error) {
    console.error('[SendGrid Error]', error.message || error);
  }
}

module.exports = { sendEmail };
