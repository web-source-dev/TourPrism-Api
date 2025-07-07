import SibApiV3Sdk from 'sib-api-v3-sdk';
import dotenv from 'dotenv';
dotenv.config();
import sendVerificationEmail from './emailTemplates/verification.js';
import sendCollaboratorInvitation from './emailTemplates/collaboratorInvitation.js';
import sendAlertNotificationToGuest from './emailTemplates/alertNotification-guests.js';
import sendAlertNotificationToTeam from './emailTemplates/alertNotification-team.js';
import generateWeeklyDigestEmail from './emailTemplates/weeklyDigest.js';

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
    return await apiInstance.sendTransacEmail(sendSmtpEmail);
  } catch (error) {
    console.error('Error sending email with Brevo:', error);
    throw error;
  }
};

// Expose the sendMail function as "transporter.sendMail" to maintain compatibility
const transporter = {
  sendMail
};

// Generate a 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export { transporter };

export default {
  transporter,
  generateOTP,
  sendVerificationEmail,
  sendCollaboratorInvitation,
  sendAlertNotificationToGuest,
  sendAlertNotificationToTeam,
  generateWeeklyDigestEmail
};