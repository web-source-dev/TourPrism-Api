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
        country: 'gb,it,fr,nl,de,es,ie,pl,pt,se,no,us,ca',
        category: 'politics,environment,travel,business,technology,economy',
        language: 'en',
        size: 50, // Max articles per request
        ...params
      };

      // Build the comprehensive query for disruption keywords
      const disruptionQuery = `(Edinburgh OR London OR Heathrow OR Gatwick OR "Edinburgh Airport" OR ScotRail OR LNER OR Avanti OR Eurostar OR Ryanair OR EasyJet OR "British Airways" OR KLM) AND (
        "strike" OR "walkout" OR "industrial action" OR "labor dispute" OR "pilot strike" OR "crew strike" OR "ATC strike" OR "ferry strike" OR "ground handling strike" OR "baggage handler strike" OR
        "weather disruption" OR "snow" OR "flood" OR "storm" OR "fog" OR "ice" OR "hurricane" OR "extreme weather" OR "heatwave" OR "cold snap" OR
        "protest" OR "march" OR "blockade" OR "sit-in" OR "demonstration" OR "rally" OR "riot" OR "civil unrest" OR
        "flight delay" OR "flight cancellation" OR "grounding" OR "overbooking" OR "airspace restriction" OR "runway closure" OR
        "staff shortage" OR "understaffed" OR "labor shortage" OR "crew absence" OR "pilot shortage" OR
        "supply chain" OR "fuel shortage" OR "jet fuel crisis" OR "catering delay" OR "laundry delay" OR "toiletries shortage" OR
        "system failure" OR "IT crash" OR "outage" OR "cyber attack" OR "hacking" OR "software glitch" OR "booking system down" OR "e-gates failure" OR "border control outage" OR "ATM failure" OR "air traffic system down" OR
        "policy change" OR "travel ban" OR "visa restriction" OR "quarantine rule" OR "advisory" OR "embargo" OR
        "economy issue" OR "currency surge" OR "pound fluctuation" OR "recession" OR "inflation hit" OR "tourist drop" OR "exchange rate crash" OR "FX volatility" OR
        "road closure" OR "diversion" OR "construction" OR "roadworks" OR "bridge collapse" OR "tunnel flood" OR
        "festival chaos" OR "event overcrowding" OR "conference delay" OR "sports event cancellation" OR "music festival disruption" OR
        "mechanical failure" OR "engine issue" OR "maintenance delay" OR "aircraft grounding" OR "train breakdown" OR "ferry mechanical" OR
        "natural disaster" OR "earthquake" OR "volcano" OR "tsunami" OR "wildfire" OR "landslide" OR
        "global link" OR "Rome-Edinburgh strike" OR "Paris-London delay" OR "international disruption" OR "cross-border issue"
      )`;

      const requestParams = {
        ...defaultParams,
        q: disruptionQuery,
        ...params
      };

      console.log('Fetching news from NewsData.io with query:', requestParams.q.substring(0, 100) + '...');

      const response = await axios.get(`${this.baseURL}/news`, {
        params: requestParams,
        timeout: 30000 // 30 second timeout
      });

      if (response.data.status !== 'success') {
        throw new Error(`NewsData API error: ${response.data.message || 'Unknown error'}`);
      }

      // Transform NewsData articles to our disruption format
      const articles = response.data.results || [];
      const disruptions = articles.map(article => this.transformArticleToDisruption(article));

      console.log(`Fetched ${articles.length} articles, transformed to ${disruptions.length} potential disruptions`);

      return disruptions;

    } catch (error) {
      console.error('Error fetching news from NewsData:', error);
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
