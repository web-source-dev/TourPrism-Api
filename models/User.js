import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true },
    firstName:String,
    lastName:String,
    googleId: String,
    microsoftId: String,
    password: String,
    isPremium: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin','manager','viewer','editor'], default: 'user' },
    status: { type: String, enum: ['active', 'restricted', 'pending', 'deleted'], default: 'active' },
    lastLogin: { type: Date },
    // Weekly forecast subscription fields
    weeklyForecastSubscribed: { type: Boolean, default: false },
    weeklyForecastSubscribedAt: { type: Date },
    lastWeeklyForecastReceived: { type: Date },
    collaborators: [{
      name: String,
      email: String,
      role: { type: String, enum: ['viewer','manager','DMO Advisor','Travel Agent Advisor','Tour Operator Advisor','Airline Advisor','Hotel Advisor'], default: 'viewer' },
      password: String,
      status: { type: String, enum: ['active', 'restricted', 'deleted','invited','accepted'], default: 'invited' },
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
          'Leisure Travelers',
          'Business Travelers',
          'Families',
          'Group Tours',
          'Cruise Passengers',
          'Student Groups',
          'Luxury Travelers',
          'Budget Travelers',
          'Other'
        ]
      }],
      otherCustomerType: String,
      targetMarkets: [{
        type: String,
        enum: [
          'United Kingdom',
          'United States',
          'Germany',
          'France',
          'Spain',
          'China',
          'India',
          'Australia',
          'Canada',
          'Netherlands',
          'Italy',
          'Ireland',
          'Other'
        ]
      }],
      otherTargetMarket: String,
      bookingWindows: [{
        type: String,
        enum: [
          'Last-minute (0–7 days before travel)',
          'Short lead (1–4 weeks before)',
          'Medium lead (1–3 months before)',
          'Long lead (3+ months before)',
          'Mixed / varies widely'
        ]
      }],
      peakSeasons: [{
        type: String,
        enum: [
          'Spring (Mar–May)',
          'Summer (Jun–Aug)',
          'Autumn (Sep–Nov)',
          'Winter (Dec–Feb)',
          'Year-round / No clear peak'
        ]
      }],
      disruptionTypes: [{
        type: String,
        enum: [
          'Flight delays & cancellations',
          'Train or transit strike',
          'Road closures / traffic',
          'Weather-related disruptions',
          'Civil unrest / protests',
          'Staff shortages / scheduling issues',
          'Event congestion / festival crowds',
          'Other'
        ]
      }],
      otherDisruptionType: String,
      disruptionFrequency: {
        type: String,
        enum: [
          'Rarely (few times a year)',
          'Occasionally (monthly)',
          'Frequently (weekly)',
          'Constantly (daily or near-daily)',
          'Not sure'
        ]
      },
      MainOperatingRegions: { 
        type: [{
          name: String,
          latitude: Number,
          longitude: Number,
          placeId: String
        }], 
        default: [] 
      },
    },
    preferences: {
      Communication: {
        emailPrefrences: { type: Boolean, default: false },
        whatsappPrefrences: { type: Boolean, default: false },
      },
      AlertSummaries: {
        daily: { type: Boolean, default: false },
        weekly: { type: Boolean, default: false },
        monthly: { type: Boolean, default: false },
      }
    },
    followedAlerts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Alert"
    }]
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
