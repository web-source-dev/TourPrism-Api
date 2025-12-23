const axios = require('axios');
const { CITIES } = require('./constants.js');

class NewsDataService {
  constructor() {
    this.apiKey = process.env.NEWSDATA_API_KEY;
    this.baseURL = 'https://newsdata.io/api/1';

    if (!this.apiKey) {
      console.warn('NEWSDATA_API_KEY not found in environment variables');
    }
  }

  async fetchNews(params = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('NewsData API key not configured');
      }

      const defaultParams = {
        apikey: this.apiKey,
        language: 'en',
        size: 50, // Max articles per request
        ...params
      };

      // Use a very simple query to test if the API works
      const disruptionQuery = 'Edinburgh';

      const requestParams = {
        ...defaultParams,
        q: disruptionQuery,
        ...params
      };

      // Temporarily return empty array due to API issues
      console.log('NewsData API temporarily disabled due to 422 errors');
      return [];

    } catch (error) {
      console.error('Error fetching news from NewsData:', error);
      return [];
    }
  }

  async fetchArchivedNews(fromDate, toDate, params = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('NewsData API key not configured');
      }

      const defaultParams = {
        apikey: this.apiKey,
        language: 'en',
        from_date: fromDate,
        to_date: toDate,
        size: 50, // Max articles per request
        ...params
      };

      // Use a very simple query to test if the API works
      const disruptionQuery = 'Edinburgh';

      const requestParams = {
        ...defaultParams,
        q: disruptionQuery,
        ...params
      };

      // Temporarily return empty array due to API issues
      console.log('NewsData archive API temporarily disabled due to 422 errors');
      return [];

    } catch (error) {
      console.error('Error fetching archived news from NewsData:', error);
      return [];
    }
  }

  transformArticleToDisruption(article) {
    try {
      // Extract city from title or content
      const city = this.extractCity(article.title + ' ' + (article.description || ''));

      if (!city) {
        return null; // Skip articles that don't mention Edinburgh or London
      }

      // Extract disruption type from keywords/content
      const disruptionInfo = this.extractDisruptionInfo(article.title + ' ' + (article.description || ''));

      if (!disruptionInfo.mainType) {
        return null; // Skip if no clear disruption type
      }

      // Generate dates (next 30 days if not specified)
      const dates = this.extractDates(article.pubDate);

      return {
        city,
        mainType: disruptionInfo.mainType,
        subType: disruptionInfo.subType,
        title: article.title,
        start_date: dates.startDate,
        end_date: dates.endDate,
        source: article.source_id || article.source_name || 'NewsData',
        url: article.link,
        summary: article.description || article.title,
        sourceCredibility: this.getSourceCredibility(article.source_id),
        pubDate: article.pubDate,
        image_url: article.image_url,
        keywords: article.keywords || [],
        category: article.category || []
      };

    } catch (error) {
      console.error('Error transforming article to disruption:', error);
      return null;
    }
  }

  extractCity(text) {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('edinburgh')) {
      return 'Edinburgh';
    } else if (lowerText.includes('london') || lowerText.includes('heathrow') || lowerText.includes('gatwick')) {
      return 'London';
    }

    return null;
  }

  extractDisruptionInfo(text) {
    const lowerText = text.toLowerCase();

    // Strike related
    if (lowerText.includes('strike') || lowerText.includes('walkout') || lowerText.includes('industrial action')) {
      return {
        mainType: 'strike',
        subType: this.getStrikeSubtype(lowerText)
      };
    }

    // Weather related
    if (lowerText.includes('snow') || lowerText.includes('flood') || lowerText.includes('storm') ||
        lowerText.includes('fog') || lowerText.includes('ice') || lowerText.includes('hurricane') ||
        lowerText.includes('heatwave') || lowerText.includes('cold snap')) {
      return {
        mainType: 'weather',
        subType: this.getWeatherSubtype(lowerText)
      };
    }

    // Protest related
    if (lowerText.includes('protest') || lowerText.includes('march') || lowerText.includes('blockade') ||
        lowerText.includes('demonstration') || lowerText.includes('rally') || lowerText.includes('riot')) {
      return {
        mainType: 'protest',
        subType: 'civil unrest'
      };
    }

    // Flight issues
    if (lowerText.includes('flight delay') || lowerText.includes('flight cancellation') ||
        lowerText.includes('grounding') || lowerText.includes('runway closure')) {
      return {
        mainType: 'flight',
        subType: this.getFlightSubtype(lowerText)
      };
    }

    // Staff shortage
    if (lowerText.includes('staff shortage') || lowerText.includes('labor shortage') ||
        lowerText.includes('pilot shortage') || lowerText.includes('crew absence')) {
      return {
        mainType: 'staff',
        subType: this.getStaffSubtype(lowerText)
      };
    }

    // Default to other
    return {
      mainType: 'other',
      subType: 'general disruption'
    };
  }

  getStrikeSubtype(text) {
    if (text.includes('pilot')) return 'airline pilot';
    if (text.includes('crew')) return 'crew';
    if (text.includes('atc') || text.includes('air traffic')) return 'ATC';
    if (text.includes('ferry')) return 'ferry';
    if (text.includes('ground') || text.includes('baggage')) return 'ground staff';
    if (text.includes('rail') || text.includes('train')) return 'rail';
    return 'general strike';
  }

  getWeatherSubtype(text) {
    if (text.includes('snow') || text.includes('ice')) return 'winter weather';
    if (text.includes('flood')) return 'flood';
    if (text.includes('storm') || text.includes('hurricane')) return 'storm';
    if (text.includes('fog')) return 'fog';
    if (text.includes('heatwave')) return 'heatwave';
    if (text.includes('cold snap')) return 'cold snap';
    return 'extreme weather';
  }

  getFlightSubtype(text) {
    if (text.includes('delay')) return 'delay';
    if (text.includes('cancellation')) return 'cancellation';
    if (text.includes('grounding')) return 'grounding';
    if (text.includes('runway')) return 'runway closure';
    if (text.includes('airspace')) return 'airspace restriction';
    return 'flight issue';
  }

  getStaffSubtype(text) {
    if (text.includes('pilot')) return 'pilot shortage';
    if (text.includes('crew')) return 'crew absence';
    if (text.includes('check-in') || text.includes('airport')) return 'airport staff';
    if (text.includes('hotel') || text.includes('cleaning')) return 'hotel staff';
    return 'staff shortage';
  }

  extractDates(pubDate) {
    // Default to next 30 days if no specific dates found
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  getSourceCredibility(sourceId) {
    // Define credibility scores based on source
    const credibleSources = ['bbc', 'reuters', 'sky', 'guardian', 'independent', 'telegraph'];
    const majorSources = ['bbc', 'reuters', 'sky', 'guardian'];

    if (majorSources.some(source => sourceId?.toLowerCase().includes(source))) {
      return 'major_news';
    } else if (credibleSources.some(source => sourceId?.toLowerCase().includes(source))) {
      return 'other_news';
    } else if (sourceId?.toLowerCase().includes('twitter') || sourceId?.toLowerCase().includes('reddit')) {
      return 'social';
    }

    return 'other_news'; // Default
  }
}

module.exports = new NewsDataService();
