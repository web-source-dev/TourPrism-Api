import express from "express";
import { authenticate, authenticateRole } from "../middleware/auth.js";
import Alert from "../models/Alert.js";
import Summary from "../models/Summary.js";
import User from "../models/User.js";
import { generatePdf, generateSummaryHTML } from "../utils/pdfGenerator.js";
import { sendVerificationEmail } from "../utils/emailService.js";
import mongoose from "mongoose";

const router = express.Router();

// Utility function to detect duplicate/similar alerts
const findDuplicateAlerts = (alerts) => {
  // Create a map to store potential duplicates by location and category
  const potentialDuplicates = {};
  const duplicates = [];
  
  alerts.forEach(alert => {
    // Create a key based on multiple factors for better duplicate detection
    const locationKey = alert.originCity || alert.city || "";
    const typeKey = alert.alertType || "";
    const categoryKey = alert.alertCategory || "";
    // Better time granularity - include date AND hour to avoid over-aggressive duplicate detection
    const timeKey = alert.expectedStart 
      ? new Date(alert.expectedStart).toISOString().split('T')[0] + '-' + 
        new Date(alert.expectedStart).getHours()
      : "";
    
    // Create a primary key combining all factors
    const primaryKey = `${locationKey}-${typeKey}-${timeKey}`.toLowerCase();
    
    // Create a secondary key using just location and category for broader matching
    const secondaryKey = `${locationKey}-${categoryKey}`.toLowerCase();
    
    // Check if we already have alerts with the same primary key (exact duplicates)
    if (!potentialDuplicates[primaryKey]) {
      potentialDuplicates[primaryKey] = [alert];
    } else {
      // Found a potential duplicate with exact match
      potentialDuplicates[primaryKey].push(alert);
      
      // Mark all alerts with this key as duplicates if not already marked
      if (!duplicates.includes(primaryKey)) {
        duplicates.push(primaryKey);
      }
    }
    
    // Check for similar alerts using the secondary key and text similarity
    if (secondaryKey && secondaryKey !== '-' && !primaryKey.includes(secondaryKey)) {
      // Only consider secondary key if it's meaningful and different from primary
      Object.keys(potentialDuplicates).forEach(key => {
        if (key.includes(secondaryKey) && key !== primaryKey) {
          // Found a potential duplicate by secondary key, now check text similarity
          const existingAlerts = potentialDuplicates[key];
          for (const existingAlert of existingAlerts) {
            // Compare titles and descriptions for similarity
            if (areSimilarTexts(alert.title, existingAlert.title) && 
                areSimilarTexts(alert.description, existingAlert.description)) {
              // Create a new group key for these similar alerts
              const similarKey = `similar-${secondaryKey}-${duplicates.length}`;
              if (!potentialDuplicates[similarKey]) {
                potentialDuplicates[similarKey] = [existingAlert, alert];
                duplicates.push(similarKey);
              } else if (!potentialDuplicates[similarKey].some(a => a._id.toString() === alert._id.toString())) {
                potentialDuplicates[similarKey].push(alert);
              }
              break;
            }
          }
        }
      });
    }
  });
  
  // Return groups of duplicate alerts
  return duplicates.map(key => potentialDuplicates[key]);
};

// Helper function to check text similarity
function areSimilarTexts(text1, text2) {
  // If either text is missing, they're not similar
  if (!text1 || !text2) return false;
  
  // Convert to lowercase strings
  const str1 = text1.toLowerCase();
  const str2 = text2.toLowerCase();
  
  // Check for exact match
  if (str1 === str2) return true;
  
  // If one is much longer than the other, they're likely different
  if (Math.abs(str1.length - str2.length) > Math.min(str1.length, str2.length) * 0.5) {
    return false;
  }
  
  // Count the number of common words
  const words1 = str1.split(/\s+/).filter(w => w.length > 3);  // Only count words longer than 3 chars
  const words2 = str2.split(/\s+/).filter(w => w.length > 3);
  
  if (words1.length === 0 || words2.length === 0) return false;
  
  // Count common significant words
  const commonWords = words1.filter(word => words2.includes(word)).length;
  const similarityScore = commonWords / Math.min(words1.length, words2.length);
  
  // Consider similar if more than 50% of significant words are common
  return similarityScore > 0.5;
}

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
      includedAlerts
    } = req.body;

    const userId = req.userId;
    
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
    
    // Generate PDF if requested - always generate when autoSave is true
    let pdfUrl = null;
    try {
      if (generatePDF || autoSave) {
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
      } catch (saveError) {
        console.error("Error saving summary:", saveError);
        // We'll still return the generated content even if saving fails
      }
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
    
    const result = await Summary.deleteOne({ 
      _id: summaryId,
      userId 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Summary not found or you don't have permission to delete it"
      });
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
    const { days = 7, location, alertCategory, impact } = req.query;
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
    
    // Generate PDF for the forecast
    let pdfUrl = null;
    if (allAlerts.length > 0) {
      // Always generate PDF for forecasts to ensure download functionality works
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
