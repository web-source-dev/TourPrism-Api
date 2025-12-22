const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Old models (for reading existing data)
const oldAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  originLatitude: Number,
  originLongitude: Number,
  originLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number]
  },
  originCity: String,
  originCountry: String,
  originPlaceId: String,
  impactLocations: [{
    latitude: Number,
    longitude: Number,
    city: String,
    country: String,
    placeId: String,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: [Number]
    }
  }],
  latitude: Number,
  longitude: Number,
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number]
  },
  city: String,
  media: [{ url: String, type: String }],
  status: { type: String, enum: ["pending", "approved", "rejected", "archived", "deleted"], default: "pending" },
  likes: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  flaggedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  shares: { type: Number, default: 0 },
  sharedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  description: String,
  alertGroupId: String,
  expectedStart: Date,
  expectedEnd: Date,
  version: { type: Number, default: 1 },
  isLatest: { type: Boolean, default: true },
  alertCategory: String,
  alertType: String,
  title: String,
  risk: String,
  impact: { type: String, enum: ["Low", "Moderate", "High"] },
  priority: String,
  targetAudience: { type: [String], default: [] },
  recommendedAction: String,
  linkToSource: String,
  numberOfFollows: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  addToEmailSummary: { type: Boolean, default: false },
  previousVersionNotes: String,
  updatedBy: String,
  updated: { type: Date, default: Date.now },
  followedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  isUpdateOf: { type: mongoose.Schema.Types.ObjectId, ref: "Alert", default: null },
  updateHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: "Alert" }],
  lastAutoUpdateCheck: Date,
  autoUpdateEnabled: { type: Boolean, default: true },
  autoUpdateSuppressed: { type: Boolean, default: false },
  autoUpdateSuppressedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  autoUpdateSuppressedAt: Date,
  autoUpdateSuppressedReason: String,
  updateCount: { type: Number, default: 0 },
  lastUpdateAt: Date,
  lastUpdateBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updateSource: { type: String, enum: ["manual", "auto", "admin"], default: "manual" }
}, { timestamps: true });

const oldUserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  firstName: String,
  lastName: String,
  googleId: String,
  microsoftId: String,
  password: String,
  isPremium: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  role: { type: String, enum: ['user', 'admin', 'manager', 'viewer', 'editor'], default: 'user' },
  status: { type: String, enum: ['active', 'restricted', 'pending', 'deleted'], default: 'active' },
  lastLogin: Date,
  weeklyForecastSubscribed: { type: Boolean, default: false },
  weeklyForecastSubscribedAt: Date,
  lastWeeklyForecastReceived: Date,
  collaborators: [{
    name: String,
    email: String,
    role: { type: String, enum: ['viewer', 'manager', 'DMO Advisor', 'Travel Agent Advisor', 'Tour Operator Advisor', 'Airline Advisor', 'Hotel Advisor'], default: 'viewer' },
    password: String,
    status: { type: String, enum: ['active', 'restricted', 'deleted', 'invited', 'accepted'], default: 'invited' },
    invitationToken: String,
    invitationExpiry: Date
  }],
  otp: String,
  otpExpiry: Date,
  otpLastSent: Date,
  resetPasswordToken: String,
  resetPasswordExpiry: Date,
  company: {
    name: { type: String, default: '' },
    type: { type: String, default: '' },
    size: { type: String, enum: [
      'Micro (1–10 staff)',
      'Small (11–50 staff)',
      'Medium (51–200 staff)',
      'Large (201–500 staff)',
      'Enterprise (500+ staff)'
    ]},
    customerTypes: [{
      type: String,
      enum: [
        'Leisure Travelers', 'Business Travelers', 'Families', 'Group Tours',
        'Cruise Passengers', 'Student Groups', 'Luxury Travelers', 'Budget Travelers', 'Other'
      ]
    }],
    otherCustomerType: String,
    targetMarkets: [{
      type: String,
      enum: [
        'United Kingdom', 'United States', 'Germany', 'France', 'Spain', 'China',
        'India', 'Australia', 'Canada', 'Netherlands', 'Italy', 'Ireland', 'Other'
      ]
    }],
    otherTargetMarket: String,
    bookingWindows: [{
      type: String,
      enum: [
        'Last-minute (0–7 days before travel)', 'Short lead (1–4 weeks before)',
        'Medium lead (1–3 months before)', 'Long lead (3+ months before)', 'Mixed / varies widely'
      ]
    }],
    peakSeasons: [{
      type: String,
      enum: [
        'Spring (Mar–May)', 'Summer (Jun–Aug)', 'Autumn (Sep–Nov)', 'Winter (Dec–Feb)', 'Year-round / No clear peak'
      ]
    }],
    disruptionTypes: [{
      type: String,
      enum: [
        'Flight delays & cancellations', 'Train or transit strike', 'Road closures / traffic',
        'Weather-related disruptions', 'Civil unrest / protests', 'Staff shortages / scheduling issues',
        'Event congestion / festival crowds', 'Other'
      ]
    }],
    otherDisruptionType: String,
    disruptionFrequency: {
      type: String,
      enum: [
        'Rarely (few times a year)', 'Occasionally (monthly)', 'Frequently (weekly)',
        'Constantly (daily or near-daily)', 'Not sure'
      ]
    },
    MainOperatingRegions: [{
      name: String,
      latitude: Number,
      longitude: Number,
      placeId: String
    }]
  },
  preferences: {
    Communication: {
      emailPrefrences: { type: Boolean, default: false },
      whatsappPrefrences: { type: Boolean, default: false }
    },
    AlertSummaries: {
      daily: { type: Boolean, default: false },
      weekly: { type: Boolean, default: false },
      monthly: { type: Boolean, default: false }
    }
  },
  followedAlerts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Alert" }]
}, { timestamps: true });

