const bcrypt = require("bcryptjs");
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const { Strategy: MicrosoftStrategy } = require("passport-microsoft");
const User = require("../models/User.js");
const Logger = require("../utils/logger.js");
const { generateOTP } = require("../utils/emailService.js");
const sendVerificationEmail = require("../utils/emailTemplates/verification.js");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const Subscriber = require("../models/subscribers.js");
const tokenManager = require("../utils/tokenManager.js");

// Configure Google Strategy
const configureGoogleStrategy = () => {
  // Determine callback URL based on environment
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocalHttps = process.env.NODE_ENV === 'development' && process.env.USE_HTTPS === 'true';
  const baseUrl = isProduction
    ? 'https://api.tourprism.com'
    : isLocalHttps
      ? 'https://api.vos.local'
      : `${process.env.BACKEND_URL || 'http://localhost:5000'}`; 

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${baseUrl}/auth/google/callback`,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails[0].value;
          
          // Check if user exists by Google ID
          let user = await User.findOne({ googleId: profile.id });
          
          // If not found by Google ID, check by email (could be existing user or collaborator)
          if (!user) {
            user = await User.findOne({ email });
            
            // If found by email, link Google ID to existing account
            if (user) {
              user.googleId = profile.id;
              await user.save();
              
              // Log Google login (existing account)
              await Logger.log(null, "login", {
                method: "google",
                success: true,
                role: user.role,
              });
            } else {
              // Check if email belongs to a collaborator
              const parentUser = await User.findOne({
                "collaborators.email": email,
              });
              
              if (parentUser) {
                // Can't use OAuth for collaborator accounts - they must use email/password
                return done(new Error("This email is registered as a collaborator. Please use email/password login."), null);
              }
              
              // Create new user
            user = await User.create({
              googleId: profile.id,
                email: email,
                isVerified: true, // OAuth accounts are pre-verified
            });

            // Log new user signup via Google
            await Logger.log(null, "signup", {
              method: "google",
              signupCompleted: true,
            });
            }
          } else {
            // Log Google login (existing Google account)
            await Logger.log(null, "login", {
              method: "google",
              success: true,
              role: user.role,
            });
          }
          
          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
};

// Configure Microsoft Strategy
const configureMicrosoftStrategy = () => {
  // Determine callback URL based on environment
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocalHttps = process.env.NODE_ENV === 'development' && process.env.USE_HTTPS === 'true';
  const baseUrl = isProduction
    ? 'https://api.tourprism.com'
    : isLocalHttps
      ? 'https://api.vos.local:5000'
      : `${process.env.BACKEND_URL || 'http://localhost:5000'}`;

  passport.use(
    new MicrosoftStrategy(
      {
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: `${baseUrl}/auth/microsoft/callback`,
        scope: ["user.read"],
        tenant: "common", // Allow both personal and organizational accounts
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails[0].value;
          
          // Check if user exists by Microsoft ID
          let user = await User.findOne({ microsoftId: profile.id });
          
          // If not found by Microsoft ID, check by email (could be existing user or collaborator)
          if (!user) {
            user = await User.findOne({ email });
            
            // If found by email, link Microsoft ID to existing account
            if (user) {
              user.microsoftId = profile.id;
              await user.save();
              
              // Log Microsoft login (existing account)
              await Logger.log(null, "login", {
                method: "microsoft",
                success: true,
                role: user.role,
              });
            } else {
              // Check if email belongs to a collaborator
              const parentUser = await User.findOne({
                "collaborators.email": email,
              });
              
              if (parentUser) {
                // Can't use OAuth for collaborator accounts - they must use email/password
                return done(new Error("This email is registered as a collaborator. Please use email/password login."), null);
              }
              
              // Create new user
            user = await User.create({
              microsoftId: profile.id,
                email: email,
                isVerified: true, // OAuth accounts are pre-verified
            });

            // Log new user signup via Microsoft
            await Logger.log(null, "signup", {
              method: "microsoft",
              signupCompleted: true,
            });
            }
          } else {
            // Log Microsoft login (existing Microsoft account)
            await Logger.log(null, "login", {
              method: "microsoft",
              success: true,
              role: user.role,
            });
          }
          
          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
};

// Register User
const register = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }
    // Check if email is registered with Google
    if (await User.findOne({ email, googleId: { $exists: true } })) {
      return res
        .status(400)
        .json({
          message:
            "This email is registered with Google. Please continue with Google login.",
        });
    }

    // Check if email is registered with Microsoft
    if (await User.findOne({ email, microsoftId: { $exists: true } })) {
      return res
        .status(400)
        .json({
          message:
            "This email is registered with Microsoft. Please continue with Microsoft login.",
        });
    }

    // Check if email exists in subscribers collection
    const subscriber = await Subscriber.findOne({ email });
    let subscriberData = null;

    if (subscriber) {
      subscriberData = await Subscriber.findOne({ email });
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
      otpLastSent: new Date(),
    };

    // If subscriber data exists, populate user data from it
    if (subscriberData) {
      // Use full name as contact name
      if (subscriberData.name) {
        userData.company = {
          contactName: subscriberData.name.trim(),
          city: null, // Will be set during onboarding
          rooms: null,
          avgRoomRate: null,
          size: null,
          locations: [],
          incentives: []
        };
      }

      // Add location data if available (for future use)
      if (subscriberData.location && subscriberData.location.length > 0) {
        userData.company.locations = subscriberData.location.map((loc) => ({
          name: loc.name || "",
          latitude: loc.latitude || 0,
          longitude: loc.longitude || 0,
          placeId: loc.placeId || "",
        }));
      }
    }

    // Create user with the populated data
    user = await User.create(userData);

    // Send verification email
    try {
      await sendVerificationEmail(email, otp);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Log the error but don't fail registration - user can request resend
      await Logger.log(req, "signup", {
        method: "email",
        signupCompleted: false,
        awaitingVerification: true,
        emailError: emailError.message
      });
      
      // Still return success but inform user about email issue
      return res.status(201).json({
        message:
          "Registration successful, but we couldn't send the verification email. Please use 'Resend OTP' to try again.",
        userId: user._id,
        emailSent: false
      });
    }

    // Log signup
    await Logger.log(req, "signup", {
      method: "email",
      signupCompleted: false,
      awaitingVerification: true,
    });

    res.status(201).json({
      message:
        "Registration successful. Please check your email for verification code.",
      userId: user._id,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Verify Email
const verifyEmail = async (req, res) => {
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

    const { accessToken: token, expiresIn } = tokenManager.generateTokens(user);

    // Set authentication cookie
    tokenManager.setAuthCookie(res, token, expiresIn);

    // Log email verification
    await Logger.log(req, "email_verified", {
      method: "otp",
      signupCompleted: true,
    });

    // Return user data (token is in cookie, not response body)
    res.json({
      user: {
        _id: user._id,
        id: user._id,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
        status: user.status,
        isCollaborator: false,
        company: user.company,
        weeklyForecastSubscribed: user.weeklyForecastSubscribed,
        weeklyForecastSubscribedAt: user.weeklyForecastSubscribedAt,
        lastWeeklyForecastReceived: user.lastWeeklyForecastReceived,
        followedAlerts: user.followedAlerts,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
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
    if (timeDiff < 60000) {
      // 1 minute in milliseconds
      return res.status(400).json({
        message: "Please wait before requesting another OTP",
        waitTime: Math.ceil((60000 - timeDiff) / 1000), // remaining seconds
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry
    user.otpLastSent = new Date();
    await user.save();

    // Send new verification email
    try {
      await sendVerificationEmail(user.email, otp);
      res.json({ message: "OTP resent successfully" });
    } catch (emailError) {
      console.error('Failed to resend verification email:', emailError);
      res.status(500).json({ 
        message: "Failed to send verification email. Please check your email configuration or try again later.",
        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Forgot Password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.googleId) {
      return res
        .status(400)
        .json({
          message:
            "This email is registered with Google. Please continue with Google login.",
        });
    }

    if (user.microsoftId) {
      return res
        .status(400)
        .json({
          message:
            "This email is registered with Microsoft. Please continue with Microsoft login.",
        });
    }

    // Check if 1 minute has passed since last OTP
    const lastSent = user.otpLastSent || new Date(0);
    const timeDiff = Date.now() - lastSent.getTime();
    if (timeDiff < 60000) {
      // 1 minute in milliseconds
      return res.status(400).json({
        message: `Please wait before requesting another reset code. Please wait ${Math.ceil((60000 - timeDiff) / 1000)} seconds.`,
        waitTime: Math.ceil((60000 - timeDiff) / 1000), // remaining seconds
      });
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
    sendSmtpEmail.sender = {
      email: process.env.EMAIL_FROM || "no-reply@tourprism.com",
    };
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
    await Logger.log(req, "password_reset", {
      stage: "requested",
    });

    res.json({
      message: "Password reset OTP sent to your email",
      userId: user._id,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Verify Reset OTP
const verifyResetOTP = async (req, res) => {
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
};

// Reset Password
const resetPassword = async (req, res) => {
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
    await Logger.log(req, "password_reset", {
      stage: "completed",
    });

    res.json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Login - works for both main users and collaborators
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // First check if email belongs to a collaborator
    const parentUser = await User.findOne({
      "collaborators.email": email,
    });

    if (parentUser) {
      // Find the matching collaborator
      const collaborator = parentUser.collaborators.find(
        (c) => c.email === email
      );

      if (collaborator) {
        // Check if collaborator has password set
        if (!collaborator.password) {
          await Logger.log(req, "login", {
            method: "collaborator",
            success: false,
            reason: "account_setup_incomplete",
          });

          return res
            .status(400)
            .json({
              message:
                "Please complete your account setup using the invitation link sent to your email.",
            });
        }

        // Check collaborator password
        try {
          const isCollabMatch = await bcrypt.compare(
            password,
            collaborator.password
          );

          if (isCollabMatch) {
            // Check if parent user is restricted or deleted
            if (
              parentUser.status === "restricted" ||
              parentUser.status === "deleted"
            ) {
              await Logger.log(req, "login", {
                method: "collaborator",
                success: false,
                reason: "parent_account_" + parentUser.status,
              });

              return res
                .status(403)
                .json({
                  message:
                    "This account has been restricted or deleted. Please contact the account owner for assistance.",
                });
            }

            // Check collaborator status
            if (collaborator.status !== "active") {
              const statusReason = `collaborator_status_${collaborator.status}`;
              let statusMessage =
                "Your account is not active. Please contact the account owner for assistance.";

              if (collaborator.status === "invited") {
                statusMessage =
                  "Your invitation is pending acceptance. Please check your email for instructions.";
              } else if (collaborator.status === "restricted") {
                statusMessage =
                  "Your access has been restricted. Please contact the account owner for assistance.";
              } else if (collaborator.status === "deleted") {
                statusMessage =
                  "Your access has been revoked. Please contact the account owner for assistance.";
              }

              await Logger.log(req, "login", {
                method: "collaborator",
                success: false,
                reason: statusReason,
              });

              return res.status(403).json({ message: statusMessage });
            }

            // Update last login timestamp for parent user
            parentUser.lastLogin = new Date();
            await parentUser.save();

            // Generate JWT with comprehensive user and collaborator info
            const { accessToken: token, expiresIn } = tokenManager.generateTokens(
              parentUser,
              collaborator
            );

            // Set authentication cookie
            tokenManager.setAuthCookie(res, token, expiresIn);

            // Log successful collaborator login
            await Logger.log(req, "login", {
              method: "collaborator",
              success: true,
              role: collaborator.role,
              parentAccount: parentUser.email,
            });

            // Return comprehensive user data with collaborator info (token is in cookie)
            return res.json({
              user: {
                _id: parentUser._id,
                id: parentUser._id,
                email: parentUser.email,
                role: parentUser.role, // Parent user's role
                isVerified: parentUser.isVerified,
                isPremium: parentUser.isPremium,
                status: parentUser.status,
                isCollaborator: true,
                collaborator: {
                  email: collaborator.email,
                  role: collaborator.role,
                  name: collaborator.name || "",
                  status: collaborator.status,
                },
                company: parentUser.company,
                weeklyForecastSubscribed: parentUser.weeklyForecastSubscribed,
                weeklyForecastSubscribedAt: parentUser.weeklyForecastSubscribedAt,
                lastWeeklyForecastReceived: parentUser.lastWeeklyForecastReceived,
                followedAlerts: parentUser.followedAlerts,
              },
            });
          } else {
            // Password didn't match - continue to check main user
          }
        } catch (bcryptError) {
          // Continue to check main user on bcrypt error
        }
      }
    }

    // Check if main user exists
    const user = await User.findOne({ email });

    if (user) {
      // User found with this email
      if (user.googleId) {
        return res
          .status(400)
          .json({
            message:
              "This email is registered with Google. Please continue with Google login.",
          });
      }

      if (user.microsoftId) {
        return res
          .status(400)
          .json({
            message:
              "This email is registered with Microsoft. Please continue with Microsoft login.",
          });
      }

      // Check if user is restricted or deleted
      if (user.status === "restricted") {
        // Log failed login attempt due to restriction
            await Logger.log(req, "login", {
          method: "email",
              success: false,
          reason: "account_restricted",
            });

            return res
          .status(403)
          .json({
            message:
              "Your account has been restricted. Please contact support for assistance.",
          });
      }

      if (user.status === "deleted") {
        // Log failed login attempt due to deletion
        await Logger.log(req, "login", {
          method: "email",
          success: false,
          reason: "account_deleted",
        });

          return res
          .status(403)
            .json({
            message:
              "Your account has been deleted. Please contact support for assistance.",
          });
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
          try {
            await sendVerificationEmail(email, otp);
          } catch (emailError) {
            console.error('Failed to send verification email during login:', emailError);
            // Log the error but still allow user to request resend
            await Logger.log(req, "login", {
              method: "email",
              success: false,
              reason: "needs_verification",
              emailError: emailError.message
            });

            return res.status(200).json({
              message: "Please verify your email. We couldn't send the verification email automatically. Please use 'Resend OTP' to try again.",
              needsVerification: true,
              userId: user._id,
              emailSent: false
            });
          }

          // Log login attempt requiring verification
          await Logger.log(req, "login", {
            method: "email",
            success: false,
            reason: "needs_verification",
          });

          return res.status(200).json({
            message: "Please verify your email",
            needsVerification: true,
            userId: user._id,
          });
        }

        // Update last login timestamp
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT with comprehensive user data
        const { accessToken: token, expiresIn } = tokenManager.generateTokens(user);

        // Set authentication cookie
        tokenManager.setAuthCookie(res, token, expiresIn);

        // Log successful login
        await Logger.log(req, "login", {
          method: "email",
          success: true,
          role: user.role,
        });

        // Return comprehensive user data (token is in cookie, not response body)
        return res.json({
          user: {
            _id: user._id,
            id: user._id,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            isPremium: user.isPremium,
            status: user.status,
            isCollaborator: false,
            company: user.company,
            weeklyForecastSubscribed: user.weeklyForecastSubscribed,
            weeklyForecastSubscribedAt: user.weeklyForecastSubscribedAt,
            lastWeeklyForecastReceived: user.lastWeeklyForecastReceived,
            followedAlerts: user.followedAlerts,
          },
        });
      }

      // Log failed login due to incorrect password
      await Logger.log(req, "login", {
        method: "email",
        success: false,
        reason: "invalid_password",
      });
    }

    // Log failed login attempt for non-existent user
    await Logger.log(req, "login", {
      method: "email",
      success: false,
      reason: "user_not_found",
    });

    // If we get here, neither user nor collaborator credentials matched
    return res.status(400).json({ message: "Invalid credentials" });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Google OAuth Callback
const googleCallback = async (req, res) => {
  try {
    // Automatically verify email for Google sign-in users
    const user = await User.findById(req.user._id);
    const subscriber = await Subscriber.findOne({ email: user.email });
    if (user && !user.isVerified) {
      user.isVerified = true;

      if (subscriber) {
        // Set contact name from subscriber
        user.company = user.company || {};
        user.company.contactName = subscriber.name || '';

        // Initialize other required fields
        user.company.city = null;
        user.company.rooms = null;
        user.company.avgRoomRate = null;
        user.company.size = null;
        user.company.locations = [];
        user.company.incentives = [];

        // Add location data if available
        if (subscriber.location && subscriber.location.length > 0) {
          user.company.locations = subscriber.location.map(
            (loc) => ({
              name: loc.name || "",
              latitude: loc.latitude || 0,
              longitude: loc.longitude || 0,
              placeId: loc.placeId || "",
            })
          );
        }
      }

      await user.save();
    }

    // Generate token using tokenManager (OAuth creates main user accounts, not collaborators)
    const { accessToken: token, expiresIn } = tokenManager.generateTokens(user);
    
    // Set authentication cookie
    tokenManager.setAuthCookie(res, token, expiresIn);
    
    // Determine frontend URL based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalHttps = process.env.NODE_ENV === 'development' && process.env.USE_HTTPS === 'true';
    const frontendUrl = isProduction
      ? 'https://tourprism.com'
      : isLocalHttps
        ? 'https://vos.local'
        : (process.env.FRONTEND_URL || 'http://localhost:3000');

    // Redirect without token in URL - token is in cookie
    res.redirect(`${frontendUrl}/auth/google/callback`);
  } catch (error) {
    console.error("Google callback error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Microsoft OAuth Callback
const microsoftCallback = async (req, res) => {
  try {
    // Automatically verify email for Microsoft sign-in users
    const user = await User.findById(req.user._id);
    const subscriber = await Subscriber.findOne({ email: user.email });
    if (user && !user.isVerified) {
      user.isVerified = true;

      if (subscriber) {
        // Set contact name from subscriber
        user.company = user.company || {};
        user.company.contactName = subscriber.name || '';

        // Initialize other required fields
        user.company.city = null;
        user.company.rooms = null;
        user.company.avgRoomRate = null;
        user.company.size = null;
        user.company.locations = [];
        user.company.incentives = [];

        // Add location data if available
        if (subscriber.location && subscriber.location.length > 0) {
          user.company.locations = subscriber.location.map(
            (loc) => ({
              name: loc.name || "",
              latitude: loc.latitude || 0,
              longitude: loc.longitude || 0,
              placeId: loc.placeId || "",
            })
          );
        }
      }

      await user.save();
    }

    // Generate token using tokenManager (OAuth creates main user accounts, not collaborators)
    const { accessToken: token, expiresIn } = tokenManager.generateTokens(user);
    
    // Set authentication cookie
    tokenManager.setAuthCookie(res, token, expiresIn);
    
    // Determine frontend URL based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalHttps = process.env.NODE_ENV === 'development' && process.env.USE_HTTPS === 'true';
    const frontendUrl = isProduction
      ? 'https://tourprism.com'
      : isLocalHttps
        ? 'https://vos.local'
        : (process.env.FRONTEND_URL || 'http://localhost:3000');

    // Redirect without token in URL - token is in cookie
    res.redirect(`${frontendUrl}/auth/microsoft/callback`);
  } catch (error) {
    console.error("Microsoft callback error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Verify Token
const verifyToken = async (req, res) => {
  try {
    const token = tokenManager.extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = await tokenManager.verifyToken(token, {
      verifyDatabase: true,
    });

    if (!decoded || !decoded.userData) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = decoded.userData;

    // Check if user is active
    if (user.status !== "active") {
      return res.status(403).json({ message: "Account is not active" });
    }

    // If this is a collaborator token, verify collaborator
    if (decoded.isCollaborator && decoded.collaboratorData) {
      const collaborator = decoded.collaboratorData;

      if (!collaborator || collaborator.status !== "active") {
        return res
          .status(404)
          .json({ message: "Collaborator not found or not active" });
      }

      // Return user info with collaborator details
      return res.json({
        _id: user._id,
        email: user.email,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
        role: user.role,
        status: user.status,
        lastLogin: user.lastLogin,
        weeklyForecastSubscribed: user.weeklyForecastSubscribed,
        weeklyForecastSubscribedAt: user.weeklyForecastSubscribedAt,
        lastWeeklyForecastReceived: user.lastWeeklyForecastReceived,
        company: user.company,
        followedAlerts: user.followedAlerts,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isCollaborator: true,
        collaborator: {
          email: collaborator.email,
          role: collaborator.role,
          name: collaborator.name,
          status: collaborator.status,
        },
      });
    }

    // Regular user - return full user data (remove password field)
    const userResponse = user.toObject ? user.toObject() : user;
    delete userResponse.password;
    delete userResponse.otp;
    delete userResponse.otpExpiry;

    res.json(userResponse);
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).json({ message: "Invalid token" });
  }
};

// Get User Profile
const getUserProfile = async (req, res) => {
  try {
    const token = tokenManager.extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = await tokenManager.verifyToken(token, {
      verifyDatabase: true,
    });

    if (!decoded || !decoded.userData) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = decoded.userData;

    // If this is a collaborator token
    if (decoded.isCollaborator && decoded.collaboratorData) {
      const collaborator = decoded.collaboratorData;

      // Return user info with collaborator details
      return res.json({
        _id: user._id,
        email: user.email,
        isCollaborator: true,
        collaborator: {
          email: collaborator.email,
          role: collaborator.role,
          name: collaborator.name,
          status: collaborator.status,
        },
      });
    }

    // Regular user - return user data without sensitive fields
    const userResponse = user.toObject ? user.toObject() : user;
    delete userResponse.password;
    delete userResponse.otp;
    delete userResponse.otpExpiry;

    res.json(userResponse);
  } catch (error) {
    console.error("User profile error:", error);
    res.status(401).json({ message: "Invalid token" });
  }
};

// Change Password
const changePassword = async (req, res) => {
  try {
    const token = tokenManager.extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = await tokenManager.verifyToken(token, {
      verifyDatabase: true,
    });

    if (!decoded || !decoded.userData) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = decoded.userData;

    // Check if user is registered with Google or Microsoft
    if (user.googleId) {
      return res
        .status(400)
        .json({
          message:
            "Google-authenticated accounts cannot change password through this method.",
        });
    }

    if (user.microsoftId) {
      return res
        .status(400)
        .json({
          message:
            "Microsoft-authenticated accounts cannot change password through this method.",
        });
    }

    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({
          message: "Current password and new password are required",
        });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Check if new password meets requirements
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "New password must be at least 6 characters long" });
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
    res.status(500).json({ message: "Server error" });
  }
};

// Logout
const handleLogout = async (req, res) => {
  try {
    // Clear authentication cookie
    tokenManager.clearAuthCookie(res);
    
    res.json({
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Server error during logout" });
  }
};

module.exports = {
  configureGoogleStrategy,
  configureMicrosoftStrategy,
  register,
  verifyEmail,
  resendOTP,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  login,
  googleCallback,
  microsoftCallback,
  verifyToken,
  getUserProfile,
  changePassword,
  handleLogout
};

