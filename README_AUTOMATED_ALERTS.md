# Automated Alert Generation System

## Overview

The Automated Alert Generation System is a comprehensive solution that automatically generates travel disruption alerts for 5 major UK cities using AI, with built-in duplication detection and approval workflow.

## Features

### 🎯 Core Functionality
- **AI-Powered Generation**: Uses OpenAI GPT-4 to generate realistic, location-specific alerts
- **Multi-City Support**: Covers Edinburgh, Glasgow, Stirling, Manchester, and London
- **Scheduled Execution**: Runs automatically every Monday, Wednesday, and Friday at 9:00 AM Edinburgh time
- **Structured Data**: Generates alerts with all required fields in JSON format

### 🔍 Duplication Detection
- **Exact Matching**: Checks for identical descriptions, locations, and date ranges
- **Fuzzy Matching**: Uses Jaccard similarity to detect similar alerts (80%+ similarity threshold)
- **Smart Grouping**: Groups duplicate alerts for easier management

### ✅ Approval Workflow
- **Confidence-Based**: Auto-approves high-confidence alerts (90%+)
- **Manual Review**: Sends low-confidence and duplicate alerts to pending queue
- **Bulk Actions**: Support for bulk approve/reject operations
- **Audit Trail**: Complete logging of all actions and decisions

## System Architecture

### Backend Components

#### 1. Automated Alert Generator (`utils/automatedAlertGenerator.js`)
```javascript
class AutomatedAlertGenerator {
  // Core generation logic
  async generateAlertsForCity(cityKey)
  async checkForDuplicates(alert)
  async saveAlert(alertData, isDuplicate, confidence)
  async generateAlertsForAllCities()
}
```

#### 2. Controller (`controllers/automatedAlertController.js`)
```javascript
// Management endpoints
getAutomatedAlerts()
bulkApproveAlerts()
bulkRejectAlerts()
approveAlert()
rejectAlert()
getAutomatedAlertStats()
triggerAlertGeneration()
```

#### 3. Routes (`routes/automatedAlerts.js`)
- `GET /api/automated-alerts` - List alerts with filtering
- `POST /api/automated-alerts/bulk-approve` - Bulk approve
- `POST /api/automated-alerts/bulk-reject` - Bulk reject
- `POST /api/automated-alerts/:id/approve` - Approve single alert
- `POST /api/automated-alerts/:id/reject` - Reject single alert
- `POST /api/automated-alerts/trigger-generation` - Manual trigger

### Frontend Components

#### 1. Admin Dashboard (`/admin/automated-alerts`)
- **Three-Tab Interface**: Pending, Published, Rejected
- **Bulk Operations**: Select multiple alerts for approve/reject
- **Real-time Stats**: Live counters for each status
- **Manual Trigger**: Button to manually start generation

#### 2. Service Layer (`services/automatedAlerts.ts`)
- Type-safe API calls
- Error handling
- Response formatting

## Configuration

### Environment Variables
```bash
# Required
OPENAI_API_KEY=your_openai_api_key_here

# Optional (for logging)
BREVO_API_KEY=your_brevo_api_key_here
```

### City Configuration
```javascript
const CITIES = {
  edinburgh: {
    name: 'Edinburgh',
    latitude: 55.9533,
    longitude: -3.1883,
    placeId: 'ChIJIyaYpQC4h0gRJ0GJS6q-OAQ',
    country: 'United Kingdom'
  },
  // ... other cities
};
```

### Alert Categories
```javascript
const ALERT_CATEGORIES = {
  'Transportation': ['Road Closures', 'Public Transport Delays', ...],
  'Weather': ['Severe Weather', 'Flooding', ...],
  'Events': ['Major Events', 'Festivals', ...],
  'Infrastructure': ['Power Outages', 'Water Supply Issues', ...],
  'Health & Safety': ['Health Alerts', 'Safety Warnings', ...]
};
```

## Alert Structure

### Generated Alert Format
```json
{
  "title": "Brief, descriptive title",
  "description": "Detailed description of the issue",
  "alertCategory": "Transportation|Weather|Events|Infrastructure|Health & Safety",
  "alertType": "Specific sub-category",
  "impact": "Minor|Moderate|Severe",
  "targetAudience": ["Tourists", "Business Travelers", "Local Residents", "Event Attendees", "Transport Users"],
  "recommendedAction": "What people should do",
  "expectedStart": "YYYY-MM-DDTHH:mm:ss",
  "expectedEnd": "YYYY-MM-DDTHH:mm:ss",
  "originCity": "City name",
  "originCountry": "Country name",
  "impactLocations": [
    {
      "city": "Affected city",
      "country": "Country name",
      "latitude": 0.0,
      "longitude": 0.0
    }
  ],
  "confidence": 0.85
}
```

### Database Schema Extensions
The system extends the existing Alert model with:
- `alertGroupId`: Identifies automated alerts (`auto_` or `duplicate_` prefix)
- `confidence`: AI-generated confidence score
- `updatedBy`: Tracks who approved/rejected the alert