const OldAlert = mongoose.model('OldAlert', oldAlertSchema, 'alerts');
const OldUser = mongoose.model('OldUser', oldUserSchema, 'users');

// New models (for writing migrated data)
const Alert = require('../models/Alert');
const User = require('../models/User');

async function migrateAlerts() {
  console.log('Starting alert migration...');

  try {
    const oldAlerts = await OldAlert.find({});
    console.log(`Found ${oldAlerts.length} alerts to migrate`);

    if (oldAlerts.length === 0) {
      console.log('No alerts found. Checking if alerts collection exists with different schema...');
      // Try to find alerts in the regular collection
      const existingAlerts = await mongoose.connection.db.collection('alerts').find({}).limit(5).toArray();
      console.log(`Found ${existingAlerts.length} alerts in alerts collection (first 5):`);
      existingAlerts.forEach(alert => {
        console.log(`- ${alert.title || alert._id} (${alert.status})`);
      });
      return;
    }

    // Clear only if we found old alerts to migrate
    console.log('Clearing alerts collection for fresh migration...');
    await mongoose.connection.db.collection('alerts').deleteMany({});

    for (const oldAlert of oldAlerts) {
      // Map old alert to new alert structure
      const newAlertData = {
        title: oldAlert.title || oldAlert.description || 'Untitled Alert',
        summary: oldAlert.description || '',
        city: oldAlert.originCity || oldAlert.city || '',
        status: oldAlert.status === 'approved' ? 'approved' : 'pending',
        source: oldAlert.linkToSource ? 'external' : 'manual',
        url: oldAlert.linkToSource || '',
        startDate: oldAlert.expectedStart,
        endDate: oldAlert.expectedEnd,
        mainType: mapAlertCategoryToMainType(oldAlert.alertCategory),
        ...(mapAlertTypeToSubType(oldAlert.alertType) ? { subType: mapAlertTypeToSubType(oldAlert.alertType) } : {}),
        originCity: oldAlert.originCity,
        sectors: oldAlert.targetAudience || [],
        recoveryExpected: oldAlert.recommendedAction || '',
        confidence: 0.5, // Default confidence
        confidenceSources: [],
        tone: 'Early', // Default tone
        header: oldAlert.title || '',
        whatsImpacted: [{
          category: 'General',
          description: oldAlert.impact || '',
          icon: 'alert-triangle',
          items: [{
            title: 'Impact Details',
            description: oldAlert.description || ''
          }]
        }],
        actionPlan: [{
          category: 'Recommended Actions',
          description: 'Actions to take',
          icon: 'check-circle',
          items: [{
            title: 'Recommended Action',
            description: oldAlert.recommendedAction || ''
          }]
        }],
        viewCount: oldAlert.viewCount || 0,
        followedBy: oldAlert.followedBy || []
      };

      // Handle impact locations
      if (oldAlert.impactLocations && oldAlert.impactLocations.length > 0) {
        newAlertData.city = oldAlert.impactLocations[0].city || newAlertData.city;
      }

      // Calculate impact if possible
      if (oldAlert.impact === 'High') {
        newAlertData.confidence = 0.8;
      } else if (oldAlert.impact === 'Moderate') {
        newAlertData.confidence = 0.6;
      } else if (oldAlert.impact === 'Low') {
        newAlertData.confidence = 0.4;
      }

      const newAlert = new Alert(newAlertData);
      await newAlert.save();
      console.log(`Migrated alert: ${newAlert._id}`);
    }

    console.log('Alert migration completed');
  } catch (error) {
    console.error('Error migrating alerts:', error);
  }
}

