import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Alert from '../models/Alert.js';
import User from '../models/User.js';
import connectDB from '../config/db.js';

/**
 * This script creates test alerts with different combinations of factors 
 * that affect the impact score calculation:
 * 
 * 1. Urgency (based on start time) - weighted x4
 * 2. Duration (event length) - weighted x3
 * 3. Severity (impact level) - weighted x2
 * 4. Recency (when posted) - weighted x1
 */

// Connect to database
await connectDB();
console.log('Connected to database');

// Find or create a test user for alerts
const findOrCreateTestUser = async () => {
  const existingUser = await User.findOne({ email: 'test-alerts@example.com' });
  
  if (existingUser) {
    console.log('Using existing test user');
    return existingUser;
  }
  
  console.log('Creating new test user');
  const newUser = new User({
    email: 'test-alerts@example.com',
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
    isVerified: true
  });
  
  await newUser.save();
  return newUser;
};

// Delete existing test alerts
const clearExistingAlerts = async (userId) => {
  console.log('Clearing existing test alerts...');
  await Alert.deleteMany({ 
    title: { $regex: 'Test Alert -' },
    userId 
  });
};

// Generate date based on relative days from now
const getDateFromNow = (days, hours = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  if (hours !== 0) {
    date.setHours(date.getHours() + hours);
  }
  return date;
};

// Alert type mappings from create alert page
const ALERT_TYPE_MAP = {
  "Industrial Action": ["Strike", "Work-to-Rule", "Labor Dispute", "Other"],
  "Extreme Weather": ["Storm", "Flooding", "Heatwave", "Wildfire", "Snow", "Other"],
  "Infrastructure Failures": ["Power Outage", "IT & System Failure", "Transport Service Suspension", "Road, Rail & Tram Closure", "Repairs or Delays", "Other"],
  "Public Safety Incidents": ["Protest", "Crime", "Terror Threats", "Travel Advisory", "Other"],
  "Festivals and Events": ["Citywide Festival", "Sporting Event", "Concerts and Stadium Events", "Parades and Ceremonies", "Other"],
  "Transportation": ["Delay", "Cancellation", "Disruption", "Other"],
  "Health": ["Outbreak", "Advisory", "Warning", "Other"],
  "Civil Unrest": ["Protest", "Riot", "Demonstration", "Other"]
};

