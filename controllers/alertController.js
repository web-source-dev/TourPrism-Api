const Alert = require("../models/Alert.js");
const Logger = require('../utils/logger.js');
const { io } = require("../index.js");

// Get all alerts for feed page
const getAllAlerts = async (req, res) => {
  try {
    const { city, limit = 10, page = 1, sortBy = 'latest', activeNow, id } = req.query;

    // If specific alert ID is requested, return just that alert
    if (id) {
      const alert = await Alert.findById(id)
        .populate('followedBy', '_id')
        .lean();

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      return res.json({
        success: true,
        alerts: [{
          ...alert,
          isFollowing: req.userId ? alert.followedBy?.some(user => user._id.toString() === req.userId) : false
        }],
        totalCount: 1,
        currentPage: 1
      });
    }

    // Base query - active alerts are those with status "approved"
    // The system automatically archives alerts when end date passes
    // Additionally, hide alerts whose startDate is in the past (negative "time ahead")
    // Keep alerts with no startDate to avoid unintentionally hiding legacy entries
    const now = new Date();
    let query = {
      status: "approved",
      $or: [
        { startDate: { $exists: false } },
        { startDate: null },
        { startDate: { $gte: now } }
      ]
    };

    // City filter - simple exact match
    if (city && typeof city === 'string') {
      query.city = new RegExp(city, 'i');
    }

    // Pagination
    const limitValue = parseInt(limit);
    const skipValue = (parseInt(page) - 1) * limitValue;

    // Get total count for pagination
    const total = await Alert.countDocuments(query);

    // Simple sorting - only latest for feed
    const alerts = await Alert.find(query)
      .populate('followedBy', '_id')
      .sort({ createdAt: -1 }) // Always sort by latest
      .skip(skipValue)
      .limit(limitValue)
      .lean();

    // Calculate if user is following each alert
    const transformedAlerts = alerts.map((alert) => {
      return {
        ...alert,
        isFollowing: req.userId ? alert.followedBy?.some(user => user._id.toString() === req.userId) : false
      };
    });

    // Add view count increment (background operation)
    if (alerts.length > 0) {
      const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
      const currentHour = new Date().getHours();
      const cacheKey = `view_${clientIP}_${currentHour}`;

      if (!req.app.locals.viewCache) {
        req.app.locals.viewCache = new Set();
      }

      if (!req.app.locals.viewCache.has(cacheKey)) {
        req.app.locals.viewCache.add(cacheKey);

        setTimeout(() => {
          req.app.locals.viewCache.delete(cacheKey);
        }, 60 * 60 * 1000);

        const alertIds = alerts.map(alert => alert._id);

        Alert.updateMany(
          { _id: { $in: alertIds } },
          { $inc: { viewCount: 1 } }
        ).exec().catch(error => {
          console.error('Error updating view counts:', error);
        });
      }
    }

    await Logger.log(req, 'alerts_viewed', {
      filters: { city, limit, page }
    });

    res.json({
      alerts: transformedAlerts,
      totalCount: total,
      currentPage: parseInt(page),
      isAuthenticated: !!req.userId
    });
  } catch (error) {
    console.error("Error in /api/alerts:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// Get city alert summary for home page
const getCitySummary = async (req, res) => {
  try {
    // Count approved alerts by city
    const cityAlerts = await Alert.aggregate([
      {
        $match: {
          status: 'approved'
        }
      },
      {
        $group: {
          _id: '$city',
          alertCount: { $sum: 1 }
        }
      },
      {
        $project: {
          city: '$_id',
          alertCount: 1,
          _id: 0
        }
      },
      {
        $sort: { alertCount: -1 }
      }
    ]);

    res.json(cityAlerts);
  } catch (error) {
    console.error('Error fetching city summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


module.exports = {
  getAllAlerts,
  getCitySummary
};

