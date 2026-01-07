const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// User data to seed
const usersToSeed = [
  {
    email: 'ashanhawks@yahoo.com',
    company: {
      name: 'Royal Mile Inn',
      contactName: 'Ashan Abeyratne',
      city: 'Edinburgh',
      rooms: 70,
      avgRoomRate: Math.floor(Math.random() * (175 - 100 + 1)) + 100, // Random between 100-175
      size: 'medium', // 70 rooms > 50 = medium
      incentives: ['Free Parking', 'Late Check-out', 'Breakfast Included']
    }
  },
  {
    email: 'ashanhawks@gmail.com',
    company: {
      name: 'West End Boutique',
      contactName: 'Ashan Abeyratne',
      city: 'London',
      rooms: 120,
      avgRoomRate: Math.floor(Math.random() * (175 - 100 + 1)) + 100, // Random between 100-175
      size: 'medium', // 120 rooms > 50 = medium
      incentives: ['Room Upgrades', 'Spa Credits', 'Welcome Drinks']
    }
  },
  {
    email: 'aabeyratne@tab.global',
    company: {
      name: 'Castle View Guesthouse',
      contactName: 'Ashan Abeyratne',
      city: 'Edinburgh',
      rooms: 45,
      avgRoomRate: Math.floor(Math.random() * (175 - 100 + 1)) + 100, // Random between 100-175
      size: 'small', // 45 rooms = 16-50 = small
      incentives: ['Free Cancellation', 'Loyalty Points', 'Airport Transfer']
    }
  }
];

async function seedUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/TourPrism', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Hash the password once
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Password123@', salt);
    console.log('Password hashed');

    const createdUsers = [];

    for (const userData of usersToSeed) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        console.log(`User ${userData.email} already exists, skipping...`);
        continue;
      }

      // Create new user
      const newUser = new User({
        email: userData.email,
        password: hashedPassword,
        isPremium: true, // All users are premium
        isVerified: true, // All users are verified
        role: 'user', // All have user role
        status: 'active',
        lastLogin: new Date(),
        company: userData.company,
        collaborators: []
      });

      const savedUser = await newUser.save();
      createdUsers.push(savedUser);

      console.log(`Created user: ${savedUser.email} (${savedUser.company.name})`);
      console.log(`  - City: ${savedUser.company.city}`);
      console.log(`  - Rooms: ${savedUser.company.rooms}`);
      console.log(`  - Size: ${savedUser.company.size}`);
      console.log(`  - Avg Rate: £${savedUser.company.avgRoomRate}`);
      console.log(`  - Incentives: ${savedUser.company.incentives.join(', ')}`);
      console.log('---');
    }

    console.log(`\nSeeding completed! Created ${createdUsers.length} users.`);

    // Show summary
    console.log('\nSummary of created users:');
    createdUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.company.name} (${user.company.city}) - ${user.company.rooms} rooms - £${user.company.avgRoomRate}/night`);
    });

  } catch (error) {
    console.error('Error seeding users:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the seeding function
seedUsers();
