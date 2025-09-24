import mongoose from "mongoose";

const citySearchSchema = new mongoose.Schema(
  {
    email: { 
      type: String, 
      required: true,
      lowercase: true,
      trim: true
    },
    searchedCity: { 
      type: String, 
      required: true,
      trim: true
    },
    cityName: {
      type: String,
      trim: true
    },
    latitude: {
      type: Number
    },
    longitude: {
      type: Number
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false // Optional - only if user is logged in
    },
    isAuthenticated: {
      type: Boolean,
      default: false
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    }
  },
  { 
    timestamps: true 
  }
);

// Index for efficient queries
citySearchSchema.index({ email: 1, searchedCity: 1 });
citySearchSchema.index({ userId: 1 });
citySearchSchema.index({ createdAt: -1 });

const CitySearch = mongoose.model("CitySearch", citySearchSchema);
export default CitySearch;
