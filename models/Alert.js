const mongoose = require("mongoose");
const grokService = require("../config/grok.js");

const alertSchema = new mongoose.Schema(
  {

    title: {
      type: String,
      required: true
    },
    headerPrefix:{
      type: String,
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

// Pre-save middleware to validate data and generate header prefix
alertSchema.pre('save', async function(next) {
  // Validate confidence score
  if (this.confidence !== undefined) {
    this.confidence = Math.max(0, Math.min(1, this.confidence));
  }

  // Auto-generate header prefix if not already set and title exists
  // Generate on new documents or when title/confidence changes
  const shouldGeneratePrefix = !this.headerPrefix && 
                                this.title && 
                                (this.isNew || this.isModified('title') || this.isModified('confidence'));
  
  if (shouldGeneratePrefix) {
    try {
      const generatedPrefix = await grokService.generateHeaderPrefix(
        this.title,
        this.confidence || 0
      );
      
      if (generatedPrefix) {
        this.headerPrefix = generatedPrefix;
        console.log(`Generated header prefix for alert "${this.title}": "${generatedPrefix}"`);
      } else {
        console.warn(`Failed to generate header prefix for alert "${this.title}"`);
      }
    } catch (error) {
      console.error(`Error generating header prefix for alert "${this.title}":`, error.message);
      // Don't fail the save if header prefix generation fails
    }
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