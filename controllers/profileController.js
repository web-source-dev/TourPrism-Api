import User from "../models/User.js";
import tokenManager from "../utils/tokenManager.js";
import Logger from "../utils/logger.js";

/**
 * Get user profile
 * Returns full user data including company information
 */
export const getProfile = async (req, res) => {
  try {
    const token = tokenManager.extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = await tokenManager.verifyToken(token, {
      verifyDatabase: true,
    });

    if (!decoded || !decoded.userData) {
      return res.status(401).json({ message: "Invalid token" });
    }

    // Always refetch fresh user document to avoid stale/lean data
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If this is a collaborator token
    if (decoded.isCollaborator && decoded.collaboratorData) {
      const collaborator = decoded.collaboratorData;

      // Collaborators see the parent account's profile
      return res.json({
        _id: user._id,
        email: user.email,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
        role: user.role,
        status: user.status,
        company: user.company,
        weeklyForecastSubscribed: user.weeklyForecastSubscribed,
        weeklyForecastSubscribedAt: user.weeklyForecastSubscribedAt,
        lastWeeklyForecastReceived: user.lastWeeklyForecastReceived,
        isCollaborator: true,
        collaborator: {
          email: collaborator.email,
          role: collaborator.role,
          name: collaborator.name,
          status: collaborator.status,
        },
      });
    }

    // Regular user - return full profile
    const userResponse = user.toObject ? user.toObject() : user;
    delete userResponse.password;
    delete userResponse.otp;
    delete userResponse.otpExpiry;

    res.json(userResponse);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(401).json({ message: "Invalid token" });
  }
};

/**
 * Update user profile
 * Simple update that handles both step 1 and step 2 data
 */
export const updateProfile = async (req, res) => {
  try {
    // Check if user is a collaborator - collaborators cannot update profile
    if (req.isCollaborator) {
      return res.status(403).json({ message: "Collaborators cannot update profile" });
    }

    const userId = req.userId;
    const updateData = req.body;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update basic user fields
    if (updateData.email !== undefined) user.email = updateData.email;

    // Initialize company object if it doesn't exist
    if (!user.company) {
      user.company = {
        name: '',
        contactName: '',
        city: null,
        rooms: null,
        avgRoomRate: null,
        size: null,
        locations: [],
        incentives: []
      };
    }

    // Update company info - handle both flat and nested formats
    if (updateData.company) {
      // Handle nested company object
      const companyData = updateData.company;
      if (companyData.name !== undefined) user.company.name = companyData.name;
      if (companyData.contactName !== undefined) user.company.contactName = companyData.contactName;
      if (companyData.city !== undefined) user.company.city = companyData.city;
      if (companyData.rooms !== undefined) user.company.rooms = companyData.rooms;
      if (companyData.avgRoomRate !== undefined) user.company.avgRoomRate = companyData.avgRoomRate;
      if (companyData.size !== undefined) user.company.size = companyData.size;
      if (companyData.locations !== undefined) user.company.locations = companyData.locations;
      if (companyData.incentives !== undefined) user.company.incentives = companyData.incentives;
    } else {
      // Handle flat format for backward compatibility
      if (updateData.companyName !== undefined) user.company.name = updateData.companyName;
      if (updateData.contactName !== undefined) user.company.contactName = updateData.contactName;
      if (updateData.city !== undefined) user.company.city = updateData.city;
      if (updateData.rooms !== undefined) user.company.rooms = updateData.rooms;
      if (updateData.avgRoomRate !== undefined) user.company.avgRoomRate = updateData.avgRoomRate;
      if (updateData.companySize !== undefined) user.company.size = updateData.companySize;
      if (updateData.locations !== undefined) user.company.locations = updateData.locations;
      if (updateData.incentives !== undefined) user.company.incentives = updateData.incentives;
    }

    // Update weekly forecast subscription
    if (updateData.weeklyForecastSubscribed !== undefined) {
      user.weeklyForecastSubscribed = updateData.weeklyForecastSubscribed;
      if (updateData.weeklyForecastSubscribed) {
        user.weeklyForecastSubscribedAt = new Date();
      }
    }

    // Save user
    await user.save();

    // Return updated profile (without sensitive data)
    const userResponse = user.toObject ? user.toObject() : user;
    delete userResponse.password;
    delete userResponse.otp;
    delete userResponse.otpExpiry;

    res.json(userResponse);
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
};