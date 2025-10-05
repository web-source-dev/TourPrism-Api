import dotenv from 'dotenv';
import cron from 'node-cron';
import Alert from '../models/Alert.js';
import Logger from './logger.js';

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
  'Airline', 'DMO', 'Hotel', 'Tour Operator', 'Travel agent'
];

// Severity levels
const SEVERITY_LEVELS = ['Low', 'Moderate', 'High'];

// Priority levels
const PRIORITY_LEVELS = ['low', 'medium', 'high'];

class AutomatedAlertGenerator {
  constructor() {
    // Use Gemini API instead of OpenAI
    this.geminiApiKey = process.env.GOOGLE_API_KEY;
    // Default Gemini model – can be tuned to "gemini-1.5-pro" if desired
    this.geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
  }

  // Prompt 1: Alert Generation System Instruction
  buildPrompt1SystemInstruction(city, advisor) {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 14 days from now
    
    // Format current date with day of week and timezone
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayName = dayNames[now.getDay()];
    const monthName = monthNames[now.getMonth()];
    const day = now.getDate();
    const year = now.getFullYear();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentDateTime = `${dayName}, ${monthName} ${day}, ${year} at ${hours}:${minutes} BST`;
    
    return `CURRENT DATE ANCHOR: The current date and time is ${currentDateTime}. All searches MUST be anchored to this current date.

You are a highly specialized research analyst for the ${city} ${advisor} sector. Your sole task is to find high-impact, current, and sourced disruption events and quantify their threat.

Scope of Disruptions: Industrial strikes, Extreme weather, Infrastructure failures, Public safety incidents, Major events/festivals, Aviation/airport disruptions, Global incidents with knock-on impact.

Time Constraint (CRITICAL FILTER - Non-Negotiable Rolling Window): All events MUST be currently active or scheduled to begin within the next 14 days (i.e., before ${futureDate}).

STRICT DATE CHECK: Any event that has an end date BEFORE the current date (${currentDate}) MUST be marked as invalid. You MUST NOT include events that have already ended.

Alert Mix Quota (AIM FOR): Aim for 5 distinct alerts.

Aim for a minimum of 3 alerts that are local or national (e.g., local infrastructure, UK politics).

Aim for a minimum of 2 alerts that are synthesized knock-on effects from a major global (e.g., Asia, North America) or continental (e.g., EU) incident.

Source Mandate: For an alert to be included, you MUST provide at least one source name and a corresponding URL. Alerts without both source fields must be excluded.

Output: The output must be a JSON object containing an array of 5 or fewer raw alerts.`;
  }

  // Prompt 1: Alert Generation User Query
  buildPrompt1UserQuery(city, advisor) {
    const currentDate = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    return `Generate a list of high-impact alerts concerning the scope disruptions that will specifically disrupt the ${advisor} sector in ${city}.

For each alert, provide:

id: A unique string identifier.

raw_headline: A short (max 10 words) factual headline.

summary_detail: A 2-3 sentence summary of the event, origin, and expected duration.

raw_start_date: The raw text date/time of the event start.

raw_end_date: The raw text date/time of the event end.

specific_impact_metric: A single quantifiable business metric (e.g., "24-Hour IT Downtime," "15% Revenue Risk," "48-Hour Water Loss").

confidence_score: A numerical score between 0.0 and 1.0 reflecting the certainty of the disruption's impact and timing.

is_date_valid: A boolean value (true or false). MUST be 'true' only if the event has not yet ended; 'false' if the end date is in the past.

source_name: The name of the primary source (e.g., BBC, The Financial Times).

source_url: The URL link to the primary source.

REQUIRED JSON SCHEMA

{
  "alerts": [
    {
      "id": "string",
      "raw_headline": "string",
      "summary_detail": "string",
      "raw_start_date": "string",
      "raw_end_date": "string",
      "specific_impact_metric": "string",
      "confidence_score": "number (0.0 to 1.0)",
      "is_date_valid": "boolean",
      "source_name": "string",
      "source_url": "string"
    }
  ]
}`;
  }

