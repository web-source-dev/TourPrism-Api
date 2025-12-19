import express from "express";
import { getProfile, updateProfile } from "../controllers/profileController.js";
import { isAuthenticated } from "../middleware/auth.js";

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

export default router;

