const logger = require('../utils/logger');

// In-memory audit log store
const auditLogs = [];
const MAX_LOGS = 200;

function auditLog(actionName) {
  return (req, res, next) => {
    // We hook into the response finish event to ensure the action succeeded
    res.on('finish', () => {
      // Only log if the request was successful (2xx or 3xx)
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const adminEmail = req.admin?.email || req.user?.email || 'unknown';
        const adminId = req.admin?.id || req.user?._id || req.user?.id || 'unknown';
        const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
        
        const logEntry = {
          action: actionName,
          admin: adminEmail,
          adminId: adminId,
          ip: ip,
          path: req.originalUrl,
          method: req.method,
          timestamp: new Date().toISOString()
        };
        
        auditLogs.unshift(logEntry); // Add to beginning
        if (auditLogs.length > MAX_LOGS) {
          auditLogs.pop(); // Remove oldest
        }
        
        logger.info(`[AUDIT] Action: ${actionName} | Admin: ${adminEmail} | IP: ${ip}`);
      }
    });
    
    next();
  };
}

function getAuditLogs() {
  return auditLogs;
}

module.exports = {
  auditLog,
  getAuditLogs
};
