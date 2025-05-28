import mongoose from 'mongoose';

const actionLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: {
    type: String
  },
  actionType: {
    type: String,
    enum: ['follow', 'resolve', 'note_added', 'notify_guests', 'edit', 'mark_handled'],
    required: true
  },
  actionDetails: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const guestSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true
  },
  name: {
    type: String
  },
  notificationSent: {
    type: Boolean,
    default: false
  },
  sentTimestamp: {
    type: Date
  }
});

const noteSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date
  }
});

const actionHubSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  alert: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Alert',
    required: true
  },
  alertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Alert'
  },
  status: {
    type: String,
    enum: ['new', 'in_progress', 'handled'],
    default: 'new'
  },
  isFollowing: {
    type: Boolean,
    default: true
  },
  handledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  handledAt: {
    type: Date
  },
  currentActiveTab: {
    type: String,
    enum: ['notify_guests', 'add_notes'],
    default: 'notify_guests'
  },
  guests: [guestSchema],
  notes: [noteSchema],
  actionLogs: [actionLogSchema],
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  flagged: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });
const ActionHub = mongoose.model('ActionHub', actionHubSchema);
export default ActionHub; 