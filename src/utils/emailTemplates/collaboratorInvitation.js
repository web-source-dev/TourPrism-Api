const { transporter } = require('../emailService.js');

// Send collaborator invitation email
const sendCollaboratorInvitation = async (email, ownerFirstName, ownerLastName, inviteUrl, role, collaboratorName) => {
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
  
  module.exports = sendCollaboratorInvitation;