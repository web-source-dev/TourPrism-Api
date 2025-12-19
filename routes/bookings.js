import express from 'express';
import multer from 'multer';
import {
  uploadBookings,
  getBookings,
  getBookingStats,
  updateBookingStatus,
  deleteBooking,
  getBookingsAtRisk
} from '../controllers/bookingController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is CSV
    if (file.mimetype === 'text/csv' ||
        file.mimetype === 'application/csv' ||
        file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// All routes require authentication
router.use(isAuthenticated);

// Upload CSV bookings
router.post('/upload', upload.single('bookingsFile'), uploadBookings);

// Get bookings with pagination and filters
router.get('/', getBookings);

// Get booking statistics
router.get('/stats', getBookingStats);

// Get bookings at risk for an alert
router.get('/at-risk', getBookingsAtRisk);

// Update booking status
router.patch('/:bookingId/status', updateBookingStatus);

// Delete booking
router.delete('/:bookingId', deleteBooking);

export default router;

