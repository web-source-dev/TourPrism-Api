import mongoose from "mongoose";

const searchTrackingSchema = new mongoose.Schema(
  {
    searchQuery: {
      type: String,
      required: true,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false // Optional - only if user is logged in
    },
    isAuthenticated: {
      type: Boolean,
      default: false
    },
    hasResults: {
      type: Boolean,
      required: true
    },
    resultsCount: {
      type: Number,
      default: 0
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    },
    sessionId: {
      type: String // To track anonymous users across sessions
    }
  },
  { 
    timestamps: true 
  }
);

// Index for efficient queries
searchTrackingSchema.index({ searchQuery: 1, createdAt: -1 });
searchTrackingSchema.index({ userId: 1, createdAt: -1 });
searchTrackingSchema.index({ sessionId: 1, createdAt: -1 });
searchTrackingSchema.index({ hasResults: 1, createdAt: -1 });

const SearchTracking = mongoose.model("SearchTracking", searchTrackingSchema);
export default SearchTracking;