// Creates alerts with different combinations of factors
const createTestAlerts = async (userId) => {
  const now = new Date();
  
  // Alert definitions with various properties to test impact scoring
  const alertDefinitions = [
    // Highest possible score alert - all factors max
    {
      title: "Test Alert - Highest Score",
      description: "Starts within 24h, 5 day duration, severe impact, posted today",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Extreme Weather",
      alertType: "Storm",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Tourists", "Residents", "Business Travelers"],
      linkToSource: "https://www.metoffice.gov.uk/weather/warnings-and-advice",
      expectedStart: getDateFromNow(1), // Starting tomorrow
      expectedEnd: getDateFromNow(6),   // 5-day duration
      createdAt: now,                   // Posted today
    },
    
    // High urgency (starts soon) but lower severity
    {
      title: "Test Alert - High Urgency, Low Severity",
      description: "Starts within 24h, 1 day duration, minor impact, posted today",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Transportation",
      alertType: "Disruption",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Commuters", "Tourists"],
      linkToSource: "https://www.scotrail.co.uk/disruption-updates",
      expectedStart: getDateFromNow(1), // Starting tomorrow
      expectedEnd: getDateFromNow(2),   // 1-day duration
      createdAt: now,                   // Posted today
    },
    
    // Longer notice (less urgent) but severe
    {
      title: "Test Alert - Low Urgency, High Severity",
      description: "Starts in 5 days, 3 day duration, severe impact, posted today",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Civil Unrest",
      alertType: "Protest",
      impact: "Severe",
      risk: "High",
      priority: "Important",
      targetAudience: ["Residents", "Tourists", "Business Travelers"],
      linkToSource: "https://www.met.police.uk/notices/",
      expectedStart: getDateFromNow(5), // Starts in 5 days
      expectedEnd: getDateFromNow(8),   // 3-day duration
      createdAt: now,                   // Posted today
    },
    
    // Already started (ongoing)
    {
      title: "Test Alert - Ongoing Event",
      description: "Already started (yesterday), long duration, moderate impact, posted 2 days ago",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Infrastructure Failures",
      alertType: "Repairs or Delays",
      impact: "Moderate",
      risk: "Medium",
      priority: "Standard",
      targetAudience: ["Residents", "Commuters"],
      linkToSource: "https://www.manchestereveningnews.co.uk/news/",
      expectedStart: getDateFromNow(-1), // Started yesterday
      expectedEnd: getDateFromNow(4),    // Ends in 4 days
      createdAt: getDateFromNow(-2),     // Posted 2 days ago
    },
    
    // Old post for upcoming event
    {
      title: "Test Alert - Old Post, Upcoming Event",
      description: "Starts in 2 days, moderate impact, posted 5 days ago",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Public Safety Incidents",
      alertType: "Travel Advisory",
      impact: "Moderate",
      risk: "Medium",
      priority: "Standard",
      targetAudience: ["Tourists", "Business Travelers"],
      linkToSource: "https://www.edinburgh.gov.uk/public-safety",
      expectedStart: getDateFromNow(2),  // Starts in 2 days
      expectedEnd: getDateFromNow(3),    // 1-day duration
      createdAt: getDateFromNow(-5),     // Posted 5 days ago
    },
    
    // Recent post for far future event
    {
      title: "Test Alert - Recent Post, Future Event",
      description: "Starts in 6 days, long duration, severe impact, posted today",
      originCity: "Stirling",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJA-VcbB_Eh0gRHXn3XbLwhcw",
      originLatitude: 56.1165, 
      originLongitude: -3.9369,
      alertCategory: "Extreme Weather",
      alertType: "Flooding",
      impact: "Severe",
      risk: "High",
      priority: "Important",
      targetAudience: ["Residents", "Tourists", "Business Travelers"],
      linkToSource: "https://www.sepa.org.uk/flooding/",
      expectedStart: getDateFromNow(6),  // Starts in 6 days
      expectedEnd: getDateFromNow(10),   // 4-day duration
      createdAt: now,                    // Posted today
    },
    
    // Almost ended event
    {
      title: "Test Alert - Almost Ended",
      description: "Started 2 days ago, ends tomorrow, minor impact, posted 3 days ago",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Festivals and Events",
      alertType: "Citywide Festival",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Tourists", "Residents"],
      linkToSource: "https://www.glasgowlife.org.uk/events",
      expectedStart: getDateFromNow(-2), // Started 2 days ago
      expectedEnd: getDateFromNow(1),    // Ends tomorrow
      createdAt: getDateFromNow(-3),     // Posted 3 days ago
    },
    
    // Expired event (should be excluded from results)
    {
      title: "Test Alert - Expired Event",
      description: "Started 5 days ago, ended yesterday, severe impact, posted 6 days ago",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Civil Unrest",
      alertType: "Demonstration",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Tourists", "Business Travelers"],
      linkToSource: "https://www.met.police.uk/notices/",
      expectedStart: getDateFromNow(-5), // Started 5 days ago
      expectedEnd: getDateFromNow(-1),   // Ended yesterday
      createdAt: getDateFromNow(-6),     // Posted 6 days ago
    },
    
    // Medium all around
    {
      title: "Test Alert - Medium All Factors",
      description: "Starts in 2 days, 2 day duration, moderate impact, posted yesterday",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Transportation",
      alertType: "Delay",
      impact: "Moderate",
      risk: "Medium",
      priority: "Standard",
      targetAudience: ["Commuters", "Tourists"],
      linkToSource: "https://tfgm.com/travel-updates",
      expectedStart: getDateFromNow(2),  // Starts in 2 days
      expectedEnd: getDateFromNow(4),    // 2-day duration
      createdAt: getDateFromNow(-1),     // Posted yesterday
    },
    
    // Very long duration event
    {
      title: "Test Alert - Very Long Duration",
      description: "Starts in 3 days, 10 day duration, moderate impact, posted today",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Public Safety Incidents",
      alertType: "Travel Advisory",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Tourists", "Residents", "Business Travelers"],
      linkToSource: "https://www.edinburgh.gov.uk/public-safety",
      expectedStart: getDateFromNow(3),  // Starts in 3 days
      expectedEnd: getDateFromNow(13),   // 10-day duration
      createdAt: now,                    // Posted today
    },
    
    // EXPANDED TESTS - Additional alerts for more combinations
    
    // Immediate starting event
    {
      title: "Test Alert - Immediate Start",
      description: "Starts today, 1 day duration, moderate impact, posted yesterday",
      originCity: "Stirling",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJA-VcbB_Eh0gRHXn3XbLwhcw",
      originLatitude: 56.1165, 
      originLongitude: -3.9369,
      alertCategory: "Public Safety Incidents",
      alertType: "Crime",
      impact: "Moderate",
      risk: "Medium",
      priority: "Urgent",
      targetAudience: ["Residents", "Tourists"],
      linkToSource: "https://www.scotland.police.uk/your-community/forth-valley/",
      expectedStart: getDateFromNow(0), // Starts today
      expectedEnd: getDateFromNow(1),   // 1-day duration
      createdAt: getDateFromNow(-1),    // Posted yesterday
    },
    
    // Longer duration but starting soon
    {
      title: "Test Alert - Soon Start, Long Duration",
      description: "Starts tomorrow, 7 day duration, moderate impact, posted today",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Infrastructure Failures",
      alertType: "Road, Rail & Tram Closure",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Commuters", "Residents", "Business Travelers"],
      linkToSource: "https://tfgm.com/travel-updates",
      expectedStart: getDateFromNow(1), // Starts tomorrow
      expectedEnd: getDateFromNow(8),   // 7-day duration
      createdAt: now,                   // Posted today
    },
    
    // Maximum urgency (starts today) and severe
    {
      title: "Test Alert - Maximum Urgency and Severity",
      description: "Starts today, 3 day duration, severe impact, posted today",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Civil Unrest",
      alertType: "Riot",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Tourists", "Business Travelers"],
      linkToSource: "https://www.met.police.uk/notices/",
      expectedStart: getDateFromNow(0), // Starts today
      expectedEnd: getDateFromNow(3),   // 3-day duration
      createdAt: now,                   // Posted today
    },
    
    // Long since posted but very urgent
    {
      title: "Test Alert - Old Post but Urgent",
      description: "Starts tomorrow, 2 day duration, severe impact, posted 7 days ago",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Health",
      alertType: "Warning",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Tourists", "Healthcare Workers"],
      linkToSource: "https://www.nhsinform.scot/",
      expectedStart: getDateFromNow(1),  // Starts tomorrow
      expectedEnd: getDateFromNow(3),    // 2-day duration
      createdAt: getDateFromNow(-7),     // Posted 7 days ago
    },
    
    // Very short but urgent and severe
    {
      title: "Test Alert - Short but Urgent and Severe",
      description: "Starts tomorrow, 12-hour duration, severe impact, posted today",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Extreme Weather",
      alertType: "Snow",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Commuters", "Tourists"],
      linkToSource: "https://www.metoffice.gov.uk/weather/warnings-and-advice",
      expectedStart: getDateFromNow(1),                   // Starts tomorrow
      expectedEnd: new Date(getDateFromNow(1).getTime() + 12*60*60*1000), // 12-hour duration
      createdAt: now,                                    // Posted today
    },
    
    // Medium urgency, high severity, recently posted
    {
      title: "Test Alert - Medium Urgency, High Severity",
      description: "Starts in 2 days, 3 day duration, severe impact, posted today",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Public Safety Incidents",
      alertType: "Terror Threats",
      impact: "Severe",
      risk: "High",
      priority: "Important",
      targetAudience: ["Residents", "Tourists", "Business Travelers"],
      linkToSource: "https://www.met.police.uk/advice/advice-and-information/t/terrorism-in-the-uk/",
      expectedStart: getDateFromNow(2),  // Starts in 2 days
      expectedEnd: getDateFromNow(5),    // 3-day duration
      createdAt: now,                    // Posted today
    },
    
    // Medium urgency, low severity, recently posted
    {
      title: "Test Alert - Medium Urgency, Low Severity 2",
      description: "Starts in 2 days, 3 day duration, minor impact, posted today",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Festivals and Events",
      alertType: "Concerts and Stadium Events",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Tourists", "Residents"],
      linkToSource: "https://www.edinburghfestivalcity.com/",
      expectedStart: getDateFromNow(2),  // Starts in 2 days
      expectedEnd: getDateFromNow(5),    // 3-day duration
      createdAt: now,                    // Posted today
    },
    
    // Low urgency, high severity, recently posted
    {
      title: "Test Alert - Low Urgency, High Severity 2",
      description: "Starts in 6 days, 1 day duration, severe impact, posted today",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Civil Unrest",
      alertType: "Protest",
      impact: "Severe",
      risk: "High",
      priority: "Important",
      targetAudience: ["Residents", "Commuters", "Business Travelers"],
      linkToSource: "https://www.gmp.police.uk/notices/",
      expectedStart: getDateFromNow(6),  // Starts in 6 days
      expectedEnd: getDateFromNow(7),    // 1-day duration
      createdAt: now,                    // Posted today
    },
    
    // High urgency, medium severity, old post
    {
      title: "Test Alert - High Urgency, Medium Severity, Old",
      description: "Starts tomorrow, 2 day duration, moderate impact, posted 5 days ago",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Infrastructure Failures",
      alertType: "Power Outage",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Residents", "Business Owners"],
      linkToSource: "https://www.spenergynetworks.co.uk/pages/power_cuts.aspx",
      expectedStart: getDateFromNow(1),  // Starts tomorrow
      expectedEnd: getDateFromNow(3),    // 2-day duration
      createdAt: getDateFromNow(-5),     // Posted 5 days ago
    },
    
    // Started today but very short-lived
    {
      title: "Test Alert - Started Today, Short-lived",
      description: "Started today, ends today, minor impact, posted yesterday",
      originCity: "Stirling",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJA-VcbB_Eh0gRHXn3XbLwhcw",
      originLatitude: 56.1165, 
      originLongitude: -3.9369,
      alertCategory: "Transportation",
      alertType: "Cancellation",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Commuters", "Tourists"],
      linkToSource: "https://www.scotrail.co.uk/disruption-updates",
      expectedStart: getDateFromNow(0),                   // Started today
      expectedEnd: new Date(now.getTime() + 6*60*60*1000), // Ends in 6 hours
      createdAt: getDateFromNow(-1),                     // Posted yesterday
    },
    
    // Recently ongoing (started today)
    {
      title: "Test Alert - Just Started, Long Duration",
      description: "Started today, 7 day duration, moderate impact, posted yesterday",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Health",
      alertType: "Advisory",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Residents", "Tourists", "Healthcare Workers"],
      linkToSource: "https://www.nhs.uk/conditions/",
      expectedStart: getDateFromNow(0), // Started today
      expectedEnd: getDateFromNow(7),   // 7-day duration
      createdAt: getDateFromNow(-1),    // Posted yesterday
    },
    
    // Very low urgency, medium severity, recent post
    {
      title: "Test Alert - Very Low Urgency, Medium Severity",
      description: "Starts in 10 days, 2 day duration, moderate impact, posted today",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Public Safety Incidents",
      alertType: "Other",
      impact: "Moderate",
      risk: "Medium",
      priority: "Standard",
      targetAudience: ["Residents", "Tourists"],
      linkToSource: "https://www.gmp.police.uk/notices/",
      expectedStart: getDateFromNow(10), // Starts in 10 days
      expectedEnd: getDateFromNow(12),   // 2-day duration
      createdAt: now,                    // Posted today
    },
    
    // Edge case: Starts today, very long duration, moderate impact, old post
    {
      title: "Test Alert - Start Today, Very Long Duration, Old",
      description: "Starts today, 14 day duration, moderate impact, posted 10 days ago",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Transportation",
      alertType: "Disruption",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Commuters", "Tourists", "Residents"],
      linkToSource: "https://www.scotrail.co.uk/disruption-updates",
      expectedStart: getDateFromNow(0),  // Starts today
      expectedEnd: getDateFromNow(14),   // 14-day duration
      createdAt: getDateFromNow(-10),    // Posted 10 days ago
    },
    
    // Edge case: Near future with extreme duration
    {
      title: "Test Alert - Near Future, Extreme Duration",
      description: "Starts in 2 days, 30 day duration, severe impact, posted today",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Health",
      alertType: "Outbreak",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Tourists", "Healthcare Workers"],
      linkToSource: "https://www.nhsinform.scot/illnesses-and-conditions/",
      expectedStart: getDateFromNow(2),  // Starts in 2 days
      expectedEnd: getDateFromNow(32),   // 30-day duration
      createdAt: now,                    // Posted today
    },
    
    // Different time on the same day
    {
      title: "Test Alert - Later Today",
      description: "Starts later today, 1 day duration, moderate impact, posted today",
      originCity: "Stirling",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJA-VcbB_Eh0gRHXn3XbLwhcw",
      originLatitude: 56.1165, 
      originLongitude: -3.9369,
      alertCategory: "Festivals and Events",
      alertType: "Sporting Event",
      impact: "Moderate",
      risk: "Medium",
      priority: "Standard",
      targetAudience: ["Tourists", "Residents"],
      linkToSource: "https://www.stirling.gov.uk/events/",
      expectedStart: new Date(now.getTime() + 8*60*60*1000), // 8 hours from now
      expectedEnd: getDateFromNow(1),   // Ends tomorrow
      createdAt: now,                   // Posted today
    },
    
    // Edge case: Almost starting (within hours)
    {
      title: "Test Alert - Starting Very Soon",
      description: "Starts in 2 hours, 4 hour duration, severe impact, posted just now",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Extreme Weather",
      alertType: "Storm",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Commuters", "Tourists"],
      linkToSource: "https://www.metoffice.gov.uk/weather/warnings-and-advice",
      expectedStart: new Date(now.getTime() + 2*60*60*1000), // 2 hours from now
      expectedEnd: new Date(now.getTime() + 6*60*60*1000),   // 6 hours from now
      createdAt: now,                                       // Posted just now
    },
    
    // Low severity but extremely urgent
    {
      title: "Test Alert - About to Start, Low Severity",
      description: "Starts in 30 minutes, 2 hour duration, minor impact, posted just now",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Transportation",
      alertType: "Delay",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Commuters"],
      linkToSource: "https://tfgm.com/travel-updates",
      expectedStart: new Date(now.getTime() + 30*60*1000),  // 30 minutes from now
      expectedEnd: new Date(now.getTime() + 150*60*1000),   // 2.5 hours from now
      createdAt: now,                                      // Posted just now
    },
    
    // Just posted about an event starting a bit later
    {
      title: "Test Alert - Just Posted, Starting Soon",
      description: "Starts in 12 hours, 1 day duration, severe impact, posted just now",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Civil Unrest",
      alertType: "Demonstration",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Commuters", "Business Travelers"],
      linkToSource: "https://www.scotland.police.uk/your-community/greater-glasgow/",
      expectedStart: new Date(now.getTime() + 12*60*60*1000), // 12 hours from now
      expectedEnd: new Date(now.getTime() + 36*60*60*1000),   // 36 hours from now
      createdAt: now,                                        // Posted just now
    },
    
    // Ends very soon (within hours), already started
    {
      title: "Test Alert - Ending Very Soon",
      description: "Started 2 days ago, ends in 4 hours, moderate impact, posted 3 days ago",
      originCity: "Stirling",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJA-VcbB_Eh0gRHXn3XbLwhcw",
      originLatitude: 56.1165, 
      originLongitude: -3.9369,
      alertCategory: "Festivals and Events",
      alertType: "Parades and Ceremonies",
      impact: "Moderate",
      risk: "Medium",
      priority: "Standard",
      targetAudience: ["Residents", "Tourists"],
      linkToSource: "https://www.stirling.gov.uk/events/",
      expectedStart: getDateFromNow(-2),                     // Started 2 days ago
      expectedEnd: new Date(now.getTime() + 4*60*60*1000),   // Ends in 4 hours
      createdAt: getDateFromNow(-3),                        // Posted 3 days ago
    },
    
    // About to end but severe
    {
      title: "Test Alert - About to End but Severe",
      description: "Started 3 days ago, ends today, severe impact, posted 4 days ago",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Public Safety Incidents",
      alertType: "Terror Threats",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Tourists", "Business Travelers"],
      linkToSource: "https://www.met.police.uk/advice/advice-and-information/t/terrorism-in-the-uk/",
      expectedStart: getDateFromNow(-3),                     // Started 3 days ago
      expectedEnd: new Date(now.getTime() + 5*60*60*1000),   // Ends in 5 hours
      createdAt: getDateFromNow(-4),                        // Posted 4 days ago
    },

    // Additional alerts to reach at least 30 total
    {
      title: "Test Alert - Multi-Day Festival",
      description: "Starts in 3 days, 5 day duration, moderate impact, posted 2 days ago",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Festivals and Events",
      alertType: "Citywide Festival",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Tourists", "Residents", "Business Travelers"],
      linkToSource: "https://www.edinburghfestivalcity.com/",
      expectedStart: getDateFromNow(3),  // Starts in 3 days
      expectedEnd: getDateFromNow(8),    // 5-day duration
      createdAt: getDateFromNow(-2),     // Posted 2 days ago
    },
    
    {
      title: "Test Alert - Routine Maintenance",
      description: "Starts in 4 days, 1 day duration, minor impact, posted yesterday",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Transportation",
      alertType: "Other",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Commuters"],
      linkToSource: "https://tfgm.com/travel-updates",
      expectedStart: getDateFromNow(4),  // Starts in 4 days
      expectedEnd: getDateFromNow(5),    // 1-day duration
      createdAt: getDateFromNow(-1),     // Posted yesterday
    },
    
    {
      title: "Test Alert - Medium Urgency, Medium Duration",
      description: "Starts in 2 days, 4 day duration, moderate impact, posted 3 days ago",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Infrastructure Failures",
      alertType: "IT & System Failure",
      impact: "Moderate",
      risk: "Medium",
      priority: "Standard",
      targetAudience: ["Residents", "Business Owners"],
      linkToSource: "https://www.glasgow.gov.uk/serviceupdates",
      expectedStart: getDateFromNow(2),  // Starts in 2 days
      expectedEnd: getDateFromNow(6),    // 4-day duration
      createdAt: getDateFromNow(-3),     // Posted 3 days ago
    },
    
    {
      title: "Test Alert - High Priority Event",
      description: "Starts tomorrow, 3 day duration, severe impact, posted 6 hours ago",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Public Safety Incidents",
      alertType: "Protest",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Commuters", "Business Travelers"],
      linkToSource: "https://www.met.police.uk/notices/",
      expectedStart: getDateFromNow(1),                     // Starts tomorrow
      expectedEnd: getDateFromNow(4),                       // 3-day duration
      createdAt: new Date(now.getTime() - 6*60*60*1000),    // Posted 6 hours ago
    },
    
    {
      title: "Test Alert - Low Impact Festival",
      description: "Starts in 5 days, 2 day duration, minor impact, posted today",
      originCity: "Stirling",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJA-VcbB_Eh0gRHXn3XbLwhcw",
      originLatitude: 56.1165, 
      originLongitude: -3.9369,
      alertCategory: "Festivals and Events",
      alertType: "Other",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Tourists", "Residents"],
      linkToSource: "https://www.stirling.gov.uk/events/",
      expectedStart: getDateFromNow(5),  // Starts in 5 days
      expectedEnd: getDateFromNow(7),    // 2-day duration
      createdAt: now,                    // Posted today
    },
    
    {
      title: "Test Alert - Urgent Health Advisory",
      description: "Starting today, 7 day duration, severe impact, posted yesterday",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Health",
      alertType: "Warning",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Healthcare Workers", "Tourists"],
      linkToSource: "https://www.nhsinform.scot/",
      expectedStart: getDateFromNow(0),  // Starts today
      expectedEnd: getDateFromNow(7),    // 7-day duration
      createdAt: getDateFromNow(-1),     // Posted yesterday
    },
    
    // Additional 15 alerts for the 5 locations
    
    // Edinburgh alerts
    {
      title: "Test Alert - Edinburgh Festival Road Closures",
      description: "Multiple road closures in central Edinburgh due to summer festival events",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Festivals and Events",
      alertType: "Citywide Festival",
      impact: "Moderate",
      risk: "Medium",
      priority: "Standard",
      targetAudience: ["Residents", "Tourists", "Business Travelers"],
      linkToSource: "https://www.edinburghfestivalcity.com/",
      expectedStart: getDateFromNow(1),  // Starts tomorrow
      expectedEnd: getDateFromNow(14),   // 14-day duration
      createdAt: now,                    // Posted today
    },
    {
      title: "Test Alert - Edinburgh Tram Works",
      description: "Tram extension works causing significant disruption on Leith Walk",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Infrastructure Failures",
      alertType: "Road, Rail & Tram Closure",
      impact: "Severe",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Residents", "Commuters", "Business Travelers"],
      linkToSource: "https://edinburghtrams.com/",
      expectedStart: getDateFromNow(0),  // Started today
      expectedEnd: getDateFromNow(21),   // 21-day duration
      createdAt: getDateFromNow(-2),     // Posted 2 days ago
    },
    {
      title: "Test Alert - Edinburgh Castle Special Exhibition",
      description: "Increased visitor numbers expected at Edinburgh Castle due to special exhibition",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Festivals and Events",
      alertType: "Other",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Tourists", "Residents"],
      linkToSource: "https://www.edinburghcastle.scot/",
      expectedStart: getDateFromNow(3),  // Starts in 3 days
      expectedEnd: getDateFromNow(33),   // 30-day duration
      createdAt: now,                    // Posted today
    },
    
    // Glasgow alerts
    {
      title: "Test Alert - Glasgow Underground Maintenance",
      description: "Weekend closure of Glasgow Subway for essential maintenance",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Transportation",
      alertType: "Disruption",
      impact: "Moderate",
      risk: "Medium",
      priority: "Standard",
      targetAudience: ["Residents", "Commuters", "Tourists"],
      linkToSource: "https://www.spt.co.uk/subway/",
      expectedStart: getDateFromNow(2),  // Starts in 2 days
      expectedEnd: getDateFromNow(4),    // 2-day duration
      createdAt: getDateFromNow(-1),     // Posted yesterday
    },
    {
      title: "Test Alert - Glasgow Concert Crowd Management",
      description: "Major concert at the Hydro - expect significant crowds and traffic disruption",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Festivals and Events",
      alertType: "Concerts and Stadium Events",
      impact: "Moderate",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Residents", "Tourists"],
      linkToSource: "https://www.sec.co.uk/",
      expectedStart: getDateFromNow(5),  // Starts in 5 days
      expectedEnd: getDateFromNow(5),    // 1-day duration
      createdAt: now,                    // Posted today
    },
    {
      title: "Test Alert - Glasgow Water Supply Interruption",
      description: "Planned water supply interruption in West End for infrastructure upgrades",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Infrastructure Failures",
      alertType: "Other",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Residents", "Business Owners"],
      linkToSource: "https://www.scottishwater.co.uk/",
      expectedStart: getDateFromNow(1),  // Starts tomorrow
      expectedEnd: getDateFromNow(2),    // 1-day duration
      createdAt: getDateFromNow(0),      // Posted today
    },
    
    // London alerts
    {
      title: "Test Alert - London Tube Strike",
      description: "Planned tube strike affecting all London Underground services",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Industrial Action",
      alertType: "Strike",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Commuters", "Tourists", "Business Travelers"],
      linkToSource: "https://tfl.gov.uk/",
      expectedStart: getDateFromNow(3),  // Starts in 3 days
      expectedEnd: getDateFromNow(5),    // 2-day duration
      createdAt: getDateFromNow(-1),     // Posted yesterday
    },
    {
      title: "Test Alert - London Marathon Road Closures",
      description: "Extensive road closures across central London for annual marathon",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Festivals and Events",
      alertType: "Sporting Event",
      impact: "Moderate",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Residents", "Tourists", "Business Travelers"],
      linkToSource: "https://www.londonmarathon.org/",
      expectedStart: getDateFromNow(7),  // Starts in 7 days
      expectedEnd: getDateFromNow(7),    // 1-day duration
      createdAt: getDateFromNow(-5),     // Posted 5 days ago
    },
    {
      title: "Test Alert - London Thames Flood Warning",
      description: "Flood warning in effect for areas near the River Thames due to high tides",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Extreme Weather",
      alertType: "Flooding",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Business Owners"],
      linkToSource: "https://www.gov.uk/government/organisations/environment-agency",
      expectedStart: getDateFromNow(0),  // Starting today
      expectedEnd: getDateFromNow(2),    // 2-day duration
      createdAt: new Date(now.getTime() - 3*60*60*1000), // Posted 3 hours ago
    },
    
    // Manchester alerts
    {
      title: "Test Alert - Manchester Football Match",
      description: "Major football match at Old Trafford - expect heavy traffic and crowding",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Festivals and Events",
      alertType: "Sporting Event",
      impact: "Moderate",
      risk: "Medium",
      priority: "Standard",
      targetAudience: ["Residents", "Tourists"],
      linkToSource: "https://www.manutd.com/",
      expectedStart: getDateFromNow(2),  // Starts in 2 days
      expectedEnd: getDateFromNow(2),    // 1-day duration
      createdAt: getDateFromNow(-3),     // Posted 3 days ago
    },
    {
      title: "Test Alert - Manchester Piccadilly Station Works",
      description: "Reduced services at Manchester Piccadilly due to essential engineering works",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Transportation",
      alertType: "Disruption",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Commuters", "Tourists", "Business Travelers"],
      linkToSource: "https://www.nationalrail.co.uk/",
      expectedStart: getDateFromNow(4),  // Starts in 4 days
      expectedEnd: getDateFromNow(6),    // 2-day duration
      createdAt: now,                    // Posted today
    },
    {
      title: "Test Alert - Manchester City Center Demonstration",
      description: "Planned demonstration in Manchester City Center affecting traffic and businesses",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Civil Unrest",
      alertType: "Demonstration",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Residents", "Business Owners", "Tourists"],
      linkToSource: "https://www.gmp.police.uk/",
      expectedStart: getDateFromNow(1),  // Starts tomorrow
      expectedEnd: getDateFromNow(1),    // 1-day duration
      createdAt: getDateFromNow(0),      // Posted today
    },
    
    // Stirling alerts
    {
      title: "Test Alert - Stirling Highland Games",
      description: "Annual Highland Games event with increased visitor numbers to the city",
      originCity: "Stirling",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJA-VcbB_Eh0gRHXn3XbLwhcw",
      originLatitude: 56.1165, 
      originLongitude: -3.9369,
      alertCategory: "Festivals and Events",
      alertType: "Sporting Event",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Tourists", "Residents"],
      linkToSource: "https://www.stirlinghighlandgames.com/",
      expectedStart: getDateFromNow(10), // Starts in 10 days
      expectedEnd: getDateFromNow(10),   // 1-day duration
      createdAt: getDateFromNow(-2),     // Posted 2 days ago
    },
    {
      title: "Test Alert - Stirling Castle Temporary Closure",
      description: "Partial closure of Stirling Castle for maintenance and restoration work",
      originCity: "Stirling",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJA-VcbB_Eh0gRHXn3XbLwhcw",
      originLatitude: 56.1165, 
      originLongitude: -3.9369,
      alertCategory: "Infrastructure Failures",
      alertType: "Other",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Tourists"],
      linkToSource: "https://www.stirlingcastle.scot/",
      expectedStart: getDateFromNow(5),  // Starts in 5 days
      expectedEnd: getDateFromNow(19),   // 14-day duration
      createdAt: now,                    // Posted today
    },
    {
      title: "Test Alert - Stirling University Graduation",
      description: "Increased traffic and accommodation demand due to university graduation ceremonies",
      originCity: "Stirling",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJA-VcbB_Eh0gRHXn3XbLwhcw",
      originLatitude: 56.1165, 
      originLongitude: -3.9369,
      alertCategory: "Festivals and Events",
      alertType: "Other",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Residents", "Tourists", "Business Travelers"],
      linkToSource: "https://www.stir.ac.uk/",
      expectedStart: getDateFromNow(14), // Starts in 14 days
      expectedEnd: getDateFromNow(17),   // 3-day duration
      createdAt: getDateFromNow(-1),     // Posted yesterday
    },
    
    // Additional 10 more alerts with valid impact values
    
    // Edinburgh alerts
    {
      title: "Test Alert - Edinburgh Royal Mile Construction",
      description: "Road works and pedestrian diversions on the Royal Mile",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Infrastructure Failures",
      alertType: "Road, Rail & Tram Closure",
      impact: "Moderate",
      risk: "Medium",
      priority: "Standard",
      targetAudience: ["Residents", "Tourists", "Business Owners"],
      linkToSource: "https://www.edinburgh.gov.uk/roadworks",
      expectedStart: getDateFromNow(1),  // Starts tomorrow
      expectedEnd: getDateFromNow(8),    // 7-day duration
      createdAt: now,                    // Posted today
    },
    {
      title: "Test Alert - Edinburgh Airport Security Alert",
      description: "Enhanced security screening causing delays at Edinburgh Airport",
      originCity: "Edinburgh",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJIyaYpQC4h0gRJxfnfHsU8mQ",
      originLatitude: 55.9533, 
      originLongitude: -3.1883,
      alertCategory: "Public Safety Incidents",
      alertType: "Travel Advisory",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Tourists", "Business Travelers"],
      linkToSource: "https://www.edinburghairport.com/",
      expectedStart: getDateFromNow(0),  // Starting today
      expectedEnd: getDateFromNow(3),    // 3-day duration
      createdAt: new Date(now.getTime() - 2*60*60*1000), // Posted 2 hours ago
    },
    
    // Glasgow alerts
    {
      title: "Test Alert - Glasgow Severe Storm Warning",
      description: "Severe storm expected to hit Glasgow with potential for flooding and disruption",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Extreme Weather",
      alertType: "Storm",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Residents", "Tourists", "Business Owners"],
      linkToSource: "https://www.metoffice.gov.uk/",
      expectedStart: getDateFromNow(1),  // Starts tomorrow
      expectedEnd: getDateFromNow(2),    // 1-day duration
      createdAt: now,                    // Posted today
    },
    {
      title: "Test Alert - Glasgow School Holiday Traffic",
      description: "Increased traffic expected due to school holiday period",
      originCity: "Glasgow",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ685WIFYViEgRHlHvBbiD5nE",
      originLatitude: 55.8642, 
      originLongitude: -4.2518,
      alertCategory: "Transportation",
      alertType: "Disruption",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Residents", "Commuters"],
      linkToSource: "https://www.glasgow.gov.uk/",
      expectedStart: getDateFromNow(7),  // Starts in 7 days
      expectedEnd: getDateFromNow(21),   // 14-day duration
      createdAt: getDateFromNow(-3),     // Posted 3 days ago
    },
    
    // London alerts
    {
      title: "Test Alert - London Air Pollution Warning",
      description: "High levels of air pollution expected in central London",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Health",
      alertType: "Warning",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Residents", "Tourists", "Vulnerable Groups"],
      linkToSource: "https://www.london.gov.uk/what-we-do/environment/pollution-and-air-quality",
      expectedStart: getDateFromNow(0),  // Starting today
      expectedEnd: getDateFromNow(4),    // 4-day duration
      createdAt: getDateFromNow(-1),     // Posted yesterday
    },
    {
      title: "Test Alert - London West End Performance Cancellations",
      description: "Multiple West End shows canceled due to technical issues",
      originCity: "London",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      originLatitude: 51.5074, 
      originLongitude: -0.1278,
      alertCategory: "Festivals and Events",
      alertType: "Other",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Tourists"],
      linkToSource: "https://officiallondontheatre.com/",
      expectedStart: getDateFromNow(0),  // Starting today
      expectedEnd: getDateFromNow(2),    // 2-day duration
      createdAt: new Date(now.getTime() - 5*60*60*1000), // Posted 5 hours ago
    },
    
    // Manchester alerts
    {
      title: "Test Alert - Manchester Severe Traffic Incident",
      description: "Major traffic incident on M60 causing significant delays",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Transportation",
      alertType: "Disruption",
      impact: "Severe",
      risk: "High",
      priority: "Urgent",
      targetAudience: ["Commuters", "Residents", "Business Travelers"],
      linkToSource: "https://www.highways.gov.uk/",
      expectedStart: getDateFromNow(0),  // Starting today
      expectedEnd: getDateFromNow(0),    // Ending today
      createdAt: new Date(now.getTime() - 1*60*60*1000), // Posted 1 hour ago
    },
    {
      title: "Test Alert - Manchester Museum Special Exhibition",
      description: "Increased visitor numbers expected at Manchester Museum",
      originCity: "Manchester",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJ2_UmUkxNekgRqmv-BDgUvtk",
      originLatitude: 53.4808, 
      originLongitude: -2.2426,
      alertCategory: "Festivals and Events",
      alertType: "Other",
      impact: "Minor",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Tourists", "Residents"],
      linkToSource: "https://www.museum.manchester.ac.uk/",
      expectedStart: getDateFromNow(5),  // Starts in 5 days
      expectedEnd: getDateFromNow(35),   // 30-day duration
      createdAt: getDateFromNow(-2),     // Posted 2 days ago
    },
    
    // Stirling alerts
    {
      title: "Test Alert - Stirling Bridge Maintenance",
      description: "Essential maintenance work on Stirling Bridge causing traffic disruption",
      originCity: "Stirling",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJA-VcbB_Eh0gRHXn3XbLwhcw",
      originLatitude: 56.1165, 
      originLongitude: -3.9369,
      alertCategory: "Infrastructure Failures",
      alertType: "Road, Rail & Tram Closure",
      impact: "Moderate",
      risk: "Medium",
      priority: "Important",
      targetAudience: ["Residents", "Commuters", "Tourists"],
      linkToSource: "https://www.stirling.gov.uk/",
      expectedStart: getDateFromNow(3),  // Starts in 3 days
      expectedEnd: getDateFromNow(10),   // 7-day duration
      createdAt: getDateFromNow(0),      // Posted today
    },
    {
      title: "Test Alert - Stirling Hogmanay Celebrations",
      description: "Road closures and public transport changes for Hogmanay celebrations",
      originCity: "Stirling",
      originCountry: "United Kingdom",
      originPlaceId: "ChIJA-VcbB_Eh0gRHXn3XbLwhcw",
      originLatitude: 56.1165, 
      originLongitude: -3.9369,
      alertCategory: "Festivals and Events",
      alertType: "Citywide Festival",
      impact: "Moderate",
      risk: "Low",
      priority: "Standard",
      targetAudience: ["Residents", "Tourists"],
      linkToSource: "https://www.stirling.gov.uk/events",
      expectedStart: getDateFromNow(20), // Starts in 20 days
      expectedEnd: getDateFromNow(21),   // 1-day duration
      createdAt: getDateFromNow(-5),     // Posted 5 days ago
    }
  ];
  
  console.log(`Creating ${alertDefinitions.length} test alerts...`);
  
  // Create alerts
  const createdAlerts = [];
  for (const definition of alertDefinitions) {
    // Common fields for all alerts
    const alertData = {
      ...definition,
      userId,
      status: "approved",
      recommendedAction: "Please be aware and plan accordingly.",
      city: definition.originCity,      
      // Set proper geospatial fields
      originLocation: {
        type: 'Point',
        coordinates: [definition.originLongitude, definition.originLatitude]
      },
      // Also set the legacy location field for backward compatibility
      location: {
        type: 'Point',
        coordinates: [definition.originLongitude, definition.originLatitude]
      }
    };
    
    // Create and save the alert
    const alert = new Alert(alertData);
    await alert.save();
    createdAlerts.push(alert);
    
    console.log(`Created alert: ${definition.title}`);
  }
  
  return createdAlerts;
};

// Main execution function
const seedImpactAlerts = async () => {
  try {
    const user = await findOrCreateTestUser();
    await clearExistingAlerts(user._id);
    const alerts = await createTestAlerts(user._id);
    
    console.log('\nSuccessfully created test alerts:');
    console.log(`Total alerts created: ${alerts.length}`);
    
    console.log('\nYou can now test the impact scoring algorithm in the frontend.');
    
  } catch (error) {
    console.error('Error seeding test alerts:', error);
  } finally {
    // Disconnect from database
    await mongoose.disconnect();
    console.log('Disconnected from database');
    process.exit(0);
  }
};

// Run the seed function
seedImpactAlerts();