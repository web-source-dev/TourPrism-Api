// Backend configuration and service exports
const connectDB = require('./db.js');
const newsDataService = require('./newsdata.js');
const alertProcessor = require('./alertProcessor.js');
const alertScheduler = require('./scheduler.js');

// Environment variables validation
const validateEnvironment = () => {
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
const initializeServices = async () => {
  try {
    console.log('🔄 Initializing backend services...');

    // Validate environment
    validateEnvironment();

    // Initialize services that need setup

    // Initialize scheduler
    alertScheduler.initialize();

    console.log('✅ All services initialized successfully');

  } catch (error) {
    console.error('❌ Error initializing services:', error);
    throw error;
  }
};

module.exports = {
  connectDB,
  newsDataService,
  alertProcessor,
  alertScheduler,
  validateEnvironment,
  initializeServices
};
