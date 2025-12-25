# Alert Processing System Documentation

## Overview

The Tourprism alert processing system automatically generates, processes, and manages disruption alerts for hotels in Edinburgh and London. The system uses AI (Grok) and news APIs (NewsData) to identify potential disruptions that could impact guest arrivals and check-ins.

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Scheduler     │    │  Data Sources   │    │ Alert Processor │
│                 │    │                 │    │                 │
│ • Cron Jobs     │────│ • Grok AI       │────│ • Clustering    │
│ • Manual Trigger│    │ • NewsData API  │    │ • Scoring       │
│ • Status Monitor│    │ • Manual Input  │    │ • Validation    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
┌─────────────────┐    ┌─────────────────┐             │
│ Impact Calculator│    │   Database      │             │
│                 │    │                 │             │
│ • Revenue Impact │    │ • Alert Storage │             │
│ • Recovery Rates│    │ • User Data     │◄────────────┘
│ • UI Text Gen   │    │ • Audit Logs    │
└─────────────────┘    └─────────────────┘
```

## 📅 Scheduled Processing

### Weekly Schedule
- **Monday 8 AM BST**: Full fetch (Grok + NewsData + Manual)
- **Thursday 8 AM BST**: NewsData only (NewsData + Manual)

### Manual Triggers
```javascript
// Full processing
await alertScheduler.triggerManualFetch('full');

// NewsData only
await alertScheduler.triggerManualFetch('newsdata');
```

## 🤖 Data Sources

### 1. Grok AI Generation
**Purpose**: Generate predicted disruptions using artificial intelligence
**Frequency**: Weekly (Mondays only)
**Process**:

1. **Step-by-Step Generation**: Generates disruptions one by one to avoid duplicates
2. **Duplicate Prevention**: Checks existing alert titles before generating new ones
3. **City-Specific**: Generates separate disruptions for Edinburgh and London
4. **Validation**: Ensures all generated disruptions meet format requirements

**Grok Prompt Structure**:
```javascript
{
  city: "Edinburgh",
  main_type: "strike", // From predefined categories
  sub_type: "airline_pilot",
  title: "Ryanair Rome-Edinburgh pilot strike",
  start_date: "2025-12-25",
  end_date: "2025-12-26",
  source: "Reuters",
  url: "https://www.reuters.com/...",
  summary: "Detailed description of the disruption"
}
```

**Categories**:
- **Main Types**: strike, weather, protest, flight_issues, staff_shortage, supply_chain, system_failure, policy, economy, other
- **Sub Types**: Specific subcategories for each main type (e.g., airline_pilot, rail, ferry, snow, flood, etc.)

### 2. NewsData API
**Purpose**: Fetch real-time news articles about current disruptions
**Frequency**: Weekly (Mondays and Thursdays)
**Features**:
- Comprehensive keyword search for disruption terms
- Source credibility assessment
- Article transformation to disruption format
- Geographic filtering (UK, Europe focus)

### 3. Manual Input
**Purpose**: Allow administrators to add custom alerts
**Status**: Placeholder for future implementation

## ⚙️ Alert Processing Pipeline

### Phase 1: Data Collection
```
Grok API ──┐
           ├──► Disruption Array ──► Clustering
