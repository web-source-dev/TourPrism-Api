const axios = require('axios');

class GrokService {
  constructor() {
    this.apiKey = process.env.GROK_API_KEY;
    this.baseURL = process.env.GROK_BASE_URL || 'https://api.x.ai/v1'; 

    if (!this.apiKey) {
      console.warn('GROK_API_KEY not found in environment variables');
    }
  }

  async initialize() {
    if (this.apiKey) {
      console.log('Grok service initialized with API key');
    }
  }

  async generateDisruptions(city) {
    try {
      if (!this.apiKey) {
        console.log('Grok API key not configured, returning empty disruptions');
        return [];
      }

      // Get existing alerts to avoid duplicates
      const existingTitles = await this.getExistingAlertTitles(city);
      console.log(`Found ${existingTitles.length} existing alerts for ${city}`);

      const disruptions = [];
      const maxDisruptions = 25; // Generate up to 25 disruptions per city

      for (let i = 0; i < maxDisruptions; i++) {
        try {
          console.log(`Generating disruption ${i + 1}/${maxDisruptions} for ${city}...`);

          const disruption = await this.generateSingleDisruption(city, existingTitles, disruptions);
          if (disruption) {
            disruptions.push(disruption);
            existingTitles.push(disruption.title); // Add to existing titles to avoid duplicates in same batch
            console.log(`✅ Generated: ${disruption.title}`);
          } else {
            console.log(`⚠️ No valid disruption generated for attempt ${i + 1}`);
          }

          // Small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`Error generating disruption ${i + 1}:`, error.message);
          continue; // Continue with next disruption
        }
      }

      console.log(`Grok generated ${disruptions.length} valid disruptions for ${city}`);
      return disruptions;

    } catch (error) {
      console.error('Error generating disruptions with Grok:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Generate a single disruption, avoiding duplicates
   */
  async generateSingleDisruption(city, existingTitles, currentBatchDisruptions) {
    // Combine existing titles with current batch titles
    const allTitles = [...existingTitles, ...currentBatchDisruptions.map(d => d.title)];

    // Calculate date range: today to 30 days from now
    const today = new Date();
    const maxDate = new Date();
    maxDate.setDate(today.getDate() + 30);
    
    const todayStr = today.toISOString().slice(0, 10);
    const maxDateStr = maxDate.toISOString().slice(0, 10);
    
    // Calculate example dates (7-10 days from today for example)
    const exampleStartDate = new Date();
    exampleStartDate.setDate(today.getDate() + 7);
    const exampleEndDate = new Date();
    exampleEndDate.setDate(today.getDate() + 8);
    
    const exampleStartStr = exampleStartDate.toISOString().slice(0, 10);
    const exampleEndStr = exampleEndDate.toISOString().slice(0, 10);

    const prompt = `You are a hotel disruption scout for ${city}. Your task: Find **ONE specific disruption** that could prevent guests from arriving or checking in within the next 30 days.

**CURRENT DATE: ${todayStr} (YYYY-MM-DD format)**
**VALID DATE RANGE: ${todayStr} to ${maxDateStr} (next 30 days)**

VALID CATEGORIES (use exactly these):
Main Types: strike, weather, protest, flight_issues, staff_shortage, supply_chain, system_failure, policy, economy, other

Sub Types by Main Type:
- strike: airline_pilot, rail, ferry, ground_staff, baggage_handlers
- weather: snow, flood, storm, fog, ice, hurricane, heatwave, cold_snap
- protest: march, blockade, sit_in, demonstration, rally, riot, civil_unrest
- flight_issues: delay, cancellation, grounding, overbooking, airspace_restriction, runway_closure
- staff_shortage: airport_check_in, hotel_cleaning, pilot_shortage, crew_absence
- supply_chain: jet_fuel_shortage, catering_delay, laundry_crisis, toiletries_shortage
- system_failure: IT_crash, border_control_outage, booking_system_down, e_gates_failure, ATM_system_failure
- policy: travel_ban, visa_change, quarantine_rule, advisory, embargo
- economy: pound_surge, recession, tourist_drop, exchange_rate_crash, FX_volatility, inflation_hit
- other: road_closure, festival_chaos, construction_delay, mechanical_failure

CRITICAL RULES:
1. Must affect ${city} arrivals specifically. Global events only if they **directly affect ${city}**.
2. Use **realistic, specific sub-events** in the title.
3. **DATE REQUIREMENT**: start_date and end_date MUST be between ${todayStr} and ${maxDateStr}. Use dates in YYYY-MM-DD format. Do NOT use past dates or dates beyond 30 days.
4. Use **EXACT category names** from the lists above.
5. The "title" must be **unique**, not similar to any existing title.
6. Use **credible sources only** (Reuters, BBC, local news). Ensure the URL is plausible.
7. Event summaries must clearly describe **how it affects arrivals or check-ins**.

DO NOT GENERATE THESE EXISTING ALERTS:
${allTitles.map(title => `- "${title}"`).join('\n')}

OUTPUT INSTRUCTIONS:
- Respond **only** with a **single valid JSON object**.
- Do **not** include explanations, markdown, arrays, or extra text.
- Follow this exact key order: city, main_type, sub_type, title, start_date, end_date, source, url, summary
- **CRITICAL**: start_date and end_date must be between ${todayStr} and ${maxDateStr}

EXAMPLE (dates are examples - use dates between ${todayStr} and ${maxDateStr}):
{
  "city":"${city}",
  "main_type":"strike",
  "sub_type":"airline_pilot",
  "title":"Ryanair Rome-${city} pilot strike",
  "start_date":"${exampleStartStr}",
  "end_date":"${exampleEndStr}",
  "source":"Reuters",
  "url":"https://www.reuters.com/business/aerospace-defense/ryanair-pilot-strike-rome/",
  "summary":"All Ryanair flights from Rome to ${city} cancelled due to pilot strike. Guests may not arrive."
}`;

    const response = await axios.post(`${this.baseURL}/chat/completions`, {
      messages: [{ role: 'user', content: prompt }],
      model: 'grok-4-1-fast-reasoning',
      temperature: 0, // Lower temperature for more accurate, realistic alerts
      max_tokens: 20000 // Increased token limit for detailed responses
    }, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content received from Grok API');
    }

    // Clean the content - remove any markdown or extra text
    let cleanContent = content.trim();

    // Remove markdown code blocks if present
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Try to extract JSON object if there's extra text
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanContent = jsonMatch[0];
    }

    console.log('Single disruption response:', cleanContent.substring(0, 150) + '...');

    // Parse and validate JSON
    const disruption = JSON.parse(cleanContent);

    // Validate structure (single object, not array)
    if (typeof disruption !== 'object' || Array.isArray(disruption)) {
      throw new Error('Response is not a valid JSON object');
    }

    // Validate required fields
    const requiredFields = ['city', 'main_type', 'sub_type', 'title', 'start_date', 'end_date', 'source', 'url', 'summary'];
    for (const field of requiredFields) {
      if (!disruption[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Additional validations
    if (disruption.city !== city) {
      throw new Error(`Generated disruption city "${disruption.city}" does not match requested city "${city}"`);
    }

    if (allTitles.includes(disruption.title)) {
      throw new Error(`Generated title "${disruption.title}" already exists`);
    }

    // Validate dates are within the next 30 days
    const validationToday = new Date();
    validationToday.setHours(0, 0, 0, 0);
    const validationMaxDate = new Date();
    validationMaxDate.setDate(validationToday.getDate() + 30);
    validationMaxDate.setHours(23, 59, 59, 999);

    const startDate = new Date(disruption.start_date);
    const endDate = new Date(disruption.end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error(`Invalid date format: start_date="${disruption.start_date}", end_date="${disruption.end_date}"`);
    }

    if (startDate < validationToday) {
      throw new Error(`start_date "${disruption.start_date}" is in the past. Today is ${validationToday.toISOString().slice(0, 10)}`);
    }

    if (startDate > validationMaxDate) {
      throw new Error(`start_date "${disruption.start_date}" is more than 30 days in the future. Max date is ${validationMaxDate.toISOString().slice(0, 10)}`);
    }

    if (endDate < startDate) {
      throw new Error(`end_date "${disruption.end_date}" is before start_date "${disruption.start_date}"`);
    }

    if (endDate > validationMaxDate) {
      throw new Error(`end_date "${disruption.end_date}" is more than 30 days in the future. Max date is ${validationMaxDate.toISOString().slice(0, 10)}`);
    }

    // Transform to internal format
    return {
      city: disruption.city,
      mainType: disruption.main_type,
      subType: disruption.sub_type,
      title: disruption.title,
      start_date: disruption.start_date,
      end_date: disruption.end_date,
      source: disruption.source,
      url: disruption.url,
      summary: disruption.summary
    };
  }

  /**
   * Get existing alert titles for a city to avoid duplicates
   */
  async getExistingAlertTitles(city) {
    try {
      const Alert = require('../models/Alert.js');
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const existingAlerts = await Alert.find({
        city: city,
        startDate: { $lte: thirtyDaysFromNow },
        endDate: { $gte: new Date() },
        status: { $ne: 'expired' }
      }).select('title').lean();

      return existingAlerts.map(alert => alert.title);
    } catch (error) {
      console.error('Error fetching existing alert titles:', error);
      return [];
    }
  }

  /**
   * Generate header prefix for an alert based on title and confidence
   * @param {string} title - The alert title
   * @param {number} confidence - Confidence score (0-1)
   * @returns {Promise<string>} Generated header prefix
   */
  async generateHeaderPrefix(title, confidence) {
    try {
      if (!this.apiKey) {
        console.log('Grok API key not configured, skipping header prefix generation');
        return null;
      }

      // Determine uncertainty verb based on confidence
      let uncertaintyVerbs;
      const confidencePercent = confidence * 100;
      
      if (confidencePercent < 40) {
        uncertaintyVerbs = ['might', 'could'];
      } else if (confidencePercent >= 40 && confidencePercent <= 70) {
        uncertaintyVerbs = ['may'];
      } else {
        uncertaintyVerbs = ['is likely to'];
      }

      const prompt = `You generate ONLY the beginning of an alert header.

GOAL:
Produce a short, probabilistic prefix describing the cause and uncertainty.

RULES:
- Output must NOT include numbers, dates, rooms, or time ranges
- Output must NOT end with punctuation
- Output must be between 2–5 words
- Must include one uncertainty verb from this list: ${uncertaintyVerbs.join(', ')}
- Must include one impact verb from this list: affect, impact, disrupt, reduce, empty
- Do NOT add any words after the impact verb

FORMAT:
"<Cause> <uncertainty verb> <impact verb>"

VALID:
- "Severe weather could impact"
- "Operational disruption may affect"
- "Labor strike is likely to disrupt"

INVALID:
- "Severe weather will impact"
- "Weather could impact rooms"
- "Operational issue may reduce occupancy"

Alert title:
"${title}"

Generate the header prefix:`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        messages: [{ role: 'user', content: prompt }],
        model: 'grok-4-1-fast-reasoning',
        temperature: 0.3,
        max_tokens: 50
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from Grok API');
      }

      // Clean the content - remove any markdown, quotes, or extra text
      let cleanContent = content.trim();
      
      // Remove quotes if present
      cleanContent = cleanContent.replace(/^["']|["']$/g, '');
      
      // Remove markdown code blocks if present
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\w*\s*/, '').replace(/\s*```$/, '');
      }
      
      // Remove trailing punctuation
      cleanContent = cleanContent.replace(/[.,;:!?]+$/, '');
      
      // Validate word count (2-5 words)
      const words = cleanContent.trim().split(/\s+/);

      // Validate uncertainty verb is present
      const hasUncertaintyVerb = uncertaintyVerbs.some(verb => 
        cleanContent.toLowerCase().includes(verb.toLowerCase())
      );
      if (!hasUncertaintyVerb) {
        throw new Error(`Missing uncertainty verb from: ${uncertaintyVerbs.join(', ')}`);
      }

      // Validate impact verb is present
      const impactVerbs = ['affect', 'impact', 'disrupt', 'reduce', 'empty'];
      const hasImpactVerb = impactVerbs.some(verb => 
        cleanContent.toLowerCase().includes(verb.toLowerCase())
      );
      if (!hasImpactVerb) {
        throw new Error(`Missing impact verb from: ${impactVerbs.join(', ')}`);
      }

      return cleanContent.trim();

    } catch (error) {
      console.error('Error generating header prefix with Grok:', error.response?.data || error.message);
      return null;
    }
  }

}

module.exports = new GrokService();
