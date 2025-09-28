import brevoAnalyticsService from '../utils/brevoAnalyticsService.js';
import Logger from '../utils/logger.js';

/**
 * Get dashboard overview statistics
 */
export const getDashboardStats = async (req, res) => {
  try {
    // Default to last 30 days if no date range provided
    const endDate = new Date().toISOString().split('T')[0]; // Today
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days ago
    
    // Override with query params if provided
    const { start, end } = req.query;
    
    const stats = await brevoAnalyticsService.getDashboardStats(
      start || startDate,
      end || endDate
    );
    
    // Log the action
    await Logger.logCRUD('view', req, 'Email analytics dashboard', null, {
      dateRange: { start: start || startDate, end: end || endDate }
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching email dashboard stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch email analytics', 
      error: error.message 
    });
  }
};

/**
 * Get all email templates
 */
export const getEmailTemplates = async (req, res) => {
  try {
    const templates = await brevoAnalyticsService.getEmailTemplates();
    // Log the action
    await Logger.logCRUD('list', req, 'Email templates', null, {
      templateCount: templates.length
    });

    res.json(templates);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({ 
      message: 'Failed to fetch email templates', 
      error: error.message 
    });
  }
};

/**
 * Get email events (sent, opened, clicked, etc.)
 */
export const getEmailEvents = async (req, res) => {
  try {
    const { startDate, endDate, email, event, limit } = req.query;
    
    const events = await brevoAnalyticsService.getEmailEvents({
      startDate,
      endDate,
      email,
      event,
      limit: limit ? parseInt(limit) : 50
    });
    
    // Log the action
    await Logger.logCRUD('list', req, 'Email events', null, {
      eventCount: events.length,
      filters: { startDate, endDate, email, event }
    });

    res.json(events);
  } catch (error) {
    console.error('Error fetching email events:', error);
    res.status(500).json({ 
      message: 'Failed to fetch email events', 
      error: error.message 
    });
  }
};

/**
 * Get statistics for a specific template
 */
export const getTemplateStats = async (req, res) => {
  try {
    const { templateId } = req.params;
    
    if (!templateId) {
      return res.status(400).json({ message: 'Template ID is required' });
    }
    
    const stats = await brevoAnalyticsService.getTemplateStats(parseInt(templateId));
    // Log the action
    await Logger.logCRUD('view', req, 'Email template statistics', templateId, {
      templateId: parseInt(templateId)
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching template statistics:', error);
    res.status(500).json({ 
      message: 'Failed to fetch template statistics', 
      error: error.message 
    });
  }
};

/**
 * Get all transactional email statistics
 */
export const getTransactionalEmailStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Set default date range to last 30 days if not specified
    const end = endDate || new Date().toISOString().split('T')[0]; // Today
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days ago
    
    const stats = await brevoAnalyticsService.getTransactionalEmailStats(start, end);
    // Log the action
    await Logger.logCRUD('view', req, 'Transactional email statistics', null, {
      dateRange: { start, end }
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching transactional email statistics:', error);
    res.status(500).json({ 
      message: 'Failed to fetch transactional email statistics', 
      error: error.message 
    });
  }
}; 