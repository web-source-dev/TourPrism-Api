import mongoose from "mongoose";

const summarySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    // Type of summary: 'custom', 'automated', 'forecast'
    summaryType: {
      type: String,
      enum: ["custom", "automated", "forecast"],
      required: true,
    },
    // JSON representation of summary parameters/filters
    parameters: {
      type: Object,
      default: {},
    },
    // Time range this summary covers
    timeRange: {
      startDate: {
        type: Date,
      },
      endDate: {
        type: Date,
      },
    },
    // Locations covered in this summary
    locations: [{
      latitude: Number,
      longitude: Number,
      city: String,
      country: String,
      placeId: String,
    }],
    // Stored array of alert IDs included in the summary
    includedAlerts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Alert",
    }],
    // HTML content of the summary
    htmlContent: {
      type: String,
    },
    // URL to stored PDF version if generated
    pdfUrl: {
      type: String,
    },
    // Email delivery information
    emailDelivery: {
      scheduled: {
        type: Boolean,
        default: false,
      },
      frequency: {
        type: String,
        enum: ["once", "daily", "weekly"],
        default: "once",
      },
      lastSent: {
        type: Date,
      },
      recipients: [{
        type: String, // email addresses
      }],
    },
  },
  { timestamps: true }
);

// Create index for efficient queries
summarySchema.index({ userId: 1, summaryType: 1, createdAt: -1 });

const Summary = mongoose.model("Summary", summarySchema);
export default Summary; 