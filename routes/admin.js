import express from "express";
import User from "../models/User.js";
import Alert from "../models/Alert.js";
import Logs from "../models/Logs.js";
import Notification from "../models/NotificationSys.js";
import Subscriber from "../models/subscribers.js";
import { io } from "../index.js";
import { authenticateRole } from "../middleware/auth.js";

const router = express.Router();

// Get all users (admin only)
router.get("/users", authenticateRole(['admin', 'manager', 'editor', 'viewer']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      role, 
      status,
      company,
      search,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Log user list access
    try {
      await Logs.createLog({
        userId: req.userId,
        userEmail: req.userEmail,
        action: 'admin_users_viewed',
        details: {
          filters: {
            role,
            status,
            company,
            search,
            sortBy,
            sortOrder
          }
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging user list access:', error);
      // Continue execution even if logging fails
    }
    
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;
    
    // Build query
    const query = {};
    
    if (role && role !== 'all') {
      if (role.includes(',')) {
        // Handle multiple roles
        query.role = { $in: role.split(',') };
      } else {
        // Single role
        query.role = role;
      }
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (company) {
      query['company.name'] = { $regex: company, $options: 'i' };
    }
    
    if (startDate && endDate) {
      query.createdAt = { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      };
    }
    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Determine sort order
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const users = await User.find(query)
      .select("-password -otp -otpExpiry")
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNumber);
    
    // Get total count for pagination
    const totalCount = await User.countDocuments(query);
    
    res.json({ users, totalCount });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update user role (admin only)
router.put("/users/:userId/role", authenticateRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    // Validate role
    if (!['user', 'admin', 'manager', 'viewer', 'editor'].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const previousRole = user.role; // Store previous role for logging
    
    // Update the role
    user.role = role;
    await user.save();
    
    // Log role change
    try {
      // Get admin user info
      const adminUser = await User.findById(req.userId).select('firstName lastName email role');
      
      await Logs.createLog({
        userId: req.userId,
        userEmail: req.userEmail || adminUser?.email,
        userName: adminUser ? (adminUser.firstName && adminUser.lastName ? `${adminUser.firstName} ${adminUser.lastName}` : (adminUser.firstName || adminUser.email?.split('@')[0])) : 'Unknown',
        action: 'admin_user_role_changed',
        details: {
          targetUserId: userId,
          targetUserEmail: user.email,
          previousRole,
          newRole: role,
          adminRole: adminUser?.role || 'admin'
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging role change:', error);
      // Continue execution even if logging fails
    }
    
    res.json({ success: true, message: "User role updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update user status (admin only)
router.put("/users/:userId/status", authenticateRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    
    // Validate status
    if (!['active', 'restricted', 'pending', 'deleted'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const previousStatus = user.status; // Store previous status for logging
    
    // Update the status
    user.status = status;
    await user.save();
    
    // Log status change
    try {
      // Get admin user info
      const adminUser = await User.findById(req.userId).select('firstName lastName email role');
      
      await Logs.createLog({
        userId: req.userId,
        userEmail: req.userEmail || adminUser?.email,
        userName: adminUser ? (adminUser.firstName && adminUser.lastName ? `${adminUser.firstName} ${adminUser.lastName}` : (adminUser.firstName || adminUser.email?.split('@')[0])) : 'Unknown',
        action: 'admin_user_status_changed',
        details: {
          targetUserId: userId,
          targetUserEmail: user.email,
          previousStatus,
          newStatus: status,
          adminRole: adminUser?.role || 'admin'
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging status change:', error);
      // Continue execution even if logging fails
    }
    
    res.json({ success: true, message: "User status updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get user profile details (admin only)
router.get("/users/:userId", authenticateRole(['admin', 'manager', 'editor', 'viewer']), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select("-password -otp -otpExpiry");
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete user (soft delete - sets status to 'deleted')
router.delete("/users/:userId", authenticateRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Store user info for logging before changes
    const userEmail = user.email;
    const userName = user.firstName && user.lastName ? 
      `${user.firstName} ${user.lastName}` : 
      (user.firstName || user.email?.split('@')[0]);
    
    // Soft delete by setting status to 'deleted'
    user.status = 'deleted';
    await user.save();
    
    // Log user deletion
    try {
      // Get admin user info
      const adminUser = await User.findById(req.userId).select('firstName lastName email role');
      
      await Logs.createLog({
        userId: req.userId,
        userEmail: req.userEmail || adminUser?.email,
        userName: adminUser ? (adminUser.firstName && adminUser.lastName ? `${adminUser.firstName} ${adminUser.lastName}` : (adminUser.firstName || adminUser.email?.split('@')[0])) : 'Unknown',
        action: 'admin_user_deleted',
        details: {
          targetUserId: userId,
          targetUserEmail: userEmail,
          targetUserName: userName,
          deleteType: 'soft_delete',
          adminRole: adminUser?.role || 'admin'
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging user deletion:', error);
      // Continue execution even if logging fails
    }
    
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all alerts (admin only)
router.get("/alerts", authenticateRole(['admin', 'manager', 'viewer', 'editor']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search,
      categories,
      types,
      audience,
      city,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      priority,
      risk
    } = req.query;
    
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;
    
    // Build query
    const query = {};
    
    // Status filter
    if (status && status !== 'all') {
      if (status.includes(',')) {
        // Handle multiple statuses
        query.status = { $in: status.split(',') };
      } else {
        query.status = status;
      }
    }
    
    // Categories filter
    if (categories) {
      if (categories.includes(',')) {
        query.alertCategory = { $in: categories.split(',') };
      } else {
        query.alertCategory = categories;
      }
    }
    
    // Alert types filter
    if (types) {
      if (types.includes(',')) {
        query.alertType = { $in: types.split(',') };
      } else {
        query.alertType = types;
      }
    }
    
    // Target audience filter
    if (audience) {
      // This handles both array and string versions of targetAudience
      const audienceArray = audience.includes(',') ? audience.split(',') : [audience];
      query.$or = [
        { targetAudience: { $in: audienceArray } },
        { targetAudience: { $elemMatch: { $in: audienceArray } } }
      ];
    }
    
    // City filter
    if (city) {
      // Search in both legacy city field and originCity field
      query.$or = query.$or || [];
      query.$or.push(
        { city: { $regex: city, $options: 'i' } },
        { originCity: { $regex: city, $options: 'i' } }
      );
    }
    
    // Date range filters
    if (startDate || endDate) {
      query.$and = query.$and || [];
      
      const dateFilter = {};
      
      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      
      if (endDate) {
        dateFilter.$lte = new Date(endDate);
      }
      
      // Apply date filter to expectedStart, expectedEnd, and createdAt
      if (Object.keys(dateFilter).length > 0) {
        query.$and.push({
          $or: [
            { expectedStart: dateFilter },
            { expectedEnd: dateFilter },
            { createdAt: dateFilter }
          ]
        });
      }
    }
    
    // Priority filter
    if (priority) {
      if (priority.includes(',')) {
        query.priority = { $in: priority.split(',') };
      } else {
        query.priority = priority;
      }
    }
    
    // Risk filter
    if (risk) {
      if (risk.includes(',')) {
        query.risk = { $in: risk.split(',') };
      } else {
        query.risk = risk;
      }
    }
    
    // Search filter - must be applied last to not conflict with other $or conditions
    if (search) {
      const searchConditions = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { originCity: { $regex: search, $options: 'i' } }
      ];
      
      if (query.$or) {
        // If we already have $or conditions, we need to use $and to combine them
        query.$and = query.$and || [];
        query.$and.push({ $or: searchConditions });
      } else {
        query.$or = searchConditions;
      }
    }
    
    // Determine sort options
    const sortOptions = {};
    sortOptions[sortBy || 'createdAt'] = sortOrder === 'asc' ? 1 : -1;
    
    
    // Execute query with pagination
    const alerts = await Alert.find(query)
      .populate('userId', 'email name firstName lastName')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNumber);
    
    // Get total count for pagination
    const totalCount = await Alert.countDocuments(query);
    
    res.json({ alerts, totalCount });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update alert status (admin only)
router.put("/alerts/:alertId/status", authenticateRole(['admin', 'manager', 'editor']), async (req, res) => {
  try {
    const { alertId } = req.params;
    const { status } = req.body;
    
    // Validate status
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }
    
    const previousStatus = alert.status; // Store previous status for logging
    
    // Update the status
    alert.status = status;
    
    // Update the "updated" timestamp
    alert.updated = Date.now();
    
    await alert.save();
    
    // Log alert status change
    try {
      // Get admin user info
      const adminUser = await User.findById(req.userId).select('firstName lastName email role');
      
      await Logs.createLog({
        userId: req.userId,
        userEmail: req.userEmail || adminUser?.email,
        userName: adminUser ? (adminUser.firstName && adminUser.lastName ? `${adminUser.firstName} ${adminUser.lastName}` : (adminUser.firstName || adminUser.email?.split('@')[0])) : 'Unknown',
        action: 'admin_alert_status_changed',
        details: {
          alertId,
          alertTitle: alert.title,
          previousStatus,
          newStatus: status,
          adminRole: adminUser?.role || 'admin'
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging alert status change:', error);
      // Continue execution even if logging fails
    }
    
    // Emit real-time update
    io.emit('alert:updated', {
      alertId: alert._id,
      status: status,
      message: `Alert status changed to ${status}`
    });
    
    res.json({ success: true, message: "Alert status updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete alert (admin only)
router.delete("/alerts/:alertId", authenticateRole(['admin','manager']), async (req, res) => {
  try {
    const { alertId } = req.params;
    
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }
    
    // Store alert info for logging
    const alertTitle = alert.title;
    const previousStatus = alert.status;
    
    // Implement soft delete by setting status to "deleted"
    alert.status = "deleted";
    alert.updated = Date.now();
    alert.updatedBy = req.userId;
    
    await alert.save();
    
    // Log alert deletion
    try {
      // Get admin user info
      const adminUser = await User.findById(req.userId).select('firstName lastName email role');
      
      await Logs.createLog({
        userId: req.userId,
        userEmail: req.userEmail || adminUser?.email,
        userName: adminUser ? (adminUser.firstName && adminUser.lastName ? `${adminUser.firstName} ${adminUser.lastName}` : (adminUser.firstName || adminUser.email?.split('@')[0])) : 'Unknown',
        action: 'admin_alert_deleted',
        details: {
          alertId,
          alertTitle,
          previousStatus,
          newStatus: 'deleted',
          adminRole: adminUser?.role || 'admin'
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging alert deletion:', error);
      // Continue execution even if logging fails
    }
    
    // Emit real-time update
    io.emit('alert:deleted', {
      alertId: alertId,
      message: 'Alert deleted'
    });
    
    res.json({ success: true, message: "Alert deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Archive alert (admin and manager only)
router.put("/alerts/:alertId/archive", authenticateRole(['admin', 'manager', 'editor']), async (req, res) => {
  try {
    const { alertId } = req.params;
    
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }
    
    // Set the expectedEnd date to now to mark it as archived
    const currentDate = new Date();
    alert.expectedEnd = currentDate;
    alert.updated = currentDate;
    alert.updatedBy = req.userId;
    
    // Also update the status to "archived"
    alert.status = "archived";
    
    await alert.save();
    
    // Emit real-time update
    io.emit('alert:archived', {
      alertId: alert._id,
      alert: alert,
      message: 'Alert archived'
    });
    
    res.json({ 
      success: true, 
      message: "Alert archived successfully",
      alert: alert
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Duplicate alert (admin, manager, editor only)
router.post("/alerts/:alertId/duplicate", authenticateRole(['admin', 'manager', 'editor']), async (req, res) => {
  try {
    const { alertId } = req.params;
    
    const sourceAlert = await Alert.findById(alertId);
    if (!sourceAlert) {
      return res.status(404).json({ message: "Alert not found" });
    }
    
    // Create a duplicate but with certain fields reset
    const duplicateData = sourceAlert.toObject();
    
    // Remove fields that shouldn't be duplicated
    delete duplicateData._id;
    delete duplicateData.createdAt;
    delete duplicateData.updatedAt;
    delete duplicateData.__v;
    
    // Reset specific fields for the duplicate
    duplicateData.status = "pending";
    duplicateData.userId = req.userId;
    duplicateData.title = duplicateData.title ? `Copy of ${duplicateData.title}` : 'Duplicate Alert';
    duplicateData.numberOfFollows = 0;
    duplicateData.followedBy = [];
    duplicateData.likes = 0;
    duplicateData.likedBy = [];
    duplicateData.shares = 0;
    duplicateData.sharedBy = [];
    duplicateData.updatedBy = req.userId;
    duplicateData.version = 1;
    duplicateData.isLatest = true;
    
    // Create new alert
    const newAlert = new Alert(duplicateData);
    await newAlert.save();
    
    // Emit real-time update
    io.emit('alert:created', {
      alert: newAlert,
      message: 'Alert duplicated by admin'
    });
    
    res.status(201).json({ 
      success: true, 
      message: "Alert duplicated successfully",
      alert: newAlert
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get alert details (admin, manager, editor, viewer)
router.get("/alerts/:alertId/details", authenticateRole(['admin', 'manager', 'viewer', 'editor']), async (req, res) => {
  try {
    const { alertId } = req.params;
    
    const alert = await Alert.findById(alertId)
      .populate('userId', 'email firstName lastName')
      .populate('followedBy', '_id email firstName lastName');
    
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }
    
    res.json(alert);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update alert (admin only)
router.put("/alerts/:alertId", authenticateRole(['admin', 'manager', 'editor']), async (req, res) => {
  try {
    const { alertId } = req.params;
    const updateData = req.body;
    
    // Find the alert
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }
    
    // Remove fields that shouldn't be directly updated
    const { _id, userId, createdAt, updatedAt, __v, ...validUpdateData } = updateData;
    
    // Set up locations based on the new structure
    const locationUpdates = {};
    
    // Handle origin location if provided
    if (validUpdateData.originLatitude && validUpdateData.originLongitude) {
      locationUpdates.originLocation = {
        type: 'Point',
        coordinates: [validUpdateData.originLongitude, validUpdateData.originLatitude]
      };
      
      // Also update legacy fields for backward compatibility
      locationUpdates.latitude = validUpdateData.originLatitude;
      locationUpdates.longitude = validUpdateData.originLongitude;
      locationUpdates.city = validUpdateData.originCity;
      locationUpdates.location = {
        type: 'Point',
        coordinates: [validUpdateData.originLongitude, validUpdateData.originLatitude]
      };
    }
    
    // Handle impact locations if provided
    if (validUpdateData.impactLocations && Array.isArray(validUpdateData.impactLocations)) {
      // Process each impact location to ensure it has the correct GeoJSON format
      const processedImpactLocations = validUpdateData.impactLocations.map(location => {
        if (location.latitude && location.longitude) {
          return {
            ...location,
            location: {
              type: 'Point',
              coordinates: [location.longitude, location.latitude]
            }
          };
        }
        return location;
      });
      
      locationUpdates.impactLocations = processedImpactLocations;
    }
    
    // Update the alert with the sanitized data and set the updated timestamp
    const updatedAlert = await Alert.findByIdAndUpdate(
      alertId,
      { 
        ...validUpdateData,
        ...locationUpdates,
        // Always update the "updated" timestamp
        updated: Date.now()
      },
      { new: true }
    );
    
    // Emit real-time update
    io.emit('alert:updated', {
      alertId: updatedAlert._id,
      alert: updatedAlert,
      message: 'Alert updated'
    });
    
    res.json({ 
      success: true, 
      message: "Alert updated successfully",
      alert: updatedAlert
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Create new alert (admin only)
router.post("/alerts", authenticateRole(['admin', 'manager', 'editor']), async (req, res) => {
  try {
    const alertData = req.body;
    
    // Set admin user as creator
    alertData.userId = req.userId;
    
    // Handle origin location
    if (alertData.originLatitude && alertData.originLongitude) {
      alertData.originLocation = {
        type: 'Point',
        coordinates: [alertData.originLongitude, alertData.originLatitude]
      };
      
      // Also set legacy fields for backward compatibility
      alertData.latitude = alertData.originLatitude;
      alertData.longitude = alertData.originLongitude;
      alertData.city = alertData.originCity;
      alertData.location = {
        type: 'Point',
        coordinates: [alertData.originLongitude, alertData.originLatitude]
      };
    }
    
    // Handle impact locations
    if (alertData.impactLocations && Array.isArray(alertData.impactLocations)) {
      // Process each impact location to ensure it has the correct GeoJSON format
      alertData.impactLocations = alertData.impactLocations.map(location => {
        if (location.latitude && location.longitude) {
          return {
            ...location,
            location: {
              type: 'Point',
              coordinates: [location.longitude, location.latitude]
            }
          };
        }
        return location;
      });
    }
    
    // Create new alert
    const newAlert = new Alert(alertData);
    await newAlert.save();
    
    // Emit real-time update
    io.emit('alert:created', {
      alert: newAlert,
      message: 'New alert created by admin'
    });
    
    res.status(201).json({ 
      success: true, 
      message: "Alert created successfully",
      alert: newAlert
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get dashboard stats (admin only)
router.get("/dashboard", authenticateRole(['admin', 'manager', 'viewer', 'editor']), async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();
    
    // Get total alerts count
    const totalAlerts = await Alert.countDocuments();
    
    // Get alerts by status
    const alertsByStatus = {
      pending: await Alert.countDocuments({ status: 'pending' }),
      approved: await Alert.countDocuments({ status: 'approved' }),
      rejected: await Alert.countDocuments({ status: 'rejected' }),
    };
    
    // Get recent alerts (last 5)
    const recentAlerts = await Alert.find()
      .select('title description status createdAt city')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get active users (users who logged in in the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Since we don't have a lastLogin field, we'll use users who created an account in the last 30 days
    // In a real application, you'd track user logins and use that for this metric
    const activeUsers = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    
    // Get total subscribers from the Subscriber model
    const totalSubscribers = await Subscriber.countDocuments({ isActive: true });
    
    res.json({
      totalUsers,
      totalAlerts,
      alertsByStatus,
      recentAlerts,
      activeUsers,
      totalSubscribers
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all subscribers (admin only)
router.get("/subscribers", authenticateRole(['admin', 'manager', 'viewer', 'editor']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search,
      sector,
      isActive,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;
    
    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (sector && sector !== 'all') {
      query.sector = sector;
    }
    
    if (isActive !== undefined && isActive !== 'all') {
      query.isActive = isActive === 'true';
    }
    
    if (startDate && endDate) {
      query.createdAt = { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      };
    }
    
    // Determine sort order
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const subscribers = await Subscriber.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNumber);
    
    // Get total count for pagination
    const totalCount = await Subscriber.countDocuments(query);
    
    res.json({ subscribers, totalCount });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Add user to subscriber list (admin only)
router.post("/subscribers/add-user", authenticateRole(['admin', 'manager']), async (req, res) => {
  try {
    const { userId, sector, location } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Check if user is already a subscriber
    const existingSubscriber = await Subscriber.findOne({ email: user.email });
    if (existingSubscriber) {
      return res.status(400).json({ message: "User is already a subscriber" });
    }
    
    // Create new subscriber
    const newSubscriber = new Subscriber({
      name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName || user.email.split('@')[0],
      email: user.email,
      sector: sector || 'Tourism',
      location: location || user.company?.MainOperatingRegions || [],
      createdAt: new Date(),
      isActive: true
    });
    
    await newSubscriber.save();
    
    // Update user's weekly forecast subscription status
    user.weeklyForecastSubscribed = true;
    user.weeklyForecastSubscribedAt = new Date();
    await user.save();
    
    // Log the action
    try {
      const adminUser = await User.findById(req.userId).select('firstName lastName email role');
      
      await Logs.createLog({
        userId: req.userId,
        userEmail: req.userEmail || adminUser?.email,
        userName: adminUser ? (adminUser.firstName && adminUser.lastName ? `${adminUser.firstName} ${adminUser.lastName}` : (adminUser.firstName || adminUser.email?.split('@')[0])) : 'Unknown',
        action: 'admin_user_added_to_subscribers',
        details: {
          targetUserId: userId,
          targetUserEmail: user.email,
          sector: sector || 'Tourism',
          adminRole: adminUser?.role || 'admin'
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging subscriber addition:', error);
    }
    
    res.status(201).json({ 
      success: true, 
      message: "User added to subscriber list successfully",
      subscriber: newSubscriber
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Remove user from subscriber list (admin only)
router.delete("/subscribers/:subscriberId", authenticateRole(['admin', 'manager']), async (req, res) => {
  try {
    const { subscriberId } = req.params;
    
    const subscriber = await Subscriber.findById(subscriberId);
    if (!subscriber) {
      return res.status(404).json({ message: "Subscriber not found" });
    }
    
    // Update user's weekly forecast subscription status if they exist
    const user = await User.findOne({ email: subscriber.email });
    if (user) {
      user.weeklyForecastSubscribed = false;
      user.weeklyForecastSubscribedAt = null;
      await user.save();
    }
    
    // Store subscriber info for logging
    const subscriberEmail = subscriber.email;
    const subscriberName = subscriber.name;
    
    // Remove the subscriber
    await Subscriber.findByIdAndDelete(subscriberId);
    
    // Log the action
    try {
      const adminUser = await User.findById(req.userId).select('firstName lastName email role');
      
      await Logs.createLog({
        userId: req.userId,
        userEmail: req.userEmail || adminUser?.email,
        userName: adminUser ? (adminUser.firstName && adminUser.lastName ? `${adminUser.firstName} ${adminUser.lastName}` : (adminUser.firstName || adminUser.email?.split('@')[0])) : 'Unknown',
        action: 'admin_subscriber_removed',
        details: {
          subscriberId,
          subscriberEmail,
          subscriberName,
          adminRole: adminUser?.role || 'admin'
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging subscriber removal:', error);
    }
    
    res.json({ success: true, message: "Subscriber removed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update subscriber status (admin only)
router.put("/subscribers/:subscriberId/status", authenticateRole(['admin', 'manager']), async (req, res) => {
  try {
    const { subscriberId } = req.params;
    const { isActive } = req.body;
    
    const subscriber = await Subscriber.findById(subscriberId);
    if (!subscriber) {
      return res.status(404).json({ message: "Subscriber not found" });
    }
    
    const previousStatus = subscriber.isActive;
    subscriber.isActive = isActive;
    await subscriber.save();
    
    // Update user's weekly forecast subscription status if they exist
    const user = await User.findOne({ email: subscriber.email });
    if (user) {
      user.weeklyForecastSubscribed = isActive;
      if (isActive && !user.weeklyForecastSubscribedAt) {
        user.weeklyForecastSubscribedAt = new Date();
      }
      await user.save();
    }
    
    // Log the action
    try {
      const adminUser = await User.findById(req.userId).select('firstName lastName email role');
      
      await Logs.createLog({
        userId: req.userId,
        userEmail: req.userEmail || adminUser?.email,
        userName: adminUser ? (adminUser.firstName && adminUser.lastName ? `${adminUser.firstName} ${adminUser.lastName}` : (adminUser.firstName || adminUser.email?.split('@')[0])) : 'Unknown',
        action: 'admin_subscriber_status_changed',
        details: {
          subscriberId,
          subscriberEmail: subscriber.email,
          previousStatus,
          newStatus: isActive,
          adminRole: adminUser?.role || 'admin'
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging subscriber status change:', error);
    }
    
    res.json({ success: true, message: "Subscriber status updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get subscriber details (admin only)
router.get("/subscribers/:subscriberId", authenticateRole(['admin', 'manager', 'viewer', 'editor']), async (req, res) => {
  try {
    const { subscriberId } = req.params;
    
    const subscriber = await Subscriber.findById(subscriberId);
    if (!subscriber) {
      return res.status(404).json({ message: "Subscriber not found" });
    }
    
    res.json({ subscriber });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router; 