import express from 'express';
import Logger from '../utils/logger.js';
import { authenticate } from '../middleware/auth.js';
import {
  getAutomatedAlerts,
  bulkApproveAlerts,
  bulkRejectAlerts,
  approveAlert,
  rejectAlert,
  getAutomatedAlertStats,
  triggerAlertGeneration,
  editAutomatedAlert
} from '../controllers/automatedAlertController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get automated alerts with filtering and pagination
router.get('/', getAutomatedAlerts);

// Get automated alert statistics
router.get('/stats', getAutomatedAlertStats);

// Bulk approve alerts
router.post('/bulk-approve', bulkApproveAlerts);

// Bulk reject alerts
router.post('/bulk-reject', bulkRejectAlerts);

// Approve single alert
router.post('/:id/approve', approveAlert);

// Reject single alert
router.post('/:id/reject', rejectAlert);

// Edit automated alert
router.put('/:id/edit', editAutomatedAlert);

// Manually trigger alert generation (for testing)
router.post('/trigger-generation', triggerAlertGeneration);

export default router; 