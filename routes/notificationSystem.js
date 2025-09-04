import express from "express";
import Notification from "../models/NotificationSys.js";
import User from "../models/User.js";
import Logs from "../models/Logs.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Get all notifications for the authenticated user
router.get("/", authenticate, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.userId })
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: "Error fetching notifications" });
  }
});

// Mark notification as read
router.patch("/:id/read", authenticate, async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId: req.userId },
      { isRead: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: "Error updating notification" });
  }
});

// Delete notification
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    // First find the notification to get its details for logging
    const notification = await Notification.findOne({
      _id: notificationId,
      userId: req.userId
    });
    
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    
    // Then delete it
    await Notification.findOneAndDelete({
      _id: notificationId,
      userId: req.userId
    });
    
    // Log notification deletion
    try {
      const user = await User.findById(req.userId).select('firstName lastName email');
      
      await Logs.createLog({
        userId: req.userId,
        userEmail: req.userEmail || user?.email,
        userName: user ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : (user.firstName || user.email?.split('@')[0])) : 'Unknown',
        action: 'notification_deleted',
        details: {
          notificationId,
          notificationType: notification.notificationType || 'general',
          title: notification.title
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging notification deletion:', error);
      // Continue execution even if logging fails
    }
    
    res.json({ message: "Notification deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting notification" });
  }
});

// Add this new route to mark all notifications as read
router.patch("/mark-all-read", authenticate, async (req, res) => {
  try {
    // Count unread notifications before update for logging
    const unreadCount = await Notification.countDocuments({ 
      userId: req.userId, 
      isRead: false 
    });
    
    // Mark all as read
    await Notification.updateMany(
      { userId: req.userId, isRead: false },
      { isRead: true }
    );
    
    // Log marking all notifications as read
    try {
      const user = await User.findById(req.userId).select('firstName lastName email');
      
      await Logs.createLog({
        userId: req.userId,
        userEmail: req.userEmail || user?.email,
        userName: user ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : (user.firstName || user.email?.split('@')[0])) : 'Unknown',
        action: 'notifications_all_read',
        details: {
          count: unreadCount
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging mark all read:', error);
      // Continue execution even if logging fails
    }
    
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error updating notifications" });
  }
});

export default router;