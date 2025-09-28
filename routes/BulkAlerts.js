import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import Alert from '../models/Alert.js';
import Logs from '../models/Logs.js';
import { authenticateRole } from '../middleware/auth.js';
import { io } from '../index.js';

const router = express.Router();

// Configure multer for CSV file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// Helper function to validate alert data
const validateAlertData = (data) => {
  const errors = [];
  
  // Check for either origin location or legacy location fields
  const hasOriginLocation = data.originLatitude && data.originLongitude && data.originCity;
  const hasLegacyLocation = data.latitude && data.longitude && data.city;
  
  if (!hasOriginLocation && !hasLegacyLocation) {
    errors.push('Either origin location (originLatitude, originLongitude, originCity) or legacy location (latitude, longitude, city) is required');
  }
  
  // Validate origin coordinates if provided
  if (data.originLatitude && data.originLongitude) {
    const originLat = parseFloat(data.originLatitude);
    const originLng = parseFloat(data.originLongitude);
    
    if (isNaN(originLat) || originLat < -90 || originLat > 90) errors.push('Invalid originLatitude');
    if (isNaN(originLng) || originLng < -180 || originLng > 180) errors.push('Invalid originLongitude');
    
    if (!data.originCity) errors.push('originCity is required when providing origin coordinates');
  }
  
  // Validate legacy coordinates if provided
  if (data.latitude && data.longitude) {
  const lat = parseFloat(data.latitude);
  const lng = parseFloat(data.longitude);
    
  if (isNaN(lat) || lat < -90 || lat > 90) errors.push('Invalid latitude');
  if (isNaN(lng) || lng < -180 || lng > 180) errors.push('Invalid longitude');
    
    if (!data.city) errors.push('City is required when providing coordinates');
  }
  
  // Validate impact locations if provided
  if (data.impactLocations) {
    try {
      const impactLocs = typeof data.impactLocations === 'string' 
        ? JSON.parse(data.impactLocations) 
        : data.impactLocations;
      
      if (Array.isArray(impactLocs)) {
        impactLocs.forEach((loc, index) => {
          if (!loc.latitude || !loc.longitude || !loc.city) {
            errors.push(`Impact location at index ${index} is missing required fields (latitude, longitude, city)`);
          } else {
            const impactLat = parseFloat(loc.latitude);
            const impactLng = parseFloat(loc.longitude);
            
            if (isNaN(impactLat) || impactLat < -90 || impactLat > 90) {
              errors.push(`Invalid latitude in impact location at index ${index}`);
            }
            if (isNaN(impactLng) || impactLng < -180 || impactLng > 180) {
              errors.push(`Invalid longitude in impact location at index ${index}`);
            }
          }
        });
      } else {
        errors.push('impactLocations must be an array');
      }
    } catch (error) {
      errors.push(`Invalid impactLocations format: ${error.message}`);
    }
  }
  
  // Validate other fields
  if (!data.description) errors.push('Description is required');
  
  // Ensure targetAudience is properly formatted
  if (data.targetAudience) {
    if (typeof data.targetAudience === 'string') {
      // Will be converted to array in processing
    } else if (Array.isArray(data.targetAudience)) {
      // Already an array, which is fine
    } else {
      errors.push('targetAudience must be a string or an array');
    }
  }
  
  // Validate date fields if provided
  if (data.expectedStart) {
    const startDate = new Date(data.expectedStart);
    if (isNaN(startDate.getTime())) {
      errors.push('Invalid expectedStart date format. Use ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)');
    }
  }
  
  if (data.expectedEnd) {
    const endDate = new Date(data.expectedEnd);
    if (isNaN(endDate.getTime())) {
      errors.push('Invalid expectedEnd date format. Use ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)');
    }
  }
  
  // If both dates are provided, check expectedEnd is after expectedStart
  if (data.expectedStart && data.expectedEnd) {
    const startDate = new Date(data.expectedStart);
    const endDate = new Date(data.expectedEnd);
    
    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && endDate <= startDate) {
      errors.push('expectedEnd date must be after expectedStart date');
    }
  }
  
  // Validate alert category if provided
  if (data.alertCategory) {
    const validCategories = ['Weather', 'Transport', 'Health', 'Civil Unrest', 'General Safety', 'Natural Disaster'];
    if (!validCategories.includes(data.alertCategory)) errors.push('Invalid alert category');
  }
  
  // Validate alert type if provided
  if (data.alertType) {
    const validTypes = ['Rain', 'Strike', 'Protest', 'Cyber Attack', 'Fire', 'Fog', 'Data Breach', 'Storm', 'Flood', 'Cancellation', 'Delay', 'Infrastructure Issue', 'Traffic', 'Other', 'Heat Warning', 'Snow', 'Outbreak', 'Epidemic', 'Pandemic', 'Contamination', 'Riot', 'Demonstration', 'Terrorism', 'Crime', 'Earthquake', 'Tsunami', 'Volcanic Activity', 'Wildfire', 'Landslide'];
    if (!validTypes.includes(data.alertType)) errors.push('Invalid alert type');
  }
  
  // Validate risk level if provided
  if (data.risk) {
    const validRiskLevels = ['Low', 'Medium', 'High'];
    if (!validRiskLevels.includes(data.risk)) errors.push('Invalid risk level');
  }
  
  // Validate impact if provided - ONLY "Low", "Moderate", "High" are allowed
  if (data.impact) {
    const validImpactLevels = ['Low', 'Moderate', 'High'];
    if (!validImpactLevels.includes(data.impact)) {
      errors.push(`Invalid impact value: "${data.impact}". Only "Low", "Moderate", or "High" are allowed.`);
    }
  }
  
  // Validate status if provided
  if (data.status) {
    const validStatuses = ['pending', 'rejected', 'approved'];
    if (!validStatuses.includes(data.status)) errors.push('Invalid status');
  }
  
  return errors;
};

