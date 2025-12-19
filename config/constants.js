// Alert system constants - updated according to PDF specifications
const ALERT_MAIN_TYPES = [
  'strike',
  'weather',
  'protest',
  'flight',
  'staff',
  'supply',
  'system',
  'policy',
  'economy',
  'other'
];

const ALERT_SUB_TYPES = [
  // Strike subtypes
  'airline pilot', 'rail', 'ferry', 'ground staff', 'baggage handlers',
  // Weather subtypes
  'snow', 'flood', 'storm', 'fog', 'ice', 'hurricane', 'heatwave', 'cold snap',
  // Protest subtypes
  'march', 'blockade', 'sit-in', 'demonstration', 'rally', 'riot', 'civil unrest',
  // Flight subtypes
  'delay', 'cancellation', 'grounding', 'overbooking', 'airspace restriction', 'runway closure',
  // Staff subtypes
  'airport check-in', 'hotel cleaning', 'crew absence', 'pilot shortage',
  // Supply chain subtypes
  'jet fuel shortage', 'catering delay', 'laundry crisis', 'toiletries shortage',
  // System subtypes
  'IT crash', 'border control outage', 'booking system down', 'e-gates failure', 'ATM system failure', 'air traffic system down',
  // Policy subtypes
  'travel ban', 'visa change', 'quarantine rule', 'advisory', 'embargo',
  // Economy subtypes
  'pound surge', 'recession', 'tourist drop', 'exchange rate crash', 'FX volatility', 'inflation hit',
  // Other subtypes
  'road closure', 'festival chaos', 'construction delay', 'mechanical failure', 'natural disaster', 'volcano', 'earthquake', 'wildfire'
];

const ALERT_STATUSES = [
  'pending',
  'approved',
  'expired'
];

const ALERT_TONES = [
  'Early',
  'Developing',
  'Confirmed'
];

const ALERT_SECTORS = [
  'Airlines',
  'Transportation',
  'Travel',
  'Tourism',
  'Hospitality',
  'Business Travel'
];

const CONFIDENCE_SOURCE_TYPES = [
  'official',      // BBC, MET, Gov.uk
  'major_news',    // Sky, Reuters, Guardian
  'other_news',    // Local, Al Jazeera, blogs
  'social'         // X, forums
];

const CONFIDENCE_THRESHOLDS = {
  HOLD: 0.6,      // < 0.6 = HOLD in pending
  APPROVE: 0.6    // ≥ 0.6 = LLM tone + header
};

// Cities supported
const CITIES = [
  'Edinburgh',
  'London'
];

// Hotel sizes for impact calculations - according to CALCULATIONS.pdf
const HOTEL_SIZES = [
  'micro',   // <15 rooms
  'small',   // 16-50 rooms
  'medium'   // 51-150 rooms
];

// Confidence scoring system - updated according to SCORING & PUBLISHING.pdf
const CONFIDENCE_SCORING = {
  official: { // BBC, MET, Gov.uk
    1: 0.8,
    2: 0.9,
    '2+': 1.0
  },
  major_news: { // Sky, Reuters, Guardian
    1: 0.7,
    2: 0.8,
    '2+': 0.9
  },
  other_news: { // Local, Al Jazeera, blogs
    1: 0.5,
    2: 0.6,
    '2+': 0.7
  },
  social: { // X, forums
    1: 0.3,
    2: 0.3,
    '2+': 0.4
  }
};

// Base recovery rates by disruption type - updated according to CALCULATIONS.pdf
const BASE_RECOVERY_RATES = {
  strike: 0.70,      // 70% base recovery
  weather: 0.60,     // 60% base recovery
  protest: 0.65,     // 65% base recovery
  flight: 0.55,      // 55% base recovery
  staff: 0.50,       // 50% base recovery
  supply: 0.45,      // 45% base recovery
  system: 0.40,      // 40% base recovery
  policy: 0.35,      // 35% base recovery
  economy: 0.30,     // 30% base recovery
  other: 0.55        // 55% base recovery
};

// Disruption percentages by type - according to CALCULATIONS.pdf
const DISRUPTION_PERCENTAGES = {
  strike: 0.25,      // 25% disruption
  weather: 0.25,     // 25% disruption
  protest: 0.25,     // 25% disruption
  flight: 0.25,      // 25% disruption
  staff: 0.25,       // 25% disruption
  supply: 0.25,      // 25% disruption
  system: 0.25,      // 25% disruption
  policy: 0.25,      // 25% disruption
  economy: 0.25,     // 25% disruption
  other: 0.25        // 25% disruption
};

// Hotel size configurations - according to CALCULATIONS.pdf
const HOTEL_CONFIGS = {
  micro: {
    rooms: 8,
    occupancy: 0.60,
    size: 'micro'
  },
  small: {
    rooms: 35,
    occupancy: 0.65,
    size: 'small'
  },
  medium: {
    rooms: 80,
    occupancy: 0.70,
    size: 'medium'
  }
};

