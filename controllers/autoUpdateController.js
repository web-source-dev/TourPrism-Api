import Alert from '../models/Alert.js';
import User from '../models/User.js';
import Logs from '../models/Logs.js';
import { autoUpdateSystem } from '../utils/autoUpdateSystem.js';

/**
 * Get alerts that are eligible for auto-updates
 */
export const getAutoUpdateEligibleAlerts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status = 'all',
      hasUpdates = 'all',
      sortBy = 'lastAutoUpdateCheck',
      sortOrder = 'asc'
    } = req.query;
    
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;
    
    // Build query for alerts with followers
    const query = {
      status: 'approved',
      $or: [
        { 'followedBy.0': { $exists: true } },
        { numberOfFollows: { $gt: 0 } }
      ]
    };
    
    // Filter by auto-update status
    if (status === 'suppressed') {
      query.autoUpdateSuppressed = true;
    } else if (status === 'enabled') {
      query.autoUpdateSuppressed = false;
    }
    
    // Filter by update history
    if (hasUpdates === 'true') {
      query.updateCount = { $gt: 0 };
    } else if (hasUpdates === 'false') {
      query.updateCount = { $in: [0, null, undefined] };
    }
    
    // Determine sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const alerts = await Alert.find(query)
      .populate('userId', 'email firstName lastName')
      .populate('lastUpdateBy', 'email firstName lastName')
      .populate('autoUpdateSuppressedBy', 'email firstName lastName')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNumber);
    
    // Get total count for pagination
    const totalCount = await Alert.countDocuments(query);
    
    // Get update history for each alert
    const alertsWithUpdates = await Promise.all(alerts.map(async (alert) => {
      const updateHistory = await Alert.find({ isUpdateOf: alert._id })
        .select('_id title status createdAt updateSource')
        .sort({ createdAt: -1 });
      
      return {
        ...alert.toObject(),
        updateHistory
      };
    }));
    
    res.json({ 
      alerts: alertsWithUpdates, 
      totalCount,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalCount / limitNumber)
      }
    });
  } catch (error) {
    console.error('Error fetching auto-update eligible alerts:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get auto-update statistics
 */
export const getAutoUpdateStats = async (req, res) => {
  try {
    const [
      totalEligibleAlerts,
      alertsWithUpdates,
      suppressedAlerts,
      lastUpdateCheck,
      recentUpdates
    ] = await Promise.all([
      // Total alerts with followers
      Alert.countDocuments({
        status: 'approved',
        $or: [
          { 'followedBy.0': { $exists: true } },
          { numberOfFollows: { $gt: 0 } }
        ]
      }),
      
      // Alerts that have been updated
      Alert.countDocuments({
        status: 'approved',
        updateCount: { $gt: 0 }
      }),
      
      // Suppressed alerts
      Alert.countDocuments({
        status: 'approved',
        autoUpdateSuppressed: true
      }),
      
      // Get the most recent auto-update check
      Alert.findOne({
        lastAutoUpdateCheck: { $exists: true, $ne: null }
      }).sort({ lastAutoUpdateCheck: -1 }).select('lastAutoUpdateCheck'),
      
      // Recent updates (last 7 days)
      Alert.countDocuments({
        isUpdateOf: { $exists: true, $ne: null },
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
    ]);
    
    res.json({
      totalEligibleAlerts,
      alertsWithUpdates,
      suppressedAlerts,
      lastUpdateCheck: lastUpdateCheck?.lastAutoUpdateCheck || null,
      recentUpdates,
      autoUpdateEnabled: totalEligibleAlerts - suppressedAlerts
    });
  } catch (error) {
    console.error('Error fetching auto-update stats:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Manually check an alert for updates
 */
export const checkAlertForUpdates = async (req, res) => {
  try {
    const { alertId } = req.params;
    
    const result = await autoUpdateSystem.checkSpecificAlert(alertId, req.userId);
    
    res.json(result);
  } catch (error) {
    console.error('Error checking alert for updates:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Suppress auto-updates for an alert
 */
export const suppressAutoUpdates = async (req, res) => {
  try {
    const { alertId } = req.params;
    const { reason } = req.body;
    
    const result = await autoUpdateSystem.suppressAutoUpdates(alertId, req.userId, reason);
    
    res.json(result);
  } catch (error) {
    console.error('Error suppressing auto-updates:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Enable auto-updates for an alert
 */
export const enableAutoUpdates = async (req, res) => {
  try {
    const { alertId } = req.params;
    
    const result = await autoUpdateSystem.enableAutoUpdates(alertId, req.userId);
    
    res.json(result);
  } catch (error) {
    console.error('Error enabling auto-updates:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get update history for an alert
 */
export const getAlertUpdateHistory = async (req, res) => {
  try {
    const { alertId } = req.params;
    
    // Get the original alert
    const originalAlert = await Alert.findById(alertId)
      .populate('userId', 'email firstName lastName')
      .populate('lastUpdateBy', 'email firstName lastName');
    
    if (!originalAlert) {
      return res.status(404).json({ message: "Alert not found" });
    }
    
    // Get all updates for this alert
    const updates = await Alert.find({ isUpdateOf: alertId })
      .populate('userId', 'email firstName lastName')
      .sort({ createdAt: -1 });
    
    // Get parent alert if this is an update
    let parentAlert = null;
    if (originalAlert.isUpdateOf) {
      parentAlert = await Alert.findById(originalAlert.isUpdateOf)
        .populate('userId', 'email firstName lastName')
        .select('_id title description createdAt');
    }
    
    res.json({
      originalAlert,
      updates,
      parentAlert,
      updateCount: updates.length
    });
  } catch (error) {
    console.error('Error fetching alert update history:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Manually trigger auto-update process
 */
export const triggerAutoUpdateProcess = async (req, res) => {
  try {
    // Check if process is already running
    if (autoUpdateSystem.isRunning) {
      return res.status(400).json({ 
        message: "Auto-update process is already running" 
      });
    }
    
    // Start the process in background
    autoUpdateSystem.processAutoUpdates().catch(error => {
      console.error('Background auto-update process failed:', error);
    });
    
    res.json({ 
      success: true, 
      message: "Auto-update process started" 
    });
  } catch (error) {
    console.error('Error triggering auto-update process:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get auto-update logs
 */
export const getAutoUpdateLogs = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20,
      action,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;
    
    // Build query for auto-update related logs
    const query = {
      action: { 
        $in: [
          'alert_auto_update_created',
          'alert_auto_update_suppressed',
          'alert_auto_update_enabled',
          'auto_update_process_completed'
        ]
      }
    };
    
    if (action) {
      query.action = action;
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }
    
    // Determine sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const logs = await Logs.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNumber);
    
    // Get total count for pagination
    const totalCount = await Logs.countDocuments(query);
    
    res.json({ 
      logs, 
      totalCount,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalCount / limitNumber)
      }
    });
  } catch (error) {
    console.error('Error fetching auto-update logs:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

