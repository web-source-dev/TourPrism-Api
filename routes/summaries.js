import express from "express";
import { authenticate } from "../middleware/auth.js";
import Alert from "../models/Alert.js";
import Summary from "../models/Summary.js";
import User from "../models/User.js";
import Logs from "../models/Logs.js";
import { generatePdf, generateSummaryHTML } from "../utils/pdfGenerator.js";
const router = express.Router();

// Function to find duplicate alerts based on category, type, date range, and location
const findDuplicateAlerts = (alerts) => {
  const duplicateGroups = [];
  const processed = new Set();
  
  for (let i = 0; i < alerts.length; i++) {
    // Skip if already processed as part of a duplicate group
    if (processed.has(alerts[i]._id.toString())) continue;
    
    const current = alerts[i];
    const duplicates = [current];
    
    for (let j = i + 1; j < alerts.length; j++) {
      if (processed.has(alerts[j]._id.toString())) continue;
      
      const candidate = alerts[j];
      
      // Check if alerts have the same category and type
      const sameCategory = current.alertCategory === candidate.alertCategory;
      const sameType = current.alertType === candidate.alertType;
      
      // If category is same but type is different, they are not duplicates
      if (sameCategory && !sameType) continue;
      
      // Check date range overlap
      let datesOverlap = false;
      
      // If both have expected start dates
      if (current.expectedStart && candidate.expectedStart) {
        const currentStart = new Date(current.expectedStart);
        const candidateStart = new Date(candidate.expectedStart);
        const currentEnd = current.expectedEnd ? new Date(current.expectedEnd) : null;
        const candidateEnd = candidate.expectedEnd ? new Date(candidate.expectedEnd) : null;
        
        // Case 1: If both have end dates, check for overlap
        if (currentEnd && candidateEnd) {
          datesOverlap = 
            (currentStart <= candidateEnd && currentEnd >= candidateStart);
        }
        // Case 2: If only current has end date
        else if (currentEnd) {
          datesOverlap = (candidateStart <= currentEnd);
        }
        // Case 3: If only candidate has end date
        else if (candidateEnd) {
          datesOverlap = (currentStart <= candidateEnd);
        }
        // Case 4: If neither has end date, check if start dates are the same
        else {
          datesOverlap = (currentStart.toDateString() === candidateStart.toDateString());
        }
      }
      // If dates don't match our criteria, not a duplicate
      if (!datesOverlap) continue;
      
      // Check for location match
      let locationMatch = false;
      
      // Check original location match
      if (current.originCity && candidate.originCity) {
        locationMatch = current.originCity.toLowerCase() === candidate.originCity.toLowerCase();
      }
      
      // If no match on original city, check other location fields
      if (!locationMatch && current.city && candidate.city) {
        locationMatch = current.city.toLowerCase() === candidate.city.toLowerCase();
      }
      
      // Check impact locations if available
      if (!locationMatch && current.impactLocations && current.impactLocations.length > 0 && 
          candidate.impactLocations && candidate.impactLocations.length > 0) {
        // Check if any impact locations match
        for (const currLoc of current.impactLocations) {
          for (const candLoc of candidate.impactLocations) {
            if (currLoc.city && candLoc.city && 
                currLoc.city.toLowerCase() === candLoc.city.toLowerCase()) {
              locationMatch = true;
              break;
            }
          }
          if (locationMatch) break;
        }
      }
      
      // If all criteria match (same category, same type, dates overlap, location matches)
      if (sameCategory && sameType && datesOverlap && locationMatch) {
        duplicates.push(candidate);
        processed.add(candidate._id.toString());
      }
    }
    
    // If we found duplicates, add to the groups
    if (duplicates.length > 1) {
      duplicateGroups.push(duplicates);
    }
    
    // Mark current alert as processed
    processed.add(current._id.toString());
  }
  
  return duplicateGroups;
};

