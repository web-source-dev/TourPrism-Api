# Backend Configuration & Services

This directory contains all the backend services and configurations for the Tourprism alert system.

## 📁 File Structure

```
config/
├── db.js                 # MongoDB connection
├── grok.js              # Grok API integration
├── newsdata.js          # NewsData.io integration
├── impactCalculator.js  # Impact calculation engine
├── alertProcessor.js    # Alert processing & scoring
├── scheduler.js         # Automated fetching scheduler
├── index.js            # Service exports & initialization
└── README.md           # This file
```

## 🔧 Services Overview

### 1. Database (`db.js`)
- MongoDB connection management
- Environment: `MONGO_URI` or `MONGODB_URI`

### 2. Grok Service (`grok.js`)
- **Purpose**: Generate disruption predictions using Grok AI
- **API**: x.ai Grok API
- **Schedule**: Mondays only (8 AM BST)
- **Environment**: `GROK_API_KEY`, `GROK_BASE_URL`
- **Features**:
  - Disruption generation for Edinburgh/London
  - Tone analysis (Early/Developing/Confirmed)
  - Header generation for alerts

### 3. NewsData Service (`newsdata.js`)
- **Purpose**: Fetch real-time news about disruptions
- **API**: NewsData.io API
- **Schedule**: Monday & Thursday (8 AM BST)
- **Environment**: `NEWSDATA_API_KEY`
- **Features**:
  - Comprehensive keyword search
  - Source credibility assessment
  - Article transformation to disruption format

### 4. Impact Calculator (`impactCalculator.js`)
- **Purpose**: Calculate rooms/revenue impact for hotels
- **Inputs**: Hotel size, occupancy, disruption type
- **Features**:
  - Nights at risk calculation
  - Recovery rate with incentives
  - UI text generation

### 5. Alert Processor (`alertProcessor.js`)
- **Purpose**: Process and score alert data
- **Features**:
  - Progressive confidence scoring
  - Alert clustering and deduplication
  - LLM content generation
  - Status management (pending/active/archived)

### 6. Scheduler (`scheduler.js`)
- **Purpose**: Automated alert fetching system
- **Schedule**:
  - **Monday 8 AM BST**: Grok + NewsData + Manual
  - **Thursday 8 AM BST**: NewsData + Manual
- **Timezone**: Europe/London (BST)
- **Features**:
  - Cron job management
  - Manual trigger support
  - Status monitoring

## 🚀 Setup Instructions

### 1. Environment Variables

Create a `.env` file in the backend root:

```env
# Database
MONGO_URI=mongodb://localhost:27017/tourprism
MONGODB_URI=mongodb://localhost:27017/tourprism

# APIs
GROK_API_KEY=your_grok_api_key_here
GROK_BASE_URL=https://api.x.ai/v1
NEWSDATA_API_KEY=your_newsdata_api_key_here

# Server Configuration
NODE_ENV=development
PORT=5000

# Local HTTPS Development (for subdomain support)
# When USE_HTTPS=true, the app will use .vos.local domain for subdomains
# Frontend: https://vos.local/
# Backend: https://api.vos.local:5000/
USE_HTTPS=false
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5000

# Production URLs (when NODE_ENV=production)
# Frontend: https://tourprism.com/
# Backend: https://tourprism.onrender.com/
```

### 2. Dependencies

Required packages (already in package.json):
- `axios` - HTTP requests
- `node-cron` - Scheduled tasks
- `mongoose` - MongoDB ODM

### 3. Initialization

Run the service initialization:

```bash
# Development
npm run dev

# Production
npm start

# Or run initializer directly
node scripts/initializeServices.js
```

### 4. Local HTTPS Setup (Optional)

For local development with subdomain support similar to production:

1. **Install mkcert** for local SSL certificates:
   ```bash
   # Windows (using Chocolatey)
   choco install mkcert

   # Or download from: https://github.com/FiloSottile/mkcert/releases
   ```

