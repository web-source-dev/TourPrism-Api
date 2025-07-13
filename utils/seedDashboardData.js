import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { faker } from '@faker-js/faker';
import { startOfDay, subDays, addDays } from 'date-fns';
import bcrypt from 'bcryptjs';

// Import models
import Alert from '../models/Alert.js';
import User from '../models/User.js';
import Subscriber from '../models/subscribers.js';
import ActionHub from '../models/ActionHub.js';
import Logs from '../models/Logs.js';
import CompanyNames from '../models/companyNames.js';
import Notification from '../models/NotificationSys.js';
import Summary from '../models/Summary.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully.');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Constants
const CITIES = ['Edinburgh', 'Glasgow', 'Stirling', 'Manchester', 'London'];
// ALERT_TYPE_MAP and TARGET_AUDIENCE_OPTIONS from admin create page
const ALERT_TYPE_MAP = {
  "Industrial Action": ["Strike", "Work-to-Rule", "Labor Dispute", "Other"],
  "Extreme Weather": ["Storm", "Flooding", "Heatwave", "Wildfire", "Snow", "Other"],
  "Infrastructure Failures": ["Power Outage", "IT & System Failure", "Transport Service Suspension", "Road, Rail & Tram Closure", "Repairs or Delays", "Other"],
  "Public Safety Incidents": ["Protest", "Crime", "Terror Threats", "Travel Advisory", "Other"],
  "Festivals and Events": ["Citywide Festival", "Sporting Event", "Concerts and Stadium Events", "Parades and Ceremonies", "Other"]
};
const ALERT_CATEGORIES = Object.keys(ALERT_TYPE_MAP);
const getRandomAlertType = (category) => getRandomElement(ALERT_TYPE_MAP[category]);
const TARGET_AUDIENCE_OPTIONS = [
  "Airline",
  "Attraction",
  "Car Rental",
  "Cruise Line",
  "DMO",
  "Event Manager",
  "Hotel",
  "OTA",
  "Tour Guide",
  "Tour Operator",
  "Travel Agency",
  "Travel Media",
  "Other"
];
// sectorOptions from subscribe page
const SECTOR_OPTIONS = [
  "Airline",
  "Attraction",
  "Car Rental",
  "Cruise Line",
  "DMO",
  "Event Manager",
  "Hotel",
  "OTA",
  "Tour Guide",
  "Tour Operator",
  "Travel Agency",
  "Travel Media",
  "Other"
];
const ALERT_TYPES = ['Road Closure', 'Festival', 'Construction', 'Weather', 'Public Transport'];
const BUSINESS_TYPES = ['Restaurant', 'Hotel', 'Tourist Attraction', 'Museum', 'Event'];
const COMPANY_TYPES = ['Tourism', 'Hospitality', 'Transportation', 'Entertainment', 'Retail'];
const ALERT_STATUSES = ['pending', 'approved', 'rejected', 'archived'];

// Helper function to get random element from array
const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];

// Helper function to get random date between two dates
const getRandomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

// Helper function to generate random coordinates near a city
const getRandomCoordinatesNearCity = (city) => {
  // Base coordinates for each city
  const cityCoordinates = {
    'Edinburgh': { lat: 55.9533, lng: -3.1883 },
    'Glasgow': { lat: 55.8642, lng: -4.2518 },
    'Stirling': { lat: 56.1165, lng: -3.9369 },
    'Manchester': { lat: 53.4808, lng: -2.2426 },
    'London': { lat: 51.5074, lng: -0.1278 }
  };
  
  // Get base coordinates for the city
  const base = cityCoordinates[city] || { lat: 55.0, lng: -3.0 };
  
  // Add random offset (approximately within 10km)
  const latOffset = (Math.random() - 0.5) * 0.1;
  const lngOffset = (Math.random() - 0.5) * 0.1;
  
  return {
    latitude: base.lat + latOffset,
    longitude: base.lng + lngOffset
  };
};

