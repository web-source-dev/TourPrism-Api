const { transporter } = require('../emailService.js');

// Send verification email
const sendVerificationEmail = async (email, otp) => {
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

  module.exports = sendVerificationEmail;