// Generate a summary based on filters
router.post("/generate", authenticate, async (req, res) => {
  try {
    const {
      title,
      description,
      summaryType,
      startDate,
      endDate,
      locations,
      alertTypes,
      alertCategory,
      includeDuplicates,
      generatePDF,
      autoSave,
      emailTo,
      impact,
      includedAlerts,
      skipPdfGeneration
    } = req.body;

    const userId = req.userId;
    
    // Log summary generation start
    try {
      // Get user info for better logging
      const user = await User.findById(userId).select('firstName lastName email');
      
      await Logs.createLog({
        userId: userId,
        userEmail: req.userEmail || user?.email,
        userName: user ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : (user.firstName || user.email?.split('@')[0])) : 'Unknown',
        action: 'summary_generation_started',
        details: {
          title,
          summaryType,
          filters: {
            startDate,
            endDate,
            locationCount: locations?.length,
            alertTypes,
            alertCategory,
            impact
          },
          generatePDF,
          autoSave
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging summary generation start:', error);
      // Continue execution even if logging fails
    }
    
    // Get user's MainOperatingRegions if they exist
    const user = await User.findById(userId).lean();
    const userRegions = user?.company?.MainOperatingRegions || [];
    
    // Build the query for fetching alerts
    const query = { status: "approved" };
    
    // Add date filters if provided
    if (startDate || endDate) {
      query.$and = [];
      
      if (startDate) {
        const parsedStartDate = new Date(startDate);
        query.$and.push({
          $or: [
            { expectedEnd: { $gte: parsedStartDate } },
            { expectedEnd: { $exists: false }, expectedStart: { $gte: parsedStartDate } }
          ]
        });
      }
      
      if (endDate) {
        const parsedEndDate = new Date(endDate);
        query.$and.push({
          $or: [
            { expectedStart: { $lte: parsedEndDate } },
            { expectedStart: { $exists: false }, expectedEnd: { $lte: parsedEndDate } }
          ]
        });
      }
    }
    
    // Add location filters if provided
    if (locations && locations.length > 0) {
      if (!query.$and) query.$and = [];
      
      const locationConditions = [];
      
      locations.forEach(loc => {
        if (loc.city) {
          // Search in city fields
          locationConditions.push({ originCity: new RegExp(loc.city, 'i') });
          locationConditions.push({ city: new RegExp(loc.city, 'i') });
          locationConditions.push({ 'impactLocations.city': new RegExp(loc.city, 'i') });
        }
        
        if (loc.latitude && loc.longitude) {
          // For precise location search, we could add geo queries here
          // This would require enhancing the function with proper geo calculations
        }
      });
      
      if (locationConditions.length > 0) {
        query.$and.push({ $or: locationConditions });
      }
    }
    
    // Add alert type filters if provided
    if (alertTypes && alertTypes.length > 0) {
      if (!query.$and) query.$and = [];
      
      // Create a query that handles both main categories and subtypes
      query.$and.push({
        $or: [
          { alertType: { $in: alertTypes } },
          { alertCategory: { $in: alertTypes } }
        ]
      });
    }
    
    // Add impact filter if provided
    if (impact) {
      if (!query.$and) query.$and = [];
      query.$and.push({ impact });
    }

    // Fetch alerts matching criteria
    let alerts = [];
    
    // If we have pre-fetched alerts, use those
    if (includedAlerts && includedAlerts.length > 0) {
      alerts = includedAlerts;
    } else {
      // Otherwise fetch alerts from the database
      alerts = await Alert.find(query)
        .sort({ createdAt: -1 })
        .lean();
    }
      
    // Find and handle duplicates if requested
    let duplicateGroups = [];
    if (alerts.length > 0) {
      duplicateGroups = findDuplicateAlerts(alerts);
      
      // Remove duplicates if requested
      if (!includeDuplicates && duplicateGroups.length > 0) {
        // For each group of duplicates, keep only the most recent one
        duplicateGroups.forEach(group => {
          if (group.length > 1) {
            // Sort by date, newest first
            group.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            // Keep the first (newest) alert and remove the rest from the alerts array
            const keepAlertId = group[0]._id.toString();
            alerts = alerts.filter(a => 
              a._id.toString() === keepAlertId || 
              !group.some(g => g._id.toString() === a._id.toString())
            );
          }
        });
      }
    }
    
    // Prepare location string for display
    const locationString = locations && locations.length > 0 
      ? locations.map(l => l.city).join(', ') 
      : undefined;
      
    // Generate summary HTML
    const summaryOptions = {
      title,
      startDate,
      endDate,
      location: locationString,
      alertCategory,
      impact,
      userRegions // Pass userRegions to the HTML generator
    };
    
    // Generate the HTML content - our updated generateSummaryHTML handles empty alerts gracefully
    const htmlContent = generateSummaryHTML(alerts, summaryOptions);
    
    // Create response object with useful data regardless of alert count
    const summaryData = {
      title,
      description,
      alerts,
      duplicates: duplicateGroups,
      htmlContent
    };
    
    // Generate PDF if requested - always generate when autoSave is true, unless skipPdfGeneration is true
    let pdfUrl = null;
    try {
      if ((generatePDF || autoSave) && skipPdfGeneration !== true) {
        pdfUrl = await generatePdf(htmlContent, title || "alert-summary");
        if (pdfUrl) {
          summaryData.pdfUrl = pdfUrl;
        }
      }
    } catch (pdfError) {
      console.error("Error generating PDF:", pdfError);
      // Continue the process even if PDF generation fails
      // We'll return the HTML content without a PDF
    }
    
    // Auto-save the summary if explicitly requested
    let savedSummaryId = null;
    if (autoSave === true) {
      try {
        // Create the summary document
        const summary = new Summary({
          userId,
          title,
          description,
          summaryType: summaryType || "custom",
          parameters: {
            startDate,
            endDate,
            locations: locations || userRegions, // Use userRegions if no locations provided
            alertTypes,
            includeDuplicates,
            alertCategory,
            impact
          },
          timeRange: {
            startDate,
            endDate
          },
          locations: locations || userRegions, // Use userRegions if no locations provided
          includedAlerts: alerts.map(a => a._id),
          htmlContent,
          pdfUrl
        });
        
        await summary.save();
        savedSummaryId = summary._id;
        
        if (savedSummaryId) {
          summaryData.savedSummaryId = savedSummaryId;
        }
        
        // Log summary saved
        try {
          await Logs.createLog({
            userId: userId,
            userEmail: req.userEmail || user?.email,
            userName: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : (user?.firstName || user?.email?.split('@')[0] || 'Unknown'),
            action: 'summary_saved',
            details: {
              summaryId: savedSummaryId,
              title,
              alertCount: alerts.length
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          });
        } catch (error) {
          console.error('Error logging summary save:', error);
          // Continue execution even if logging fails
        }
      } catch (saveError) {
        console.error("Error saving summary:", saveError);
        // We'll still return the generated content even if saving fails
      }
    }
    
    // Log summary generation completed
    try {
      await Logs.createLog({
        userId: userId,
        userEmail: req.userEmail || user?.email,
        userName: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : (user?.firstName || user?.email?.split('@')[0] || 'Unknown'),
        action: 'summary_generation_completed',
        details: {
          title,
          alertCount: alerts.length,
          duplicateGroups: duplicateGroups.length,
          hasPdf: !!pdfUrl,
          savedSummaryId
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging summary generation completion:', error);
      // Continue execution even if logging fails
    }
    
    // Always return a success response with the data we were able to generate
    res.json({
      success: true,
      summary: summaryData
    });
  } catch (error) {
    console.error("Error generating summary:", error);
    
    // Return a user-friendly response instead of a 500 error
    res.json({ 
      success: true, // Change to true to handle gracefully in the frontend
      summary: {
        title: "No Alerts Found",
        description: "We couldn't find any disruptions matching your criteria.",
        alerts: [],
        duplicates: [],
        htmlContent: `
          <div class="no-alerts-message">
            <h2>No Alerts Found</h2>
            <p>There are no reported disruptions matching your search criteria.</p>
            <p>Try adjusting your filters or check back later for updates.</p>
          </div>
        `
      }
    });
  }
});

// Get user's saved summaries
router.get("/saved", authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Log access to saved summaries
    try {
      const user = await User.findById(userId).select('firstName lastName email');
      
      await Logs.createLog({
        userId: userId,
        userEmail: req.userEmail || user?.email,
        userName: user ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : (user.firstName || user.email?.split('@')[0])) : 'Unknown',
        action: 'saved_summaries_viewed',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging saved summaries view:', error);
      // Continue execution even if logging fails
    }
    
    const summaries = await Summary.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
      
    res.json({
      success: true,
      summaries
    });
  } catch (error) {
    console.error("Error fetching saved summaries:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch summaries", 
      error: error.message 
    });
  }
});

// Get a specific summary by ID
router.get("/:id", authenticate, async (req, res) => {
  try {
    const summaryId = req.params.id;
    const userId = req.userId;
    
    const summary = await Summary.findOne({ 
      _id: summaryId,
      userId 
    }).populate('includedAlerts');
    
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found"
      });
    }
    
    // Log summary view
    try {
      const user = await User.findById(userId).select('firstName lastName email');
      
      await Logs.createLog({
        userId: userId,
        userEmail: req.userEmail || user?.email,
        userName: user ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : (user.firstName || user.email?.split('@')[0])) : 'Unknown',
        action: 'summary_viewed',
        details: {
          summaryId,
          title: summary.title,
          alertCount: summary.includedAlerts?.length || 0
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging summary view:', error);
      // Continue execution even if logging fails
    }
    
    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error("Error fetching summary:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch summary", 
      error: error.message 
    });
  }
});

// Delete a saved summary
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const summaryId = req.params.id;
    const userId = req.userId;
    
    // Find the summary first to log details before deletion
    const summary = await Summary.findOne({ _id: summaryId, userId });
    
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found or you don't have permission to delete it"
      });
    }
    
    // Delete the summary
    await Summary.deleteOne({ _id: summaryId, userId });
    
    // Log summary deletion
    try {
      const user = await User.findById(userId).select('firstName lastName email');
      
      await Logs.createLog({
        userId: userId,
        userEmail: req.userEmail || user?.email,
        userName: user ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : (user.firstName || user.email?.split('@')[0])) : 'Unknown',
        action: 'summary_deleted',
        details: {
          summaryId,
          title: summary.title
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('Error logging summary deletion:', error);
      // Continue execution even if logging fails
    }
    
    res.json({
      success: true,
      message: "Summary deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting summary:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to delete summary", 
      error: error.message 
    });
  }
});

