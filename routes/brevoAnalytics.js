import express from 'express';
import { authenticateRole } from '../middleware/auth.js';
import {
  getDashboardStats,
  getEmailTemplates,
  getEmailEvents,
  getTemplateStats,
  getTransactionalEmailStats
} from '../controllers/brevoAnalyticsController.js';

const router = express.Router();

// Protect all routes with admin authentication
// Allow admin, manager, and viewer roles to access analytics
const allowedRoles = ['admin', 'manager', 'viewer', 'editor'];

// Get email dashboard analytics overview
router.get('/dashboard', authenticateRole(allowedRoles), getDashboardStats);

// Get all email templates
router.get('/templates', authenticateRole(allowedRoles), getEmailTemplates);

// Get specific template statistics
router.get('/templates/:templateId', authenticateRole(allowedRoles), getTemplateStats);

// Get email events (sent, opened, clicked, etc.)
router.get('/events', authenticateRole(allowedRoles), getEmailEvents);

// Get transactional email statistics
router.get('/transactional', authenticateRole(allowedRoles), getTransactionalEmailStats);

export default router; 