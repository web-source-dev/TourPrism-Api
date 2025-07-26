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
const CITIES = ['Edinburgh'];
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

// Helper function to generate random coordinates near Edinburgh
const getRandomCoordinatesNearCity = (city) => {
  // Base coordinates for Edinburgh
  const base = { lat: 55.9533, lng: -3.1883 };
  
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
      MainOperatingRegions: [{
        name: 'Edinburgh',
        latitude: getRandomCoordinatesNearCity('Edinburgh').latitude,
        longitude: getRandomCoordinatesNearCity('Edinburgh').longitude,
        placeId: faker.string.uuid()
      }]
    }
  });
  
  users.push(adminUser);
  console.log('Created admin user: admin@example.com');
  
  // Create regular users
  for (let i = 0; i < count - 1; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const randomCity = 'Edinburgh';
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
  console.log(`\nGenerating ${count} alerts for Edinburgh...`);
  const alerts = [];
  const today = startOfDay(new Date());
  const sevenDaysAgo = subDays(today, 7);
  const thirtyDaysAgo = subDays(today, 30);
  const nextSevenDays = addDays(today, 7);
  
  // English alert content templates
  const alertTemplates = {
    "Industrial Action": {
      titles: [
        "Transport Strike Affecting Edinburgh City Centre",
        "Rail Workers Industrial Action in Edinburgh",
        "Bus Service Disruption Due to Strike Action",
        "Edinburgh Airport Staff Industrial Action",
        "Public Transport Strike Impacting Tourism"
      ],
      descriptions: [
        "Industrial action by transport workers is causing significant disruption to public transport services across Edinburgh. Commuters and tourists should expect delays and cancellations.",
        "A planned strike by rail workers is affecting train services to and from Edinburgh. Alternative transport arrangements should be considered.",
        "Bus services in Edinburgh are experiencing disruption due to ongoing industrial action. Routes may be cancelled or delayed.",
        "Airport staff at Edinburgh Airport are taking industrial action, which may affect flight operations and passenger services.",
        "Tourism-related transport services are impacted by industrial action, affecting visitor movement around the city."
      ],
      recommendedActions: [
        "Check transport provider websites for latest updates and alternative routes",
        "Consider using alternative transport methods such as taxis or walking",
        "Allow extra time for journeys and plan alternative routes in advance",
        "Monitor social media for real-time updates from transport operators",
        "Contact your transport provider directly for specific service information"
      ]
    },
    "Extreme Weather": {
      titles: [
        "Severe Weather Warning for Edinburgh",
        "Storm Conditions Affecting Edinburgh Tourism",
        "Heavy Rainfall Causing Travel Disruption in Edinburgh",
        "Snow and Ice Warning for Edinburgh Area",
        "High Winds Impacting Edinburgh Attractions"
      ],
      descriptions: [
        "Severe weather conditions are expected to impact Edinburgh over the next 24-48 hours. Tourism activities and transport may be affected.",
        "Storm conditions are creating hazardous travel conditions in and around Edinburgh. Tourist attractions may close early.",
        "Heavy rainfall is causing flooding and travel disruption across Edinburgh. Some tourist sites may be inaccessible.",
        "Snow and ice conditions are making travel difficult in Edinburgh. Public transport may be delayed or cancelled.",
        "High winds are affecting outdoor attractions and activities in Edinburgh. Safety measures are in place."
      ],
      recommendedActions: [
        "Check weather forecasts and plan indoor activities as alternatives",
        "Monitor transport updates and allow extra travel time",
        "Contact attractions directly to confirm opening hours and accessibility",
        "Consider postponing outdoor activities until conditions improve",
        "Follow local authority advice and emergency service guidance"
      ]
    },
    "Infrastructure Failures": {
      titles: [
        "Power Outage Affecting Edinburgh City Centre",
        "IT System Failure at Edinburgh Tourist Information",
        "Road Closure Due to Infrastructure Work in Edinburgh",
        "Public Transport System Failure in Edinburgh",
        "Water Supply Issues in Edinburgh Tourist Areas"
      ],
      descriptions: [
        "A power outage is affecting businesses and attractions in Edinburgh city centre. Some services may be temporarily unavailable.",
        "IT system failures are impacting tourist information services in Edinburgh. Online booking systems may be affected.",
        "Essential infrastructure work has resulted in road closures in Edinburgh. Traffic diversions are in place.",
        "Public transport systems are experiencing technical failures in Edinburgh. Services may be delayed or cancelled.",
        "Water supply issues are affecting some tourist areas in Edinburgh. Restaurants and hotels may have limited services."
      ],
      recommendedActions: [
        "Contact businesses directly to confirm services and opening hours",
        "Use alternative routes and allow extra travel time",
        "Check online platforms for service updates and alternatives",
        "Consider postponing non-essential travel until services are restored",
        "Follow official updates from service providers and local authorities"
      ]
    },
    "Public Safety Incidents": {
      titles: [
        "Public Safety Alert in Edinburgh City Centre",
        "Protest March Affecting Edinburgh Tourism Areas",
        "Travel Advisory for Edinburgh Visitors",
        "Security Incident Near Edinburgh Attractions",
        "Public Safety Measures in Edinburgh Tourist Zone"
      ],
      descriptions: [
        "A public safety incident has been reported in Edinburgh city centre. Tourist areas may be affected by increased security measures.",
        "A planned protest march is expected to cause disruption in Edinburgh tourism areas. Alternative routes should be considered.",
        "A travel advisory has been issued for visitors to Edinburgh. Some areas may have restricted access.",
        "A security incident near major Edinburgh attractions has prompted safety measures. Tourist activities may be affected.",
        "Enhanced public safety measures are in place in Edinburgh tourist zones. Visitors should follow official guidance."
      ],
      recommendedActions: [
        "Avoid affected areas and follow official safety guidance",
        "Use alternative routes and allow extra travel time",
        "Monitor official updates and social media for latest information",
        "Contact tourist information for alternative activity suggestions",
        "Follow police and local authority instructions"
      ]
    },
    "Festivals and Events": {
      titles: [
        "Major Festival Causing Traffic Disruption in Edinburgh",
        "Edinburgh Festival Road Closures and Restrictions",
        "Large Sporting Event Affecting Edinburgh Transport",
        "Concert Event Impacting Edinburgh City Centre",
        "Parade Route Closures in Edinburgh Tourist Areas"
      ],
      descriptions: [
        "A major festival is taking place in Edinburgh, causing significant traffic disruption and road closures throughout the city centre.",
        "The Edinburgh Festival is resulting in road closures and transport restrictions. Alternative routes and transport methods are recommended.",
        "A large sporting event is affecting public transport and road access in Edinburgh. Delays are expected.",
        "A major concert event is impacting traffic flow and parking in Edinburgh city centre. Public transport is recommended.",
        "A parade is taking place in Edinburgh tourist areas, resulting in road closures and traffic diversions."
      ],
      recommendedActions: [
        "Use public transport and avoid driving in affected areas",
        "Plan alternative routes and allow extra travel time",
        "Check event websites for specific road closure information",
        "Consider visiting attractions outside the affected areas",
        "Follow event organisers' guidance and official updates"
      ]
    }
  };

  for (let i = 0; i < count; i++) {
    const user = getRandomElement(users);
    const city = 'Edinburgh';
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
    const targetAudience = [getRandomElement(TARGET_AUDIENCE_OPTIONS)];
    
    // Get template content for the alert category
    const template = alertTemplates[alertCategory];
    const title = getRandomElement(template.titles);
    const description = getRandomElement(template.descriptions);
    const recommendedAction = getRandomElement(template.recommendedActions);
    
    // Generate impact locations (multiple locations affected)
    const impactLocations = [
      {
        latitude: coordinates.latitude + (Math.random() - 0.5) * 0.01,
        longitude: coordinates.longitude + (Math.random() - 0.5) * 0.01,
        city: city,
        country: 'United Kingdom',
        placeId: faker.string.uuid(),
        location: {
          type: 'Point',
          coordinates: [coordinates.longitude + (Math.random() - 0.5) * 0.01, coordinates.latitude + (Math.random() - 0.5) * 0.01]
        }
      }
    ];
    
    // Add additional impact locations for some alerts
    if (Math.random() > 0.5) {
      impactLocations.push({
        latitude: coordinates.latitude + (Math.random() - 0.5) * 0.02,
        longitude: coordinates.longitude + (Math.random() - 0.5) * 0.02,
        city: city,
        country: 'United Kingdom',
        placeId: faker.string.uuid(),
        location: {
          type: 'Point',
          coordinates: [coordinates.longitude + (Math.random() - 0.5) * 0.02, coordinates.latitude + (Math.random() - 0.5) * 0.02]
        }
      });
    }
    
    const alert = new Alert({
      userId: user._id,
      title: title,
      description: description,
      recommendedAction: recommendedAction,
      originLatitude: coordinates.latitude,
      originLongitude: coordinates.longitude,
      originCity: city,
      originCountry: 'United Kingdom',
      originPlaceId: faker.string.uuid(),
      originLocation: {
        type: 'Point',
        coordinates: [coordinates.longitude, coordinates.latitude]
      },
      impactLocations: impactLocations,
      // Legacy fields maintained for backward compatibility
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
      expectedStart: startDate,
      expectedEnd,
      followers,
      followedBy,
      numberOfFollows: followerCount,
      impact: getRandomElement(['Minor', 'Moderate', 'Severe']),
      priority: getRandomElement(['Low', 'Medium', 'High']),
      targetAudience,
      addToEmailSummary: Math.random() > 0.5,
      risk: Math.random() > 0.7 ? getRandomElement(['Low', 'Medium', 'High']) : null,
      linkToSource: Math.random() > 0.8 ? faker.internet.url() : null,
      media: Math.random() > 0.9 ? [{
        url: faker.image.url(),
        type: 'image'
      }] : [],
      likes: Math.floor(Math.random() * 50),
      shares: Math.floor(Math.random() * 20),
      version: 1,
      isLatest: true,
      updatedBy: Math.random() > 0.8 ? user.email : null
    });
    
    alerts.push(alert);
  }
  
  await Alert.insertMany(alerts);
  console.log(`Created ${alerts.length} alerts successfully.`);
  return alerts;
};

