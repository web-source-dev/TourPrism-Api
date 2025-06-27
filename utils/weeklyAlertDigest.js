import SibApiV3Sdk from 'sib-api-v3-sdk';
import dotenv from 'dotenv';
import cron from 'node-cron';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Subscriber from '../models/subscribers.js';
import Alert from '../models/Alert.js';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';

dotenv.config();

// Initialize Brevo API client
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Format date to display in email
const formatDate = (date) => {
  return format(date, 'MMM dd, yyyy');
};

// Get duration in days between two dates
const getDurationDays = (startDate, endDate) => {
  const diffTime = Math.abs(new Date(endDate) - new Date(startDate));
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Find alerts relevant for a subscriber based on location and sector
const findRelevantAlerts = async (subscriber) => {
  try {
    // Current date for queries
    const now = new Date();
    
    // Find all approved alerts that are active or upcoming
    let query = {
      status: "approved",
      expectedEnd: { $gte: now } // Alert hasn't ended yet
    };
    
    // Location matching logic (match either origin location or impact locations)
    if (subscriber.location && subscriber.location.length > 0) {
      const locationQueries = subscriber.location.map(loc => {
        // Create a location object for querying
        return {
          $or: [
            // Match origin location using simple range queries
            { 
              originLatitude: { 
                $gte: loc.latitude - 0.5, 
                $lte: loc.latitude + 0.5 
              },
              originLongitude: { 
                $gte: loc.longitude - 0.5, 
                $lte: loc.longitude + 0.5 
              }
            },
            // Match any impact location
            {
              "impactLocations": {
                $elemMatch: {
                  latitude: { 
                    $gte: loc.latitude - 0.5, 
                    $lte: loc.latitude + 0.5 
                  },
                  longitude: { 
                    $gte: loc.longitude - 0.5, 
                    $lte: loc.longitude + 0.5 
                  }
                }
              }
            },
            // Legacy location fields (for backward compatibility)
            {
              latitude: { 
                $gte: loc.latitude - 0.5, 
                $lte: loc.latitude + 0.5 
              },
              longitude: { 
                $gte: loc.longitude - 0.5, 
                $lte: loc.longitude + 0.5 
              }
            }
          ]
        };
      });

      query.$or = locationQueries;
    }

    // Target audience matching (sector)
    if (subscriber.sector) {
      query.targetAudience = subscriber.sector;
    }
    
    // Get alerts sorted by impact severity and start date
    const alerts = await Alert.find(query)
      .sort({ impact: -1, expectedStart: 1 })
      .limit(5)
      .lean();
      
    return alerts;
  } catch (error) {
    console.error(`Error finding relevant alerts for ${subscriber.email}:`, error);
    return [];
  }
};

// Send weekly digest email to a subscriber
const sendWeeklyDigest = async (subscriber, alerts) => {
  // If no alerts found, skip sending
  if (!alerts || alerts.length === 0) {
    console.log(`No relevant alerts found for ${subscriber.email}`);
    return;
  }
  
  try {
    console.log(`📧 Found ${alerts.length} relevant alerts for ${subscriber.email}`);
    
    // Get the start and end of the current week
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const dateRange = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
    
    // Prepare the main alert (first in the list)
    const mainAlert = alerts[0];
    const city = subscriber.location && subscriber.location.length > 0 
      ? subscriber.location[0].name 
      : 'Your area';
    
    // Build alerts content for the email - include all alerts
    const alertsContent = alerts.map((alert, index) => {
      return {
        title: alert.title,
        start: formatDate(alert.expectedStart),
        duration: getDurationDays(alert.expectedStart, alert.expectedEnd),
        summary: alert.description,
        category: alert.alertCategory || 'General',
        impact: alert.impact || 'Unknown'
      };
    });
    
    // Send email using Brevo template
    const sender = {
      email: process.env.EMAIL_FROM || 'alert@tourprism.com',
      name: 'Tourprism Alerts'
    };

    const receivers = [
      {
        email: subscriber.email
      }
    ];

    // Prepare email parameters to be sent to Brevo template
    // Include all alerts in the parameters - updated for new template structure
    const params = {
      city,
      sector: subscriber.sector || 'Tourism',
      date_range: dateRange,
      // Main alert (first one)
      title1: alerts[0]?.title || '',
      start1: alerts[0]?.expectedStart ? formatDate(alerts[0].expectedStart) : '',
      duration1: alerts[0]?.expectedStart && alerts[0]?.expectedEnd ? getDurationDays(alerts[0].expectedStart, alerts[0].expectedEnd) : 0,
      summary1: alerts[0]?.description || '',
      // Second alert
      title2: alerts[1]?.title || '',
      start2: alerts[1]?.expectedStart ? formatDate(alerts[1].expectedStart) : '',
      duration2: alerts[1]?.expectedStart && alerts[1]?.expectedEnd ? getDurationDays(alerts[1].expectedStart, alerts[1].expectedEnd) : 0,
      summary2: alerts[1]?.description || '',
      // Third alert
      title3: alerts[2]?.title || '',
      start3: alerts[2]?.expectedStart ? formatDate(alerts[2].expectedStart) : '',
      duration3: alerts[2]?.expectedStart && alerts[2]?.expectedEnd ? getDurationDays(alerts[2].expectedStart, alerts[2].expectedEnd) : 0,
      summary3: alerts[2]?.description || '',
      // Fourth alert
      title4: alerts[3]?.title || '',
      start4: alerts[3]?.expectedStart ? formatDate(alerts[3].expectedStart) : '',
      duration4: alerts[3]?.expectedStart && alerts[3]?.expectedEnd ? getDurationDays(alerts[3].expectedStart, alerts[3].expectedEnd) : 0,
      summary4: alerts[3]?.description || '',
      // Fifth alert
      title5: alerts[4]?.title || '',
      start5: alerts[4]?.expectedStart ? formatDate(alerts[4].expectedStart) : '',
      duration5: alerts[4]?.expectedStart && alerts[4]?.expectedEnd ? getDurationDays(alerts[4].expectedStart, alerts[4].expectedEnd) : 0,
      summary5: alerts[4]?.description || ''
    };

    // Log the alerts being sent
    console.log(`📋 Sending ${alerts.length} alerts to ${subscriber.email}:`);
    alerts.forEach((alert, index) => {
      console.log(`   ${index + 1}. ${alert.title} (${alert.alertCategory || 'No category'}) - ${alert.impact || 'No impact'}`);
    });

    // Create the email to send
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.templateId = 5; // The Brevo template ID
    sendSmtpEmail.sender = sender;
    sendSmtpEmail.to = receivers;
    sendSmtpEmail.params = params;

    // Send the email through Brevo
    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Weekly digest sent to ${subscriber.email} with ${alerts.length} alerts`);
    return response;
  } catch (error) {
    console.error(`❌ Error sending weekly digest to ${subscriber.email}:`, error);
    throw error;
  }
};

// Process all subscribers
const processWeeklyDigests = async () => {
  try {
    console.log(`🚀 Starting weekly alert digest process at ${new Date().toISOString()}`);
    console.log('=====================================');
    
    // Connect to database if not already connected
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    
    // Get all subscribers
    const subscribers = await Subscriber.find().lean();
    console.log(`👥 Found ${subscribers.length} subscribers to process`);
    
    let totalEmailsSent = 0;
    let totalAlertsSent = 0;
    
    // Process each subscriber
    for (const subscriber of subscribers) {
      try {
        // Skip invalid subscribers
        if (!subscriber.email) {
          console.log(`⚠️  Skipping invalid subscriber (no email)`);
          continue;
        }
        
        console.log(`\n📧 Processing subscriber: ${subscriber.email}`);
        
        // Find relevant alerts for this subscriber
        const alerts = await findRelevantAlerts(subscriber);
        
        if (alerts.length > 0) {
          // Send digest email if relevant alerts found
          await sendWeeklyDigest(subscriber, alerts);
          totalEmailsSent++;
          totalAlertsSent += alerts.length;
          console.log(`✅ Successfully processed subscriber ${subscriber.email}`);
        } else {
          console.log(`📭 No alerts found for subscriber ${subscriber.email}`);
        }
      } catch (error) {
        console.error(`❌ Error processing subscriber ${subscriber.email}:`, error);
        // Continue with next subscriber even if there's an error
      }
    }
    
    console.log('\n=====================================');
    console.log(`📊 Weekly digest process completed at ${new Date().toISOString()}`);
    console.log(`📧 Total emails sent: ${totalEmailsSent}`);
    console.log(`🚨 Total alerts sent: ${totalAlertsSent}`);
    console.log(`👥 Subscribers processed: ${subscribers.length}`);
    console.log('=====================================');
  } catch (error) {
    console.error('❌ Error in weekly digest process:', error);
  }
};

// Schedule the job to run every Monday at 10AM Edinburgh time (GMT+1 usually)
const scheduleWeeklyDigests = () => {
  // '0 10 * * 1' = At 10:00 AM, only on Monday
  // Use edinburgh timezone offset
  cron.schedule('0 10 * * 1', processWeeklyDigests, {
    scheduled: true,
    timezone: "Europe/London" // Edinburgh time
  });
  
  console.log('Weekly alert digest job scheduled for Mondays at 10:00 AM Edinburgh time');
};

// Export functions for testing or manual triggering
export {
  scheduleWeeklyDigests,
  processWeeklyDigests
};

// If this file is run directly, schedule the job
if (import.meta.url === `file://${process.argv[1]}`) {
  scheduleWeeklyDigests();
} 