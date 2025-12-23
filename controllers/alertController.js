const Alert = require("../models/Alert.js");
const Logger = require('../utils/logger.js');
const { io } = require("../index.js");
const impactCalculator = require('../config/impactCalculator.js');

// Get all alerts (with optional filtering)
const getAllAlerts = async (req, res) => {
  try {
    const { city, mainType, latitude, longitude, distance, limit = 10, page = 1, sortBy, startDate, endDate, originOnly, activeNow } = req.query;
    
    const currentDate = new Date();
    const isActiveNow = String(activeNow).toLowerCase() === 'true';
    
    // Base query with status approved
    let query = { 
      status: "approved",
    };

    // Active-now filter: started and not ended yet
    if (isActiveNow) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { startDate: { $exists: false } },
          { startDate: { $lte: currentDate } } // already started
        ]
      });
      query.$and.push({
        $or: [
          { endDate: { $exists: false } },
          { endDate: { $gt: currentDate } } // not finished
        ]
      });
    } else {
      // Default: exclude expired alerts (endDate date has passed)
      query.$or = [
        { endDate: { $gt: currentDate } }, // End date in future
        { endDate: { $exists: false } }    // No end date specified
      ];
    }

    
    // City filter - check primary city and origin city
    if (city && typeof city === 'string') {
      if (originOnly === 'true') {
        // Only search in primary city
        const cityRegex = new RegExp(city, 'i');
        query.$or = query.$or || [];
        query.$or.push(
          { city: cityRegex }
        );
      } else {
        // Search in both city and originCity
        query.$or = query.$or || [];
        const cityRegex = new RegExp(city, 'i');
        query.$or.push(
          { city: cityRegex },
          { originCity: cityRegex }
        );
      }
    }
    
    // Incident types filter - use mainType
    if (mainType) {
      query.mainType = { $in: Array.isArray(mainType) ? mainType : [mainType] };
    }
    
    
    // Time range filter - use startDate and endDate fields
    if (startDate || endDate) {
      query.$and = query.$and || [];

      // If we have a start date, find alerts that:
      // 1. End after our start date OR
      // 2. Don't have an end date but start after our start date
      if (startDate) {
        const parsedStartDate = new Date(startDate);
        query.$and.push({
          $or: [
            { endDate: { $gte: parsedStartDate } },
            { endDate: { $exists: false }, startDate: { $gte: parsedStartDate } }
          ]
        });
      }

      // If we have an end date, find alerts that:
      // 1. Start before our end date OR
      // 2. Don't have a start date but end before our end date
      if (endDate) {
        const parsedEndDate = new Date(endDate);
        query.$and.push({
          $or: [
            { startDate: { $lte: parsedEndDate } },
            { startDate: { $exists: false }, endDate: { $lte: parsedEndDate } }
          ]
        });
      }
    }
    
    // Distance filter - simplified since we don't have geospatial data in new model
    // This would need to be implemented differently if geospatial search is required
    if (latitude && longitude && distance) {
      // For now, skip distance filtering since new model doesn't have location coordinates
      console.log('Distance filtering not implemented in new alert model');
    }

    // Limit results for non-authenticated users
    let limitValue = parseInt(limit);
    let skipValue = (parseInt(page) - 1) * limitValue;

    // Get total count for pagination
    const total = await Alert.countDocuments(query);
    
    // Define sorting options
    let sortOptions = {};
    switch (sortBy) {
      case 'latest':
        sortOptions = { createdAt: -1 };
        break;
      case 'highest_impact':
        // Sort by confidence score (higher confidence = more impact)
        sortOptions = {
          confidence: -1,
          createdAt: -1 // Secondary sort by creation date
        };
        break;
      default:
        // Default to most recently created
        sortOptions = { createdAt: -1 };
    }
    
    let alerts = [];
    
    // Determine if we should use standard sorting or advanced aggregation
    if (sortBy !== undefined) {
      // Use standard sorting
      alerts = await Alert.find(query)
        .populate('followedBy', '_id')
        .sort(sortOptions)
        .skip(skipValue)
        .limit(limitValue)
        .lean();
    } else {
      // For default sorting, use aggregation to prioritize recently updated content
      const aggregatePipeline = [
        { $match: query },
        { $addFields: {
            mostRecentActivity: {
              $cond: {
                if: { $gt: ["$updatedAt", "$createdAt"] },
                then: "$updatedAt",
                else: "$createdAt"
              }
            }
        }},
        { $sort: { mostRecentActivity: -1 } },
        { $skip: skipValue },
        { $limit: limitValue }
      ];
      
      alerts = await Alert.aggregate(aggregatePipeline)
        .exec()
        .then(results => Alert.populate(results, [
          { path: 'followedBy', select: '_id' }
        ]));
    }

    // Get user's hotel data for impact calculations (only for authenticated users)
    let hotelImpactData = null;
    if (req.userId && req.user) {
      const user = req.user;
      if (user.company && user.company.size && user.company.rooms && user.company.avgRoomRate) {
        const hasIncentive = user.company.incentives && user.company.incentives.length > 0;
        const additionalIncentives = hasIncentive ? Math.max(user.company.incentives.length - 1, 0) : 0;

        hotelImpactData = {
          size: user.company.size,
          rooms: user.company.rooms,
          avgRoomRate: user.company.avgRoomRate,
          hasIncentive,
          additionalIncentives
        };
      }
    }

    // Calculate hotel-specific impact for each alert and check if user is following
    const transformedAlerts = await Promise.all(alerts.map(async (alert) => {
      let hotelImpact = null;

      // Calculate hotel-specific impact if user has hotel data
      if (hotelImpactData) {
        try {
          hotelImpact = impactCalculator.calculateImpact(hotelImpactData, {
            mainType: alert.mainType,
            start_date: alert.startDate,
            end_date: alert.endDate
          }, hotelImpactData.hasIncentive, hotelImpactData.additionalIncentives);

          // Generate UI text according to CALCULATIONS.pdf format
          hotelImpact.uiText = {
            header: `${alert.title} could empty ${hotelImpact.nightsAtRisk} rooms ${impactCalculator.generateWhenText(alert.startDate)} impacting £${hotelImpact.poundsAtRisk}`,
            recovery: `Tap to save ${hotelImpact.nightsSaved.min} to ${hotelImpact.nightsSaved.max} nights worth £${hotelImpact.poundsSaved.min} to £${hotelImpact.poundsSaved.max}`
          };
        } catch (error) {
          console.error('Error calculating hotel impact:', error);
          hotelImpact = null;
        }
      }

      return {
        ...alert,
        isFollowing: req.userId ? alert.followedBy?.some(user => user._id.toString() === req.userId) : false,
        hotelImpact // Add hotel-specific impact data
      };
    }));

    // Add one view count for this feed request (in background, don't wait for it)
    if (alerts.length > 0) {
      // Get client IP address
      const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
      
      // Create a simple cache key based on IP and current hour to prevent multiple views per hour
      const currentHour = new Date().getHours();
      const cacheKey = `view_${clientIP}_${currentHour}`;
      
      // Check if we've already recorded a view for this IP in this hour
      // Using a simple in-memory check (you could use Redis or similar for production)
      if (!req.app.locals.viewCache) {
        req.app.locals.viewCache = new Set();
      }
      
      if (!req.app.locals.viewCache.has(cacheKey)) {
        // Add to cache to prevent duplicate views
        req.app.locals.viewCache.add(cacheKey);
        
        // Clean up old cache entries (older than 1 hour)
        setTimeout(() => {
          req.app.locals.viewCache.delete(cacheKey);
        }, 60 * 60 * 1000); // 1 hour
        
        // Increment view count for all alerts in this request
        const alertIds = alerts.map(alert => alert._id);
        
        Alert.updateMany(
          { _id: { $in: alertIds } },
          { $inc: { viewCount: 1 } }
        ).exec().catch(error => {
          console.error('Error updating view counts:', error);
          // Don't fail the request if view count update fails
        });
      }
    }

    await Logger.log(req, 'alerts_viewed', {
      filters: { city, mainType, latitude, longitude, distance, limit, page, sortBy, startDate, endDate, originOnly }
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
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Find all unique cities with alerts in the next 7 days (using location.city or impactLocations.city)
    const cityAlerts = await Alert.aggregate([
      {
        $match: {
          status: 'approved',
          $or: [
            {
              startDate: {
                $gte: now,
                $lte: nextWeek
              }
            },
            {
              endDate: {
                $gte: now,
                $lte: nextWeek
              }
            },
            {
              $and: [
                { startDate: { $lte: now } },
                { endDate: { $gte: now } }
              ]
            }
          ]
        }
      },
      {
        $project: {
          mainType: 1,
          confidence: 1,
          city: 1,
          originCity: 1
        }
      },
      {
        $group: {
          _id: { city: { $ifNull: ['$originCity', '$city'] } },
          alertCount: { $sum: 1 },
          alerts: { $push: '$$ROOT' }
        }
      }
    ]);

    const cityData = cityAlerts.map(cityGroup => {
      const city = cityGroup._id.city;
      const alerts = cityGroup.alerts;
      const alertCount = cityGroup.alertCount;
      
      // Find highest confidence level
      let highestConfidenceLevel = 'Low';
      let hasHighConfidence = false;
      let hasModerateConfidence = false;

      alerts.forEach(alert => {
        if (alert.confidence >= 0.8) {
          highestConfidenceLevel = 'High';
          hasHighConfidence = true;
        } else if (alert.confidence >= 0.6 && !hasHighConfidence) {
          highestConfidenceLevel = 'Moderate';
          hasModerateConfidence = true;
        }
      });

      // Find most common main type
      const mainTypeCount = {};
      alerts.forEach(alert => {
        if (alert.mainType) {
          mainTypeCount[alert.mainType] = (mainTypeCount[alert.mainType] || 0) + 1;
        }
      });

      const highestImpactMainType = Object.keys(mainTypeCount).reduce((a, b) =>
        mainTypeCount[a] > mainTypeCount[b] ? a : b, 'General'
      );
      
      return {
        city,
        alertCount,
        highestImpactMainType,
        highestConfidenceLevel,
        hasHighConfidence,
        hasModerateConfidence
      };
    });

    // Sort by alert count descending
    cityData.sort((a, b) => b.alertCount - a.alertCount);

    res.json(cityData);
  } catch (error) {
    console.error('Error fetching city summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllAlerts,
  getCitySummary
};

