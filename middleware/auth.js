import jwt from "jsonwebtoken";
import User from "../models/User.js";

import dotenv from "dotenv";
dotenv.config();

/**
 * Extract and verify JWT token against database
 */
const getTokenData = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.split(" ")[1];
  if (!token) return null;

  try {
    // First verify the token signature
    console.log('JWT_SECRET at middleware verification time:', process.env.JWT_SECRET ? 'exists' : 'undefined');
    console.log('JWT_SECRET length at middleware:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 'undefined');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Then verify the user exists in database and is active
    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log('Token user not found in database:', decoded.userId);
      return null;
    }

    // Check if user is active and not restricted/deleted
    if (user.status !== 'active') {
      console.log('User account is not active:', user.status);
      return null;
    }

    // For collaborators, verify the collaborator still exists and is active
    if (decoded.isCollaborator) {
      const collaborator = user.collaborators.find(c => c.email === decoded.collaboratorEmail);
      if (!collaborator || collaborator.status !== 'active') {
        console.log('Collaborator not found or not active:', decoded.collaboratorEmail);
        return null;
      }
      
      // Add fresh collaborator data to the decoded token
      decoded.collaboratorData = collaborator;
    }

    // Add fresh user data to the decoded token
    decoded.userData = user;
    
    return decoded;
  } catch (err) {
    console.log('Token verification failed:', err.message);
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
