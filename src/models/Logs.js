const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  userEmail: {
    type: String,
    required: false
  },
  userName: {
    type: String,
    required: false
  },
  action: {
    type: String,
    required: true,
  },
  userFriendlyMessage: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  },
  ipAddress: {
    type: String,
    required: false
  },
  userAgent: {
    type: String,
    required: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Create an index for faster queries on timestamp (descending for newest first)
LogSchema.index({ timestamp: -1 });
// Create an index for faster queries on userId
LogSchema.index({ userId: 1 });
// Create a compound index for filtering logs by action and timestamp
LogSchema.index({ action: 1, timestamp: -1 });

// Static method to add a log entry
LogSchema.statics.createLog = async function(logData) {
  try {
    // Generate user-friendly message if not provided
    if (!logData.userFriendlyMessage) {
      logData.userFriendlyMessage = this.generateUserFriendlyMessage(logData.action, logData);
    }
    
    return await this.create(logData);
  } catch (error) {
    console.error('Error creating log:', error);
    // Don't throw error to prevent affecting main application flow
  }
};

// Helper function to generate user-friendly messages
LogSchema.statics.generateUserFriendlyMessage = function(action, logData) {
  const { userName, userEmail, isCollaborator, collaboratorEmail, collaboratorRole, details = {} } = logData;
  
  // Determine who performed the action
  let actor = userName || userEmail || 'Unknown User';
  let actorType = 'User';
  
  if (isCollaborator && collaboratorEmail) {
    actor = collaboratorEmail;
    actorType = `Collaborator (${collaboratorRole || 'viewer'})`;
  }
  
  // Generate messages based on action type
  switch (action) {
    // Auth related
    case 'signup':
      return `${actor} (${actorType}) successfully created a new account`;
    case 'login':
      return `${actor} (${actorType}) logged into the system`;
    case 'logout':
      return `${actor} (${actorType}) logged out of the system`;
    case 'password_reset':
      return `${actor} (${actorType}) requested a password reset`;
    case 'email_verified':
      return `${actor} (${actorType}) verified their email address`;
    
    // Alert related
    case 'alert_created':
      return `${actor} (${actorType}) created a new alert: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'alert_updated':
      return `${actor} (${actorType}) updated the alert: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'alert_deleted':
      return `${actor} (${actorType}) deleted the alert: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'alert_followed':
      return `${actor} (${actorType}) started following the alert: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'alert_unfollowed':
      return `${actor} (${actorType}) stopped following the alert: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'alert_flagged':
      return `${actor} (${actorType}) flagged the alert: "${details.alertTitle || 'Untitled Alert'}" for action`;
    case 'alert_unflagged':
      return `${actor} (${actorType}) removed the flag from alert: "${details.alertTitle || 'Untitled Alert'}"`;
    
    // Action hub related
    case 'action_hub_created':
      return `${actor} (${actorType}) added alert "${details.alertTitle || 'Untitled Alert'}" to their Action Hub`;
    case 'action_hub_updated':
      return `${actor} (${actorType}) updated Action Hub item for alert: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'action_hub_status_changed':
      return `${actor} (${actorType}) changed the status of Action Hub item "${details.alertTitle || 'Untitled Alert'}" from ${details.previousStatus || 'unknown'} to ${details.newStatus || 'unknown'}`;
    case 'action_hub_note_added':
      return `${actor} (${actorType}) added a note to Action Hub item: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'action_hub_guest_added':
      return `${actor} (${actorType}) added ${details.guestCount || 0} guest(s) to Action Hub item: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'action_hub_notification_sent':
      return `${actor} (${actorType}) sent notifications to ${details.recipientCount || 0} ${details.recipientType || 'recipients'} for Action Hub item: "${details.alertTitle || 'Untitled Alert'}"`;
    
    // Subscriber related
    case 'subscriber_added':
      return `${actor} (${actorType}) subscribed to weekly forecasts for ${details.location || 'selected locations'}`;
    case 'subscriber_updated':
      return `${actor} (${actorType}) updated their subscription preferences`;
    case 'subscriber_deleted':
      return `${actor} (${actorType}) deleted their subscription`;
    case 'subscriber_unsubscribed':
      return `${actor} (${actorType}) unsubscribed from weekly forecasts`;
    
    // Admin actions
    case 'user_role_changed':
      return `${actor} (${actorType}) changed user role from ${details.previousRole || 'unknown'} to ${details.newRole || 'unknown'}`;
    case 'user_restricted':
      return `${actor} (${actorType}) restricted user access`;
    case 'user_deleted':
      return `${actor} (${actorType}) deleted a user account`;
    case 'bulk_alerts_uploaded':
      return `${actor} (${actorType}) uploaded ${details.alertCount || 0} alerts in bulk`;
    case 'admin_users_viewed':
      return `${actor} (${actorType}) viewed the users management page`;
    
    // Automated alert generation
    case 'automated_alert_generation_completed':
      return `System automatically generated ${details.alertCount || 0} new alerts for ${details.cities || 'multiple cities'}`;
    case 'manual_trigger_alert_generation':
      return `${actor} (${actorType}) manually triggered alert generation for ${details.city || 'all cities'}`;
    case 'bulk_approve_automated_alerts':
      return `${actor} (${actorType}) approved ${details.count || 0} automated alerts in bulk`;
    case 'bulk_reject_automated_alerts':
      return `${actor} (${actorType}) rejected ${details.count || 0} automated alerts in bulk`;
    case 'approve_automated_alert':
      return `${actor} (${actorType}) approved the automated alert: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'reject_automated_alert':
      return `${actor} (${actorType}) rejected the automated alert: "${details.alertTitle || 'Untitled Alert'}"`;
    
    // Collaborator related
    case 'collaborator_invited':
      return `${actor} (${actorType}) invited ${details.collaboratorEmail || 'a collaborator'} to join the team as ${details.collaboratorRole || 'viewer'}`;
    case 'collaborator_activated':
      return `${actor} (${actorType}) activated collaborator ${details.collaboratorEmail || 'account'}`;
    case 'collaborator_restricted':
      return `${actor} (${actorType}) restricted collaborator ${details.collaboratorEmail || 'account'}`;
    case 'collaborator_deleted':
      return `${actor} (${actorType}) removed collaborator ${details.collaboratorEmail || 'from the team'}`;
    
    // Email and system operations
    case 'email_sent':
      return `${actor} (${actorType}) sent an email notification to ${details.recipientCount || 0} recipient(s)`;
    case 'weekly_email_sent':
      return `System sent weekly forecast email to ${details.recipientCount || 0} subscribers`;
    case 'weekly_email_process_completed':
      return `System completed weekly email process for ${details.recipientCount || 0} subscribers`;
    case 'auto_update_process_completed':
      return `System completed auto-update process, checking ${details.alertCount || 0} alerts`;
    case 'alert_auto_update_created':
      return `System automatically created an update for alert: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'alert_auto_update_suppressed':
      return `${actor} (${actorType}) suppressed auto-updates for alert: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'alert_auto_update_enabled':
      return `${actor} (${actorType}) enabled auto-updates for alert: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'alert_archived':
      return `System archived expired alert: "${details.alertTitle || 'Untitled Alert'}"`;
    case 'alert_archiving_completed':
      return `System completed archiving process, archived ${details.archivedCount || 0} expired alerts`;
    
    // Other
    case 'profile_updated':
      return `${actor} (${actorType}) updated their profile information`;
    case 'summary_viewed':
      return `${actor} (${actorType}) viewed a summary report`;
    case 'summary_generated':
      return `${actor} (${actorType}) generated a new summary report`;
    case 'profile_viewed':
      return `${actor} (${actorType}) viewed their profile`;
    case 'notifications_viewed':
      return `${actor} (${actorType}) viewed their notifications`;
    
    // City search related
    case 'city_search_email_subscribed':
      return `${actor} (${actorType}) subscribed to notifications for city search: "${details.searchedCity || 'Unknown City'}"`;
    case 'city_search_email_unsubscribed':
      return `${actor} (${actorType}) unsubscribed from city search notifications`;
    
    default:
      return `${actor} (${actorType}) performed action: ${action}`;
  }
};

// Format a user's name and email for consistent log entries
LogSchema.statics.formatUser = function(user) {
  if (!user) return { userName: 'Anonymous', userEmail: null };
  
  const name = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}`
    : user.firstName || user.email?.split('@')[0] || 'Unknown';
  
  return {
    userName: name,
    userEmail: user.email || null,
    userId: user._id || null
  };
};

const Logs = mongoose.model('Logs', LogSchema);

module.exports = Logs;
