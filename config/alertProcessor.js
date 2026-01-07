const Alert = require('../models/Alert.js');
const {
  CONFIDENCE_SCORING,
  CONFIDENCE_THRESHOLDS
} = require('./constants.js');

class AlertProcessor {
  constructor() {
    this.confidenceThreshold = CONFIDENCE_THRESHOLDS.APPROVE;
  }

  /**
   * Process and cluster new disruptions
   * @param {Array} disruptions - Array of disruption objects from APIs
   * @returns {Array} Processed and clustered alerts
   */
  async processDisruptions(disruptions) {
    try {
      const clusteredAlerts = this.clusterDisruptions(disruptions);
      const processedAlerts = [];

      for (const cluster of clusteredAlerts) {
        const alert = await this.createOrUpdateAlert(cluster);
        if (alert) {
          processedAlerts.push(alert);
        }
      }

      return processedAlerts;

    } catch (error) {
      console.error('Error processing disruptions:', error);
      return [];
    }
  }

  /**
   * Cluster disruptions by similarity
   */
  clusterDisruptions(disruptions) {
    const clusters = [];

    for (const disruption of disruptions) {
      let foundCluster = false;

      // Check if disruption fits into existing cluster
      for (const cluster of clusters) {
        if (this.isSimilarDisruption(cluster[0], disruption)) {
          cluster.push(disruption);
          foundCluster = true;
          break;
        }
      }

      // Create new cluster if no match found
      if (!foundCluster) {
        clusters.push([disruption]);
      }
    }

    return clusters;
  }

  /**
   * Check if two disruptions are similar enough to cluster
   */
  isSimilarDisruption(disruption1, disruption2) {
    // Same city
    if (disruption1.city !== disruption2.city) return false;

    // Same main type
    if (disruption1.mainType !== disruption2.mainType) return false;

    // Similar titles (basic text similarity)
    const similarity = this.calculateTextSimilarity(
      disruption1.title.toLowerCase(),
      disruption2.title.toLowerCase()
    );

    return similarity > 0.6; // 60% similarity threshold
  }

  /**
   * Calculate basic text similarity
   */
  calculateTextSimilarity(text1, text2) {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Create or update alert from disruption cluster
   */
  async createOrUpdateAlert(cluster) {
    try {
      // Find existing alert for this cluster
      const existingAlert = await this.findExistingAlert(cluster[0]);

      if (existingAlert) {
        // Update existing alert
        return await this.updateAlert(existingAlert, cluster);
      } else {
        // Create new alert
        return await this.createNewAlert(cluster);
      }

    } catch (error) {
      console.error('Error creating/updating alert:', error);
      return null;
    }
  }

  /**
   * Find existing alert that matches the disruption
   */
  async findExistingAlert(disruption) {
    try {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const existingAlerts = await Alert.find({
        city: disruption.city,
        mainType: disruption.mainType,
        startDate: { $lte: thirtyDaysFromNow },
        endDate: { $gte: new Date() },
        status: { $ne: 'expired' }
      });

      // Find best match by title similarity
      for (const alert of existingAlerts) {
        const similarity = this.calculateTextSimilarity(
          alert.title.toLowerCase(),
          disruption.title.toLowerCase()
        );

        if (similarity > 0.7) {
          return alert;
        }
      }

      return null;

    } catch (error) {
      console.error('Error finding existing alert:', error);
      return null;
    }
  }

  /**
   * Create new alert from disruption cluster
   */
  async createNewAlert(cluster) {
    try {
      const representative = cluster[0]; // Use first disruption as representative

      // Calculate confidence score
      const confidenceData = this.calculateConfidence(cluster);

      // Create alert data
      const alertData = {
        city: representative.city,
        mainType: representative.mainType,
        subType: representative.subType,
        title: representative.title,
        startDate: representative.start_date,
        endDate: representative.end_date,
        source: representative.source,
        url: representative.url,
        summary: representative.summary,
        confidence: confidenceData.score,
        status: confidenceData.score >= this.confidenceThreshold ? 'approved' : 'pending'
      };


      const alert = new Alert(alertData);
      await alert.save();

      console.log(`Created new alert: ${alert.title} (confidence: ${confidenceData.score})`);
      return alert;

    } catch (error) {
      console.error('Error creating new alert:', error);
      return null;
    }
  }

  /**
   * Update existing alert with new information
   */
  async updateAlert(existingAlert, newCluster) {
    try {
      // Recalculate confidence from new cluster
      const confidenceData = this.calculateConfidence(newCluster);

      // Check if confidence changed significantly
      const confidenceChanged = Math.abs(confidenceData.score - existingAlert.confidence) > 0.1;

      const updateData = {
        confidence: confidenceData.score
      };

      // Update status based on confidence
      if (confidenceData.score >= this.confidenceThreshold && existingAlert.status === 'pending') {
        updateData.status = 'approved';
      }

      await Alert.findByIdAndUpdate(existingAlert._id, updateData);

      console.log(`Updated alert: ${existingAlert.title} (confidence: ${confidenceData.score})`);
      return await Alert.findById(existingAlert._id);

    } catch (error) {
      console.error('Error updating alert:', error);
      return null;
    }
  }

  /**
   * Calculate confidence score from disruption cluster using progressive scoring
   */
  calculateConfidence(cluster) {
    const sources = cluster.map(d => d.sourceCredibility || 'other_news');

    // Group sources by credibility type
    const sourceGroups = {};
    sources.forEach(source => {
      sourceGroups[source] = (sourceGroups[source] || 0) + 1;
    });

    let totalScore = 0;
    let totalSources = sources.length;

    // Apply progressive scoring based on source type and count
    for (const [credibility, count] of Object.entries(sourceGroups)) {
      let score = 0;

      switch (credibility) {
        case 'official': // BBC, MET, Gov.uk
          if (count >= 2) score = 1.0;
          else if (count === 2) score = 0.9;
          else score = 0.8;
          break;
        case 'major_news': // Sky, Reuters, Guardian
          if (count >= 3) score = 0.9;
          else if (count === 2) score = 0.8;
          else score = 0.7;
          break;
        case 'other_news': // Local, Al Jazeera, blogs
          if (count >= 3) score = 0.7;
          else if (count === 2) score = 0.6;
          else score = 0.5;
          break;
        case 'social': // X, forums
          if (count >= 3) score = 0.4;
          else score = 0.3; // Same for 1 or 2 sources
          break;
        default:
          score = 0.5; // Default for unknown source types
      }

      totalScore += score * count;
    }

    const averageScore = totalSources > 0 ? totalScore / totalSources : 0;

    return {
      score: Math.round(averageScore * 100) / 100,
      sourcesCount: totalSources,
      sourceBreakdown: sourceGroups
    };
  }





  /**
   * Archive old alerts
   */
  async archiveOldAlerts() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await Alert.updateMany(
        {
          endDate: { $lt: thirtyDaysAgo },
          status: { $ne: 'expired' }
        },
        {
          status: 'expired'
        }
      );

      console.log(`Archived ${result.modifiedCount} old alerts`);
      return result.modifiedCount;

    } catch (error) {
      console.error('Error archiving old alerts:', error);
      return 0;
    }
  }
}

module.exports = new AlertProcessor();
