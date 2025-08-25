import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * Extract and verify JWT token
 */
const getTokenData = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.split(" ")[1];
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

/**
 * Basic authentication - requires valid token
 */
export const authenticate = async (req, res, next) => {
  const decoded = getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  req.userId = decoded.userId;
  
  // Add collaborator info to request if present in token
  if (decoded.isCollaborator) {
    req.isCollaborator = true;
    req.collaboratorEmail = decoded.collaboratorEmail;
    req.collaboratorRole = decoded.collaboratorRole;
    req.userEmail = decoded.collaboratorEmail;  // Add userEmail for actionLogs
  }
  
  next();
};

/**
 * Optional authentication - adds req.userId if token is valid
 */
export const optionalAuth = async (req, res, next) => {
  const decoded = getTokenData(req);
  if (decoded) {
    req.userId = decoded.userId;
    
    // Add collaborator info to request if present in token
    if (decoded.isCollaborator) {
      req.isCollaborator = true;
      req.collaboratorEmail = decoded.collaboratorEmail;
      req.collaboratorRole = decoded.collaboratorRole;
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
    const decoded = getTokenData(req);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid or missing token" });
    }

    req.userId = decoded.userId;

    // Handle collaborator authentication
    if (decoded.isCollaborator) {
      req.isCollaborator = true;
      req.collaboratorEmail = decoded.collaboratorEmail;
      req.collaboratorRole = decoded.collaboratorRole;
      
      // Check if collaborator role is in required roles
      if (!requiredRoles.includes(decoded.collaboratorRole)) {
        return res.status(403).json({ message: "Access denied. Insufficient collaborator privileges." });
      }
      
      return next();
    }

    // Regular user authentication
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    req.userRole = user.role;

    if (!requiredRoles.includes(user.role)) {
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
    const decoded = getTokenData(req);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid or missing token" });
    }

    req.userId = decoded.userId;
    
    // Handle collaborator token
    if (decoded.isCollaborator) {
      req.isCollaborator = true;
      req.collaboratorEmail = decoded.collaboratorEmail;
      req.collaboratorRole = decoded.collaboratorRole;
      
      // Check if collaborator role is in required roles
      if (requiredRoles.includes(decoded.collaboratorRole)) {
        return next();
      }
      
      return res.status(403).json({ message: "Access denied. Insufficient collaborator privileges." });
    }

    // Regular user token
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    req.userRole = user.role;

    // Check user role
    if (requiredRoles.includes(user.role)) {
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
  const decoded = getTokenData(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid or missing token" });
  }

  req.userId = decoded.userId;
  
  // Collaborators inherit subscription status from the main account
  if (decoded.isCollaborator) {
    req.isCollaborator = true;
    req.collaboratorEmail = decoded.collaboratorEmail;
    req.collaboratorRole = decoded.collaboratorRole;
    
    // Find the parent user to check subscription status
    const parentUser = await User.findById(req.userId);
    if (!parentUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (!parentUser.isPremium) {
      return res.status(403).json({ message: "Access denied. This feature requires an active subscription." });
    }
    
    return next();
  }

  // Regular user subscription check
  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (!user.isPremium) {
    return res.status(403).json({ message: "Access denied. This feature requires an active subscription." });
  }

  next();
};
