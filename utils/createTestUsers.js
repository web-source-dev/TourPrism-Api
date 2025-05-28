import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected for test user creation'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Password for all test users
const TEST_PASSWORD = 'Test123!';

// Function to hash password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Test users configuration
const testUsers = [
  // Regular users
  {
    email: 'user@test.com',
    firstName: 'Regular',
    lastName: 'User',
    role: 'user',
    isVerified: true
  },
  
  // Admin users
  {
    email: 'admin@test.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    isVerified: true
  },
  
  // SuperAdmin users
  {
    email: 'superadmin@test.com',
    firstName: 'Super',
    lastName: 'Admin',
    role: 'superadmin',
    isVerified: true
  },
  
  // Manager role
  {
    email: 'manager@test.com',
    firstName: 'Manager',
    lastName: 'User',
    role: 'manager',
    isVerified: true
  },
  
  // Viewer role
  {
    email: 'viewer@test.com',
    firstName: 'Viewer',
    lastName: 'User',
    role: 'viewer',
    isVerified: true
  },
  
  // Editor role
  {
    email: 'editor@test.com',
    firstName: 'Editor',
    lastName: 'User',
    role: 'editor',
    isVerified: true
  },
  
  // User with collaborators
  {
    email: 'teamowner@test.com',
    firstName: 'Team',
    lastName: 'Owner',
    role: 'user',
    isVerified: true,
    collaborators: [
      {
        email: 'collab-viewer@test.com',
        role: 'viewer'
      },
      {
        email: 'collab-manager@test.com',
        role: 'manager'
      }
    ]
  }
];

// Create test users
const createTestUsers = async () => {
  const hashedPassword = await hashPassword(TEST_PASSWORD);
  
  // For any user with collaborators, also hash their passwords
  for (const user of testUsers) {
    if (user.collaborators) {
      for (const collaborator of user.collaborators) {
        collaborator.password = hashedPassword;
      }
    }
    
    // Set the user's password
    user.password = hashedPassword;
  }
  
  try {
    // Clear existing test users
    console.log('Removing existing test users...');
    const emailsToDelete = testUsers.map(user => user.email);
    const collaboratorEmailsToCheck = testUsers
      .filter(user => user.collaborators)
      .flatMap(user => user.collaborators.map(c => c.email));
    
    const allEmailsToDelete = [...emailsToDelete, ...collaboratorEmailsToCheck];
    
    await User.deleteMany({ 
      email: { $in: allEmailsToDelete } 
    });
    
    // Create new test users
    console.log('Creating test users...');
    await User.create(testUsers);
    
    console.log('Test users created successfully!');
    console.log('================================');
    console.log('User credentials:');
    console.log('Password for all users:', TEST_PASSWORD);
    
    // Display user info
    testUsers.forEach(user => {
      console.log(`\n${user.firstName} ${user.lastName} (${user.role})`);
      console.log(`Email: ${user.email}`);
      
      if (user.collaborators && user.collaborators.length > 0) {
        console.log('Collaborators:');
        user.collaborators.forEach(collaborator => {
          console.log(`  - ${collaborator.email} (${collaborator.role})`);
        });
      }
    });
    
    console.log('\nCollaborator Login Credentials:');
    collaboratorEmailsToCheck.forEach(email => {
      console.log(`Email: ${email}`);
      console.log(`Password: ${TEST_PASSWORD}`);
    });
    
    console.log('\nTest user creation completed!');
  } catch (error) {
    console.error('Error creating test users:', error);
  } finally {
    // Disconnect from the database
    mongoose.disconnect();
  }
};

// Run the function
createTestUsers(); 