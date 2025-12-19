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
  },

  // Status tracking
  status: {
    type: String,
    enum: ['active', 'cancelled', 'completed', 'no_show'],
    default: 'active'
  },

  // Risk assessment
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },

  // Associated alerts (for impact tracking)
  associatedAlerts: [{
    alertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Alert'
    },
    impact: {
      nightsAtRisk: Number,
      poundsAtRisk: Number,
      recoveryRate: Number
    }
  }],

  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },

  // Import tracking
  importBatch: {
    type: String,
    index: true
  },
  importDate: {
    type: Date,
    default: Date.now
  }
});

// Compound indexes for efficient queries
bookingSchema.index({ hotelId: 1, checkInDate: 1 });
bookingSchema.index({ hotelId: 1, status: 1 });
bookingSchema.index({ hotelId: 1, riskLevel: 1 });
bookingSchema.index({ checkInDate: 1, status: 1 });

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

// Pre-save middleware to update the updatedAt field
bookingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get bookings at risk for a given date range and alert
bookingSchema.statics.getBookingsAtRisk = async function(hotelId, startDate, endDate, alertId = null) {
  const query = {
    hotelId,
    status: 'active',
    checkInDate: {
      $gte: new Date(startDate),
      $lt: new Date(endDate)
    }
  };

  if (alertId) {
    query.associatedAlerts = {
      $elemMatch: { alertId: alertId }
    };
  }

  return this.find(query).sort({ checkInDate: 1 });
};

// Static method to calculate revenue at risk
bookingSchema.statics.calculateRevenueAtRisk = async function(hotelId, startDate, endDate) {
  const pipeline = [
    {
      $match: {
        hotelId: new mongoose.Types.ObjectId(hotelId),
        status: 'active',
        checkInDate: {
          $gte: new Date(startDate),
          $lt: new Date(endDate)
        }
      }
    },
    {
      $group: {
        _id: null,
        totalBookings: { $sum: 1 },
        totalRevenue: { $sum: { $multiply: ['$bookingRate', '$nights'] } },
        avgRoomRate: { $avg: '$bookingRate' },
        dateRange: {
          min: { $min: '$checkInDate' },
          max: { $max: '$checkInDate' }
        }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalBookings: 0,
    totalRevenue: 0,
    avgRoomRate: 0,
    dateRange: { min: null, max: null }
  };
};

// Instance method to update risk level
bookingSchema.methods.updateRiskLevel = async function(newRiskLevel) {
  this.riskLevel = newRiskLevel;
  return this.save();
};

// Instance method to associate with an alert
bookingSchema.methods.associateWithAlert = async function(alertId, impact) {
  // Check if alert is already associated
  const existingAssociation = this.associatedAlerts.find(
    assoc => assoc.alertId.toString() === alertId.toString()
  );

  if (!existingAssociation) {
    this.associatedAlerts.push({
      alertId,
      impact,
      associatedAt: new Date()
    });
    return this.save();
  }

  return this;
};

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;

