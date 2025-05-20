import express from "express";
import Notification from "../models/NotificationSys.js";
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
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
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
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });
    
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    
    res.json({ message: "Notification deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting notification" });
  }
});

// Add this new route to mark all notifications as read
router.patch("/mark-all-read", authenticate, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.userId, isRead: false },
      { isRead: true }
    );
    
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error updating notifications" });
  }
});

export default router;