2. **Generate certificates**:
   ```bash
   ```bash
   # Create local CA
   mkcert -install

   # Generate certificate for *.vos.local
   mkcert "*.vos.local"
   ```

3. **Configure hosts file** (`C:\Windows\System32\drivers\etc\hosts`):
   ```
   127.0.0.1 vos.local
   127.0.0.1 api.vos.local
   ```

4. **Environment setup**:
   ```env
   NODE_ENV=development
   USE_HTTPS=true
   PORT=5000
   ```

5. **Run with HTTPS**:
   ```bash
   NODE_ENV=development USE_HTTPS=true npm run dev
   ```

6. **Frontend setup**: Configure your frontend to run on `https://vos.local/` and connect to `https://api.vos.local:5000/`

## 📊 Data Flow

### Monday 8 AM (Full Fetch)
1. **Grok API** → Generate predicted disruptions
2. **NewsData API** → Fetch current news
3. **Manual Input** → Add manual alerts
4. **Alert Processor** → Cluster, score, and publish
5. **LLM** → Generate tone and headers (if confidence ≥0.6)

### Thursday 8 AM (News Only)
1. **NewsData API** → Fetch current news
2. **Manual Input** → Add manual alerts
3. **Alert Processor** → Update existing alerts
4. **LLM** → Generate content only if confidence changed

## 🎯 Confidence Scoring

| Source Type | 1 Source | 2 Sources | 2+ Sources |
|-------------|----------|-----------|------------|
| Official    | 0.8      | 0.9       | 1.0        |
| Major News  | 0.7      | 0.8       | 0.9        |
| Other News  | 0.5      | 0.6       | 0.7        |
| Social      | 0.3      | 0.3       | 0.4        |

**Threshold**: ≥0.6 for publishing

## 🏨 Impact Calculation

### Base Recovery Rates
- Strike: 70%
- Weather: 60%
- Protest: 65%
- Flight: 55%
- Other: 55%

### Incentive Bonus
- Basic incentive: +5%
- Additional incentives: +5% each

### Hotel Occupancy (default)
- Micro: 60%
- Small: 65%
- Medium: 70%

## 🔧 Manual Operations

### Trigger Manual Fetch
```javascript
import { alertScheduler } from './config';

// Full fetch (Grok + NewsData)
await alertScheduler.triggerManualFetch('full');

// NewsData only
await alertScheduler.triggerManualFetch('newsdata');
```

### Add Manual Alert
```javascript
import { alertScheduler } from './config';

await alertScheduler.addManualDisruption({
  city: 'Edinburgh',
  main_type: 'strike',
  sub_type: 'airline pilot',
  title: 'Ryanair pilot strike',
  start_date: '2025-01-15',
  end_date: '2025-01-16',
  source: 'Manual Entry',
  url: 'https://example.com',
  summary: 'Manual alert for testing'
});
```

## 📈 Monitoring

### Check Scheduler Status
```javascript
import { alertScheduler } from './config';

const status = alertScheduler.getStatus();
console.log(status);
// {
//   isRunning: false,
//   jobsScheduled: 2,
//   lastGrokRun: 2025-01-13T08:00:00.000Z,
//   nextRuns: {
//     monday: '2025-01-20T08:00:00.000Z',
//     thursday: '2025-01-16T08:00:00.000Z'
//   }
// }
```

## 🐛 Troubleshooting

### Common Issues

1. **Grok API Key Missing**
   - Check `GROK_API_KEY` in environment
   - Verify API key is valid

2. **NewsData API Errors**
   - Check `NEWSDATA_API_KEY`
   - Verify account has sufficient credits
   - Check API rate limits

3. **MongoDB Connection Failed**
   - Verify `MONGO_URI` is correct
   - Check MongoDB is running
   - Verify network connectivity

4. **Scheduler Not Running**
   - Check timezone settings
   - Verify cron expressions
   - Check for overlapping jobs

### Logs
- All services log to console with emojis for easy identification
- Errors are prefixed with ❌
- Success messages with ✅
- Warnings with ⚠️

## 🔗 API Documentation

- **NewsData.io**: https://newsdata.io/documentation#latest-news
- **Grok API**: https://docs.x.ai/
- **MongoDB**: https://docs.mongodb.com/

## 📞 Support

For issues with specific services, check the individual service files for detailed error handling and logging.
