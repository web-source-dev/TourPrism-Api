import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Logger from "./logger.js";
import crypto from "crypto";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Global Token Management System
 * Handles JWT token generation, verification, refresh, and blacklisting
 */

class TokenManager {
  constructor() {
    this.tokenBlacklist = new Set();
    this.refreshTokens = new Map(); // In production, use Redis or database
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh';
    this.tokenExpiry = process.env.JWT_EXPIRY || "24h";
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || "7d";
  }

  /**
   * Generate a new JWT token for a user
   * @param {Object} user - User object from database
   * @param {Object} collaborator - Optional collaborator object
   * @param {Object} options - Additional options
   * @returns {Object} - { accessToken, refreshToken, expiresIn }
   */
  generateTokens(user, collaborator = null, options = {}) {
    try {
      // Validate user object
      if (!user || !user._id) {
        throw new Error("Invalid user object provided");
      }

      // Create token payload
      const tokenPayload = {
        userId: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
        role: user.role,
        status: user.status,
        lastLogin: user.lastLogin,
        weeklyForecastSubscribed: user.weeklyForecastSubscribed,
        weeklyForecastSubscribedAt: user.weeklyForecastSubscribedAt,
        lastWeeklyForecastReceived: user.lastWeeklyForecastReceived,
        company: user.company,
        preferences: user.preferences,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        tokenId: crypto.randomUUID(), // Unique token identifier
        iat: Math.floor(Date.now() / 1000), // Issued at
        ...options.metadata
      };

      // Add collaborator information if present
      if (collaborator) {
        tokenPayload.isCollaborator = true;
        tokenPayload.collaboratorEmail = collaborator.email;
        tokenPayload.collaboratorRole = collaborator.role;
        tokenPayload.collaboratorName = collaborator.name;
        tokenPayload.collaboratorStatus = collaborator.status;
        tokenPayload.collaboratorId = collaborator._id?.toString();
      } else {
        tokenPayload.isCollaborator = false;
      }

      // Generate access token
      const accessToken = jwt.sign(tokenPayload, this.jwtSecret, {
        expiresIn: this.tokenExpiry,
        issuer: 'tourprism-api',
        audience: 'tourprism-client'
      });

      // Generate refresh token
      const refreshTokenPayload = {
        userId: user._id.toString(),
        tokenId: tokenPayload.tokenId,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000)
      };

      const refreshToken = jwt.sign(refreshTokenPayload, this.jwtRefreshSecret, {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'tourprism-api',
        audience: 'tourprism-client'
      });

      // Store refresh token for validation
      this.refreshTokens.set(tokenPayload.tokenId, {
        userId: user._id.toString(),
        refreshToken,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.parseExpiry(this.refreshTokenExpiry))
      });

      // Calculate expiry time
      const expiresIn = this.parseExpiry(this.tokenExpiry);
      const expiresAt = new Date(Date.now() + expiresIn);