  // Prompt 2: Advisory Synthesis System Instruction
  buildPrompt2SystemInstruction(city, advisor) {
    const missionStatement = this.getMissionStatement(advisor);
    const taxonomy = this.getTaxonomy();
    
    return `You are the senior ${advisor} AI Advisor for ${city}. You must strictly adhere to ALL quality guardrails listed below. Your goal is to create high-urgency, business-critical alerts that feel like a direct directive from a specialized consultant.

Advisor Mission Statement: ${missionStatement}

TAXONOMY: ${taxonomy}
IMPACT_LEVELS: Low, Moderate, Severe

--- NON-NEGOTIABLE QUALITY GUARDRAILS ---

Quality Gate (Date): You MUST exclude any input alert where 'is_date_valid' is FALSE. This is the first mandatory filter.

Quality Gate (Confidence): You MUST exclude any input alert that has a 'confidence_score' LESS THAN 0.5.

Source Gate: You MUST exclude any input alert where 'source_name' or 'source_url' is missing or empty.

Header Mandate (Business-Focused): Must be 7-12 words, probabilistic, and structured as: [DISRUPTION SOURCE] + [IMPACT VERB/METRIC] + [LOCAL ASSET/CITY]. The header MUST NOT contain capitalization (except for proper nouns), hyphens, colons, or dashes.

ISO Date Mandate: Convert raw dates to strictly formatted ISO 8601 strings (YYYY-MM-DDTHH:MM:SSZ).

Issue Mandate (Mitigation Opportunity): Must be EXACTLY one sentence, max 20 words. The sentence must explicitly state how the disruption threatens the Advisor's core Mission Statement (e.g., "threatens guest satisfaction," "jeopardizes operational capacity").

Recommendation Mandate (Imperative): Must be EXACTLY one sentence, actionable, and begin with an imperative verb (e.g., 'Notify...', 'Extend...', 'Prepare...').

Global Link Mechanism Mandate: If the alert is a global or continental knock-on effect, the field 'Global_Link_Mechanism' MUST explicitly describe the physical or financial chain of causation for the disruption in ${city}.

Other Fields: Category, Sub-category, Origin, and Impact Level must use EXACT values from the provided taxonomy.

Output: The output must be a JSON array of the final, structured recommendation objects.`;
  }

  // Prompt 2: Advisory Synthesis User Query
  buildPrompt2UserQuery(city, rawAlertsJson) {
    const currentDate = new Date().toISOString().split('T')[0];
    
    return `Analyze the following raw alerts for ${city} and transform them into final, fully structured, high-quality recommendations, ensuring all guardrails are met. Exclude any alerts that fail the quality gates.

Raw Alerts Input:
${rawAlertsJson}

REQUIRED JSON SCHEMA

{
  "recommendations": [
    {
      "alert_id": "string",
      "Header": "string",
      "Origin_Location": "string",
      "Impact_Level": "enum(Low, Moderate, Severe)",
      "Category": "enum(Industrial Action, Extreme Weather, etc.)",
      "Sub_category": "string",
      "confidence_score": "number (0.0 to 1.0)",
      "Global_Link_Mechanism": "string (REQUIRED for global alerts, empty string for local/national)",
      "start_date_time": "string (ISO 8601)",
      "end_date_time": "string (ISO 8601)",
      "Issue": "string",
      "Recommendation": "string",
      "source_name": "string",
      "source_url": "string"
    }
  ]
}`;
  }

  // Helper method to get mission statement based on advisor type
  getMissionStatement(advisor) {
    const missionStatements = {
      'Hotel': 'Your core mission is to protect hotel revenue by guaranteeing guest satisfaction and maintaining full operational capacity.',
      'DMO': 'Your core mission is to safeguard destination reputation and visitor experience while maintaining tourism revenue streams.',
      'Tour Operator': 'Your core mission is to ensure seamless tour delivery and protect customer satisfaction while maintaining operational efficiency.',
      'Travel Agency': 'Your core mission is to protect client travel investments and maintain service quality while ensuring customer satisfaction.',
      'Airline': 'Your core mission is to maintain operational efficiency and passenger satisfaction while protecting revenue streams.',
      'default': 'Your core mission is to protect business operations and maintain service quality while ensuring customer satisfaction.'
    };
    return missionStatements[advisor] || missionStatements.default;
  }

  // Helper method to get taxonomy
  getTaxonomy() {
    return `Industrial Action: Strike, Work-to-Rule, Labor Dispute, Other
Extreme Weather: Storm, Flooding, Heatwave, Wildfire, Snow, Other
Infrastructure Failures: Power Outage, IT & System Failure, Transport Service Suspension, Road, Rail & Tram Closure, Repairs or Delays, Other
Public Safety Incidents: Protest, Crime, Terror Threats, Travel Advisory, Other
Festivals and Events: Citywide Festival, Sporting Event, Concerts and Stadium Events, Parades and Ceremonies, Other`;
  }

