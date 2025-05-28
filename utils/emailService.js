import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Create a transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Generate a 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send verification email
export const sendVerificationEmail = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Email Verification - TourPrism',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Email Verification</h2>
        <p>Thank you for registering with TourPrism. Please use the following OTP to verify your email address:</p>
        <h1 style="font-size: 36px; letter-spacing: 5px; text-align: center; color: #4CAF50;">${otp}</h1>
        <p>This OTP will expire in 5 minutes.</p>
        <p>If you didn't request this verification, please ignore this email.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    return false;
  }
};

// Send password reset email
export const sendPasswordResetEmail = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset Request - TourPrism',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your password. Please use the following OTP to proceed with the password reset:</p>
        <h1 style="font-size: 36px; letter-spacing: 5px; text-align: center; color: #4CAF50;">${otp}</h1>
        <p>This OTP will expire in 5 minutes.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
};

// Send collaborator invitation email
export const sendCollaboratorInvitation = async (email, ownerFirstName, ownerLastName, inviteUrl, role, collaboratorName) => {
  const ownerName = `${ownerFirstName || ''} ${ownerLastName || ''}`.trim() || 'The account owner';
  const roleDescription = role === 'manager' ? 
    'This gives you the ability to view data and make changes to the account.' : 
    'This gives you the ability to view data in the account.';
  
  // Create a personalized greeting if a name was provided
  const greeting = collaboratorName ? `Hello ${collaboratorName},` : 'Hello,';
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `${ownerName} has invited you to collaborate on TourPrism`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Invitation to Collaborate</h2>
        <p>${greeting}</p>
        <p>${ownerName} has invited you to collaborate on their TourPrism account as a <strong>${role}</strong>.</p>
        <p>${roleDescription}</p>
        <p>To accept this invitation, please click the button below to set up your password and access the account:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Accept Invitation</a>
        </div>
        <p>Or copy and paste this URL into your browser:</p>
        <p style="word-break: break-all; font-size: 12px; color: #666;">${inviteUrl}</p>
        <p>This invitation link will expire in 7 days.</p>
        <p>If you didn't expect this invitation or don't want to join, you can safely ignore this email.</p>
        <p>Thank you,<br>The TourPrism Team</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending collaborator invitation email:', error);
    return false;
  }
};

