const express = require("express");
const { getProfile, updateProfile } = require("../controllers/profileController.js");
const { isAuthenticated } = require("../middleware/auth.js");

const router = express.Router();

/**
 * @route   GET /api/profile
 * @desc    Get user profile
 * @access  Private (requires authentication)
 */
router.get("/", isAuthenticated, getProfile);

/**
 * @route   PUT /api/profile
 * @desc    Update user profile
 * @access  Private (requires authentication, no collaborators)
 */
router.put("/", isAuthenticated, updateProfile);

module.exports = router;

