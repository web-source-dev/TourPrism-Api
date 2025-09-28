import express from 'express';
import Logger from '../utils/logger.js';
import { createSubscriber, updateSubscriberStatusByEmail } from '../controllers/subscriberController.js';
import Subscriber from '../models/subscribers.js';
import User from '../models/User.js';

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
router.get('/check/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const subscriber = await Subscriber.findOne({ email });
    
    // Only consider as subscribed if they exist in the Subscriber collection AND are active
    const exists = !!subscriber;
    let isActive = subscriber && subscriber.isActive;
    
    console.log(`Subscriber check for ${email}: exists=${exists}, isActive=${isActive}, subscriber:`, subscriber);
    
    res.json({
      exists: exists,
      isActive: isActive
    });
  } catch (error) {
    console.error('Error checking subscriber:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/subscribers/status/:email
router.put('/status/:email', async (req, res) => {
  return updateSubscriberStatusByEmail(req, res);
});

// GET /unsubscribe
router.get('/unsubscribe', async (req, res) => {
  const { email } = req.query;
  const subscriber = await Subscriber.findOne({ email });
  if (!subscriber) {
    return res.status(404).json({ message: 'Subscriber not found' });
  }

  subscriber.isActive = false;
  
  // Also update the user model
  await User.updateOne(
    { email: email },
    { $set: { weeklyForecastSubscribed: false } }
  );

  await Logger.log(req, 'subscriber_unsubscribed', {
    sector: Array.isArray(subscriber.sector) ? subscriber.sector.join(', ') : subscriber.sector,
    location: Array.isArray(subscriber.location) ? subscriber.location.map(loc => loc.name).join(', ') : subscriber.location,
    subscriptionType: 'Weekly forecast'
  });

  await subscriber.save();
  res.status(200).json({ message: 'Unsubscribed successfully' });
});

export default router;
