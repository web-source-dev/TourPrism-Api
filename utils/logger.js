const Logs = require('../models/Logs.js');

/**
 * Centralized logging system for Tourprism
 * Automatically handles user identification and creates user-friendly log messages
 */
class Logger {
  /**
   * Create a log entry with automatic user identification
   * @param {Object} options - Log options
   * @param {string} options.action - The action being performed
   * @param {Object} options.req - Express request object (for user identification)
   * @param {Object} options.res - Express response object (optional)
   * @param {Object} options.details - Additional details for the log
   * @param {string} options.message - Custom message (optional)
   * @param {string} options.ipAddress - IP address (optional, will use req.ip if not provided)
   * @param {string} options.userAgent - User agent (optional, will use req.get('user-agent') if not provided)
   */
  static async log(options) {
    try {
      const {
        action,
        req,
        res,
        details = {},
        message,
        ipAddress,
        userAgent
      } = options;

      if (!action) {
        console.error('Logger: Action is required');
        return;
      }

      // Extract user information from request
      const userInfo = this.extractUserInfo(req);
      
      // Prepare log data
      const logData = {
        action,
        userId: userInfo.userId,
        userEmail: userInfo.userEmail,
        userName: userInfo.userName,
        isCollaborator: userInfo.isCollaborator,
        collaboratorEmail: userInfo.collaboratorEmail,
        collaboratorRole: userInfo.collaboratorRole,
        details,
        ipAddress: ipAddress || req?.ip || 'unknown',
        userAgent: userAgent || req?.get('user-agent') || 'unknown',
        timestamp: new Date()
      };

      // Add custom message if provided
      if (message) {
        logData.userFriendlyMessage = message;
      }

      // Create the log entry
      await Logs.createLog(logData);
      
    } catch (error) {
      console.error('Logger: Error creating log entry:', error);
      // Don't throw error to prevent affecting main application flow
    }
  }

  /**
   * Extract user information from request object
   * @param {Object} req - Express request object
   * @returns {Object} User information
   */
  static extractUserInfo(req) {
    if (!req) {
      return {
        userId: null,
        userEmail: null,
        userName: null,
        isCollaborator: false,
        collaboratorEmail: null,
        collaboratorRole: null
      };
    }

    // Check if user is authenticated
    const userId = req.userId || null;
    const userEmail = req.userEmail || null;
    const userName = req.userName || null;
    
    // Check if this is a collaborator
    const isCollaborator = req.isCollaborator || false;
    const collaboratorEmail = req.collaboratorEmail || null;
    const collaboratorRole = req.collaboratorRole || null;

    return {
      userId,
      userEmail,
      userName,
      isCollaborator,
      collaboratorEmail,
      collaboratorRole
    };
  }

  /**
   * Log authentication events
   */
  static async logAuth(action, req, details = {}) {
    await this.log({
      action,
      req,
      details,
      message: this.generateAuthMessage(action, req, details)
    });
  }

  /**
   * Log CRUD operations
   */
  static async logCRUD(action, req, resourceType, resourceId, details = {}) {
    await this.log({
      action,
      req,
      details: {
        ...details,
        resourceType,
        resourceId
      },
      message: this.generateCRUDMessage(action, req, resourceType, details)
    });
  }

  /**
   * Log API requests
   */
  static async logAPIRequest(method, endpoint, req, res, details = {}) {
    const action = `api_${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    await this.log({
      action,
      req,
      res,
      details: {
        ...details,
        method,
        endpoint,
        statusCode: res?.statusCode
      },
      message: this.generateAPIMessage(method, endpoint, req, res)
    });
  }

  /**
   * Log system events
   */
  static async logSystem(action, details = {}) {
    await this.log({
      action,
      req: null,
      details,
      message: this.generateSystemMessage(action, details)
    });
  }

  /**
   * Generate authentication messages
   */
  static generateAuthMessage(action, req, details) {
    const userInfo = this.extractUserInfo(req);
    const actor = userInfo.userName || userInfo.userEmail || 'Unknown User';
    const actorType = userInfo.isCollaborator ? `Collaborator (${userInfo.collaboratorRole})` : 'User';

    switch (action) {
      case 'login':
        return `${actor} (${actorType}) logged into the system`;
      case 'logout':
        return `${actor} (${actorType}) logged out of the system`;
      case 'signup':
        return `${actor} (${actorType}) created a new account`;
      case 'password_reset':
        return `${actor} (${actorType}) requested a password reset`;
      case 'email_verified':
        return `${actor} (${actorType}) verified their email address`;
      default:
        return `${actor} (${actorType}) performed authentication action: ${action}`;
    }
  }

  /**
   * Generate CRUD operation messages
   */
  static generateCRUDMessage(action, req, resourceType, details) {
    const userInfo = this.extractUserInfo(req);
    const actor = userInfo.userName || userInfo.userEmail || 'Unknown User';
    const actorType = userInfo.isCollaborator ? `Collaborator (${userInfo.collaboratorRole})` : 'User';

    const resourceName = details.name || details.title || details.email || resourceType;
    
    switch (action) {
      case 'create':
        return `${actor} (${actorType}) created a new ${resourceType}: "${resourceName}"`;
      case 'update':
        return `${actor} (${actorType}) updated ${resourceType}: "${resourceName}"`;
      case 'delete':
        return `${actor} (${actorType}) deleted ${resourceType}: "${resourceName}"`;
      case 'view':
        return `${actor} (${actorType}) viewed ${resourceType}: "${resourceName}"`;
      case 'list':
        return `${actor} (${actorType}) viewed list of ${resourceType}s`;
      default:
        return `${actor} (${actorType}) performed ${action} on ${resourceType}: "${resourceName}"`;
    }
  }

  /**
   * Generate API request messages
   */
  static generateAPIMessage(method, endpoint, req, res) {
    const userInfo = this.extractUserInfo(req);
    const actor = userInfo.userName || userInfo.userEmail || 'Unknown User';
    const actorType = userInfo.isCollaborator ? `Collaborator (${userInfo.collaboratorRole})` : 'User';
    
    const status = res?.statusCode ? ` (Status: ${res.statusCode})` : '';
    return `${actor} (${actorType}) made a ${method.toUpperCase()} request to ${endpoint}${status}`;
  }

  /**
   * Generate system messages
   */
  static generateSystemMessage(action, details) {
    switch (action) {
      case 'system_startup':
        return 'System started successfully';
      case 'system_shutdown':
        return 'System shutdown initiated';
      case 'database_connected':
        return 'Database connection established';
      case 'email_sent':
        return `Email sent to ${details.recipientCount || 0} recipients`;
      case 'automated_process_completed':
        return `Automated process completed: ${details.processName || 'Unknown Process'}`;
      default:
        return `System performed action: ${action}`;
    }
  }
}

module.exports = Logger;
