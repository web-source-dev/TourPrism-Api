import axios from 'axios';
const { LLM_PROMPTS } = await import('./constants.js');

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
        throw new Error('Grok API key not configured');
      }

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        messages: [{ role: 'user', content: LLM_PROMPTS.grokDisruptionSearch }],
        model: 'grok-beta',
        temperature: 0.7,
        max_tokens: 2000
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

      // Parse and validate JSON
      const disruptions = JSON.parse(content);

      // Validate structure
      if (!Array.isArray(disruptions)) {
        throw new Error('Response is not a valid JSON array');
      }

      // Ensure all disruptions have required fields and affect the target city
      const validatedDisruptions = disruptions.filter(disruption => {
        return disruption.city === city &&
               disruption.mainType &&
               disruption.subType &&
               disruption.title &&
               disruption.start_date &&
               disruption.end_date &&
               disruption.source &&
               disruption.url &&
               disruption.summary;
      });

      return validatedDisruptions;

    } catch (error) {
      console.error('Error generating disruptions with Grok:', error.response?.data || error.message);
      return [];
    }
  }


  async generateTone(eventTitle, sources) {
    const prompt = `Say ONE word: Early, Developing, or Confirmed.

Event: ${eventTitle}
Sources: ${sources.join(', ')}

Return only one word: Early, Developing, or Confirmed.`;

    try {
      if (!this.apiKey) {
        throw new Error('Grok API key not configured');
      }

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        messages: [{ role: 'user', content: prompt }],
        model: 'grok-beta',
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
        model: 'grok-beta',
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

export default new GrokService();
