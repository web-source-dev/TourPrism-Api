import SearchTracking from "../models/SearchTracking.js";
import User from "../models/User.js";
import Logger from "../utils/logger.js";

// Track user search queries
export const trackSearchQuery = async (req, res) => {
  try {
    const { 
      searchQuery, 
      hasResults, 
      resultsCount = 0,
      sessionId 
    } = req.body;

    // Validate required fields
    if (!searchQuery || typeof hasResults !== 'boolean') {
      return res.status(400).json({ 
        message: "Search query and hasResults are required" 
      });
    }

    // Get user info if authenticated
    let userId = null;
    let isAuthenticated = false;
    let userEmail = null;
    let userName = null;

    if (req.userId) {
      userId = req.userId;
      isAuthenticated = true;
      
      // Get user details for logging
      const user = await User.findById(req.userId).select('email firstName lastName');
      if (user) {
        userEmail = user.email;
        userName = user.firstName && user.lastName ? 
          `${user.firstName} ${user.lastName}` : 
          (user.firstName || user.email.split('@')[0]);
      }
    }

    // Create search tracking record
    const searchTrackingData = {
      searchQuery: searchQuery.trim(),
      userId,
      isAuthenticated,
      hasResults,
      resultsCount,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      sessionId: sessionId || null
    };

    const searchTracking = new SearchTracking(searchTrackingData);
    await searchTracking.save();

    // Log the action
    await Logger.logCRUD('create', req, 'Search query tracked', searchTracking._id, {
      searchQuery: searchQuery.trim(),
      hasResults,
      resultsCount,
      isAuthenticated,
      sessionId: sessionId || null
    });

    res.status(201).json({
      message: "Search query tracked successfully",
      searchTracking: {
        id: searchTracking._id,
        searchQuery: searchTracking.searchQuery,
        hasResults: searchTracking.hasResults,
        resultsCount: searchTracking.resultsCount
      }
    });

  } catch (error) {
    console.error("Error tracking search query:", error);
    res.status(500).json({ 
      message: "Failed to track search query",
      error: error.message 
    });
  }
};

// Get search analytics (for admin)
export const getSearchAnalytics = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      searchQuery, 
      hasResults,
      startDate,
      endDate,
      userId
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};

    // Filter by search query if provided
    if (searchQuery) {
      query.searchQuery = new RegExp(searchQuery, 'i');
    }

    // Filter by results status if provided
    if (hasResults !== undefined) {
      query.hasResults = hasResults === 'true';
    }

    // Filter by user if provided
    if (userId) {
      query.userId = userId;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const total = await SearchTracking.countDocuments(query);
    
    const searchTracking = await SearchTracking.find(query)
      .populate('userId', 'email firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Log the action
    await Logger.logCRUD('list', req, 'Search analytics viewed', null, {
      trackingCount: searchTracking.length,
      totalCount: total,
      filters: { searchQuery, hasResults, startDate, endDate, userId }
    });

    res.json({
      searchTracking,
      totalCount: total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });

  } catch (error) {
    console.error("Error fetching search analytics:", error);
    res.status(500).json({ 
      message: "Failed to fetch search analytics",
      error: error.message 
    });
  }
};

// Get popular search queries
export const getPopularSearches = async (req, res) => {
  try {
    const { limit = 20, days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Aggregate to get popular searches
    const popularSearches = await SearchTracking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$searchQuery',
          count: { $sum: 1 },
          hasResultsCount: { $sum: { $cond: ['$hasResults', 1, 0] } },
          noResultsCount: { $sum: { $cond: ['$hasResults', 0, 1] } },
          lastSearched: { $max: '$createdAt' }
        }
      },
      {
        $addFields: {
          successRate: {
            $cond: [
              { $eq: ['$count', 0] },
              0,
              { $multiply: [{ $divide: ['$hasResultsCount', '$count'] }, 100] }
            ]
          }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    // Log the action
    await Logger.logCRUD('list', req, 'Popular searches viewed', null, {
      popularSearchesCount: popularSearches.length,
      days: parseInt(days)
    });

    res.json({
      popularSearches,
      totalDays: parseInt(days),
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error fetching popular searches:", error);
    res.status(500).json({ 
      message: "Failed to fetch popular searches",
      error: error.message 
    });
  }
};

// Get search analytics summary
export const getSearchAnalyticsSummary = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get summary statistics
    const summary = await SearchTracking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalSearches: { $sum: 1 },
          searchesWithResults: { $sum: { $cond: ['$hasResults', 1, 0] } },
          searchesWithoutResults: { $sum: { $cond: ['$hasResults', 0, 1] } },
          uniqueSearches: { $addToSet: '$searchQuery' },
          authenticatedSearches: { $sum: { $cond: ['$isAuthenticated', 1, 0] } },
          anonymousSearches: { $sum: { $cond: ['$isAuthenticated', 0, 1] } }
        }
      },
      {
        $addFields: {
          uniqueSearchCount: { $size: '$uniqueSearches' },
          successRate: {
            $cond: [
              { $eq: ['$totalSearches', 0] },
              0,
              { $multiply: [{ $divide: ['$searchesWithResults', '$totalSearches'] }, 100] }
            ]
          }
        }
      }
    ]);

    // Log the action
    await Logger.logCRUD('list', req, 'Search analytics summary viewed', null, {
      days: parseInt(days)
    });

    res.json({
      summary: summary[0] || {
        totalSearches: 0,
        searchesWithResults: 0,
        searchesWithoutResults: 0,
        uniqueSearchCount: 0,
        authenticatedSearches: 0,
        anonymousSearches: 0,
        successRate: 0
      },
      period: {
        days: parseInt(days),
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error fetching search analytics summary:", error);
    res.status(500).json({ 
      message: "Failed to fetch search analytics summary",
      error: error.message 
    });
  }
};
