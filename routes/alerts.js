import express from "express";
import Alert from "../models/Alert.js";
import User from "../models/User.js";
import Logger from '../utils/logger.js';
import { upload, getFileType } from "../utils/fileUpload.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { io } from "../index.js";
import ActionHub from "../models/ActionHub.js";

const router = express.Router();

// Create a new alert
router.post(
  "/create",
  authenticate,
  upload.array("media", 5),
  async (req, res) => {
    try {
      const {
        alertCategory,
        alertType,
        title,
        description,
        risk,
        impact,
        priority,
        targetAudience,
        recommendedAction,
        linkToSource,
        expectedStart,
        expectedEnd,
        // Origin location fields
        originLatitude,
        originLongitude,
        originCity,
        originCountry,
        originPlaceId,
        // Impact locations array
        impactLocations,
        // Legacy location fields (for backward compatibility)
        latitude,
        longitude,
        city,
        country
      } = req.body;

      // Process uploaded files
      const mediaFiles = req.files?.map(file => ({
        url: `uploads/${file.filename}`,
        type: getFileType(file.mimetype)
      })) || [];

      // Convert string date fields to Date objects if provided
      let parsedExpectedStart = undefined;
      let parsedExpectedEnd = undefined;
      
      if (expectedStart) {
        parsedExpectedStart = new Date(expectedStart);
      }
      
      if (expectedEnd) {
        parsedExpectedEnd = new Date(expectedEnd);
      }

      // Parse impact locations if provided as a string
      let parsedImpactLocations = [];
      if (impactLocations) {
        try {
          if (typeof impactLocations === 'string') {
            parsedImpactLocations = JSON.parse(impactLocations);
          } else {
            parsedImpactLocations = impactLocations;
          }
          
          // Ensure each impact location has the required GeoJSON structure
          parsedImpactLocations = parsedImpactLocations.map(loc => ({
            latitude: parseFloat(loc.latitude),
            longitude: parseFloat(loc.longitude),
            city: loc.city,
            country: loc.country,
            placeId: loc.placeId,
            location: {
              type: 'Point',
              coordinates: [parseFloat(loc.longitude), parseFloat(loc.latitude)]
            }
          }));
        } catch (error) {
          console.error("Error parsing impact locations:", error);
          parsedImpactLocations = [];
        }
      }

      // Set up the alert object with appropriate location fields
      const alertData = {
        userId: req.userId,
        alertCategory,
        alertType,
        title,
        description,
        risk,
        impact,
        priority,
        targetAudience,
        recommendedAction,
        linkToSource,
        media: mediaFiles,
        expectedStart: parsedExpectedStart,
        expectedEnd: parsedExpectedEnd
      };

      // Handle origin location (new primary location)
      if (originLatitude && originLongitude) {
        alertData.originLatitude = parseFloat(originLatitude);
        alertData.originLongitude = parseFloat(originLongitude);
        alertData.originCity = originCity;
        alertData.originCountry = originCountry;
        alertData.originPlaceId = originPlaceId;
        alertData.originLocation = {
          type: 'Point',
          coordinates: [parseFloat(originLongitude), parseFloat(originLatitude)]
        };
        
        // Also set legacy fields for backward compatibility
        alertData.latitude = parseFloat(originLatitude);
        alertData.longitude = parseFloat(originLongitude);
        alertData.city = originCity;
        alertData.location = {
          type: 'Point',
          coordinates: [parseFloat(originLongitude), parseFloat(originLatitude)]
        };
      } 
      // Fall back to legacy fields if origin not provided
      else if (latitude && longitude) {
        alertData.latitude = parseFloat(latitude);
        alertData.longitude = parseFloat(longitude);
        alertData.city = city;
        alertData.location = {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        };
        
        // Also set as origin for new schema compatibility
        alertData.originLatitude = parseFloat(latitude);
        alertData.originLongitude = parseFloat(longitude);
        alertData.originCity = city;
        alertData.originCountry = country;
        alertData.originLocation = {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        };
      }
      
      // Add impact locations if available
      if (parsedImpactLocations.length > 0) {
        alertData.impactLocations = parsedImpactLocations;
      }

      // Create and save the alert
      const alert = new Alert(alertData);
      await alert.save();

      // Emit real-time update
      io.emit('alert:created', {
        alert,
        message: 'New alert created'
      });

      // Log alert creation
      try {
        await Logger.log(req, 'alert_created', {
          alertId: alert._id,
          title: alert.title,
          category: alertCategory,
          type: alertType,
          impactLocationsCount: parsedImpactLocations.length,
          hasMedia: mediaFiles.length > 0
        });
      } catch (logError) {
        console.error('Error logging alert creation:', logError);
        // Continue execution even if logging fails
      }

      res.status(201).json({
        message: "Alert created successfully",
        alert,
      });
    } catch (error) {
      console.error("Error creating alert:", error);
      res.status(500).json({ 
        message: "Failed to create alert",
        error: error.message 
      });
    }
  }
);

