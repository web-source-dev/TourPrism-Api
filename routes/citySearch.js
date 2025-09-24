import express from "express";
import { storeCitySearchEmail, getCitySearchSubscriptions } from "../controllers/citySearchController.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";

const router = express.Router();

// Store city search email subscription
router.post("/subscribe", optionalAuth, storeCitySearchEmail);

// Get city search subscriptions (authenticated users can see their own, admins can see all)
router.get("/subscriptions", optionalAuth, getCitySearchSubscriptions);

export default router;
