// Disruption calculations utility for backend
// This mirrors the frontend disruptionCalculations.ts file

const disruptionCalculations = {
  // Constants for calculations
  INCENTIVE_BONUS: 0.05, // 5%

  // Occupancy rates by hotel size
  occupancyBySize: {
    micro: 0.60,
    small: 0.65,
    medium: 0.70
  },

  // Recovery rates by disruption type (main types and sub types)
  recoveryRates: {
    // Main types
    strike: 0.70,
    weather: 0.75,
    protest: 0.65,
    flight: 0.70, // Similar to strike
    staff: 0.65,   // Staff shortages
    supply: 0.60,  // Supply chain issues
    system: 0.60,  // System failures
    policy: 0.55,  // Policy changes
    economy: 0.55, // Economic factors
    operational: 0.65, // Operational issues
    other: 0.55,

    // Sub types with specific recovery rates
    'airline pilot': 0.65,
    'rail': 0.70,
    'ferry': 0.75,
    'ground staff': 0.70,
    'baggage handlers': 0.75,
    'snow': 0.70,
    'flood': 0.60,
    'storm': 0.65,
    'fog': 0.80,
    'ice': 0.75,
    'hurricane': 0.55,
    'heatwave': 0.85,
    'cold snap': 0.75,
    'march': 0.80,
    'blockade': 0.70,
    'sit-in': 0.75,
    'demonstration': 0.75,
    'rally': 0.80,
    'riot': 0.60,
    'civil unrest': 0.55,
    'delay': 0.75,
    'cancellation': 0.70,
    'grounding': 0.65,
    'overbooking': 0.85,
    'airspace restriction': 0.70,
    'runway closure': 0.60,
    'airport check-in': 0.70,
    'hotel cleaning': 0.75,
    'crew absence': 0.70,
    'pilot shortage': 0.65,
    'jet fuel shortage': 0.65,
    'catering delay': 0.80,
    'laundry crisis': 0.75,
    'toiletries shortage': 0.80,
    'IT crash': 0.55,
    'border control outage': 0.60,
    'booking system down': 0.65,
    'e-gates failure': 0.70,
    'ATM system failure': 0.75,
    'air traffic system down': 0.50,
    'travel ban': 0.45,
    'visa change': 0.65,
    'quarantine rule': 0.55,
    'advisory': 0.85,
    'embargo': 0.60,
    'pound surge': 0.70,
    'recession': 0.60,
    'tourist drop': 0.55,
    'exchange rate crash': 0.65,
    'FX volatility': 0.70,
    'inflation hit': 0.75,
    'road closure': 0.75,
    'festival chaos': 0.70,
    'construction delay': 0.80,
    'mechanical failure': 0.65,
    'natural disaster': 0.45,
    'volcano': 0.50,
    'earthquake': 0.40,
    'wildfire': 0.55,
  },

  // Disruption percentages by type (calculated as 1.0 - recovery_rate)
  disruptionPercentages: {
    // Main types
    strike: 0.30, // 1.0 - 0.70
    weather: 0.25, // 1.0 - 0.75
    protest: 0.35, // 1.0 - 0.65
    flight: 0.30, // 1.0 - 0.70
    staff: 0.35, // 1.0 - 0.65
    supply: 0.40, // 1.0 - 0.60
    system: 0.40, // 1.0 - 0.60
    policy: 0.45, // 1.0 - 0.55
    economy: 0.45, // 1.0 - 0.55
    operational: 0.35, // 1.0 - 0.65
    other: 0.45, // 1.0 - 0.55

    // Sub types - more specific disruption percentages (1.0 - recovery_rate)
    'airline pilot': 0.35, // 1.0 - 0.65
    'rail': 0.30, // 1.0 - 0.70
    'ferry': 0.25, // 1.0 - 0.75
    'ground staff': 0.30, // 1.0 - 0.70
    'baggage handlers': 0.25, // 1.0 - 0.75
    'snow': 0.30, // 1.0 - 0.70
    'flood': 0.40, // 1.0 - 0.60
    'storm': 0.35, // 1.0 - 0.65
    'fog': 0.20, // 1.0 - 0.80
    'ice': 0.25, // 1.0 - 0.75
    'hurricane': 0.45, // 1.0 - 0.55
    'heatwave': 0.15, // 1.0 - 0.85
    'cold snap': 0.25, // 1.0 - 0.75
    'march': 0.20, // 1.0 - 0.80
    'blockade': 0.30, // 1.0 - 0.70
    'sit-in': 0.25, // 1.0 - 0.75
    'demonstration': 0.25, // 1.0 - 0.75
    'rally': 0.20, // 1.0 - 0.80
    'riot': 0.40, // 1.0 - 0.60
    'civil unrest': 0.45, // 1.0 - 0.55
    'delay': 0.25, // 1.0 - 0.75
    'cancellation': 0.30, // 1.0 - 0.70
    'grounding': 0.35, // 1.0 - 0.65
    'overbooking': 0.15, // 1.0 - 0.85
    'airspace restriction': 0.30, // 1.0 - 0.70
    'runway closure': 0.40, // 1.0 - 0.60
    'airport check-in': 0.30, // 1.0 - 0.70
    'hotel cleaning': 0.25, // 1.0 - 0.75
    'crew absence': 0.30, // 1.0 - 0.70
    'pilot shortage': 0.35, // 1.0 - 0.65
    'jet fuel shortage': 0.35, // 1.0 - 0.65
    'catering delay': 0.20, // 1.0 - 0.80
    'laundry crisis': 0.25, // 1.0 - 0.75
    'toiletries shortage': 0.20, // 1.0 - 0.80
    'IT crash': 0.45, // 1.0 - 0.55
    'border control outage': 0.40, // 1.0 - 0.60
    'booking system down': 0.35, // 1.0 - 0.65
    'e-gates failure': 0.30, // 1.0 - 0.70
    'ATM system failure': 0.25, // 1.0 - 0.75
    'air traffic system down': 0.50, // 1.0 - 0.50
    'travel ban': 0.55, // 1.0 - 0.45
    'visa change': 0.35, // 1.0 - 0.65
    'quarantine rule': 0.45, // 1.0 - 0.55
    'advisory': 0.15, // 1.0 - 0.85
    'embargo': 0.40, // 1.0 - 0.60
    'pound surge': 0.30, // 1.0 - 0.70
    'recession': 0.40, // 1.0 - 0.60
    'tourist drop': 0.45, // 1.0 - 0.55
    'exchange rate crash': 0.35, // 1.0 - 0.65
    'FX volatility': 0.30, // 1.0 - 0.70
    'inflation hit': 0.25, // 1.0 - 0.75
    'road closure': 0.25, // 1.0 - 0.75
    'festival chaos': 0.30, // 1.0 - 0.70
    'construction delay': 0.20, // 1.0 - 0.80
    'mechanical failure': 0.35, // 1.0 - 0.65
    'natural disaster': 0.55, // 1.0 - 0.45
    'volcano': 0.50, // 1.0 - 0.50
    'earthquake': 0.60, // 1.0 - 0.40
    'wildfire': 0.45, // 1.0 - 0.55
  },

  // Calculate nights at risk
  calculateNightsAtRisk: function(rooms, occupancy, disruptionPercentage) {
    return Math.round(rooms * occupancy * disruptionPercentage);
  },

  // Calculate pounds at risk
  calculatePoundsAtRisk: function(nightsAtRisk, avgRoomRate) {
    return nightsAtRisk * avgRoomRate;
  },

  // Calculate recovery rate with incentive bonus
  calculateRecoveryRate: function(disruptionType, hasIncentives) {
    let baseRate;

    // First try to find exact match (for sub types)
    if (this.recoveryRates[disruptionType]) {
      baseRate = this.recoveryRates[disruptionType];
    } else {
      // If not found, try to match main type
      const normalizedType = disruptionType.toLowerCase().replace(/[_ ]/g, '');

      // Map common patterns to main types
      if (normalizedType.includes('strike') || normalizedType.includes('pilot') || normalizedType.includes('rail') || normalizedType.includes('ferry')) {
        baseRate = this.recoveryRates.strike;
      } else if (normalizedType.includes('weather') || normalizedType.includes('snow') || normalizedType.includes('flood') || normalizedType.includes('storm')) {
        baseRate = this.recoveryRates.weather;
      } else if (normalizedType.includes('protest') || normalizedType.includes('march') || normalizedType.includes('demonstration')) {
        baseRate = this.recoveryRates.protest;
      } else if (normalizedType.includes('flight') || normalizedType.includes('delay') || normalizedType.includes('cancellation')) {
        baseRate = this.recoveryRates.flight;
      } else if (normalizedType.includes('staff') || normalizedType.includes('crew') || normalizedType.includes('cleaning')) {
        baseRate = this.recoveryRates.staff;
      } else if (normalizedType.includes('supply') || normalizedType.includes('fuel') || normalizedType.includes('catering')) {
        baseRate = this.recoveryRates.supply;
      } else if (normalizedType.includes('system') || normalizedType.includes('it') || normalizedType.includes('booking')) {
        baseRate = this.recoveryRates.system;
      } else if (normalizedType.includes('operational') || normalizedType.includes('operational')) {
        baseRate = this.recoveryRates.operational;
      } else if (normalizedType.includes('policy') || normalizedType.includes('ban') || normalizedType.includes('visa')) {
        baseRate = this.recoveryRates.policy;
      } else if (normalizedType.includes('economy') || normalizedType.includes('pound') || normalizedType.includes('recession')) {
        baseRate = this.recoveryRates.economy;
      } else {
        baseRate = this.recoveryRates.other;
      }
    }

    const incentiveBonus = hasIncentives ? this.INCENTIVE_BONUS : 0;
    return Math.min(baseRate + incentiveBonus, 1.0); // Cap at 100%
  },

  // Calculate nights saved
  calculateNightsSaved: function(nightsAtRisk, recoveryRate) {
    return Math.round(nightsAtRisk * recoveryRate);
  },

  // Calculate pounds saved
  calculatePoundsSaved: function(nightsSaved, avgRoomRate) {
    return nightsSaved * avgRoomRate;
  },

  // Format time ahead
  formatTimeAhead: function(startDate) {
    if (!startDate) return 'Unknown';

    const now = new Date();
    const start = new Date(startDate);
    const diffMs = start - now;
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffHours < 0) return 'Now';
    if (diffHours < 24) return `${Math.round(diffHours)}h ahead`;
    if (diffDays < 7) return `${Math.round(diffDays)}d ahead`;
    return `${Math.round(diffDays / 7)}w ahead`;
  },

  // Format when text
  formatWhenText: function(startDate) {
    if (!startDate) return 'soon';

    const now = new Date();
    const start = new Date(startDate);
    const diffMs = start - now;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 0) return 'now';
    if (diffHours < 24) return 'today';
    if (diffHours < 48) return 'tomorrow';
    if (diffHours < 72) return 'in 2 days';
    return 'this week';
  },

  // Get time status
  getTimeStatus: function(startDate) {
    if (!startDate) return 'Unknown';

    const now = new Date();
    const start = new Date(startDate);
    const diffMs = start - now;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 0) return 'Confirmed';
    if (diffHours < 24) return 'Confirmed';
    if (diffHours < 72) return 'Developing';
    return 'Early Signal';
  },

  // Calculate disruption percentage (dynamically based on recovery rate and incentives)
  calculateDisruptionPercentage: function(disruptionType, hasIncentives) {
    let baseRate;

    // First try to find exact match (for sub types)
    if (this.recoveryRates[disruptionType]) {
      baseRate = this.recoveryRates[disruptionType];
    } else {
      // If not found, try to match main type
      const normalizedType = disruptionType.toLowerCase().replace(/[_ ]/g, '');

      // Map common patterns to main types
      if (normalizedType.includes('strike') || normalizedType.includes('pilot') || normalizedType.includes('rail') || normalizedType.includes('ferry')) {
        baseRate = this.recoveryRates.strike;
      } else if (normalizedType.includes('weather') || normalizedType.includes('snow') || normalizedType.includes('flood') || normalizedType.includes('storm')) {
        baseRate = this.recoveryRates.weather;
      } else if (normalizedType.includes('protest') || normalizedType.includes('march') || normalizedType.includes('demonstration')) {
        baseRate = this.recoveryRates.protest;
      } else if (normalizedType.includes('flight') || normalizedType.includes('delay') || normalizedType.includes('cancellation')) {
        baseRate = this.recoveryRates.flight;
      } else if (normalizedType.includes('staff') || normalizedType.includes('crew') || normalizedType.includes('cleaning')) {
        baseRate = this.recoveryRates.staff;
      } else if (normalizedType.includes('supply') || normalizedType.includes('fuel') || normalizedType.includes('catering')) {
        baseRate = this.recoveryRates.supply;
      } else if (normalizedType.includes('system') || normalizedType.includes('it') || normalizedType.includes('booking')) {
        baseRate = this.recoveryRates.system;
      } else if (normalizedType.includes('operational') || normalizedType.includes('operational')) {
        baseRate = this.recoveryRates.operational;
      } else if (normalizedType.includes('policy') || normalizedType.includes('ban') || normalizedType.includes('visa')) {
        baseRate = this.recoveryRates.policy;
      } else if (normalizedType.includes('economy') || normalizedType.includes('pound') || normalizedType.includes('recession')) {
        baseRate = this.recoveryRates.economy;
      } else {
        baseRate = this.recoveryRates.other;
      }
    }

    const incentiveBonus = hasIncentives ? this.INCENTIVE_BONUS : 0;
    const recoveryRate = Math.min(baseRate + incentiveBonus, 1.0);

    // Disruption rate is the complement (what's not recovered)
    return Math.max(0, 1.0 - recoveryRate);
  },

  // Calculate disruption risk for an alert and user
  calculateDisruptionRisk: function(alert, user) {
    // Get user profile data
    const profile = this.getUserProfile(user);

    // Calculate recovery rate first (includes incentives)
    const hasIncentives = profile.incentives.length > 0;
    const recoveryRate = this.calculateRecoveryRate(alert.mainType, hasIncentives);

    // Calculate disruption percentage dynamically (1.0 - recovery rate)
    const disruptionPercentage = this.calculateDisruptionPercentage(alert.mainType, hasIncentives);

    // Calculate nights at risk
    const nightsAtRisk = this.calculateNightsAtRisk(
      profile.rooms,
      profile.occupancy,
      disruptionPercentage
    );

    // Calculate pounds at risk
    const poundsAtRisk = this.calculatePoundsAtRisk(nightsAtRisk, profile.avgRoomRate);

    // Calculate nights and pounds saved
    const nightsSaved = this.calculateNightsSaved(nightsAtRisk, recoveryRate);
    const poundsSaved = this.calculatePoundsSaved(nightsSaved, profile.avgRoomRate);

    // Format header
    const header = `${alert.mainType?.replace('_', ' ') || 'Disruption'} could empty ${nightsAtRisk} rooms ${this.formatWhenText(alert.startDate)}`;

    // Format time ahead
    const timeAhead = this.formatTimeAhead(alert.startDate);
    const timeStatus = this.getTimeStatus(alert.startDate);

    return {
      nightsAtRisk,
      poundsAtRisk,
      recoveryRate,
      disruptionPercentage, // Include for reference
      nightsSaved,
      poundsSaved,
      header,
      timeAhead,
      timeStatus,
      profile
    };
  },

  // Get user profile with defaults
  getUserProfile: function(user) {
    if (!user || !user.company) {
      // Default values for non-logged in users
      return {
        rooms: 35,
        avgRoomRate: 140,
        size: 'small',
        occupancy: this.occupancyBySize.small,
        incentives: []
      };
    }

    const company = user.company;
    const size = company.size || 'small';
    const rooms = company.rooms || 35;
    const avgRoomRate = company.avgRoomRate || 140;
    const occupancy = this.occupancyBySize[size] || this.occupancyBySize.small;
    const incentives = company.incentives || [];

    return {
      rooms,
      avgRoomRate,
      size,
      occupancy,
      incentives
    };
  }
};

module.exports = disruptionCalculations;