NewsData ──┘
```

### Phase 2: Clustering
**Algorithm**: Similarity-based clustering
**Process**:
1. Compare new disruptions against existing ones
2. Group similar disruptions by:
   - Same city
   - Same main type (strike, weather, etc.)
   - Similar titles (60% text similarity threshold)

### Phase 3: Alert Creation/Update
**Logic**:
```javascript
if (existingAlert) {
  updateAlert(existingAlert, cluster)
} else {
  createNewAlert(cluster)
}
```

**New Alert Creation**:
1. Calculate confidence score from sources
2. Generate required fields (sectors, recovery time, etc.)
3. Set status based on confidence threshold
4. Generate LLM content if confidence ≥ 0.6

## 🎯 Confidence Scoring System

### Source Credibility Weights
| Source Type | 1 Source | 2 Sources | 2+ Sources |
|-------------|----------|-----------|------------|
| Official    | 0.8      | 0.9       | 1.0        |
| Major News  | 0.7      | 0.8       | 0.9        |
| Other News  | 0.5      | 0.6       | 0.7        |
| Social      | 0.3      | 0.3       | 0.4        |

### Publishing Thresholds
- **HOLD** (pending): < 0.6 confidence
- **APPROVE** (active): ≥ 0.6 confidence

### Example Calculation
```
3 Major News sources + 1 Official source:
(0.9 + 0.8 + 0.8 + 0.9) / 4 = 0.85 confidence → APPROVED
```

## 📊 Impact Calculation

### Base Recovery Rates
| Disruption Type | Recovery Rate | Description |
|----------------|----------------|-------------|
| Strike        | 70%           | Industrial actions |
| Weather       | 60%           | Natural events |
| Protest       | 65%           | Civil unrest |
| Flight Issues | 55%           | Aviation problems |
| Staff Shortage| 50%           | Labor issues |
| Supply Chain  | 45%           | Logistics problems |
| System Failure| 40%           | Technical issues |
| Policy        | 35%           | Regulatory changes |
| Economy       | 30%           | Economic factors |
| Other         | 55%           | General disruptions |

### Hotel Size Configurations
```javascript
micro:   { rooms: 8,  occupancy: 0.60 }
small:   { rooms: 35, occupancy: 0.65 }
medium:  { rooms: 80, occupancy: 0.70 }
```

### Impact Formula
```
Nights at Risk = round(rooms × occupancy × disruption_percent)
Pounds at Risk = nights_at_risk × avg_room_rate
```

### Recovery with Incentives
```
Base Recovery + Incentive Bonus + Additional Bonuses
Example: 70% + 5% + 5% = 80% recovery rate
```

## 🎨 LLM Content Generation

### Tone Analysis
**Purpose**: Determine alert severity level
**Prompt**: "Say ONE word: Early, Developing, or Confirmed"
**Logic**: Compares event title against source descriptions

### Header Generation
**Purpose**: Create compelling alert titles
**Format**: "[Event] could empty X rooms [when] impacting £Y"
**Example**: "Ryanair strike could empty 25 rooms this weekend impacting £8,750"

## 📱 UI Components Generated

Alerts are displayed with essential information including:
- Alert title and summary
- Confidence level and source credibility
- Impact estimates (rooms and revenue at risk)
- Recovery expectations
- Affected sectors

## 🔄 Status Management

### Alert Statuses
- **pending**: Below confidence threshold
- **approved**: Meets confidence requirements
- **expired**: End date has passed

### Lifecycle
```
Detection → Clustering → Scoring → LLM Generation → Publishing → Archiving
```

## 🗂️ Data Management

### Database Collections
- **Alerts**: Main alert storage with full details
- **Users**: Hotel user accounts and preferences
- **Logs**: Audit trail of all operations

### Archival Process
- Automatically archives alerts >30 days old
- Sets status to "archived"
- Preserves data for historical reference

## 🚨 Error Handling

### Service Failures
- Individual service failures don't stop the pipeline
- Returns empty arrays instead of crashing
- Detailed logging for troubleshooting

### Validation Layers
1. **API Response Validation**: Ensures proper JSON structure
2. **Field Validation**: Checks required fields present
3. **Business Logic**: Validates disruption relevance
4. **Duplicate Prevention**: Avoids duplicate alerts

## 📈 Monitoring & Analytics

### Key Metrics
- Alerts generated per week
- Confidence score distribution
- Source credibility breakdown
- Processing success rates

### Status Endpoints
```javascript
GET /api/admin/status
// Returns scheduler status, recent activity, error counts
```

## 🔧 Configuration

### Environment Variables
```env
# APIs
GROK_API_KEY=your_grok_key
NEWSDATA_API_KEY=your_newsdata_key

# Database
MONGO_URI=mongodb://localhost:27017/tourprism

# Processing
CONFIDENCE_THRESHOLD=0.6
MAX_DISRUPTIONS_PER_CITY=5
```

### Constants
- Disruption categories and subtypes
- Confidence scoring weights
- Recovery rates by type
- Hotel size configurations

## 🧪 Testing

### Manual Testing
```javascript
// Test single city generation
const disruptions = await grokService.generateDisruptions('Edinburgh');

// Test full pipeline
await alertScheduler.triggerManualFetch('full');
```

### Validation Checks
- JSON structure validation
- Date format verification
- URL accessibility checks
- Duplicate detection accuracy

## 🚀 Future Enhancements

### Planned Features
- Manual alert input interface
- Alert priority scoring
- Geographic expansion beyond UK
- Real-time news monitoring
- Machine learning for better predictions

### Performance Optimizations
- API response caching
- Parallel processing improvements
- Database query optimization
- Memory usage optimization

---

**Last Updated**: December 2025
**Version**: 2.0
**System Status**: Active