// Send alert notification to guests
export const sendAlertNotificationToGuest = async (email, name, alertTitle, message, alertDetails) => {
  const greeting = name ? `Hello ${name},` : 'Hello,';
  
  // Get alert details from the alertDetails object if it's available and not just a string
  const alert = typeof alertDetails === 'object' ? alertDetails : { description: alertDetails };
  
  // Get the correct description
  const description = alert.description || 'No description available';
  
  // Format dates if available
  const startDate = alert.expectedStart ? new Date(alert.expectedStart).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }) : 'Not specified';
  
  const endDate = alert.expectedEnd ? new Date(alert.expectedEnd).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }) : 'Not specified';
  
  // Map status values to display strings
  let statusDisplay = 'New';
  let statusColor = '#2196f3'; // Blue for new
  
  if (alert.status) {
    switch(alert.status) {
      case 'in_progress':
        statusDisplay = 'In Progress';
        statusColor = '#ff9800'; // Orange
        break;
      case 'handled':
        statusDisplay = 'Handled';
        statusColor = '#4caf50'; // Green
        break;
      default:
        statusDisplay = 'New';
        statusColor = '#2196f3'; // Blue
    }
  }
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `${alertTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <p>${greeting}</p>
        <p>You are receiving this notification regarding an important alert:</p>
        
        <!-- Alert Card styled to match the image -->
        <div style="border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden; margin: 25px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <!-- Status header -->
          <div style="padding: 12px 20px; display: flex; justify-content: space-between; background-color: #fff;">
            <span style="color: #888; font-size: 14px;">${alert.createdAt ? new Date(alert.createdAt).toLocaleString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true}) : '3:00PM'}</span>
            <span style="background-color: ${statusColor}; color: white; padding: 2px 12px; border-radius: 12px; font-size: 12px; font-weight: 500;">${statusDisplay}</span>
          </div>
          
          <!-- Title and description -->
          <div style="padding: 15px 20px; background-color: #fff;">
            <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 18px; color: #222; font-weight: bold;">${alertTitle}</h3>
            <p style="color: #666; margin-bottom: 20px; line-height: 1.5;">${description}</p>
            
            <!-- Alert details in table format -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; width: 35%;">Location</td>
                <td style="padding: 8px 0; color: #666;">${alert.city || 'Not specified'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Start Date</td>
                <td style="padding: 8px 0; color: #666;">${startDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">End Date</td>
                <td style="padding: 8px 0; color: #666;">${endDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Impact Level</td>
                <td style="padding: 8px 0; color: #666;">${alert.impact || 'Not specified'}</td>
              </tr>
            </table>
            
            <!-- Instructions section -->
            <div style="margin-top: 25px; border-top: 1px solid #eaeaea; padding-top: 15px;">
              <h4 style="margin-top: 0; font-size: 15px; color: #222;">Additional Instructions</h4>
              <p style="line-height: 1.5;">${message}</p>
            </div>
          </div>
        </div>
        
        <p>This information is provided to help you plan accordingly.</p>
        <p>Thank you,<br>The TourPrism Team</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending alert notification to guest:', error);
    return false;
  }
};

// Send alert notification to team members
export const sendAlertNotificationToTeam = async (email, name, role, alertTitle, message, alertDetails, actionHubLink) => {
  const greeting = name ? `Hello ${name},` : 'Hello,';
  const roleText = role === 'manager' ? 'As a manager' : 'As a team member';
  
  // Get alert details from the alertDetails object if it's available and not just a string
  const alert = typeof alertDetails === 'object' ? alertDetails : { description: alertDetails };
  
  // Get the correct description
  const description = alert.description || 'No description available';
  
  // Format dates if available
  const startDate = alert.expectedStart ? new Date(alert.expectedStart).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }) : 'Not specified';
  
  const endDate = alert.expectedEnd ? new Date(alert.expectedEnd).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }) : 'Not specified';
  
  // Map status values to display strings
  let statusDisplay = 'New';
  let statusColor = '#2196f3'; // Blue for new
  
  if (alert.status) {
    switch(alert.status) {
      case 'in_progress':
        statusDisplay = 'In Progress';
        statusColor = '#ff9800'; // Orange
        break;
      case 'handled':
        statusDisplay = 'Handled';
        statusColor = '#4caf50'; // Green
        break;
      default:
        statusDisplay = 'New';
        statusColor = '#2196f3'; // Blue
    }
  }
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `${alertTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <p>${greeting}</p>
        <p>${roleText}, you are receiving this notification about an important alert that needs your attention:</p>
        
        <!-- Alert Card styled to match the image -->
        <div style="border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden; margin: 25px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <!-- Status header -->
          <div style="padding: 12px 20px; display: flex; justify-content: space-between; background-color: #fff;">
            <span style="color: #888; font-size: 14px;">${alert.createdAt ? new Date(alert.createdAt).toLocaleString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true}) : '3:00PM'}</span>
            <span style="background-color: ${statusColor}; color: white; padding: 2px 12px; border-radius: 12px; font-size: 12px; font-weight: 500;">${statusDisplay}</span>
          </div>
          
          <!-- Title and description -->
          <div style="padding: 15px 20px; background-color: #fff;">
            <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 18px; color: #222; font-weight: bold;">${alertTitle}</h3>
            <p style="color: #666; margin-bottom: 20px; line-height: 1.5;">${description}</p>
            
            <!-- Alert details in table format -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; width: 35%;">Location</td>
                <td style="padding: 8px 0; color: #666;">${alert.city || 'Not specified'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Start Date</td>
                <td style="padding: 8px 0; color: #666;">${startDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">End Date</td>
                <td style="padding: 8px 0; color: #666;">${endDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Impact Level</td>
                <td style="padding: 8px 0; color: #666;">${alert.impact || 'Not specified'}</td>
              </tr>
            </table>
            
            <!-- Instructions section -->
            <div style="margin-top: 25px; border-top: 1px solid #eaeaea; padding-top: 15px;">
              <h4 style="margin-top: 0; font-size: 15px; color: #222;">Action Required</h4>
              <p style="line-height: 1.5;">${message}</p>
            </div>
          </div>
        </div>
        
        ${actionHubLink ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${actionHubLink}" style="background-color: #000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; text-transform: uppercase;">Manage Alert</a>
        </div>
        ` : ''}
        
        <p>Please take appropriate action as required.</p>
        <p>Thank you,<br>The TourPrism Team</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending alert notification to team member:', error);
    return false;
  }
};

export default {
  generateOTP,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendCollaboratorInvitation,
  sendAlertNotificationToGuest,
  sendAlertNotificationToTeam
};