  async generateAlertsForCity(cityKey, advisor = 'Hotel') {
    const city = CITIES[cityKey];
    if (!city) {
      throw new Error(`Unknown city: ${cityKey}`);
    }

    try {
      console.log(`Starting two-prompt alert generation for ${city.name} (${advisor} sector)...`);

      // Step 1: Generate raw alerts using Prompt 1
      const prompt1SystemInstruction = this.buildPrompt1SystemInstruction(city.name, advisor);
      const prompt1UserQuery = this.buildPrompt1UserQuery(city.name, advisor);
      
      console.log(`Calling Prompt 1 for ${city.name}...`);
      const rawAlertsResponse = await this.callGeminiWithSystemInstruction(prompt1SystemInstruction, prompt1UserQuery);
      const rawAlertsJson = this.extractJsonFromResponse(rawAlertsResponse);
      
      
      let rawAlerts;
      try {
        rawAlerts = JSON.parse(rawAlertsJson);
      } catch (parseError) {
        const fixedJson = this.fixCommonJsonIssues(rawAlertsJson);
        rawAlerts = JSON.parse(fixedJson);
      }

      if (!rawAlerts.alerts || !Array.isArray(rawAlerts.alerts)) {
        throw new Error('Invalid raw alerts format from Prompt 1');
      }

      console.log(`Generated ${rawAlerts.alerts.length} raw alerts for ${city.name}`);

      // Step 2: Transform raw alerts into structured recommendations using Prompt 2
      const prompt2SystemInstruction = this.buildPrompt2SystemInstruction(city.name, advisor);
      const prompt2UserQuery = this.buildPrompt2UserQuery(city.name, JSON.stringify(rawAlerts));
      
      console.log(`Calling Prompt 2 for ${city.name}...`);
      const recommendationsResponse = await this.callGeminiWithSystemInstruction(prompt2SystemInstruction, prompt2UserQuery);
      const recommendationsJson = this.extractJsonFromResponse(recommendationsResponse);
      
      
      let recommendations;
      try {
        recommendations = JSON.parse(recommendationsJson);
      } catch (parseError) {
        const fixedJson = this.fixCommonJsonIssues(recommendationsJson);
        recommendations = JSON.parse(fixedJson);
      }

      if (!recommendations.recommendations || !Array.isArray(recommendations.recommendations)) {
        throw new Error('Invalid recommendations format from Prompt 2');
      }

      // Transform recommendations back to the expected alert format
      return recommendations.recommendations.map(recommendation => ({
        title: recommendation.Header,
        description: recommendation.Issue,
        alertCategory: recommendation.Category,
        alertType: recommendation.Sub_category,
        impact: recommendation.Impact_Level,
        priority: this.mapImpactToPriority(recommendation.Impact_Level),
        targetAudience: [advisor],
        recommendedAction: recommendation.Recommendation,
        expectedStart: recommendation.start_date_time,
        expectedEnd: recommendation.end_date_time,
        originCity: city.name,
        originCountry: city.country,
        originLatitude: city.latitude,
        originLongitude: city.longitude,
        originPlaceId: city.placeId,
        originLocation: {
          type: 'Point',
          coordinates: [city.longitude, city.latitude]
        },
        impactLocations: [{
          city: city.name,
          country: city.country,
          latitude: city.latitude,
          longitude: city.longitude,
          location: {
            type: 'Point',
            coordinates: [city.longitude, city.latitude]
          }
        }],
        confidence: recommendation.confidence_score,
        source: recommendation.source_name,
        sourceUrl: recommendation.source_url,
        globalLinkMechanism: recommendation.Global_Link_Mechanism || '',
        alertId: recommendation.alert_id
      }));

    } catch (error) {
      console.error(`Error generating alerts for ${city.name}:`, error);
      throw error;
    }
  }

  // Helper method to map impact level to priority
  mapImpactToPriority(impactLevel) {
    const mapping = {
      'Low': 'low',
      'Moderate': 'medium',
      'Severe': 'high'
    };
    return mapping[impactLevel] || 'medium';
  }

