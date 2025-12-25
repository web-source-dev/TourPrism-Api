import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Alert from "../models/Alert.js";
import User from "../models/User.js";
import {
  ALERT_MAIN_TYPES,
  ALERT_SUB_TYPES,
  ALERT_STATUSES,
  ALERT_TONES,
  ALERT_SECTORS,
  CONFIDENCE_SOURCE_TYPES,
  CITIES
} from "../config/constants.js";

// Sample disruption data
const disruptionTemplates = [
  {
    mainType: 'strike',
    subType: 'airline_pilot',
    title: 'Ryanair Pilot Strike at Edinburgh Airport',
    summary: 'Ryanair pilots have announced strike action affecting flights from Edinburgh Airport. Multiple European routes cancelled.',
    sectors: ['Airlines', 'Transportation', 'Travel'],
    recoveryExpected: '2-7 days'
  },
  {
    mainType: 'weather',
    subType: 'snow',
    title: 'Heavy Snowfall Disrupts Edinburgh Transport',
    summary: 'Severe winter weather conditions causing road closures and flight delays across Edinburgh and surrounding areas.',
    sectors: ['Airlines', 'Transportation', 'Hospitality'],
    recoveryExpected: '1-3 days'
  },
  {
    mainType: 'protest',
    subType: 'demonstration',
    title: 'City Center Protest Blocks Key Routes',
    summary: 'Large-scale demonstration in Edinburgh city center causing significant traffic disruptions and route closures.',
    sectors: ['Transportation', 'Business Travel'],
    recoveryExpected: '1-2 days'
  },
  {
    mainType: 'flight_issues',
    subType: 'delay',
    title: 'London Heathrow Air Traffic Control Issues',
    summary: 'Technical problems with air traffic control systems causing widespread delays at London Heathrow Airport.',
    sectors: ['Airlines', 'Transportation', 'Travel'],
    recoveryExpected: 'Hours to 1 day'
  },
  {
    mainType: 'staff_shortage',
    subType: 'airport_check_in',
    title: 'Staff Shortages at Edinburgh Airport Check-in',
    summary: 'Reduced staffing levels at Edinburgh Airport causing long queues and check-in delays for passengers.',
    sectors: ['Airlines', 'Transportation'],
    recoveryExpected: '3-7 days'
  },
  {
    mainType: 'supply_chain',
    subType: 'jet_fuel_shortage',
    title: 'Jet Fuel Supply Issues Affecting London Flights',
    summary: 'Temporary fuel supply disruptions impacting flight operations at London airports.',
    sectors: ['Airlines', 'Transportation'],
    recoveryExpected: '3-10 days'
  },
  {
    mainType: 'system_failure',
    subType: 'booking_system_down',
    title: 'Online Booking System Outage',
    summary: 'Technical issues with major airline booking systems affecting online reservations and check-ins.',
    sectors: ['Airlines', 'Technology', 'Travel'],
    recoveryExpected: '1-24 hours'
  },
  {
    mainType: 'policy',
    subType: 'visa_change',
    title: 'Updated Visa Requirements for EU Travelers',
    summary: 'Changes to visa requirements affecting European travelers to the UK, causing confusion and delays.',
    sectors: ['Travel', 'Tourism', 'International Business'],
    recoveryExpected: 'Variable'
  }
];

// Generate realistic dates
const generateRandomDate = (daysFromNow = 30) => {
  const now = new Date();
  const futureDate = new Date(now.getTime() + Math.random() * daysFromNow * 24 * 60 * 60 * 1000);
  return futureDate.toISOString().split('T')[0]; // YYYY-MM-DD format
};

// Generate confidence sources
const generateConfidenceSources = (mainType) => {
  const sources = [];
  const numSources = Math.floor(Math.random() * 3) + 1; // 1-3 sources

  for (let i = 0; i < numSources; i++) {
    const sourceType = CONFIDENCE_SOURCE_TYPES[Math.floor(Math.random() * CONFIDENCE_SOURCE_TYPES.length)];
    const confidence = Math.random() * 0.5 + 0.5; // 0.5-1.0

    sources.push({
      source: `Source ${i + 1}`,
      type: sourceType,
      confidence: Math.round(confidence * 100) / 100,
      url: `https://example.com/source${i + 1}`,
      title: `Article ${i + 1} about ${mainType}`,
      publishedAt: new Date()
    });
  }

  return sources;
};

// Fixed dates for all alerts
const FIXED_START_DATE = new Date("2025-12-05T00:00:00Z");
const FIXED_END_DATE = new Date("2025-12-30T23:59:59Z");


// Create sample alerts
const createSampleAlerts = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log("Connected to MongoDB");

    // Get or create a user
    let user = await User.findOne();
    if (!user) {
      console.log("No user found, creating a test user...");
      user = await User.create({
        email: "test@tourprism.com",
        firstName: "Test",
        lastName: "User",
        isVerified: true,
        role: "user",
        status: "active"
      });
      console.log("Created test user:", user._id);
    } else {
      console.log("Using existing user:", user._id);
    }

    // Clear existing alerts (optional - comment out if you want to keep existing)
    await Alert.deleteMany({});
    console.log("Cleared existing alerts");

    // Create alerts from disruption templates
    const alerts = [];
    let alertIndex = 0;

    for (const template of disruptionTemplates) {
      for (const city of CITIES) {
        const confidenceSources = generateConfidenceSources(template.mainType);
        const totalConfidence = confidenceSources.reduce((sum, source) => sum + source.confidence, 0) / confidenceSources.length;
        const status = totalConfidence >= 0.6 ? 'approved' : 'pending';

        const alert = {
          city: city,
          mainType: template.mainType,
          subType: template.subType,
          title: template.title.replace('Edinburgh', city).replace('London', city),
          summary: template.summary.replace('Edinburgh', city).replace('London', city),
          startDate: FIXED_START_DATE,
          endDate: FIXED_END_DATE,
          source: 'TourPrism Alert System',
          url: `https://tourprism.com/alerts/${alertIndex + 1}`,
          confidence: Math.round(totalConfidence * 100) / 100,
          confidenceSources: confidenceSources,
          status: status,
          sectors: template.sectors,
          recoveryExpected: template.recoveryExpected,
          tone: ALERT_TONES[Math.floor(Math.random() * ALERT_TONES.length)],
          header: template.title.replace('Edinburgh', city).replace('London', city),
          originCity: city,
          roomsAtRisk: Math.floor(Math.random() * 100) + 10,
          revenueAtRisk: Math.floor(Math.random() * 50000) + 5000,
          recoveryRate: Math.random() * 0.3 + 0.4, // 0.4-0.7
          roomsSaved: 0,
          revenueSaved: 0
        };

        alerts.push(alert);
        alertIndex++;
      }
    }

    // Insert alerts
    const createdAlerts = await Alert.insertMany(alerts);
    console.log(`\n✅ Successfully created ${createdAlerts.length} alerts:`);
    
    createdAlerts.forEach((alert, index) => {
      console.log(`${index + 1}. ${alert.title} - ${alert.city} (${alert.status})`);
    });

    console.log("\n✨ Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding alerts:", error);
    process.exit(1);
  }
};

// Run the script
createSampleAlerts();

