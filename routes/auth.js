const express = require("express");
const passport = require("passport");
const dotenv = require("dotenv");
dotenv.config();

const {
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
  handleLogout,
} = require("../controllers/authController.js");
const { logout } = require("../middleware/auth.js");

const router = express.Router();

// Configure OAuth Strategies
configureGoogleStrategy();
configureMicrosoftStrategy();

// Register Route
router.post("/register", register);

// Verify Email Route
router.post("/verify-email", verifyEmail);

// Resend OTP Route
router.post("/resend-otp", resendOTP);
// Forgot Password Route
router.post("/forgot-password", forgotPassword);

// Verify Reset OTP Route
router.post("/verify-reset-otp", verifyResetOTP);

// Reset Password Route
router.post("/reset-password", resetPassword);

// Login Route
router.post("/login", login);

// Google OAuth Routes
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  googleCallback
);

// Microsoft OAuth Routes
router.get(
  "/microsoft",
  passport.authenticate("microsoft", { scope: ["user.read"] })
);

router.get(
  "/microsoft/callback",
  passport.authenticate("microsoft", { session: false }),
  microsoftCallback
);

// Token Verification Route - verifies token against database
router.get("/verify-token", verifyToken);

// User Profile Route
router.get("/user/profile", getUserProfile);

// Change Password Route
router.post("/change-password", changePassword);

// Logout endpoint
router.post("/logout", logout, handleLogout);


module.exports = router;
