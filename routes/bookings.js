const express = require('express');
const multer = require('multer');
const {
  uploadBookings,
  getUploads,
  getBookings,
  getBookingSummary,
  getBookingStats,
  updateBookingStatus,
  deleteBooking,
  getBookingsAtRisk
} = require('../controllers/bookingController.js');
const { isAuthenticated } = require('../middleware/auth.js');

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

// Get uploads history
router.get('/uploads', getUploads);

// Get booking summary for dashboard
router.get('/summary', getBookingSummary);

// Get booking statistics
router.get('/stats', getBookingStats);

// Get bookings at risk for an alert
router.get('/at-risk', getBookingsAtRisk);

// Update booking status
router.patch('/:bookingId/status', updateBookingStatus);

// Delete booking
router.delete('/:bookingId', deleteBooking);

module.exports = router;

