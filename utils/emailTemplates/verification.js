const { transporter } = require('../emailService.js');

// Send verification email
const sendVerificationEmail = async (email, otp) => {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || "no-reply@tourprism.com",
      to: email,
      subject: 'Email Verification - Tourprism',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Verification</h2>
          <p>Thank you for registering with Tourprism. Please use the following OTP to verify your email address:</p>
          <h1 style="font-size: 36px; letter-spacing: 5px; text-align: center; color: #4CAF50;">${otp}</h1>
          <p>This OTP will expire in 5 minutes.</p>
          <p>If you didn't request this verification, please ignore this email.</p>
        </div>
      `,
      emailType: 'verification'
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Verification email sent successfully to ${email}`);
      return true;
    } catch (error) {
      console.error('Error sending verification email:', error);
      // Log more details for debugging
      if (error.response) {
        console.error('Brevo API Error Response:', JSON.stringify(error.response.body, null, 2));
      }
      throw error; // Re-throw to allow caller to handle
    }
  };

  module.exports = sendVerificationEmail;