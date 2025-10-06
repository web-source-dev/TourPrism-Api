import express from "express";
import { 
  trackSearchQuery, 
  getSearchAnalytics, 
  getPopularSearches, 
  getSearchAnalyticsSummary 
} from "../controllers/searchTrackingController.js";
import { authenticate, optionalAuth, authenticateRole } from "../middleware/auth.js";

const router = express.Router();

// Track search query - accessible to all users (authenticated and anonymous)
router.post("/track", optionalAuth, trackSearchQuery);

// Get search analytics - admin only
router.get("/analytics", authenticate, authenticateRole(['admin', 'manager']), getSearchAnalytics);

// Get popular searches - admin only
router.get("/popular", authenticate, authenticateRole(['admin', 'manager']), getPopularSearches);

// Get search analytics summary - admin only
router.get("/summary", authenticate, authenticateRole(['admin', 'manager']), getSearchAnalyticsSummary);

export default router;
