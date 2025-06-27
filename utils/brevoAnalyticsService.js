import SibApiV3Sdk from 'sib-api-v3-sdk';
import dotenv from 'dotenv';
dotenv.config();

// Initialize Brevo API client
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

// Create API instances for different Brevo services
const transactionalEmailsApi = new SibApiV3Sdk.TransactionalEmailsApi();
const emailCampaignsApi = new SibApiV3Sdk.EmailCampaignsApi();

/**
 * Get all email templates
 * @returns {Promise<Array>} List of email templates
 */
export const getEmailTemplates = async () => {
  try {
    const templateFilter = {
      templateStatus: true, // Active templates only
      limit: 100 // Increased limit from 50 to 100
    };
    
    const response = await transactionalEmailsApi.getSmtpTemplates(templateFilter);
    
    // Make sure to retrieve the full content for each template
    const templatesWithContent = await Promise.all((response.templates || []).map(async (template) => {
      try {
        // Get the full template details including HTML content
        const fullTemplate = await transactionalEmailsApi.getSmtpTemplate(template.id);
        return {
          ...template,
          htmlContent: fullTemplate.htmlContent
        };
      } catch (err) {
        console.error(`Error fetching full template details for template ${template.id}:`, err);
        return template;
      }
    }));
    
    return templatesWithContent;
  } catch (error) {
    console.error('Error fetching email templates:', error);
    throw error;
  }
};

/**
 * Get email events (sent, opened, clicked, etc.)
 * @param {Object} options - Query options
 * @returns {Promise<Array>} List of email events
 */
export const getEmailEvents = async (options = {}) => {
  try {
    const { startDate, endDate, email, event, limit = 100 } = options; // Increased default limit from 50 to 100
    
    const eventsFilter = {
      limit,
      offset: 0
    };
    
    if (startDate) eventsFilter.startDate = startDate;
    if (endDate) eventsFilter.endDate = endDate;
    if (email) eventsFilter.email = email;
    if (event) eventsFilter.event = event;
    
    const response = await transactionalEmailsApi.getEmailEventReport(eventsFilter);
    return response.events || [];
  } catch (error) {
    console.error('Error fetching email events:', error);
    throw error;
  }
};

/**
 * Get statistics for transactional emails
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Aggregated statistics
 */
export const getTransactionalEmailStats = async (startDate, endDate) => {
  try {
    // Try to get email templates first
    const templates = await getEmailTemplates();
    
    // Create empty stats structure
    const aggregateStats = {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      rejected: 0,
      templates: {},
      recipients: {}
    };
    
    // Try to get all email events first - this will help us get more recipient data
    const events = await getEmailEvents({
      startDate,
      endDate,
      limit: 500 // Get more events to capture more recipients
    }).catch(err => {
      console.error('Error fetching email events:', err);
      return [];
    });
    
    // Process events to get recipient data
    events.forEach(event => {
      if (event.email) {
        if (!aggregateStats.recipients[event.email]) {
          aggregateStats.recipients[event.email] = {
            email: event.email,
            sent: 0,
            opened: 0,
            clicked: 0
          };
        }
        
        if (event.event === 'delivered' || event.event === 'request') {
          aggregateStats.recipients[event.email].sent++;
        }
        if (event.event === 'opened') {
          aggregateStats.recipients[event.email].opened++;
        }
        if (event.event === 'clicks') {
          aggregateStats.recipients[event.email].clicked++;
        }
      }
    });
    
    // For each template, try to get its stats
    if (templates && templates.length > 0) {
      for (const template of templates) {
        try {
          // Get emails sent using this template
          const templateEmails = await transactionalEmailsApi.getTransacEmailsList({
            templateId: template.id,
            limit: 200  // Increased limit from 50 to 200
          });
          
          // Process the returned emails
          (templateEmails.transactionalEmails || []).forEach(email => {
            // Increment counters based on email status
            aggregateStats.sent++;
            
            if (email.messageId) aggregateStats.delivered++;
            if (email.opens > 0) aggregateStats.opened++;
            if (email.clicks > 0) aggregateStats.clicked++;
            if (email.bounces > 0) aggregateStats.bounced++;
            if (email.rejected) aggregateStats.rejected++;
            
            // Group by template
            const templateId = email.templateId || 'none';
            if (!aggregateStats.templates[templateId]) {
              aggregateStats.templates[templateId] = {
                id: templateId,
                name: template.name || email.subject || 'No template',
                sent: 0,
                opened: 0,
                clicked: 0
              };
            }
            
            aggregateStats.templates[templateId].sent++;
            if (email.opens > 0) aggregateStats.templates[templateId].opened++;
            if (email.clicks > 0) aggregateStats.templates[templateId].clicked++;
            
            // Group by recipient
            if (email.to) {
              email.to.forEach(recipient => {
                if (!aggregateStats.recipients[recipient.email]) {
                  aggregateStats.recipients[recipient.email] = {
                    email: recipient.email,
                    sent: 0,
                    opened: 0,
                    clicked: 0
                  };
                }
                
                aggregateStats.recipients[recipient.email].sent++;
                if (email.opens > 0) aggregateStats.recipients[recipient.email].opened++;
                if (email.clicks > 0) aggregateStats.recipients[recipient.email].clicked++;
              });
            }
          });
        } catch (templateError) {
          console.error(`Error fetching emails for template ${template.id}:`, templateError);
          // Continue with next template
        }
      }
    }
    
    return aggregateStats;
  } catch (error) {
    console.error('Error fetching transactional email stats:', error);
    
    // Return mock data if API call fails
    return {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      rejected: 0,
      templates: {},
      recipients: {}
    };
  }
};

