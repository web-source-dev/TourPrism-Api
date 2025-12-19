const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const passport = require("passport");
const connectDB = require("./config/db.js");
const authRoutes = require("./routes/auth.js");
const profileRoutes = require("./routes/profile.js");
const alertRoutes = require("./routes/alerts.js");
const bookingRoutes = require("./routes/bookings.js");
const adminRoutes = require("./routes/admin.js");
const subscribersRoutes = require("./routes/subscribers.js");
const logsRoutes = require("./routes/logs.js");
const { optionalAuth } = require("./middleware/auth.js");
const { createServer } = require("http");
const { Server } = require("socket.io"); 

const app = express();
const httpServer = createServer(app);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "https://www.tourprism.com",
      "https://tourprism.com",
      "https://vos.local",
      "https://api.vos.local",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://192.168.1.8:3000"
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Origin", 
    "X-Requested-With", 
    "Content-Type", 
    "Accept", 
    "Authorization",
    "Cache-Control"
  ],
  credentials: true,
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
  preflightContinue: false
};

// Apply CORS middleware first
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));
// Error handling middleware for CORS
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    console.log('CORS Error:', err.message);
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed',
      origin: req.headers.origin
    });
  }
  next(err);
});

const io = new Server(httpServer, {
  cors: {
    origin: ["https://www.tourprism.com","https://tourprism.com", "https://vos.local", "https://api.vos.local", "http://localhost:3000", "http://localhost:3001","http://192.168.1.8:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  }
});
// Socket.io connection handler
io.on("connection", (socket) => {
  console.log("New client connected");
  
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

module.exports = { io };

// Cookie parser needs to be early for authentication to work
app.use(cookieParser());

// File upload routes need to be defined before JSON parsing middleware
app.use("/api/bookings", bookingRoutes);

app.use(express.json());
app.use(passport.initialize());

app.use(optionalAuth);

app.use("/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/subscribers", subscribersRoutes);
app.use("/api/logs", logsRoutes);

connectDB();
const HOST = "0.0.0.0";
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, HOST, () => console.log(`Server running on port ${PORT}`));