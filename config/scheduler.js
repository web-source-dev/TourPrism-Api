import cron from 'node-cron';
import grokService from './grok.js';
import newsDataService from './newsdata.js';
import alertProcessor from './alertProcessor.js';

class AlertScheduler {
  constructor() {
    this.isRunning = false;
    this.jobs = [];
    this.lastGrokRun = null;
  }

  /**
   * Initialize the scheduler with cron jobs
   */
  initialize() {
    try {
      // Monday 8 AM BST - Full fetch (Grok + NewsData)
      const mondayJob = cron.schedule('0 8 * * 1', async () => {
        console.log('🚀 Starting Monday 8 AM full alert fetch');
        await this.runFullFetch();
      }, {
        timezone: 'Europe/London'
      });

      // Thursday 8 AM BST - NewsData only
      const thursdayJob = cron.schedule('0 8 * * 4', async () => {
        console.log('🚀 Starting Thursday 8 AM NewsData fetch');
        await this.runNewsDataOnlyFetch();
      }, {
        timezone: 'Europe/London'
      });

      this.jobs = [mondayJob, thursdayJob];
      console.log('✅ Alert scheduler initialized with Monday and Thursday jobs');

    } catch (error) {
      console.error('❌ Failed to initialize scheduler:', error);
    }
  }

