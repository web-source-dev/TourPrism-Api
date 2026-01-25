const Subscriber = require('../models/subscribers.js');
const Logger = require('../utils/logger.js');
const User = require('../models/User.js');
const sendSubscriptionVerificationEmail = require('../utils/emailTemplates/subscriptionVerification.js');
const sendSubscriptionVerificationResendEmail = require('../utils/emailTemplates/subscriptionVerificationResend.js');

const createSubscriber = async (req, res) => {
  try {
    const { name, email, location } = req.body;
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
      location: location,
      subscriptionType: 'Weekly forecast'
    });

    res.status(201).json({ message: 'Subscription successful', subscriber: newSubscriber });
  } catch (error) {
    console.error('Error creating subscriber:', error);
    res.status(500).json({ message: 'Failed to subscribe', error: error.message });
  }
};

const updateSubscriberStatusByEmail = async (req, res) => {
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
      location: subscriber.location,
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

// Check Subscriber Status
const checkSubscriber = async (req, res) => {
  try {
    const { email } = req.params;

    // If authenticated user, check their subscription status
    if (req.user && req.user.email) {
      const subscriber = await Subscriber.findOne({
        email: req.user.email,
        isActive: true,
        isVerified: true
      });

      return res.json({
        isSubscribed: !!subscriber,
        email: req.user.email,
        location: subscriber ? subscriber.location : []
      });
    }

    // For non-authenticated requests, check by email parameter
    const subscriber = await Subscriber.findOne({ email });

    // Only consider as subscribed if they exist in the Subscriber collection AND are active
    const exists = !!subscriber;
    let isActive = subscriber && subscriber.isActive;

    res.json({
      exists: exists,
      isActive: isActive
    });
  } catch (error) {
    console.error('Error checking subscriber:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Unsubscribe
const unsubscribe = async (req, res) => {
  try {
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

    await Logger.log({ action: 'subscriber_unsubscribed', req, details: {
      location: subscriber.location,
      subscriptionType: 'Weekly forecast'
    }});

    await subscriber.save();
    res.status(200).json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Subscribe with email verification
const subscribe = async (req, res) => {
  try {
    const { email, location } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if subscriber already exists and is active
    const existingSubscriber = await Subscriber.findOne({ email });
    if (existingSubscriber && existingSubscriber.isActive) {
      return res.status(400).json({ message: 'Email is already subscribed' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Set OTP expiry (10 minutes from now)
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

    if (existingSubscriber) {
      // Update existing subscriber with OTP
      existingSubscriber.otp = otp;
      existingSubscriber.otpExpiry = otpExpiry;
      existingSubscriber.location = location || '';
      existingSubscriber.isActive = false; // Will be activated after verification
      await existingSubscriber.save();
    } else {
      // Create new subscriber with OTP
      const newSubscriber = new Subscriber({
        email,
        location: location || '',
        otp,
        otpExpiry,
        isActive: false
      });
      await newSubscriber.save();
    }

    // Send OTP email
    try {
      await sendSubscriptionVerificationEmail(email, otp);
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError);
      return res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
    }

    await Logger.log({ action: 'subscriber_otp_sent', req, details: {
      email,
      location: location || ''
    }});

    res.json({
      message: 'Verification code sent to your email',
      email
    });

  } catch (error) {
    console.error('Error in subscribe:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Verify OTP and activate subscription
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    // Find subscriber with matching email and OTP
    const subscriber = await Subscriber.findOne({
      email,
      otp,
      otpExpiry: { $gt: new Date() } // OTP not expired
    });

    if (!subscriber) {
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }

    // Activate subscription
    subscriber.isActive = true;
    subscriber.otp = undefined; // Clear OTP
    subscriber.otpExpiry = undefined;
    subscriber.lastWeeklyForecastReceived = new Date();
    await subscriber.save();

    // Update user model if exists
    await User.updateOne(
      { email },
      {
        $set: {
          weeklyForecastSubscribed: true,
          weeklyForecastSubscribedAt: new Date(),
          lastWeeklyForecastReceived: new Date()
        }
      }
    );

    await Logger.log(req, 'subscriber_verified', {
      email,
      location: subscriber.location,
      sectors: subscriber.sectors
    });

    res.json({
      message: 'Email verified successfully! You are now subscribed to weekly disruption alerts.',
      subscriber: {
        email: subscriber.email,
        location: subscriber.location,
        subscribedAt: subscriber.createdAt
      }
    });

  } catch (error) {
    console.error('Error in verifyOtp:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Resend OTP
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find subscriber
    const subscriber = await Subscriber.findOne({ email });
    if (!subscriber) {
      return res.status(404).json({ message: 'Subscriber not found' });
    }

    // Check if already active
    if (subscriber.isActive) {
      return res.status(400).json({ message: 'Email is already verified and active' });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Set new OTP expiry (10 minutes from now)
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

    subscriber.otp = otp;
    subscriber.otpExpiry = otpExpiry;
    await subscriber.save();

    // Send OTP email
    try {
      await sendSubscriptionVerificationResendEmail(email, otp);
    } catch (emailError) {
      console.error('Failed to resend OTP email:', emailError);
      return res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
    }

    await Logger.log(req, 'subscriber_otp_resent', { email });

    res.json({
      message: 'New verification code sent to your email',
      email
    });

  } catch (error) {
    console.error('Error in resendOtp:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createSubscriber,
  updateSubscriberStatusByEmail,
  checkSubscriber,
  unsubscribe,
  subscribe,
  verifyOtp,
  resendOtp
};
