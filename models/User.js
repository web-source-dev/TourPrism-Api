const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true },
    googleId: String,
    microsoftId: String,
    password: String,
    isPremium: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'restricted', 'pending', 'deleted'], default: 'active' },
    lastLogin: { type: Date },
    collaborators: [{
      name: String,
      email: String,
      // Collaborator roles: 'viewer' (read-only) and 'manager' (can manage content)
      role: { type: String, enum: ['viewer', 'manager'], default: 'viewer' },
      password: String, // Collaborators have their own password for login
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
      contactName: { type: String, default: '' },
    
      city: {
        type: String,
        enum: ['Edinburgh', 'London'],
        default: null
      },
    
      rooms: {
        type: Number,
        min: 1,
        default: null
      },
    
      avgRoomRate: {
        type: Number,
        default: null
      },
    
      size: {
        type: String,
        enum: ['micro', 'small', 'medium'],
        default: null
      },
    
      locations: [{
        name: String,
        latitude: Number,
        longitude: Number,
        placeId: String
      }],
    
      incentives: {
        type: [String],
        default: []
      }
    },
    settings: {
      recoveryActions: {
        sendAutomaticStayAnyway: { type: Boolean, default: true },
        enableOverbooking: { type: Boolean, default: false },
        flexibleRates: { type: Boolean, default: false }
      },
      communicationPreferences: {
        weeklySummary: { type: Boolean, default: true },
        highRiskAlerts: { type: Boolean, default: true },
        monthlyPerformance: { type: Boolean, default: true }
      }
    }
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;