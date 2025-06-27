import mongoose from 'mongoose';

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
    enum: [
      // Auth related
      'signup', 'login', 'logout', 'password_reset', 'email_verified',
      // Alert related
      'alert_created', 'alert_updated', 'alert_deleted', 'alert_followed', 'alert_unfollowed',
      'alert_liked', 'alert_shared', 'alert_flagged', 'alert_unflagged',
      // Action hub related
      'action_hub_created', 'action_hub_updated', 'action_hub_status_changed',
      'action_hub_note_added', 'action_hub_guest_added', 'action_hub_notification_sent',
      // Subscriber related
      'subscriber_added', 'subscriber_updated', 'subscriber_deleted', 'subscriber_preferences_changed', 'subscriber_unsubscribed',
      // Admin actions
      'user_role_changed', 'user_restricted', 'user_deleted', 'bulk_alerts_uploaded', 'admin_users_viewed',
      // Collaborator related
      'collaborator_invited', 'collaborator_activated', 'collaborator_restricted', 'collaborator_deleted',
      // Other
      'profile_updated', 'summary_viewed', 'summary_generated'
    ]
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
    return await this.create(logData);
  } catch (error) {
    console.error('Error creating log:', error);
    // Don't throw error to prevent affecting main application flow
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

export default Logs;
