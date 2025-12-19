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
export const isAuthenticated = async (req, res, next) => {
  const decoded = await getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  req.userId = decoded.userId;
  req.user = decoded.userData;
  
  // Add collaborator info to request if present in token
  if (decoded.isCollaborator) {
    req.isCollaborator = true;
    req.collaboratorEmail = decoded.collaboratorEmail;
    req.collaboratorRole = decoded.collaboratorRole;
    req.collaborator = decoded.collaboratorData;
    req.userEmail = decoded.collaboratorEmail; // For actionLogs
  } else {
    req.isCollaborator = false;
    req.userEmail = decoded.email;
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
    req.user = decoded.userData;
    
    // Add collaborator info to request if present in token
    if (decoded.isCollaborator) {
      req.isCollaborator = true;
      req.collaboratorEmail = decoded.collaboratorEmail;
      req.collaboratorRole = decoded.collaboratorRole;
      req.collaborator = decoded.collaboratorData;
      req.userEmail = decoded.collaboratorEmail;
    } else {
      req.isCollaborator = false;
      req.userEmail = decoded.email;
    }
  }
  next();
}; 

/**
 * Authorize roles - checks if user has any of the specified roles (main or collaborator)
 * Usage: authorizeRoles(['admin', 'user', 'manager', 'viewer'])
 */
export const authorizeRoles = (allowedRoles = []) => {
  if (typeof allowedRoles === "string") {
    allowedRoles = [allowedRoles];
  }

  return async (req, res, next) => {
    const decoded = await getTokenData(req);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid or missing token" });
    }

    req.userId = decoded.userId;
    req.user = decoded.userData;

    let userRole;

    // Get the appropriate role (collaborator role or main role)
    if (decoded.isCollaborator) {
      req.isCollaborator = true;
      req.collaboratorEmail = decoded.collaboratorEmail;
      req.collaboratorRole = decoded.collaboratorRole;
      req.collaborator = decoded.collaboratorData;
      req.userEmail = decoded.collaboratorEmail;
      userRole = decoded.collaboratorRole;
    } else {
      req.isCollaborator = false;
      req.userRole = decoded.userData.role;
      req.userEmail = decoded.email;
      userRole = decoded.userData.role;
    }

    // Check if user role is in allowed roles
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        message: "Access denied. Insufficient privileges.",
        requiredRoles: allowedRoles,
        userRole: userRole
      });
    }

    next();
  };
};

/**
 * Check if user is a collaborator
 */
export const isCollaborator = async (req, res, next) => {
  const decoded = await getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  if (!decoded.isCollaborator) {
    return res.status(403).json({ message: "Access denied. This endpoint is for collaborators only." });
  }

  req.userId = decoded.userId;
  req.user = decoded.userData;
  req.isCollaborator = true;
  req.collaboratorEmail = decoded.collaboratorEmail;
  req.collaboratorRole = decoded.collaboratorRole;
  req.collaborator = decoded.collaboratorData;
  req.userEmail = decoded.collaboratorEmail;

  next();
};

/**
 * Check if user is a collaborator of a user account (parent role is 'user')
 */
export const isCollaboratorUser = async (req, res, next) => {
  const decoded = await getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  if (!decoded.isCollaborator) {
    return res.status(403).json({ message: "Access denied. This endpoint is for collaborators only." });
  }

  if (decoded.userData.role !== 'user') {
    return res.status(403).json({ message: "Access denied. This endpoint is for user account collaborators only." });
  }

  req.userId = decoded.userId;
  req.user = decoded.userData;
  req.isCollaborator = true;
  req.collaboratorEmail = decoded.collaboratorEmail;
  req.collaboratorRole = decoded.collaboratorRole;
  req.collaborator = decoded.collaboratorData;
  req.userEmail = decoded.collaboratorEmail;

  next();
};

/**
 * Check if user is a collaborator of an admin account (parent role is 'admin')
 */
export const isCollaboratorAdmin = async (req, res, next) => {
  const decoded = await getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  if (!decoded.isCollaborator) {
    return res.status(403).json({ message: "Access denied. This endpoint is for collaborators only." });
  }

  if (decoded.userData.role !== 'admin') {
    return res.status(403).json({ message: "Access denied. This endpoint is for admin account collaborators only." });
  }

  req.userId = decoded.userId;
  req.user = decoded.userData;
  req.isCollaborator = true;
  req.collaboratorEmail = decoded.collaboratorEmail;
  req.collaboratorRole = decoded.collaboratorRole;
  req.collaborator = decoded.collaboratorData;
  req.userEmail = decoded.collaboratorEmail;

  next();
};

/**
 * Check if user is a manager collaborator (manager role, can be from admin or user account)
 */
