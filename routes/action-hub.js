import express from 'express';
import { authenticate, authenticateRole } from '../middleware/auth.js';
import Logger from '../utils/logger.js';
import {
  getActionHubAlerts,
  getActionHubAlertById,
  flagAlert,
  followAlert,
  setActiveTab,
  addNote,
  addGuests,
  notifyGuests,
  notifyTeam,
  getActionLogs,
  markActionHubItemStatus,
} from '../controllers/actionHubController.js';

const router = express.Router();

/**
 * @route   GET /api/action-hub
 * @desc    Get all followed alerts in the user's Action Hub
 * @access  Private (requires authentication)
 */
router.get('/', authenticate, async (req, res, next) => {  
  // Call the original controller
  return getActionHubAlerts(req, res);
});

/**
 * @route   GET /api/action-hub/:id
 * @desc    Get a specific Action Hub alert by ID (either ActionHub ID or Alert ID)
 * @access  Private (requires authentication)
 */
router.get('/:id', authenticate, async (req, res, next) => {
  // Call the original controller
  return getActionHubAlertById(req, res);
});

/**
 * @route   POST /api/action-hub/flag/:alertId
 * @desc    Flag an alert and add it to the Action Hub
 * @access  Private
 */
router.post('/flag/:alertId', authenticate, flagAlert);

/**
 * @route   POST /api/action-hub/follow/:alertId
 * @desc    Follow/unfollow an alert in the Action Hub
 * @access  Private
 */
router.post('/follow/:alertId', authenticate, followAlert);

/**
 * @route   POST /api/action-hub/:id/resolve
 * @desc    Resolve a flagged alert (Admin/Manager only)
 * @access  Private (Admin/Manager only)
 */
router.post('/:id/resolve', authenticate, authenticateRole(['admin', 'manager']), markActionHubItemStatus);

/**
 * @route   POST /api/action-hub/:id/tab
 * @desc    Set the current active tab for the Action Hub item
 * @access  Private
 */
router.post('/:id/tab', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const { tab } = req.body;
  
  // Call the original controller
  return setActiveTab(req, res);
});

/**
 * @route   POST /api/action-hub/:id/notes
 * @desc    Add a note to an Action Hub item
 * @access  Private
 */
router.post('/:id/notes', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const { content } = req.body;
  
  try {
    // Log note addition
    await Logger.log(req, 'action_hub_note_added', { 
      actionHubId: id,
      noteLength: content?.length || 0
    });
  } catch (error) {
    console.error('Error logging note addition:', error);
    // Continue execution even if logging fails
  }
  
  // Call the original controller
  return addNote(req, res);
});

/**
 * @route   POST /api/action-hub/:id/guests
 * @desc    Add guests for notification
 * @access  Private
 */
router.post('/:id/guests', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const { guests } = req.body;
  
  try {
    // Log guest addition
    await Logger.log(req, 'action_hub_guest_added', { 
      actionHubId: id,
      guestCount: guests?.length || 0
    });
  } catch (error) {
    console.error('Error logging guest addition:', error);
    // Continue execution even if logging fails
  }
  
  // Call the original controller
  return addGuests(req, res);
});

/**-
 * @route   POST /api/action-hub/:id/notify
 * @desc    Send notifications to guests
 * @access  Private
 */
router.post('/:id/notify', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const { message, guestIds } = req.body;
  
  try {
    // Log notification sending
    await Logger.log(req, 'action_hub_notification_sent', { 
      actionHubId: id,
      recipientType: 'guests',
      recipientCount: guestIds?.length || 'all',
      messageLength: message?.length || 0
    });
  } catch (error) {
    console.error('Error logging notification sending:', error);
    // Continue execution even if logging fails
  }
  
  // Call the original controller
  return notifyGuests(req, res);
});

/**
 * @route   POST /api/action-hub/:id/notify-team
 * @desc    Send notifications to team members (collaborators)
 * @access  Private
 */
router.post('/:id/notify-team', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const { message, managersOnly } = req.body;
  
  try {
    // Log team notification sending
    await Logger.log(req, 'action_hub_notification_sent', { 
      actionHubId: id,
      recipientType: managersOnly ? 'managers' : 'team',
      messageLength: message?.length || 0
    });
  } catch (error) {
    console.error('Error logging team notification sending:', error);
    // Continue execution even if logging fails
  }
  
  // Call the original controller
  return notifyTeam(req, res);
});

/**
 * @route   GET /api/action-hub/:id/logs
 * @desc    Get action logs for an Action Hub item
 * @access  Private
 */
router.get('/:id/logs', authenticate, getActionLogs);

/**
 * @route   POST /api/action-hub/:id/status
 * @desc    Update the status of an Action Hub item
 * @access  Private
 */
router.post('/:id/status', authenticate, markActionHubItemStatus);

export default router;