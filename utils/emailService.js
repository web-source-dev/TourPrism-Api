const SibApiV3Sdk = require('sib-api-v3-sdk');
const dotenv = require('dotenv');
dotenv.config();
const Logger = require('./logger.js');
// Note: Email template functions are imported where needed to avoid circular dependencies

// Initialize Brevo API client
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

// Validate API key is set
if (!process.env.BREVO_API_KEY) {
  console.error('⚠️  WARNING: BREVO_API_KEY is not set in environment variables. Email sending will fail.');
}

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Create a transporter function using Brevo
const sendMail = async (mailOptions) => {
  const sender = {
    email: mailOptions.from
  };

  const receivers = [
    {
      email: mailOptions.to
    }
  ];

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.sender = sender;
  sendSmtpEmail.to = receivers;
  sendSmtpEmail.subject = mailOptions.subject;
  sendSmtpEmail.htmlContent = mailOptions.html;

  // Check if API key is configured
  if (!process.env.BREVO_API_KEY) {
    const error = new Error('BREVO_API_KEY is not configured. Please set it in your environment variables.');
    console.error('Email sending failed:', error.message);
    throw error;
  }

  try {
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log(`✅ Email sent successfully to ${mailOptions.to} (Message ID: ${result.messageId})`);
    
    // Log successful email send
    await Logger.logSystem('email_sent', {
      to: mailOptions.to,
      from: mailOptions.from,
      subject: mailOptions.subject,
      messageId: result.messageId,
      emailType: mailOptions.emailType || 'general'
    });
    
    return result;
  } catch (error) {
    console.error('❌ Error sending email with Brevo:', error.message);
    
    // Log more detailed error information
    if (error.response) {
      console.error('Brevo API Error Details:', {
        status: error.response.status,
        statusText: error.response.statusText,
        body: error.response.body
      });
    }
    
    // Log failed email send
    await Logger.logSystem('email_send_failed', {
      to: mailOptions.to,
      from: mailOptions.from,
      subject: mailOptions.subject,
      error: error.message,
      errorDetails: error.response?.body,
      emailType: mailOptions.emailType || 'general'
    });
    
    throw error;
  }
};

// Expose the sendMail function as "transporter.sendMail" to maintain compatibility
const transporter = {
  sendMail
};

// Generate a 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = {
  transporter,
  generateOTP
};