export const isCollaboratorManager = async (req, res, next) => {
    const decoded = await getTokenData(req);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid or missing token" });
    }

  if (!decoded.isCollaborator) {
    return res.status(403).json({ message: "Access denied. This endpoint is for collaborators only." });
  }

  if (decoded.collaboratorRole !== 'manager') {
    return res.status(403).json({ message: "Access denied. This endpoint requires manager collaborator role." });
  }

    req.userId = decoded.userId;
  req.user = decoded.userData;
  req.isCollaborator = true;
  req.collaboratorEmail = decoded.collaboratorEmail;
  req.collaboratorRole = decoded.collaboratorRole;
  req.collaborator = decoded.collaboratorData;
  req.userEmail = decoded.collaboratorEmail;

  next();
};

/**
 * Check if user is a viewer collaborator (viewer role, can be from admin or user account)
 */
export const isCollaboratorViewer = async (req, res, next) => {
  const decoded = await getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  if (!decoded.isCollaborator) {
    return res.status(403).json({ message: "Access denied. This endpoint is for collaborators only." });
  }

  if (decoded.collaboratorRole !== 'viewer') {
    return res.status(403).json({ message: "Access denied. This endpoint requires viewer collaborator role." });
  }

  req.userId = decoded.userId;
  req.user = decoded.userData;
      req.isCollaborator = true;
      req.collaboratorEmail = decoded.collaboratorEmail;
      req.collaboratorRole = decoded.collaboratorRole;
  req.collaborator = decoded.collaboratorData;
  req.userEmail = decoded.collaboratorEmail;

  next();
};

/**
 * Check if user is admin (main role only, not collaborators)
 */
export const isAdmin = async (req, res, next) => {
  const decoded = await getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  if (decoded.isCollaborator) {
    return res.status(403).json({ message: "Access denied. This endpoint is for admin main account holders only." });
  }

  if (decoded.userData.role !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admin privileges required." });
  }

  req.userId = decoded.userId;
  req.user = decoded.userData;
  req.isCollaborator = false;
    req.userRole = decoded.userData.role;
  req.userEmail = decoded.email;

  next();
};

/**
 * Check if user is regular user (main role only, not collaborators)
 */
export const isUser = async (req, res, next) => {
  const decoded = await getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  if (decoded.isCollaborator) {
    return res.status(403).json({ message: "Access denied. This endpoint is for main account holders only." });
  }

  if (decoded.userData.role !== 'user') {
    return res.status(403).json({ message: "Access denied. User account required." });
  }

  req.userId = decoded.userId;
  req.user = decoded.userData;
  req.isCollaborator = false;
  req.userRole = decoded.userData.role;
  req.userEmail = decoded.email;

  next();
};

/**
 * Check if user has premium subscription (main users or collaborators inherit from parent)
 */
export const isPremium = async (req, res, next) => {
  const decoded = await getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  req.userId = decoded.userId;
  req.user = decoded.userData;
  
  // Collaborators inherit premium status from parent account
  if (decoded.isCollaborator) {
    req.isCollaborator = true;
    req.collaboratorEmail = decoded.collaboratorEmail;
    req.collaboratorRole = decoded.collaboratorRole;
    req.collaborator = decoded.collaboratorData;
    req.userEmail = decoded.collaboratorEmail;
  } else {
    req.isCollaborator = false;
    req.userEmail = decoded.email;
  }

  // Check premium status (same for both main users and collaborators)
    if (!decoded.userData.isPremium) {
    return res.status(403).json({ message: "Access denied. This feature requires a premium subscription." });
  }

  next();
};

/**
 * Get role information - returns full role details
 * Attaches role info to req.roleInfo
 */
export const getRole = async (req, res, next) => {
  const decoded = await getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  req.userId = decoded.userId;
  req.user = decoded.userData;

  // Build comprehensive role information
  if (decoded.isCollaborator) {
    req.isCollaborator = true;
    req.collaboratorEmail = decoded.collaboratorEmail;
    req.collaboratorRole = decoded.collaboratorRole;
    req.collaborator = decoded.collaboratorData;
    req.userEmail = decoded.collaboratorEmail;

    req.roleInfo = {
      isCollaborator: true,
      loginType: 'collaborator',
      mainAccountRole: decoded.userData.role, // 'user' or 'admin'
      collaboratorRole: decoded.collaboratorRole, // 'viewer' or 'manager'
      effectiveRole: decoded.collaboratorRole, // The role used for authorization
      parentAccountId: decoded.userId,
      parentAccountEmail: decoded.userData.email,
      collaboratorEmail: decoded.collaboratorEmail,
    };
  } else {
    req.isCollaborator = false;
    req.userRole = decoded.userData.role;
    req.userEmail = decoded.email;

    req.roleInfo = {
      isCollaborator: false,
      loginType: 'main',
      mainAccountRole: decoded.userData.role, // 'user' or 'admin'
      effectiveRole: decoded.userData.role, // The role used for authorization
      accountId: decoded.userId,
      accountEmail: decoded.email,
    };
  }

  next();
};

/**
 * Middleware to handle token blacklisting (logout)
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
            userEmail: decoded.isCollaborator ? decoded.collaboratorEmail : decoded.email,
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
