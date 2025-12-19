const SibApiV3Sdk = require('sib-api-v3-sdk');
const dotenv = require('dotenv');
dotenv.config();
const Logger = require('./logger.js');
const sendVerificationEmail = require('./emailTemplates/verification.js');
const sendCollaboratorInvitation = require('./emailTemplates/collaboratorInvitation.js');
const sendAlertNotificationToGuest = require('./emailTemplates/alertNotification-guests.js');
const sendAlertNotificationToTeam = require('./emailTemplates/alertNotification-team.js');
const generateWeeklyDigestEmail = require('./emailTemplates/weeklyDigest.js');

// Initialize Brevo API client
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
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

  try {
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
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
    console.error('Error sending email with Brevo:', error);
    
    // Log failed email send
    await Logger.logSystem('email_send_failed', {
      to: mailOptions.to,
      from: mailOptions.from,
      subject: mailOptions.subject,
      error: error.message,
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
  generateOTP,
  sendVerificationEmail,
  sendCollaboratorInvitation,
  sendAlertNotificationToGuest,
  sendAlertNotificationToTeam,
  generateWeeklyDigestEmail
};