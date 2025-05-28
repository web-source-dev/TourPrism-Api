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

import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["https://www.tourprism.com","https://tourprism.com", "http://localhost:3000", "http://localhost:3001"],
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

export { io };

app.use(
  cors({
    origin: ["https://www.tourprism.com","https://tourprism.com", "http://localhost:3000", "http://localhost:3001"], // ✅ Correct way
    methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS",
    credentials: true, // ✅ Allow cookies & authentication headers
  })
);


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

connectDB();
const HOST = "0.0.0.0"; // Allows external connections
const PORT = process.env.PORT || 5000;

// Use httpServer instead of app
httpServer.listen(PORT, HOST, () => console.log(`Server running on port ${PORT}`));