// Generate users
const generateUsers = async (count) => {
  console.log(`\nGenerating ${count} users...`);
  const users = [];
  
  const password = await bcrypt.hash('password123', 10);
  // Create admin user first
  const adminUser = new User({
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    password: password, // 'password123'
    isPremium: true,
    isVerified: true,
    role: 'admin',
    status: 'active',
    lastLogin: new Date(),
    company: {
      name: 'TourPrism Admin',
      type: 'Tourism',
      MainOperatingRegions: CITIES.map(city => ({
        name: city,
        latitude: getRandomCoordinatesNearCity(city).latitude,
        longitude: getRandomCoordinatesNearCity(city).longitude,
        placeId: faker.string.uuid()
      }))
    }
  });
  
  users.push(adminUser);
  console.log('Created admin user: admin@example.com');
  
  // Create regular users
  for (let i = 0; i < count - 1; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const randomCity = getRandomElement(CITIES);
    const coordinates = getRandomCoordinatesNearCity(randomCity);
    
    const user = new User({
      email: faker.internet.email({ firstName, lastName }),
      firstName,
      lastName,
      password: '$2a$10$XFxMJVXnUPPWaIQJsQUHD.nsNEKjMiKxhYJ9rHWwXxQVVx0JEt0lW', // 'password123'
      isPremium: Math.random() > 0.7,
      isVerified: Math.random() > 0.1,
      role: Math.random() > 0.9 ? getRandomElement(['manager', 'viewer', 'editor']) : 'user',
      status: Math.random() > 0.1 ? 'active' : getRandomElement(['restricted', 'pending']),
      lastLogin: Math.random() > 0.3 ? getRandomDate(subDays(new Date(), 30), new Date()) : null,
      lastActivity: Math.random() > 0.3 ? getRandomDate(subDays(new Date(), 14), new Date()) : null,
      createdAt: getRandomDate(subDays(new Date(), 180), new Date()),
      company: {
        name: faker.company.name(),
        type: getRandomElement(COMPANY_TYPES),
        MainOperatingRegions: [
          {
            name: randomCity,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            placeId: faker.string.uuid()
          }
        ]
      },
      weeklyForecastSubscribed: Math.random() > 0.5
    });
    
    users.push(user);
    
    // Create some users from the last 7 days for "new users" metric
    if (i >= count - 20) {
      user.createdAt = getRandomDate(subDays(new Date(), 7), new Date());
    }
  }
  
  // Save all users
  await User.insertMany(users);
  console.log(`Created ${users.length} users successfully.`);
  
  return users;
};

// Generate alerts
const generateAlerts = async (users, count) => {
  console.log(`\nGenerating ${count} alerts...`);
  const alerts = [];
  const today = startOfDay(new Date());
  const sevenDaysAgo = subDays(today, 7);
  const thirtyDaysAgo = subDays(today, 30);
  const nextSevenDays = addDays(today, 7);
  for (let i = 0; i < count; i++) {
    const user = getRandomElement(users);
    const city = getRandomElement(CITIES);
    const coordinates = getRandomCoordinatesNearCity(city);
    const isActive = Math.random() > 0.3;
    const isUpcoming = Math.random() > 0.8;
    let createdAt;
    if (i < count * 0.2) {
      createdAt = getRandomDate(sevenDaysAgo, today);
    } else {
      createdAt = getRandomDate(thirtyDaysAgo, sevenDaysAgo);
    }
    let startDate, expectedEnd;
    if (isUpcoming) {
      startDate = getRandomDate(today, nextSevenDays);
      expectedEnd = addDays(startDate, Math.floor(Math.random() * 14) + 1);
    } else {
      startDate = getRandomDate(subDays(createdAt, 7), addDays(createdAt, 7));
      expectedEnd = Math.random() > 0.7 ? addDays(startDate, Math.floor(Math.random() * 14) + 1) : null;
    }
    const followerCount = Math.floor(Math.random() * 20);
    const followers = [];
    const followedBy = [];
    for (let j = 0; j < followerCount; j++) {
      const follower = getRandomElement(users);
      followers.push({
        userId: follower._id,
        followedAt: getRandomDate(createdAt, new Date())
      });
      followedBy.push(follower._id);
    }
    // Use new category/type logic
    const alertCategory = getRandomElement(ALERT_CATEGORIES);
    const alertType = getRandomAlertType(alertCategory);
    // Use new target audience logic
    const targetAudience = [getRandomElement(TARGET_AUDIENCE_OPTIONS)];
    const alert = new Alert({
      userId: user._id,
      title: faker.lorem.sentence({ min: 3, max: 8 }),
      description: faker.lorem.paragraph(),
      originLatitude: coordinates.latitude,
      originLongitude: coordinates.longitude,
      originCity: city,
      originCountry: 'United Kingdom',
      originPlaceId: faker.string.uuid(),
      originLocation: {
        type: 'Point',
        coordinates: [coordinates.longitude, coordinates.latitude]
      },
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      city: city,
      location: {
        type: 'Point',
        coordinates: [coordinates.longitude, coordinates.latitude]
      },
      status: isActive ? 'approved' : getRandomElement(ALERT_STATUSES),
      alertCategory,
      alertType,
      createdAt,
      updatedAt: getRandomDate(createdAt, new Date()),
      startDate,
      expectedEnd,
      followers,
      followedBy,
      numberOfFollows: followerCount,
      impact: getRandomElement(['Minor', 'Moderate', 'Severe']),
      priority: getRandomElement(['Low', 'Medium', 'High']),
      targetAudience,
      addToEmailSummary: Math.random() > 0.5
    });
    alerts.push(alert);
  }
  await Alert.insertMany(alerts);
  console.log(`Created ${alerts.length} alerts successfully.`);
  return alerts;
};

