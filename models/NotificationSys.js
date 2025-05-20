import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    enum: ['alert', 'system', 'user'],
    default: 'system'
  },
  risk: {
    type: String,
  }
}, { timestamps: true });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;