  async callGeminiWithSystemInstruction(systemInstruction, userPrompt) {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key (GOOGLE_API_KEY) not configured');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;

    const body = {
      system_instruction: {
        role: 'system',
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.3, // Lower temperature for more consistent JSON formatting
        topP: 0.8,
        topK: 20,
        maxOutputTokens: 8192 // Increased to handle longer JSON responses
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

  async callGemini(userPrompt) {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key (GOOGLE_API_KEY) not configured');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.3, // Lower temperature for more consistent JSON formatting
        topP: 0.8,
        topK: 20,
        maxOutputTokens: 8192 // Increased to handle longer JSON responses
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
        'None': 'Low',
        'Unknown': 'Moderate',
        'Low': 'Low',
        'Medium': 'Moderate',
        'High': 'High',
        'Critical': 'High',
        'Major': 'High'
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
      alertData.alertType = typeMappings[alertData.alertType];
    }

    return alertData;
  }

  fixInvalidImpactValues(alertData) {
    const impactMappings = {
      'None': 'Low',
      'Unknown': 'Moderate',
      'Low': 'Low',
      'Medium': 'Moderate',
      'High': 'High',
      'Critical': 'High',
      'Major': 'High',
      'Minor': 'Low',
      'Moderate': 'Moderate',
      'Severe': 'High'
    };

    if (alertData.impact && impactMappings[alertData.impact]) {
      alertData.impact = impactMappings[alertData.impact];
    } else if (alertData.impact && !SEVERITY_LEVELS.includes(alertData.impact)) {
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

    // Check for old dates (2024 or earlier) - reject immediately
    const currentYear = new Date().getFullYear();
    if (alertData.expectedStart) {
      const startYear = new Date(alertData.expectedStart).getFullYear();
      if (startYear < currentYear) {
        return false;
      }
    }
    if (alertData.expectedEnd) {
      const endYear = new Date(alertData.expectedEnd).getFullYear();
      if (endYear < currentYear) {
        return false;
      }
    }

    // Fix common alert type mismatches
    alertData = this.fixAlertTypeMismatches(alertData);
    
    // Fix invalid impact values
    alertData = this.fixInvalidImpactValues(alertData);

    // Validate source URL is provided and is a valid URL
    if (!alertData.sourceUrl) {
      return false;
    }

    // Fix URLs that are missing protocols
    if (alertData.sourceUrl && !alertData.sourceUrl.startsWith('http://') && !alertData.sourceUrl.startsWith('https://')) {
      alertData.sourceUrl = `https://${alertData.sourceUrl}`;
    }

    try {
      new URL(alertData.sourceUrl);
    } catch (error) {
      return false;
    }

    // Validate dates - allow alerts that overlap with the next 15 days
    // This includes:
    // 1. Alerts that start within the next 15 days (regardless of end date)
    // 2. Alerts that end within the next 15 days (regardless of start date)
    // 3. Alerts that started before today but end within the next 15 days
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today
    const fifteenDaysFromNow = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);

    if (alertData.expectedStart && alertData.expectedEnd) {
      const startDate = new Date(alertData.expectedStart);
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endDate = new Date(alertData.expectedEnd);
      const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      
      // Check if the alert overlaps with the next 15 days
      // Include alerts that:
      // 1. Start within the next 15 days (regardless of end date)
      // 2. End within the next 15 days (regardless of start date)
      // 3. Span across the 15-day period (start before today, end after today)
      const alertStartsInNext15Days = startDateOnly >= today && startDateOnly <= fifteenDaysFromNow;
      const alertEndsInNext15Days = endDateOnly >= today && endDateOnly <= fifteenDaysFromNow;
      const alertSpansNext15Days = startDateOnly < today && endDateOnly >= today;
      
      if (!alertStartsInNext15Days && !alertEndsInNext15Days && !alertSpansNext15Days) {
       return false;
      }
      
      // Log which condition was met
      if (alertStartsInNext15Days) {
        // console.log(`Alert starts in next 15 days: ${alertData.title} (${startDateOnly})`);

      } else if (alertEndsInNext15Days) {
        // console.log(`Alert ends in next 15 days: ${alertData.title} (${endDateOnly})`);
      } else if (alertSpansNext15Days) {
        // console.log(`Alert spans next 15 days: ${alertData.title} (${startDateOnly} to ${endDateOnly})`);
      }
    } else if (alertData.expectedStart) {
      // If only start date is provided, it must be within the next 15 days
      const startDate = new Date(alertData.expectedStart);
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      
      if (startDateOnly < today || startDateOnly > fifteenDaysFromNow) {
        return false;
      }
    } else if (alertData.expectedEnd) {
      // If only end date is provided, it must be within the next 15 days
      const endDate = new Date(alertData.expectedEnd);
      const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      
      if (endDateOnly < today || endDateOnly > fifteenDaysFromNow) {
        return false;
      }
    }

    // Validate alert category and type
    if (!ALERT_CATEGORIES[alertData.alertCategory]) {
      return false;
    }

    if (alertData.alertType && !ALERT_CATEGORIES[alertData.alertCategory].includes(alertData.alertType)) {
      return false;
    }

    // Validate target audiences
    if (alertData.targetAudience && Array.isArray(alertData.targetAudience)) {
      const invalidAudiences = alertData.targetAudience.filter(audience => !TARGET_AUDIENCES.includes(audience));
      if (invalidAudiences.length > 0) {
        alertData.targetAudience = alertData.targetAudience.filter(audience => TARGET_AUDIENCES.includes(audience));
      }
    }



    // Validate priority level
    if (alertData.priority && !PRIORITY_LEVELS.includes(alertData.priority)) {
      alertData.priority = 'medium';
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
      addToEmailSummary: false, // Don't auto-add to email summary since all alerts are pending
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
    } else if (confidence >= 0.5) {
      return 'pending';
    } else {
      return 'rejected';
    }
    return 'pending';
  }

  async generateAlertsForAllCities(advisor = null) {
    // If no advisor specified, generate for all sectors
    if (!advisor) {
      return await this.generateAlertsForAllSectors();
    }

    console.log(`Starting automated alert generation for all cities (${advisor} sector)...`);
    
    const processStartTime = new Date();
    const results = {
      total: 0,
      approved: 0,
      pending: 0,
      duplicates: 0,
      errors: 0,
      cityResults: {}
    };

    for (const [cityKey, city] of Object.entries(CITIES)) {
      console.log(`Generating alerts for ${city.name} (${advisor} sector)...`);

      try {
        const alerts = await this.generateAlertsForCity(cityKey, advisor);
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

              // All alerts are now pending for manual review
              results.pending++;
              results.cityResults[city.name].pending++;
            }

            results.total++;
          } catch (error) {
            results.errors++;
            results.cityResults[city.name].errors++;
          }
        }
      } catch (error) {
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

    const processEndTime = new Date();
    const processDuration = processEndTime - processStartTime;

    // Log the results
    await this.logGenerationResults(results, processStartTime, processEndTime, processDuration, advisor);

    console.log('Automated alert generation completed:', results);
    return results;
  }

  async generateAlertsForAllSectors() {
    console.log('Starting automated alert generation for all cities and all sectors...');
    
    const advisorTypes = ['Hotel', 'DMO', 'Tour Operator', 'Travel Agency', 'Airline'];
    const overallResults = {
      total: 0,
      approved: 0,
      pending: 0,
      duplicates: 0,
      errors: 0,
      sectorResults: {}
    };

    for (const advisor of advisorTypes) {
      console.log(`Generating alerts for ${advisor} sector...`);
      try {
        const sectorResults = await this.generateAlertsForAllCities(advisor);
        
        overallResults.total += sectorResults.total;
        overallResults.approved += sectorResults.approved;
        overallResults.pending += sectorResults.pending;
        overallResults.duplicates += sectorResults.duplicates;
        overallResults.errors += sectorResults.errors;
        
        overallResults.sectorResults[advisor] = sectorResults;
      } catch (error) {
        console.error(`Error generating alerts for ${advisor} sector:`, error);
        overallResults.sectorResults[advisor] = {
          total: 0,
          approved: 0,
          pending: 0,
          duplicates: 0,
          errors: 1
        };
        overallResults.errors++;
      }
    }

    console.log('Automated alert generation completed for all sectors:', overallResults);
    return overallResults;
  }

  async logGenerationResults(results, processStartTime, processEndTime, processDuration, advisor = 'Hotel') {
    try {
      await Logger.logSystem('automated_alert_generation_completed', {
        advisorSector: advisor,
        totalAlertsGenerated: results.total,
        totalApproved: results.approved,
        totalPending: results.pending,
        totalDuplicates: results.duplicates,
        totalErrors: results.errors,
        processStartTime: processStartTime.toISOString(),
        processEndTime: processEndTime.toISOString(),
        processDurationMs: processDuration,
        processDurationMinutes: (processDuration / 1000 / 60).toFixed(2),
        citiesProcessed: Object.keys(CITIES),
        successRate: results.total > 0 ? ((results.approved + results.pending) / results.total * 100).toFixed(2) + '%' : '0%',
        averageAlertsPerCity: (results.total / Object.keys(CITIES).length).toFixed(2)
      });
    } catch (error) {
      console.error('Error logging generation results:', error);
    }
  }
}

// Schedule the automated alert generation
const scheduleAutomatedAlerts = () => {
  const generator = new AutomatedAlertGenerator();

  // Schedule for Monday and Thursday at 8:00 AM Edinburgh time
  cron.schedule('0 8 * * 1,4', async () => {
  // cron.schedule('22 * * * *', async () => {
    console.log('Starting scheduled automated alert generation...');
    try {
      // Generate alerts for all sectors
      await generator.generateAlertsForAllSectors();
    } catch (error) {
      console.error('Error in scheduled alert generation:', error);
    }
  }, {
    scheduled: true,
    timezone: "Europe/London"
  });

  console.log('Automated alert generation scheduled for Monday and Thursday at 8:00 AM Edinburgh time');
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