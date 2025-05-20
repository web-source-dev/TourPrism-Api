import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Make sure the uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../uploads/summaries');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Generate a PDF from HTML content
 * @param {string} html - HTML content to convert to PDF
 * @param {string} filename - Name for the PDF file (without extension)
 * @returns {string} URL path to the generated PDF
 */
export const generatePdf = async (html, filename) => {
  let browser = null;
  try {
    // Ensure we have valid HTML content
    if (!html || typeof html !== 'string') {
      console.warn('Invalid HTML content provided for PDF generation. Using fallback.');
      html = generateFallbackHTML(filename || 'No Data Available');
    }
    
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: 'new' // Use new headless mode
    });
    
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });
    
    // Add custom styling for PDF
    await page.addStyleTag({
      content: `
        body { 
          font-family: 'Arial', sans-serif;
          margin: 20px; 
          line-height: 1.5;
        }
        .alert-item {
          border-left: 4px solid #f0ad4e;
          padding-left: 15px;
          margin-bottom: 20px;
        }
        .alert-title {
          font-weight: bold;
          color: #333;
          font-size: 16px;
        }
        .alert-location {
          color: #666;
          font-size: 14px;
        }
        .alert-description {
          margin-top: 5px;
          font-size: 14px;
        }
        .summary-header {
          text-align: center;
          margin-bottom: 30px;
        }
        .summary-footer {
          margin-top: 30px;
          text-align: center;
          color: #999;
          font-size: 12px;
        }
        .regions-section {
          margin: 20px 0;
          padding: 15px;
          background-color: #f8f9fa;
          border-radius: 4px;
        }
        .regions-section h3 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 14px;
        }
        .regions-section ul {
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .regions-section li {
          margin: 5px 0;
          color: #666;
          font-size: 13px;
        }
        .no-alerts-message {
          text-align: center;
          margin: 50px 0;
          padding: 30px;
          background-color: #f9f9f9;
          border-radius: 8px;
        }
        .no-alerts-message h2 {
          color: #666;
          margin-bottom: 15px;
        }
        .no-alerts-message p {
          color: #888;
          font-size: 16px;
          margin-bottom: 10px;
        }
      `
    });
    
    // Ensure filename is safe for file system
    const safeFilename = (filename || 'alert-summary').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = Date.now();
    const fullFilename = `${safeFilename}_${timestamp}.pdf`;
    const outputPath = path.join(UPLOADS_DIR, fullFilename);
    
    // Generate PDF
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    // Return the relative path to be stored in the database
    return `/uploads/summaries/${fullFilename}`;
  } catch (error) {
    console.error('Error generating PDF:', error);
    
    // Create a fallback PDF with error information
    try {
      if (!browser) {
        browser = await puppeteer.launch({
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          headless: 'new'
        });
      }
      
      const fallbackHtml = generateFallbackHTML(filename || 'Alert Summary', 'We encountered an issue generating your report.');
      const page = await browser.newPage();
      await page.setContent(fallbackHtml);
      
      // Ensure filename is safe for file system
      const safeFilename = 'fallback_' + (filename || 'alert-summary').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const timestamp = Date.now();
      const fullFilename = `${safeFilename}_${timestamp}.pdf`;
      const outputPath = path.join(UPLOADS_DIR, fullFilename);
      
      await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });
      
      return `/uploads/summaries/${fullFilename}`;
    } catch (fallbackError) {
      console.error('Error generating fallback PDF:', fallbackError);
      return null; // Return null if we can't even generate a fallback
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (error) {
          console.error('Error closing browser:', error);
        }
      }
    }
  }
};

/**
 * Generate fallback HTML for when no data is available or an error occurs
 * @param {string} title - The title to display in the fallback document
 * @param {string} message - Optional custom message (defaults to no data message)
 * @returns {string} HTML content
 */
