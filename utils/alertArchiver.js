import Alert from '../models/Alert.js';

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
    errors: []
  };

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
        await Alert.findByIdAndUpdate(
          alert._id,
          {
            status: 'archived',
            updated: new Date(),
            updatedBy: 'system-auto-archive'
          },
          { new: true }
        );

        result.archived++;
        
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

    if (result.archived > 0) {
      console.log(`Successfully archived ${result.archived} alerts with expired end dates`);
    }

    return result;
  } catch (error) {
    console.error('Error in archiveExpiredAlerts:', error);
    result.errors.push({
      alertId: null,
      error: error.message
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