// Generate subscribers
const generateSubscribers = async () => {
  console.log(`\nGenerating 3 specific subscribers...`);
  const subscribers = [];
  const today = new Date();
  const sevenDaysAgo = subDays(today, 7);
  const thirtyDaysAgo = subDays(today, 30);
  
  // Specific subscriber emails
  const subscriberEmails = [
    "muhammadnouman72321@gmail.com",
    "ashanhawks@yahoo.com", 
    "risetonet@hotmail.com"
  ];
  
  for (let i = 0; i < subscriberEmails.length; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const isActive = Math.random() > 0.1;
    const city = 'Edinburgh';
    const coordinates = getRandomCoordinatesNearCity(city);
    let createdAt;
    if (i < 1) {
      createdAt = getRandomDate(sevenDaysAgo, today);
    } else {
      createdAt = getRandomDate(thirtyDaysAgo, sevenDaysAgo);
    }
    // Use sector from SECTOR_OPTIONS
    const sector = getRandomElement(SECTOR_OPTIONS);
    const subscriber = new Subscriber({
      name: `${firstName} ${lastName}`,
      email: subscriberEmails[i],
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
          cities: ['Edinburgh']
        }
      },
      timeRange: {
        startDate,
        endDate
      },
      locations: [{
        city: 'Edinburgh',
        country: 'United Kingdom',
        latitude: getRandomCoordinatesNearCity('Edinburgh').latitude,
        longitude: getRandomCoordinatesNearCity('Edinburgh').longitude,
        placeId: faker.string.uuid()
      }],
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
    await generateSubscribers();
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