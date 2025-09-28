import ActionHub from '../models/ActionHub.js';
import Alert from '../models/Alert.js';
import User from '../models/User.js';
import NotificationSys from '../models/NotificationSys.js';
import Logger from '../utils/logger.js';
import sendAlertNotificationToGuest from '../utils/emailTemplates/alertNotification-guests.js';
import sendAlertNotificationToTeam from '../utils/emailTemplates/alertNotification-team.js';
/**
 * Helper function to check and update alert status based on age
 * Automatically moves alerts from 'new' to 'in_progress' if they are older than 24 hours
 */
const checkAndUpdateAlertStatus = async (actionHubItem, userId) => {
  if (!actionHubItem) return actionHubItem;
  
  // Only process items with 'new' status
  if (actionHubItem.status === 'new') {
    const now = new Date();
    const createdAt = new Date(actionHubItem.createdAt);
    const ageInHours = (now - createdAt) / (1000 * 60 * 60);
    
    // If the alert is older than 24 hours, update status to 'in_progress'
    if (ageInHours >= 24) {
      actionHubItem.status = 'in_progress';
      
      // Add a log entry for the automatic status change
      actionHubItem.actionLogs.push({
        user: userId, // System user or the current user
        actionType: 'edit',
        actionDetails: 'Automatically moved to in progress after 24 hours'
      });
      
      await actionHubItem.save();
    }
  }
  
  return actionHubItem;
};

/**
 * Get all alerts in the Action Hub for the current user
 */
