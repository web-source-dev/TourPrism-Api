import Subscriber from '../models/subscribers.js';
import Logs from '../models/Logs.js';
import User from '../models/User.js';

export const createSubscriber = async (req, res) => {
  try {
    const { name, email, location, sector } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    console.log(`Creating subscriber for email: ${email}`);
    
    // Check if subscriber already exists
    const existingSubscriber = await Subscriber.findOne({ email });
    console.log(`Existing subscriber check for ${email}:`, existingSubscriber);
    
    if (existingSubscriber) {
      if (existingSubscriber.isActive) {
        console.log(`Subscriber ${email} is already active`);
        return res.status(400).json({ message: 'Email is already subscribed' });
      }
      console.log(`Reactivating subscriber ${email}`);
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
      console.log(`User model update for reactivation (${email}):`, userUpdateResult);
      
      return res.status(200).json({ message: 'Subscription reactivated successfully' });
    }
    
    console.log(`Creating new subscriber for ${email}`);
    const newSubscriber = new Subscriber({
      name,
      email,
      location,
      sector,
      createdAt: new Date(),
    });
    await newSubscriber.save();
    console.log(`New subscriber created:`, newSubscriber);
    
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
    console.log(`User model update for new subscription (${email}):`, userUpdateResult);
    
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

export const updateSubscriberStatusByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean value' });
    }
    console.log(`Updating subscriber status for email: ${email}`);
    const subscriber = await Subscriber.findOne({ email });
    console.log(`Subscriber found:`, subscriber);
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
    console.log(`User model update for status change (${email}, isActive=${isActive}):`, userUpdateResult);
    
    // Log the subscription status change
    await Logs.createLog({
      action: isActive ? 'subscriber_activated' : 'subscriber_deactivated',
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
    
    res.status(200).json({ 
      success: true, 
      message: isActive ? 'Subscription activated successfully' : 'Subscription deactivated successfully' 
    });
  } catch (error) {
    console.error('Error updating subscriber status:', error);
    res.status(500).json({ message: 'Failed to update subscription status', error: error.message });
  }
};
