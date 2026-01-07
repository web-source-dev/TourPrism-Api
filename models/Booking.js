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
    required: true,
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

module.exports = Booking;

