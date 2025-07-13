import dotenv from 'dotenv';
import cron from 'node-cron';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Subscriber from '../models/subscribers.js';
import Alert from '../models/Alert.js';
import ForecastSendSummary from '../models/forecastSendSummary.js';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { transporter } from './emailService.js';
import generateWeeklyDigestEmail from './emailTemplates/weeklyDigest.js';

dotenv.config();

// Format date to display in email
const formatDate = (date) => {
  return format(date, 'MMM dd');
};

// Get emoji for alert category
const getAlertEmoji = (category) => {
  const emojiMap = {
    'Weather': '🌦️',
    'Transport': '🚂',
    'Event': '🎪',
    'Construction': '🏗️',
    'Emergency': '🚨',
    'Festival': '🎭',
    'Road': '🚗',
    'Other': '📢'
  };
  return emojiMap[category] || '📢';
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
    
    // Find associated user if exists
    const User = mongoose.model('User');
    const user = await User.findOne({ email: subscriber.email });

    // Prepare email parameters
    const params = {
      // User/Subscriber Info
      FIRSTNAME: user?.firstName || subscriber.name || 'Traveler',
      LOCATION: subscriber.location?.[0]?.name || 'Your Area',
      
      DISRUPTION_COUNT: alerts.length,
      
      // Company Info
      COMPANY_NAME: 'Tourprism Limited',
      COMPANY_LOCATION: 'Edinburgh, UK',
      
      // Alert Data
      ...alerts.reduce((acc, alert, index) => ({
        ...acc,
        [`ALERT${index + 1}_EMOJI`]: getAlertEmoji(alert.alertCategory),
        [`ALERT${index + 1}_HEADER`]: alert.title || '',
        [`ALERT${index + 1}_START`]: alert.expectedStart ? formatDate(alert.expectedStart) : '',
        [`ALERT${index + 1}_END`]: alert.expectedEnd ? formatDate(alert.expectedEnd) : '',
        [`ALERT${index + 1}_BODY`]: alert.recommendation || alert.description || ''
      }), {}),
      
      // Registration Status
      IS_REGISTERED: user ? 'true' : 'false',
      
      // Links
      SIGNUP_LINK: `${process.env.FRONTEND_URL}/signup`,
      DASHBOARD_LINK: `${process.env.FRONTEND_URL}/feed`,
      SUPPORT_EMAIL: 'support@tourprism.com',
      WEBSITE: 'www.tourprism.com',
      LINKEDIN: 'https://linkedin.com/company/tourprism',
      TWITTER: 'https://twitter.com/tourprism',
      
      // Footer Links
      unsubscribe: `${process.env.FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(subscriber.email)}`,
      update_profile: `${process.env.FRONTEND_URL}/profile`
    };

    // Generate HTML content using our template
    const htmlContent = generateWeeklyDigestEmail(params);

    // Send email using our email service
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'aabeyratne@tourprism.com',
      to: subscriber.email,
      subject: `Weekly Disruption Digest for ${params.LOCATION}`,
      html: htmlContent
    });

    console.log(`✅ Weekly digest sent to ${subscriber.email} with ${alerts.length} alerts`);
    
    // Update the subscriber's lastWeeklyForecastReceived timestamp
    await Subscriber.findByIdAndUpdate(subscriber._id, {
      lastWeeklyForecastReceived: new Date()
    });
    
    // Also update the user's lastWeeklyForecastReceived if they exist
    if (user) {
      await User.findByIdAndUpdate(user._id, {
        lastWeeklyForecastReceived: new Date()
      });
    }

    // --- LOGGING TO DB ---
    // Save a log entry for this send
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-GB', { weekday: 'long' });
    const alertTypes = Array.from(new Set(alerts.map(a => a.alertCategory).filter(Boolean)));
    const alertIds = alerts.map(a => a._id);
    await ForecastSendSummary.create({
      sentAt: now,
      dayOfWeek,
      location: subscriber.location?.[0]?.name || '',
      alertTypes,
      recipientCount: 1,
      recipients: [subscriber.email],
      alertIds,
      digestType: 'weekly',
      sector: subscriber.sector || '',
      rawAlerts: alerts
    });
    // --- END LOGGING ---
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
  cron.schedule('44 * * * *', processWeeklyDigests, {
    scheduled: true,
    timezone: "Asia/Karachi" // Paki time
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