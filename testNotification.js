import mongoose from 'mongoose';
import Notification from './models/NotificationSys.js';
import User from './models/User.js'; // Assuming you have a User model
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));
  
  const randomRisk = () => {
    const risks = ['low', 'medium', 'high', 'critical'];
    return risks[Math.floor(Math.random() * risks.length)];
  }

const createTestNotifications = async () => {
  try {
    const users = await User.find();
    if (users.length === 0) {
      console.log('No users found.');
      return;
    }

  
    const notifications = users.flatMap(user => 
      Array.from({ length: 10 }, (_, i) => ({
        userId: user._id,
        title: `Test Notification ${i + 1}`,
        message: `This is test notification number ${i + 1}.`,
        type: 'alert',
        risk: randomRisk()
      }))
    );

    await Notification.insertMany(notifications);
    console.log(`Created ${notifications.length} test notifications.`);
  } catch (error) {
    console.error('Error creating notifications:', error);
  } finally {
    mongoose.connection.close();
  }
};

createTestNotifications();
