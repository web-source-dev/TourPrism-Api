const { HOTEL_SIZES, BASE_RECOVERY_RATES, HOTEL_CONFIGS, DISRUPTION_PERCENTAGES } = require('./constants.js');

class ImpactCalculator {
  constructor() {
    this.baseRecoveryRates = BASE_RECOVERY_RATES;
    this.hotelConfigs = HOTEL_CONFIGS;
    this.disruptionPercentages = DISRUPTION_PERCENTAGES;
  }

  /**
   * Calculate impact for a hotel based on alert and hotel data
   * @param {Object} hotelData - Hotel information { size, rooms, avgRoomRate }
   * @param {Object} alertData - Alert information { mainType, start_date, end_date }
   * @param {boolean} hasIncentive - Whether hotel offers incentives
   * @param {number} additionalIncentives - Number of additional incentives beyond basic
   * @returns {Object} Impact calculation results
   */
  calculateImpact(hotelData, alertData, hasIncentive = false, additionalIncentives = 0) {
    try {
      const { size, rooms, avgRoomRate } = hotelData;
      const { mainType } = alertData;

      // Get hotel configuration from constants
      const hotelConfig = this.hotelConfigs[size];
      if (!hotelConfig) {
        throw new Error(`Invalid hotel size: ${size}`);
      }

      // Use configured rooms and occupancy (or provided values)
      const actualRooms = rooms || hotelConfig.rooms;
      const occupancy = hotelData.occupancy || hotelConfig.occupancy;

      // Get disruption percentage (25% for all types according to PDF)
      const disruptionPercent = this.disruptionPercentages[mainType] || 0.25;

      // Calculate nights at risk: round(rooms * occupancy * disruption_percent)
      const nightsAtRisk = this.calculateNightsAtRisk(actualRooms, occupancy, disruptionPercent);

      // Calculate pounds at risk: nights_at_risk * avg_rate
      const poundsAtRisk = nightsAtRisk * avgRoomRate;

      // Calculate recovery
      const recoveryData = this.calculateRecovery(nightsAtRisk, mainType, hasIncentive, additionalIncentives, avgRoomRate);

      return {
        nightsAtRisk,
        poundsAtRisk,
        ...recoveryData,
        hotelData: {
          size,
          rooms: actualRooms,
          avgRoomRate,
          occupancy
        },
        alertData: {
          type: mainType,
          disruptionPercent
        }
      };

    } catch (error) {
      console.error('Error calculating impact:', error);
      return {
        nightsAtRisk: 0,
        poundsAtRisk: 0,
        nightsSaved: { min: 0, max: 0 },
        poundsSaved: { min: 0, max: 0 },
        recoveryRate: 0,
        error: error.message
      };
    }
  }

  /**
   * Calculate nights at risk
   * Formula: round(rooms * occupancy * disruption_percent)
   * Max 50% of total rooms
   */
  calculateNightsAtRisk(rooms, occupancy, disruptionPercent) {
    const rawNights = rooms * occupancy * disruptionPercent;
    const roundedNights = Math.round(rawNights);

    // Cap at 50% of total rooms
    const maxNights = Math.floor(rooms * 0.5);

    return Math.min(roundedNights, maxNights);
  }

  /**
   * Calculate recovery potential with incentives
   */
  calculateRecovery(nightsAtRisk, mainType, hasIncentive, additionalIncentives, avgRoomRate) {
    // Get base recovery rate for disruption type (from CALCULATIONS.pdf)
    const baseRate = this.baseRecoveryRates[mainType] || this.baseRecoveryRates.other;

    // Add incentive bonus (+5% for each incentive)
    // Recovery Rate = Base Rate (with 1 incentive) + 5% (if more than 1 incentive)
    const incentiveBonus = hasIncentive ? 0.05 : 0;
    const additionalBonus = additionalIncentives * 0.05;
    const finalRate = baseRate + incentiveBonus + additionalBonus;

    // Calculate nights saved: round(nights_at_risk * recovery_rate * 100) / 100
    const rawNightsSaved = nightsAtRisk * finalRate;
    const nightsSaved = Math.round(rawNightsSaved * 100) / 100;

    // Get min/max nights: min_nights = floor(nights_saved), max_nights = min_nights + 1
    const minNights = Math.floor(nightsSaved);
    const maxNights = Math.min(minNights + 1, nightsAtRisk);

    // Calculate pounds saved
    const minPounds = minNights * avgRoomRate;
    const maxPounds = maxNights * avgRoomRate;

    return {
      recoveryRate: finalRate,
      nightsSaved: {
        exact: nightsSaved,
        min: minNights,
        max: maxNights
      },
      poundsSaved: {
        min: minPounds,
        max: maxPounds
      },
      incentiveBonus: incentiveBonus + additionalBonus
    };
  }

  /**
   * Generate UI text for impact display
   */
  generateImpactText(impactData) {
    const { nightsAtRisk, poundsAtRisk, nightsSaved, poundsSaved } = impactData;

    return {
      header: `${nightsAtRisk} rooms at risk impacting £${poundsAtRisk}`,
      recovery: `Tap to save ${nightsSaved.min} to ${nightsSaved.max} nights worth £${poundsSaved.min} to £${poundsSaved.max}`
    };
  }

  /**
   * Calculate impact for multiple hotels
   * @param {Array} hotels - Array of hotel objects
   * @param {Object} alertData - Alert information
   * @returns {Array} Impact calculations for each hotel
   */
  calculateBulkImpact(hotels, alertData) {
    return hotels.map(hotel => {
      const hasIncentive = hotel.company?.incentives?.length > 0;
      const additionalIncentives = Math.max((hotel.company?.incentives?.length || 0) - 1, 0);

      return {
        hotelId: hotel._id,
        hotelName: hotel.company?.name || 'Unknown Hotel',
        impact: this.calculateImpact(
          {
            size: hotel.company?.size,
            rooms: hotel.company?.rooms,
            avgRoomRate: hotel.company?.avgRoomRate
          },
          alertData,
          hasIncentive,
          additionalIncentives
        )
      };
    });
  }

  /**
   * Get disruption severity multiplier
   * Higher multiplier = more severe disruption
   */
  getDisruptionSeverity(disruptionType) {
    const severityMap = {
      strike: 1.0,
      weather: 0.9,
      protest: 0.8,
      flight: 0.7,
      staff: 0.6,
      supply: 0.5,
      system: 0.7,
      policy: 0.6,
      economy: 0.4,
      other: 0.5
    };

    return severityMap[disruptionType] || 0.5;
  }

  /**
   * Adjust disruption percentage based on alert severity
   */
  adjustDisruptionPercent(basePercent, alertSeverity, disruptionType) {
    const severityMultiplier = this.getDisruptionSeverity(disruptionType);
    const severityAdjustment = {
      low: 0.7,
      medium: 1.0,
      high: 1.3,
      critical: 1.5
    };

    const adjustment = severityAdjustment[alertSeverity] || 1.0;
    return Math.min(basePercent * severityMultiplier * adjustment, 0.8); // Cap at 80%
  }
}

module.exports = new ImpactCalculator();
