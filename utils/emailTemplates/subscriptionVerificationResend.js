const { transporter } = require('../emailService.js');

// Send subscription verification resend email
const sendSubscriptionVerificationResendEmail = async (email, otp) => {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || "no-reply@tourprism.com",
      to: email,
      subject: 'New Verification Code - TourPrism Disruption Alerts',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">TourPrism</h1>
            <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Disruption Intelligence for Hotels</p>
          </div>
          <div style="background: white; padding: 40px 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px;">New Verification Code</h2>
            <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
              Here is your new verification code for TourPrism disruption alerts:
            </p>
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; border: 2px dashed #667eea;">
              <span style="font-size: 32px; font-weight: bold; color: #333; letter-spacing: 4px; font-family: monospace;">${otp}</span>
            </div>
            <p style="color: #666; font-size: 14px; margin-bottom: 30px;">
              This code will expire in 10 minutes. Enter it on the subscription page to complete your registration.
            </p>
            <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                Having trouble? Contact our support team for assistance.
              </p>
            </div>
          </div>
        </div>
      `,
      emailType: 'subscription_verification_resend'
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Subscription verification resend email sent successfully to ${email}`);
      return true;
    } catch (error) {
      console.error('Error sending subscription verification resend email:', error);
      // Log more details for debugging
      if (error.response) {
        console.error('Brevo API Error Response:', JSON.stringify(error.response.body, null, 2));
      }
      throw error; // Re-throw to allow caller to handle
    }
  };

module.exports = sendSubscriptionVerificationResendEmail;
