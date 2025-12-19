import Logs from '../models/Logs.js';
import User from '../models/User.js';
import Logger from '../utils/logger.js';

// Get all logs with pagination and filtering
export const getAllLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      action,
      userId,
      userEmail,
      startDate,
      endDate,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    // Build query object
    const query = {};

    // Filter by action if provided
    if (action) {
      query.action = action;
    }

    // Filter by userId if provided
    if (userId) {
      query.userId = userId;
    }

    // Filter by userEmail (case insensitive)
    if (userEmail) {
      query.userEmail = { $regex: new RegExp(userEmail, 'i') };
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      query.timestamp = {};
      
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Define sort order
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const logs = await Logs.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const total = await Logs.countDocuments(query);

    // Log the action
    await Logger.logCRUD('list', req, 'System logs', null, {
      logCount: logs.length,
      totalCount: total,
      filters: { action, userId, userEmail, startDate, endDate }
    });

    // Return paginated results
    res.json({
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get logs for a specific user
export const getUserLogs = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Validate user exists
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get user logs
    const logs = await Logs.find({ userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const total = await Logs.countDocuments({ userId });

    // Log the action
    await Logger.logCRUD('list', req, 'User logs', userId, {
      logCount: logs.length,
      totalCount: total
    });

    // Return paginated results
    res.json({
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching user logs:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get activity summary (counts by action type)
export const getActivitySummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build time range query
    const timeQuery = {};
    if (startDate || endDate) {
      timeQuery.timestamp = {};
      
      if (startDate) {
        timeQuery.timestamp.$gte = new Date(startDate);
      }
      
      if (endDate) {
        timeQuery.timestamp.$lte = new Date(endDate);
      }
    }

    // Use aggregation to group by action and count
    const activitySummary = await Logs.aggregate([
      { $match: timeQuery },
      { 
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          latestActivity: { $max: '$timestamp' }
        }
      },
      { $sort: { latestActivity: -1 } }
    ]);

    // Get total user count and active user count
    const totalUsers = await User.countDocuments();
    
    // Count distinct users in logs for the given time period
    const activeUserCount = await Logs.aggregate([
      { $match: { ...timeQuery, userId: { $exists: true, $ne: null } } },
      { $group: { _id: '$userId' } },
      { $count: 'activeUsers' }
    ]);

    const activeUsers = activeUserCount.length > 0 ? activeUserCount[0].activeUsers : 0;

    // Log the action
    await Logger.logCRUD('view', req, 'Activity summary', null, {
      activityTypes: activitySummary.length,
      totalUsers,
      activeUsers
    });

    res.json({
      activitySummary,
      userStats: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers
      }
    });
  } catch (error) {
    console.error('Error generating activity summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get most active users
export const getMostActiveUsers = async (req, res) => {
  try {
    const { limit = 10, startDate, endDate } = req.query;
    const limitNum = parseInt(limit);

    // Build time range query
    const timeQuery = {};
    if (startDate || endDate) {
      timeQuery.timestamp = {};
      
      if (startDate) {
        timeQuery.timestamp.$gte = new Date(startDate);
      }
      
      if (endDate) {
        timeQuery.timestamp.$lte = new Date(endDate);
      }
    }

    // Aggregate to find most active users
    const activeUsers = await Logs.aggregate([
      { $match: { ...timeQuery, userId: { $exists: true, $ne: null } } },
      { 
        $group: {
          _id: '$userId',
          count: { $sum: 1 },
          email: { $first: '$userEmail' },
          name: { $first: '$userName' },
          lastActivity: { $max: '$timestamp' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limitNum }
    ]);

    // Get user details for most active users
    const userIds = activeUsers.map(user => user._id);
    const userDetails = await User.find({ _id: { $in: userIds } })
      .select('firstName lastName email role status')
      .lean();

    // Merge user details with activity data
    const enrichedUserActivity = activeUsers.map(user => {
      const details = userDetails.find(u => u._id.toString() === user._id.toString()) || {};
      return {
        ...user,
        userDetails: details
      };
    });

    // Log the action
    await Logger.logCRUD('view', req, 'Most active users', null, {
      userCount: enrichedUserActivity.length,
      limit: limitNum
    });

    res.json(enrichedUserActivity);
  } catch (error) {
    console.error('Error fetching most active users:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add a new log entry directly (for testing or manual addition)
export const addLog = async (req, res) => {
  try {
    const { action, userId, userEmail, userName, details } = req.body;

    // Action is a free-form string, no validation needed

    // Create log entry
    const log = await Logs.createLog({
      action,
      userId,
      userEmail,
      userName,
      details,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Log the action
    await Logger.logCRUD('create', req, 'Manual log entry', log._id, {
      action,
      userId,
      userEmail
    });

    res.status(201).json({ message: 'Log created', log });
  } catch (error) {
    console.error('Error adding log:', error);
    res.status(500).json({ message: 'Server error' });
  }
}; 