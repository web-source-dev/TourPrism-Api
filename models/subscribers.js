import mongoose from 'mongoose';

const subscriberSchema = new mongoose.Schema({
    name: {
        type: String,
    },
    email: {
        type: String,
    },
    location: [
        {
        name: String,
        latitude: Number,
        longitude: Number,
        placeId: String
        }
    ],

    sector: {
        type: String,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
    }
},
{
    timestamps: true,
}
)

export default mongoose.model('Subscriber', subscriberSchema);