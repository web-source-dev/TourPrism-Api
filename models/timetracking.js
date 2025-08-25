import mongoose from 'mongoose';

const timeTrackingSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    pageName: {
        type: String,
    },
    timeSpent: {
        type: Number,
        default: 0
    },
    openedAt: {
        type: Date,
        default: Date.now
    },
    closedAt: {
        type: Date,
    }
})

const TimeTracking = mongoose.model('TimeTracking', timeTrackingSchema);
export default TimeTracking;
