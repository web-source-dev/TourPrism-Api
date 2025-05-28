import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Origin location (single location)
    originLatitude: {
      type: Number,
      required: function () {
        // Only required if latitude is not provided (legacy field)
        return !this.latitude;
      }
    },
    originLongitude: {
      type: Number,
      required: function () {
        // Only required if longitude is not provided (legacy field)
        return !this.longitude;
      }
    },
    originLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number]
      }
    },
    originCity: {
      type: String,
      required: function () {
        // Only required if city is not provided (legacy field)
        return !this.city;
      }
    },
    originCountry: {
      type: String
    },
    originPlaceId: {
      type: String
    },
    // Impact locations (multiple locations)
    impactLocations: [
      {
        latitude: { type: Number },
        longitude: { type: Number },
        city: { type: String },
        country: { type: String },
        placeId: { type: String },
        location: {
          type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
          },
          coordinates: {
            type: [Number]
          }
        }
      }
    ],
    // Legacy fields maintained for backward compatibility
    latitude: {
      type: Number
    },
    longitude: {
      type: Number
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number]
      }
    },
    city: {
      type: String,
    },
    media: [
      {
        url: { type: String },
        type: { type: String } // 'image', 'video', etc.
      }
    ],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "archived", "deleted"],
      default: "pending"
    },
    likes: {
      type: Number,
      default: 0
    },
    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    flaggedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    shares: {
      type: Number,
      default: 0
    },
    sharedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    description: {
      type: String,
    },
    alertGroupId: {
      type: String,
    },
    expectedStart: {
      type: Date,
    },
    expectedEnd: {
      type: Date,
    },
    version: {
      type: Number,
      default: 1
    },
    isLatest: {
      type: Boolean,
      default: true
    },
    alertCategory: {
      type: String,
    },
    alertType: {
      type: String,
    },
    title: {
      type: String,
    },
    risk: {
      type: String,
    },
    // Changed from string to enum
    impact: {
      type: String,
      enum: ["Minor", "Moderate", "Severe"]
    },
    priority: {
      type: String,
    },
    // Changed from string to array
    targetAudience: {
      type: [String],
      default: []
    },
    recommendedAction: {
      type: String,
    },
    linkToSource: {
      type: String,
    },
    numberOfFollows: {
      type: Number,
      default: 0
    },
    addToEmailSummary: {
      type: Boolean,
      default: false
    },
    previousVersionNotes: {
      type: String,
    },
    updatedBy: {
      type: String,
    },
    updated: {
      type: Date,
      default: Date.now
    },
    followedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
  },
  { timestamps: true }
);

// Create index for efficient geospatial queries on both origin and impact locations
alertSchema.index({ originLocation: '2dsphere' });
alertSchema.index({ 'impactLocations.location': '2dsphere' });
// Maintain legacy index for backward compatibility
alertSchema.index({ location: '2dsphere' });

const Alert = mongoose.model("Alert", alertSchema);
export default Alert;