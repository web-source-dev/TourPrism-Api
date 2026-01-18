const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  // Reference to the hotel/user who owns this booking
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Booking identification
  bookingId: {
    type: String,
    required: true,
    index: true
  },

  // Guest information
  guestFirstName: {
    type: String,
    required: true,
    trim: true
  },
  guestEmail: {
    type: String,
    trim: true,
    lowercase: true
  },

  // Booking dates
  checkInDate: {
    type: Date,
    required: true,
    index: true
  },
  nights: {
    type: Number,
    required: true,
    min: 1
  },

  // Financial information
  bookingRate: {
    type: Number,
    required: true,
    min: 0
  },
  roomType: {
    type: String,
    required: true,
    trim: true
  },

  // Source information
  bookingSource: {
    type: String,
    required: true,
    trim: true
  },

  // Upload tracking
  importBatch: {
    type: String,
    index: true
  },
  fileName: {
    type: String,
    trim: true
  }
}, { timestamps: true });

// Compound indexes for efficient queries
bookingSchema.index({ hotelId: 1, checkInDate: 1 });

// Virtual for checkout date
bookingSchema.virtual('checkOutDate').get(function() {
  const checkOut = new Date(this.checkInDate);
  checkOut.setDate(checkOut.getDate() + this.nights);
  return checkOut;
});

// Virtual for total revenue
bookingSchema.virtual('totalRevenue').get(function() {
  return this.bookingRate * this.nights;
});

const Booking = mongoose.model('Booking', bookingSchema);

// Upload tracking model
const uploadSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  originalFileName: {
    type: String,
    required: true,
    trim: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  totalRecords: {
    type: Number,
    required: true,
    default: 0
  },
  successfulRecords: {
    type: Number,
    required: true,
    default: 0
  },
  failedRecords: {
    type: Number,
    required: true,
    default: 0
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  errorDetails: [{
    row: Number,
    field: String,
    message: String
  }],
  importBatch: {
    type: String,
    required: true,
    unique: true,
    index: true
  }
}, { timestamps: true });

const Upload = mongoose.model('Upload', uploadSchema);

module.exports = { Booking, Upload };

