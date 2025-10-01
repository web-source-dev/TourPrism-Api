import tokenManager from "../utils/tokenManager.js";
import Logger from "../utils/logger.js";

/**
 * Extract and verify JWT token using the global token manager
 */
const getTokenData = async (req) => {
  try {
    return await tokenManager.validateRequest(req, { verifyDatabase: true });
  } catch (error) {
    console.error('Token validation error:', error);
    return null;
  }
};

/**
 * Basic authentication - requires valid token verified against database
 */
export const authenticate = async (req, res, next) => {
  const decoded = await getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  req.userId = decoded.userId;
  req.user = decoded.userData; // Add fresh user data
  
  // Add collaborator info to request if present in token
  if (decoded.isCollaborator) {
    req.isCollaborator = true;
    req.collaboratorEmail = decoded.collaboratorEmail;
    req.collaboratorRole = decoded.collaboratorRole;
    req.collaborator = decoded.collaboratorData; // Add fresh collaborator data
    req.userEmail = decoded.collaboratorEmail;  // Add userEmail for actionLogs
  }
  
  next();
};

/**
 * Optional authentication - adds req.userId if token is valid and verified against database
 */
export const optionalAuth = async (req, res, next) => {
  const decoded = await getTokenData(req);
  if (decoded) {
    req.userId = decoded.userId;
    req.user = decoded.userData; // Add fresh user data
    
    // Add collaborator info to request if present in token
    if (decoded.isCollaborator) {
      req.isCollaborator = true;
      req.collaboratorEmail = decoded.collaboratorEmail;
      req.collaboratorRole = decoded.collaboratorRole;
      req.collaborator = decoded.collaboratorData; // Add fresh collaborator data
    }
  }
  next();
}; 

/**
 * Middleware to restrict access based on user role
 * Usage: authenticateRole(['admin', 'editor']) or authenticateRole('superadmin')
 */
export const authenticateRole = (requiredRoles = []) => {
  if (typeof requiredRoles === "string") {
    requiredRoles = [requiredRoles];
  }

  return async (req, res, next) => {
    const decoded = await getTokenData(req);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid or missing token" });
    }

    req.userId = decoded.userId;
    req.user = decoded.userData; // Add fresh user data

    // Handle collaborator authentication
    if (decoded.isCollaborator) {
      req.isCollaborator = true;
      req.collaboratorEmail = decoded.collaboratorEmail;
      req.collaboratorRole = decoded.collaboratorRole;
      req.collaborator = decoded.collaboratorData; // Add fresh collaborator data
      
      // Check if collaborator role is in required roles
      if (!requiredRoles.includes(decoded.collaboratorRole)) {
        return res.status(403).json({ message: "Access denied. Insufficient collaborator privileges." });
      }
      
      return next();
    }

    // Regular user authentication - user already verified in getTokenData
    req.userRole = decoded.userData.role;

    if (!requiredRoles.includes(decoded.userData.role)) {
      return res.status(403).json({ message: "Access denied. Insufficient privileges." });
    }

    next();
  };
};

/**
 * Middleware to restrict access for users OR collaborators by role
 * e.g., `authenticateCollaboratorOrRole(['manager', 'superadmin'])`
 */
export const authenticateCollaboratorOrRole = (requiredRoles = []) => {
  if (typeof requiredRoles === "string") {
    requiredRoles = [requiredRoles];
  }

  return async (req, res, next) => {
    const decoded = await getTokenData(req);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid or missing token" });
    }

    req.userId = decoded.userId;
    req.user = decoded.userData; // Add fresh user data
    
    // Handle collaborator token
    if (decoded.isCollaborator) {
      req.isCollaborator = true;
      req.collaboratorEmail = decoded.collaboratorEmail;
      req.collaboratorRole = decoded.collaboratorRole;
      req.collaborator = decoded.collaboratorData; // Add fresh collaborator data
      
      // Check if collaborator role is in required roles
      if (requiredRoles.includes(decoded.collaboratorRole)) {
        return next();
      }
      
      return res.status(403).json({ message: "Access denied. Insufficient collaborator privileges." });
    }

    // Regular user token - user already verified in getTokenData
    req.userRole = decoded.userData.role;

    // Check user role
    if (requiredRoles.includes(decoded.userData.role)) {
      return next();
    }

    return res.status(403).json({ message: "Access denied. Insufficient privileges." });
  };
};

/**
 * Middleware to check if user has an active subscription
 * Usage: authenticateSubscription
 */
export const authenticateSubscription = async (req, res, next) => {
  const decoded = await getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  req.userId = decoded.userId;
  req.user = decoded.userData; // Add fresh user data
  
  // Collaborators inherit subscription status from the main account
  if (decoded.isCollaborator) {
    req.isCollaborator = true;
    req.collaboratorEmail = decoded.collaboratorEmail;
    req.collaboratorRole = decoded.collaboratorRole;
    req.collaborator = decoded.collaboratorData; // Add fresh collaborator data
    
    // Parent user already verified in getTokenData
    if (!decoded.userData.isPremium) {
      return res.status(403).json({ message: "Access denied. This feature requires an active subscription." });
    }
    
    return next();
  }

  // Regular user subscription check - user already verified in getTokenData
  if (!decoded.userData.isPremium) {
    return res.status(403).json({ message: "Access denied. This feature requires an active subscription." });
  }

  next();
};

/**
 * Middleware to handle token refresh
 * Usage: refreshToken
 */
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    const newTokens = await tokenManager.refreshAccessToken(refreshToken);
    
    if (!newTokens) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    req.newTokens = newTokens;
    next();
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ message: "Server error during token refresh" });
  }
};

/**
 * Middleware to handle token blacklisting (logout)
 * Usage: logout
 */
export const logout = async (req, res, next) => {
  try {
    const token = tokenManager.extractTokenFromRequest(req);
    const decoded = await getTokenData(req);
    
    if (token) {
      // Blacklist the current token
      tokenManager.blacklistToken(token, decoded?.tokenId);
      
      // Log logout action
      if (decoded) {
        try {
          await Logger.log(req, 'user_logout', {
            userId: decoded.userId,
            userEmail: decoded.email,
            isCollaborator: decoded.isCollaborator
          });
        } catch (logError) {
          console.error('Error logging logout:', logError);
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: "Server error during logout" });
  }
};

/**
 * Middleware to validate token without database verification (for performance)
 * Usage: validateTokenOnly
 */
export const validateTokenOnly = async (req, res, next) => {
  try {
    const decoded = await tokenManager.validateRequest(req, { verifyDatabase: false });
    
    if (!decoded) {
      return res.status(401).json({ message: "Invalid or missing token" });
    }

    req.userId = decoded.userId;
    req.user = decoded.userData;
    
    if (decoded.isCollaborator) {
      req.isCollaborator = true;
      req.collaboratorEmail = decoded.collaboratorEmail;
      req.collaboratorRole = decoded.collaboratorRole;
      req.collaborator = decoded.collaboratorData;
    }
    
    next();
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ message: "Invalid token" });
  }
};
