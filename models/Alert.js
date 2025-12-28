const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {

    title: {
      type: String,
      required: true
    },
    summary: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'expired'],
      default: 'pending'
    },
    source: {
      type: String
    },
    url: {
      type: String
    },
    // Alias fields for fetched alerts (same as expectedStart/expectedEnd)
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    isLatest: {
      type: Boolean,
      default: true
    },
    // Enhanced categorization for fetched alerts
    mainType: {
      type: String
      // Enum removed to allow flexible categorization from various sources
    },
    subType: {
      type: String
      // Enum removed to allow flexible categorization from various sources
    },
    // Origin city for global events affecting local areas
    originCity: {
      type: String
    },
    sectors: {
      type: [String],
    },
    recoveryExpected: {
      type: String,
    },
    // Confidence scoring system
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    confidenceSources: [{
      source: {
        type: String,
        required: true
      },
      type: {
        type: String,
        enum: ['official', 'major_news', 'other_news', 'social'],
        required: true
      },
      confidence: {
        type: Number,
        min: 0,
        max: 1,
        required: true
      },
      url: String,
      title: String,
      publishedAt: Date
    }],
    // LLM-generated fields
    tone: {
      type: String,
      enum: ['Early', 'Developing', 'Confirmed']
    },
    header: {
      type: String
    },
    // Impact calculation fields
    roomsAtRisk: {
      type: Number,
      default: 0
    },
    revenueAtRisk: {
      type: Number,
      default: 0
    },
    recoveryRate: {
      type: Number,
      min: 0,
      max: 1
    },
    roomsSaved: {
      type: Number,
      default: 0
    },
    revenueSaved: {
      type: Number,
      default: 0
    },
    viewCount: {
      type: Number,
      default: 0
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

// Pre-save middleware to validate and fix location data
alertSchema.pre('save', function(next) {
  // Sync startDate/endDate with expectedStart/expectedEnd if not set
  if (!this.startDate && this.expectedStart) {
    this.startDate = this.expectedStart;
  }
  if (!this.endDate && this.expectedEnd) {
    this.endDate = this.expectedEnd;
  }

  // Validate and fix legacy location field for backward compatibility
  if (this.location && typeof this.location === 'object') {
    // Ensure coordinates array exists and is valid
    if (this.location.latitude && this.location.longitude) {
      if (!this.location.coordinates || !Array.isArray(this.location.coordinates)) {
        this.location.coordinates = [this.location.longitude, this.location.latitude];
      }
    }
  }

  // Validate and fix impactLocations with proper GeoJSON structure
  if (this.impactLocations && Array.isArray(this.impactLocations)) {
    this.impactLocations = this.impactLocations.map(location => {
      // Ensure each impact location has proper GeoJSON structure
      if (location.latitude && location.longitude) {
        if (!location.location || location.location.type !== 'Point') {
          location.location = {
            type: 'Point',
            coordinates: [location.longitude, location.latitude]
          };
        } else if (!location.location.coordinates || !Array.isArray(location.location.coordinates)) {
          location.location.coordinates = [location.longitude, location.latitude];
        }
      }
      return location;
    }).filter(location => {
      // Remove locations without valid coordinates
      return location.location &&
             location.location.coordinates &&
             Array.isArray(location.location.coordinates) &&
             location.location.coordinates.length === 2;
    });
  }

  // Validate confidence score
  if (this.confidence !== undefined) {
    this.confidence = Math.max(0, Math.min(1, this.confidence));
  }

  next();
});

// Create indexes for efficient geospatial queries
alertSchema.index({ 'impactLocations.location': '2dsphere' });
// Maintain legacy index for backward compatibility
alertSchema.index({ location: '2dsphere' });

// Index for confidence-based queries
alertSchema.index({ confidence: 1, status: 1 });

// Index for origin city filtering
alertSchema.index({ originCity: 1, status: 1 });

// Index for main/sub type filtering
alertSchema.index({ mainType: 1, subType: 1, status: 1 });

// Index for date range queries
alertSchema.index({ startDate: 1, endDate: 1 });
alertSchema.index({ expectedStart: 1, expectedEnd: 1 });

const Alert = mongoose.model("Alert", alertSchema);
module.exports = Alert;