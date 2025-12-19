import express from 'express';
import { isAuthenticated, authorizeRoles } from '../middleware/auth.js';
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
router.get('/', isAuthenticated, authorizeRoles(adminOnly), getAllLogs);

/**
 * @route   GET /api/logs/user/:userId
 * @desc    Get logs for a specific user
 * @access  Admin only
 */
router.get('/user/:userId', isAuthenticated, authorizeRoles(adminOnly), getUserLogs);

/**
 * @route   GET /api/logs/summary
 * @desc    Get activity summary (counts by action type)
 * @access  Admin only
 */
router.get('/summary', isAuthenticated, authorizeRoles(adminOnly), getActivitySummary);

/**
 * @route   GET /api/logs/active-users
 * @desc    Get most active users
 * @access  Admin only
 */
router.get('/active-users', isAuthenticated, authorizeRoles(adminOnly), getMostActiveUsers);

/**
 * @route   POST /api/logs
 * @desc    Add a log entry manually (for testing)
 * @access  Admin only
 */
router.post('/', isAuthenticated, authorizeRoles(adminOnly), addLog);

export default router; 