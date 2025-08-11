import dotenv from 'dotenv';
import cron from 'node-cron';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Alert from '../models/Alert.js';
import Logs from '../models/Logs.js';
import User from '../models/User.js';

dotenv.config();

// City configurations with coordinates and place IDs
const CITIES = {
  edinburgh: {
    name: 'Edinburgh',
    latitude: 55.9533,
    longitude: -3.1883,
    placeId: 'ChIJIyaYpQC4h0gRJ0GJS6q-OAQ',
    country: 'United Kingdom'
  },
  glasgow: {
    name: 'Glasgow',
    latitude: 55.8642,
    longitude: -4.2518,
    placeId: 'ChIJ685WIFYViEgRHlHvBbiD5nE',
    country: 'United Kingdom'
  },
  stirling: {
    name: 'Stirling',
    latitude: 56.1165,
    longitude: -3.9369,
    placeId: 'ChIJK8xS1tQAh0gRqFQxJQJQJQJ',
    country: 'United Kingdom'
  },
  manchester: {
    name: 'Manchester',
    latitude: 53.4808,
    longitude: -2.2426,
    placeId: 'ChIJ2_UmUkxNekgRqmv-BDgUvtk',
    country: 'United Kingdom'
  },
  london: {
    name: 'London',
    latitude: 51.5074,
    longitude: -0.1278,
    placeId: 'ChIJdd4hrwug2EcRmSrV3Vo6llI',
    country: 'United Kingdom'
  }
};

// Alert categories and sub-categories (from create alert page)
const ALERT_CATEGORIES = {
  'Industrial Action': ['Strike', 'Work-to-Rule', 'Labor Dispute', 'Other'],
  'Extreme Weather': ['Storm', 'Flooding', 'Heatwave', 'Wildfire', 'Snow', 'Other'],
  'Infrastructure Failures': ['Power Outage', 'IT & System Failure', 'Transport Service Suspension', 'Road, Rail & Tram Closure', 'Repairs or Delays', 'Other'],
  'Public Safety Incidents': ['Protest', 'Crime', 'Terror Threats', 'Travel Advisory', 'Other'],
  'Festivals and Events': ['Citywide Festival', 'Sporting Event', 'Concerts and Stadium Events', 'Parades and Ceremonies', 'Other']
};

// Target audiences (from create alert page)
const TARGET_AUDIENCES = [
  'Airline', 'Attraction', 'Car Rental', 'Cruise Line', 'DMO', 'Event Manager',
  'Hotel', 'OTA', 'Tour Guide', 'Tour Operator', 'Travel Agency', 'Travel Media', 'Other'
];

// Severity levels
const SEVERITY_LEVELS = ['Minor', 'Moderate', 'Severe'];

// Priority levels
const PRIORITY_LEVELS = ['low', 'medium', 'high'];