      return {
        accessToken,
        refreshToken,
        expiresIn: expiresIn,
        expiresAt: expiresAt,
        tokenId: tokenPayload.tokenId
      };
    } catch (error) {
      console.error('Error generating tokens:', error);
      throw new Error('Failed to generate authentication tokens');
    }
  }

  /**
   * Verify and decode a JWT token
   * @param {string} token - JWT token to verify
   * @param {Object} options - Verification options
   * @returns {Object|null} - Decoded token data or null if invalid
   */
  async verifyToken(token, options = {}) {
    try {
      if (!token) {
        return null;
      }

      // Check if token is blacklisted
      if (this.tokenBlacklist.has(token)) {
        return null;
      }

      // Verify token signature and decode
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'tourprism-api',
        audience: 'tourprism-client'
      });

      // Additional validation
      if (!decoded.userId || !decoded.tokenId) {
        return null;
      }

      // If database verification is required (default: true)
      if (options.verifyDatabase !== false) {
        const user = await User.findById(decoded.userId);
        if (!user) {
          return null;
        }

        // Check if user is active
        if (user.status !== 'active') {
          return null;
        }

        // For collaborators, verify collaborator still exists and is active
        if (decoded.isCollaborator) {
          const collaborator = user.collaborators.find(c => c.email === decoded.collaboratorEmail);
          if (!collaborator || collaborator.status !== 'active') {
            return null;
          }
          
          // Add fresh collaborator data
          decoded.collaboratorData = collaborator;
        }

        // Add fresh user data
        decoded.userData = user;
      }

      return decoded;
    } catch (error) {
      // Handle specific JWT errors
      if (error.name === 'TokenExpiredError') {
        return null;
      } else if (error.name === 'JsonWebTokenError') {
        return null;
      } else if (error.name === 'NotBeforeError') {
        return null;
      }
      
      console.error('Token verification error:', error);
      return null;
    }
  }

  /**
   * Refresh an access token using a refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Object|null} - New tokens or null if invalid
   */
  async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret, {
        issuer: 'tourprism-api',
        audience: 'tourprism-client'
      });

      if (decoded.type !== 'refresh' || !decoded.tokenId) {
        return null;
      }

      // Check if refresh token exists in our store
      const storedToken = this.refreshTokens.get(decoded.tokenId);
      if (!storedToken || storedToken.refreshToken !== refreshToken) {
        return null;
      }

      // Check if refresh token is expired
      if (new Date() > storedToken.expiresAt) {
        this.refreshTokens.delete(decoded.tokenId);
        return null;
      }

      // Get fresh user data
      const user = await User.findById(decoded.userId);
      if (!user || user.status !== 'active') {
        this.refreshTokens.delete(decoded.tokenId);
        return null;
      }

      // Find collaborator if this was a collaborator token
      let collaborator = null;
      if (decoded.isCollaborator) {
        collaborator = user.collaborators.find(c => c.email === decoded.collaboratorEmail);
        if (!collaborator || collaborator.status !== 'active') {
          this.refreshTokens.delete(decoded.tokenId);
          return null;
        }
      }

      // Generate new tokens
      const newTokens = this.generateTokens(user, collaborator);
      
      // Remove old refresh token
      this.refreshTokens.delete(decoded.tokenId);

      return newTokens;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return null;
    }
  }

  /**
   * Blacklist a token (logout)
   * @param {string} token - Token to blacklist
   * @param {string} tokenId - Token ID to also blacklist refresh token
   */
  blacklistToken(token, tokenId = null) {
    this.tokenBlacklist.add(token);
    
    if (tokenId) {
      this.refreshTokens.delete(tokenId);
    }

    // Clean up expired blacklisted tokens periodically
    this.cleanupBlacklist();
  }

  /**
   * Extract token from request headers
   * @param {Object} req - Express request object
   * @returns {string|null} - Extracted token or null
   */
  extractTokenFromRequest(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.split(' ')[1];
  }

  /**
   * Parse expiry string to milliseconds
   * @param {string} expiry - Expiry string (e.g., "24h", "7d", "30m")
   * @returns {number} - Milliseconds
   */
  parseExpiry(expiry) {
    const units = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 24 * 60 * 60 * 1000; // Default to 24 hours
    }

    const value = parseInt(match[1]);
    const unit = match[2];
    return value * units[unit];
  }

  /**
   * Clean up expired blacklisted tokens
   */
  cleanupBlacklist() {
    // In production, implement proper cleanup logic
    // For now, we'll keep it simple
    if (this.tokenBlacklist.size > 10000) {
      this.tokenBlacklist.clear();
    }
  }

  /**
   * Get token statistics
   * @returns {Object} - Token statistics
   */
  getStats() {
    return {
      blacklistedTokens: this.tokenBlacklist.size,
      activeRefreshTokens: this.refreshTokens.size,
      tokenExpiry: this.tokenExpiry,
      refreshTokenExpiry: this.refreshTokenExpiry
    };
  }

  /**
   * Validate token and return user data
   * @param {Object} req - Express request object
   * @param {Object} options - Verification options
   * @returns {Object|null} - User data or null
   */
  async validateRequest(req, options = {}) {
    const token = this.extractTokenFromRequest(req);
    if (!token) {
      return null;
    }

    return await this.verifyToken(token, options);
  }
}

// Create singleton instance
const tokenManager = new TokenManager();

// Export both the class and instance
export { TokenManager };
export default tokenManager;
