#!/usr/bin/env node

/**
 * Service Initialization Script
 * Initializes all backend services and configurations
 */

import dotenv from 'dotenv';
import { initializeServices } from '../config/index.js';

// Load environment variables
dotenv.config();

async function main() {
  try {
    console.log('🚀 Starting Tourprism Backend Service Initialization...\n');

    // Check Node.js version
    const nodeVersion = process.versions.node;
    console.log(`📦 Node.js version: ${nodeVersion}`);

    // Check environment
    const env = process.env.NODE_ENV || 'development';
    console.log(`🌍 Environment: ${env}\n`);

    // Initialize all services
    await initializeServices();

    console.log('\n✅ All services initialized successfully!');
    console.log('🎯 Backend is ready for alert processing and scheduling.');

    // Keep process alive for cron jobs
    if (process.env.NODE_ENV === 'production') {
      console.log('⏰ Scheduler is running. Press Ctrl+C to stop.');
      process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down gracefully...');
        process.exit(0);
      });
    } else {
      console.log('⏰ Scheduler initialized. Exiting initialization script.');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Service initialization failed:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main();
