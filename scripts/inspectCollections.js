const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function inspectCollections() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n=== AVAILABLE COLLECTIONS ===');
    collections.forEach(collection => {
      console.log(`- ${collection.name}`);
    });

    // Inspect each collection
    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      console.log(`\n=== ${collection.name.toUpperCase()} COLLECTION ===`);
      console.log(`Documents: ${count}`);

      if (count > 0) {
        // Show sample document structure
        const sample = await mongoose.connection.db.collection(collection.name).findOne({});
        console.log('Sample document keys:', Object.keys(sample));
        console.log('Sample document (first few fields):');
        Object.keys(sample).slice(0, 10).forEach(key => {
          const value = sample[key];
          if (typeof value === 'object' && value !== null) {
            console.log(`  ${key}: [${Array.isArray(value) ? 'Array' : 'Object'} with ${Object.keys(value).length} keys]`);
          } else {
            console.log(`  ${key}: ${typeof value} - ${value}`);
          }
        });
      }
    }

  } catch (error) {
    console.error('Error inspecting collections:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the inspection if this script is executed directly
if (require.main === module) {
  inspectCollections();
}

module.exports = { inspectCollections };