/**
 * Get specific template data and statistics
 * @param {number} templateId - Template ID
 * @returns {Promise<Object>} Template details and statistics
 */
export const getTemplateStats = async (templateId) => {
  try {
    // Get template details
    const templateDetails = await transactionalEmailsApi.getSmtpTemplate(templateId);
    
    // Get email events for this template to get more accurate stats
    const events = await getEmailEvents({
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 90 days ago
      event: undefined, // All event types
      limit: 500
    }).catch(err => {
      console.error('Error fetching email events for template:', err);
      return [];
    });
    
    // Filter events by template ID
    const templateEvents = events.filter(event => event.templateId === Number(templateId));
    
    // Get emails sent using this template
    const emails = await transactionalEmailsApi.getTransacEmailsList({
      templateId,
      limit: 200  // Increased limit from 100 to 200
    });
    
    // Calculate statistics
    const stats = {
      templateName: templateDetails.name,
      subject: templateDetails.subject,
      htmlContent: templateDetails.htmlContent,
      sent: 0,
      delivered: 0,
      opened: 0,
      openRate: 0,
      clicked: 0,
      clickRate: 0,
      bounced: 0,
      rejected: 0,
      recipients: []
    };
    
    // Process emails to generate stats
    (emails.transactionalEmails || []).forEach(email => {
      stats.sent++;
      
      if (email.messageId) stats.delivered++;
      if (email.opens > 0) stats.opened++;
      if (email.clicks > 0) stats.clicked++;
      if (email.bounces > 0) stats.bounced++;
      if (email.rejected) stats.rejected++;
      
      // Add recipient data
      if (email.to) {
        email.to.forEach(recipient => {
          stats.recipients.push({
            email: recipient.email,
            sentAt: email.sentAt,
            opened: email.opens > 0,
            clicked: email.clicks > 0
          });
        });
      }
    });
    
    // Enhance stats with event data for more comprehensive result
    templateEvents.forEach(event => {
      // Check if this recipient already exists in our list
      const existingRecipientIndex = stats.recipients.findIndex(r => r.email === event.email);
      
      if (existingRecipientIndex === -1 && event.email) {
        // Add new recipient if not found
        stats.recipients.push({
          email: event.email,
          sentAt: event.date,
          opened: event.event === 'opened',
          clicked: event.event === 'clicks'
        });
      } else if (existingRecipientIndex !== -1) {
        // Update existing recipient status based on event
        if (event.event === 'opened') {
          stats.recipients[existingRecipientIndex].opened = true;
        }
        if (event.event === 'clicks') {
          stats.recipients[existingRecipientIndex].clicked = true;
        }
      }
    });
    
    // Deduplicate recipients by email
    const uniqueRecipients = [];
    const emailMap = new Map();
    
    stats.recipients.forEach(recipient => {
      if (!emailMap.has(recipient.email)) {
        emailMap.set(recipient.email, true);
        uniqueRecipients.push(recipient);
      }
    });
    
    stats.recipients = uniqueRecipients;
    
    // Calculate rates
    if (stats.delivered > 0) {
      stats.openRate = (stats.opened / stats.delivered * 100).toFixed(2);
      stats.clickRate = (stats.clicked / stats.delivered * 100).toFixed(2);
    }
    
    return stats;
  } catch (error) {
    console.error('Error fetching template statistics:', error);
    
    // Return mock data with template ID
    return {
      templateId: templateId,
      templateName: 'Template information unavailable',
      subject: 'N/A',
      sent: 0,
      delivered: 0,
      opened: 0,
      openRate: 0,
      clicked: 0,
      clickRate: 0,
      bounced: 0,
      rejected: 0,
      recipients: [],
      error: 'Could not retrieve template statistics. The template might not exist or there was an API error.'
    };
  }
};

