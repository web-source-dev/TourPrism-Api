import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import connectDB from "../config/db.js";
import User from "../models/User.js";

/**
 * Seed script to create users and collaborators
 * Creates:
 * - 1 user with role 'user' and 2 collaborators (viewer and manager)
 * - 1 user with role 'admin' and 2 different collaborators (viewer and manager)
 */

// Hash password helper
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Default password for all accounts (change in production!)
const DEFAULT_PASSWORD = "password123";

const seedUsers = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log("✅ Connected to MongoDB\n");

    // Hash default password once
    const hashedPassword = await hashPassword(DEFAULT_PASSWORD);

    // ==================== CREATE USER WITH ROLE 'user' ====================
    console.log("📝 Creating user with role 'user'...");
    
    const userEmail = "user@tourprism.com";
    const existingUser = await User.findOne({ email: userEmail });
    
    let regularUser;
    if (existingUser) {
      console.log(`⚠️  User with email ${userEmail} already exists. Updating...`);
      existingUser.password = hashedPassword;
      existingUser.firstName = "John";
      existingUser.lastName = "User";
      existingUser.role = "user";
      existingUser.isVerified = true;
      existingUser.status = "active";
      existingUser.isPremium = false;
      await existingUser.save();
      regularUser = existingUser;
    } else {
      regularUser = await User.create({
        email: userEmail,
        password: hashedPassword,
        firstName: "John",
        lastName: "User",
        role: "user",
        isVerified: true,
        status: "active",
        isPremium: false,
        collaborators: []
      });
    }

    console.log(`✅ Created/Updated user: ${regularUser.email} (ID: ${regularUser._id})`);

    // Add collaborators for the regular user
    console.log("\n📝 Adding collaborators for user account...");

    const userCollaborators = [
      {
        name: "User Viewer",
        email: "user.viewer@tourprism.com",
        role: "viewer",
        password: hashedPassword,
        status: "active"
      },
      {
        name: "User Manager",
        email: "user.manager@tourprism.com",
        role: "manager",
        password: hashedPassword,
        status: "active"
      }
    ];

    // Check and add/update collaborators for regular user
    for (const collabData of userCollaborators) {
      const existingCollab = regularUser.collaborators.find(
        c => c.email === collabData.email
      );

      if (existingCollab) {
        console.log(`⚠️  Collaborator ${collabData.email} already exists. Updating...`);
        existingCollab.name = collabData.name;
        existingCollab.role = collabData.role;
        existingCollab.password = collabData.password;
        existingCollab.status = collabData.status;
      } else {
        regularUser.collaborators.push(collabData);
        console.log(`✅ Added collaborator: ${collabData.email} (${collabData.role})`);
      }
    }

    await regularUser.save();
    console.log(`✅ User account has ${regularUser.collaborators.length} collaborators`);

    // ==================== CREATE USER WITH ROLE 'admin' ====================
    console.log("\n📝 Creating user with role 'admin'...");
    
    const adminEmail = "admin@tourprism.com";
    const existingAdmin = await User.findOne({ email: adminEmail });
    
    let adminUser;
    if (existingAdmin) {
      console.log(`⚠️  User with email ${adminEmail} already exists. Updating...`);
      existingAdmin.password = hashedPassword;
      existingAdmin.firstName = "Admin";
      existingAdmin.lastName = "User";
      existingAdmin.role = "admin";
      existingAdmin.isVerified = true;
      existingAdmin.status = "active";
      existingAdmin.isPremium = true;
      await existingAdmin.save();
      adminUser = existingAdmin;
    } else {
      adminUser = await User.create({
        email: adminEmail,
        password: hashedPassword,
        firstName: "Admin",
        lastName: "User",
        role: "admin",
        isVerified: true,
        status: "active",
        isPremium: true,
        collaborators: []
      });
    }

    console.log(`✅ Created/Updated admin: ${adminUser.email} (ID: ${adminUser._id})`);

    // Add collaborators for the admin user
    console.log("\n📝 Adding collaborators for admin account...");

    const adminCollaborators = [
      {
        name: "Admin Viewer",
        email: "admin.viewer@tourprism.com",
        role: "viewer",
        password: hashedPassword,
        status: "active"
      },
      {
        name: "Admin Manager",
        email: "admin.manager@tourprism.com",
        role: "manager",
        password: hashedPassword,
        status: "active"
      }
    ];

    // Check and add/update collaborators for admin user
    for (const collabData of adminCollaborators) {
      const existingCollab = adminUser.collaborators.find(
        c => c.email === collabData.email
      );

      if (existingCollab) {
        console.log(`⚠️  Collaborator ${collabData.email} already exists. Updating...`);
        existingCollab.name = collabData.name;
        existingCollab.role = collabData.role;
        existingCollab.password = collabData.password;
        existingCollab.status = collabData.status;
      } else {
        adminUser.collaborators.push(collabData);
        console.log(`✅ Added collaborator: ${collabData.email} (${collabData.role})`);
      }
    }

    await adminUser.save();
    console.log(`✅ Admin account has ${adminUser.collaborators.length} collaborators`);

    // ==================== SUMMARY ====================
    console.log("\n" + "=".repeat(60));
    console.log("✨ SEEDING COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60) + "\n");

    console.log("📋 ACCOUNT SUMMARY:\n");

    console.log("👤 REGULAR USER ACCOUNT:");
    console.log(`   Email: ${regularUser.email}`);
    console.log(`   Password: ${DEFAULT_PASSWORD}`);
    console.log(`   Role: ${regularUser.role}`);
    console.log(`   Status: ${regularUser.status}`);
    console.log(`   Verified: ${regularUser.isVerified}`);
    console.log(`   Premium: ${regularUser.isPremium}`);
    console.log(`   Collaborators:`);
    regularUser.collaborators.forEach((collab, index) => {
      console.log(`     ${index + 1}. ${collab.email} (${collab.role}) - Password: ${DEFAULT_PASSWORD}`);
    });

    console.log("\n👑 ADMIN USER ACCOUNT:");
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Password: ${DEFAULT_PASSWORD}`);
    console.log(`   Role: ${adminUser.role}`);
    console.log(`   Status: ${adminUser.status}`);
    console.log(`   Verified: ${adminUser.isVerified}`);
    console.log(`   Premium: ${adminUser.isPremium}`);
    console.log(`   Collaborators:`);
    adminUser.collaborators.forEach((collab, index) => {
      console.log(`     ${index + 1}. ${collab.email} (${collab.role}) - Password: ${DEFAULT_PASSWORD}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("⚠️  IMPORTANT: Change the default password in production!");
    console.log("=".repeat(60) + "\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error seeding users:", error);
    process.exit(1);
  }
};

// Run the script
seedUsers();

