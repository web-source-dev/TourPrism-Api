import Alert from '../models/Alert.js';
import grokService from './grok.js';
import impactCalculator from './impactCalculator.js';
import {
  CONFIDENCE_SCORING,
  ALERT_STATUSES,
  ALERT_TONES,
  ALERT_SECTORS,
  ALERT_MAIN_TYPES,
  ALERT_SUB_TYPES,
  CONFIDENCE_THRESHOLDS
} from './constants.js';

class AlertProcessor {
  constructor() {
    this.sourceScoring = CONFIDENCE_SCORING;
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
        confidenceSources: cluster.map(d => ({
          source: d.source,
          type: d.sourceCredibility || 'other_news',
          confidence: this.getSourceConfidence(d.sourceCredibility || 'other_news'),
          url: d.url,
          title: d.title || representative.title,
          publishedAt: d.pubDate
        })),
        status: confidenceData.score >= this.confidenceThreshold ? 'approved' : 'pending',
        sectors: this.generateSectors(representative.mainType),
        recoveryExpected: this.generateRecoveryExpected(representative.mainType),
        whatsImpacted: this.generateWhatsImpacted(representative.mainType, representative.city),
        actionPlan: this.generateActionPlan(representative.mainType, representative.city),
        originCity: representative.city
      };

      // Generate LLM content if confidence is high enough
      if (confidenceData.score >= this.confidenceThreshold) {
        const llmData = await this.generateLLMContent(alertData);
        Object.assign(alertData, llmData);
      }

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
      const allSources = [...existingAlert.alertSources, ...newCluster.map(d => ({
        source: d.source,
        url: d.url,
        credibility: d.sourceCredibility || 'other_news',
        pubDate: d.pubDate
      }))];

      // Remove duplicates
      const uniqueSources = this.deduplicateSources(allSources);

      // Recalculate confidence
      const confidenceData = this.calculateConfidenceFromSources(uniqueSources);

      // Check if confidence changed significantly
      const confidenceChanged = Math.abs(confidenceData.score - existingAlert.confidence) > 0.1;

      const updateData = {
        confidence: confidenceData.score,
        confidenceSources: uniqueSources
      };

