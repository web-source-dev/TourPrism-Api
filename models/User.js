import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true },
    firstName:String,
    lastName:String,
    googleId: String,
    password: String,
    isSubscribed: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin','manager','viewer','editor'], default: 'user' },
    status: { type: String, enum: ['active', 'restricted', 'pending', 'deleted'], default: 'active' },
    lastLogin: { type: Date },
    collaborators: [{
      name: String,
      email: String,
      role: { type: String, enum: ['viewer','manager'], default: 'viewer' },
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
