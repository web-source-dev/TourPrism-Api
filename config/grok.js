const axios = require('axios');
const { LLM_PROMPTS } = require('./constants.js');

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
      const maxDisruptions = 5; // Generate up to 5 disruptions per city

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

    const prompt = `You are a hotel disruption scout for ${city}.

Find ONE SPECIFIC disruption that could stop guests arriving or checking in within the next 30 days.

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
- Must affect ${city} arrivals specifically
- Global events OK if they have direct causal link to ${city}
- Use realistic, specific sub-events in title
- Dates should be realistic future dates within 30 days
- Use EXACT category names from the list above

DO NOT GENERATE THESE EXISTING ALERTS:
${allTitles.map(title => `- "${title}"`).join('\n')}

Output ONLY a single valid JSON object - no extra text, no markdown, no explanations, no arrays.

Example format:
{"city":"${city}","main_type":"strike","sub_type":"airline_pilot","title":"Ryanair Rome-${city} pilot strike","start_date":"2025-12-25","end_date":"2025-12-26","source":"Reuters","url":"https://www.reuters.com/business/aerospace-defense/ryanair-pilot-strike-rome-2025-12-20/","summary":"All Ryanair flights from Rome to ${city} cancelled due to pilot strike. Italian guests may not arrive."}`;

    const response = await axios.post(`${this.baseURL}/chat/completions`, {
      messages: [{ role: 'user', content: prompt }],
      model: 'grok-4-1-fast-reasoning',
      temperature: 0.8, // Slightly higher temperature for more variety
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
      summary: disruption.summary,
      sourceCredibility: 'major_news'
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


  async generateTone(eventTitle, sources) {
    const prompt = `Say ONE word: Early, Developing, or Confirmed.

Event: ${eventTitle}
Sources: ${sources}

Return only one word: Early, Developing, or Confirmed.`;

    try {
      if (!this.apiKey) {
        throw new Error('Grok API key not configured');
      }

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        messages: [{ role: 'user', content: prompt }],
        model: 'grok-4-1-fast-reasoning',
        temperature: 0.1,
        max_tokens: 10
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const tone = response.data?.choices?.[0]?.message?.content?.trim();
      return ['Early', 'Developing', 'Confirmed'].includes(tone) ? tone : 'Developing';

    } catch (error) {
      console.error('Error generating tone with Grok:', error.response?.data || error.message);
      return 'Developing';
    }
  }

  async generateHeader(eventType, roomsAtRisk, valueAtRisk, when) {
    const prompt = `Write ONE line:

"[Event] could empty X rooms [when] impacting £Y"

Event: ${eventType}
Rooms: ${roomsAtRisk}
Value: £${valueAtRisk}
When: ${when}

Rules:
- Keep it short and real
- No symbols, no jargon
- Never repeat the same phrase
- Use natural words (e.g. "this weekend", "Friday", "overnight")
- X = number of rooms at risk
- Y = total £ value at risk

Return only the header text, no quotes.`;

    try {
      if (!this.apiKey) {
        throw new Error('Grok API key not configured');
      }

          const response = await axios.post(`${this.baseURL}/chat/completions`, {
            messages: [{ role: 'user', content: prompt }],
            model: 'grok-4-1-fast-reasoning',
            temperature: 0.3,
            max_tokens: 100
          }, {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          });

      return response.data?.choices?.[0]?.message?.content?.trim() || '';

    } catch (error) {
      console.error('Error generating header with Grok:', error.response?.data || error.message);
      return `${eventType} could empty ${roomsAtRisk} rooms ${when} impacting £${valueAtRisk}`;
    }
  }
}

module.exports = new GrokService();