// Generate subscribers
const generateSubscribers = async (count) => {
  console.log(`\nGenerating ${count} subscribers...`);
  const subscribers = [];
  const today = new Date();
  const sevenDaysAgo = subDays(today, 7);
  const thirtyDaysAgo = subDays(today, 30);
  for (let i = 0; i < count; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const isActive = Math.random() > 0.1;
    const city = getRandomElement(CITIES);
    const coordinates = getRandomCoordinatesNearCity(city);
    let createdAt;
    if (i < count * 0.15) {
      createdAt = getRandomDate(sevenDaysAgo, today);
    } else {
      createdAt = getRandomDate(thirtyDaysAgo, sevenDaysAgo);
    }
    // Use sector from SECTOR_OPTIONS
    const sector = getRandomElement(SECTOR_OPTIONS);
    const subscriber = new Subscriber({
      name: `${firstName} ${lastName}`,
      email: faker.internet.email({ firstName, lastName }),
      location: [
        {
          name: city,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          placeId: faker.string.uuid()
        }
      ],
      sector,
      isActive,
      createdAt,
      lastEngagement: isActive ? getRandomDate(sevenDaysAgo, today) : null,
      lastWeeklyForecastReceived: isActive ? getRandomDate(subDays(today, 14), today) : null
    });
    subscribers.push(subscriber);
  }
  await Subscriber.insertMany(subscribers);
  console.log(`Created ${subscribers.length} subscribers successfully.`);
  return subscribers;
};

// Generate company names for autocomplete
const generateCompanyNames = async (count) => {
  console.log(`\nGenerating ${count} company names...`);
  const companies = [];
  
  for (let i = 0; i < count; i++) {
    companies.push({
      name: faker.company.name()
    });
  }
  
  // Save all company names
  await CompanyNames.insertMany(companies);
  console.log(`Created ${companies.length} company names successfully.`);
};

// Generate action hubs
const generateActionHubs = async (users, alerts, count) => {
  console.log(`\nGenerating ${count} action hubs...`);
  const actionHubs = [];
  
  for (let i = 0; i < count; i++) {
    const user = getRandomElement(users);
    const alert = getRandomElement(alerts);
    
    const actionHub = new ActionHub({
      userId: user._id,
      alert: alert._id,
      alertId: alert._id,
      status: getRandomElement(['new', 'in_progress', 'handled']),
      isFollowing: Math.random() > 0.3,
      handledBy: Math.random() > 0.7 ? getRandomElement(users)._id : null,
      handledAt: Math.random() > 0.7 ? new Date() : null,
      currentActiveTab: getRandomElement(['notify_guests', 'add_notes']),
      guests: Array(Math.floor(Math.random() * 5)).fill().map(() => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
        notificationSent: Math.random() > 0.5,
        sentTimestamp: Math.random() > 0.5 ? new Date() : null
      })),
      notes: Array(Math.floor(Math.random() * 3)).fill().map(() => ({
        content: faker.lorem.paragraph(),
        createdBy: getRandomElement(users)._id,
        createdAt: new Date(),
        updatedAt: Math.random() > 0.7 ? new Date() : null
      })),
      actionLogs: Array(Math.floor(Math.random() * 5)).fill().map(() => ({
        user: getRandomElement(users)._id,
        userEmail: user.email,
        actionType: getRandomElement(['follow', 'resolve', 'note_added', 'notify_guests', 'edit', 'mark_handled']),
        actionDetails: faker.lorem.sentence(),
        timestamp: new Date()
      })),
      flagged: Math.random() > 0.8
    });
    
    actionHubs.push(actionHub);
  }
  
  // Save all action hubs
  await ActionHub.insertMany(actionHubs);
  console.log(`Created ${actionHubs.length} action hubs successfully.`);
};

// Generate notifications
const generateNotifications = async (users, count) => {
  console.log(`\nGenerating ${count} notifications...`);
  const notifications = [];
  
  for (let i = 0; i < count; i++) {
    const user = getRandomElement(users);
    
    const notification = new Notification({
      userId: user._id,
      title: faker.lorem.sentence({ min: 3, max: 8 }),
      message: faker.lorem.paragraph(),
      isRead: Math.random() > 0.5,
      type: getRandomElement(['alert', 'system', 'user']),
      risk: Math.random() > 0.7 ? getRandomElement(['Low', 'Medium', 'High']) : null,
      createdAt: getRandomDate(subDays(new Date(), 30), new Date())
    });
    
    notifications.push(notification);
  }
  
  // Save all notifications
  await Notification.insertMany(notifications);
  console.log(`Created ${notifications.length} notifications successfully.`);
};

