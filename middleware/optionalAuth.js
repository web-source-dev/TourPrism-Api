import { optionalAuth as baseOptionalAuth } from './auth.js';

/**
 * Enhanced optional authentication middleware
 * This middleware adds user information to the request object
 * even if the user is not authenticated, allowing for logging
 */
export const optionalAuth = async (req, res, next) => {
  try {
    // Call the base optional auth middleware
    await baseOptionalAuth(req, res, () => {
      // Add additional user information for logging
      if (req.userId) {
        // User is authenticated
        req.isAuthenticated = true;
        
        // Add user email and name for logging if not already present
        if (!req.userEmail && req.user?.email) {
          req.userEmail = req.user.email;
        }
        
        if (!req.userName && req.user) {
          req.userName = req.user.firstName && req.user.lastName 
            ? `${req.user.firstName} ${req.user.lastName}`
            : req.user.firstName || req.user.email?.split('@')[0] || 'Unknown';
        }
      } else {
        // User is not authenticated
        req.isAuthenticated = false;
        req.userEmail = null;
        req.userName = null;
      }
      
      next();
    });
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    // Continue without authentication
    req.isAuthenticated = false;
    req.userEmail = null;
    req.userName = null;
    next();
  }
};

export default optionalAuth;
