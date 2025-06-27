import Subscriber from '../models/subscribers.js';
import Logs from '../models/Logs.js';

export const createSubscriber = async (req, res) => {
  try {
    const { name, email, location, sector } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    // Check if subscriber already exists
    const existingSubscriber = await Subscriber.findOne({ email });
    if (existingSubscriber) {
      if (existingSubscriber.isActive) {
        return res.status(400).json({ message: 'Email is already subscribed' });
      }
      existingSubscriber.isActive = true;
      await existingSubscriber.save();
      return res.status(200).json({ message: 'Subscription reactivated successfully' });
    }
    
    const newSubscriber = new Subscriber({
      name,
      email,
      location,
      sector,
      createdAt: new Date(),
    });
    await newSubscriber.save();
    
    // Log the new subscription
    await Logs.createLog({
      action: 'subscriber_added',
      userEmail: email,
      userName: name || email.split('@')[0],
      details: {
        sector,
        location: Array.isArray(location) ? location.map(loc => loc.name).join(', ') : location,
        subscriptionType: 'Weekly forecast'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.status(201).json({ message: 'Subscription successful', subscriber: newSubscriber });
  } catch (error) {
    console.error('Error creating subscriber:', error);
    res.status(500).json({ message: 'Failed to subscribe', error: error.message });
  }
};