      // Update status based on confidence
      if (confidenceData.score >= this.confidenceThreshold && existingAlert.status === 'pending') {
        updateData.status = 'approved';

        // Generate LLM content for newly activated alerts
        if (!existingAlert.tone || confidenceChanged) {
          const llmData = await this.generateLLMContent({
            ...existingAlert.toObject(),
            ...updateData
          });
          Object.assign(updateData, llmData);
        }
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
   * Calculate confidence score from disruption cluster
   */
  calculateConfidence(cluster) {
    const sources = cluster.map(d => d.sourceCredibility || 'other_news');
    return this.calculateConfidenceFromSources(sources.map(cred => ({ credibility: cred })));
  }

  /**
   * Calculate confidence score from sources array
   */
  calculateConfidenceFromSources(sources) {
    const sourceGroups = {};

    // Group sources by credibility
    sources.forEach(source => {
      const cred = source.credibility || 'other_news';
      sourceGroups[cred] = (sourceGroups[cred] || 0) + 1;
    });

    let totalScore = 0;
    let totalSources = 0;

    // Calculate weighted score
    for (const [credibility, count] of Object.entries(sourceGroups)) {
      const scoring = this.sourceScoring[credibility];
      if (scoring) {
        const scoreKey = count >= 3 ? '2+' : count.toString();
        const score = scoring[scoreKey] || scoring['2+'];
        totalScore += score * count;
        totalSources += count;
      }
    }

    const averageScore = totalSources > 0 ? totalScore / totalSources : 0;

    return {
      score: Math.round(averageScore * 100) / 100,
      sourcesCount: totalSources,
      sourceBreakdown: sourceGroups
    };
  }

  /**
   * Remove duplicate sources
   */
  deduplicateSources(sources) {
    const seen = new Set();
    return sources.filter(source => {
      const key = `${source.source}-${source.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Calculate alert severity based on disruption type
   */
  calculateSeverity(mainType) {
    const severityMap = {
      strike: 'high',
      weather: 'high',
      protest: 'medium',
      flight: 'high',
      staff: 'medium',
      supply: 'medium',
      system: 'critical',
      policy: 'medium',
      economy: 'low',
      other: 'medium'
    };

    return severityMap[mainType] || 'medium';
  }

  /**
   * Generate tags for the alert
   */
  generateTags(disruption) {
    const tags = [disruption.mainType, disruption.subType, disruption.city];

    // Add relevant keywords
    if (disruption.title.toLowerCase().includes('ryanair')) tags.push('ryanair');
    if (disruption.title.toLowerCase().includes('easyjet')) tags.push('easyjet');
    if (disruption.title.toLowerCase().includes('ba') || disruption.title.toLowerCase().includes('british airways')) tags.push('ba');
    if (disruption.title.toLowerCase().includes('heathrow')) tags.push('heathrow');
    if (disruption.title.toLowerCase().includes('gatwick')) tags.push('gatwick');
    if (disruption.title.toLowerCase().includes('scotrail') || disruption.title.toLowerCase().includes('lner')) tags.push('rail');

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Calculate impact assessment
   */
  calculateImpact(disruption) {
    // Basic impact assessment based on disruption type
    const impactMap = {
      strike: { level: 'high', description: 'Travel disruption affecting multiple routes' },
      weather: { level: 'high', description: 'Weather conditions may delay or cancel travel' },
      protest: { level: 'medium', description: 'Potential for travel disruptions in affected areas' },
      flight: { level: 'high', description: 'Flight operations may be affected' },
      staff: { level: 'medium', description: 'Service levels may be reduced' },
      supply: { level: 'low', description: 'Limited impact on travel' },
      system: { level: 'critical', description: 'Critical infrastructure may be affected' },
      policy: { level: 'medium', description: 'Travel restrictions may apply' },
      economy: { level: 'low', description: 'Economic factors may influence travel' },
      other: { level: 'medium', description: 'General disruption possible' }
    };

    return impactMap[disruption.mainType] || impactMap.other;
  }

  /**
   * Generate sectors affected by disruption type
   */
  generateSectors(mainType) {
    const sectorMap = {
      strike: ['Airlines', 'Transportation', 'Travel'],
      weather: ['Airlines', 'Transportation', 'Tourism', 'Hospitality'],
      protest: ['Transportation', 'Tourism', 'Business Travel'],
      flight_issues: ['Airlines', 'Transportation', 'Travel'],
      staff_shortage: ['Airlines', 'Hospitality', 'Transportation'],
      supply_chain: ['Airlines', 'Hospitality', 'Transportation'],
      system_failure: ['Airlines', 'Transportation', 'Technology'],
      policy: ['Travel', 'Tourism', 'International Business'],
      economy: ['Tourism', 'Hospitality', 'Business Travel'],
      other: ['Transportation', 'Travel']
    };

    return sectorMap[mainType] || ALERT_SECTORS.slice(0, 2);
  }

  /**
   * Generate expected recovery time
   */
  generateRecoveryExpected(mainType) {
    const recoveryMap = {
      strike: '2-7 days',
      weather: '1-3 days',
      protest: '1-2 days',
      flight: '1-5 days',
      staff: '3-7 days',
      supply: '3-10 days',
      system: '1-24 hours',
      policy: 'Variable',
      economy: 'Weeks to months',
      other: 'Variable'
    };

    return recoveryMap[mainType] || 'Variable';
  }

  /**
   * Generate "What's Impacted" structure
   */
  generateWhatsImpacted(mainType, city) {
    const impactMap = {
      strike: [
        {
          category: 'Airports & Flights',
          description: 'Flight operations affected',
          icon: 'plane',
          items: [
            { title: 'Flight cancellations', description: 'Multiple routes impacted' },
            { title: 'Passenger delays', description: 'Long queues and waiting times' },
            { title: 'Connection disruptions', description: 'Transfer passengers affected' }
          ]
        },
        {
          category: 'Ground Transportation',
          description: 'Rail and road access affected',
          icon: 'train',
          items: [
            { title: 'Rail services', description: 'Train schedules disrupted' },
            { title: 'Taxi availability', description: 'Increased demand at airports' }
          ]
        }
      ],
      weather: [
        {
          category: 'Flight Operations',
          description: 'Weather-related flight disruptions',
          icon: 'cloud-snow',
          items: [
            { title: 'Flight cancellations', description: 'Due to safety concerns' },
            { title: 'Delays and diversions', description: 'Weather-dependent routing' }
          ]
        },
        {
          category: 'Ground Transport',
          description: 'Road and rail conditions',
          icon: 'car',
          items: [
            { title: 'Road closures', description: 'Unsafe driving conditions' },
            { title: 'Rail delays', description: 'Signal and track issues' }
          ]
        }
      ],
      // Add more disruption types as needed
    };

    return impactMap[mainType] || [
      {
        category: 'General Impact',
        description: 'Disruption affecting travel',
        icon: 'alert-triangle',
        items: [
          { title: 'Travel disruptions', description: 'Various travel services affected' }
        ]
      }
    ];
  }

  /**
   * Generate "Action Plan" structure
   */
  generateActionPlan(mainType, city) {
    const actionMap = {
      strike: [
        {
          category: 'Immediate Actions',
          description: 'Steps to take right now',
          icon: 'zap',
          items: [
            { title: 'Monitor flight status', description: 'Check airline websites and apps' },
            { title: 'Contact airline directly', description: 'Confirm booking status' },
            { title: 'Consider alternative routes', description: 'Look for connecting flights' }
          ]
        },
        {
          category: 'Contingency Planning',
          description: 'Prepare for extended disruption',
          icon: 'calendar',
          items: [
            { title: 'Book alternative flights', description: 'If cancellation confirmed' },
            { title: 'Arrange ground transport', description: 'Plan for airport transfers' },
            { title: 'Update travel insurance', description: 'Document any changes' }
          ]
        }
      ],
      weather: [
        {
          category: 'Weather Monitoring',
          description: 'Stay informed about conditions',
          icon: 'eye',
          items: [
            { title: 'Check weather forecasts', description: 'Monitor updates regularly' },
            { title: 'Follow airline communications', description: 'Stay updated on flight status' }
          ]
        },
        {
          category: 'Flexible Planning',
          description: 'Prepare for changes',
          icon: 'refresh-cw',
          items: [
            { title: 'Have backup travel dates', description: 'Consider flexible booking options' },
            { title: 'Monitor road conditions', description: 'Check for alternative routes' }
          ]
        }
      ],
      // Add more disruption types as needed
    };

    return actionMap[mainType] || [
      {
        category: 'General Actions',
        description: 'Recommended steps',
        icon: 'list',
        items: [
          { title: 'Monitor situation', description: 'Stay updated on developments' },
          { title: 'Contact service providers', description: 'Confirm your arrangements' },
          { title: 'Prepare contingency plans', description: 'Have backup options ready' }
        ]
      }
    ];
  }

  /**
   * Generate "when" text for header generation
   */
  generateWhenText(startDate) {
    if (!startDate) return 'this weekend';

    const start = new Date(startDate);
    const now = new Date();
    const diffDays = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays <= 7) return 'this weekend';
    if (diffDays <= 14) return 'next week';

    return 'this weekend'; // Default fallback
  }

  /**
   * Get confidence score for source type
   */
  getSourceConfidence(sourceType) {
    const confidenceMap = {
      official: 0.9,
      major_news: 0.7,
      other_news: 0.5,
      social: 0.3
    };

    return confidenceMap[sourceType] || 0.5;
  }

  /**
   * Generate LLM content (tone and header)
   */
  async generateLLMContent(alertData) {
    try {
      const sources = alertData.confidenceSources.map(s => s.source).join(', ');

      // Generate tone using exact prompt from SCORING & PUBLISHING.pdf
      const tonePrompt = `Say ONE word: Early, Developing, or Confirmed.

Event: ${alertData.title}

Sources: ${sources}

Return only one word: Early, Developing, or Confirmed.`;

      const tone = await grokService.generateTone(alertData.title, sources);

      // For header generation, we need impact data (rooms/value)
      // This will be called when impact data is available
      let header = alertData.title; // Default fallback

      // If we have impact data, generate proper header
      if (alertData.nightsAtRisk && alertData.poundsAtRisk) {
        const when = this.generateWhenText(alertData.startDate);
        header = await grokService.generateHeader(
          alertData.mainType,
          alertData.nightsAtRisk,
          alertData.poundsAtRisk,
          when
        );
      }

      return {
        tone,
        header
      };

    } catch (error) {
      console.error('Error generating LLM content:', error);
      return {
        tone: 'Developing',
        header: alertData.title
      };
    }
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
          alertStatus: { $ne: 'archived' }
        },
        {
          alertStatus: 'archived',
          lastUpdated: new Date()
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

export default new AlertProcessor();
