import mongoose from 'mongoose';

const forecastSendSummarySchema = new mongoose.Schema({
  sentAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  dayOfWeek: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: false
  },
  alertTypes: [{
    type: String
  }],
  recipientCount: {
    type: Number,
    required: true
  },
  recipients: [{
    type: String
  }],
  alertIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Alert'
  }],
  digestType: {
    type: String,
    default: 'weekly'
  },
  sector: {
    type: String
  },
  rawAlerts: [{
    type: Object
  }]
}, {
  timestamps: true
});

export default mongoose.model('ForecastSendSummary', forecastSendSummarySchema);
