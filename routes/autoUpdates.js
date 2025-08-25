import express from "express";
import { authenticateRole } from "../middleware/auth.js";
import {
  getAutoUpdateEligibleAlerts,
  getAutoUpdateStats,
  checkAlertForUpdates,
  suppressAutoUpdates,
  enableAutoUpdates,
  getAlertUpdateHistory,
  triggerAutoUpdateProcess,
  getAutoUpdateLogs
} from "../controllers/autoUpdateController.js";

const router = express.Router();

// Protect all auto-update routes with admin authentication
router.use(authenticateRole(['admin', 'manager']));

// Get alerts eligible for auto-updates
router.get("/eligible-alerts", getAutoUpdateEligibleAlerts);

// Get auto-update statistics
router.get("/stats", getAutoUpdateStats);

// Manually check an alert for updates
router.post("/check/:alertId", checkAlertForUpdates);

// Suppress auto-updates for an alert
router.post("/suppress/:alertId", suppressAutoUpdates);

// Enable auto-updates for an alert
router.post("/enable/:alertId", enableAutoUpdates);

// Get update history for an alert
router.get("/history/:alertId", getAlertUpdateHistory);

// Manually trigger auto-update process
router.post("/trigger", triggerAutoUpdateProcess);

// Get auto-update logs
router.get("/logs", getAutoUpdateLogs);

export default router;