// NewsData API configuration - according to FETCHING & SUMMARIZING.pdf
const NEWSDATA_CONFIG = {
  baseURL: 'https://newsdata.io/api/1',
  apiKey: process.env.NEWSDATA_API_KEY,
  countries: 'gb,it,fr,nl,de,es,ie,pl,pt,se,no,us,ca',
  categories: 'politics,environment,travel,business,technology,economy',
  language: 'en',
  keywords: [
    'Edinburgh', 'London', 'Heathrow', 'Gatwick', 'Edinburgh Airport', 'ScotRail', 'LNER', 'Avanti', 'Eurostar',
    'Ryanair', 'EasyJet', 'British Airways', 'KLM',
    'strike', 'walkout', 'industrial action', 'labor dispute', 'pilot strike', 'crew strike', 'ATC strike', 'ferry strike', 'ground handling strike', 'baggage handler strike',
    'weather disruption', 'snow', 'flood', 'storm', 'fog', 'ice', 'hurricane', 'extreme weather', 'heatwave', 'cold snap',
    'protest', 'march', 'blockade', 'sit-in', 'demonstration', 'rally', 'riot', 'civil unrest',
    'flight delay', 'flight cancellation', 'grounding', 'overbooking', 'airspace restriction', 'runway closure',
    'staff shortage', 'understaffed', 'labor shortage', 'crew absence', 'pilot shortage',
    'supply chain', 'fuel shortage', 'jet fuel crisis', 'catering delay', 'laundry delay', 'toiletries shortage',
    'system failure', 'IT crash', 'outage', 'cyber attack', 'hacking', 'software glitch', 'booking system down', 'e-gates failure', 'border control outage', 'ATM failure', 'air traffic system down',
    'policy change', 'travel ban', 'visa restriction', 'quarantine rule', 'advisory', 'embargo',
    'economy issue', 'currency surge', 'pound fluctuation', 'recession', 'inflation hit', 'tourist drop', 'exchange rate crash', 'FX volatility',
    'road closure', 'diversion', 'construction', 'roadworks', 'bridge collapse', 'tunnel flood',
    'festival chaos', 'event overcrowding', 'conference delay', 'sports event cancellation', 'music festival disruption',
    'mechanical failure', 'engine issue', 'maintenance delay', 'aircraft grounding', 'train breakdown', 'ferry mechanical',
    'natural disaster', 'earthquake', 'volcano', 'tsunami', 'wildfire', 'landslide'
  ]
};

// Grok API configuration - according to FETCHING & SUMMARIZING.pdf
const GROK_CONFIG = {
  baseURL: 'https://api.x.ai/v1',
  apiKey: process.env.GROK_API_KEY,
  model: 'grok-beta',
  cities: ['Edinburgh', 'London'],
  schedule: {
    full: 'monday',    // Monday: Grok + NewsData
    partial: 'thursday' // Thursday: NewsData only
  }
};

// LLM Prompts - according to FETCHING & SUMMARIZING.pdf and SCORING & PUBLISHING.pdf
const LLM_PROMPTS = {
  grokDisruptionSearch: `You are a hotel disruption scout for Edinburgh and London.

Find ANYTHING that could stop guests arriving or checking in next 30 days.

Use examples as starters, but think of more.

Examples (expand from these):
- Strike (rail, airline pilot, ATC, ferry, ground staff, baggage handlers)
- Weather (snow, flood, storm, fog, ice, hurricane, heatwave, cold snap)
- Protest (march, blockade, sit-in, demonstration, rally, riot, civil unrest)
- Flight issues (delay, cancellation, grounding, overbooking, airspace restriction, runway closure)
- Staff shortage (airport check-in, hotel cleaning, pilot shortage, crew absence)
- Supply chain (jet fuel shortage, catering delay, laundry crisis, toiletries shortage)
- System failure (IT crash, border control outage, booking system down, e-gates failure, ATM system failure)
- Policy (travel ban, visa change, quarantine rule, advisory, embargo)
- Economy (pound surge, recession, tourist drop, exchange rate crash, FX volatility, inflation hit)
- Other (road closure, festival chaos, construction delay, mechanical failure, natural disaster, volcano, earthquake, wildfire)

Rules:
- Must affect Edinburgh or London arrivals
- Global events OK if causal link (e.g., Ryanair Rome strike → Rome-Edinburgh flights)
- Use specific sub-event in title (e.g., "Ryanair Rome-Edinburgh pilot strike")
- Output EXACT JSON

[{
  "city": "Edinburgh",
  "main_type": "strike",
  "sub_type": "airline pilot",
  "title": "Ryanair Rome-Edinburgh pilot strike",
  "start_date": "2025-11-15",
  "end_date": "2025-11-16",
  "source": "Reuters",
  "url": "https://...",
  "summary": "All Ryanair flights from Rome to Edinburgh cancelled. Italian guests may not arrive."
}]`,

  toneCheck: `Say ONE word: Early, Developing, or Confirmed.

Event: {title}

Sources: {sources}`,

  headerGeneration: `Write ONE line:

"[Event] could empty X rooms [when] impacting £Y"

Event: {type}
Rooms: {rooms}
Value: £{value}
When: {when}

Rules:
- Keep it short and real
- No symbols, no jargon
- Never repeat the same phrase
- Use natural words (e.g. "this weekend", "Friday", "overnight")
- X = number of rooms at risk
- Y = total £ value at risk`
};

module.exports = {
  ALERT_MAIN_TYPES,
  ALERT_SUB_TYPES,
  ALERT_STATUSES,
  ALERT_TONES,
  ALERT_SECTORS,
  CONFIDENCE_SOURCE_TYPES,
  CONFIDENCE_THRESHOLDS,
  CITIES,
  HOTEL_SIZES,
  CONFIDENCE_SCORING,
  BASE_RECOVERY_RATES,
  DISRUPTION_PERCENTAGES,
  HOTEL_CONFIGS,
  NEWSDATA_CONFIG,
  GROK_CONFIG,
  LLM_PROMPTS
};
