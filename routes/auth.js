import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";
import Logs from "../models/Logs.js";
import { generateOTP } from "../utils/emailService.js";
import sendVerificationEmail from "../utils/emailTemplates/verification.js";
import dotenv from "dotenv";
import SibApiV3Sdk from "sib-api-v3-sdk";
dotenv.config();
import Subscriber from "../models/subscribers.js";

const router = express.Router();

// Configure Google Strategy
passport.use(
  new GoogleStrategy( 
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://tourprism.onrender.com/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          user = await User.create({
            googleId: profile.id,
            email: profile.emails[0].value,
          });
          
          // Log new user signup via Google
          await Logs.createLog({
            userId: user._id,
            userEmail: user.email,
            userName: profile.displayName || user.email.split('@')[0],
            action: 'signup',
            details: {
              method: 'google',
              signupCompleted: true
            }
          });
        } else {
          // Log Google login
          await Logs.createLog({
            userId: user._id,
            userEmail: user.email,
            userName: user.firstName && user.lastName ? 
              `${user.firstName} ${user.lastName}` : 
              (user.firstName || user.email.split('@')[0]),
            action: 'login',
            details: {
              method: 'google',
              success: true
            }
          });
        }
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Register Route
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }
    // Check if email is registered with Google
    if (await User.findOne({ email, googleId: { $exists: true } })) {
      return res.status(400).json({ message: "This email is registered with Google. Please continue with Google login." });
    }

    // Check if email exists in subscribers collection
    const subscriber = await Subscriber.findOne({ email });
    let subscriberData = null;
    
    if (subscriber) {
      subscriberData = await subscriber.findOne({ email });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

    // Create user with data from subscriber if available
    const userData = {
      email,
      password: hashedPassword,
      otp,
      otpExpiry,
      otpLastSent: new Date()
    };

    // If subscriber data exists, populate user data from it
    if (subscriberData) {
      // Split name into first and last name
      if (subscriberData.name) {
        const nameParts = subscriberData.name.trim().split(' ');
        if (nameParts.length > 0) {
          userData.firstName = nameParts[0];
          if (nameParts.length > 1) {
            userData.lastName = nameParts.slice(1).join(' ');
          }
        }
      }

      // Set company information
      userData.company = {
        type: subscriberData.sector || '',
        MainOperatingRegions: []
      };

      // Add location data if available
      if (subscriberData.location && subscriberData.location.length > 0) {
        userData.company.MainOperatingRegions = subscriberData.location.map(loc => ({
          name: loc.name || '',
          latitude: loc.latitude || 0,
          longitude: loc.longitude || 0,
          placeId: loc.placeId || ''
        }));
      }
    }

    // Create user with the populated data
    user = await User.create(userData);

    // Send verification email
    await sendVerificationEmail(email, otp);
    
    // Log signup
    await Logs.createLog({
      userId: user._id,
      userEmail: email,
      userName: userData.firstName && userData.lastName ? 
        `${userData.firstName} ${userData.lastName}` : 
        (userData.firstName || email.split('@')[0]),
      action: 'signup',
      details: {
        method: 'email',
        signupCompleted: false,
        awaitingVerification: true
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ 
      message: "Registration successful. Please check your email for verification code.",
      userId: user._id
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Verify Email Route
router.post("/verify-email", async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Email already verified" });
    }

    if (user.otp !== otp || user.otpExpiry < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "24h", // Changed from 1h to 24h
    });
    
    // Log email verification
    await Logs.createLog({
      userId: user._id,
      userEmail: user.email,
      userName: user.firstName && user.lastName ? 
        `${user.firstName} ${user.lastName}` : 
        (user.firstName || user.email.split('@')[0]),
      action: 'email_verified',
      details: {
        method: 'otp',
        signupCompleted: true
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ 
      token, 
      user: { 
        id: user._id, 
        email: user.email,
        isVerified: user.isVerified 
      } 
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Resend OTP Route
router.post("/resend-otp", async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Email already verified" });
    }

    // Check if 1 minute has passed since last OTP
    const lastSent = user.otpLastSent || new Date(0);
    const timeDiff = Date.now() - lastSent.getTime();
    if (timeDiff < 60000) { // 1 minute in milliseconds
      return res.status(400).json({ 
        message: "Please wait before requesting another OTP",
        waitTime: Math.ceil((60000 - timeDiff) / 1000) // remaining seconds
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry
    user.otpLastSent = new Date();
    await user.save();

    // Send new verification email
    await sendVerificationEmail(user.email, otp);

    res.json({ message: "OTP resent successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Resend Reset OTP Route
router.post("/resend-reset-otp", async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if 1 minute has passed since last OTP
    const lastSent = user.otpLastSent || new Date(0);
    const timeDiff = Date.now() - lastSent.getTime();
    if (timeDiff < 60000) { // 1 minute in milliseconds
      return res.status(400).json({ 
        message: "Please wait before requesting another OTP",
        waitTime: Math.ceil((60000 - timeDiff) / 1000) // remaining seconds
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry
    user.otpLastSent = new Date();
    await user.save();

    // Send password reset email using Brevo template
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.templateId = 4; // TourPrism Reset Password template ID
    sendSmtpEmail.sender = { email: process.env.EMAIL_FROM || "no-reply@tourprism.com" };
    sendSmtpEmail.to = [{ email: user.email }];
    sendSmtpEmail.params = { otp: otp };
    
    try {
      const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
      await apiInstance.sendTransacEmail(sendSmtpEmail);
    } catch (emailError) {
      console.error("Error sending reset password email:", emailError);
      // Continue execution even if email fails
    }

    res.json({ message: "Reset OTP resent successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Forgot Password Route
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.googleId) {
      return res.status(400).json({ message: "This email is registered with Google. Please continue with Google login." });
    }

    // Generate OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry
    user.otpLastSent = new Date();
    await user.save();

    // Send password reset email using Brevo template
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.templateId = 4; // TourPrism Reset Password template ID
    sendSmtpEmail.sender = { email: process.env.EMAIL_FROM || "no-reply@tourprism.com" };
    sendSmtpEmail.to = [{ email: user.email }];
    sendSmtpEmail.params = { otp: otp };
    
    try {
      const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
      await apiInstance.sendTransacEmail(sendSmtpEmail);
    } catch (emailError) {
      console.error("Error sending reset password email:", emailError);
      // Continue execution even if email fails
    }
    
    // Log password reset request
    await Logs.createLog({
      userId: user._id,
      userEmail: user.email,
      userName: user.firstName && user.lastName ? 
        `${user.firstName} ${user.lastName}` : 
        (user.firstName || user.email.split('@')[0]),
      action: 'password_reset',
      details: {
        stage: 'requested'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ 
      message: "Password reset OTP sent to your email",
      userId: user._id
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Verify Reset OTP Route
router.post("/verify-reset-otp", async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otp !== otp || user.otpExpiry < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    res.json({ message: "OTP verified successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Reset Password Route
router.post("/reset-password", async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otp !== otp || user.otpExpiry < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();
    
    // Log password reset completion
    await Logs.createLog({
      userId: user._id,
      userEmail: user.email,
      userName: user.firstName && user.lastName ? 
        `${user.firstName} ${user.lastName}` : 
        (user.firstName || user.email.split('@')[0]),
      action: 'password_reset',
      details: {
        stage: 'completed'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    
    if (user) {
      // User found with this email
      if (user.googleId) {
        return res.status(400).json({ message: "This email is registered with Google. Please continue with Google login." });
      }

      // Check if user is restricted or deleted
      if (user.status === 'restricted') {
        // Log failed login attempt due to restriction
        await Logs.createLog({
          userId: user._id,
          userEmail: user.email,
          userName: user.firstName && user.lastName ? 
            `${user.firstName} ${user.lastName}` : 
            (user.firstName || user.email.split('@')[0]),
          action: 'login',
          details: {
            method: 'email',
            success: false,
            reason: 'account_restricted'
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
        
        return res.status(403).json({ message: "Your account has been restricted. Please contact support for assistance." });
      }
      
      if (user.status === 'deleted') {
        // Log failed login attempt due to deletion
        await Logs.createLog({
          userId: user._id,
          userEmail: user.email,
          userName: user.firstName && user.lastName ? 
            `${user.firstName} ${user.lastName}` : 
            (user.firstName || user.email.split('@')[0]),
          action: 'login',
          details: {
            method: 'email',
            success: false,
            reason: 'account_deleted'
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
        
        return res.status(403).json({ message: "Your account has been deleted. Please contact support for assistance." });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        // Check if email is verified
        if (!user.isVerified) {
          // Generate OTP
          const otp = generateOTP();
          user.otp = otp;
          user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry
          user.otpLastSent = new Date();
          await user.save();

          // Send verification email
          await sendVerificationEmail(email, otp);
          
          // Log login attempt requiring verification
          await Logs.createLog({
            userId: user._id,
            userEmail: user.email,
            userName: user.firstName && user.lastName ? 
              `${user.firstName} ${user.lastName}` : 
              (user.firstName || user.email.split('@')[0]),
            action: 'login',
            details: {
              method: 'email',
              success: false,
              reason: 'needs_verification'
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          });

          return res.status(200).json({
            message: "Please verify your email",
            needsVerification: true,
            userId: user._id
          });
        }

        // Update last login timestamp
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
          expiresIn: "24h",
        });
        
        // Log successful login
        await Logs.createLog({
          userId: user._id,
          userEmail: user.email,
          userName: user.firstName && user.lastName ? 
            `${user.firstName} ${user.lastName}` : 
            (user.firstName || user.email.split('@')[0]),
          action: 'login',
          details: {
            method: 'email',
            success: true,
            role: user.role
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });

        return res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
      }
      
      // Log failed login due to incorrect password
      await Logs.createLog({
        userId: user._id,
        userEmail: user.email,
        userName: user.firstName && user.lastName ? 
          `${user.firstName} ${user.lastName}` : 
          (user.firstName || user.email.split('@')[0]),
        action: 'login',
        details: {
          method: 'email',
          success: false,
          reason: 'invalid_password'
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    }
    
    // If we reach here, either user doesn't exist or password didn't match
    // Check for collaborator login
    const parentUser = await User.findOne({ 
      "collaborators.email": email 
    });
    
    if (parentUser) {
      
      // Find the matching collaborator
      const collaborator = parentUser.collaborators.find(c => c.email === email);
      
      if (collaborator) {
        
        // Modified password validation check - just check if the password field exists at all
        if (!collaborator.password) {
          // Log collaborator account not set up
          await Logs.createLog({
            userId: parentUser._id,
            userEmail: email,
            userName: collaborator.name || email.split('@')[0],
            action: 'login',
            details: {
              method: 'collaborator',
              success: false,
              reason: 'account_setup_incomplete'
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          });
          
          return res.status(400).json({ message: "Please complete your account setup using the invitation link sent to your email." });
        }
        
        // Check collaborator password
        try {
          const isCollabMatch = await bcrypt.compare(password, collaborator.password);
          
          if (isCollabMatch) {
            // Check if parent user is restricted or deleted
            if (parentUser.status === 'restricted' || parentUser.status === 'deleted') {
              // Log failed collaborator login due to parent account status
              await Logs.createLog({
                userId: parentUser._id,
                userEmail: email,
                userName: collaborator.name || email.split('@')[0],
                action: 'login',
                details: {
                  method: 'collaborator',
                  success: false,
                  reason: 'parent_account_' + parentUser.status
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
              });
              
              return res.status(403).json({ message: "This account has been restricted or deleted. Please contact the account owner for assistance." });
            }
            
            // Check collaborator status - only allow active collaborators to login
            if (collaborator.status !== 'active') {
              const statusReason = `collaborator_status_${collaborator.status}`;
              let statusMessage = "Your account is not active. Please contact the account owner for assistance.";
              
              if (collaborator.status === 'invited') {
                statusMessage = "Your invitation is pending acceptance. Please check your email for instructions.";
              } else if (collaborator.status === 'restricted') {
                statusMessage = "Your access has been restricted. Please contact the account owner for assistance.";
              } else if (collaborator.status === 'deleted') {
                statusMessage = "Your access has been revoked. Please contact the account owner for assistance.";
              }
              
              // Log failed collaborator login due to status
              await Logs.createLog({
                userId: parentUser._id,
                userEmail: email,
                userName: collaborator.name || email.split('@')[0],
                action: 'login',
                details: {
                  method: 'collaborator',
                  success: false,
                  reason: statusReason
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
              });
              
              return res.status(403).json({ message: statusMessage });
            }
            
            // Update last login timestamp for parent user
            parentUser.lastLogin = new Date();
            await parentUser.save();
            
            // Generate JWT with both user and collaborator info
            const token = jwt.sign({ 
              userId: parentUser._id,
              isCollaborator: true,
              collaboratorEmail: email,
              collaboratorRole: collaborator.role
            }, process.env.JWT_SECRET, {
              expiresIn: "24h",
            });
            
            // Log successful collaborator login
            await Logs.createLog({
              userId: parentUser._id,
              userEmail: email,
              userName: collaborator.name || email.split('@')[0],
              action: 'login',
              details: {
                method: 'collaborator',
                success: true,
                role: collaborator.role,
                parentAccount: parentUser.email
              },
              ipAddress: req.ip,
              userAgent: req.get('user-agent')
            });

            return res.json({ 
              token, 
              user: { 
                id: parentUser._id, 
                email: parentUser.email,
                collaborator: {
                  email: collaborator.email,
                  role: collaborator.role,
                  name: collaborator.name || "",
                  status: collaborator.status
                }
              } 
            });
          } else {
            // Log failed collaborator login due to incorrect password
            await Logs.createLog({
              userId: parentUser._id,
              userEmail: email,
              userName: collaborator.name || email.split('@')[0],
              action: 'login',
              details: {
                method: 'collaborator',
                success: false,
                reason: 'invalid_password'
              },
              ipAddress: req.ip,
              userAgent: req.get('user-agent')
            });
            
            return res.status(400).json({ message: "Invalid credentials - incorrect password" });
          }
        } catch (bcryptError) {
          return res.status(400).json({ message: "Authentication error during password verification" });
        }
      } else {
        console.log('Collaborator not found in parent user document');
      }
    } else {
      console.log('No parent user found for email:', email);
    }

    // Log failed login attempt for non-existent user
    await Logs.createLog({
      userEmail: email,
      action: 'login',
      details: {
        method: 'email',
        success: false,
        reason: 'user_not_found'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // If we get here, neither user nor collaborator credentials matched
    return res.status(400).json({ message: "Invalid credentials" });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Google OAuth Routes
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    // Automatically verify email for Google sign-in users
    const user = await User.findById(req.user._id);
    const subscriber = await Subscriber.findOne({ email: user.email });
    if (user && !user.isVerified) {
      user.isVerified = true;

      if (subscriber) {

        user.firstName = subscriber.name.split(' ')[0];
        user.lastName = subscriber.name.split(' ').slice(1).join(' ');

        // Convert sector array to string for company type
        const sectorString = Array.isArray(subscriber.sector) 
          ? subscriber.sector.join(', ') 
          : (subscriber.sector || '');

        user.company = {
          type: sectorString,
          MainOperatingRegions: []
        };
        if (subscriber.location && subscriber.location.length > 0) {
          user.company.MainOperatingRegions = subscriber.location.map(loc => ({
            name: loc.name || '',
            latitude: loc.latitude || 0,
            longitude: loc.longitude || 0,
            placeId: loc.placeId || ''
          }));
        }
      }


      await user.save();
    }

    const token = jwt.sign({ userId: req.user._id }, process.env.JWT_SECRET, {
      expiresIn: "24h", // Changed from 1h to 24h
    });
    res.redirect(`https://tourprism.com/auth/google/callback?token=${token}`);
  }
);

// User Profile Route
router.get("/user/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If this is a collaborator token
    if (decoded.isCollaborator) {
      const collaborator = user.collaborators.find(c => c.email === decoded.collaboratorEmail);
      
      if (!collaborator) {
        return res.status(404).json({ message: "Collaborator not found" });
      }
      
      // Return user info with collaborator details
      return res.json({
        _id: user._id,
        email: user.email,
        isCollaborator: true,
        collaborator: {
          email: collaborator.email,
          role: collaborator.role
        }
      });
    }

    // Regular user
    res.json(user);
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
});

// Change Password Route
router.post("/change-password", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is registered with Google
    if (user.googleId) {
      return res.status(400).json({ message: "Google-authenticated accounts cannot change password through this method." });
    }

    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Check if new password meets requirements
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: "Invalid token" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

// Check if user account exists
router.post("/check-account", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    console.log(`Checking account existence for email: ${email}`);

    // Check if user exists in User collection
    const user = await User.findOne({ email });
    
    const exists = !!user;
    console.log(`Account check result for ${email}: exists=${exists}`);
    
    res.json({ 
      exists: exists,
      message: user ? "User account found" : "No user account found"
    });
  } catch (error) {
    console.error("Check account error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
