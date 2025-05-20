import express from 'express';
import { authenticate, authenticateRole } from '../middleware/auth.js';
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
router.get('/', authenticate, getActionHubAlerts);

/**
 * @route   GET /api/action-hub/:id
 * @desc    Get a specific Action Hub alert by ID (either ActionHub ID or Alert ID)
 * @access  Private (requires authentication)
 */
router.get('/:id', authenticate, getActionHubAlertById);

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
router.post('/:id/tab', authenticate, setActiveTab);

/**
 * @route   POST /api/action-hub/:id/notes
 * @desc    Add a note to an Action Hub item
 * @access  Private
 */
router.post('/:id/notes', authenticate, addNote);

/**
 * @route   POST /api/action-hub/:id/guests
 * @desc    Add guests for notification
 * @access  Private
 */
router.post('/:id/guests', authenticate, addGuests);

/**-
 * @route   POST /api/action-hub/:id/notify
 * @desc    Send notifications to guests
 * @access  Private
 */
router.post('/:id/notify', authenticate, notifyGuests);

/**
 * @route   POST /api/action-hub/:id/notify-team
 * @desc    Send notifications to team members (collaborators)
 * @access  Private
 */
router.post('/:id/notify-team', authenticate, notifyTeam);

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