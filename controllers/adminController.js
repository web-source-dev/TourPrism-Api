const Alert = require('../models/Alert.js');
const User = require('../models/User.js');
const Subscriber = require('../models/subscribers.js');
const Logger = require('../utils/logger.js');
const { startOfDay, subDays } = require('date-fns');
const impactCalculator = require('../config/impactCalculator.js');

// Get all alerts (admin only)
const getAlerts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      categories, // for backward compatibility
      types, // for backward compatibility
      mainType,
      subType,
      city,
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

    // Status filter
    if (status && status !== 'all') {
      if (status.includes(',')) {
        query.status = { $in: status.split(',') };
      } else {
        query.status = status;
      }
    }

    // Categories filter (mainType) - support both old and new parameter names
    const mainTypeValue = mainType || categories;
    if (mainTypeValue) {
      if (mainTypeValue.includes(',')) {
        query.mainType = { $in: mainTypeValue.split(',') };
      } else {
        query.mainType = mainTypeValue;
      }
    }

    // Alert types filter (subType) - support both old and new parameter names
    const subTypeValue = subType || types;
    if (subTypeValue) {
      if (subTypeValue.includes(',')) {
        query.subType = { $in: subTypeValue.split(',') };
      } else {
        query.subType = subTypeValue;
      }
    }

    // City filter
    if (city) {
      // Search in both city field and originCity field
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

      // Apply date filter to startDate, endDate, and createdAt
      if (Object.keys(dateFilter).length > 0) {
        query.$and.push({
          $or: [
            { startDate: dateFilter },
            { endDate: dateFilter },
            { createdAt: dateFilter }
          ]
        });
      }
    }

    // Search filter - must be applied last to not conflict with other $or conditions
    if (search) {
      const searchConditions = [
        { title: { $regex: search, $options: 'i' } },
        { summary: { $regex: search, $options: 'i' } },
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
};

// Update alert status (admin only)
const updateAlertStatus = async (req, res) => {
  try {
    const { alertId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!['pending', 'approved', 'expired'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    const previousStatus = alert.status;

    // Update the status
    alert.status = status;

    // Update the "updated" timestamp
    alert.updated = Date.now();

    await alert.save();

    // Log alert status change
    try {
      await Logger.log(req, 'admin_alert_status_changed', {
        alertId,
        alertTitle: alert.title,
        previousStatus,
        newStatus: status
      });
    } catch (error) {
      console.error('Error logging alert status change:', error);
    }

    res.json({ success: true, message: "Alert status updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete alert (admin only)
const deleteAlert = async (req, res) => {
  try {
    const { alertId } = req.params;

    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    // Store alert info for logging
    const alertTitle = alert.title;
    const previousStatus = alert.status;

    // Implement soft delete by setting status to "expired"
    alert.status = "expired";
    alert.updated = Date.now();

    await alert.save();

    // Log alert deletion
    try {
      await Logger.log(req, 'admin_alert_deleted', {
        alertId,
        alertTitle,
        previousStatus,
        newStatus: 'expired'
      });
    } catch (error) {
      console.error('Error logging alert deletion:', error);
    }

    res.json({ success: true, message: "Alert deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Archive alert (admin only)
const archiveAlert = async (req, res) => {
  try {
    const { alertId } = req.params;

    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    // Set the endDate to now to mark it as archived
    const currentDate = new Date();
    alert.endDate = currentDate;
    alert.status = "expired";

    await alert.save();

    res.json({
      success: true,
      message: "Alert archived successfully",
      alert: alert
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Duplicate alert (admin only)
const duplicateAlert = async (req, res) => {
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
    duplicateData.title = duplicateData.title ? `Copy of ${duplicateData.title}` : 'Duplicate Alert';
    duplicateData.followedBy = [];
    duplicateData.viewCount = 0;

    // Create new alert
    const newAlert = new Alert(duplicateData);
    await newAlert.save();

    res.status(201).json({
      success: true,
      message: "Alert duplicated successfully",
      alert: newAlert
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get alert details (admin only)
const getAlertDetails = async (req, res) => {
  try {
    const { alertId } = req.params;

    const alert = await Alert.findById(alertId)
      .populate('followedBy', '_id email firstName lastName');

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    res.json(alert);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update alert (admin only)
const updateAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const updateData = req.body;

    // Find the alert
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    // Remove fields that shouldn't be directly updated
    const { _id, createdAt, updatedAt, __v, ...validUpdateData } = updateData;

    // Set up locations based on the new structure
    const locationUpdates = {};

    // Handle origin city if provided
    if (validUpdateData.originCity) {
      locationUpdates.originCity = validUpdateData.originCity;
    }

    // Handle new fields - ensure arrays are properly formatted
    if (validUpdateData.whatsImpacted !== undefined) {
      if (!Array.isArray(validUpdateData.whatsImpacted)) {
        validUpdateData.whatsImpacted = validUpdateData.whatsImpacted ? [validUpdateData.whatsImpacted] : [];
      }
    }
    if (validUpdateData.actionPlan !== undefined) {
      if (!Array.isArray(validUpdateData.actionPlan)) {
        validUpdateData.actionPlan = validUpdateData.actionPlan ? [validUpdateData.actionPlan] : [];
      }
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

    res.json({
      success: true,
      message: "Alert updated successfully",
      alert: updatedAlert
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Create new alert (admin only)
const createAlert = async (req, res) => {
  try {
    const alertData = req.body;

    // Handle origin city
    if (alertData.originCity) {
      alertData.originCity = alertData.originCity;
    }

    // Handle new fields - ensure arrays are properly formatted
    if (alertData.whatsImpacted && !Array.isArray(alertData.whatsImpacted)) {
      alertData.whatsImpacted = [alertData.whatsImpacted];
    }
    if (alertData.actionPlan && !Array.isArray(alertData.actionPlan)) {
      alertData.actionPlan = [alertData.actionPlan];
    }

    // Create new alert
    const newAlert = new Alert(alertData);
    await newAlert.save();

    res.status(201).json({
      success: true,
      message: "Alert created successfully",
      alert: newAlert
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get city-wide risk stats (for non-authenticated users)
const getCityRiskStats = async (req, res) => {
  try {
    const { city } = req.params;
    const today = startOfDay(new Date());
    const sevenDaysAgo = subDays(today, 7);

    // Validate city
    if (!['Edinburgh', 'London'].includes(city)) {
      return res.status(400).json({ message: 'Invalid city. Must be Edinburgh or London.' });
    }

    // Get alerts for this city that could affect hotels
    const alertsThisWeek = await Alert.find({
      status: 'approved',
      createdAt: { $gte: sevenDaysAgo },
      $or: [
        { city: city },
        { originCity: city }
      ]
    });

    // Calculate typical hotel impacts
    // Based on CALCULATIONS.pdf - average hotel sizes and rates
    const typicalHotels = {
      micro: { rooms: 8, occupancy: 0.60, avgRate: 120 },
      small: { rooms: 35, occupancy: 0.65, avgRate: 140 },
      medium: { rooms: 80, occupancy: 0.70, avgRate: 160 }
    };

    let totalPoundsAtRisk = 0;
    let totalAlerts = alertsThisWeek.length;
    let alertsThisWeekCount = alertsThisWeek.length;

    // Calculate impact for each alert across different hotel sizes
    for (const alert of alertsThisWeek) {
      for (const [size, hotelData] of Object.entries(typicalHotels)) {
        try {
          const impact = impactCalculator.calculateImpact({
            size,
            rooms: hotelData.rooms,
            avgRoomRate: hotelData.avgRate
          }, {
            mainType: alert.mainType,
            start_date: alert.startDate,
            end_date: alert.endDate
          }, false, 0); // No incentives - worst case scenario

          totalPoundsAtRisk += impact.poundsAtRisk;
        } catch (error) {
          console.error(`Error calculating impact for alert ${alert._id}, hotel size ${size}:`, error);
        }
      }
    }

    // Calculate average hotel impact (divide by number of hotel types)
    const avgHotelImpact = totalAlerts > 0 ? totalPoundsAtRisk / (totalAlerts * Object.keys(typicalHotels).length) : 0;

    const cityRiskStats = {
      city,
      totalAlerts,
      totalPoundsAtRisk: Math.round(totalPoundsAtRisk),
      avgHotelImpact: Math.round(avgHotelImpact),
      alertsThisWeek: alertsThisWeekCount,
      hotelTypesAnalyzed: Object.keys(typicalHotels).length,
      timeFrame: '7 days'
    };

    // Log the action
    await Logger.logCRUD('view', req, 'City risk stats', null, {
      city,
      alertsAnalyzed: totalAlerts,
      totalRisk: cityRiskStats.totalPoundsAtRisk
    });

    res.json(cityRiskStats);

  } catch (error) {
    console.error('Error calculating city risk stats:', error);
    res.status(500).json({ message: 'Failed to calculate city risk stats', error: error.message });
  }
};

// Get hotel savings stats (weekly savings achieved through platform)
const getHotelSavingsStats = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const today = startOfDay(new Date());
    const sevenDaysAgo = subDays(today, 7);
    const fourteenDaysAgo = subDays(today, 14);

    // Get hotel data
    const hotel = await User.findById(hotelId).select('company');
    if (!hotel || !hotel.company) {
      return res.status(404).json({ message: "Hotel not found or no company data" });
    }

    const hotelData = hotel.company;
    if (!hotelData.size || !hotelData.rooms || !hotelData.avgRoomRate) {
      return res.status(400).json({ message: "Hotel data incomplete - missing size, rooms, or avg room rate" });
    }

    // Get alerts that could affect this hotel (same city or global alerts)
    const relevantAlerts = await Alert.find({
      status: 'approved',
      createdAt: { $gte: fourteenDaysAgo }, // Last 2 weeks for comparison
      $or: [
        { city: hotelData.city },
        { originCity: hotelData.city },
        { city: { $exists: false } }, // Global alerts
        { originCity: { $exists: false } }
      ]
    });

    let currentWeekPotentialLoss = 0;
    let currentWeekSaved = 0;
    let previousWeekPotentialLoss = 0;
    let previousWeekSaved = 0;
    let totalSavedAllTime = 0;
    let alertsProcessed = 0;

    // Calculate impact for each alert
    for (const alert of relevantAlerts) {
      alertsProcessed++;

      // Determine if alert is from current week or previous week
      const isCurrentWeek = alert.createdAt >= sevenDaysAgo;

      const hasIncentive = hotelData.incentives && hotelData.incentives.length > 0;
      const additionalIncentives = hasIncentive ? Math.max(hotelData.incentives.length - 1, 0) : 0;

      try {
        // Calculate potential impact without incentives
        const potentialImpact = impactCalculator.calculateImpact({
          size: hotelData.size,
          rooms: hotelData.rooms,
          avgRoomRate: hotelData.avgRoomRate
        }, {
          mainType: alert.mainType,
          start_date: alert.startDate,
          end_date: alert.endDate
        }, false, 0); // No incentives

        // Calculate saved impact with incentives
        const savedImpact = impactCalculator.calculateImpact({
          size: hotelData.size,
          rooms: hotelData.rooms,
          avgRoomRate: hotelData.avgRoomRate
        }, {
          mainType: alert.mainType,
          start_date: alert.startDate,
          end_date: alert.endDate
        }, hasIncentive, additionalIncentives);

        const potentialLoss = potentialImpact.poundsAtRisk;
        const actualLoss = savedImpact.poundsAtRisk;
        const saved = potentialLoss - actualLoss;

        if (isCurrentWeek) {
          currentWeekPotentialLoss += potentialLoss;
          currentWeekSaved += saved;
        } else {
          previousWeekPotentialLoss += potentialLoss;
          previousWeekSaved += saved;
        }

        totalSavedAllTime += saved;

      } catch (error) {
        console.error(`Error calculating impact for alert ${alert._id}:`, error);
        // Continue with other alerts
      }
    }

    // Calculate percentage change from previous week
    let changePercent = 0;
    if (previousWeekSaved > 0) {
      changePercent = Math.round(((currentWeekSaved - previousWeekSaved) / previousWeekSaved) * 100);
    } else if (currentWeekSaved > 0) {
      changePercent = 100; // If no previous savings but current savings exist
    }

    const savingsData = {
      savedThisWeek: Math.round(currentWeekSaved),
      savedLastWeek: Math.round(previousWeekSaved),
      changePercent,
      totalSaved: Math.round(totalSavedAllTime),
      potentialLossAvoided: Math.round(currentWeekPotentialLoss),
      alertsProcessed,
      hotelData: {
        name: hotelData.name,
        city: hotelData.city,
        size: hotelData.size,
        rooms: hotelData.rooms,
        avgRoomRate: hotelData.avgRoomRate,
        incentives: hotelData.incentives || []
      }
    };

    // Log the action
    await Logger.logCRUD('view', req, 'Hotel savings stats', null, {
      hotelId,
      savedThisWeek: savingsData.savedThisWeek,
      alertsProcessed
    });

    res.json(savingsData);

  } catch (error) {
    console.error('Error calculating hotel savings:', error);
    res.status(500).json({ message: 'Failed to calculate hotel savings', error: error.message });
  }
};

// Trigger alert generation (admin only)
const triggerAlertGeneration = async (req, res) => {
  try {
    // Import scheduler dynamically to avoid circular imports
    const { alertScheduler } = await import('../config/index.js');

    // Check if scheduler is already running
    if (alertScheduler.isRunning) {
      return res.status(409).json({
        message: 'Alert generation is already in progress. Please wait for it to complete.'
      });
    }

    // Log the manual trigger
    await Logger.log(req, 'admin_trigger_alert_generation', {
      action: 'manual_trigger',
      triggeredBy: req.userId || req.user?.email || 'unknown'
    });

    // Start the alert generation process asynchronously
    alertScheduler.runFullFetch().then(() => {
      console.log('✅ Manual alert generation completed successfully');
    }).catch((error) => {
      console.error('❌ Manual alert generation failed:', error);
    });

    res.json({
      success: true,
      message: 'Alert generation triggered successfully. The process will run in the background and may take several minutes to complete.',
      status: 'running'
    });

  } catch (error) {
    console.error('Error triggering alert generation:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all subscribers (admin only)
const getSubscribers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Build query
    const query = {};

    // Status filter
    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true';
    }

    // Search filter
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }

    // Determine sort options
    const sortOptions = {};
    sortOptions[sortBy || 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const subscribers = await Subscriber.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNumber)
      .lean();

    // Get total count for pagination
    const totalCount = await Subscriber.countDocuments(query);

    res.json({ subscribers, totalCount });
  } catch (error) {
    console.error('Error fetching subscribers:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete subscriber (admin only)
const deleteSubscriber = async (req, res) => {
  try {
    const { email } = req.params;

    const subscriber = await Subscriber.findOne({ email });
    if (!subscriber) {
      return res.status(404).json({ message: "Subscriber not found" });
    }

    // Also update the user model if they exist
    await User.updateOne(
      { email: email },
      { $set: { weeklyForecastSubscribed: false } }
    );

    await Subscriber.deleteOne({ email });

    // Log the deletion
    await Logger.log(req, 'subscriber_deleted', {
      email: email,
      sectors: Array.isArray(subscriber.sectors) ? subscriber.sectors.join(', ') : subscriber.sectors,
      location: Array.isArray(subscriber.location) ? subscriber.location.map(loc => loc.name).join(', ') : subscriber.location
    });

    res.json({
      success: true,
      message: "Subscriber deleted successfully"
    });
  } catch (error) {
    console.error('Error deleting subscriber:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get subscriber statistics (admin only)
const getSubscriberStats = async (req, res) => {
  try {
    const totalSubscribers = await Subscriber.countDocuments();
    const activeSubscribers = await Subscriber.countDocuments({ isActive: true });

    // Recent subscribers (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSubscribers = await Subscriber.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Get sector breakdown
    const sectorStats = await Subscriber.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$sectors' },
      { $group: { _id: '$sectors', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get location breakdown
    const locationStats = await Subscriber.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$location' },
      { $group: { _id: '$location.name', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      totalSubscribers,
      activeSubscribers,
      inactiveSubscribers: totalSubscribers - activeSubscribers,
      recentSubscribers,
      sectorStats,
      locationStats
    });
  } catch (error) {
    console.error('Error fetching subscriber stats:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// Process alert (approve/decline) (admin only)
const processAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const { action, ...updateData } = req.body;

    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    let newStatus;
    let logAction;
    let logMessage;

    if (action === 'approve') {
      newStatus = 'approved';
      logAction = 'admin_alert_approved';
      logMessage = 'Alert approved and published';
    } else if (action === 'decline') {
      newStatus = 'expired';
      logAction = 'admin_alert_declined';
      logMessage = 'Alert declined';
    } else {
      return res.status(400).json({ message: "Invalid action. Must be 'approve' or 'decline'" });
    }

    // Update alert status
    alert.status = newStatus;
    alert.updated = Date.now();
    await alert.save();

    // Log the action
    await Logger.log(req, logAction, {
      alertId: alert._id,
      alertTitle: alert.title,
      previousStatus: alert.status,
      newStatus: newStatus
    });

    res.json({
      success: true,
      message: logMessage,
      alert: alert
    });
  } catch (error) {
    console.error('Error processing alert:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Create user (admin only)
const createUser = async (req, res) => {
  try {
    const { email, role, status, isPremium, company } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    // Validate role and status
    const validRoles = ['user', 'admin'];
    const validStatuses = ['active', 'restricted', 'pending', 'deleted'];

    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Create new user
    const userData = {
      email,
      role: role || 'user',
      status: status || 'active',
      isPremium: isPremium || false,
    };

    // Add company data if provided
    if (company) {
      userData.company = {};
      if (company.name) userData.company.name = company.name;
      if (company.contactName) userData.company.contactName = company.contactName;
      if (company.city) userData.company.city = company.city;
      if (company.rooms) userData.company.rooms = parseInt(company.rooms);
      if (company.avgRoomRate) userData.company.avgRoomRate = parseInt(company.avgRoomRate);
      if (company.size) userData.company.size = company.size;

      // Initialize required fields if not provided
      userData.company.city = userData.company.city || null;
      userData.company.rooms = userData.company.rooms || null;
      userData.company.avgRoomRate = userData.company.avgRoomRate || null;
      userData.company.size = userData.company.size || null;
      userData.company.locations = userData.company.locations || [];
      userData.company.incentives = userData.company.incentives || [];
    }

    const newUser = new User(userData);
    await newUser.save();

    // Log user creation
    await Logger.log(req, 'admin_user_created', {
      userId: newUser._id,
      userEmail: newUser.email,
      role: newUser.role
    });

    // Remove sensitive fields from response
    const userResponse = newUser.toObject();
    delete userResponse.password;
    delete userResponse.otp;
    delete userResponse.otpExpiry;
    delete userResponse.resetPasswordToken;
    delete userResponse.resetPasswordExpiry;

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: userResponse
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all users (admin only)
const getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      role,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Build query
    const query = {};

    // Status filter
    if (status && status !== 'all') {
      if (status.includes(',')) {
        query.status = { $in: status.split(',') };
      } else {
        query.status = status;
      }
    }

    // Role filter
    if (role && role !== 'all') {
      if (role.includes(',')) {
        query.role = { $in: role.split(',') };
      } else {
        query.role = role;
      }
    }

    // Search filter
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { 'company.name': { $regex: search, $options: 'i' } },
        { 'company.contactName': { $regex: search, $options: 'i' } }
      ];
    }

    // Determine sort options
    const sortOptions = {};
    sortOptions[sortBy || 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const users = await User.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNumber)
      .select('-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry')
      .lean();

    // Get total count for pagination
    const totalCount = await User.countDocuments(query);

    res.json({ users, totalCount });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get user details (admin only)
const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry')
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update user (admin only)
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Remove fields that shouldn't be directly updated
    const { _id, createdAt, updatedAt, __v, password, otp, otpExpiry, resetPasswordToken, resetPasswordExpiry, ...validUpdateData } = updateData;

    // Update the user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        ...validUpdateData,
        updated: Date.now()
      },
      { new: true }
    ).select('-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry');

    // Log user update
    await Logger.log(req, 'admin_user_updated', {
      userId,
      updatedFields: Object.keys(validUpdateData)
    });

    res.json({
      success: true,
      message: "User updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update user status (admin only)
const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['active', 'restricted', 'pending', 'deleted'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const previousStatus = user.status;
    user.status = status;
    user.updated = Date.now();
    await user.save();

    // Log status change
    await Logger.log(req, 'admin_user_status_changed', {
      userId,
      userEmail: user.email,
      previousStatus,
      newStatus: status
    });

    res.json({
      success: true,
      message: "User status updated successfully"
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update user role (admin only)
const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Validate role
    const validRoles = ['user', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const previousRole = user.role;
    user.role = role;
    user.updated = Date.now();
    await user.save();

    // Log role change
    await Logger.log(req, 'admin_user_role_changed', {
      userId,
      userEmail: user.email,
      previousRole,
      newRole: role
    });

    res.json({
      success: true,
      message: "User role updated successfully"
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete user (admin only) - soft delete by setting status to deleted
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Soft delete by setting status to deleted
    user.status = 'deleted';
    user.updated = Date.now();
    await user.save();

    // Log user deletion
    await Logger.log(req, 'admin_user_deleted', {
      userId,
      userEmail: user.email
    });

    res.json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get user statistics (admin only)
const getUserStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active' });
    const adminUsers = await User.countDocuments({ role: 'admin', status: 'active' });
    const premiumUsers = await User.countDocuments({ isPremium: true, status: 'active' });
    const verifiedUsers = await User.countDocuments({ isVerified: true, status: 'active' });

    // Recent users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
      status: 'active'
    });

    // Collaborator stats
    const usersWithCollaborators = await User.countDocuments({
      'collaborators.0': { $exists: true },
      status: 'active'
    });

    const totalCollaborators = await User.aggregate([
      { $match: { status: 'active' } },
      { $unwind: '$collaborators' },
      { $count: 'total' }
    ]);

    res.json({
      totalUsers,
      activeUsers,
      adminUsers,
      premiumUsers,
      verifiedUsers,
      recentUsers,
      usersWithCollaborators,
      totalCollaborators: totalCollaborators[0]?.total || 0
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get comprehensive analytics data (admin only)
const getAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, period = '30d' } = req.query;

    // Calculate date range
    let start = new Date();
    let end = new Date();

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      // Default to last 30 days
      start.setDate(start.getDate() - 30);
    }

    // User Analytics
    const userStats = await getUserAnalytics(start, end);

    // Alert Analytics
    const alertStats = await getAlertAnalytics(start, end);

    // Subscriber Analytics
    const subscriberStats = await getSubscriberAnalytics(start, end);

    // System Analytics (Logs)
    const systemStats = await getSystemAnalytics(start, end);

    // Revenue Analytics (based on alerts and user impact)
    const revenueStats = await getRevenueAnalytics(start, end);

    res.json({
      period: { start: start.toISOString(), end: end.toISOString() },
      users: userStats,
      alerts: alertStats,
      subscribers: subscriberStats,
      system: systemStats,
      revenue: revenueStats
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Helper function for user analytics
const getUserAnalytics = async (startDate, endDate) => {
  try {
    // User registration trends (daily)
    const userRegistrations = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);

    // User status distribution
    const userStatusDistribution = await User.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Role distribution
    const userRoleDistribution = await User.aggregate([
      {
        $match: { status: 'active' }
      },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 }
        }
      }
    ]);

    // Premium vs Free users
    const premiumVsFree = await User.aggregate([
      {
        $match: { status: 'active' }
      },
      {
        $group: {
          _id: "$isPremium",
          count: { $sum: 1 }
        }
      }
    ]);

    // City distribution for hotels
    const cityDistribution = await User.aggregate([
      {
        $match: {
          status: 'active',
          'company.city': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: "$company.city",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    return {
      registrations: userRegistrations,
      statusDistribution: userStatusDistribution,
      roleDistribution: userRoleDistribution,
      premiumVsFree: premiumVsFree,
      cityDistribution: cityDistribution,
      total: await User.countDocuments(),
      active: await User.countDocuments({ status: 'active' }),
      premium: await User.countDocuments({ isPremium: true, status: 'active' })
    };
  } catch (error) {
    console.error('Error in user analytics:', error);
    return {};
  }
};

// Helper function for alert analytics
const getAlertAnalytics = async (startDate, endDate) => {
  try {
    // Alert creation trends
    const alertCreations = await Alert.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);

    // Alert status distribution
    const alertStatusDistribution = await Alert.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Main type distribution
    const mainTypeDistribution = await Alert.aggregate([
      {
        $match: { mainType: { $exists: true } }
      },
      {
        $group: {
          _id: "$mainType",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // City distribution
    const alertCityDistribution = await Alert.aggregate([
      {
        $match: { city: { $exists: true } }
      },
      {
        $group: {
          _id: "$city",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Average confidence scores
    const confidenceStats = await Alert.aggregate([
      {
        $match: { confidence: { $exists: true } }
      },
      {
        $group: {
          _id: null,
          avgConfidence: { $avg: "$confidence" },
          minConfidence: { $min: "$confidence" },
          maxConfidence: { $max: "$confidence" }
        }
      }
    ]);

    // View count analytics
    const viewStats = await Alert.aggregate([
      {
        $group: {
          _id: null,
          totalViews: { $sum: "$viewCount" },
          avgViews: { $avg: "$viewCount" },
          maxViews: { $max: "$viewCount" }
        }
      }
    ]);

    return {
      creations: alertCreations,
      statusDistribution: alertStatusDistribution,
      mainTypeDistribution: mainTypeDistribution,
      cityDistribution: alertCityDistribution,
      confidenceStats: confidenceStats[0] || {},
      viewStats: viewStats[0] || {},
      total: await Alert.countDocuments(),
      approved: await Alert.countDocuments({ status: 'approved' }),
      pending: await Alert.countDocuments({ status: 'pending' })
    };
  } catch (error) {
    console.error('Error in alert analytics:', error);
    return {};
  }
};

// Helper function for subscriber analytics
const getSubscriberAnalytics = async (startDate, endDate) => {
  try {
    // Subscriber registration trends
    const subscriberRegistrations = await Subscriber.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);

    // Sector distribution
    const sectorDistribution = await Subscriber.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $unwind: "$sectors"
      },
      {
        $group: {
          _id: "$sectors",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Location distribution
    const locationDistribution = await Subscriber.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $unwind: "$location"
      },
      {
        $group: {
          _id: "$location.name",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    return {
      registrations: subscriberRegistrations,
      sectorDistribution: sectorDistribution,
      locationDistribution: locationDistribution,
      total: await Subscriber.countDocuments(),
      active: await Subscriber.countDocuments({ isActive: true }),
      inactive: await Subscriber.countDocuments({ isActive: false })
    };
  } catch (error) {
    console.error('Error in subscriber analytics:', error);
    return {};
  }
};

// Helper function for system analytics
const getSystemAnalytics = async (startDate, endDate) => {
  try {
    // Action distribution
    const actionDistribution = await Logs.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$action",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 20
      }
    ]);

    // Daily activity
    const dailyActivity = await Logs.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);

    // User activity (most active users)
    const mostActiveUsers = await Logs.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
          userId: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: "$userId",
          userEmail: { $first: "$userEmail" },
          userName: { $first: "$userName" },
          activityCount: { $sum: 1 }
        }
      },
      {
        $sort: { activityCount: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Error logs
    const errorLogs = await Logs.countDocuments({
      timestamp: { $gte: startDate, $lte: endDate },
      action: { $regex: /error|fail/i }
    });

    return {
      actionDistribution: actionDistribution,
      dailyActivity: dailyActivity,
      mostActiveUsers: mostActiveUsers,
      errorCount: errorLogs,
      totalLogs: await Logs.countDocuments({
        timestamp: { $gte: startDate, $lte: endDate }
      })
    };
  } catch (error) {
    console.error('Error in system analytics:', error);
    return {};
  }
};

// Helper function for revenue analytics
const getRevenueAnalytics = async (startDate, endDate) => {
  try {
    // Revenue potential by alert type
    const revenueByType = await Alert.aggregate([
      {
        $match: {
          status: 'approved',
          mainType: { $exists: true },
          revenueAtRisk: { $exists: true, $gt: 0 }
        }
      },
      {
        $group: {
          _id: "$mainType",
          totalRevenueAtRisk: { $sum: "$revenueAtRisk" },
          totalRevenueSaved: { $sum: "$revenueSaved" },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { totalRevenueAtRisk: -1 }
      }
    ]);

    // Monthly revenue trends (based on alert creation)
    const monthlyRevenue = await Alert.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'approved',
          revenueAtRisk: { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$createdAt" }
          },
          totalRevenueAtRisk: { $sum: "$revenueAtRisk" },
          totalRevenueSaved: { $sum: "$revenueSaved" },
          alertCount: { $sum: 1 }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);

    // Hotel size impact distribution
    const hotelSizeImpact = await User.aggregate([
      {
        $match: {
          status: 'active',
          'company.size': { $exists: true },
          'company.rooms': { $exists: true },
          'company.avgRoomRate': { $exists: true }
        }
      },
      {
        $group: {
          _id: "$company.size",
          hotelCount: { $sum: 1 },
          totalRooms: { $sum: "$company.rooms" },
          avgRoomRate: { $avg: "$company.avgRoomRate" }
        }
      },
      {
        $sort: { hotelCount: -1 }
      }
    ]);

    // Calculate total potential revenue from all alerts
    const totalRevenueStats = await Alert.aggregate([
      {
        $match: { status: 'approved' }
      },
      {
        $group: {
          _id: null,
          totalRevenueAtRisk: { $sum: "$revenueAtRisk" },
          totalRevenueSaved: { $sum: "$revenueSaved" },
          totalAlerts: { $sum: 1 }
        }
      }
    ]);

    return {
      revenueByType: revenueByType,
      monthlyRevenue: monthlyRevenue,
      hotelSizeImpact: hotelSizeImpact,
      totalStats: totalRevenueStats[0] || {},
      totalHotels: await User.countDocuments({
        status: 'active',
        'company.size': { $exists: true }
      })
    };
  } catch (error) {
    console.error('Error in revenue analytics:', error);
    return {};
  }
};

module.exports = {
  getAlerts,
  updateAlertStatus,
  deleteAlert,
  archiveAlert,
  duplicateAlert,
  getAlertDetails,
  updateAlert,
  createAlert,
  getCityRiskStats,
  getHotelSavingsStats,
  triggerAlertGeneration,
  getSubscribers,
  deleteSubscriber,
  getSubscriberStats,
  processAlert,
  createUser,
  getUsers,
  getUserDetails,
  updateUser,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  getUserStats,
  getAnalytics
}; 