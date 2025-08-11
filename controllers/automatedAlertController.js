import Alert from '../models/Alert.js';
import Logs from '../models/Logs.js';
import { AutomatedAlertGenerator } from '../utils/automatedAlertGenerator.js';

// Get automated alerts with filtering and pagination
export const getAutomatedAlerts = async (req, res) => {
  try {
    const { 
      status = 'all', 
      page = 1, 
      limit = 20, 
      city, 
      category,
      startDate,
      endDate,
      search 
    } = req.query;

    const query = {
      alertGroupId: { $regex: /^(auto_|duplicate_)/ }
    };

    // Filter by status
    if (status !== 'all') {
      query.status = status;
    }

    // Filter by city
    if (city) {
      query.originCity = { $regex: city, $options: 'i' };
    }

    // Filter by category
    if (category) {
      query.alertCategory = category;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    // Search in title and description
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [alerts, total] = await Promise.all([
      Alert.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Alert.countDocuments(query)
    ]);

    // Group alerts by status for summary
    const statusSummary = await Alert.aggregate([
      { $match: { alertGroupId: { $regex: /^(auto_|duplicate_)/ } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const summary = {
      pending: 0,
      approved: 0,
      rejected: 0,
      total: total
    };

    statusSummary.forEach(item => {
      summary[item._id] = item.count;
    });

    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        summary
      }
    });
  } catch (error) {
    console.error('Error fetching automated alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch automated alerts',
      error: error.message
    });
  }
};

// Bulk approve alerts
export const bulkApproveAlerts = async (req, res) => {
  try {
    const { alertIds, reason } = req.body;
    const { userId, userEmail, userName } = req;

    if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Alert IDs are required'
      });
    }

    const result = await Alert.updateMany(
      { 
        _id: { $in: alertIds },
        alertGroupId: { $regex: /^(auto_|duplicate_)/ },
        status: 'pending'
      },
      { 
        status: 'approved',
        updatedBy: userName || userEmail,
        updated: new Date()
      }
    );

    // Log the bulk approval
    await Logs.createLog({
      userId,
      userEmail,
      userName,
      action: 'bulk_approve_automated_alerts',
      details: {
        alertIds,
        count: result.modifiedCount,
        reason: reason || 'Bulk approval by admin'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: `Successfully approved ${result.modifiedCount} alerts`,
      approvedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error bulk approving alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve alerts',
      error: error.message
    });
  }
};

// Bulk reject alerts
export const bulkRejectAlerts = async (req, res) => {
  try {
    const { alertIds, reason } = req.body;
    const { userId, userEmail, userName } = req;

    if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Alert IDs are required'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const result = await Alert.updateMany(
      { 
        _id: { $in: alertIds },
        alertGroupId: { $regex: /^(auto_|duplicate_)/ },
        status: 'pending'
      },
      { 
        status: 'rejected',
        updatedBy: userName || userEmail,
        updated: new Date(),
        previousVersionNotes: reason
      }
    );

    // Log the bulk rejection
    await Logs.createLog({
      userId,
      userEmail,
      userName,
      action: 'bulk_reject_automated_alerts',
      details: {
        alertIds,
        count: result.modifiedCount,
        reason
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: `Successfully rejected ${result.modifiedCount} alerts`,
      rejectedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error bulk rejecting alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject alerts',
      error: error.message
    });
  }
};

// Approve single alert
export const approveAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const { userId, userEmail, userName } = req;

    const alert = await Alert.findOne({
      _id: id,
      alertGroupId: { $regex: /^(auto_|duplicate_)/ }
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Automated alert not found'
      });
    }

    alert.status = 'approved';
    alert.updatedBy = userName || userEmail;
    alert.updated = new Date();
    if (reason) {
      alert.previousVersionNotes = reason;
    }

    await alert.save();

    // Log the approval
    await Logs.createLog({
      userId,
      userEmail,
      userName,
      action: 'approve_automated_alert',
      details: {
        alertId: id,
        reason: reason || 'Approved by admin'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Alert approved successfully',
      alert
    });
  } catch (error) {
    console.error('Error approving alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve alert',
      error: error.message
    });
  }
};

// Reject single alert
export const rejectAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const { userId, userEmail, userName } = req;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const alert = await Alert.findOne({
      _id: id,
      alertGroupId: { $regex: /^(auto_|duplicate_)/ }
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Automated alert not found'
      });
    }

    alert.status = 'rejected';
    alert.updatedBy = userName || userEmail;
    alert.updated = new Date();
    alert.previousVersionNotes = reason;

    await alert.save();

    // Log the rejection
    await Logs.createLog({
      userId,
      userEmail,
      userName,
      action: 'reject_automated_alert',
      details: {
        alertId: id,
        reason
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Alert rejected successfully',
      alert
    });
  } catch (error) {
    console.error('Error rejecting alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject alert',
      error: error.message
    });
  }
};

// Get automated alert statistics
export const getAutomatedAlertStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {
      alertGroupId: { $regex: /^(auto_|duplicate_)/ }
    };

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) {
        matchStage.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        matchStage.createdAt.$lte = new Date(endDate);
      }
    }

    const stats = await Alert.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            status: '$status',
            city: '$originCity',
            category: '$alertCategory'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Process stats into a more usable format
    const processedStats = {
      byStatus: {},
      byCity: {},
      byCategory: {},
      total: 0
    };

    stats.forEach(stat => {
      const { status, city, category } = stat._id;
      const count = stat.count;

      // By status
      processedStats.byStatus[status] = (processedStats.byStatus[status] || 0) + count;

      // By city
      if (city) {
        processedStats.byCity[city] = (processedStats.byCity[city] || 0) + count;
      }

      // By category
      if (category) {
        processedStats.byCategory[category] = (processedStats.byCategory[category] || 0) + count;
      }

      processedStats.total += count;
    });

    res.json({
      success: true,
      data: processedStats
    });
  } catch (error) {
    console.error('Error fetching automated alert stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};

// Manually trigger alert generation for testing
export const triggerAlertGeneration = async (req, res) => {
  try {
    const { city } = req.query;
    const { userId, userEmail, userName } = req;

    const generator = new AutomatedAlertGenerator();

    let results;
    if (city) {
      // Generate for specific city
      const alerts = await generator.generateAlertsForCity(city);
      results = {
        total: alerts.length,
        city: city,
        alerts: alerts
      };
    } else {
      // Generate for all cities
      results = await generator.generateAlertsForAllCities();
    }

    // Log the manual trigger
    await Logs.createLog({
      userId,
      userEmail,
      userName,
      action: 'manual_trigger_alert_generation',
      details: {
        city: city || 'all',
        results
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Alert generation triggered successfully',
      results
    });
  } catch (error) {
    console.error('Error triggering alert generation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger alert generation',
      error: error.message
    });
  }
}; 