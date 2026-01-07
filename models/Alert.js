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
    mainType: {
      type: String
    },
    subType: {
      type: String
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
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

// Pre-save middleware to validate data
alertSchema.pre('save', function(next) {


  // Validate confidence score
  if (this.confidence !== undefined) {
    this.confidence = Math.max(0, Math.min(1, this.confidence));
  }

  next();
});


// Index for confidence-based queries
alertSchema.index({ confidence: 1, status: 1 });


// Index for main/sub type filtering
alertSchema.index({ mainType: 1, subType: 1, status: 1 });

// Index for date range queries
alertSchema.index({ startDate: 1, endDate: 1 });

const Alert = mongoose.model("Alert", alertSchema);
module.exports = Alert;