// Backend configuration and service exports
export { default as connectDB } from './db.js';
export { default as grokService } from './grok.js';
export { default as newsDataService } from './newsdata.js';
export { default as impactCalculator } from './impactCalculator.js';
export { default as alertProcessor } from './alertProcessor.js';
export { default as alertScheduler } from './scheduler.js';

// Environment variables validation
export const validateEnvironment = () => {
  const required = [
    'MONGO_URI',
    'GROK_API_KEY',
    'NEWSDATA_API_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.warn('⚠️  Missing environment variables:', missing.join(', '));
    console.warn('Some features may not work correctly');
  } else {
    console.log('✅ All required environment variables are set');
  }
};

// Initialize all services
export const initializeServices = async () => {
  try {
    console.log('🔄 Initializing backend services...');

    // Validate environment
    validateEnvironment();

    // Initialize services that need setup
    await grokService.initialize();

    // Initialize scheduler
    alertScheduler.initialize();

    console.log('✅ All services initialized successfully');

  } catch (error) {
    console.error('❌ Error initializing services:', error);
    throw error;
  }
};
