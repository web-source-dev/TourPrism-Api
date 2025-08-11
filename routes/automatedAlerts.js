import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAutomatedAlerts,
  bulkApproveAlerts,
  bulkRejectAlerts,
  approveAlert,
  rejectAlert,
  getAutomatedAlertStats,
  triggerAlertGeneration
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

// Manually trigger alert generation (for testing)
router.post('/trigger-generation', triggerAlertGeneration);

export default router; 