// Route to handle bulk upload
router.post('/upload', authenticateRole(['admin', 'manager']), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  const errors = [];
  let processedCount = 0;
  let successCount = 0;
  let createdAlerts = [];
  const startTime = Date.now();

  try {
    // Create a readable stream from the buffer
    const stream = Readable.from(req.file.buffer.toString());
    
    // Configure CSV parser with proper quote handling
    const parser = parse({
      columns: true,
      trim: true,
      skip_empty_lines: true,
      relax_quotes: true,  // More lenient quote handling
      relax_column_count: true,  // Allow rows with different columns
      quote: '"',
      escape: '"',
      from_line: 1
    });

    stream
      .pipe(parser)
      .on('data', async (row) => {
        processedCount++;
        
        try {
          // Parse JSON fields if they exist
          if (row.impactLocations && typeof row.impactLocations === 'string' && row.impactLocations.trim() !== '') {
            try {
              row.impactLocations = JSON.parse(row.impactLocations);
            } catch (jsonError) {
              errors.push({
                row: processedCount,
                errors: [`Failed to parse impactLocations JSON: ${jsonError.message}. Raw value: ${row.impactLocations}`]
              });
              return; // Skip this row if JSON parsing fails
            }
          } else {
            // If empty or undefined, set as empty array
            row.impactLocations = [];
          }
          
          // Validate row data
          const validationErrors = validateAlertData(row);
          if (validationErrors.length > 0) {
            errors.push({
              row: processedCount,
              errors: validationErrors
            });
            return;
          }
          
          // Process the alert data and create it in the database
          try {
            // Base alert data
            const alertData = {
              userId: req.userId,
              
              // Alert details
              alertCategory: row.alertCategory || 'Other',
              alertType: row.alertType || 'Other',
              title: row.title || row.header, // Support both title and header
              description: row.description,
              risk: row.risk || 'Medium',
              impact: row.impact || 'Low', // Default to 'Low' if not provided
              priority: row.priority || 'Medium',
              targetAudience: row.targetAudience ? row.targetAudience.split(',').map(item => item.trim()) : ['Tourists'],
              recommendedAction: row.recommendedAction || row.action || '', // Support both field names
              
              // Date fields - parse if present
              expectedStart: row.expectedStart ? new Date(row.expectedStart) : undefined,
              expectedEnd: row.expectedEnd ? new Date(row.expectedEnd) : undefined,
              
              // Meta fields
              status: row.status || 'pending',
              linkToSource: row.linkToSource || '',
              addToEmailSummary: row.addToEmailSummary === 'true' || false,
              
              // Version information (for alerts that are updates to existing ones)
              alertGroupId: row.alertGroupId || null,
              version: row.version || 1,
              isLatest: true, // New uploads are always the latest version
              previousVersionNotes: row.previousVersionNotes || '',
              updatedBy: req.userId,
              
              // Set default empty arrays for related data
              followedBy: [],
              media: [],
              likes: 0,
              likedBy: [],
              flaggedBy: [],
              shares: 0,
              sharedBy: [],
              numberOfFollows: 0
            };

            // Process location information
            // Handle origin location if provided
            if (row.originLatitude && row.originLongitude) {
              alertData.originLatitude = parseFloat(row.originLatitude);
              alertData.originLongitude = parseFloat(row.originLongitude);
              alertData.originCity = row.originCity;
              alertData.originCountry = row.originCountry || row.country || 'Unknown';
              alertData.originPlaceId = row.originPlaceId || '';
              alertData.originLocation = {
                type: 'Point',
                coordinates: [parseFloat(row.originLongitude), parseFloat(row.originLatitude)]
              };
              
              // Also set legacy fields for backward compatibility if not provided
              if (!row.latitude || !row.longitude) {
                alertData.latitude = parseFloat(row.originLatitude);
                alertData.longitude = parseFloat(row.originLongitude);
                alertData.city = row.originCity;
                alertData.location = {
                  type: 'Point',
                  coordinates: [parseFloat(row.originLongitude), parseFloat(row.originLatitude)]
                };
              }
            }
            
            // Handle legacy location fields
            if (row.latitude && row.longitude) {
              alertData.latitude = parseFloat(row.latitude);
              alertData.longitude = parseFloat(row.longitude);
              alertData.city = row.city;
              alertData.country = row.country || 'Unknown';
              alertData.location = {
                type: 'Point',
                coordinates: [parseFloat(row.longitude), parseFloat(row.latitude)]
              };
              
              // Set origin location from legacy fields if origin not provided
              if (!row.originLatitude || !row.originLongitude) {
                alertData.originLatitude = parseFloat(row.latitude);
                alertData.originLongitude = parseFloat(row.longitude);
                alertData.originCity = row.city;
                alertData.originCountry = row.country || 'Unknown';
                alertData.originLocation = {
                  type: 'Point',
                  coordinates: [parseFloat(row.longitude), parseFloat(row.latitude)]
                };
              }
            }
            
            // Process impact locations if provided
            if (row.impactLocations && Array.isArray(row.impactLocations) && row.impactLocations.length > 0) {
              // Transform impact locations to ensure they have the required GeoJSON structure
              alertData.impactLocations = row.impactLocations.map(loc => ({
                latitude: parseFloat(loc.latitude),
                longitude: parseFloat(loc.longitude),
                city: loc.city,
                country: loc.country || 'Unknown',
                placeId: loc.placeId || '',
                location: {
                  type: 'Point',
                  coordinates: [parseFloat(loc.longitude), parseFloat(loc.latitude)]
                }
              }));
            }

            const alert = new Alert(alertData);
            await alert.save();
            createdAlerts.push(alert);
            successCount++;
            results.push({
              row: processedCount,
              status: 'success',
              alertId: alert._id
            });
          } catch (error) {
            console.error('Error creating alert:', error);
            errors.push({
              row: processedCount,
              errors: [error.message]
            });
          }
        } catch (rowError) {
          console.error('Error processing row:', rowError);
          errors.push({
            row: processedCount,
            errors: [`Failed to process row: ${rowError.message}`]
          });
        }
      })
      .on('end', async () => {
        // Emit real-time update for bulk alerts creation
        if (createdAlerts.length > 0) {
          io.emit('alerts:bulk-created', {
            count: createdAlerts.length,
            message: `${createdAlerts.length} alerts created via bulk upload`
          });
        }
        
        // Calculate duration
        const duration = Date.now() - startTime;
        
        // Log the bulk upload
        try {
          await Logger.log(req, 'bulk_alerts_uploaded', {
            totalProcessed: processedCount,
            successCount,
            errorCount: errors.length,
            duration: `${duration}ms`,
            filename: req.file.originalname,
            fileSize: req.file.size,
            firstAlertId: createdAlerts.length > 0 ? createdAlerts[0]._id : null,
          });
        } catch (logError) {
          console.error('Error logging bulk upload:', logError);
          // Continue execution even if logging fails
        }
        
        res.json({
          totalProcessed: processedCount,
          successCount,
          errorCount: errors.length,
          errors,
          results
        });
      })
      .on('error', (error) => {
        console.error('CSV parsing error:', error);
        res.status(500).json({
          error: 'Error processing CSV file',
          details: error.message,
          errorInfo: error.toString()
        });
      });
  } catch (error) {
    console.error('Unexpected error during file processing:', error);
    res.status(500).json({
      error: 'Error processing uploaded file',
      details: error.message
    });
  }
});