class AutomatedAlertGenerator {
  constructor() {
    // Use Gemini API instead of OpenAI
    this.geminiApiKey = process.env.GOOGLE_API_KEY;
    this.systemPrompt = this.buildSystemPrompt();
    // Default Gemini model – can be tuned to "gemini-1.5-pro" if desired
    this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  }
  buildSystemPrompt() {
    return `You are a travel disruption alert analyzer. Your job is to analyze real data from multiple sources and create accurate, timely alerts for travel professionals.
  
  REQUIREMENTS:
  - Only include alerts for events occurring from TODAY ${new Date().toISOString().split('T')[0]} up to 7 days ahead
  - Do NOT include past events or those more than 7 days in the future
  - Analyze real-time data from trusted weather, transport, news, and event sources
  - Create alerts only for actual, verified disruptions
  - Use real dates, times, and locations directly from the source
  - Include source attribution (e.g., BBC, Met Office, Transport Authority) for transparency
  - Prioritize accuracy and relevancy over volume
  
  ALERT CATEGORIES & TYPES:
  - Industrial Action: Strike, Work-to-Rule, Labor Dispute, Other
  - Extreme Weather: Storm, Flooding, Heatwave, Wildfire, Snow, Other
  - Infrastructure Failures: Power Outage, IT & System Failure, Transport Service Suspension, Road/Rail/Tram Closure, Repairs or Delays, Other
  - Public Safety Incidents: Protest, Crime, Terror Threats, Travel Advisory, Other
  - Festivals and Events: Citywide Festival, Sporting Event, Concerts and Stadium Events, Parades and Ceremonies, Other
  
  TARGET AUDIENCES:
  Airline, Attraction, Car Rental, Cruise Line, DMO, Event Manager, Hotel, OTA, Tour Guide, Tour Operator, Travel Agency, Travel Media, Other
  
  ALERT STRUCTURE:
  {
    "alerts": [
      {
        "title": "Brief title based on real event",
        "description": "Detailed description with source attribution",
        "alertCategory": "Category from real data",
        "alertType": "Specific type from category",
        "impact": "Minor|Moderate|Severe based on actual impact",
        "priority": "low|medium|high based on severity",
        "targetAudience": ["Relevant audiences"],
        "recommendedAction": "What people should do based on real situation",
        "expectedStart": "YYYY-MM-DDTHH:mm:ss (must be between today and next 7 days)",
        "expectedEnd": "YYYY-MM-DDTHH:mm:ss (must be within same window)",
        "originCity": "City name",
        "originCountry": "Country name",
        "impactLocations": [
          {
            "city": "Affected city",
            "country": "Country name",
            "latitude": 55.9533,
            "longitude": -3.1883
          }
        ],
        "confidence": 0.95,
        "source": "Credible source name (e.g., BBC, Met Office, Transport Authority)",
        "sourceUrl": "Valid URL to source data for verification (required)"
      }
    ]
  }
  
  IMPORTANT: 
  - DO NOT include events outside the range of today through the next 7 days.
  - MUST INCLUDE proper source attribution and valid URLs for verification.
  - Every alert MUST have a valid sourceUrl field with a real, verifiable URL.
  - Use credible sources like BBC, Met Office, local transport authorities, official event pages.`;
  }

  async generateAlertsForCity(cityKey) {
    const city = CITIES[cityKey];
    if (!city) {
      throw new Error(`Unknown city: ${cityKey}`);
    }

    const prompt = `Generate 10-15 realistic alerts for ${city.name}, UK for the NEXT 7 DAYS.

City: ${city.name}
Coordinates: ${city.latitude}, ${city.longitude}
Current Date: ${new Date().toISOString().split('T')[0]}

Requirements:
- Generate 10-15 unique alerts for the next 7 days only
- Use real upcoming events and situations in ${city.name}
- Include all categories: Industrial Action, Extreme Weather, Infrastructure Failures, Public Safety Incidents, Festivals and Events
- Use valid coordinates for all locations
- All dates must be between ${new Date().toISOString().split('T')[0]} and ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
- Make alerts specific to ${city.name} and its upcoming events
- MANDATORY: Each alert MUST include a valid sourceUrl with real, verifiable links (BBC, Met Office, transport authorities, official event pages)
- Include proper source attribution in the "source" field

Return valid JSON with 10-15 alerts in the array.`;

    try {
      const responseText = await this.callGemini(prompt);
      const jsonContent = this.extractJsonFromResponse(responseText);
      const parsedResponse = JSON.parse(jsonContent);

      if (!parsedResponse.alerts || !Array.isArray(parsedResponse.alerts)) {
        throw new Error('Invalid response format from OpenAI');
      }

      // Validate the number of alerts
      if (parsedResponse.alerts.length < 10) {
        console.warn(`Only ${parsedResponse.alerts.length} alerts generated for ${city.name}, retrying...`);
        // Retry once with a more explicit prompt
        const retryPrompt = `Generate 10-15 alerts for ${city.name} for the next 7 days. You only created ${parsedResponse.alerts.length}. Include all categories: Industrial Action, Extreme Weather, Infrastructure Failures, Public Safety Incidents, Festivals and Events. All dates must be in the next 7 days. MANDATORY: Each alert MUST include a valid sourceUrl with real, verifiable links. Return JSON with 10-15 alerts.`;

        const retryResponseText = await this.callGemini(retryPrompt);
        const retryJsonContent = this.extractJsonFromResponse(retryResponseText);
        const retryParsedResponse = JSON.parse(retryJsonContent);

        if (retryParsedResponse.alerts && Array.isArray(retryParsedResponse.alerts) && retryParsedResponse.alerts.length >= 10) {
          console.log(`Retry successful: ${retryParsedResponse.alerts.length} alerts generated for ${city.name}`);
          parsedResponse.alerts = retryParsedResponse.alerts;
        } else {
          console.warn(`Retry failed for ${city.name}, using original ${parsedResponse.alerts.length} alerts`);
        }
      }

      return parsedResponse.alerts.map(alert => ({
        ...alert,
        originLatitude: city.latitude,
        originLongitude: city.longitude,
        originPlaceId: city.placeId,
        originLocation: {
          type: 'Point',
          coordinates: [city.longitude, city.latitude]
        },
        // Ensure impactLocations have proper coordinates
        impactLocations: (alert.impactLocations || []).map(location => ({
          ...location,
          latitude: location.latitude || city.latitude,
          longitude: location.longitude || city.longitude,
          location: {
            type: 'Point',
            coordinates: [location.longitude || city.longitude, location.latitude || city.latitude]
          }
        }))
      }));
    } catch (error) {
      console.error(`Error generating alerts for ${city.name}:`, error);
      throw error;
    }
  }

