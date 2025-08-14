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
  - INCLUDE alerts for events occurring TODAY (${new Date().toISOString().split('T')[0]}) - this is REQUIRED
  - Include alerts for events occurring from TODAY up to 7 days ahead
  - Include alerts that started before today but are still active (end within current week)
  - Also include events that start within 7 days but may end up to 2 weeks from today (for multi-day events)
  - Do NOT include past events that have already ended
  - ALWAYS include at least 2-3 alerts for TODAY's events
  - Analyze real-time data from trusted weather, transport, news, and event sources
  - Create alerts only for actual, verified disruptions
  - Use real dates, times, and locations directly from the source
  - Include source attribution (e.g., BBC, Met Office, Transport Authority) for transparency
  - Prioritize accuracy and relevancy over volume
  
  ALERT CATEGORIES & TYPES (USE EXACTLY AS SHOWN):
  - Industrial Action: Strike, Work-to-Rule, Labor Dispute, Other
  - Extreme Weather: Storm, Flooding, Heatwave, Wildfire, Snow, Other
  - Infrastructure Failures: Power Outage, IT & System Failure, Transport Service Suspension, Road, Rail & Tram Closure, Repairs or Delays, Other
  - Public Safety Incidents: Protest, Crime, Terror Threats, Travel Advisory, Other
  - Festivals and Events: Citywide Festival, Sporting Event, Concerts and Stadium Events, Parades and Ceremonies, Other
  
  IMPORTANT: Use EXACT type names as listed above. Common mistakes to avoid:
  - Use "Road, Rail & Tram Closure" NOT "Road Closure" or "Transport Closure"
  - Use "IT & System Failure" NOT "IT Failure" or "System Failure"
  - Use "Concerts and Stadium Events" NOT "Concert" or "Stadium Event"
  
  TARGET AUDIENCES:
  Airline, Attraction, Car Rental, Cruise Line, DMO, Event Manager, Hotel, OTA, Tour Guide, Tour Operator, Travel Agency, Travel Media, Other
  
  IMPACT LEVELS (USE EXACTLY AS SHOWN):
  - Minor: Small disruptions with minimal travel impact
  - Moderate: Noticeable disruptions affecting travel plans
  - Severe: Major disruptions causing significant travel problems
  
  PRIORITY LEVELS (USE EXACTLY AS SHOWN):
  - low: Minor importance
  - medium: Moderate importance  
  - high: High importance
  
  ALERT STRUCTURE:
  {
    "alerts": [
      {
        "title": "Brief title based on real event",
        "description": "Detailed description with source attribution",
        "alertCategory": "Category from real data",
        "alertType": "Specific type from category",
        "impact": "Minor|Moderate|Severe (use exactly one of these)",
        "priority": "low|medium|high (use exactly one of these)",
        "targetAudience": ["Relevant audiences"],
        "recommendedAction": "What people should do based on real situation",
        "expectedStart": "YYYY-MM-DDTHH:mm:ss (must be between today and next 7 days, include today)",
        "expectedEnd": "YYYY-MM-DDTHH:mm:ss (can extend up to 2 weeks for multi-day events)",
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
  - ALL URLs MUST include the full protocol: https:// or http:// (e.g., https://www.bbc.com/news, NOT bbc.com)
  - Use credible sources like BBC, Met Office, local transport authorities, official event pages.
  - RESPOND WITH VALID JSON ONLY - no additional text, explanations, or markdown formatting.
  - Ensure all JSON is properly formatted with correct quotes, commas, and brackets.
  - All string values must be properly quoted and escaped.`;
  }

  async generateAlertsForCity(cityKey) {
    const city = CITIES[cityKey];
    if (!city) {
      throw new Error(`Unknown city: ${cityKey}`);
    }

    const prompt = `Generate 10-15 realistic alerts for ${city.name}, UK for TODAY and the NEXT 7 DAYS.

City: ${city.name}
Coordinates: ${city.latitude}, ${city.longitude}
Current Date: ${new Date().toISOString().split('T')[0]}

Requirements:
- Generate 10-15 unique alerts for events starting TODAY and in the next 7 days
- ALWAYS include at least 2-3 alerts for TODAY (${new Date().toISOString().split('T')[0]})
- Include events that start within 7 days but may end up to 2 weeks from today (for multi-day events)
- Use real upcoming events and situations in ${city.name}
- Include all categories: Industrial Action, Extreme Weather, Infrastructure Failures, Public Safety Incidents, Festivals and Events
- Use valid coordinates for all locations
- Start dates must be between TODAY (${new Date().toISOString().split('T')[0]}) and ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
- MUST include alerts starting TODAY (${new Date().toISOString().split('T')[0]})
- End dates can extend up to ${new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]} for multi-day events
- Include alerts that started before today but end within the current week (active alerts)
- Make alerts specific to ${city.name} and its upcoming events
- MANDATORY: Each alert MUST include a valid sourceUrl with real, verifiable links (BBC, Met Office, transport authorities, official event pages)
- ALL URLs MUST include full protocol: https:// or http:// (e.g., https://www.bbc.com/news, NOT bbc.com)
- Include proper source attribution in the "source" field

Return valid JSON with 10-15 alerts in the array. IMPORTANT: Respond with ONLY valid JSON - no markdown, no explanations, no additional text.`;

    try {
      const responseText = await this.callGemini(prompt);
      const jsonContent = this.extractJsonFromResponse(responseText);
      
      // Debug: Log the extracted JSON content for troubleshooting
      console.log(`Raw JSON content for ${city.name}:`, jsonContent.substring(0, 500) + '...');
      
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(jsonContent);
      } catch (parseError) {
        console.error(`JSON parsing error for ${city.name}:`, parseError.message);
        console.error(`JSON content length: ${jsonContent.length}`);
        console.error(`JSON content preview:`, jsonContent.substring(0, 1000));
        
        // Try to fix common JSON issues and retry
        const fixedJson = this.fixCommonJsonIssues(jsonContent);
        try {
          parsedResponse = JSON.parse(fixedJson);
          console.log(`Successfully parsed JSON after fixing issues for ${city.name}`);
        } catch (retryError) {
          console.error(`Failed to parse JSON even after fixing for ${city.name}:`, retryError.message);
          
                  // Try a more aggressive JSON cleanup
        const aggressiveFix = this.aggressiveJsonFix(jsonContent);
        try {
          parsedResponse = JSON.parse(aggressiveFix);
          console.log(`Successfully parsed JSON after aggressive fixing for ${city.name}`);
        } catch (finalError) {
          console.error(`Failed to parse JSON even after aggressive fixing for ${city.name}:`, finalError.message);
          
          // Try to extract just the alerts array if the main JSON is corrupted
          const alertsMatch = jsonContent.match(/"alerts":\s*\[(.*?)\]/s);
          if (alertsMatch) {
            try {
              const alertsJson = `{"alerts": [${alertsMatch[1]}]}`;
              const fixedAlertsJson = this.fixCommonJsonIssues(alertsJson);
              parsedResponse = JSON.parse(fixedAlertsJson);
              console.log(`Successfully parsed JSON by extracting alerts array for ${city.name}`);
            } catch (extractError) {
              console.error(`Failed to extract alerts array for ${city.name}:`, extractError.message);
              throw new Error(`JSON parsing failed for ${city.name}: ${parseError.message}`);
            }
          } else {
            throw new Error(`JSON parsing failed for ${city.name}: ${parseError.message}`);
          }
        }
        }
      }

      if (!parsedResponse.alerts || !Array.isArray(parsedResponse.alerts)) {
        throw new Error('Invalid response format from Gemini API');
      }

      // Fix URLs in the parsed alerts
      parsedResponse.alerts = parsedResponse.alerts.map(alert => {
        if (alert.sourceUrl && !alert.sourceUrl.startsWith('http://') && !alert.sourceUrl.startsWith('https://')) {
          console.log(`Fixing URL in parsed alert: ${alert.title}. Original: ${alert.sourceUrl}`);
          alert.sourceUrl = `https://${alert.sourceUrl}`;
          console.log(`Fixed URL: ${alert.sourceUrl}`);
        }
        return alert;
      });

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
        temperature: 0.3, // Lower temperature for more consistent JSON formatting
        topP: 0.8,
        topK: 20,
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
    
    jsonContent = jsonContent.trim();
    
    // Try to find JSON object boundaries
    const startBrace = jsonContent.indexOf('{');
    const endBrace = jsonContent.lastIndexOf('}');
    
    if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
      jsonContent = jsonContent.substring(startBrace, endBrace + 1);
    }
    
    // Clean up common JSON formatting issues
    jsonContent = jsonContent
      .replace(/,\s*}/g, '}') // Remove trailing commas before closing braces
      .replace(/,\s*]/g, ']') // Remove trailing commas before closing brackets
      .replace(/,\s*,/g, ',') // Remove double commas
      .replace(/\n\s*\n/g, '\n') // Remove extra newlines
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    return jsonContent;
  }

  fixCommonJsonIssues(jsonContent) {
    let fixed = jsonContent;
    
    // Fix unescaped quotes in strings
    fixed = fixed.replace(/"([^"]*)"([^"]*)"([^"]*)"/g, (match, p1, p2, p3) => {
      return `"${p1}${p2.replace(/"/g, '\\"')}${p3}"`;
    });
    
    // Fix missing quotes around property names
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // Fix single quotes to double quotes
    fixed = fixed.replace(/'/g, '"');
    
    // Fix trailing commas in objects and arrays
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix missing commas between array elements
    fixed = fixed.replace(/}(\s*){/g, '},$1{');
    fixed = fixed.replace(/](\s*)\[/g, '],$1[');
    
    // Fix unescaped newlines in strings
    fixed = fixed.replace(/\n/g, '\\n');
    fixed = fixed.replace(/\r/g, '\\r');
    fixed = fixed.replace(/\t/g, '\\t');
    
    // Fix URLs in sourceUrl fields - add https:// if missing
    fixed = fixed.replace(/"sourceUrl":\s*"([^"]*?)"/g, (match, url) => {
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        return `"sourceUrl": "https://${url}"`;
      }
      return match;
    });

    // Fix impact values in JSON
    fixed = fixed.replace(/"impact":\s*"([^"]*?)"/g, (match, impact) => {
      const impactMappings = {
        'None': 'Minor',
        'Unknown': 'Moderate',
        'Low': 'Minor',
        'Medium': 'Moderate',
        'High': 'Severe',
        'Critical': 'Severe',
        'Major': 'Severe'
      };
      if (impactMappings[impact]) {
        return `"impact": "${impactMappings[impact]}"`;
      }
      return match;
    });

    // Fix missing commas between objects in arrays
    fixed = fixed.replace(/}\s*{/g, '},{');
    
    // Fix missing commas between properties
    fixed = fixed.replace(/"([^"]*)"\s*"([^"]*)"\s*:/g, '"$1","$2":');
    
    // Fix missing commas after array elements
    fixed = fixed.replace(/}\s*]/g, '}]');
    fixed = fixed.replace(/"\s*]/g, '"]');
    
    // Fix unclosed arrays and objects
    let openBraces = (fixed.match(/\{/g) || []).length;
    let closeBraces = (fixed.match(/\}/g) || []).length;
    let openBrackets = (fixed.match(/\[/g) || []).length;
    let closeBrackets = (fixed.match(/\]/g) || []).length;
    
    // Add missing closing braces
    while (openBraces > closeBraces) {
      fixed += '}';
      closeBraces++;
    }
    
    // Add missing closing brackets
    while (openBrackets > closeBrackets) {
      fixed += ']';
      closeBrackets++;
    }
    
    // Fix missing closing braces/brackets
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < fixed.length; i++) {
      const char = fixed[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '[') bracketCount++;
        if (char === ']') bracketCount--;
      }
    }
    
    // Add missing closing braces/brackets
    while (braceCount > 0) {
      fixed += '}';
      braceCount--;
    }
    
    while (bracketCount > 0) {
      fixed += ']';
      bracketCount--;
    }
    
    return fixed;
  }

  fixAlertTypeMismatches(alertData) {
    const typeMappings = {
      // Infrastructure Failures
      'Road Closure': 'Road, Rail & Tram Closure',
      'Transport Closure': 'Road, Rail & Tram Closure',
      'Rail Closure': 'Road, Rail & Tram Closure',
      'Tram Closure': 'Road, Rail & Tram Closure',
      'IT Failure': 'IT & System Failure',
      'System Failure': 'IT & System Failure',
      'Power Failure': 'Power Outage',
      'Electricity Outage': 'Power Outage',
      'Transport Disruption': 'Transport Service Suspension',
      'Service Suspension': 'Transport Service Suspension',
      
      // Extreme Weather
      'Fog': 'Storm',
      'Heavy Rain': 'Storm',
      'Thunderstorm': 'Storm',
      'High Winds': 'Storm',
      'Drought': 'Heatwave',
      'Extreme Heat': 'Heatwave',
      
      // Public Safety Incidents
      'Violence': 'Crime',
      'Theft': 'Crime',
      'Assault': 'Crime',
      'Security Threat': 'Terror Threats',
      'Safety Advisory': 'Travel Advisory',
      
      // Festivals and Events
      'Concert': 'Concerts and Stadium Events',
      'Stadium Event': 'Concerts and Stadium Events',
      'Music Festival': 'Citywide Festival',
      'Cultural Festival': 'Citywide Festival',
      'Parade': 'Parades and Ceremonies',
      'Ceremony': 'Parades and Ceremonies',
      
      // Industrial Action
      'Labor Strike': 'Strike',
      'Work Stoppage': 'Strike',
      'Union Action': 'Strike'
    };

    if (alertData.alertType && typeMappings[alertData.alertType]) {
      console.log(`Fixing alert type for "${alertData.title}": "${alertData.alertType}" → "${typeMappings[alertData.alertType]}"`);
      alertData.alertType = typeMappings[alertData.alertType];
    }

    return alertData;
  }

  fixInvalidImpactValues(alertData) {
    const impactMappings = {
      'None': 'Minor',
      'Unknown': 'Moderate',
      'Low': 'Minor',
      'Medium': 'Moderate',
      'High': 'Severe',
      'Critical': 'Severe',
      'Major': 'Severe',
      'Minor': 'Minor',
      'Moderate': 'Moderate',
      'Severe': 'Severe'
    };

    if (alertData.impact && impactMappings[alertData.impact]) {
      console.log(`Fixing impact value for "${alertData.title}": "${alertData.impact}" → "${impactMappings[alertData.impact]}"`);
      alertData.impact = impactMappings[alertData.impact];
    } else if (alertData.impact && !SEVERITY_LEVELS.includes(alertData.impact)) {
      console.log(`Invalid impact value for "${alertData.title}": "${alertData.impact}", setting to "Moderate"`);
      alertData.impact = 'Moderate';
    }

    return alertData;
  }

  aggressiveJsonFix(jsonContent) {
    let fixed = jsonContent;
    
    // Remove any text before the first {
    const firstBrace = fixed.indexOf('{');
    if (firstBrace > 0) {
      fixed = fixed.substring(firstBrace);
    }
    
    // Remove any text after the last }
    const lastBrace = fixed.lastIndexOf('}');
    if (lastBrace !== -1 && lastBrace < fixed.length - 1) {
      fixed = fixed.substring(0, lastBrace + 1);
    }
    
    // Fix common string escaping issues
    fixed = fixed.replace(/\\"/g, '"'); // Unescape quotes
    fixed = fixed.replace(/"/g, '\\"'); // Re-escape quotes properly
    fixed = fixed.replace(/\\\\/g, '\\'); // Fix double backslashes
    
    // Fix missing quotes around property names
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // Fix single quotes to double quotes
    fixed = fixed.replace(/'/g, '"');
    
    // Fix trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix missing commas between objects
    fixed = fixed.replace(/}\s*{/g, '},{');
    
    // Fix missing commas after array elements
    fixed = fixed.replace(/}\s*]/g, '}]');
    fixed = fixed.replace(/"\s*]/g, '"]');
    
    // Fix specific array syntax issues
    fixed = fixed.replace(/,\s*,/g, ','); // Remove double commas
    fixed = fixed.replace(/,\s*]/g, ']'); // Remove trailing commas before closing brackets
    fixed = fixed.replace(/,\s*}/g, '}'); // Remove trailing commas before closing braces
    
    // Fix unclosed strings
    let inString = false;
    let escapeNext = false;
    let result = '';
    
    for (let i = 0; i < fixed.length; i++) {
      const char = fixed[i];
      
      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        result += char;
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }
      
      result += char;
    }
    
    // If we ended in a string, close it
    if (inString) {
      result += '"';
    }
    
    // Final cleanup - ensure proper array structure
    result = result.replace(/}\s*]\s*}/g, '}]}'); // Fix nested array closing
    result = result.replace(/]\s*}\s*}/g, ']}}'); // Fix nested object closing
    
    return result;
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

    // Fix common alert type mismatches
    alertData = this.fixAlertTypeMismatches(alertData);
    
    // Fix invalid impact values
    alertData = this.fixInvalidImpactValues(alertData);

    // Validate source URL is provided and is a valid URL
    if (!alertData.sourceUrl) {
      console.warn(`Missing sourceUrl for alert: ${alertData.title}`);
      return false;
    }

    // Fix URLs that are missing protocols
    if (alertData.sourceUrl && !alertData.sourceUrl.startsWith('http://') && !alertData.sourceUrl.startsWith('https://')) {
      console.log(`Fixing URL for alert: ${alertData.title}. Original: ${alertData.sourceUrl}`);
      alertData.sourceUrl = `https://${alertData.sourceUrl}`;
      console.log(`Fixed URL: ${alertData.sourceUrl}`);
    }

    try {
      new URL(alertData.sourceUrl);
    } catch (error) {
      console.warn(`Invalid sourceUrl for alert: ${alertData.title}. URL: ${alertData.sourceUrl}`);
      return false;
    }

    // Validate dates - allow alerts that are active during the current week
    // This includes:
    // 1. Alerts that start today or in the next 7 days
    // 2. Alerts that started before today but end within the current week
    // 3. Alerts that span across weeks (end date can be up to 2 weeks from now)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today
    const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const twoWeeksFromNow = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

    if (alertData.expectedStart && alertData.expectedEnd) {
      const startDate = new Date(alertData.expectedStart);
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endDate = new Date(alertData.expectedEnd);
      const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      
      // Check if the alert is active during the current week
      const alertStartsInCurrentWeek = startDateOnly >= today && startDateOnly <= sevenDaysFromNow;
      const alertEndsInCurrentWeek = endDateOnly >= today && endDateOnly <= sevenDaysFromNow;
      const alertSpansCurrentWeek = startDateOnly < today && endDateOnly >= today;
      const alertSpansFutureWeeks = startDateOnly >= today && endDateOnly <= twoWeeksFromNow;
      
      if (!alertStartsInCurrentWeek && !alertEndsInCurrentWeek && !alertSpansCurrentWeek && !alertSpansFutureWeeks) {
        console.warn(`Alert not active during current week: ${alertData.title}. Start: ${startDateOnly}, End: ${endDateOnly}, Today: ${today}, Week end: ${sevenDaysFromNow}`);
        return false;
      }
      
      // Log which condition was met
      if (alertStartsInCurrentWeek) {
        console.log(`Alert starts in current week: ${alertData.title} (${startDateOnly})`);
      } else if (alertEndsInCurrentWeek) {
        console.log(`Alert ends in current week: ${alertData.title} (${endDateOnly})`);
      } else if (alertSpansCurrentWeek) {
        console.log(`Alert spans current week: ${alertData.title} (${startDateOnly} to ${endDateOnly})`);
      } else if (alertSpansFutureWeeks) {
        console.log(`Alert spans future weeks: ${alertData.title} (${startDateOnly} to ${endDateOnly})`);
      }
    } else if (alertData.expectedStart) {
      // If only start date is provided, it must be in the current week
      const startDate = new Date(alertData.expectedStart);
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      
      if (startDateOnly < today || startDateOnly > sevenDaysFromNow) {
        console.warn(`Invalid start date for alert: ${alertData.title}. Date: ${startDateOnly}, must be between ${today} and ${sevenDaysFromNow}`);
        return false;
      }
    } else if (alertData.expectedEnd) {
      // If only end date is provided, it must be in the current week
      const endDate = new Date(alertData.expectedEnd);
      const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      
      if (endDateOnly < today || endDateOnly > sevenDaysFromNow) {
        console.warn(`Invalid end date for alert: ${alertData.title}. Date: ${endDateOnly}, must be between ${today} and ${sevenDaysFromNow}`);
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

    // Validate target audiences
    if (alertData.targetAudience && Array.isArray(alertData.targetAudience)) {
      const invalidAudiences = alertData.targetAudience.filter(audience => !TARGET_AUDIENCES.includes(audience));
      if (invalidAudiences.length > 0) {
        console.warn(`Invalid target audiences for alert "${alertData.title}": ${invalidAudiences.join(', ')}`);
        // Remove invalid audiences
        alertData.targetAudience = alertData.targetAudience.filter(audience => TARGET_AUDIENCES.includes(audience));
        console.log(`Fixed target audiences for "${alertData.title}": ${alertData.targetAudience.join(', ')}`);
      }
    }



    // Validate priority level
    if (alertData.priority && !PRIORITY_LEVELS.includes(alertData.priority)) {
      console.warn(`Invalid priority level for alert "${alertData.title}": ${alertData.priority}`);
      // Set default priority
      alertData.priority = 'medium';
      console.log(`Fixed priority level for "${alertData.title}": ${alertData.priority}`);
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