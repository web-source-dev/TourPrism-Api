// Disruption calculations utility for backend
// This mirrors the frontend disruptionCalculations.ts file

const disruptionCalculations = {
  // Occupancy rates by hotel size
  occupancyBySize: {
    micro: 0.60,
    small: 0.65,
    medium: 0.70
  },

  // Disruption percentages by type
  disruptionPercentages: {
    strike: 0.25,
    weather: 0.20,
    protest: 0.15,
    system: 0.30,
    policy: 0.35,
    other: 0.20
  },

  // Recovery rates by disruption type
  recoveryRates: {
    strike: 0.70,
    weather: 0.75,
    protest: 0.65,
    system: 0.60,
    policy: 0.55,
    other: 0.55
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
    const baseRate = this.recoveryRates[disruptionType] || this.recoveryRates.other;
    return hasIncentives ? Math.min(baseRate + 0.05, 1.0) : baseRate;
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

  // Calculate disruption risk for an alert and user
  calculateDisruptionRisk: function(alert, user) {
    // Get user profile data
    const profile = this.getUserProfile(user);

    // Calculate nights at risk
    const nightsAtRisk = this.calculateNightsAtRisk(
      profile.rooms,
      profile.occupancy,
      this.disruptionPercentages[alert.mainType] || this.disruptionPercentages.other
    );

    // Calculate pounds at risk
    const poundsAtRisk = this.calculatePoundsAtRisk(nightsAtRisk, profile.avgRoomRate);

    // Calculate recovery rate
    const recoveryRate = this.calculateRecoveryRate(alert.mainType, profile.incentives.length > 0);

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
