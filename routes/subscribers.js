const express = require('express');
const {
  createSubscriber,
  updateSubscriberStatusByEmail,
  checkSubscriber,
  unsubscribe,
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

// PUT /api/subscribers/status/:email
router.put('/status/:email', updateSubscriberStatusByEmail);

// GET /unsubscribe
router.get('/unsubscribe', unsubscribe);

module.exports = router;
