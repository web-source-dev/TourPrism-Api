const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

async function backupCollection(modelName, collectionName) {
  try {
    console.log(`Backing up ${collectionName}...`);

    // Get all documents from the collection
    const documents = await mongoose.connection.db.collection(collectionName).find({}).toArray();

    // Create backup directory if it doesn't exist
    const backupDir = path.join(__dirname, '..', 'backups');
    await fs.mkdir(backupDir, { recursive: true });

    // Create backup file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `${collectionName}_backup_${timestamp}.json`);

    // Write documents to file
    await fs.writeFile(backupFile, JSON.stringify(documents, null, 2));

    console.log(`Backed up ${documents.length} documents from ${collectionName} to ${backupFile}`);
    return backupFile;
  } catch (error) {
    console.error(`Error backing up ${collectionName}:`, error);
    throw error;
  }
}

async function runBackup() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for backup');

    // Backup collections
    await backupCollection('User', 'users');
    await backupCollection('Alert', 'alerts');

    console.log('Backup completed successfully');
  } catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the backup if this script is executed directly
if (require.main === module) {
  runBackup();
}

module.exports = { runBackup, backupCollection };