export const getActionHubAlerts = async (req, res) => {
  try {
    const userId = req.userId;
    
    // Find alerts in ActionHub that belong to the current user
    const actionHubItems = await ActionHub.find({
      userId: userId // Use userId instead of followaction
    })
    .populate({
      path: 'alert',
      populate: {
        path: 'userId',
        select: 'name email'
      }
    })
    .sort({ updatedAt: -1 });

    
    // Check and update status of 'new' alerts older than 24 hours
    const updatePromises = actionHubItems.map(item => checkAndUpdateAlertStatus(item, userId));
    await Promise.all(updatePromises);
    
    // Format the data for frontend consumption
    const formattedItems = actionHubItems.map(item => {
      // Handle case where alert might be null
      if (!item.alert) {
        console.error('Null alert found in ActionHub item:', item._id);
        return null;
      }
      
      const alertData = item.alert.toObject();
      
      return {
        ...alertData,
        _id: alertData._id,
        actionHubId: item._id,
        status: item.status,
        isFollowing: item.isFollowing, // Use isFollowing instead of checking array
        isFlagged: item.flagged, // Use boolean flag
        flagCount: item.flagged ? 1 : 0, // Individual user's flag status
        numberOfFollows: alertData.numberOfFollows || 0, // Get the total from the alert
        actionLogs: item.actionLogs,
        actionHubCreatedAt: item.createdAt, // Add ActionHub creation date
        actionHubUpdatedAt: item.updatedAt // Add ActionHub update date
      };
    }).filter(item => item !== null); // Filter out any null items

    // Log the action
    await Logger.logCRUD('list', req, 'Action Hub alerts', null, {
      alertCount: formattedItems.length
    });

    return res.status(200).json(formattedItems);
  } catch (error) {
    console.error('Error fetching Action Hub alerts:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get a specific Action Hub alert by ID
 */
export const getActionHubAlertById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Check if this is an alert ID or an action hub ID
    let actionHubItem;
    
    // First try to find by actionHubId
    actionHubItem = await ActionHub.findById(id)
      .populate({
        path: 'alert',
        populate: {
          path: 'userId',
          select: 'name email'
        }
      });
    
    // If not found, try to find by alertId or alert field for the current user
    if (!actionHubItem) {
      actionHubItem = await ActionHub.findOne({ 
        $or: [{ alert: id }, { alertId: id }],
        userId: userId // Ensure the action hub item belongs to the current user
      })
        .populate({
          path: 'alert',
          populate: {
            path: 'userId',
            select: 'name email'
          }
        });
    } else {
      // If found by ID, verify this belongs to the current user
      if (actionHubItem.userId.toString() !== userId.toString()) {
        // Check if user is admin/manager, they can view all action hub items
        const user = await User.findById(userId);
        if (!user || !['admin', 'manager'].includes(user.role)) {
          return res.status(403).json({ message: 'You do not have access to this Action Hub item' });
        }
      }
    }

    if (!actionHubItem) {
      // If still not found, check if an alert with this ID exists,
      // and if the user has not yet created an action hub for it
      const alert = await Alert.findById(id);
      if (alert) {
        return res.status(404).json({ 
          message: 'Action Hub item not found for this alert, follow the alert first',
          alertExists: true,
          alertId: alert._id
        });
      }
      return res.status(404).json({ message: 'Action Hub item not found' });
    }
    
    // Check and update status of the alert if it's 'new' and older than 24 hours
    actionHubItem = await checkAndUpdateAlertStatus(actionHubItem, userId);

    // Get the user's collaborators if they exist
    const user = await User.findById(userId).select('collaborators');
    const collaborators = user?.collaborators || [];

    // Format response with both following and flagging status
    const alertData = actionHubItem.alert.toObject();
    const response = {
      ...alertData,
      _id: alertData._id,
      actionHubId: actionHubItem._id,
      status: actionHubItem.status,
      isFollowing: actionHubItem.isFollowing || false,
      isFlagged: actionHubItem.flagged || false,
      flagCount: actionHubItem.flagged ? 1 : 0,
      numberOfFollows: alertData.numberOfFollows || 0,
      actionLogs: actionHubItem.actionLogs,
      currentActiveTab: actionHubItem.currentActiveTab,
      guests: actionHubItem.guests,
      notes: actionHubItem.notes,
      actionHubCreatedAt: actionHubItem.createdAt, // Add ActionHub creation date
      actionHubUpdatedAt: actionHubItem.updatedAt, // Add ActionHub update date
      // Include the user's collaborators as team members
      teamMembers: collaborators.map(collab => ({
        id: collab._id,
        name: collab.name || collab.email,
        email: collab.email,
        role: collab.role,
        status: collab.status
      }))
    };

    // Log the action
    await Logger.logCRUD('view', req, 'Action Hub alert', actionHubItem._id, {
      alertTitle: alertData.title
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching Action Hub alert:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Flag an alert and add it to the Action Hub
 */
export const flagAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.userId;
    const userEmail = req.userEmail; // May exist if this is a collaborator

    // Find the alert
    const alert = await Alert.findById(alertId);
    
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    // Check if user already has an action hub item for this alert
    let actionHubItem = await ActionHub.findOne({ 
      userId: userId,
      $or: [{ alert: alertId }, { alertId: alertId }]
    });
    
    let flaggedAction;
    
    if (!actionHubItem) {
      // Create new action hub entry for this user and alert
      actionHubItem = new ActionHub({
        userId: userId,
        alert: alertId,
        alertId: alertId, // Set both alert and alertId to the same value
        flagged: true,
        isFollowing: false, // Not following yet, just flagging
        actionLogs: [{
          user: userId,
          userEmail: userEmail, // Include user email for collaborator identification
          actionType: 'flag',
          actionDetails: 'Added alert to Action Hub'
        }]
      });
      
      await actionHubItem.save();
      
      // Set action for log
      flaggedAction = 'flag_added';
    } else {
      // Toggle flagged state
      actionHubItem.flagged = !actionHubItem.flagged;
      
      // Set action for log
      flaggedAction = actionHubItem.flagged ? 'flag_added' : 'flag_removed';
      
      // Add log entry
      actionHubItem.actionLogs.push({
        user: userId,
        userEmail: userEmail, // Include user email for collaborator identification
        actionType: 'flag',
        actionDetails: actionHubItem.flagged ? 'Flagged alert' : 'Unflagged alert'
      });
      
      await actionHubItem.save();
    }

    // Update the global flag count in the alert model
    // Count total number of users who have flagged this alert
    const flaggedCount = await ActionHub.countDocuments({
      $or: [{ alert: alertId }, { alertId: alertId }],
      flagged: true
    });
    
    // Update the alert's flaggedBy array
    await Alert.findByIdAndUpdate(alertId, {
      $set: { flaggedBy: await ActionHub.distinct('userId', { 
        $or: [{ alert: alertId }, { alertId: alertId }], 
        flagged: true 
      })}
    });
    
    // Log the flag action
    await Logger.logCRUD(flaggedAction === 'flag_added' ? 'create' : 'update', req, 'Action Hub flag', actionHubItem._id, {
      alertId: alertId,
      alertTitle: alert.title,
      action: flaggedAction
    });

    return res.status(200).json({ 
      isFlagged: actionHubItem.flagged,
      flagCount: flaggedCount
    });
  } catch (error) {
    console.error('Error flagging alert:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Follow/unfollow an alert and update the Action Hub
 */
export const followAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.userId;
    const userEmail = req.userEmail; // May exist if this is a collaborator

    // Find the alert
    const alert = await Alert.findById(alertId);
    
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    // Check if user already has an ActionHub item for this alert
    let actionHubItem = await ActionHub.findOne({ 
      userId: userId,
      $or: [{ alert: alertId }, { alertId: alertId }]
    });
    
    let wasFollowing = false;
    let isFollowing = true; // Default value when creating a new entry
    let followAction;
    
    if (!actionHubItem) {
      // Create new action hub entry for this user
      actionHubItem = new ActionHub({
        userId: userId,
        alert: alertId,
        alertId: alertId,
        isFollowing: true,
        flagged: false, // Not flagged by default
        actionLogs: [{
          user: userId,
          userEmail: userEmail,
          actionType: 'follow',
          actionDetails: 'Started following alert'
        }]
      });
      
      await actionHubItem.save();
      followAction = 'follow_started';
    } else {
      // Toggle following state
      wasFollowing = actionHubItem.isFollowing;
      isFollowing = !wasFollowing;
      
      if (isFollowing) {
        // User is following the alert again
        actionHubItem.isFollowing = true;
        actionHubItem.actionLogs.push({
          user: userId,
          userEmail: userEmail,
          actionType: 'follow',
          actionDetails: 'Started following alert'
        });
        
        await actionHubItem.save();
        followAction = 'follow_started';
      } else {
        // User is unfollowing the alert
        if (actionHubItem.flagged) {
          // If the alert is flagged, keep the ActionHub item but update isFollowing
          actionHubItem.isFollowing = false;
          actionHubItem.actionLogs.push({
            user: userId,
            userEmail: userEmail,
            actionType: 'follow',
            actionDetails: 'Stopped following alert'
          });
          
          await actionHubItem.save();
          followAction = 'follow_stopped';
        } else {
          // If the alert is not flagged, remove the ActionHub item completely
          await ActionHub.deleteOne({ 
            userId: userId,
            $or: [{ alert: alertId }, { alertId: alertId }]
          });
          followAction = 'follow_stopped';
        }
      }
    }

    // Count the total number of users following this alert
    const followingCount = await ActionHub.countDocuments({
      $or: [{ alert: alertId }, { alertId: alertId }],
      isFollowing: true
    });
    
    // Update the alert's followedBy array and numberOfFollows
    await Alert.findByIdAndUpdate(alertId, {
      followedBy: await ActionHub.distinct('userId', { 
        $or: [{ alert: alertId }, { alertId: alertId }], 
        isFollowing: true 
      }),
      numberOfFollows: followingCount
    });

    // Update the user's followedAlerts array
    const user = await User.findById(userId);
    if (user) {
      if (!user.followedAlerts) {
        user.followedAlerts = [];
      }
      
      if (isFollowing && !user.followedAlerts.includes(alertId)) {
        user.followedAlerts.push(alertId);
      } else if (!isFollowing) {
        user.followedAlerts = user.followedAlerts.filter(id => id.toString() !== alertId.toString());
      }
      
      await user.save();
      
      // Log the follow/unfollow action
      await Logger.logCRUD(isFollowing ? 'create' : 'delete', req, 'Action Hub follow', actionHubItem?._id, {
        alertId: alertId,
        alertTitle: alert.title,
        action: followAction,
        followCount: followingCount
      });
    }

    return res.status(200).json({ 
      following: isFollowing,
      numberOfFollows: followingCount
    });
  } catch (error) {
    console.error('Error following alert:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update the status of an Action Hub item
 */
export const markActionHubItemStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.userId;
    const userEmail = req.userEmail; // May exist if this is a collaborator

    if (!['new', 'in_progress', 'handled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const actionHubItem = await ActionHub.findById(id);
    
    if (!actionHubItem) {
      return res.status(404).json({ message: 'Action Hub item not found' });
    }
    
    // Ensure the user owns this ActionHub item, or has admin/manager permissions
    if (actionHubItem.userId.toString() !== userId.toString()) {
      // Check if user is admin/manager
      const user = await User.findById(userId);
      if (!user || !['admin', 'manager'].includes(user.role)) {
        return res.status(403).json({ message: 'You do not have permission to update this Action Hub item' });
      }
    }
    
    const previousStatus = actionHubItem.status; // Store previous status for logging
    
    // Update status
    actionHubItem.status = status;
    
    // If status is 'handled', update handledBy and handledAt
    if (status === 'handled') {
      actionHubItem.handledBy = userId;
      actionHubItem.handledAt = new Date();
    }
    
    // Add log entry
    let actionDetails = '';
    switch(status) {
      case 'new':
        actionDetails = 'Marked alert as new';
        break;
      case 'in_progress':
        actionDetails = 'Marked alert as in progress';
        break;
      case 'handled':
        actionDetails = 'Marked alert as handled';
        break;
    }
    
    actionHubItem.actionLogs.push({
      user: userId,
      userEmail: userEmail, // Include user email for collaborator identification
      actionType: status === 'handled' ? 'mark_handled' : 'edit',
      actionDetails: actionDetails
    });
    
    await actionHubItem.save();
    
    // Populate alert info for logging
    await actionHubItem.populate('alert');
    
    // Log the status change
    await Logger.logCRUD('update', req, 'Action Hub status', actionHubItem._id, {
      alertId: actionHubItem.alert?._id,
      alertTitle: actionHubItem.alert?.title || 'Unknown Alert',
      previousStatus: previousStatus,
      newStatus: status
    });

    return res.status(200).json({ 
      message: `Action Hub item marked as ${status} successfully`,
      status: status 
    });
  } catch (error) {
    console.error('Error updating Action Hub item status:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Set the current active tab
 */
export const setActiveTab = async (req, res) => {
  try {
    const { id } = req.params;
    const { tab } = req.body;
    const userId = req.userId;
    const userEmail = req.userEmail; // May exist if this is a collaborator

    if (!['notify_guests', 'add_notes'].includes(tab)) {
      return res.status(400).json({ message: 'Invalid tab name' });
    }

    const actionHubItem = await ActionHub.findById(id);
    
    if (!actionHubItem) {
      return res.status(404).json({ message: 'Action Hub item not found' });
    }

    // Update active tab
    actionHubItem.currentActiveTab = tab;
    
    await actionHubItem.save();

    // Log the action
    await Logger.logCRUD('update', req, 'Action Hub tab', actionHubItem._id, {
      tab: tab
    });

    return res.status(200).json({ 
      message: 'Active tab updated successfully',
      currentActiveTab: tab 
    });
  } catch (error) {
    console.error('Error setting active tab:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Add a note to an Action Hub item
 */
export const addNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.userId;
    const userEmail = req.userEmail; // May exist if this is a collaborator

    if (!content || content.trim() === '') {
      return res.status(400).json({ message: 'Note content is required' });
    }

    const actionHubItem = await ActionHub.findById(id);
    
    if (!actionHubItem) {
      return res.status(404).json({ message: 'Action Hub item not found' });
    }

    // Add note
    const newNote = {
      content,
      createdBy: userId,
      createdAt: new Date()
    };
    
    actionHubItem.notes.push(newNote);
    
    // Add log entry
    actionHubItem.actionLogs.push({
      user: userId,
      userEmail: userEmail, // Include user email for collaborator identification
      actionType: 'note_added',
      actionDetails: 'Added a new note'
    });
    
    await actionHubItem.save();

    // Log the action
    await Logger.logCRUD('create', req, 'Action Hub note', actionHubItem._id, {
      noteLength: content.length
    });

    return res.status(201).json({ 
      message: 'Note added successfully',
      note: newNote
    });
  } catch (error) {
    console.error('Error adding note:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Add guests for notification
 */
export const addGuests = async (req, res) => {
  try {
    const { id } = req.params;
    const { guests } = req.body;
    const userId = req.userId;
    const userEmail = req.userEmail; // May exist if this is a collaborator

    if (!guests || !Array.isArray(guests) || guests.length === 0) {
      return res.status(400).json({ message: 'Guest list is required' });
    }

    const actionHubItem = await ActionHub.findById(id);
    
    if (!actionHubItem) {
      return res.status(404).json({ message: 'Action Hub item not found' });
    }

    // Validate guest data
    const validGuests = guests.filter(guest => guest.email && typeof guest.email === 'string');
    
    if (validGuests.length === 0) {
      return res.status(400).json({ message: 'No valid guests provided' });
    }

    // Add guests
    actionHubItem.guests.push(...validGuests);
    
    // Add log entry
    actionHubItem.actionLogs.push({
      user: userId,
      userEmail: userEmail, // Include user email for collaborator identification
      actionType: 'notify_guests',
      actionDetails: `Added ${validGuests.length} guests for notification`
    });
    
    await actionHubItem.save();

    // Log the action
    await Logger.logCRUD('create', req, 'Action Hub guests', actionHubItem._id, {
      guestCount: validGuests.length
    });

    return res.status(201).json({ 
      message: 'Guests added successfully',
      guests: validGuests
    });
  } catch (error) {
    console.error('Error adding guests:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Send notifications to guests
 */
export const notifyGuests = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, guestIds } = req.body;
    const userId = req.userId;
    const userEmail = req.userEmail; // May exist if this is a collaborator

    if (!message || message.trim() === '') {
      return res.status(400).json({ message: 'Notification message is required' });
    }

    const actionHubItem = await ActionHub.findById(id);
    
    if (!actionHubItem) {
      return res.status(404).json({ message: 'Action Hub item not found' });
    }

    // Populate the alert data to get the title and details
    await actionHubItem.populate('alert');
    const alertTitle = actionHubItem.alert.title || 'Alert Notification';
    
    // Get the full alert object to pass to the email service
    const alertData = actionHubItem.alert.toObject();
    
    // Add action hub specific data like status to the alert data
    alertData.status = actionHubItem.status || 'new';

    // Get guests to notify
    let guestsToNotify = [];
    
    if (guestIds && Array.isArray(guestIds) && guestIds.length > 0) {
      // Notify only selected guests
      guestsToNotify = actionHubItem.guests.filter(guest => 
        guestIds.includes(guest._id.toString())
      );
    } else {
      // Notify all guests that haven't been notified yet
      guestsToNotify = actionHubItem.guests.filter(guest => !guest.notificationSent);
    }
    
    if (guestsToNotify.length === 0) {
      return res.status(400).json({ message: 'No guests to notify' });
    }

    // Mark guests as notified and send emails
    const now = new Date();
    const emailSendResults = [];
    
    const updatePromises = guestsToNotify.map(async (guest) => {
      // Send email to each guest with full alert data
      const emailResult = await sendAlertNotificationToGuest(
        guest.email,
        guest.name,
        alertTitle,
        message,
        alertData // Pass the complete alert object instead of just the description
      );
      
      emailSendResults.push({
        email: guest.email,
        success: emailResult
      });
      
      // Find the guest in the actionHubItem and update
      const guestIndex = actionHubItem.guests.findIndex(g => 
        g._id.toString() === guest._id.toString()
      );
      
      if (guestIndex !== -1) {
        actionHubItem.guests[guestIndex].notificationSent = true;
        actionHubItem.guests[guestIndex].sentTimestamp = now;
      }
    });
    
    await Promise.all(updatePromises);
    await actionHubItem.save();
    
    // Add log entry
    actionHubItem.actionLogs.push({
      user: userId,
      userEmail: userEmail,
      actionType: 'notify_guests',
      actionDetails: `Sent notifications to ${guestsToNotify.length} guests`
    });
    
    await actionHubItem.save();

    // Log the action
    await Logger.logCRUD('create', req, 'Action Hub guest notifications', actionHubItem._id, {
      recipientCount: guestsToNotify.length,
      alertTitle: alertTitle
    });

    return res.status(200).json({ 
      message: 'Notifications sent successfully',
      notifiedGuests: guestsToNotify.length,
      emailResults: emailSendResults
    });
  } catch (error) {
    console.error('Error notifying guests:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get action logs for an Action Hub item
 */
export const getActionLogs = async (req, res) => {
  try {
    const { id } = req.params;

    const actionHubItem = await ActionHub.findById(id)
      .populate({
        path: 'actionLogs.user',
        select: 'email firstName lastName role collaborators'
      });
    
    if (!actionHubItem) {
      return res.status(404).json({ message: 'Action Hub item not found' });
    }

    // Process logs to include proper user display names
    const processedLogs = actionHubItem.actionLogs.map(log => {
      const logObj = log.toObject();
      
      // Add display name field based on available user data
      if (logObj.user) {
        // Check if the user has a first name or last name
        if (logObj.user.firstName || logObj.user.lastName) {
          logObj.displayName = [logObj.user.firstName, logObj.user.lastName].filter(Boolean).join(' ');
        } else {
          // Fall back to email if no name available
          logObj.displayName = logObj.user.email;
        }
        
        // Check if this is a collaborator action (using userEmail field)
        if (logObj.userEmail && logObj.user.collaborators) {
          const collaborator = logObj.user.collaborators.find(c => c.email === logObj.userEmail);
          if (collaborator) {
            logObj.displayName = collaborator.name || logObj.userEmail;
            logObj.isCollaborator = true;
            logObj.teamMemberInfo = {
              name: collaborator.name || logObj.userEmail,
              email: collaborator.email,
              role: collaborator.role
            };
          }
        }
      } else {
        logObj.displayName = 'Unknown User';
      }
      
      // Add formatted timestamp for easier display
      if (logObj.timestamp) {
        const timestamp = new Date(logObj.timestamp);
        logObj.formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        logObj.formattedDate = timestamp.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      }
      
      return logObj;
    });

    // Sort logs by timestamp (most recent first)
    processedLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Log the action
    await Logger.logCRUD('view', req, 'Action Hub logs', actionHubItem._id, {
      logCount: processedLogs.length
    });

    return res.status(200).json(processedLogs);
  } catch (error) {
    console.error('Error fetching action logs:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Send notifications to team members (collaborators)
 */
export const notifyTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, managersOnly = false } = req.body;
    const userId = req.userId;
    const userEmail = req.userEmail; // May exist if this is a collaborator

    if (!message || message.trim() === '') {
      return res.status(400).json({ message: 'Notification message is required' });
    }

    // Find the action hub item
    const actionHubItem = await ActionHub.findById(id);
    
    if (!actionHubItem) {
      return res.status(404).json({ message: 'Action Hub item not found' });
    }
    
    // Populate the alert data to get the title and details
    await actionHubItem.populate('alert');
    const alertTitle = actionHubItem.alert.title || 'Team Alert';
    
    // Get the full alert object to pass to the email service
    const alertData = actionHubItem.alert.toObject();
    
    // Add action hub specific data like status to the alert data
    alertData.status = actionHubItem.status || 'new';

    // Get the user with collaborators
    const user = await User.findById(userId).select('collaborators');
    
    if (!user || !user.collaborators || user.collaborators.length === 0) {
      return res.status(400).json({ message: 'No team members available to notify' });
    }

    // Filter collaborators if managersOnly is true
    const collaboratorsToNotify = managersOnly 
      ? user.collaborators.filter(collab => collab.role === 'manager')
      : user.collaborators;
    
    if (collaboratorsToNotify.length === 0) {
      return res.status(400).json({ message: 'No team members match the criteria for notification' });
    }

    // Generate action hub link (front-end URL)
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const actionHubLink = `${baseUrl}/action-hub/alert/${actionHubItem.alert._id}`;
    
    // Send emails to filtered collaborators
    const emailSendResults = [];
    
    const emailPromises = collaboratorsToNotify.map(async (collaborator) => {
      const emailResult = await sendAlertNotificationToTeam(
        collaborator.email,
        collaborator.name || null,
        collaborator.role || 'viewer',
        alertTitle,
        message,
        alertData, // Pass the complete alert object instead of just the description
        actionHubLink
      );
      
      emailSendResults.push({
        email: collaborator.email,
        success: emailResult
      });
    });
    
    await Promise.all(emailPromises);
    
    // Add notification to the system
    const notification = new NotificationSys({
      title: managersOnly ? 'Management Notification' : 'Team Notification',
      message: message,
      recipients: collaboratorsToNotify.map(c => c.email),
      sentBy: userId,
      userId: userId,
      relatedAlert: actionHubItem.alert._id,
      notificationType: managersOnly ? 'management_notification' : 'team_notification'
    });
    
    await notification.save();
    
    // Add log entry
    actionHubItem.actionLogs.push({
      user: userId,
      userEmail: userEmail,
      actionType: 'notify_guests', // Reusing the same action type
      actionDetails: managersOnly
        ? `Sent notification to ${collaboratorsToNotify.length} manager${collaboratorsToNotify.length === 1 ? '' : 's'}`
        : `Sent notification to ${collaboratorsToNotify.length} team member${collaboratorsToNotify.length === 1 ? '' : 's'}`
    });
    
    await actionHubItem.save();

    // Log the action
    await Logger.logCRUD('create', req, 'Action Hub team notifications', actionHubItem._id, {
      recipientCount: collaboratorsToNotify.length,
      alertTitle: alertTitle,
      managersOnly: managersOnly
    });

    return res.status(200).json({ 
      message: managersOnly 
        ? 'Management notifications sent successfully'
        : 'Team notifications sent successfully',
      notifiedTeamMembers: collaboratorsToNotify.length,
      emailResults: emailSendResults
    });
  } catch (error) {
    console.error('Error notifying team members:', error);
    return res.status(500).json({ message: 'Server error' });
  }
}; 