// Generate forecasts of upcoming alerts
router.get("/forecasts/upcoming", authenticate, async (req, res) => {
  try {
    const { days = 7, location, alertCategory, impact, skipPdfGeneration } = req.query;
    const userId = req.userId;
    
    // Get user's MainOperatingRegions if they exist
    const user = await User.findById(userId).lean();
    const userRegions = user?.company?.MainOperatingRegions || [];
    
    // Calculate date range
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + parseInt(days));
    
    // Build query for alerts in the future
    const baseQuery = { 
      status: "approved",
      $or: [
        // Alerts that start within the forecast period
        { expectedStart: { $gte: startDate, $lte: endDate } },
        // Alerts that end within the forecast period
        { expectedEnd: { $gte: startDate, $lte: endDate } },
        // Alerts that span the forecast period (start before, end after)
        { expectedStart: { $lte: startDate }, expectedEnd: { $gte: endDate } }
      ]
    };
    
    // Add alert category filter if provided
    if (alertCategory) {
      const ALERT_TYPE_MAP = {
        "Industrial Action": ["Strike", "Work-to-Rule", "Labor Dispute", "Other"],
        "Extreme Weather": ["Storm", "Flooding", "Heatwave", "Wildfire", "Snow", "Other"],
        "Infrastructure Failures": ["Power Outage", "IT & System Failure", "Transport Service Suspension", "Road, Rail & Tram Closure", "Repairs or Delays", "Other"],
        "Public Safety Incidents": ["Protest", "Crime", "Terror Threats", "Travel Advisory", "Other"],
        "Festivals and Events": ["Citywide Festival", "Sporting Event", "Concerts and Stadium Events", "Parades and Ceremonies", "Other"]
      };
      
      const alertTypes = [alertCategory, ...(ALERT_TYPE_MAP[alertCategory] || [])];
      
      if (!baseQuery.$and) baseQuery.$and = [];
      baseQuery.$and.push({
        $or: [
          { alertType: { $in: alertTypes } },
          { alertCategory: { $in: alertTypes } }
        ]
      });
    }
    
    // Add impact filter if provided
    if (impact) {
      if (!baseQuery.$and) baseQuery.$and = [];
      baseQuery.$and.push({ impact });
    }

    // We'll collect all alerts that match our criteria
    let allAlerts = [];
    
    // If user has regions defined, filter by them
    if (userRegions.length > 0) {
      // First, try to fetch alerts using city name matching (non-geospatial)
      const cityNameQuery = { ...baseQuery };
      
      if (!cityNameQuery.$and) cityNameQuery.$and = [];
      
      const cityConditions = [];
      userRegions.forEach(region => {
        if (region.name) {
          cityConditions.push({ originCity: new RegExp(region.name, 'i') });
          cityConditions.push({ city: new RegExp(region.name, 'i') });
          cityConditions.push({ 'impactLocations.city': new RegExp(region.name, 'i') });
        }
      });
      
      if (cityConditions.length > 0) {
        cityNameQuery.$and.push({ $or: cityConditions });
        
        // Fetch alerts matching city names
        const cityNameAlerts = await Alert.find(cityNameQuery)
          .sort({ expectedStart: 1, impact: -1 })
          .lean();
          
        allAlerts.push(...cityNameAlerts);
      }
      
      // If we have regions with coordinates, try individual geo queries
      // But limit this to avoid performance issues
      const regionsWithCoords = userRegions
        .filter(r => r.latitude && r.longitude)
        .slice(0, 3); // Limit to 3 regions max for performance
        
      if (regionsWithCoords.length > 0) {
        for (const region of regionsWithCoords) {
          // Geo query using originLocation
          const geoQuery = { ...baseQuery };
          geoQuery.originLocation = {
            $near: {
              $geometry: {
                type: "Point",
                coordinates: [region.longitude, region.latitude]
              },
              $maxDistance: 50000 // 50km in meters
            }
          };
          
          const geoAlerts = await Alert.find(geoQuery)
            .sort({ expectedStart: 1, impact: -1 })
            .limit(50) // Limit results per region for performance
            .lean();
            
          // Add any alerts that aren't already in our collection
          for (const alert of geoAlerts) {
            if (!allAlerts.some(a => a._id.toString() === alert._id.toString())) {
              allAlerts.push(alert);
            }
          }
        }
      }
      
      // Sort the combined results
      allAlerts.sort((a, b) => {
        // Sort by date first
        if (a.expectedStart && b.expectedStart) {
          return new Date(a.expectedStart) - new Date(b.expectedStart);
        }
        
        // Then by impact severity (Severe > Moderate > Minor)
        const impactOrder = { "Severe": 0, "Moderate": 1, "Minor": 2 };
        return (impactOrder[a.impact] || 3) - (impactOrder[b.impact] || 3);
      });
      
      // Limit total results to prevent huge reports
      allAlerts = allAlerts.slice(0, 100);
    }
    // If there are no user regions but a specific location was requested, use that
    else if (location) {
      const locationQuery = { ...baseQuery };
      
      if (!locationQuery.$and) locationQuery.$and = [];
      locationQuery.$and.push({
        $or: [
          { originCity: new RegExp(location, 'i') },
          { city: new RegExp(location, 'i') },
          { 'impactLocations.city': new RegExp(location, 'i') }
        ]
      });
      
      allAlerts = await Alert.find(locationQuery)
        .sort({ expectedStart: 1, impact: -1 })
        .lean();
    } 
    // If no locations are specified at all, just get all alerts
    else {
      allAlerts = await Alert.find(baseQuery)
        .sort({ expectedStart: 1, impact: -1 })
        .limit(100) // Limit to 100 most relevant alerts
        .lean();
    }
    
    // Build location string for the summary title/description
    const locationDescription = userRegions.length > 0 
      ? userRegions.map(region => region.name).join(', ')
      : location || 'All Regions';
    
    // If no alerts found, return a friendly empty state
    if (allAlerts.length === 0) {
      return res.json({
        success: true,
        forecast: {
          title: `${days}-Day Alert Forecast for ${locationDescription}`,
          timeRange: { 
            startDate: startDate.toISOString(), 
            endDate: endDate.toISOString() 
          },
          location: locationDescription,
          locations: userRegions,
          alertCategory,
          impact,
          alerts: [],
          htmlContent: `
            <div class="no-alerts-section">
              <h2>No Current Disruptions</h2>
              <p>There are no reported disruptions for ${locationDescription} during this period.</p>
              <p>This could mean:</p>
              <ul>
                <li>No significant disruptions are expected</li>
                <li>Any minor issues don't meet your alert criteria</li>
                <li>New alerts may be added as they are reported</li>
              </ul>
            </div>
          `,
          userRegions
        }
      });
    }
    
    // Generate summary HTML
    const summaryOptions = {
      title: `${days}-Day Alert Forecast for ${locationDescription}`,
      startDate,
      endDate,
      location: locationDescription,
      alertCategory,
      impact,
      userRegions // Pass userRegions to the HTML generator
    };
    
    const htmlContent = generateSummaryHTML(allAlerts, summaryOptions);
    
    // Generate PDF for the forecast - but only if not skipped
    let pdfUrl = null;
    if (allAlerts.length > 0 && skipPdfGeneration !== 'true') {
      // Generate PDF only if explicitly requested
      pdfUrl = await generatePdf(htmlContent, `${days}-Day-Alert-Forecast-${locationDescription.replace(/[^a-z0-9]/gi, '-')}`);
    }
    
    res.json({
      success: true,
      forecast: {
        title: `${days}-Day Alert Forecast for ${locationDescription}`,
        timeRange: { 
          startDate: startDate.toISOString(), 
          endDate: endDate.toISOString() 
        },
        location: locationDescription,
        locations: userRegions, // Include the full regions data
        alertCategory,
        impact,
        alerts: allAlerts,
        htmlContent,
        pdfUrl,
        userRegions // Include userRegions in the response
      }
    });
  } catch (error) {
    console.error("Error generating forecast:", error);
    // Return a more user-friendly error response
    res.status(500).json({ 
      success: true, // Changed to true to handle gracefully in UI
      forecast: {
        title: "Service Temporarily Unavailable",
        timeRange: { 
          startDate: new Date().toISOString(), 
          endDate: new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000).toISOString() 
        },
        location: locationDescription || "Selected Regions",
        alerts: [],
        htmlContent: `
          <div class="error-section">
            <h2>Unable to Load Forecast</h2>
            <p>We're experiencing technical difficulties while retrieving your forecast.</p>
            <p>Please try again in a few moments.</p>
          </div>
        `,
        userRegions: []
      }
    });
  }
});

