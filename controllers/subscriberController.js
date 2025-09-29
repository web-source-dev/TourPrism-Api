import Subscriber from '../models/subscribers.js';
import Logger from '../utils/logger.js';
import User from '../models/User.js';

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
      
      // Update the user model as well
      const userUpdateResult = await User.updateOne(
        { email: email }, 
        { 
          $set: { 
            weeklyForecastSubscribed: true,
            weeklyForecastSubscribedAt: new Date()
          } 
        }
      );
      
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
    
    // Update the user model as well
    const userUpdateResult = await User.updateOne(
      { email: email }, 
      { 
        $set: { 
          weeklyForecastSubscribed: true,
          weeklyForecastSubscribedAt: new Date()
        } 
      }
    );
    
    // Log the new subscription
    await Logger.logCRUD('create', req, 'Subscriber', newSubscriber._id, {
      email: email,
      sector: Array.isArray(sector) ? sector.join(', ') : sector,
      location: Array.isArray(location) ? location.map(loc => loc.name).join(', ') : location,
      subscriptionType: 'Weekly forecast'
    });
    
    res.status(201).json({ message: 'Subscription successful', subscriber: newSubscriber });
  } catch (error) {
    console.error('Error creating subscriber:', error);
    res.status(500).json({ message: 'Failed to subscribe', error: error.message });
  }
};

export const updateSubscriberStatusByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean value' });
    }
    const subscriber = await Subscriber.findOne({ email });
    if (!subscriber) {
      return res.status(404).json({ message: 'Subscriber not found' });
    }
    
    subscriber.isActive = isActive;
    await subscriber.save();
    
    // Update the user model as well
    const updateData = { weeklyForecastSubscribed: isActive };
    if (isActive) {
      updateData.weeklyForecastSubscribedAt = new Date();
    }
    
    const userUpdateResult = await User.updateOne(
      { email: email }, 
      { $set: updateData }
    );
    
    // Log the subscription status change
    await Logger.logCRUD('update', req, 'Subscriber status', subscriber._id, {
      email: email,
      isActive: isActive,
      sector: Array.isArray(subscriber.sector) ? subscriber.sector.join(', ') : subscriber.sector,
      location: Array.isArray(subscriber.location) ? subscriber.location.map(loc => loc.name).join(', ') : subscriber.location,
      subscriptionType: 'Weekly forecast'
    });
    
    res.status(200).json({ 
      success: true, 
      message: isActive ? 'Subscription activated successfully' : 'Subscription deactivated successfully' 
    });
  } catch (error) {
    console.error('Error updating subscriber status:', error);
    res.status(500).json({ message: 'Failed to update subscription status', error: error.message });
  }
};
