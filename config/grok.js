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

      // Customize the prompt with the specific city
      const prompt = `You are a hotel disruption scout for ${city}.

Find ANYTHING that could stop guests arriving or checking in next 30 days.

VALID CATEGORIES (use exactly these):
Main Types: strike, weather, protest, flight_issues, staff_shortage, supply_chain, system_failure, policy, economy, other

Sub Types:
- strike: airline_pilot, rail, ferry, ground_staff, baggage_handlers
- weather: snow, flood, storm, fog, ice, hurricane, heatwave, cold_snap
- protest: march, blockade, sit_in, demonstration, rally, riot, civil_unrest
- flight_issues: airline_pilot, rail, ferry, ground_staff, baggage_handlers
- staff_shortage: airline_pilot, rail, ferry, ground_staff, baggage_handlers
- supply_chain: airline_pilot, rail, ferry, ground_staff, baggage_handlers
- system_failure: airline_pilot, rail, ferry, ground_staff, baggage_handlers
- policy: airline_pilot, rail, ferry, ground_staff, baggage_handlers
- economy: airline_pilot, rail, ferry, ground_staff, baggage_handlers
- other: airline_pilot, rail, ferry, ground_staff, baggage_handlers

Rules:
- Must affect ${city} arrivals
- Global events OK if causal link (e.g., Ryanair Rome strike → Rome-${city} flights)
- Use specific sub-event in title (e.g., "Ryanair Rome-${city} pilot strike")
- Output ONLY valid JSON array - no extra text, no markdown, no explanations
- Use proper URLs like "https://www.reuters.com/example" or "https://www.bbc.com/example"
- Dates should be in YYYY-MM-DD format
- Use EXACT category names from the list above

[{"city":"${city}","main_type":"strike","sub_type":"airline_pilot","title":"Ryanair Rome-${city} pilot strike","start_date":"2025-12-25","end_date":"2025-12-26","source":"Reuters","url":"https://www.reuters.com/business/aerospace-defense/ryanair-pilot-strike-rome-2025-12-20/","summary":"All Ryanair flights from Rome to ${city} cancelled due to pilot strike. Italian guests may not arrive."}]`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        messages: [{ role: 'user', content: prompt }],
        model: 'grok-4-1-fast-reasoning',
        temperature: 0.7,
        max_tokens: 2000
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

      // Try to extract JSON array if there's extra text
      const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      }

      console.log('Grok response content:', cleanContent.substring(0, 200) + '...');

      // Parse and validate JSON
      const disruptions = JSON.parse(cleanContent);

      // Validate structure
      if (!Array.isArray(disruptions)) {
        throw new Error('Response is not a valid JSON array');
      }

      // Transform and validate disruptions
      const validatedDisruptions = disruptions.filter(disruption => {
        return disruption.city === city &&
               disruption.main_type &&
               disruption.sub_type &&
               disruption.title &&
               disruption.start_date &&
               disruption.end_date &&
               disruption.source &&
               disruption.url &&
               disruption.summary;
      }).map(disruption => ({
        city: disruption.city,
        mainType: disruption.main_type,
        subType: disruption.sub_type,
        title: disruption.title,
        start_date: disruption.start_date,
        end_date: disruption.end_date,
        source: disruption.source,
        url: disruption.url,
        summary: disruption.summary,
        sourceCredibility: 'major_news' // Assume Grok-generated content is from major news sources
      }));

      console.log(`Grok generated ${validatedDisruptions.length} valid disruptions for ${city}`);
      return validatedDisruptions;

    } catch (error) {
      console.error('Error generating disruptions with Grok:', error.response?.data || error.message);
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