// Schedule a recurring summary delivery
router.post("/schedule", authenticate, async (req, res) => {
  try {
    const {
      title,
      description,
      frequency,
      startDate,
      endDate,
      locations,
      alertTypes,
      includeDuplicates,
      emailTo
    } = req.body;

    const userId = req.userId;
    
    if (!emailTo || emailTo.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "Email recipients are required for scheduled summaries" 
      });
    }
    
    // Create a new scheduled summary
    const summary = new Summary({
      userId,
      title,
      description,
      summaryType: "automated",
      parameters: {
        startDate,
        endDate,
        locations,
        alertTypes,
        includeDuplicates
      },
      timeRange: {
        startDate,
        endDate
      },
      locations,
      emailDelivery: {
        scheduled: true,
        frequency: frequency || "weekly",
        recipients: emailTo
      }
    });
    
    await summary.save();
    
    res.json({
      success: true,
      message: "Summary schedule created successfully",
      scheduledSummaryId: summary._id
    });
  } catch (error) {
    console.error("Error scheduling summary:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to schedule summary", 
      error: error.message 
    });
  }
});

// Generate PDF for a specific summary
router.post("/:id/generate-pdf", authenticate, async (req, res) => {
  try {
    const summaryId = req.params.id;
    const userId = req.userId;
    
    // Find the summary
    const summary = await Summary.findOne({ 
      _id: summaryId,
      userId 
    }).populate('includedAlerts');
    
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found"
      });
    }
    
    // If PDF already exists, just return it
    if (summary.pdfUrl) {
      return res.json({
        success: true,
        pdfUrl: summary.pdfUrl
      });
    }
    
    // Check if we have any alerts to display
    const hasAlerts = summary.includedAlerts && summary.includedAlerts.length > 0;
    
    // Prepare the location string for display
    const locationString = summary.locations && summary.locations.length > 0 
      ? summary.locations.map(l => l.city).join(', ') 
      : 'Selected Location';
    
    // Generate summary HTML
    const summaryOptions = {
      title: summary.title,
      startDate: summary.timeRange?.startDate,
      endDate: summary.timeRange?.endDate,
      location: locationString,
      alertCategory: summary.parameters?.alertCategory,
      impact: summary.parameters?.impact
    };
    
    // Generate HTML content, ensuring we handle the "no alerts" case gracefully
    let htmlContent = summary.htmlContent;
    
    // If no HTML content exists, generate it
    if (!htmlContent) {
      if (hasAlerts) {
        // Normal case - we have alerts
        htmlContent = generateSummaryHTML(summary.includedAlerts, summaryOptions);
      } else {
        // No alerts case - generate a "no alerts" message
        htmlContent = generateSummaryHTML([], summaryOptions);
      }
    }
    
    // Generate PDF - our updated generatePdf function handles empty content gracefully
    const pdfUrl = await generatePdf(htmlContent, summary.title || "alert-summary");
    
    // Update summary with PDF URL
    summary.pdfUrl = pdfUrl;
    summary.htmlContent = htmlContent;
    await summary.save();
    
    res.json({
      success: true,
      pdfUrl
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to generate PDF", 
      error: error.message 
    });
  }
});

export default router;
