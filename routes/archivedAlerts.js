import express from "express";
import Alert from "../models/Alert.js";
import User from "../models/User.js";
import Logs from "../models/Logs.js";
import { authenticateRole } from "../middleware/auth.js";

const router = express.Router();

// Get all archived alerts (alerts whose expectedEnd date has passed) - Admin only
router.get("/", authenticateRole(['admin', 'manager', 'viewer', 'editor']), async (req, res) => {
  try {
    const { city, incidentTypes, latitude, longitude, distance, limit = 10, page = 1, sortBy, timeRange, originOnly } = req.query;
    
    // Log archived alerts view if user is authenticated
    if (req.userId) {
      try {
        const user = req.userId ? await User.findById(req.userId).select('firstName lastName email') : null;
      } catch (error) {
        console.error('Error logging archived alerts view:', error);
        // Continue execution even if logging fails
      }
    }
    
    const currentDate = new Date();
    
    // Base query: get approved alerts whose expectedEnd date has passed
    let query = { 
      status: "approved",
      expectedEnd: { $lt: currentDate, $exists: true }
    };
    
    // Time range filter (how long ago the alert ended)
    if (timeRange && Number(timeRange) > 0) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - Number(timeRange));
      
      // Find alerts that ended within the specified time range (between daysAgo and now)
      query.expectedEnd = {
        $lt: currentDate, // Ended before now (already in the query)
        $gt: daysAgo,     // But ended after X days ago
        $exists: true
      };
    }
    
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
    
    // Incident types filter
    if (incidentTypes) {
      query.alertType = { $in: Array.isArray(incidentTypes) ? incidentTypes : [incidentTypes] };
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

      // Add to query using $and
      query.$and = query.$and || [];
      query.$and.push(geoQuery);
    }

    // For admin users, fetch all alerts without pagination limits
    // For non-authenticated users, apply limits
    let limitValue = parseInt(limit);
    let skipValue = (parseInt(page) - 1) * limitValue;
    
    // Only apply limits for non-authenticated users
    if (!req.userId) {
      limitValue = 15;
      skipValue = 0;
    }

    // Get total count for pagination
    const total = await Alert.countDocuments(query);
    
    // Define sorting options
    let sortOptions = {};
    switch (sortBy) {
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      case 'oldest':
        sortOptions = { createdAt: 1 };
        break;
      case 'relevant':
        sortOptions = { numberOfFollows: -1 };
        break;
      default:
        // Default to most recently ended
        sortOptions = { expectedEnd: -1 };
    }
    
    // Fetch archived alerts - no limit for admin users
    let alertsQuery = Alert.find(query)
      .populate('userId', '_id email')
      .populate('followedBy', '_id')
      .sort(sortOptions);
    
    // Only apply skip and limit for non-admin users
    if (!req.userId) {
      alertsQuery = alertsQuery.skip(skipValue).limit(limitValue);
    }
    
    const alerts = await alertsQuery.lean();

    // Check if user is following each alert
    const transformedAlerts = alerts.map(alert => ({
      ...alert,
      isFollowing: req.userId ? alert.followedBy?.some(user => user._id.toString() === req.userId) : false,
    }));

    res.json({
      alerts: transformedAlerts,
      totalCount: total,
      currentPage: parseInt(page),
      isAuthenticated: !!req.userId
    });
  } catch (error) {
    console.error("Error in /api/archived-alerts:", error);
    res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
});

// Get archived alert by ID - Admin only
router.get("/:id", authenticateRole(['admin', 'manager', 'viewer', 'editor']), async (req, res) => {
  try {
    const alertId = req.params.id;
    const alert = await Alert.findById(alertId)
      .populate("userId", "email");
    
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    // Check if this alert is actually archived
    const currentDate = new Date();
    if (!alert.expectedEnd || alert.expectedEnd >= currentDate) {
      return res.status(400).json({ message: "This alert is not archived" });
    }

    // Log archived alert view if user is authenticated 
    if (req.userId) {
      try {
        const user = req.userId ? await User.findById(req.userId).select('firstName lastName email') : null;
        
        await Logs.createLog({
          userId: req.userId,
          userEmail: req.userEmail || user?.email,
          userName: user ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : (user.firstName || user.email?.split('@')[0])) : 'Unknown',
          action: 'archived_alert_viewed',
          details: {
            alertId,
            alertTitle: alert.title
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (error) {
        console.error('Error logging archived alert view:', error);
        // Continue execution even if logging fails
      }
    }

    res.json(alert);
  } catch (error) {
    console.error("Error fetching archived alert:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router; 