const generateFallbackHTML = (title, message) => {
  // Determine if this is a technical error or just no data
  const isError = message && message.toLowerCase().includes('issue') || message && message.toLowerCase().includes('error');
  
  return `
    <div class="summary-container">
      <div class="summary-header">
        <h1>${title || 'Alert Summary'}</h1>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
      </div>
      
      <div class="no-alerts-message" style="${isError ? 'border-left: 4px solid #f44336;' : 'border-left: 4px solid #2196f3;'}">
        <h2>${message || 'No Alerts Available'}</h2>
        ${!isError ? `
        <p>There are currently no disruptions reported for the selected criteria.</p>
        <p>This could mean:</p>
        <ul>
          <li>No significant disruptions are expected in your selected regions</li>
          <li>Any minor issues don't meet your alert criteria</li>
          <li>New alerts may be added as they are reported</li>
        </ul>
        <p style="margin-top: 20px;">Please check back later for updated information or modify your search criteria.</p>
        ` : `
        <p>We encountered a temporary issue while generating your report.</p>
        <p>Please try again in a few moments. If the problem persists, contact support.</p>
        `}
      </div>
      
      <div class="summary-footer">
        <p>Generated by TourPrism on ${new Date().toLocaleDateString()}</p>
        <p>Check back later for updated information.</p>
      </div>
    </div>
  `;
};

/**
 * Generate summary content from alerts
 * @param {Array} alerts - Array of alert objects
 * @param {Object} options - Summary options (title, dates, etc.)
 * @returns {string} HTML content for the summary
 */
export const generateSummaryHTML = (alerts, options) => {
  const { title, startDate, endDate, location, userRegions } = options;
  
  // If there are no alerts, generate a "no data" message
  if (!alerts || alerts.length === 0) {
    return generateFallbackHTML(
      title || 'Alert Summary', 
      `No Alerts Found for ${location || 'Selected Location'}`
    );
  }
  
  // Format dates
  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };
  
  // Group alerts by category/type
  const groupedAlerts = {};
  alerts.forEach(alert => {
    const category = alert.alertCategory || 'Uncategorized';
    if (!groupedAlerts[category]) {
      groupedAlerts[category] = [];
    }
    groupedAlerts[category].push(alert);
  });
  
  // Create HTML
  let html = `
    <div class="summary-container">
      <div class="summary-header">
        <h1>${title || 'Alert Summary'}</h1>
        <p>
          ${startDate ? `From: ${formatDate(startDate)}` : ''}
          ${endDate ? ` - To: ${formatDate(endDate)}` : ''}
        </p>
        ${location ? `<p>Location: ${location}</p>` : ''}
        ${userRegions && userRegions.length > 0 ? `
          <div class="regions-section">
            <h3>Monitoring Regions:</h3>
            <ul>
              ${userRegions.map(region => `
                <li>${region.name}${region.latitude && region.longitude ? ` (${region.latitude.toFixed(4)}, ${region.longitude.toFixed(4)})` : ''}</li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        <p>Total Alerts: ${alerts.length}</p>
      </div>
      
      <div class="summary-content">
  `;
  
  // Add alerts by category
  Object.keys(groupedAlerts).forEach(category => {
    html += `<h2>${category}</h2>`;
    
    groupedAlerts[category].forEach(alert => {
      html += `
        <div class="alert-item">
          <div class="alert-title">${alert.title || 'Untitled Alert'}</div>
          <div class="alert-location">
            ${alert.originCity || alert.city || ''} 
            ${alert.originCountry || ''}
          </div>
          <div class="alert-meta">
            Impact: ${alert.impact || 'Unknown'} | 
            Type: ${alert.alertType || 'N/A'} | 
            ${alert.expectedStart ? `Expected: ${formatDate(alert.expectedStart)}` : ''}
          </div>
          <div class="alert-description">${alert.description || 'No description available'}</div>
        </div>
      `;
    });
  });
  
  html += `
      </div>
      <div class="summary-footer">
        <p>Generated by TourPrism on ${new Date().toLocaleDateString()}</p>
        ${userRegions && userRegions.length > 0 ? `
          <p>This forecast is customized for your operating regions.</p>
        ` : ''}
      </div>
    </div>
  `;
  
  return html;
};