  /**
   * Run full fetch (Monday): Grok + NewsData + Manual
   */
  async runFullFetch() {
    if (this.isRunning) {
      console.log('⏳ Full fetch already running, skipping');
      return;
    }

    try {
      this.isRunning = true;
      console.log('🔄 Starting full alert fetch process...');

      const allDisruptions = [];

      // 1. Run Grok API (only once per week)
      console.log('🤖 Running Grok API for disruption generation...');
      const grokDisruptions = await this.fetchFromGrok();
      allDisruptions.push(...grokDisruptions);
      this.lastGrokRun = new Date();

      // 2. Run NewsData API
      console.log('📰 Running NewsData API for current news...');
      const newsDisruptions = await this.fetchFromNewsData();
      allDisruptions.push(...newsDisruptions);

      // 3. Process manual additions (placeholder for manual input)
      console.log('📝 Checking for manual alert additions...');
      const manualDisruptions = await this.fetchManualAlerts();
      allDisruptions.push(...manualDisruptions);

      // 4. Process all disruptions
      console.log(`📊 Processing ${allDisruptions.length} total disruptions...`);
      const processedAlerts = await alertProcessor.processDisruptions(allDisruptions);

      // 5. Archive old alerts
      console.log('🗂️ Archiving old alerts...');
      await alertProcessor.archiveOldAlerts();

      console.log(`✅ Full fetch completed. Processed ${processedAlerts.length} alerts.`);

    } catch (error) {
      console.error('❌ Error in full fetch:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run NewsData only fetch (Thursday)
   */
  async runNewsDataOnlyFetch() {
    if (this.isRunning) {
      console.log('⏳ NewsData fetch already running, skipping');
      return;
    }

    try {
      this.isRunning = true;
      console.log('🔄 Starting NewsData-only alert fetch process...');

      // 1. Run NewsData API only
      console.log('📰 Running NewsData API for current news...');
      const newsDisruptions = await this.fetchFromNewsData();

      // 2. Process manual additions
      console.log('📝 Checking for manual alert additions...');
      const manualDisruptions = await this.fetchManualAlerts();
      const allDisruptions = [...newsDisruptions, ...manualDisruptions];

      // 3. Process disruptions (only LLM if confidence changed)
      console.log(`📊 Processing ${allDisruptions.length} disruptions...`);
      const processedAlerts = await alertProcessor.processDisruptions(allDisruptions);

      // 4. Archive old alerts
      console.log('🗂️ Archiving old alerts...');
      await alertProcessor.archiveOldAlerts();

      console.log(`✅ NewsData fetch completed. Processed ${processedAlerts.length} alerts.`);

    } catch (error) {
      console.error('❌ Error in NewsData fetch:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Fetch disruptions from Grok API
   */
  async fetchFromGrok() {
    try {
      const { CITIES } = await import('./constants.js');
      const allDisruptions = [];

      for (const city of CITIES) {
        console.log(`🤖 Generating disruptions for ${city}...`);
        const disruptions = await grokService.generateDisruptions(city);
        allDisruptions.push(...disruptions);
      }

      console.log(`🤖 Grok generated ${allDisruptions.length} disruptions`);
      return allDisruptions;

    } catch (error) {
      console.error('❌ Error fetching from Grok:', error);
      return [];
    }
  }

  /**
   * Fetch disruptions from NewsData API
   */
  async fetchFromNewsData() {
    try {
      console.log('📰 Fetching from NewsData...');
      const disruptions = await newsDataService.fetchNews();

      console.log(`📰 NewsData returned ${disruptions.length} potential disruptions`);
      return disruptions;

    } catch (error) {
      console.error('❌ Error fetching from NewsData:', error);
      return [];
    }
  }

  /**
   * Fetch manual alerts (placeholder for manual input system)
   */
  async fetchManualAlerts() {
    // TODO: Implement manual alert input system
    // For now, return empty array
    console.log('📝 Manual alerts system not yet implemented');
    return [];
  }

  /**
   * Manual trigger for testing (bypass cron schedule)
   */
  async triggerManualFetch(type = 'full') {
    console.log(`🔧 Manual trigger: ${type} fetch`);

    if (type === 'full') {
      await this.runFullFetch();
    } else if (type === 'newsdata') {
      await this.runNewsDataOnlyFetch();
    } else {
      console.log('❌ Invalid fetch type. Use "full" or "newsdata"');
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobsScheduled: this.jobs.length,
      lastGrokRun: this.lastGrokRun,
      nextRuns: this.getNextRunTimes()
    };
  }

  /**
   * Get next run times for all jobs
   */
  getNextRunTimes() {
    const nextRuns = {};

    // Monday 8 AM
    const nextMonday = this.getNextWeekday(1, 8, 0);
    nextRuns.monday = nextMonday.toISOString();

    // Thursday 8 AM
    const nextThursday = this.getNextWeekday(4, 8, 0);
    nextRuns.thursday = nextThursday.toISOString();

    return nextRuns;
  }

  /**
   * Get next occurrence of a specific weekday and time
   */
  getNextWeekday(dayOfWeek, hour, minute) {
    const now = new Date();
    const result = new Date(now);

    // Set to target time today
    result.setHours(hour, minute, 0, 0);

    // If it's already past today, move to next week
    if (result <= now) {
      result.setDate(result.getDate() + (7 - result.getDay() + dayOfWeek) % 7 || 7);
    } else {
      // Move to target day of week
      const daysUntilTarget = (dayOfWeek - result.getDay() + 7) % 7;
      if (daysUntilTarget > 0) {
        result.setDate(result.getDate() + daysUntilTarget);
      }
    }

    return result;
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    console.log('🛑 Stopping alert scheduler...');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Restart scheduler
   */
  restart() {
    console.log('🔄 Restarting alert scheduler...');
    this.stop();
    this.initialize();
  }

  /**
   * Add manual disruption (for testing or manual entry)
   */
  async addManualDisruption(disruptionData) {
    try {
      console.log('📝 Adding manual disruption...');

      // Validate required fields
      const required = ['city', 'mainType', 'subType', 'title', 'start_date', 'end_date', 'source', 'summary'];
      for (const field of required) {
        if (!disruptionData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Add source credibility for manual entries
      disruptionData.sourceCredibility = 'official'; // Assume manual entries are credible

      // Process as single-item cluster
      const processedAlerts = await alertProcessor.processDisruptions([disruptionData]);

      console.log(`✅ Manual disruption added. Created ${processedAlerts.length} alert(s).`);
      return processedAlerts;

    } catch (error) {
      console.error('❌ Error adding manual disruption:', error);
      throw error;
    }
  }
}

export default new AlertScheduler();
