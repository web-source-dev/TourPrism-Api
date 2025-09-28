import CitySearch from "../models/CitySearch.js";
import User from "../models/User.js";
import Logger from "../utils/logger.js";

// Store city search email
export const storeCitySearchEmail = async (req, res) => {
  try {
    const { 
      email, 
      searchedCity, 
      cityName, 
      latitude, 
      longitude 
    } = req.body;

    // Validate required fields
    if (!email || !searchedCity) {
      return res.status(400).json({ 
        message: "Email and searched city are required" 
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: "Please provide a valid email address" 
      });
    }

    // Check if this email + city combination already exists
    const existingSearch = await CitySearch.findOne({
      email: email.toLowerCase().trim(),
      searchedCity: searchedCity.trim()
    });

    if (existingSearch) {
      return res.status(409).json({ 
        message: "You're already subscribed to notifications for this city search" 
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

    // Create city search record
    const citySearchData = {
      email: email.toLowerCase().trim(),
      searchedCity: searchedCity.trim(),
      cityName: cityName?.trim() || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      userId,
      isAuthenticated,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    };

    const citySearch = new CitySearch(citySearchData);
    await citySearch.save();

    // Log the action
    await Logger.logCRUD('create', req, 'City search subscription', citySearch._id, {
      email: email.toLowerCase().trim(),
      searchedCity: searchedCity.trim(),
      cityName: cityName?.trim(),
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      isAuthenticated
    });

    res.status(201).json({
      message: "Successfully subscribed to notifications for this city search",
      citySearch: {
        id: citySearch._id,
        email: citySearch.email,
        searchedCity: citySearch.searchedCity,
        cityName: citySearch.cityName
      }
    });

  } catch (error) {
    console.error("Error storing city search email:", error);
    res.status(500).json({ 
      message: "Failed to store city search email",
      error: error.message 
    });
  }
};

// Get city search subscriptions (for admin or user)
export const getCitySearchSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 10, email, searchedCity } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};

    // If user is authenticated, they can only see their own subscriptions
    if (req.userId) {
      query.userId = req.userId;
    } else if (email) {
      // For non-authenticated users, filter by email
      query.email = email.toLowerCase().trim();
    }

    // Filter by searched city if provided
    if (searchedCity) {
      query.searchedCity = new RegExp(searchedCity, 'i');
    }

    const total = await CitySearch.countDocuments(query);
    
    const subscriptions = await CitySearch.find(query)
      .populate('userId', 'email firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Log the action
    await Logger.logCRUD('list', req, 'City search subscriptions', null, {
      subscriptionCount: subscriptions.length,
      totalCount: total,
      filters: { email, searchedCity }
    });

    res.json({
      subscriptions,
      totalCount: total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });

  } catch (error) {
    console.error("Error fetching city search subscriptions:", error);
    res.status(500).json({ 
      message: "Failed to fetch subscriptions",
      error: error.message 
    });
  }
};