  async callGemini(userPrompt) {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key (GOOGLE_API_KEY) not configured');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;

    const body = {
      // Provide system instruction separately to steer model behavior
      system_instruction: {
        role: 'system',
        parts: [{ text: this.systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      // Enable Google Search grounding
      tools: [
        { googleSearchRetrieval: {} }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 4000
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${errorText}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini API returned no text content');
    }
    return text;
  }

  extractJsonFromResponse(responseText) {
    // Remove markdown code blocks if present
    let jsonContent = responseText.trim();
    
    // Remove ```json and ``` markers
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.substring(7);
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.substring(3);
    }
    
    if (jsonContent.endsWith('```')) {
      jsonContent = jsonContent.substring(0, jsonContent.length - 3);
    }
    
    return jsonContent.trim();
  }

  async checkForDuplicates(alert) {
    const { description, originCity, expectedStart, expectedEnd } = alert;

    // Check for exact matches
    const exactMatch = await Alert.findOne({
      description: description,
      originCity: originCity,
      expectedStart: { $gte: new Date(expectedStart) },
      expectedEnd: { $lte: new Date(expectedEnd) },
      status: { $in: ['pending', 'approved'] }
    });

    if (exactMatch) {
      return { isDuplicate: true, confidence: 0.95, existingAlert: exactMatch };
    }

    // Check for similar descriptions (fuzzy matching)
    const similarAlerts = await Alert.find({
      originCity: originCity,
      status: { $in: ['pending', 'approved'] },
      expectedStart: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    });

    let maxSimilarity = 0;
    let mostSimilarAlert = null;

    for (const existingAlert of similarAlerts) {
      const similarity = this.calculateSimilarity(description, existingAlert.description);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarAlert = existingAlert;
      }
    }

    // If similarity is above 80%, consider it a duplicate
    if (maxSimilarity > 0.8) {
      return {
        isDuplicate: true,
        confidence: maxSimilarity,
        existingAlert: mostSimilarAlert
      };
    }

    return { isDuplicate: false, confidence: 0 };
  }

  calculateSimilarity(text1, text2) {
    // Simple Jaccard similarity implementation
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  validateAlertData(alertData, city) {
    // Check required fields
    if (!alertData.title || !alertData.description || !alertData.alertCategory) {
      return false;
    }

    // Validate source URL is provided and is a valid URL
    if (!alertData.sourceUrl) {
      console.warn(`Missing sourceUrl for alert: ${alertData.title}`);
      return false;
    }

    try {
      new URL(alertData.sourceUrl);
    } catch (error) {
      console.warn(`Invalid sourceUrl for alert: ${alertData.title}. URL: ${alertData.sourceUrl}`);
      return false;
    }

    // Validate dates are in the future and within 7 days
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (alertData.expectedStart) {
      const startDate = new Date(alertData.expectedStart);
      if (startDate < now || startDate > sevenDaysFromNow) {
        console.warn(`Invalid start date for alert: ${alertData.title}. Date: ${startDate}, must be between ${now} and ${sevenDaysFromNow}`);
        return false;
      }
    }

    if (alertData.expectedEnd) {
      const endDate = new Date(alertData.expectedEnd);
      if (endDate < now || endDate > sevenDaysFromNow) {
        console.warn(`Invalid end date for alert: ${alertData.title}. Date: ${endDate}, must be between ${now} and ${sevenDaysFromNow}`);
        return false;
      }
    }

    // Validate alert category and type
    if (!ALERT_CATEGORIES[alertData.alertCategory]) {
      console.warn(`Invalid alert category: ${alertData.alertCategory}`);
      return false;
    }

    if (alertData.alertType && !ALERT_CATEGORIES[alertData.alertCategory].includes(alertData.alertType)) {
      console.warn(`Invalid alert type: ${alertData.alertType} for category: ${alertData.alertCategory}`);
      return false;
    }

    // Validate impactLocations
    if (alertData.impactLocations && Array.isArray(alertData.impactLocations)) {
      for (const location of alertData.impactLocations) {
        if (!location.latitude || !location.longitude) {
          // Use city coordinates as fallback
          location.latitude = city.latitude;
          location.longitude = city.longitude;
        }

        // Ensure coordinates are numbers
        location.latitude = Number(location.latitude);
        location.longitude = Number(location.longitude);

        // Validate coordinate ranges
        if (isNaN(location.latitude) || isNaN(location.longitude) ||
          location.latitude < -90 || location.latitude > 90 ||
          location.longitude < -180 || location.longitude > 180) {
          return false;
        }
      }
    }

    return true;
  }

  async saveAlert(alertData, isDuplicate = false, confidence = 0) {
    // Ensure all location fields are properly formatted
    const processedAlertData = {
      ...alertData,
      status: this.determineStatus(confidence),
      alertGroupId: isDuplicate ? `duplicate_${Date.now()}` : `auto_${Date.now()}`,
      addToEmailSummary: confidence > 0.8,
      updatedBy: 'Automated System',
      // Set default priority if not provided
      priority: alertData.priority || 'medium',
      // Map sourceUrl to linkToSource for database storage
      linkToSource: alertData.sourceUrl
    };

    // Ensure originLocation is properly formatted
    if (processedAlertData.originLatitude && processedAlertData.originLongitude) {
      processedAlertData.originLocation = {
        type: 'Point',
        coordinates: [processedAlertData.originLongitude, processedAlertData.originLatitude]
      };
    }

    // Ensure legacy location field is properly formatted
    if (processedAlertData.latitude && processedAlertData.longitude) {
      processedAlertData.location = {
        type: 'Point',
        coordinates: [processedAlertData.longitude, processedAlertData.latitude]
      };
    }

    // Ensure impactLocations have proper coordinates
    if (processedAlertData.impactLocations && Array.isArray(processedAlertData.impactLocations)) {
      processedAlertData.impactLocations = processedAlertData.impactLocations.map(location => {
        const processedLocation = { ...location };

        // Ensure latitude and longitude are numbers
        if (location.latitude && location.longitude) {
          processedLocation.latitude = Number(location.latitude);
          processedLocation.longitude = Number(location.longitude);
          processedLocation.location = {
            type: 'Point',
            coordinates: [Number(location.longitude), Number(location.latitude)]
          };
        }

        return processedLocation;
      });
    }

    const alert = new Alert(processedAlertData);
    await alert.save();
    return alert;
  }

  determineStatus(confidence) {
    if (confidence >= 0.9) {
      return 'approved';
    } else if (confidence >= 0.7) {
      return 'pending';
    } else {
      return 'pending';
    }
  }

  async generateAlertsForAllCities() {
    console.log('Starting automated alert generation for all cities...');

    const results = {
      total: 0,
      approved: 0,
      pending: 0,
      duplicates: 0,
      errors: 0,
      cityResults: {}
    };

    for (const [cityKey, city] of Object.entries(CITIES)) {
      console.log(`Generating alerts for ${city.name}...`);

      try {
        const alerts = await this.generateAlertsForCity(cityKey);
        console.log(`Generated ${alerts.length} alerts for ${city.name}`);

        results.cityResults[city.name] = {
          generated: alerts.length,
          approved: 0,
          pending: 0,
          duplicates: 0,
          errors: 0
        };

        for (const alertData of alerts) {
          try {
            // Validate alert data before processing
            if (!this.validateAlertData(alertData, city)) {
              console.warn(`Skipping invalid alert data for ${city.name}:`, alertData);
              results.errors++;
              results.cityResults[city.name].errors++;
              continue;
            }

            // Check for duplicates
            const duplicateCheck = await this.checkForDuplicates(alertData);

            if (duplicateCheck.isDuplicate) {
              results.duplicates++;
              results.cityResults[city.name].duplicates++;

              // Save as pending for manual review
              await this.saveAlert(alertData, true, duplicateCheck.confidence);
            } else {
              // Use the confidence from the AI generation
              const confidence = alertData.confidence || 0.7;
              const status = this.determineStatus(confidence);

              await this.saveAlert(alertData, false, confidence);

              if (status === 'approved') {
                results.approved++;
                results.cityResults[city.name].approved++;
              } else {
                results.pending++;
                results.cityResults[city.name].pending++;
              }
            }

            results.total++;
          } catch (error) {
            console.error(`Error processing alert for ${city.name}:`, error);
            results.errors++;
            results.cityResults[city.name].errors++;
          }
        }
      } catch (error) {
        console.error(`Error generating alerts for ${city.name}:`, error);
        results.errors++;
        results.cityResults[city.name] = {
          generated: 0,
          approved: 0,
          pending: 0,
          duplicates: 0,
          errors: 1
        };
      }
    }

    // Log the results
    await this.logGenerationResults(results);

    console.log('Automated alert generation completed:', results);
    return results;
  }

  async logGenerationResults(results) {
    try {
      await Logs.createLog({
        userId: null,
        userEmail: 'automated-system@tourprism.com',
        userName: 'Automated Alert Generator',
        action: 'automated_alert_generation_completed',
        details: {
          results,
          timestamp: new Date().toISOString()
        },
        ipAddress: '127.0.0.1',
        userAgent: 'AutomatedAlertGenerator/1.0'
      });
    } catch (error) {
      console.error('Error logging generation results:', error);
    }
  }
}

// Schedule the automated alert generation
const scheduleAutomatedAlerts = () => {
  const generator = new AutomatedAlertGenerator();

  // Schedule for Monday, Wednesday, Friday at 9:00 AM Edinburgh time
  cron.schedule('0 9 * * 1,3,5', async () => {
    console.log('Starting scheduled automated alert generation...');
    try {
      await generator.generateAlertsForAllCities();
    } catch (error) {
      console.error('Error in scheduled alert generation:', error);
    }
  }, {
    scheduled: true,
    timezone: "Europe/London"
  });

  console.log('Automated alert generation scheduled for Monday, Wednesday, Friday at 9:00 AM Edinburgh time');
};

// Export functions for testing or manual triggering
export {
  AutomatedAlertGenerator,
  scheduleAutomatedAlerts,
  CITIES
};

// If this file is run directly, schedule the job
if (import.meta.url === `file://${process.argv[1]}`) {
  scheduleAutomatedAlerts();
} 