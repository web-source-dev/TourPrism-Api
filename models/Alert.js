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
      validate: {
        validator: function(v) {
          // If provided, must be a valid URL
          if (!v) return true; // Optional field
          try {
            new URL(v);
            return true;
          } catch (e) {
            return false;
          }
        },
        message: 'linkToSource must be a valid URL'
      }
    },
    numberOfFollows: {
      type: Number,
      default: 0
    },
    viewCount: {
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
    // Auto-update system fields
    isUpdateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Alert",
      default: null
    },
    updateHistory: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Alert"
    }],
    lastAutoUpdateCheck: {
      type: Date,
      default: null
    },
    autoUpdateEnabled: {
      type: Boolean,
      default: true
    },
    autoUpdateSuppressed: {
      type: Boolean,
      default: false
    },
    autoUpdateSuppressedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    autoUpdateSuppressedAt: {
      type: Date
    },
    autoUpdateSuppressedReason: {
      type: String
    },
    // Update metadata
    updateCount: {
      type: Number,
      default: 0
    },
    lastUpdateAt: {
      type: Date
    },
    lastUpdateBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    updateSource: {
      type: String,
      enum: ["manual", "auto", "admin"],
      default: "manual"
    }
  },
  { timestamps: true }
);

// Pre-save middleware to validate and fix location data
alertSchema.pre('save', function(next) {
  // Validate and fix originLocation
  if (this.originLocation && this.originLocation.type === 'Point') {
    if (!this.originLocation.coordinates || !Array.isArray(this.originLocation.coordinates) || this.originLocation.coordinates.length !== 2) {
      // If coordinates are invalid, try to use originLatitude/originLongitude
      if (this.originLatitude && this.originLongitude) {
        this.originLocation.coordinates = [this.originLongitude, this.originLatitude];
      } else {
        // If no valid coordinates, remove the location field
        this.originLocation = undefined;
      }
    }
  }

  // Validate and fix legacy location field
  if (this.location && this.location.type === 'Point') {
    if (!this.location.coordinates || !Array.isArray(this.location.coordinates) || this.location.coordinates.length !== 2) {
      // If coordinates are invalid, try to use latitude/longitude
      if (this.latitude && this.longitude) {
        this.location.coordinates = [this.longitude, this.latitude];
      } else {
        // If no valid coordinates, remove the location field
        this.location = undefined;
      }
    }
  }

  // Validate and fix impactLocations
  if (this.impactLocations && Array.isArray(this.impactLocations)) {
    this.impactLocations = this.impactLocations.filter(location => {
      if (location.location && location.location.type === 'Point') {
        if (!location.location.coordinates || !Array.isArray(location.location.coordinates) || location.location.coordinates.length !== 2) {
          // If coordinates are invalid, try to use latitude/longitude
          if (location.latitude && location.longitude) {
            location.location.coordinates = [location.longitude, location.latitude];
            return true;
          } else {
            // If no valid coordinates, remove this location
            return false;
          }
        }
        return true;
      }
      return false;
    });
  }

  next();
});

// Create index for efficient geospatial queries on both origin and impact locations
alertSchema.index({ originLocation: '2dsphere' });
alertSchema.index({ 'impactLocations.location': '2dsphere' });
// Maintain legacy index for backward compatibility
alertSchema.index({ location: '2dsphere' });

const Alert = mongoose.model("Alert", alertSchema);
export default Alert;