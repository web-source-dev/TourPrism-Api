const express = require('express');
const {
  createSubscriber,
  updateSubscriberStatusByEmail,
  checkSubscriber,
  unsubscribe,
  subscribe,
  verifyOtp,
  resendOtp,
} = require('../controllers/subscriberController.js');

const router = express.Router();

// POST /api/subscribers
router.post('/', async (req, res) => {
  // Extract IP and user-agent for logging
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  // Add logging data to the request object
  req.loggingData = {
    ipAddress,
    userAgent
  };

  // Call the controller with the enhanced request
  return createSubscriber(req, res);
});

// GET /api/subscribers/check/:email
router.get('/check/:email', checkSubscriber);

// GET /api/subscribers/check - Check current user's subscription status
router.get('/check', checkSubscriber);

// PUT /api/subscribers/status/:email
router.put('/status/:email', updateSubscriberStatusByEmail);

// GET /unsubscribe
router.get('/unsubscribe', unsubscribe);

// POST /api/subscribers/subscribe - Send OTP for email verification
router.post('/subscribe', subscribe);

// POST /api/subscribers/verify - Verify OTP and activate subscription
router.post('/verify', verifyOtp);

// POST /api/subscribers/resend-otp - Resend OTP
router.post('/resend-otp', resendOtp);

module.exports = router;