## Workflow

### 1. Scheduled Generation
```javascript
// Runs every Monday, Wednesday, Friday at 9:00 AM Edinburgh time
cron.schedule('0 9 * * 1,3,5', async () => {
  await generator.generateAlertsForAllCities();
}, {
  scheduled: true,
  timezone: "Europe/London"
});
```

### 2. Generation Process
1. **City Iteration**: Process each of the 5 cities
2. **AI Generation**: Call OpenAI API for 10-15 alerts per city
3. **Duplicate Check**: Compare with existing alerts
4. **Confidence Scoring**: Determine approval status
5. **Database Save**: Store with appropriate status

### 3. Approval Logic
```javascript
determineStatus(confidence) {
  if (confidence >= 0.9) return 'approved';    // Auto-approve
  else if (confidence >= 0.7) return 'pending'; // Manual review
  else return 'pending';                        // Manual review
}
```

### 4. Admin Review Process
1. **View Pending**: Check alerts requiring review
2. **Bulk Selection**: Select multiple alerts
3. **Approve/Reject**: Use bulk actions or individual actions
4. **Reason Tracking**: Optional approval reason, required rejection reason

## API Endpoints

### Get Automated Alerts
```http
GET /api/automated-alerts?status=pending&page=1&limit=20&city=Edinburgh
```

**Query Parameters:**
- `status`: `all`, `pending`, `approved`, `rejected`
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `city`: Filter by city
- `category`: Filter by alert category
- `startDate`: Filter by creation date
- `endDate`: Filter by creation date
- `search`: Search in title and description

### Bulk Approve Alerts
```http
POST /api/automated-alerts/bulk-approve
Content-Type: application/json

{
  "alertIds": ["id1", "id2", "id3"],
  "reason": "Optional approval reason"
}
```

### Bulk Reject Alerts
```http
POST /api/automated-alerts/bulk-reject
Content-Type: application/json

{
  "alertIds": ["id1", "id2", "id3"],
  "reason": "Required rejection reason"
}
```

### Get Statistics
```http
GET /api/automated-alerts/stats?startDate=2024-01-01&endDate=2024-12-31
```

### Manual Trigger
```http
POST /api/automated-alerts/trigger-generation?city=edinburgh
```

## Monitoring and Logging

### Log Entries
The system creates detailed logs for:
- `automated_alert_generation_completed`: Generation results
- `bulk_approve_automated_alerts`: Bulk approval actions
- `bulk_reject_automated_alerts`: Bulk rejection actions
- `approve_automated_alert`: Individual approval
- `reject_automated_alert`: Individual rejection
- `manual_trigger_alert_generation`: Manual generation triggers

### Metrics Tracked
- Total alerts generated per city
- Approval/rejection rates
- Duplicate detection accuracy
- Generation success/failure rates
- Processing time per city

## Security Considerations

### Authentication
- All endpoints require authentication
- Admin role verification for management actions
- Audit trail for all operations

### API Key Security
- OpenAI API key stored in environment variables
- No hardcoded credentials
- Secure transmission over HTTPS

### Data Validation
- Input validation on all endpoints
- Sanitization of user inputs
- Type checking for all parameters

## Deployment

### Prerequisites
1. Node.js 18+ installed
2. MongoDB database configured
3. OpenAI API key configured
4. Environment variables set

### Installation Steps
1. Install dependencies: `npm install`
2. Set environment variables
3. Start the server: `npm start`
4. Access admin panel at `/admin/automated-alerts`

### Cron Job Setup
The system automatically schedules the generation job on startup. For production:
- Ensure server timezone is set to Europe/London
- Monitor cron job execution
- Set up alerts for job failures

## Troubleshooting

### Common Issues

#### OpenAI API Errors
- Check API key validity
- Verify account has sufficient credits
- Check rate limits

#### Duplicate Detection Issues
- Review similarity threshold (currently 80%)
- Check for false positives/negatives
- Adjust Jaccard similarity algorithm if needed

#### Generation Failures
- Check server logs for detailed error messages
- Verify city configurations
- Ensure database connectivity

### Performance Optimization
- Monitor API response times
- Consider caching for frequently accessed data
- Optimize database queries for large datasets

## Future Enhancements

### Planned Features
- **Machine Learning**: Train custom models for better accuracy
- **Real-time Sources**: Integrate with live data feeds
- **Geographic Expansion**: Add more cities and regions
- **Advanced Analytics**: Detailed performance metrics
- **Webhook Integration**: Notify external systems of new alerts

### Scalability Improvements
- **Queue System**: Use Redis for job queuing
- **Microservices**: Split into separate services
- **Caching Layer**: Implement Redis caching
- **Load Balancing**: Distribute generation across multiple instances

## Support

For technical support or questions about the Automated Alert Generation System:
- Check server logs for detailed error information
- Review this documentation for configuration details
- Contact the development team for advanced troubleshooting 