import express from 'express';
import { authenticate, authenticateRole } from '../middleware/auth.js';
import {
  getAllLogs,
  getUserLogs,
  getActivitySummary,
  getMostActiveUsers,
  addLog
} from '../controllers/logsController.js';

const router = express.Router();

// Only admin users can access logs
const adminOnly = ['admin'];

/**
 * @route   GET /api/logs
 * @desc    Get all logs with filtering and pagination
 * @access  Admin only
 */
router.get('/', authenticate, authenticateRole(adminOnly), getAllLogs);

/**
 * @route   GET /api/logs/user/:userId
 * @desc    Get logs for a specific user
 * @access  Admin only
 */
router.get('/user/:userId', authenticate, authenticateRole(adminOnly), getUserLogs);

/**
 * @route   GET /api/logs/summary
 * @desc    Get activity summary (counts by action type)
 * @access  Admin only
 */
router.get('/summary', authenticate, authenticateRole(adminOnly), getActivitySummary);

/**
 * @route   GET /api/logs/active-users
 * @desc    Get most active users
 * @access  Admin only
 */
router.get('/active-users', authenticate, authenticateRole(adminOnly), getMostActiveUsers);

/**
 * @route   POST /api/logs
 * @desc    Add a log entry manually (for testing)
 * @access  Admin only
 */
router.post('/', authenticate, authenticateRole(adminOnly), addLog);

export default router; 