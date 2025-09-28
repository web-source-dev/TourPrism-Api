import dotenv from 'dotenv';
import cron from 'node-cron';
import Alert from '../models/Alert.js';
import Logger from './logger.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

class AutoUpdateSystem {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Check if an alert needs auto-update (has followers and hasn't been checked in 2 days)
   */
  async getAlertsNeedingUpdate() {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    return await Alert.find({
      $and: [
        { status: 'approved' },
        { autoUpdateEnabled: true },
        { autoUpdateSuppressed: false },
        {
          $or: [
            { lastAutoUpdateCheck: { $lt: twoDaysAgo } },
            { lastAutoUpdateCheck: null }
          ]
        },
        {
          $or: [
            { 'followedBy.0': { $exists: true } },
            { numberOfFollows: { $gt: 0 } }
          ]
        }
      ]
    }).populate('userId', 'email firstName lastName');
  }

  /**
   * Generate AI prompt for checking if alert needs update
   */
  generateUpdatePrompt(alert) {
    const location = alert.originCity || alert.city || 'Unknown location';
    const category = alert.alertCategory || 'Unknown category';
    const type = alert.alertType || 'Unknown type';
    
    return `You are an AI assistant helping to check if a travel disruption alert needs an update.

ALERT DETAILS:
- Title: ${alert.title || 'No title'}
- Description: ${alert.description}
- Location: ${location}
- Category: ${category}
- Type: ${type}
- Impact: ${alert.impact || 'Unknown'}
- Expected Start: ${alert.expectedStart ? new Date(alert.expectedStart).toLocaleDateString() : 'Not specified'}
- Expected End: ${alert.expectedEnd ? new Date(alert.expectedEnd).toLocaleDateString() : 'Not specified'}
- Current Status: ${alert.status}

TASK:
Check if there are any updates to this disruption alert. Consider:
1. Has the situation changed (resolved, worsened, new developments)?
2. Are there new details about timing, location, or impact?
3. Has the expected end date changed?
4. Are there new recommendations or actions needed?

RESPONSE FORMAT:
Respond with JSON only:
{
  "needsUpdate": true/false,
  "reason": "Brief explanation of why update is needed or not",
  "updateSummary": "If update needed, provide a concise summary of the changes",
  "confidence": 0.0-1.0
}

If no update is needed, set needsUpdate to false and provide a brief reason.`;
  }

  /**
   * Check if a single alert needs an update using AI
   */
  async checkAlertForUpdate(alert) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = this.generateUpdatePrompt(alert);
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Parse JSON response
      let aiResponse;
      try {
        // Extract JSON from response (in case there's extra text)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiResponse = JSON.parse(jsonMatch[0]);
        } else {
          aiResponse = JSON.parse(text);
        }
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        return {
          needsUpdate: false,
          reason: 'Failed to parse AI response',
          confidence: 0.0
        };
      }