/**
 * Get aggregated statistics for all email types
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Dashboard statistics
 */
export const getDashboardStats = async (startDate, endDate) => {
  try {
    // Get templates first - these will include full HTML content
    const templates = await getEmailTemplates().catch(err => {
      console.error('Error fetching email templates:', err);
      return [];
    });
    
    // Get transactional stats
    const transactionalStats = await getTransactionalEmailStats(startDate, endDate).catch(err => {
      console.error('Error fetching transactional stats:', err);
      return {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        rejected: 0,
        templates: {},
        recipients: {}
      };
    });
    
    // Process templates to add more context
    const enrichedTemplates = templates.map(template => {
      const templateStats = transactionalStats.templates[template.id] || {
        sent: 0,
        opened: 0,
        clicked: 0
      };
      
      const openRate = templateStats.sent > 0 
        ? (templateStats.opened / templateStats.sent * 100).toFixed(2)
        : 0;
        
      const clickRate = templateStats.sent > 0
        ? (templateStats.clicked / templateStats.sent * 100).toFixed(2)
        : 0;
        
      return {
        id: template.id,
        name: template.name,
        subject: template.subject,
        sent: templateStats.sent || 0,
        opened: templateStats.opened || 0,
        clicked: templateStats.clicked || 0,
        openRate,
        clickRate,
        htmlContent: template.htmlContent || ''
      };
    });
    
    // Use all recipients instead of just top 20
    const allRecipients = Object.values(transactionalStats.recipients).sort((a, b) => b.sent - a.sent);
    
    return {
      overview: {
        sent: transactionalStats.sent || 0,
        delivered: transactionalStats.delivered || 0,
        opened: transactionalStats.opened || 0,
        openRate: transactionalStats.delivered > 0 
          ? (transactionalStats.opened / transactionalStats.delivered * 100).toFixed(2)
          : '0',
        clicked: transactionalStats.clicked || 0,
        clickRate: transactionalStats.delivered > 0
          ? (transactionalStats.clicked / transactionalStats.delivered * 100).toFixed(2)
          : '0',
        bounced: transactionalStats.bounced || 0,
        rejected: transactionalStats.rejected || 0
      },
      templates: enrichedTemplates,
      recipients: allRecipients  // Return all recipients instead of slicing to top 20
    };
  } catch (error) {
    console.error('Error generating dashboard statistics:', error);
    
    // Return basic structure with empty data if all fails
    return {
      overview: {
        sent: 0,
        delivered: 0,
        opened: 0,
        openRate: '0',
        clicked: 0,
        clickRate: '0',
        bounced: 0,
        rejected: 0
      },
      templates: [],
      recipients: []
    };
  }
};

export default {
  getEmailTemplates,
  getEmailEvents,
  getTransactionalEmailStats,
  getTemplateStats,
  getDashboardStats
}; 