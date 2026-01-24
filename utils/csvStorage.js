const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CsvFile = require('../models/CsvFile');

class CsvStorage {
  constructor() {
    this.uploadDir = path.join(__dirname, '../uploads/csv-files');
    this.ensureUploadDir();
  }

  ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  generateFileId() {
    return crypto.randomUUID();
  }

  async saveFile(buffer, originalName, mimeType, uploadedBy, uploadStats = {}) {
    const fileId = this.generateFileId();
    const fileName = `${fileId}.csv`;
    const filePath = path.join(this.uploadDir, fileName);

    // Write file to disk
    fs.writeFileSync(filePath, buffer);

    // Save metadata to database
    const csvFile = new CsvFile({
      fileId,
      fileName,
      originalName,
      fileSize: buffer.length,
      mimeType,
      filePath,
      uploadedBy,
      uploadStats
    });

    await csvFile.save();
    return csvFile;
  }

  async getFile(fileId) {
    const csvFile = await CsvFile.findOne({ fileId, status: 'active' });
    if (!csvFile) {
      throw new Error('CSV file not found');
    }

    // Check if file exists on disk
    if (!fs.existsSync(csvFile.filePath)) {
      throw new Error('CSV file not found on disk');
    }

    return csvFile;
  }

  async getFileContent(fileId) {
    const csvFile = await this.getFile(fileId);
    return fs.readFileSync(csvFile.filePath);
  }

  async listFiles(uploadedBy = null, limit = 50, offset = 0) {
    const query = { status: 'active' };
    if (uploadedBy) {
      query.uploadedBy = uploadedBy;
    }

    const files = await CsvFile.find(query)
      .populate('uploadedBy', 'email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    const total = await CsvFile.countDocuments(query);

    return { files, total };
  }

  async deleteFile(fileId, uploadedBy) {
    const csvFile = await CsvFile.findOne({ fileId, uploadedBy, status: 'active' });
    if (!csvFile) {
      throw new Error('CSV file not found or access denied');
    }

    // Mark as deleted in database
    csvFile.status = 'deleted';
    csvFile.deletedAt = new Date();
    await csvFile.save();

    // Optionally delete from disk (or keep for audit trail)
    // For now, we'll keep the file on disk but mark as deleted

    return csvFile;
  }

  async getAlertsCount(fileId) {
    const Alert = require('../models/Alert');
    return await Alert.countDocuments({
      'sourceCsv.fileId': fileId,
      status: { $ne: 'expired' }
    });
  }

  async deleteAssociatedAlerts(fileId, uploadedBy) {
    const Alert = require('../models/Alert');

    // Find all alerts associated with this CSV file
    const alerts = await Alert.find({
      'sourceCsv.fileId': fileId,
      'sourceCsv.uploadedBy': uploadedBy
    });

    if (alerts.length === 0) {
      return { deletedCount: 0, alerts: [] };
    }

    // Mark alerts as expired instead of deleting them
    const result = await Alert.updateMany(
      {
        'sourceCsv.fileId': fileId,
        'sourceCsv.uploadedBy': uploadedBy
      },
      {
        status: 'expired',
        endDate: new Date()
      }
    );

    return {
      deletedCount: result.modifiedCount,
      alerts: alerts.map(alert => ({
        _id: alert._id,
        title: alert.title,
        status: alert.status
      }))
    };
  }
}

module.exports = new CsvStorage();
