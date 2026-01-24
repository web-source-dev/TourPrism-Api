const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    console.log("Connecting to MongoDB... ", process.env.MONGO_URI);
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("Missing Mongo connection string: set MONGO_URI (or MONGODB_URI)");
    }

    await mongoose.connect(uri);
    console.log("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
