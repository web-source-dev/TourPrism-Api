import express from 'express';
import Logs from '../models/Logs.js';
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
    
    // Also check the User model for weeklyForecastSubscribed status
    const user = await User.findOne({ email });
    
    // Determine subscription status from both models
    // If either model shows active subscription, consider it active
    const isActive = (subscriber && subscriber.isActive) || (user && user.weeklyForecastSubscribed);
    
    res.json({
      exists: !!subscriber,
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

  await Logs.createLog({
    action: 'subscriber_unsubscribed',
    userEmail: email,
    userName: subscriber.name || email.split('@')[0],
    details: {
      sector: subscriber.sector,
      location: Array.isArray(subscriber.location) ? subscriber.location.map(loc => loc.name).join(', ') : subscriber.location,
      subscriptionType: 'Weekly forecast'
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  await subscriber.save();
  res.status(200).json({ message: 'Unsubscribed successfully' });
});

export default router;
