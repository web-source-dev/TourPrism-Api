import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import passport from "passport";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.js";
import alertRoutes from "./routes/alerts.js";
import notificationRoutes from "./routes/notificationSystem.js";
import bulkAlertRoutes from "./routes/BulkAlerts.js";
import adminRoutes from "./routes/admin.js";
import profileRoutes from "./routes/Profile.js";
import archivedAlertRoutes from "./routes/archivedAlerts.js";
import actionHubRoutes from "./routes/action-hub.js";
import summaryRoutes from "./routes/summaries.js";
import brevoAnalyticsRoutes from "./routes/brevoAnalytics.js";
import subscribersRoutes from "./routes/subscribers.js";
import logsRoutes from "./routes/logs.js";
import automatedAlertRoutes from "./routes/automatedAlerts.js";
import autoUpdateRoutes from "./routes/autoUpdates.js";
import timeTrackingRoutes from "./routes/timetracking.js";
import alertMetricsRoutes from "./routes/alertMetrics.js";
import { scheduleWeeklyDigests } from "./utils/weeklyAlertDigest.js";
import { scheduleAutomatedAlerts } from "./utils/automatedAlertGenerator.js";
import { scheduleAutoUpdates } from "./utils/autoUpdateSystem.js";
import { scheduleAlertArchiving, setSocketIO } from "./utils/alertArchiver.js";

import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// CORS configuration - moved to the very beginning
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      "https://www.tourprism.com",
      "https://tourprism.com", 
      "http://localhost:3000", 
      "http://localhost:3001"
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
    origin: ["https://www.tourprism.com","https://tourprism.com", "http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  }
});

// Set socket.io instance for alert archiver
setSocketIO(io);

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log("New client connected");
  
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

export { io };

app.use(express.json());
app.use(passport.initialize());

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/auth", authRoutes);
app.use("/api/alerts", alertRoutes);

// Add notification routes
app.use("/api/notifications", notificationRoutes);

// Add bulk alerts routes
app.use("/api/bulk-alerts", bulkAlertRoutes);

// Add archived alerts routes
app.use("/api/archived-alerts", archivedAlertRoutes);

// Add admin routes
app.use("/api/admin", adminRoutes);

// Add profile routes
app.use("/profile", profileRoutes);

// Add action hub routes
app.use("/api/action-hub", actionHubRoutes);

// Add summary routes
app.use("/api/summaries", summaryRoutes);

// Add Brevo email analytics routes
app.use("/api/email-analytics", brevoAnalyticsRoutes);

// Add subscribers routes
app.use("/api/subscribers", subscribersRoutes);

// Add logs routes
app.use("/api/logs", logsRoutes);

// Add automated alerts routes
app.use("/api/automated-alerts", automatedAlertRoutes);

// Add auto-update routes
app.use("/api/auto-updates", autoUpdateRoutes);

// Add time tracking routes
app.use("/api/time-tracking", timeTrackingRoutes);

// Add alert metrics routes
app.use("/api/alert-metrics", alertMetricsRoutes);

connectDB();
const HOST = "0.0.0.0"; // Allows external connections
const PORT = process.env.PORT || 8000;

// Schedule weekly digest emails
scheduleWeeklyDigests();

// Schedule automated alert generation
scheduleAutomatedAlerts();

// Schedule auto-update system
scheduleAutoUpdates();

// Schedule alert archiving
scheduleAlertArchiving();

// Use httpServer instead of app
httpServer.listen(PORT, HOST, () => console.log(`Server running on port ${PORT}`));
