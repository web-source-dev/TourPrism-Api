const express = require("express");
const { optionalAuth } = require("../middleware/auth.js");
const {
  getAllAlerts,
  getCitySummary,
} = require("../controllers/alertController.js");

const router = express.Router();

// Get all alerts (with optional filtering)
router.get("/", optionalAuth, getAllAlerts);

// Get city alert summary for home page
router.get('/cities/summary', optionalAuth, getCitySummary);

module.exports = router;