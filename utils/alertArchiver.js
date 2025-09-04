import Alert from '../models/Alert.js';
import Logs from '../models/Logs.js';

// Socket.io instance will be set externally to avoid circular imports
let ioInstance = null;

export const setSocketIO = (io) => {
  ioInstance = io;
};

/**
 * Archives alerts whose expected end date has passed
 * @returns {Promise<{archived: number, errors: Array}>}
 */
export const archiveExpiredAlerts = async () => {
  const result = {
    archived: 0,
    errors: [],
    archivedAlerts: []
  };

  const processStartTime = new Date();

  try {
    const now = new Date();
    
    // Find all alerts that:
    // 1. Have an expectedEnd date that has passed
    // 2. Are not already archived or deleted
    // 3. Are not the latest version (to avoid archiving active alerts)
    const expiredAlerts = await Alert.find({
      expectedEnd: { $lt: now },
      status: { $nin: ['archived', 'deleted'] },
      isLatest: true
    });

    console.log(`Found ${expiredAlerts.length} alerts with expired end dates`);

    for (const alert of expiredAlerts) {
      try {
        // Update the alert status to archived
        const updatedAlert = await Alert.findByIdAndUpdate(
          alert._id,
          {
            status: 'archived',
            updated: new Date(),
            updatedBy: 'system-auto-archive'
          },
          { new: true }
        );

        result.archived++;
        result.archivedAlerts.push({
          alertId: alert._id,
          title: alert.title,
          expectedEnd: alert.expectedEnd,
          archivedAt: new Date(),
          category: alert.alertCategory,
          type: alert.alertType,
          city: alert.originCity || alert.city
        });
        
        // Emit socket event to notify connected clients
        if (ioInstance) {
          ioInstance.emit('alert-archived', {
            alertId: alert._id,
            reason: 'expired-end-date',
            archivedAt: new Date()
          });
        }

        console.log(`Archived alert ${alert._id} (${alert.title || 'No title'}) - End date: ${alert.expectedEnd}`);
      } catch (error) {
        console.error(`Error archiving alert ${alert._id}:`, error);
        result.errors.push({
          alertId: alert._id,
          error: error.message
        });
      }
    }

    const processEndTime = new Date();
    const processDuration = processEndTime - processStartTime;

    if (result.archived > 0) {
      console.log(`Successfully archived ${result.archived} alerts with expired end dates`);
    }

    if(result.archived > 0) {
    // Log the archiving process
    await Logs.createLog({
      userId: null,
      userEmail: 'tourprism.alerts@gmail.com',
      userName: 'Alert Archiver System',
      action: 'alert_archiving_completed',
      details: {
        totalAlertsFound: expiredAlerts.length,
        alertsArchived: result.archived,
        errors: result.errors.length,
        processStartTime: processStartTime.toISOString(),
        processEndTime: processEndTime.toISOString(),
        processDurationMs: processDuration,
        processDurationMinutes: (processDuration / 1000 / 60).toFixed(2),
        successRate: expiredAlerts.length > 0 ? ((expiredAlerts.length - result.errors.length) / expiredAlerts.length * 100).toFixed(2) + '%' : '0%',
        archivedAlerts: result.archivedAlerts,
        errorDetails: result.errors
      },
      ipAddress: '127.0.0.1',
      userAgent: 'Alert Archiver System'
    });
  }

    return result;
  } catch (error) {
    console.error('Error in archiveExpiredAlerts:', error);
    result.errors.push({
      alertId: null,
      error: error.message
    });
    
    // Log the error
    await Logs.createLog({
      userId: null,
      userEmail: 'tourprism.alerts@gmail.com',
      userName: 'Alert Archiver System',
      action: 'alert_archiving_completed',
      details: {
        error: error.message,
        processStartTime: processStartTime.toISOString(),
        processEndTime: new Date().toISOString(),
        failed: true
      },
      ipAddress: '127.0.0.1',
      userAgent: 'Alert Archiver System'
    });
    
    return result;
  }
};

/**
 * Schedules the archiving of expired alerts
 * Runs every hour by default
 */
export const scheduleAlertArchiving = () => {
  // Run every hour (3600000 milliseconds)
  const ARCHIVE_INTERVAL = 60 * 60 * 1000; // 1 hour
  
  console.log('Scheduling alert archiving - running every hour');
  
  // Run immediately on startup
  archiveExpiredAlerts();
  
  // Schedule recurring execution
  setInterval(async () => {
    console.log('Running scheduled alert archiving...');
    const result = await archiveExpiredAlerts();
    
    if (result.archived > 0) {
      console.log(`Scheduled archiving completed: ${result.archived} alerts archived`);
    }
    
    if (result.errors.length > 0) {
      console.log(`Scheduled archiving errors: ${result.errors.length} errors occurred`);
    }
  }, ARCHIVE_INTERVAL);
};

/**
 * Manual trigger for archiving expired alerts
 * Can be called via API endpoint
 */
export const manualArchiveExpiredAlerts = async (req, res) => {
  try {
    console.log('Manual archive request received');
    const result = await archiveExpiredAlerts();
    
    res.json({
      success: true,
      message: `Archive operation completed`,
      result
    });
  } catch (error) {
    console.error('Error in manual archive:', error);
    res.status(500).json({
      success: false,
      message: 'Error during manual archive operation',
      error: error.message
    });
  }
};