// Get all alerts (with optional filtering)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { city, alertCategory, latitude, longitude, distance, limit = 10, page = 1, sortBy, startDate, endDate, originOnly, impact, targetAudience } = req.query;
    
    const currentDate = new Date();
    
    // Base query with status approved and exclude archived alerts (expectedEnd date has passed)
    let query = { 
      status: "approved",
      $or: [
        { expectedEnd: { $gt: currentDate } }, // End date in future
        { expectedEnd: { $exists: false } }    // No end date specified
      ]
    };

    // Impact level filter
    if (impact) {
      // Handle both array and single string cases
      const impactLevels = Array.isArray(impact) ? impact : [impact];
      // Ensure only valid impact levels are used
      const validImpactLevels = impactLevels.filter(level => 
        ['Low', 'Moderate', 'High'].includes(level)
      );
      if (validImpactLevels.length > 0) {
        query.impact = { $in: validImpactLevels };
      }
    }
    console.log(impact);
    
    // City filter - check both origin city and impact cities unless originOnly is true
    if (city && typeof city === 'string') {
      if (originOnly === 'true') {
        // Only search in origin city
        query.originCity = new RegExp(city, 'i');
      } else {
        // Search in all city fields (origin, impact, and legacy)
        query.$or = query.$or || [];
        query.$or.push(
          { originCity: new RegExp(city, 'i') },
          { city: new RegExp(city, 'i') },  // Legacy field
          { 'impactLocations.city': new RegExp(city, 'i') }
        );
      }
    }
    
    // Incident types filter - updated to use alertCategory
    if (alertCategory) {
      query.alertCategory = { $in: Array.isArray(alertCategory) ? alertCategory : [alertCategory] };
    }
    
    // Target audience filter
    if (targetAudience) {
      const targetAudienceArray = Array.isArray(targetAudience) ? targetAudience : [targetAudience];
      query.targetAudience = { $in: targetAudienceArray };
    }
    
    // Time range filter - use expectedStart and expectedEnd fields
    if (startDate || endDate) {
      query.$and = query.$and || [];
      
      // If we have a start date, find alerts that:
      // 1. End after our start date OR
      // 2. Don't have an end date but start after our start date
      if (startDate) {
        const parsedStartDate = new Date(startDate);
        query.$and.push({
          $or: [
            { expectedEnd: { $gte: parsedStartDate } },
            { expectedEnd: { $exists: false }, expectedStart: { $gte: parsedStartDate } }
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
            { expectedStart: { $lte: parsedEndDate } },
            { expectedStart: { $exists: false }, expectedEnd: { $lte: parsedEndDate } }
          ]
        });
      }
    }
    
    // Distance filter - handle both origin and impact locations (or just origin if originOnly=true)
    if (latitude && longitude && distance) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      // Convert distance from km to radians (Earth's radius ≈ 6371 km)
      const radiusInRadians = parseFloat(distance) / 6371;

      // Create a $geoWithin query 
      let geoQuery;
      
      if (originOnly === 'true') {
        // Only search in origin location
        geoQuery = {
          originLocation: {
            $geoWithin: {
              $centerSphere: [[lng, lat], radiusInRadians]
            }
          }
        };
      } else {
        // Search in both origin and impact locations
        geoQuery = {
          $or: [
            // Search in origin location (new primary field)
            { 
              originLocation: {
                $geoWithin: {
                  $centerSphere: [[lng, lat], radiusInRadians]
                }
              }
            },
            // Search in impact locations array
            {
              'impactLocations.location': {
                $geoWithin: {
                  $centerSphere: [[lng, lat], radiusInRadians]
                }
              }
            },
            // Also search in legacy location field for backward compatibility
            {
              location: {
                $geoWithin: {
                  $centerSphere: [[lng, lat], radiusInRadians]
                }
              }
            }
          ]
        };
      }

      // Add to query
      if (query.$and) {
        query.$and.push(geoQuery);
      } else {
        query.$and = [geoQuery];
      }
    }

    // Limit results for non-authenticated users
    let limitValue = parseInt(limit);
    let skipValue = (parseInt(page) - 1) * limitValue;
    
    if (!req.userId) {
      limitValue = 15; // Only return 15 alerts for non-logged-in users
      skipValue = 0;  // Always return the first 15
    }

    // Get total count for pagination
    const total = await Alert.countDocuments(query);
    
    // Define sorting options
    let sortOptions = {};
    switch (sortBy) {
      case 'latest':
        sortOptions = { createdAt: -1 };
        break;
      case 'highest_impact':
        // First sort by impact (High > Moderate > Low)
        sortOptions = { 
          impact: -1,
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
        .populate('userId', '_id email')
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
          { path: 'userId', select: '_id email' },
          { path: 'followedBy', select: '_id' }
        ]));
    }

    // Check if user is following each alert
    const transformedAlerts = alerts.map(alert => ({
      ...alert,
      isFollowing: req.userId ? alert.followedBy?.some(user => user._id.toString() === req.userId) : false,
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
      filters: { city, alertCategory, latitude, longitude, distance, limit, page, sortBy, startDate, endDate, originOnly, impact, targetAudience }
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
});

// Follow/unfollow alert
router.post("/:id/follow", authenticate, async (req, res) => {
  try {
    const alertId = req.params.id;
    const userId = req.userId;

    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user already has an ActionHub item for this alert
    let actionHubItem = await ActionHub.findOne({ 
      userId: userId,
      $or: [{ alert: alertId }, { alertId: alertId }]
    });
    
    let wasFollowing = false;
    let isFollowing = true; // Default value when creating a new entry
    
    if (!actionHubItem) {
      // Create new action hub entry for this user
      actionHubItem = new ActionHub({
        userId: userId,
        alert: alertId,
        alertId: alertId,
        isFollowing: true,
        flagged: false, // Not flagged by default
        actionLogs: [{
          user: userId,
          actionType: 'follow',
          actionDetails: 'Started following alert'
        }]
      });
      
      await actionHubItem.save();
    } else {
      // Toggle following state
      wasFollowing = actionHubItem.isFollowing;
      isFollowing = !wasFollowing;
      
      if (isFollowing) {
        // User is following the alert again
        actionHubItem.isFollowing = true;
        actionHubItem.actionLogs.push({
          user: userId,
          actionType: 'follow',
          actionDetails: 'Started following alert'
        });
        
        await actionHubItem.save();
      } else {
        // User is unfollowing the alert
        if (actionHubItem.flagged) {
          // If the alert is flagged, keep the ActionHub item but update isFollowing
          actionHubItem.isFollowing = false;
          actionHubItem.actionLogs.push({
            user: userId,
            actionType: 'follow',
            actionDetails: 'Stopped following alert'
          });
          
          await actionHubItem.save();
        } else {
          // If the alert is not flagged, remove the ActionHub item completely
          await ActionHub.deleteOne({ 
            userId: userId,
            $or: [{ alert: alertId }, { alertId: alertId }]
          });
        }
      }
    }

    // Count the total number of users following this alert
    const followingCount = await ActionHub.countDocuments({
      $or: [{ alert: alertId }, { alertId: alertId }],
      isFollowing: true
    });
    
    // Update the alert's followedBy array and numberOfFollows
    await Alert.findByIdAndUpdate(alertId, {
      followedBy: await ActionHub.distinct('userId', { 
        $or: [{ alert: alertId }, { alertId: alertId }], 
        isFollowing: true 
      }),
      numberOfFollows: followingCount
    });

    // Update the user's followedAlerts array
    if (!user.followedAlerts) {
      user.followedAlerts = [];
    }
    
    if (isFollowing && !user.followedAlerts.includes(alertId)) {
      user.followedAlerts.push(alertId);
    } else if (!isFollowing) {
      user.followedAlerts = user.followedAlerts.filter(id => id.toString() !== alertId.toString());
    }
    
    await user.save();

    // Log follow/unfollow action
    try {
      await Logger.log(req, isFollowing ? 'alert_followed' : 'alert_unfollowed', {
        alertId,
        alertTitle: alert.title,
        followCount: followingCount
      });
    } catch (logError) {
      console.error('Error logging follow action:', logError);
      // Continue execution even if logging fails
    }

    // Emit real-time update
    io.emit('alert:followed', {
      alertId: alert._id,
      numberOfFollows: followingCount,
      following: isFollowing
    });

    res.json({ 
      following: isFollowing,
      numberOfFollows: followingCount
    });
  } catch (error) {
    console.error("Error following alert:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all followed alerts for a user
router.get("/following", authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    const user = await User.findById(userId).populate({
      path: 'followedAlerts',
      options: { sort: { 'createdAt': -1 } }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ 
      alerts: user.followedAlerts || [],
      totalCount: user.followedAlerts?.length || 0
    });
  } catch (error) {
    console.error("Error getting followed alerts:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get alert by ID
router.get("/:id", async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id)
      .populate("userId", "email");
    
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    res.json(alert);
  } catch (error) {
    console.error("Error fetching alert:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get user's alerts
router.get("/user/my-alerts", authenticate, async (req, res) => {
  try {
    const alerts = await Alert.find({ userId: req.userId })
      .sort({ createdAt: -1 });
    
    res.json(alerts);
  } catch (error) {
    console.error("Error fetching user alerts:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Like alert
router.post("/:id/like", authenticate, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    const likedIndex = alert.likedBy.indexOf(req.userId);
    const wasLiked = likedIndex !== -1;
    
    if (likedIndex === -1) {
      alert.likedBy.push(req.userId);
      alert.likes += 1;
    } else {
      alert.likedBy.splice(likedIndex, 1);
      alert.likes -= 1;
    }

    await alert.save();

    // Log like/unlike action
    try {
      await Logger.log(req, wasLiked ? 'alert_unliked' : 'alert_liked', {
        alertId: alert._id,
        alertTitle: alert.title,
        likeCount: alert.likes
      });
    } catch (logError) {
      console.error('Error logging like action:', logError);
      // Continue execution even if logging fails
    }

    // Emit real-time update
    io.emit('alert:liked', {
      alertId: alert._id,
      likes: alert.likes,
      liked: likedIndex === -1
    });

    res.json({ likes: alert.likes, liked: likedIndex === -1 });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Share alert
router.post("/:id/share", authenticate, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    const sharedIndex = alert.sharedBy.indexOf(req.userId);
    if (sharedIndex === -1) {
      alert.sharedBy.push(req.userId);
      alert.shares += 1;
    }

    await alert.save();

    // Log share action
    try {
      await Logger.log(req, 'alert_shared', {
        alertId: alert._id,
        alertTitle: alert.title,
        shareCount: alert.shares
      });
    } catch (logError) {
      console.error('Error logging share action:', logError);
      // Continue execution even if logging fails
    }

    // Emit real-time update
    io.emit('alert:shared', {
      alertId: alert._id,
      shares: alert.shares
    });

    res.json({ shares: alert.shares });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Flag alert
router.post("/:id/flag", authenticate, async (req, res) => {
  try {
    const alertId = req.params.id;
    const userId = req.userId;

    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    // Check if user already has an action hub item for this alert
    let actionHubItem = await ActionHub.findOne({ 
      userId: userId,
      $or: [{ alert: alertId }, { alertId: alertId }]
    });
    
    if (!actionHubItem) {
      // Create new action hub entry for this user and alert
      actionHubItem = new ActionHub({
        userId: userId,
        alert: alertId,
        alertId: alertId,
        flagged: true,
        isFollowing: false, // Not following yet, just flagging
        actionLogs: [{
          user: userId,
          actionType: 'flag',
          actionDetails: 'Added alert to Action Hub'
        }]
      });
    } else {
      // Toggle flagged state
      actionHubItem.flagged = !actionHubItem.flagged;
      
      // Add log entry
      actionHubItem.actionLogs.push({
        user: userId,
        actionType: 'flag',
        actionDetails: actionHubItem.flagged ? 'Flagged alert' : 'Unflagged alert'
      });
    }
    
    await actionHubItem.save();

    // Count total number of users who have flagged this alert
    const flaggedCount = await ActionHub.countDocuments({
      $or: [{ alert: alertId }, { alertId: alertId }],
      flagged: true
    });
    
    // Update the alert's flaggedBy array
    await Alert.findByIdAndUpdate(alertId, {
      flaggedBy: await ActionHub.distinct('userId', { 
        $or: [{ alert: alertId }, { alertId: alertId }], 
        flagged: true 
      })
    });

    // Emit real-time update
    io.emit('alert:flagged', {
      alertId: alert._id,
      flagged: actionHubItem.flagged,
      flagCount: flaggedCount
    });

    res.json({ 
      flagged: actionHubItem.flagged,
      flagCount: flaggedCount
    });
  } catch (error) {
    console.error("Error flagging alert:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get city alert summary for home page
router.get('/cities/summary', optionalAuth, async (req, res) => {
  try {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Find all unique cities with alerts in the next 7 days
    const cityAlerts = await Alert.aggregate([
      {
        $match: {
          status: 'approved',
          $or: [
            {
              expectedStart: {
                $gte: now,
                $lte: nextWeek
              }
            },
            {
              expectedEnd: {
                $gte: now,
                $lte: nextWeek
              }
            },
            {
              $and: [
                { expectedStart: { $lte: now } },
                { expectedEnd: { $gte: now } }
              ]
            }
          ]
        }
      },
      {
        $group: {
          _id: {
            city: { $ifNull: ['$originCity', '$city'] }
          },
          alertCount: { $sum: 1 },
          alerts: { $push: '$$ROOT' }
        }
      },
      {
        $match: {
          '_id.city': { $ne: null, $ne: '' }
        }
      }
    ]);

    const cityData = cityAlerts.map(cityGroup => {
      const city = cityGroup._id.city;
      const alerts = cityGroup.alerts;
      const alertCount = cityGroup.alertCount;
      
      // Find highest impact level
      let highestImpactLevel = 'Low';
      let hasHighImpact = false;
      let hasModerateImpact = false;
      
      alerts.forEach(alert => {
        if (alert.impact === 'High') {
          highestImpactLevel = 'High';
          hasHighImpact = true;
        } else if (alert.impact === 'Moderate' && !hasHighImpact) {
          highestImpactLevel = 'Moderate';
          hasModerateImpact = true;
        }
      });
      
      // Find most common category
      const categoryCount = {};
      alerts.forEach(alert => {
        if (alert.alertCategory) {
          categoryCount[alert.alertCategory] = (categoryCount[alert.alertCategory] || 0) + 1;
        }
      });
      
      const highestImpactCategory = Object.keys(categoryCount).reduce((a, b) => 
        categoryCount[a] > categoryCount[b] ? a : b, 'General'
      );
      
      return {
        city,
        alertCount,
        highestImpactCategory,
        highestImpactLevel,
        hasHighImpact,
        hasModerateImpact
      };
    });

    // Sort by alert count descending
    cityData.sort((a, b) => b.alertCount - a.alertCount);

    res.json(cityData);
  } catch (error) {
    console.error('Error fetching city summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;