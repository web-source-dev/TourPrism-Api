import express from "express";
import { optionalAuth } from "../middleware/auth.js";
import {
  getAllAlerts,
  getCitySummary,
} from "../controllers/alertController.js";

const router = express.Router();

// Get all alerts (with optional filtering)
router.get("/", optionalAuth, getAllAlerts);

// Get city alert summary for home page
router.get('/cities/summary', optionalAuth, getCitySummary);

export default router;