const fs = require('fs');
const path = require('path');
const db = require('./db');
const { sendEmail } = require('./emailService');
const logger = require('../utils/logger');

async function runBackup() {
  try {
    logger.info('[Backup] Starting daily database backup...');

    const users = await db.getUsers();
    const payments = await db.getPayments();
    const promos = await db.getPromos();
    const tickets = await db.getTickets();
    const appConfig = await db.getAppConfig();

    const backupData = {
      timestamp: new Date().toISOString(),
      data: {
        users,
        payments,
        promos,
        tickets,
        appConfig
      }
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    
    // Save locally
    const backupsDir = path.join(__dirname, '..', '..', 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `backup-${dateStr}.json`;
    const filePath = path.join(backupsDir, fileName);
    
    fs.writeFileSync(filePath, jsonStr);
    logger.info(`[Backup] Saved locally to ${filePath}`);

    // Email to admin
    const adminEmail = process.env.SENDGRID_FROM_EMAIL;
    if (adminEmail) {
      const attachments = [{
        content: Buffer.from(jsonStr).toString('base64'),
        filename: fileName,
        type: 'application/json',
        disposition: 'attachment'
      }];

      const htmlContent = `
        <h3>Daily Database Backup</h3>
        <p>Your automated database backup for <strong>${dateStr}</strong> is attached.</p>
        <ul>
          <li><strong>Users:</strong> ${users.length}</li>
          <li><strong>Payments:</strong> ${payments.length}</li>
          <li><strong>Promos:</strong> ${promos.length}</li>
          <li><strong>Tickets:</strong> ${tickets.length}</li>
        </ul>
        <p>Keep this file safe!</p>
      `;

      await sendEmail(adminEmail, `📦 Daily DB Backup - ${dateStr}`, htmlContent, attachments);
      logger.info(`[Backup] Emailed successfully to ${adminEmail}`);
    }

  } catch (error) {
    logger.error(`[Backup Error] ${error.message}`);
  }
}

module.exports = { runBackup };
