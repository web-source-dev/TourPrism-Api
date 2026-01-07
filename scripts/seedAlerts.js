const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const { CONFIDENCE_SCORING } = require('../config/constants');
const alertsData = require('../../alerts.json');

// Helper function to determine source credibility
function getSourceCredibility(source) {
  if (!source) return 'other_news';

  const lowerSource = source.toLowerCase();

  // Official sources
  if (lowerSource.includes('bbc') || lowerSource.includes('met') || lowerSource.includes('gov.uk')) {
    return 'official';
  }

  // Major news sources
  if (lowerSource.includes('sky') || lowerSource.includes('reuters') || lowerSource.includes('guardian') ||
      lowerSource.includes('independent') || lowerSource.includes('telegraph')) {
    return 'major_news';
  }

  // Social media
  if (lowerSource.includes('twitter') || lowerSource.includes('x ') || lowerSource.includes('reddit') ||
      lowerSource.includes('forum')) {
    return 'social';
  }

  // Default to other news
  return 'other_news';
}

// Calculate confidence score for a single source
function calculateConfidenceForSource(sourceCredibility) {
  const sourceGroups = {};
  sourceGroups[sourceCredibility] = 1; // Single source

  let totalScore = 0;

  for (const [credibility, count] of Object.entries(sourceGroups)) {
    let score = 0;

    switch (credibility) {
      case 'official': // BBC, MET, Gov.uk
        score = 0.8;
        break;
      case 'major_news': // Sky, Reuters, Guardian
        score = 0.7;
        break;
      case 'other_news': // Local, Al Jazeera, blogs
        score = 0.5;
        break;
      case 'social': // X, forums
        score = 0.3;
        break;
      default:
        score = 0.5; // Default for unknown source types
    }

    totalScore += score * count;
  }

  return Math.round(totalScore * 100) / 100;
}

// Function to generate random date between Jan 1, 2026 and Jan 20, 2026
function getRandomDateInJanuary2026() {
  const start = new Date('2026-01-01');
  const end = new Date('2026-01-20');
  const randomTime = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(randomTime);
}

// Function to generate end date (1-3 days after start date)
function getEndDate(startDate) {
  const daysToAdd = Math.floor(Math.random() * 3) + 1; // 1-3 days
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + daysToAdd);
  return endDate;
}

async function seedAlerts() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/TourPrism', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Clear existing alerts
    await Alert.deleteMany({});
    console.log('Cleared existing alerts');

    const alertsToInsert = [];

    // Process all alerts from the JSON file
    for (const alertGroup of alertsData) {
      for (const alertData of alertGroup) {
        // Generate new dates within January 2026
        const startDate = getRandomDateInJanuary2026();
        const endDate = getEndDate(startDate);

        // Calculate confidence based on source
        const sourceCredibility = getSourceCredibility(alertData.source);
        const confidence = calculateConfidenceForSource(sourceCredibility);

        const alert = {
          title: alertData.title,
          summary: alertData.summary,
          city: alertData.city,
          status: 'approved', // Set all to approved for seeding
          source: alertData.source,
          url: alertData.url,
          startDate: startDate,
          endDate: endDate,
          isLatest: true,
          mainType: alertData.main_type,
          subType: alertData.sub_type,
          confidence: confidence,
          viewCount: Math.floor(Math.random() * 100), // Random view count
          followedBy: [] // Empty array
        };

        alertsToInsert.push(alert);
      }
    }

    // Sort by date for better organization
    alertsToInsert.sort((a, b) => a.startDate - b.startDate);

    // Insert all alerts
    const insertedAlerts = await Alert.insertMany(alertsToInsert);
    console.log(`Successfully seeded ${insertedAlerts.length} alerts`);

    // Log some stats
    const alertsByCity = {};
    const alertsByType = {};

    insertedAlerts.forEach(alert => {
      alertsByCity[alert.city] = (alertsByCity[alert.city] || 0) + 1;
      alertsByType[alert.mainType] = (alertsByType[alert.mainType] || 0) + 1;
    });

    console.log('\nAlerts by city:');
    Object.entries(alertsByCity).forEach(([city, count]) => {
      console.log(`  ${city}: ${count}`);
    });

    console.log('\nAlerts by type:');
    Object.entries(alertsByType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    console.log('\nSample alerts:');
    insertedAlerts.slice(0, 5).forEach((alert, index) => {
      console.log(`${index + 1}. ${alert.title} (${alert.city}) - Confidence: ${alert.confidence} - Date: ${alert.startDate.toISOString().split('T')[0]}`);
    });

  } catch (error) {
    console.error('Error seeding alerts:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the seeding function
seedAlerts();
