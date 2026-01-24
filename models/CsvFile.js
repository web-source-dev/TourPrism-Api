const mongoose = require("mongoose");

const csvFileSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
      unique: true
    },
    fileName: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    filePath: {
      type: String,
      required: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    uploadStats: {
      totalRows: {
        type: Number,
        default: 0
      },
      successfulAlerts: {
        type: Number,
        default: 0
      },
      failedRows: {
        type: Number,
        default: 0
      }
    },
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active'
    },
    deletedAt: Date
  },
  { timestamps: true }
);

// Index for efficient queries
csvFileSchema.index({ uploadedBy: 1, status: 1, createdAt: -1 });

const CsvFile = mongoose.model("CsvFile", csvFileSchema);
module.exports = CsvFile;