      return {
        needsUpdate: aiResponse.needsUpdate || false,
        reason: aiResponse.reason || 'No reason provided',
        updateSummary: aiResponse.updateSummary || '',
        confidence: aiResponse.confidence || 0.0
      };
    } catch (error) {
      console.error('Error checking alert for update:', error);
      return {
        needsUpdate: false,
        reason: 'Error occurred during AI check',
        confidence: 0.0
      };
    }
  }

  /**
   * Create an update alert
   */
  async createUpdateAlert(originalAlert, updateData, adminUserId = null) {
    try {
      // Create new alert as update
      const updateAlert = new Alert({
        userId: adminUserId || originalAlert.userId,
        title: `Update: ${originalAlert.title}`,
        description: updateData.updateSummary || 'Update to previous alert',
        alertCategory: originalAlert.alertCategory,
        alertType: originalAlert.alertType,
        impact: originalAlert.impact,
        priority: originalAlert.priority,
        targetAudience: originalAlert.targetAudience,
        recommendedAction: originalAlert.recommendedAction,
        originCity: originalAlert.originCity,
        originCountry: originalAlert.originCountry,
        originLatitude: originalAlert.originLatitude,
        originLongitude: originalAlert.originLongitude,
        impactLocations: originalAlert.impactLocations,
        status: 'pending', // Updates need admin approval
        isUpdateOf: originalAlert._id,
        updateSource: adminUserId ? 'admin' : 'auto',
        previousVersionNotes: `Auto-update: ${updateData.reason}`,
        expectedStart: originalAlert.expectedStart,
        expectedEnd: originalAlert.expectedEnd
      });

      await updateAlert.save();

      // Update original alert
      originalAlert.updateHistory.push(updateAlert._id);
      originalAlert.updateCount = (originalAlert.updateCount || 0) + 1;
      originalAlert.lastUpdateAt = new Date();
      originalAlert.lastUpdateBy = adminUserId || originalAlert.userId;
      await originalAlert.save();

      // Log the update
      await Logger.logSystem('alert_auto_update_created', {
        originalAlertId: originalAlert._id,
        updateAlertId: updateAlert._id,
        reason: updateData.reason,
        confidence: updateData.confidence,
        updateSource: adminUserId ? 'admin' : 'auto'
      });

      return updateAlert;
    } catch (error) {
      console.error('Error creating update alert:', error);
      throw error;
    }
  }

  /**
   * Process auto-updates for all eligible alerts
   */
  async processAutoUpdates() {
    if (this.isRunning) {
      console.log('Auto-update process already running, skipping...');
      return;
    }

    this.isRunning = true;
    const processStartTime = new Date();
    console.log('Starting auto-update process...');

    try {
      const alertsToCheck = await this.getAlertsNeedingUpdate();
      console.log(`Found ${alertsToCheck.length} alerts to check for updates`);

      let updatesCreated = 0;
      let noUpdates = 0;
      let errors = 0;
      const updateDetails = [];
      const errorDetails = [];

      for (const alert of alertsToCheck) {
        try {
          console.log(`Checking alert ${alert._id} for updates...`);
          
          // Update last check time
          alert.lastAutoUpdateCheck = new Date();
          await alert.save();

          // Check if update is needed
          const updateCheck = await this.checkAlertForUpdate(alert);
          
          if (updateCheck.needsUpdate && updateCheck.confidence > 0.7) {
            // Create update alert
            const updateAlert = await this.createUpdateAlert(alert, updateCheck);
            updatesCreated++;
            updateDetails.push({
              alertId: alert._id,
              alertTitle: alert.title,
              updateAlertId: updateAlert._id,
              reason: updateCheck.reason,
              confidence: updateCheck.confidence
            });
            console.log(`Created update for alert ${alert._id}`);
          } else {
            noUpdates++;
            console.log(`No update needed for alert ${alert._id}: ${updateCheck.reason}`);
          }

          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          errors++;
          errorDetails.push({
            alertId: alert._id,
            error: error.message
          });
          console.error(`Error processing alert ${alert._id}:`, error);
        }
      }

      const processEndTime = new Date();
      const processDuration = processEndTime - processStartTime;

      console.log(`Auto-update process completed: ${updatesCreated} updates created, ${noUpdates} no updates, ${errors} errors`);

      // Log summary
      await Logger.logSystem('auto_update_process_completed', {
        alertsChecked: alertsToCheck.length,
        updatesCreated,
        noUpdates,
        errors,
        processStartTime: processStartTime.toISOString(),
        processEndTime: processEndTime.toISOString(),
        processDurationMs: processDuration,
        processDurationMinutes: (processDuration / 1000 / 60).toFixed(2),
        successRate: alertsToCheck.length > 0 ? ((alertsToCheck.length - errors) / alertsToCheck.length * 100).toFixed(2) + '%' : '0%',
        updateRate: alertsToCheck.length > 0 ? (updatesCreated / alertsToCheck.length * 100).toFixed(2) + '%' : '0%',
        updateDetails,
        errorDetails
      });

    } catch (error) {
      console.error('Error in auto-update process:', error);
      
      // Log process error
      await Logger.logSystem('auto_update_process_failed', {
        error: error.message,
        processStartTime: processStartTime.toISOString(),
        processEndTime: new Date().toISOString(),
        failed: true
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manually trigger update check for specific alert
   */
  async checkSpecificAlert(alertId, adminUserId = null) {
    try {
      const alert = await Alert.findById(alertId).populate('userId', 'email firstName lastName');
      if (!alert) {
        throw new Error('Alert not found');
      }

      const updateCheck = await this.checkAlertForUpdate(alert);
      
      if (updateCheck.needsUpdate && updateCheck.confidence > 0.7) {
        const updateAlert = await this.createUpdateAlert(alert, updateCheck, adminUserId);
        return {
          success: true,
          updateCreated: true,
          updateAlert,
          reason: updateCheck.reason
        };
      } else {
        return {
          success: true,
          updateCreated: false,
          reason: updateCheck.reason
        };
      }
    } catch (error) {
      console.error('Error checking specific alert:', error);
      throw error;
    }
  }

  /**
   * Suppress auto-updates for an alert
   */
  async suppressAutoUpdates(alertId, adminUserId, reason = '') {
    try {
      const alert = await Alert.findById(alertId);
      if (!alert) {
        throw new Error('Alert not found');
      }

      alert.autoUpdateSuppressed = true;
      alert.autoUpdateSuppressedBy = adminUserId;
      alert.autoUpdateSuppressedAt = new Date();
      alert.autoUpdateSuppressedReason = reason;

      await alert.save();

      // Log the suppression
      await Logger.logSystem('alert_auto_update_suppressed', {
        alertId,
        reason
      });

      return { success: true };
    } catch (error) {
      console.error('Error suppressing auto-updates:', error);
      throw error;
    }
  }

  /**
   * Re-enable auto-updates for an alert
   */
  async enableAutoUpdates(alertId, adminUserId) {
    try {
      const alert = await Alert.findById(alertId);
      if (!alert) {
        throw new Error('Alert not found');
      }

      alert.autoUpdateSuppressed = false;
      alert.autoUpdateSuppressedBy = null;
      alert.autoUpdateSuppressedAt = null;
      alert.autoUpdateSuppressedReason = null;

      await alert.save();

      // Log the re-enabling
      await Logger.logSystem('alert_auto_update_enabled', {
        alertId
      });

      return { success: true };
    } catch (error) {
      console.error('Error enabling auto-updates:', error);
      throw error;
    }
  }
}

// Create singleton instance
const autoUpdateSystem = new AutoUpdateSystem();

/**
 * Schedule auto-update checks every 2 days at 2 AM
 */
const scheduleAutoUpdates = () => {
  // Run every 2 days at 2 AM
  cron.schedule('0 2 */2 * *', async () => {
  // cron.schedule('*/1 * * * *', async () => {
    console.log('Running scheduled auto-update check...');
    await autoUpdateSystem.processAutoUpdates();
  }, {
    scheduled: true,
    timezone: "Europe/London"
  });
  
  console.log('Auto-update system scheduled to run every 2 days at 2 AM');
};

// Export functions for testing or manual triggering
export {
  autoUpdateSystem,
  scheduleAutoUpdates,
  AutoUpdateSystem
};

// If this file is run directly, schedule the job
if (import.meta.url === `file://${process.argv[1]}`) {
  scheduleAutoUpdates();
}

