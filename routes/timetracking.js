import express from 'express';
import mongoose from 'mongoose';
import TimeTracking from '../models/timetracking.js';
import { authenticate } from '../middleware/auth.js';
const router = express.Router();

// Start time tracking session
router.post('/start', authenticate, async (req, res) => {
    try {
        const { pageName } = req.body;
        const userId = req.userId;

        // Create new time tracking record
        const timeTracking = new TimeTracking({
            userId: new mongoose.Types.ObjectId(userId),
            pageName: pageName || 'feed',
            openedAt: new Date()
        });

        await timeTracking.save();

        res.status(201).json({
            success: true,
            message: 'Time tracking started',
            timeTrackingId: timeTracking._id
        });
    } catch (error) {
        console.error('Error starting time tracking:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start time tracking'
        });
    }
});

// End time tracking session
router.post('/end', authenticate, async (req, res) => {
    try {
        const { timeTrackingId } = req.body;
        const userId = req.userId;

        const timeTracking = await TimeTracking.findOne({
            _id: timeTrackingId,
            userId: new mongoose.Types.ObjectId(userId),
            closedAt: null
        });

        if (!timeTracking) {
            return res.status(404).json({
                success: false,
                message: 'Time tracking session not found'
            });
        }

        const closedAt = new Date();
        const timeSpent = Math.floor((closedAt - timeTracking.openedAt) / 1000); // Time in seconds

        timeTracking.closedAt = closedAt;
        timeTracking.timeSpent = timeSpent;

        await timeTracking.save();

        res.json({
            success: true,
            message: 'Time tracking ended',
            timeSpent
        });
    } catch (error) {
        console.error('Error ending time tracking:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to end time tracking'
        });
    }
});

// Get user's time tracking history for feed page
router.get('/feed-history', authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const { page = 1, limit = 10 } = req.query;

        const timeTrackings = await TimeTracking.find({
            userId: new mongoose.Types.ObjectId(userId),
            pageName: 'feed'
        })
        .sort({ openedAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

        const totalCount = await TimeTracking.countDocuments({
            userId: new mongoose.Types.ObjectId(userId),
            pageName: 'feed'
        });

        // Calculate total time spent on feed
        const totalTimeSpent = await TimeTracking.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    pageName: 'feed',
                    closedAt: { $ne: null }
                }
            },
            {
                $group: {
                    _id: null,
                    totalTime: { $sum: '$timeSpent' }
                }
            }
        ]);

        res.json({
            success: true,
            timeTrackings,
            totalCount,
            totalTimeSpent: totalTimeSpent[0]?.totalTime || 0,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / parseInt(limit))
        });
    } catch (error) {
        console.error('Error fetching time tracking history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch time tracking history'
        });
    }
});

// Get current active session
router.get('/active-session', authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const { pageName = 'feed' } = req.query;

        const activeSession = await TimeTracking.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            pageName,
            closedAt: null
        });

        res.json({
            success: true,
            activeSession
        });
    } catch (error) {
        console.error('Error fetching active session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active session'
        });
    }
});

export default router;