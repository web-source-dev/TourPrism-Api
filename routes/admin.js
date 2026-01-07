const express = require("express");
const multer = require('multer');
const { authorizeRoles } = require("../middleware/auth.js");
const {
  getCityRiskStats,
  getAlerts,
  updateAlertStatus,
  deleteAlert,
  archiveAlert,
  duplicateAlert,
  getAlertDetails,
  updateAlert,
  createAlert,
  getUsers,
  getUserDetails,
  updateUser,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  getUserStats,
  createUser,
  getSubscribers,
  getSubscriberStats,
  deleteSubscriber,
  processAlert,
  triggerAlertGeneration,
  getAnalytics,
  downloadAlertTemplate,
  uploadBulkAlerts
} = require('../controllers/adminController.js');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is CSV
    if (file.mimetype === 'text/csv' ||
        file.mimetype === 'application/csv' ||
        file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Alert management routes (admin only)
router.get("/alerts", authorizeRoles(['admin']), getAlerts);
router.post("/alerts", authorizeRoles(['admin']), createAlert);
router.get("/alerts/template", authorizeRoles(['admin']), downloadAlertTemplate);
router.post("/alerts/bulk-upload", authorizeRoles(['admin']), upload.single('alertsFile'), uploadBulkAlerts);
router.get("/alerts/:alertId", authorizeRoles(['admin']), getAlertDetails);
router.put("/alerts/:alertId", authorizeRoles(['admin']), updateAlert);
router.patch("/alerts/:alertId/status", authorizeRoles(['admin']), updateAlertStatus);
router.patch("/alerts/:alertId/process", authorizeRoles(['admin']), processAlert);
router.post("/alerts/trigger-generation", authorizeRoles(['admin']), triggerAlertGeneration);
router.post("/alerts/:alertId/duplicate", authorizeRoles(['admin']), duplicateAlert);
router.post("/alerts/:alertId/archive", authorizeRoles(['admin']), archiveAlert);
router.delete("/alerts/:alertId", authorizeRoles(['admin']), deleteAlert);

// Get city risk stats (for non-authenticated users)
router.get("/dashboard/city-risk/:city", getCityRiskStats);

// User management routes (admin only)
router.get("/users", authorizeRoles(['admin']), getUsers);
router.post("/users", authorizeRoles(['admin']), createUser);
router.get("/users/stats", authorizeRoles(['admin']), getUserStats);
router.get("/users/:userId", authorizeRoles(['admin']), getUserDetails);
router.put("/users/:userId", authorizeRoles(['admin']), updateUser);
router.patch("/users/:userId/status", authorizeRoles(['admin']), updateUserStatus);
router.patch("/users/:userId/role", authorizeRoles(['admin']), updateUserRole);
router.delete("/users/:userId", authorizeRoles(['admin']), deleteUser);

// Subscriber management routes (admin only)
router.get("/subscribers", authorizeRoles(['admin']), getSubscribers);
router.get("/subscribers/stats", authorizeRoles(['admin']), getSubscriberStats);
router.delete("/subscribers/:email", authorizeRoles(['admin']), deleteSubscriber);

// Analytics routes (admin only)
router.get("/analytics", authorizeRoles(['admin']), getAnalytics);

module.exports = router; 