// Route to get CSV template
router.get('/template', (req, res) => {
  const headers = [
    'alertCategory',
    'alertType',
    'title',
    'description',
    'risk',
    'impact',
    'priority',
    'targetAudience',
    'recommendedAction',
    // Origin location fields
    'originLatitude',
    'originLongitude',
    'originCity',
    'originCountry',
    'originPlaceId',
    // Legacy location fields (for backward compatibility)
    'latitude',
    'longitude',
    'city',
    'country',
    // Other fields
    'expectedStart',
    'expectedEnd',
    'linkToSource',
    'status',
    'addToEmailSummary',
    // Impact locations would be provided as a JSON string in the CSV
    'impactLocations'
  ];

  // Helper function to properly escape CSV fields
  const escapeCSV = (field) => {
    if (field === null || field === undefined) return '';
    
    // Convert to string
    const str = String(field);
    
    // If the field contains quotes, commas, or newlines, it needs to be quoted and internal quotes doubled
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
  };
  
  // Helper function to properly format impactLocations as CSV-safe JSON
  const formatImpactLocations = (locations) => {
    if (!locations || locations.length === 0) return '';
    
    // Convert the locations object to a JSON string
    const jsonString = JSON.stringify(locations);
    
    // Escape double quotes for CSV format by doubling them
    return `"${jsonString.replace(/"/g, '""')}"`;
  };

  // Base CSV content with headers
  let csvContent = headers.join(',') + '\n';
  
  // Sample data rows
  const rows = [
    // Transportation alerts
    {
      alertCategory: 'Transport',
      alertType: 'Strike',
      title: 'Leith Dock Road Congestion',
      description: 'Heavy goods vehicles causing delays on Leith Dock Road approaching the port area. Expect significant slowdowns during peak hours.',
      risk: 'Medium',
      impact: 'Low',
      priority: 'Medium',
      targetAudience: 'Commuters,Tourists',
      recommendedAction: 'Allow extra journey time or use alternative routes via Seafield Road',
      originLatitude: 55.9770,
      originLongitude: -3.1710,
      originCity: 'Leith',
      originCountry: 'UK',
      originPlaceId: 'LEI123',
      latitude: 55.9770,
      longitude: -3.1710,
      city: 'Leith',
      country: 'UK',
      expectedStart: '2025-05-17T07:00:00.000Z',
      expectedEnd: '2025-05-30T18:00:00.000Z',
      linkToSource: 'https://edinburghtravelupdates.com/leith-congestion',
      status: 'approved',
      addToEmailSummary: false,
      impactLocations: []
    },
    {
      alertCategory: 'Transport',
      alertType: 'Delay',
      title: 'Edinburgh Airport Security Delays',
      description: 'Enhanced security measures causing extended waiting times at Edinburgh Airport. Average wait times of 45-60 minutes reported.',
      risk: 'Medium',
      impact: 'Moderate',
      priority: 'High',
      targetAudience: 'Tourists,Business Travelers',
      recommendedAction: 'Arrive at least 3 hours before your scheduled departure',
      originLatitude: 55.9500,
      originLongitude: -3.3620,
      originCity: 'Edinburgh Airport',
      originCountry: 'UK',
      originPlaceId: 'EDI001',
      latitude: 55.9500,
      longitude: -3.3620,
      city: 'Edinburgh Airport',
      country: 'UK',
      expectedStart: '2025-05-15T00:00:00.000Z',
      expectedEnd: '2025-05-25T23:59:59.000Z',
      linkToSource: 'https://www.edinburghairport.com/alerts',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: []
    },
    {
      alertCategory: 'Transport',
      alertType: 'Cancellation',
      title: 'Tram Service Disruption - York Place to Newhaven',
      description: 'All tram services between York Place and Newhaven are cancelled due to emergency track maintenance. Replacement bus services are operating.',
      risk: 'Medium',
      impact: 'Moderate',
      priority: 'Medium',
      targetAudience: 'Commuters,Tourists,Residents',
      recommendedAction: 'Use replacement bus service number 34X or alternative routes',
      originLatitude: 55.9569,
      originLongitude: -3.1875,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: 'EDI002',
      latitude: '',
      longitude: '',
      city: '',
      country: '',
      expectedStart: '2025-05-16T04:30:00.000Z',
      expectedEnd: '2025-05-18T22:00:00.000Z',
      linkToSource: 'https://edinburghtrams.com/disruptions',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: [
        {
          latitude: 55.9569,
          longitude: -3.1875,
          city: 'York Place',
          country: 'UK'
        },
        {
          latitude: 55.9758,
          longitude: -3.1708,
          city: 'Newhaven',
          country: 'UK'
        }
      ]
    },
    {
      alertCategory: 'Transport',
      alertType: 'Strike',
      title: 'Bus Driver Strike - Lothian Buses',
      description: 'Lothian Bus drivers on strike affecting 70% of city routes. Limited service operating on main routes only.',
      risk: 'High',
      impact: 'High',
      priority: 'High',
      targetAudience: 'Everyone',
      recommendedAction: 'Consider alternative transport or work from home if possible',
      originLatitude: 55.9533,
      originLongitude: -3.1883,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9533,
      longitude: -3.1883,
      city: 'Edinburgh',
      country: 'UK',
      expectedStart: '2025-05-20T00:00:00.000Z',
      expectedEnd: '2025-05-22T23:59:59.000Z',
      linkToSource: 'https://www.lothianbuses.com/updates',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: [
        {
          latitude: 55.9533,
          longitude: -3.1883,
          city: 'Edinburgh City Center',
          country: 'UK'
        },
        {
          latitude: 55.9770,
          longitude: -3.1710,
          city: 'Leith',
          country: 'UK'
        },
        {
          latitude: 55.9500,
          longitude: -3.3620,
          city: 'Edinburgh Airport',
          country: 'UK'
        }
      ]
    },
    {
      alertCategory: 'Transport',
      alertType: 'Traffic',
      title: 'Major Congestion - Queensferry Crossing',
      description: 'Severe traffic congestion on the Queensferry Crossing due to a multi-vehicle collision. Two lanes closed northbound.',
      risk: 'Medium',
      impact: 'Moderate',
      priority: 'Medium',
      targetAudience: 'Commuters,Tourists',
      recommendedAction: 'Delay journey or use alternative routes if possible',
      originLatitude: 55.9994,
      originLongitude: -3.4064,
      originCity: 'Queensferry',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9994,
      longitude: -3.4064,
      city: 'Queensferry',
      country: 'UK',
      expectedStart: '2025-05-19T15:30:00.000Z',
      expectedEnd: '2025-05-19T19:00:00.000Z',
      linkToSource: 'https://trafficscotland.org/updates',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: []
    },
    
    // Weather alerts
    {
      alertCategory: 'Weather',
      alertType: 'Storm',
      title: 'Storm Eleanor - Edinburgh & Lothians',
      description: 'Storm Eleanor bringing gale force winds of up to 80mph and heavy rain to Edinburgh and surrounding areas. Risk of flooding in low-lying areas.',
      risk: 'High',
      impact: 'High',
      priority: 'High',
      targetAudience: 'Everyone',
      recommendedAction: 'Avoid unnecessary travel. Secure loose objects around properties.',
      originLatitude: 55.9533,
      originLongitude: -3.1883,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: 'EDI003',
      latitude: '',
      longitude: '',
      city: '',
      country: '',
      expectedStart: '2025-06-01T00:00:00.000Z',
      expectedEnd: '2025-06-02T23:59:59.000Z',
      linkToSource: 'https://www.metoffice.gov.uk/weather/warnings-and-advice',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: [
        {
          latitude: 55.9450,
          longitude: -3.1850,
          city: 'South Edinburgh',
          country: 'UK'
        },
        {
          latitude: 55.9650,
          longitude: -3.1900,
          city: 'North Edinburgh',
          country: 'UK'
        },
        {
          latitude: 55.9770,
          longitude: -3.1710,
          city: 'Leith',
          country: 'UK'
        },
        {
          latitude: 55.9500,
          longitude: -3.3620,
          city: 'Edinburgh Airport',
          country: 'UK'
        }
      ]
    },
    {
      alertCategory: 'Weather',
      alertType: 'Flood',
      title: 'Flooding Alert - Water of Leith',
      description: 'Water of Leith has breached banks at several locations following heavy rainfall. Areas of Stockbridge, Dean Village and Leith at risk of flooding.',
      risk: 'High',
      impact: 'High',
      priority: 'High',
      targetAudience: 'Residents,Tourists',
      recommendedAction: 'Avoid walking paths near the Water of Leith. Residents in affected areas should prepare flood defenses.',
      originLatitude: 55.9707,
      originLongitude: -3.1725,
      originCity: 'Leith',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9707,
      longitude: -3.1725,
      city: 'Leith',
      country: 'UK',
      expectedStart: '2025-05-25T06:00:00.000Z',
      expectedEnd: '2025-05-27T12:00:00.000Z',
      linkToSource: 'https://floodlinescotland.org.uk/alerts',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: [
        {
          latitude: 55.9580,
          longitude: -3.2099,
          city: 'Stockbridge',
          country: 'UK'
        },
        {
          latitude: 55.9520,
          longitude: -3.2190,
          city: 'Dean Village',
          country: 'UK'
        },
        {
          latitude: 55.9707,
          longitude: -3.1725,
          city: 'Leith',
          country: 'UK'
        }
      ]
    },
    {
      alertCategory: 'Weather',
      alertType: 'Snow',
      title: 'Heavy Snowfall Warning - Edinburgh Region',
      description: 'Met Office has issued an amber warning for heavy snowfall. Accumulations of 15-20cm expected on higher ground, 5-10cm in the city.',
      risk: 'Medium',
      impact: 'Moderate',
      priority: 'Medium',
      targetAudience: 'Everyone',
      recommendedAction: 'Prepare for travel disruption. Stock up on essentials if possible.',
      originLatitude: 55.9533,
      originLongitude: -3.1883,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9533,
      longitude: -3.1883,
      city: 'Edinburgh',
      country: 'UK',
      expectedStart: '2025-12-10T18:00:00.000Z',
      expectedEnd: '2025-12-12T09:00:00.000Z',
      linkToSource: 'https://www.metoffice.gov.uk/weather/warnings-and-advice',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: []
    },
    
    // Events and cultural impacts
    {
      alertCategory: 'General Safety',
      alertType: 'Other',
      title: 'Edinburgh Festival Fringe - Major Congestion',
      description: 'Extreme crowding expected in Old Town and city center during Festival Fringe. Pedestrian movement heavily restricted in Royal Mile area.',
      risk: 'Medium',
      impact: 'Moderate',
      priority: 'Medium',
      targetAudience: 'Everyone',
      recommendedAction: 'Allow extra time for journeys. Consider using public transport rather than driving to the city center.',
      originLatitude: 55.9486,
      originLongitude: -3.1999,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: 'EDI004',
      latitude: 55.9486,
      longitude: -3.1999,
      city: 'Edinburgh',
      country: 'UK',
      expectedStart: '2025-08-01T00:00:00.000Z',
      expectedEnd: '2025-08-25T23:59:59.000Z',
      linkToSource: 'https://www.edfringe.com',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: [
        {
          latitude: 55.9486,
          longitude: -3.1999,
          city: 'Royal Mile',
          country: 'UK'
        },
        {
          latitude: 55.9472,
          longitude: -3.1953,
          city: 'Old Town',
          country: 'UK'
        }
      ]
    },
    {
      alertCategory: 'General Safety',
      alertType: 'Other',
      title: 'Hogmanay Street Party - Access Restrictions',
      description: 'Edinburgh\'s Hogmanay celebrations will involve extensive street closures and security checkpoints throughout the city center.',
      risk: 'Low',
      impact: 'Moderate',
      priority: 'Medium',
      targetAudience: 'Everyone',
      recommendedAction: 'Tickets required for Street Party areas. Plan arrival well in advance and be prepared for security searches.',
      originLatitude: 55.9519,
      originLongitude: -3.1953,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9519,
      longitude: -3.1953,
      city: 'Edinburgh',
      country: 'UK',
      expectedStart: '2025-12-31T12:00:00.000Z',
      expectedEnd: '2026-01-01T04:00:00.000Z',
      linkToSource: 'https://www.edinburghshogmanay.com',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: [
        {
          latitude: 55.9519,
          longitude: -3.1953,
          city: 'Princes Street',
          country: 'UK'
        },
        {
          latitude: 55.9503,
          longitude: -3.1883,
          city: 'Waverley Station',
          country: 'UK'
        }
      ]
    },
    
    // Health alerts
    {
      alertCategory: 'Health',
      alertType: 'Outbreak',
      title: 'Norovirus Outbreak - Edinburgh Royal Infirmary',
      description: 'Norovirus outbreak reported at Edinburgh Royal Infirmary. Several wards affected with visitor restrictions in place.',
      risk: 'Medium',
      impact: 'Moderate',
      priority: 'Medium',
      targetAudience: 'Everyone',
      recommendedAction: 'Avoid visiting the hospital unless absolutely necessary. Follow strict hand hygiene if visiting.',
      originLatitude: 55.9212,
      originLongitude: -3.1375,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9212,
      longitude: -3.1375,
      city: 'Edinburgh',
      country: 'UK',
      expectedStart: '2025-05-14T00:00:00.000Z',
      expectedEnd: '2025-05-28T23:59:59.000Z',
      linkToSource: 'https://www.nhslothian.scot/news',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: []
    },
    {
      alertCategory: 'Health',
      alertType: 'Contamination',
      title: 'Boil Water Notice - Corstorphine Area',
      description: 'Scottish Water has issued a precautionary boil water notice for parts of Corstorphine following detection of bacterial contamination.',
      risk: 'Medium',
      impact: 'Moderate',
      priority: 'High',
      targetAudience: 'Residents,Tourists',
      recommendedAction: 'Boil all water for drinking, cooking and brushing teeth until further notice.',
      originLatitude: 55.9425,
      originLongitude: -3.2829,
      originCity: 'Corstorphine',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9425,
      longitude: -3.2829,
      city: 'Corstorphine',
      country: 'UK',
      expectedStart: '2025-05-18T09:00:00.000Z',
      expectedEnd: '2025-05-21T18:00:00.000Z',
      linkToSource: 'https://www.scottishwater.co.uk/alerts',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: []
    },
    
    // Civil unrest
    {
      alertCategory: 'Civil Unrest',
      alertType: 'Protest',
      title: 'Climate Protest - Scottish Parliament',
      description: 'Large-scale climate protest planned outside Scottish Parliament. Possible disruption to transport and access in the Holyrood area.',
      risk: 'Low',
      impact: 'Low',
      priority: 'Low',
      targetAudience: 'Everyone',
      recommendedAction: 'Avoid Holyrood area if possible or allow extra time for journeys.',
      originLatitude: 55.9527,
      originLongitude: -3.1748,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9527,
      longitude: -3.1748,
      city: 'Edinburgh',
      country: 'UK',
      expectedStart: '2025-05-26T10:00:00.000Z',
      expectedEnd: '2025-05-26T16:00:00.000Z',
      linkToSource: 'https://www.edinburghnews.com',
      status: 'approved',
      addToEmailSummary: false,
      impactLocations: [
        {
          latitude: 55.9527,
          longitude: -3.1748,
          city: 'Holyrood',
          country: 'UK'
        },
        {
          latitude: 55.9503,
          longitude: -3.1883,
          city: 'Waverley Station',
          country: 'UK'
        }
      ]
    },
    {
      alertCategory: 'Civil Unrest',
      alertType: 'Demonstration',
      title: 'Workers Rights March - City Center',
      description: 'Trade union organized march through central Edinburgh affecting Princes Street, North Bridge and Royal Mile.',
      risk: 'Low',
      impact: 'Low',
      priority: 'Low',
      targetAudience: 'Everyone',
      recommendedAction: 'Expect road closures 12pm-3pm. Bus routes diverted during this time.',
      originLatitude: 55.9533,
      originLongitude: -3.1883,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9533,
      longitude: -3.1883,
      city: 'Edinburgh',
      country: 'UK',
      expectedStart: '2025-05-01T12:00:00.000Z',
      expectedEnd: '2025-05-01T15:00:00.000Z',
      linkToSource: 'https://www.edinburghnews.com',
      status: 'approved',
      addToEmailSummary: false,
      impactLocations: [
        {
          latitude: 55.9519,
          longitude: -3.1953,
          city: 'Princes Street',
          country: 'UK'
        },
        {
          latitude: 55.9506,
          longitude: -3.1856,
          city: 'North Bridge',
          country: 'UK'
        },
        {
          latitude: 55.9486,
          longitude: -3.1999,
          city: 'Royal Mile',
          country: 'UK'
        }
      ]
    },
    
    // Infrastructure issues
    {
      alertCategory: 'Transport',
      alertType: 'Infrastructure Issue',
      title: 'Road Closure - Forth Road Bridge',
      description: 'Forth Road Bridge closed to all traffic due to emergency inspection works. All traffic diverted to Queensferry Crossing.',
      risk: 'Medium',
      impact: 'Moderate',
      priority: 'Medium',
      targetAudience: 'Commuters,Tourists',
      recommendedAction: 'Use Queensferry Crossing. Allow extra time for journeys due to increased congestion.',
      originLatitude: 56.0019,
      originLongitude: -3.4042,
      originCity: 'South Queensferry',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 56.0019,
      longitude: -3.4042,
      city: 'South Queensferry',
      country: 'UK',
      expectedStart: '2025-06-05T22:00:00.000Z',
      expectedEnd: '2025-06-07T05:00:00.000Z',
      linkToSource: 'https://www.theforthbridges.org',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: []
    },
    {
      alertCategory: 'Transport',
      alertType: 'Infrastructure Issue',
      title: 'Water Main Burst - Lothian Road',
      description: 'Major water main burst on Lothian Road causing significant flooding and road closure between Princes Street and Fountainbridge.',
      risk: 'Medium',
      impact: 'Moderate',
      priority: 'Medium',
      targetAudience: 'Everyone',
      recommendedAction: 'Avoid area. Significant traffic diversions in place. Follow signs.',
      originLatitude: 55.9478,
      originLongitude: -3.2040,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9478,
      longitude: -3.2040,
      city: 'Edinburgh',
      country: 'UK',
      expectedStart: '2025-05-22T08:30:00.000Z',
      expectedEnd: '2025-05-23T20:00:00.000Z',
      linkToSource: 'https://www.edinburghnews.com',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: []
    },
    {
      alertCategory: 'Transport',
      alertType: 'Infrastructure Issue',
      title: 'Power Outage - Leith and Portobello',
      description: 'Widespread power outage affecting Leith, Portobello and parts of eastern Edinburgh. Traffic lights affected in these areas.',
      risk: 'Medium',
      impact: 'Moderate',
      priority: 'Medium',
      targetAudience: 'Everyone',
      recommendedAction: 'Take extra care at road junctions. Expect disruption to some shops and services.',
      originLatitude: 55.9770,
      originLongitude: -3.1710,
      originCity: 'Leith',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9770,
      longitude: -3.1710,
      city: 'Leith',
      country: 'UK',
      expectedStart: '2025-05-15T14:15:00.000Z',
      expectedEnd: '2025-05-15T19:30:00.000Z',
      linkToSource: 'https://www.spenergynetworks.co.uk',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: [
        {
          latitude: 55.9770,
          longitude: -3.1710,
          city: 'Leith',
          country: 'UK'
        },
        {
          latitude: 55.9526,
          longitude: -3.1149,
          city: 'Portobello',
          country: 'UK'
        }
      ]
    },
    
    // Special event alerts
    {
      alertCategory: 'General Safety',
      alertType: 'Other',
      title: 'Royal Highland Show - Traffic Management',
      description: 'Heavy traffic expected around Ingliston and Edinburgh Airport due to Royal Highland Show. Special traffic management in operation.',
      risk: 'Low',
      impact: 'Low',
      priority: 'Low',
      targetAudience: 'Everyone',
      recommendedAction: 'Use dedicated shuttle buses from city center or park and ride facilities.',
      originLatitude: 55.9425,
      originLongitude: -3.3633,
      originCity: 'Ingliston',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9425,
      longitude: -3.3633,
      city: 'Ingliston',
      country: 'UK',
      expectedStart: '2025-06-18T07:00:00.000Z',
      expectedEnd: '2025-06-21T20:00:00.000Z',
      linkToSource: 'https://www.royalhighlandshow.org',
      status: 'approved',
      addToEmailSummary: false,
      impactLocations: [
        {
          latitude: 55.9425,
          longitude: -3.3633,
          city: 'Ingliston',
          country: 'UK'
        },
        {
          latitude: 55.9500,
          longitude: -3.3620,
          city: 'Edinburgh Airport',
          country: 'UK'
        }
      ]
    },
    {
      alertCategory: 'General Safety',
      alertType: 'Other',
      title: 'Military Tattoo - Castle Esplanade Closures',
      description: 'Edinburgh Castle Esplanade and surrounding areas closed to non-ticket holders during Edinburgh Military Tattoo performances.',
      risk: 'Low',
        impact: 'Low',
      priority: 'Low',
      targetAudience: 'Tourists,Residents',
      recommendedAction: 'Only approach area with valid tickets during performance times. Alternative routes in place for pedestrians.',
      originLatitude: 55.9486,
      originLongitude: -3.1999,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9486,
      longitude: -3.1999,
      city: 'Edinburgh',
      country: 'UK',
      expectedStart: '2025-08-01T19:00:00.000Z',
      expectedEnd: '2025-08-23T23:30:00.000Z',
      linkToSource: 'https://www.edintattoo.co.uk',
      status: 'approved',
      addToEmailSummary: false,
      impactLocations: []
    },
    
    // Natural disaster
    {
      alertCategory: 'Natural Disaster',
      alertType: 'Landslide',
      title: 'Landslide Risk - Salisbury Crags',
      description: 'Elevated risk of landslides and rock falls at Salisbury Crags following heavy rainfall. Some paths in Holyrood Park closed.',
      risk: 'Medium',
      impact: 'Moderate',
      priority: 'Medium',
      targetAudience: 'Everyone',
      recommendedAction: 'Keep to marked open paths only. Observe warning signs and barriers.',
      originLatitude: 55.9513,
      originLongitude: -3.1583,
      originCity: 'Edinburgh',
      originCountry: 'UK',
      originPlaceId: '',
      latitude: 55.9513,
      longitude: -3.1583,
      city: 'Edinburgh',
      country: 'UK',
      expectedStart: '2025-05-24T00:00:00.000Z',
      expectedEnd: '2025-06-10T23:59:59.000Z',
      linkToSource: 'https://www.historicenvironment.scot',
      status: 'approved',
      addToEmailSummary: true,
      impactLocations: []
    }
  ];

  // Add each row to the CSV content
  rows.forEach(row => {
    const formattedRow = headers.map(header => {
      if (header === 'impactLocations') {
        return formatImpactLocations(row[header]);
      } else {
        return escapeCSV(row[header]);
      }
    });
    csvContent += formattedRow.join(',') + '\n';
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=alert-template.csv');
  res.send(csvContent);
});

export default router;