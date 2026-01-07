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


// LLM Prompts - according to FETCHING & SUMMARIZING.pdf and SCORING & PUBLISHING.pdf

module.exports = {
  ALERT_MAIN_TYPES,
  ALERT_SUB_TYPES,
  ALERT_STATUSES,
  ALERT_TONES,
  ALERT_SECTORS,
  CONFIDENCE_SOURCE_TYPES,
  CONFIDENCE_THRESHOLDS,
  CITIES,
  CONFIDENCE_SCORING,
  NEWSDATA_CONFIG
};