// Generate logs
const generateLogs = async (users, count) => {
  console.log(`\nGenerating ${count} logs...`);
  const logs = [];
  
  for (let i = 0; i < count; i++) {
    const user = getRandomElement(users);
    
    const log = {
      userId: user._id,
      userEmail: user.email,
      userName: `${user.firstName} ${user.lastName}`,
      action: getRandomElement([
        'signup', 'login', 'logout', 'password_reset', 'email_verified',
        'alert_created', 'alert_updated', 'alert_deleted', 'alert_followed', 'alert_unfollowed',
        'subscriber_added', 'subscriber_updated', 'subscriber_deleted',
        'admin_users_viewed', 'user_role_changed', 'user_restricted'
      ]),
      details: {
        ip: faker.internet.ip(),
        browser: faker.internet.userAgent()
      },
      ipAddress: faker.internet.ip(),
      userAgent: faker.internet.userAgent(),
      timestamp: getRandomDate(subDays(new Date(), 30), new Date())
    };
    
    logs.push(log);
  }
  
  // Save all logs
  await Logs.insertMany(logs);
  console.log(`Created ${logs.length} logs successfully.`);
};

// Generate summaries
const generateSummaries = async (users, count) => {
  console.log(`\nGenerating ${count} summaries...`);
  const summaries = [];
  
  for (let i = 0; i < count; i++) {
    const user = getRandomElement(users);
    const startDate = getRandomDate(subDays(new Date(), 30), subDays(new Date(), 7));
    const endDate = getRandomDate(startDate, new Date());
    
    const summary = new Summary({
      userId: user._id,
      title: faker.lorem.sentence({ min: 3, max: 8 }),
      description: faker.lorem.paragraph(),
      summaryType: getRandomElement(['custom', 'automated', 'forecast']),
      parameters: {
        filters: {
          categories: [getRandomElement(ALERT_CATEGORIES)],
          cities: [getRandomElement(CITIES)]
        }
      },
      timeRange: {
        startDate,
        endDate
      },
      locations: Array(Math.floor(Math.random() * 3) + 1).fill().map(() => {
        const city = getRandomElement(CITIES);
        const coordinates = getRandomCoordinatesNearCity(city);
        return {
          city,
          country: 'United Kingdom',
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          placeId: faker.string.uuid()
        };
      }),
      htmlContent: `<h1>${faker.lorem.sentence()}</h1><p>${faker.lorem.paragraphs(3)}</p>`,
      emailDelivery: {
        scheduled: Math.random() > 0.7,
        frequency: getRandomElement(['once', 'daily', 'weekly']),
        lastSent: Math.random() > 0.5 ? getRandomDate(subDays(new Date(), 14), new Date()) : null,
        recipients: Array(Math.floor(Math.random() * 3) + 1).fill().map(() => faker.internet.email())
      },
      createdAt: getRandomDate(subDays(new Date(), 30), new Date())
    });
    
    summaries.push(summary);
  }
  
  // Save all summaries
  await Summary.insertMany(summaries);
  console.log(`Created ${summaries.length} summaries successfully.`);
};

// Main function to seed data
const seedData = async () => {
  try {
    // Connect to database
    await connectDB();
    
    console.log('\n=== STARTING DATABASE SEEDING ===');
    console.log('This will clear existing data and create new test data.');
    
    // Clear existing data
    console.log('\nClearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Alert.deleteMany({}),
      Subscriber.deleteMany({}),
      ActionHub.deleteMany({}),
      CompanyNames.deleteMany({}),
      Notification.deleteMany({}),
      Logs.deleteMany({}),
      Summary.deleteMany({})
    ]);
    console.log('All existing data cleared successfully.');
    
    // Generate data
    const users = await generateUsers(100);
    const alerts = await generateAlerts(users, 200);
    await generateSubscribers(150);
    await generateCompanyNames(50);
    await generateActionHubs(users, alerts, 50);
    await generateNotifications(users, 300);
    await generateLogs(users, 500);
    await generateSummaries(users, 30);
    
    console.log('\n=== DATABASE SEEDING COMPLETED SUCCESSFULLY ===');
    console.log('\nAdmin user credentials:');
    console.log('Email: admin@example.com');
    console.log('Password: password123');
    
    // Disconnect from database
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
    
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

// Run the seed function
seedData(); 