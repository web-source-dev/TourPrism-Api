const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema({
    name: {
        type: String,
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    location: [
        {
        name: String,
        latitude: Number,
        longitude: Number,
        placeId: String
        }
    ],
    sectors: {
        type: [String],
        default: []
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastWeeklyForecastReceived: {
        type: Date,
    }
},
{
    timestamps: true,
}
)

module.exports = mongoose.model('Subscriber', subscriberSchema);