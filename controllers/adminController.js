const Alert = require('../models/Alert.js');
const User = require('../models/User.js');
const Subscriber = require('../models/subscribers.js');
const Logger = require('../utils/logger.js');
const csvStorage = require('../utils/csvStorage.js');
const { startOfDay, subDays } = require('date-fns');

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
      query.city = { $regex: city, $options: 'i' };
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

    // Search filter
    if (search) {
      const searchConditions = [
        { title: { $regex: search, $options: 'i' } },
        { summary: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } }
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

    // Store alert info for logging before deletion
    const alertTitle = alert.title;
    const previousStatus = alert.status;

    // Permanently delete the alert from database
    await Alert.findByIdAndDelete(alertId);

    // Log alert deletion
    try {
      await Logger.log(req, 'admin_alert_deleted', {
        alertId,
        alertTitle,
        previousStatus,
        deletionType: 'permanent'
      });
    } catch (error) {
      console.error('Error logging alert deletion:', error);
    }

    res.json({ success: true, message: "Alert permanently deleted successfully" });
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

    // Update the alert with the sanitized data
    const updatedAlert = await Alert.findByIdAndUpdate(
      alertId,
      validUpdateData,
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
      city: city
    });

    const cityRiskStats = {
      city,
      totalAlerts: alertsThisWeek.length,
      alertsThisWeek: alertsThisWeek.length,
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

// Send alert to user's actual guests (Pro users only)
const sendAlertToGuests = async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.userId;

    // Get alert details
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    // Get user profile for hotel information
    const User = require('../models/User.js');
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get user's bookings to find guest emails
    const Booking = require('../models/Booking.js');
    const bookings = await Booking.find({
      hotelId: userId,
      guestEmail: { $exists: true, $ne: null, $ne: '' }
    });

    if (bookings.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No bookings with guest email addresses found"
      });
    }

    // Import email service
    const sendAlertNotificationToGuest = require('../utils/emailTemplates/alertNotification-guests.js');

    // Prepare email content using the disruption report logic
    const hotelName = user.company?.name || 'Your Hotel';
    const contactName = user.company?.contactName || user.email;

    // Calculate disruption risk using the utility
    const disruptionCalculations = require('../utils/disruptionCalculations.js');
    const riskData = disruptionCalculations.calculateDisruptionRisk(alert, user);
    const when = disruptionCalculations.formatWhenText(alert.startDate);

    // Create personalized message for guests
    const message = `We know the ${alert.mainType?.replace('_', ' ') || 'disruption'} might mess up your plans ${when === 'tomorrow' ? 'tomorrow' : when}.

Your booking is safe with us — and to make it easier we offer:

${user.company?.incentives?.length > 0 ?
  user.company.incentives.slice(0, 2).map(incentive => `→ ${incentive}`).join('\n') :
  '→ Free parking all day\n→ Late check-out until 1 PM'
}

Just show this at the reception.

See you soon!
${hotelName} Team`;

    // Send emails to all guests
    let sentCount = 0;
    let failedCount = 0;
    const failedEmails = [];

    for (const booking of bookings) {
      try {
        const success = await sendAlertNotificationToGuest(
          booking.guestEmail,
          booking.guestFirstName,
          riskData.header,
          message,
          {
            ...alert.toObject(),
            summary: alert.summary,
            city: alert.city,
            startDate: alert.startDate,
            endDate: alert.endDate,
            status: alert.status,
            createdAt: alert.createdAt
          }
        );

        if (success) {
          sentCount++;
        } else {
          failedCount++;
          failedEmails.push(booking.guestEmail);
        }
      } catch (error) {
        console.error(`Failed to send email to ${booking.guestEmail}:`, error);
        failedCount++;
        failedEmails.push(booking.guestEmail);
      }
    }

    // Log the action
    await Logger.log(req, 'alert_sent_to_guests', {
      alertId: alert._id,
      alertTitle: alert.title,
      totalBookings: bookings.length,
      emailsSent: sentCount,
      emailsFailed: failedCount,
      failedEmails: failedEmails.slice(0, 10) // Log first 10 failed emails
    });

    res.json({
      success: true,
      message: `Alert sent to ${sentCount} guests${failedCount > 0 ? ` (${failedCount} failed)` : ''}`,
      data: {
        totalGuests: bookings.length,
        sentTo: sentCount,
        failed: failedCount,
        failedEmails: failedEmails.slice(0, 5) // Return first 5 failed emails in response
      }
    });

  } catch (error) {
    console.error('Error sending alert to guests:', error);

    await Logger.log(req, 'alert_send_to_guests_error', {
      alertId: req.params.alertId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      message: 'Failed to send alert to guests',
      error: error.message
    });
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

// Delete user (admin only) - permanently delete from database
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Store user info for logging before deletion
    const userEmail = user.email;
    const userRole = user.role;

    // Clean up related data before deleting user
    const Booking = require('../models/Booking.js');
    const Alert = require('../models/Alert.js');

    // Delete all bookings associated with this user (hotelId)
    const bookingsDeleted = await Booking.deleteMany({ hotelId: userId });
    console.log(`Deleted ${bookingsDeleted.deletedCount} bookings for user ${userId}`);

    // Remove user from alerts' followedBy arrays
    const alertsUpdated = await Alert.updateMany(
      { followedBy: userId },
      { $pull: { followedBy: userId } }
    );
    console.log(`Removed user from ${alertsUpdated.modifiedCount} alerts' followedBy arrays`);

    // Permanently delete the user from database
    await User.findByIdAndDelete(userId);

    // Note: Logs with userId reference are kept for audit trail purposes

    // Log user deletion
    await Logger.log(req, 'admin_user_deleted', {
      userId,
      userEmail,
      userRole,
      deletionType: 'permanent',
      bookingsDeleted: bookingsDeleted.deletedCount,
      alertsUpdated: alertsUpdated.modifiedCount
    });

    res.json({
      success: true,
      message: "User permanently deleted successfully",
      details: {
        bookingsDeleted: bookingsDeleted.deletedCount,
        alertsUpdated: alertsUpdated.modifiedCount
      }
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

// Helper function to determine source credibility for confidence calculation
const getSourceCredibility = (source) => {
  if (!source) return 'other_news';

  const lowerSource = source.toLowerCase();

  // Official sources
  if (lowerSource.includes('bbc') || lowerSource.includes('met') || lowerSource.includes('gov.uk')) {
    return 'official';
  }

  // Major news sources
  if (lowerSource.includes('sky') || lowerSource.includes('reuters') || lowerSource.includes('guardian') ||
      lowerSource.includes('independent') || lowerSource.includes('telegraph')) {
    return 'major_news';
  }

  // Social media
  if (lowerSource.includes('twitter') || lowerSource.includes('x ') || lowerSource.includes('reddit') ||
      lowerSource.includes('forum')) {
    return 'social';
  }

  // Default to other news
  return 'other_news';
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
    // Get all approved alerts in the date range
    const alerts = await Alert.find({
          status: 'approved',
      createdAt: { $gte: startDate, $lte: endDate }
    });

    // Get all active users with complete profiles
    const users = await User.find({
      status: 'active',
      'company.rooms': { $exists: true, $ne: null },
      'company.avgRoomRate': { $exists: true, $ne: null },
      'company.size': { $exists: true }
    });

    // Import disruption calculations
    const disruptionCalculations = require('../utils/disruptionCalculations');

    let totalRevenueAtRisk = 0;
    let totalRevenueSaved = 0;
    const revenueByType = {};
    const monthlyRevenue = {};

    // Calculate revenue impact for each alert against each user
    for (const alert of alerts) {
      for (const user of users) {
        const riskData = disruptionCalculations.calculateDisruptionRisk(alert, user);

        // Accumulate totals
        totalRevenueAtRisk += riskData.poundsAtRisk;
        totalRevenueSaved += riskData.poundsSaved;

        // Group by alert type
        const alertType = alert.mainType || 'other';
        if (!revenueByType[alertType]) {
          revenueByType[alertType] = {
            totalRevenueAtRisk: 0,
            totalRevenueSaved: 0,
            count: 0
          };
        }
        revenueByType[alertType].totalRevenueAtRisk += riskData.poundsAtRisk;
        revenueByType[alertType].totalRevenueSaved += riskData.poundsSaved;
        revenueByType[alertType].count += 1;

        // Monthly grouping
        const monthKey = alert.createdAt.toISOString().substring(0, 7); // YYYY-MM format
        if (!monthlyRevenue[monthKey]) {
          monthlyRevenue[monthKey] = {
            totalRevenueAtRisk: 0,
            totalRevenueSaved: 0,
            alertCount: 0
          };
        }
        monthlyRevenue[monthKey].totalRevenueAtRisk += riskData.poundsAtRisk;
        monthlyRevenue[monthKey].totalRevenueSaved += riskData.poundsSaved;
        monthlyRevenue[monthKey].alertCount += 1;
        }
    }

    // Convert revenueByType object to array format expected by frontend
    const revenueByTypeArray = Object.entries(revenueByType).map(([type, data]) => ({
      _id: type,
      totalRevenueAtRisk: data.totalRevenueAtRisk,
      totalRevenueSaved: data.totalRevenueSaved,
      count: data.count
    })).sort((a, b) => b.totalRevenueAtRisk - a.totalRevenueAtRisk);

    // Convert monthlyRevenue object to array format
    const monthlyRevenueArray = Object.entries(monthlyRevenue).map(([month, data]) => ({
      _id: month,
      totalRevenueAtRisk: data.totalRevenueAtRisk,
      totalRevenueSaved: data.totalRevenueSaved,
      alertCount: data.alertCount
    })).sort((a, b) => a._id.localeCompare(b._id));

    // Hotel size impact distribution (unchanged)
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

    // Calculate total stats
    const totalStats = {
      totalRevenueAtRisk: Math.round(totalRevenueAtRisk),
      totalRevenueSaved: Math.round(totalRevenueSaved),
      totalAlerts: alerts.length,
      totalUsers: users.length
    };

    return {
      revenueByType: revenueByTypeArray,
      monthlyRevenue: monthlyRevenueArray,
      hotelSizeImpact: hotelSizeImpact,
      totalStats: totalStats,
      totalHotels: users.length
    };
  } catch (error) {
    console.error('Error in revenue analytics:', error);
    return {};
  }
};

// Download CSV template for bulk alert upload
const downloadAlertTemplate = async (req, res) => {
  try {
    // CSV template headers
    const headers = [
      'title',
      'summary',
      'city',
      'mainType',
      'subType',
      'status',
      'startDate',
      'endDate',
      'source',
      'url',
      'confidence'
    ];

    // Helper function to escape CSV values
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      // If value contains comma, quote, or newline, wrap in quotes and escape quotes
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    // Create CSV content with headers and example row
    const exampleRow = [
      'Ryanair Rome-Edinburgh pilot strike',
      'All Ryanair flights from Rome to Edinburgh cancelled due to pilot strike. Italian guests may not arrive.',
      'Edinburgh',
      'strike',
      'airline_pilot',
      'pending',
      '2025-12-25',
      '2025-12-26',
      'Reuters',
      'https://www.reuters.com/example',
      '0.7'
    ];

    const csvContent = [
      headers.map(escapeCSV).join(','),
      exampleRow.map(escapeCSV).join(',')
    ].join('\n');

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="alerts_template.csv"');
    res.send(csvContent);

  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({ message: 'Failed to generate template', error: error.message });
  }
};

// Upload and process bulk alerts from CSV
const uploadBulkAlerts = async (req, res) => {
  let csvFile = null;
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { buffer, originalname, mimetype } = req.file;
    const csv = require('csv-parser');
    const { Readable } = require('stream');

    // Store the CSV file first
    csvFile = await csvStorage.saveFile(buffer, originalname, mimetype, req.userId);

    const alerts = [];
    const errors = [];
    let processedCount = 0;

    // Parse CSV
    const stream = Readable.from(buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => {
          processedCount++;
          try {
            // Validate required fields
            if (!row.title || !row.summary || !row.city) {
              errors.push({
                row: processedCount,
                message: 'Missing required fields: title, summary, or city'
              });
              return;
            }

            // Validate city
            if (!['Edinburgh', 'London'].includes(row.city)) {
              errors.push({
                row: processedCount,
                field: 'city',
                message: 'City must be Edinburgh or London'
              });
              return;
            }

            // Validate status
            const validStatuses = ['pending', 'approved', 'expired'];
            const status = row.status || 'pending';
            if (!validStatuses.includes(status)) {
              errors.push({
                row: processedCount,
                field: 'status',
                message: `Status must be one of: ${validStatuses.join(', ')}`
              });
              return;
            }

            // Parse dates
            let startDate, endDate;
            if (row.startDate) {
              startDate = new Date(row.startDate);
              if (isNaN(startDate.getTime())) {
                errors.push({
                  row: processedCount,
                  field: 'startDate',
                  message: 'Invalid start date format. Use YYYY-MM-DD'
                });
                return;
              }
            }

            if (row.endDate) {
              endDate = new Date(row.endDate);
              if (isNaN(endDate.getTime())) {
                errors.push({
                  row: processedCount,
                  field: 'endDate',
                  message: 'Invalid end date format. Use YYYY-MM-DD'
                });
                return;
              }
            }

            // Validate date range
            if (startDate && endDate && endDate < startDate) {
              errors.push({
                row: processedCount,
                message: 'End date must be after start date'
              });
              return;
            }

            // Parse confidence (0-1) or calculate if not provided
            let confidence = 0;
            if (row.confidence) {
              confidence = parseFloat(row.confidence);
              if (isNaN(confidence) || confidence < 0 || confidence > 1) {
                errors.push({
                  row: processedCount,
                  field: 'confidence',
                  message: 'Confidence must be a number between 0 and 1'
                });
                return;
              }
            } else {
              // Calculate confidence based on source credibility
              const source = row.source?.trim() || 'Manual Upload';
              const mockCluster = [{
                sourceCredibility: getSourceCredibility(source)
              }];
              const confidenceResult = alertProcessor.calculateConfidence(mockCluster);
              confidence = confidenceResult.score;
            }

            // Build alert data
            const alertData = {
              title: row.title.trim(),
              summary: row.summary.trim(),
              city: row.city.trim(),
              mainType: row.mainType?.trim() || 'other',
              subType: row.subType?.trim() || 'general disruption',
              status: status,
              startDate: startDate || null,
              endDate: endDate || null,
              source: row.source?.trim() || 'Manual Upload',
              url: row.url?.trim() || null,
              confidence: confidence,
              sourceCsv: {
                fileId: csvFile.fileId,
                fileName: csvFile.originalName,
                uploadedAt: csvFile.createdAt,
                uploadedBy: req.userId
              }
            };

            alerts.push(alertData);

          } catch (error) {
            errors.push({
              row: processedCount,
              message: `Error processing row: ${error.message}`
            });
          }
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });

    // If there are too many errors, don't save anything
    if (errors.length > Math.min(alerts.length * 0.1, 10)) {
      return res.status(400).json({
        success: false,
        message: 'Too many errors in CSV file. Please fix the errors and try again.',
        data: {
          totalProcessed: processedCount,
          successful: 0,
          errors: errors.length
        },
        errors: errors.slice(0, 20)
      });
      
    }

    // Save alerts to database
    if (alerts.length > 0) {
      const savedAlerts = await Alert.insertMany(alerts, { ordered: false });

      // Update CSV file with upload statistics
      csvFile.uploadStats = {
        totalRows: processedCount,
        successfulAlerts: savedAlerts.length,
        failedRows: errors.length
      };
      await csvFile.save();

      await Logger.log(req, 'alerts_bulk_upload', {
        fileId: csvFile.fileId,
        fileName: originalname,
        totalRows: processedCount,
        successfulAlerts: savedAlerts.length,
        errors: errors.length
      });

      return res.status(200).json({
        success: true,
        message: `Successfully uploaded ${savedAlerts.length} alerts`,
        data: {
          totalProcessed: processedCount,
          successful: savedAlerts.length,
          errors: errors.length,
          csvFile: {
            fileId: csvFile.fileId,
            fileName: csvFile.originalName,
            uploadedAt: csvFile.createdAt
          },
          alerts: savedAlerts
        },
        errors: errors.slice(0, 10)
      });
    }

    return res.status(200).json({
      success: true,
      message: 'No valid alerts found in CSV file',
      data: {
        totalProcessed: processedCount,
        successful: 0,
        errors: errors.length
      },
      errors
    });

  } catch (error) {
    console.error('Error uploading bulk alerts:', error);

    // Clean up CSV file if it was saved but upload failed
    if (csvFile) {
      try {
        await csvStorage.deleteFile(csvFile.fileId, req.userId);
      } catch (cleanupError) {
        console.error('Error cleaning up CSV file:', cleanupError);
      }
    }

    await Logger.log(req, 'alerts_bulk_upload_error', {
      error: error.message,
      fileName: req.file?.originalname
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to process CSV file',
      error: error.message
    });
  }
};

// Get list of uploaded CSV files (admin only)
const getCsvFiles = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const { files, total } = await csvStorage.listFiles(null, limitNumber, skip);

    // Add alert counts for each CSV file
    const filesWithStats = await Promise.all(
      files.map(async (file) => {
        const alertCount = await csvStorage.getAlertsCount(file.fileId);
        return {
          ...file,
          alertCount
        };
      })
    );

    res.json({
      files: filesWithStats,
      totalCount: total,
      currentPage: pageNumber,
      totalPages: Math.ceil(total / limitNumber)
    });
  } catch (error) {
    console.error('Error fetching CSV files:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Download a specific CSV file (admin only)
const downloadCsvFile = async (req, res) => {
  try {
    const { fileId } = req.params;

    const csvFile = await csvStorage.getFile(fileId);
    const fileContent = await csvStorage.getFileContent(fileId);

    // Set headers for file download
    res.setHeader('Content-Type', csvFile.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${csvFile.originalName}"`);
    res.setHeader('Content-Length', csvFile.fileSize);

    res.send(fileContent);
  } catch (error) {
    console.error('Error downloading CSV file:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ message: "CSV file not found" });
    }

    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete a CSV file and optionally its associated alerts (admin only)
const deleteCsvFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { deleteAlerts = false } = req.query;

    // Get file info before deletion
    const csvFile = await csvStorage.getFile(fileId);

    let alertsResult = null;
    if (deleteAlerts) {
      // Delete associated alerts
      alertsResult = await csvStorage.deleteAssociatedAlerts(fileId, req.userId);
    }

    // Delete the CSV file
    await csvStorage.deleteFile(fileId, req.userId);

    // Log the action
    await Logger.log(req, 'csv_file_deleted', {
      fileId: csvFile.fileId,
      fileName: csvFile.originalName,
      deleteAlerts,
      alertsAffected: alertsResult?.deletedCount || 0
    });

    res.json({
      success: true,
      message: `CSV file deleted successfully${deleteAlerts ? ` and ${alertsResult.deletedCount} associated alerts marked as expired` : ''}`,
      data: {
        fileId: csvFile.fileId,
        fileName: csvFile.originalName,
        alertsAffected: alertsResult?.deletedCount || 0,
        alerts: alertsResult?.alerts || []
      }
    });
  } catch (error) {
    console.error('Error deleting CSV file:', error);

    if (error.message.includes('not found') || error.message.includes('access denied')) {
      return res.status(404).json({ message: "CSV file not found or access denied" });
    }

    res.status(500).json({ message: "Server error", error: error.message });
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
  getAnalytics,
  downloadAlertTemplate,
  uploadBulkAlerts,
  sendAlertToGuests,
  getCsvFiles,
  downloadCsvFile,
  deleteCsvFile
}; 