async function migrateUsers() {
  console.log('Starting user migration...');

  try {
    // First, let's check what collections exist and what data they contain
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));

    const oldUsers = await OldUser.find({});
    console.log(`Found ${oldUsers.length} users to migrate`);

    if (oldUsers.length === 0) {
      console.log('No users found. Checking if users collection exists with different schema...');
      // Try to find users in the regular collection
      const existingUsers = await mongoose.connection.db.collection('users').find({}).limit(5).toArray();
      console.log(`Found ${existingUsers.length} users in users collection (first 5):`);
      existingUsers.forEach(user => {
        console.log(`- ${user.email} (${user.role})`);
      });
      return;
    }

    // Clear only if we found old users to migrate
    console.log('Clearing users collection for fresh migration...');
    await mongoose.connection.db.collection('users').deleteMany({});

    for (const oldUser of oldUsers) {
      // Map old user to new user structure
      const newUserData = {
        email: oldUser.email,
        googleId: oldUser.googleId,
        microsoftId: oldUser.microsoftId,
        password: oldUser.password,
        isPremium: oldUser.isPremium,
        isVerified: oldUser.isVerified,
        role: mapOldRoleToNewRole(oldUser.role),
        status: oldUser.status,
        lastLogin: oldUser.lastLogin,
        collaborators: oldUser.collaborators ? oldUser.collaborators.map(collaborator => ({
          name: collaborator.name,
          email: collaborator.email,
          role: mapOldCollaboratorRoleToNewRole(collaborator.role),
          password: collaborator.password,
          status: collaborator.status,
          invitationToken: collaborator.invitationToken,
          invitationExpiry: collaborator.invitationExpiry
        })) : [],
        otp: oldUser.otp,
        otpExpiry: oldUser.otpExpiry,
        otpLastSent: oldUser.otpLastSent,
        resetPasswordToken: oldUser.resetPasswordToken,
        resetPasswordExpiry: oldUser.resetPasswordExpiry,
        company: {
          name: oldUser.company?.name || '',
          contactName: `${oldUser.firstName || ''} ${oldUser.lastName || ''}`.trim(),
          city: oldUser.company?.MainOperatingRegions?.[0]?.name || null,
          rooms: null, // Will need to be set manually
          avgRoomRate: null, // Will need to be set manually
          size: mapCompanySize(oldUser.company?.size),
          locations: oldUser.company?.MainOperatingRegions ? oldUser.company.MainOperatingRegions.map(region => ({
            name: region.name,
            latitude: region.latitude,
            longitude: region.longitude,
            placeId: region.placeId
          })) : [],
          incentives: [] // Will need to be set manually
        },
        weeklyForecastSubscribed: oldUser.weeklyForecastSubscribed,
        weeklyForecastSubscribedAt: oldUser.weeklyForecastSubscribedAt,
        lastWeeklyForecastReceived: oldUser.lastWeeklyForecastReceived,
        followedAlerts: oldUser.followedAlerts || []
      };

      const newUser = new User(newUserData);
      await newUser.save();
      console.log(`Migrated user: ${newUser.email}`);
    }

    console.log('User migration completed');
  } catch (error) {
    console.error('Error migrating users:', error);
  }
}

function mapAlertCategoryToMainType(category) {
  const categoryMap = {
    'Weather': 'weather',
    'Strike': 'strike',
    'Protest': 'protest',
    'Flight Issues': 'flight_issues',
    'Staff Shortage': 'staff_shortage',
    'Supply Chain': 'supply_chain',
    'System Failure': 'system_failure',
    'Policy': 'policy',
    'Economy': 'economy'
  };
  return categoryMap[category] || 'other';
}

function mapAlertTypeToSubType(alertType) {
  const typeMap = {
    'Flight Delay': 'delay',
    'Flight Cancellation': 'cancellation',
    'Snow': 'snow',
    'Flood': 'flood',
    'Storm': 'storm',
    'Hurricane': 'hurricane',
    'Heatwave': 'heatwave',
    'Cold Snap': 'cold_snap',
    'Pilot Strike': 'airline_pilot',
    'Rail Strike': 'rail',
    'Ferry Strike': 'ferry'
  };
  return typeMap[alertType] || null;
}

function mapOldRoleToNewRole(oldRole) {
  const roleMap = {
    'user': 'user',
    'admin': 'admin',
    'manager': 'manager',
    'viewer': 'viewer',
    'editor': 'admin' // Map editor to admin
  };
  return roleMap[oldRole] || 'user';
}

function mapOldCollaboratorRoleToNewRole(oldRole) {
  const roleMap = {
    'viewer': 'viewer',
    'manager': 'manager',
    'DMO Advisor': 'manager',
    'Travel Agent Advisor': 'manager',
    'Tour Operator Advisor': 'manager',
    'Airline Advisor': 'manager',
    'Hotel Advisor': 'manager'
  };
  return roleMap[oldRole] || 'viewer';
}

function mapCompanySize(oldSize) {
  const sizeMap = {
    'Micro (1–10 staff)': 'micro',
    'Small (11–50 staff)': 'small',
    'Medium (51–200 staff)': 'medium',
    'Large (201–500 staff)': null, // No direct mapping, will be null
    'Enterprise (500+ staff)': null  // No direct mapping, will be null
  };
  return sizeMap[oldSize] || null;
}

async function runMigration() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Run migrations (read from existing collections, create new documents)
    await migrateUsers();
    await migrateAlerts();

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration, migrateUsers, migrateAlerts };
