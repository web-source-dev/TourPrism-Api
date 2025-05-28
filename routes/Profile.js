import express from 'express';
import User from '../models/User.js';
import CompanyNames from '../models/companyNames.js';
import { authenticate, authenticateCollaboratorOrRole } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendCollaboratorInvitation } from '../utils/emailService.js';

const router = express.Router();

// Custom middleware to check if user is the account owner or a manager collaborator
const canEditProfile = async (req, res, next) => {
  try {
    // If it's the account owner, allow access
    if (!req.isCollaborator) {
      return next();
    }
    
    // If it's a collaborator, check if they have manager role
    if (req.isCollaborator && req.collaboratorRole === 'manager') {
      return next();
    }
    
    // Otherwise deny access
    return res.status(403).json({ message: 'Access denied. Insufficient privileges to edit profile.' });
  } catch (error) {
    console.error('Error in canEditProfile middleware:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user profile - accessible to account owner and all collaborators
router.get('/', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update personal information - only account owner and manager collaborators
router.put('/personal-info', authenticate, canEditProfile, async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;
    
    // Validate input
    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First name and last name are required' });
    }

    // Find and update user
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update fields
    user.firstName = firstName;
    user.lastName = lastName;
    
    // Only update email if different and not empty
    if (email && email !== user.email) {
      // Check if email is already taken
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email is already in use' });
      }
      user.email = email;
      user.isVerified = false; // Require re-verification if email changes
    }

    await user.save();
    
    // Return updated user without sensitive fields
    const updatedUser = await User.findById(req.userId).select('-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry');
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating personal info:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update company information - only account owner and manager collaborators
router.put('/company-info', authenticate, canEditProfile, async (req, res) => {
  try {
    const { companyName, companyType, mainOperatingRegions } = req.body;
    
    
    // Find and update user
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize company object if it doesn't exist
    if (!user.company) {
      user.company = {};
    }


    // Update company fields
    if (companyName !== undefined) {
      user.company.name = companyName;
      
      // Add to CompanyNames collection if it doesn't exist
      try {
        const existingCompany = await CompanyNames.findOne({ name: { $regex: new RegExp(`^${companyName}$`, 'i') } });
        if (!existingCompany && companyName.trim()) {
          await CompanyNames.create({ name: companyName });
        }
      } catch (error) {
        console.error('Error adding company name to suggestions:', error);
        // Don't fail the whole request if this part fails
      }
    }
    
    if (companyType !== undefined) {
      user.company.type = companyType;
    }
    
    // Handle the updated mainOperatingRegions format with coordinates
    if (mainOperatingRegions && Array.isArray(mainOperatingRegions)) {
      // Check if we're receiving the new format (objects with coordinates) or legacy format (strings)
      const isNewFormat = mainOperatingRegions.length > 0 && 
                         typeof mainOperatingRegions[0] === 'object' &&
                         mainOperatingRegions[0] !== null;
      
      if (isNewFormat) {
        // New format: array of objects with coordinates
        // Validate each region has required properties
        const validRegions = mainOperatingRegions.filter(region => 
          region && 
          typeof region.name === 'string' && 
          typeof region.latitude === 'number' &&
          typeof region.longitude === 'number'
        );
        
        user.company.MainOperatingRegions = validRegions;
      } else {
        // Legacy format: array of strings (maintain backward compatibility)
        // Convert to new format with empty coordinates
        const convertedRegions = mainOperatingRegions.map(name => ({
          name: name,
          latitude: null,
          longitude: null,
          placeId: null
        }));
        
        user.company.MainOperatingRegions = convertedRegions;
      }
    }

    await user.save();
    
    // Verify the company info was saved correctly
    const updatedUser = await User.findById(req.userId).select('-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry');
    
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating company info:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user preferences - only account owner and manager collaborators
router.put('/preferences', authenticate, canEditProfile, async (req, res) => {
  try {
    const { communication, alertSummaries } = req.body;
    
    // Find and update user
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize preferences object if it doesn't exist
    if (!user.preferences) {
      user.preferences = {
        Communication: {},
        AlertSummaries: {}
      };
    }

    // Update communication preferences
    if (communication) {
      if (!user.preferences.Communication) {
        user.preferences.Communication = {};
      }
      
      if (typeof communication.emailPrefrences === 'boolean') {
        user.preferences.Communication.emailPrefrences = communication.emailPrefrences;
      }
      
      if (typeof communication.whatsappPrefrences === 'boolean') {
        user.preferences.Communication.whatsappPrefrences = communication.whatsappPrefrences;
      }
    }

    // Update alert summary preferences
    if (alertSummaries) {
      if (!user.preferences.AlertSummaries) {
        user.preferences.AlertSummaries = {};
      }
      
      if (typeof alertSummaries.daily === 'boolean') {
        user.preferences.AlertSummaries.daily = alertSummaries.daily;
      }
      
      if (typeof alertSummaries.weekly === 'boolean') {
        user.preferences.AlertSummaries.weekly = alertSummaries.weekly;
      }
      
      if (typeof alertSummaries.monthly === 'boolean') {
        user.preferences.AlertSummaries.monthly = alertSummaries.monthly;
      }
    }

    await user.save();
    
    // Return updated user without sensitive fields
    const updatedUser = await User.findById(req.userId).select('-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry');
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update subscription status - only account owner and manager collaborators
router.put('/subscription', authenticate, canEditProfile, async (req, res) => {
  try {
    const { isSubscribed } = req.body;
    
    if (typeof isSubscribed !== 'boolean') {
      return res.status(400).json({ message: 'isSubscribed must be a boolean value' });
    }
    
    // Find and update user
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update subscription status
    user.isSubscribed = isSubscribed;
    await user.save();
    // Return updated user without sensitive fields
    const updatedUser = await User.findById(req.userId).select('-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry');
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating subscription status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get company name suggestions - accessible to account owner and all collaborators
router.get('/company-suggestions', authenticate, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.json([]);
    }

    const companies = await CompanyNames.find({ 
      name: { $regex: new RegExp(query, 'i') } 
    })
    .limit(10)
    .sort({ name: 1 });

    res.json(companies.map(company => company.name));
  } catch (error) {
    console.error('Error fetching company suggestions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get collaborators - accessible to account owner only
router.get('/collaborators', authenticate, async (req, res) => {
  try {
    // Only the account owner can view collaborators, not collaborators themselves
    if (req.isCollaborator) {
      return res.status(403).json({ message: 'Access denied. Only account owners can view collaborators.' });
    }
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Return collaborators with limited fields
    const collaborators = user.collaborators || [];
    
    res.json({ collaborators });
  } catch (error) {
    console.error('Error fetching collaborators:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Invite a new collaborator - accessible to account owner only
router.post('/collaborators/invite', authenticate, async (req, res) => {
  try {
    // Only the account owner can invite collaborators
    if (req.isCollaborator) {
      return res.status(403).json({ message: 'Access denied. Only account owners can invite collaborators.' });
    }
    
    const { email, name, role } = req.body;
    
    // Validate input
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    if (!['viewer', 'manager'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be "viewer" or "manager"' });
    }
    
    // Find the account owner
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if the email is already registered as a collaborator
    if (user.collaborators && user.collaborators.some(c => c.email === email)) {
      return res.status(400).json({ message: 'This email is already registered as a collaborator' });
    }
    
    // Check if the email is the same as the account owner
    if (user.email === email) {
      return res.status(400).json({ message: 'You cannot invite yourself as a collaborator' });
    }
    
    // Generate a unique invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    // Create a new collaborator
    const newCollaborator = {
      email,
      name: name || '', // Add name with default empty string if not provided
      role,
      status: 'invited',
      invitationToken,
      invitationExpiry
    };
    
    // Add the collaborator to the user's collaborators array
    if (!user.collaborators) {
      user.collaborators = [];
    }
    
    user.collaborators.push(newCollaborator);
    await user.save();
    
    // Send invitation email
    const inviteUrl = `${process.env.FRONTEND_URL}/invite/accept?token=${invitationToken}&email=${encodeURIComponent(email)}`;
    
    try {
      await sendCollaboratorInvitation(email, user.firstName, user.lastName, inviteUrl, role, name);
      res.status(201).json({ message: 'Invitation sent successfully' });
    } catch (emailError) {
      console.error('Error sending invitation email:', emailError);
      // Still return success but with a warning
      res.status(201).json({ 
        message: 'Collaborator added but there was an issue sending the invitation email. You may want to resend it later.',
        collaborator: newCollaborator
      });
    }
  } catch (error) {
    console.error('Error inviting collaborator:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Resend invitation - accessible to account owner only
router.post('/collaborators/:collaboratorId/resend', authenticate, async (req, res) => {
  try {
    // Only the account owner can resend invitations
    if (req.isCollaborator) {
      return res.status(403).json({ message: 'Access denied. Only account owners can resend invitations.' });
    }
    
    const { collaboratorId } = req.params;
    
    // Find the account owner
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Find the collaborator
    const collaborator = user.collaborators && user.collaborators.id(collaboratorId);
    if (!collaborator) {
      return res.status(404).json({ message: 'Collaborator not found' });
    }
    
    // Check if the collaborator is in 'invited' status
    if (collaborator.status !== 'invited') {
      return res.status(400).json({ message: 'Invitation can only be resent for pending invitations' });
    }
    
    // Regenerate the invitation token and update expiry
    collaborator.invitationToken = crypto.randomBytes(32).toString('hex');
    collaborator.invitationExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    await user.save();
    
    // Send invitation email
    const inviteUrl = `${process.env.FRONTEND_URL}/invite/accept?token=${collaborator.invitationToken}&email=${encodeURIComponent(collaborator.email)}`;
    
    try {
      await sendCollaboratorInvitation(collaborator.email, user.firstName, user.lastName, inviteUrl, collaborator.role, collaborator.name);
      res.json({ message: 'Invitation resent successfully' });
    } catch (emailError) {
      console.error('Error resending invitation email:', emailError);
      res.status(200).json({ 
        message: 'Invitation updated but there was an issue sending the email.',
        collaborator
      });
    }
  } catch (error) {
    console.error('Error resending invitation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update collaborator role - accessible to account owner only
router.put('/collaborators/:collaboratorId/role', authenticate, async (req, res) => {
  try {
    // Only the account owner can update roles
    if (req.isCollaborator) {
      return res.status(403).json({ message: 'Access denied. Only account owners can update collaborator roles.' });
    }
    
    const { collaboratorId } = req.params;
    const { role } = req.body;
    
    // Validate role
    if (!['viewer', 'manager'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be "viewer" or "manager"' });
    }
    
    // Find the account owner
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Find the collaborator
    const collaborator = user.collaborators && user.collaborators.id(collaboratorId);
    if (!collaborator) {
      return res.status(404).json({ message: 'Collaborator not found' });
    }
    
    // Update the role
    collaborator.role = role;
    await user.save();
    
    res.json({ message: 'Collaborator role updated successfully', collaborator });
  } catch (error) {
    console.error('Error updating collaborator role:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update collaborator status - accessible to account owner only
router.put('/collaborators/:collaboratorId/status', authenticate, async (req, res) => {
  try {
    // Only the account owner can update statuses
    if (req.isCollaborator) {
      return res.status(403).json({ message: 'Access denied. Only account owners can update collaborator statuses.' });
    }
    
    const { collaboratorId } = req.params;
    const { status } = req.body;
    
    // Validate status
    if (!['active', 'restricted'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be "active" or "restricted"' });
    }
    
    // Find the account owner
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Find the collaborator
    const collaborator = user.collaborators && user.collaborators.id(collaboratorId);
    if (!collaborator) {
      return res.status(404).json({ message: 'Collaborator not found' });
    }
    
    // Update the status
    collaborator.status = status;
    await user.save();
    
    res.json({ message: `Collaborator ${status === 'active' ? 'activated' : 'restricted'} successfully`, collaborator });
  } catch (error) {
    console.error('Error updating collaborator status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a collaborator - accessible to account owner only
router.delete('/collaborators/:collaboratorId', authenticate, async (req, res) => {
  try {
    // Only the account owner can delete collaborators
    if (req.isCollaborator) {
      return res.status(403).json({ message: 'Access denied. Only account owners can remove collaborators.' });
    }
    
    const { collaboratorId } = req.params;
    
    // Find the account owner
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Find the collaborator
    const collaborator = user.collaborators && user.collaborators.id(collaboratorId);
    if (!collaborator) {
      return res.status(404).json({ message: 'Collaborator not found' });
    }
    
    // Remove the collaborator
    // Using pull method instead of remove() which is not available in newer Mongoose versions
    user.collaborators.pull({ _id: collaboratorId });
    await user.save();
    
    res.json({ message: 'Collaborator removed successfully' });
  } catch (error) {
    console.error('Error removing collaborator:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify an invitation token - public route
router.get('/collaborators/verify-invitation', async (req, res) => {
  try {
    const { token, email } = req.query;
    
    if (!token || !email) {
      return res.status(400).json({ message: 'Invalid request. Token and email are required.' });
    }
    
    // Find the user with this collaborator
    const user = await User.findOne({
      'collaborators.email': email,
      'collaborators.invitationToken': token,
      'collaborators.invitationExpiry': { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(404).json({ message: 'Invalid or expired invitation link.' });
    }
    
    // Find the specific collaborator
    const collaborator = user.collaborators.find(c => 
      c.email === email && c.invitationToken === token
    );
    
    if (!collaborator) {
      return res.status(404).json({ message: 'Invitation not found.' });
    }
    
    // Return minimal information needed for the invitation acceptance page
    res.json({
      valid: true,
      ownerName: `${user.firstName} ${user.lastName}`,
      ownerEmail: user.email,
      companyName: user.company?.name || '',
      collaboratorEmail: email,
      collaboratorName: collaborator.name || '',
      role: collaborator.role
    });
    
  } catch (error) {
    console.error('Error verifying invitation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Accept an invitation - public route
router.post('/collaborators/accept-invitation', async (req, res) => {
  try {
    const { token, email, password } = req.body;
    
    if (!token || !email || !password) {
      return res.status(400).json({ message: 'Invalid request. Token, email, and password are required.' });
    }
    
    // Find the user with this collaborator
    const user = await User.findOne({
      'collaborators.email': email,
      'collaborators.invitationToken': token,
      'collaborators.invitationExpiry': { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(404).json({ message: 'Invalid or expired invitation link.' });
    }
    
    // Find the specific collaborator
    const collaborator = user.collaborators.find(c => 
      c.email === email && c.invitationToken === token
    );
    
    if (!collaborator) {
      return res.status(404).json({ message: 'Invitation not found.' });
    }
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Update the collaborator
    collaborator.password = hashedPassword;
    collaborator.status = 'active';
    collaborator.invitationToken = undefined; // Clear the token
    collaborator.invitationExpiry = undefined; // Clear the expiry
    
    await user.save();
    
    // Generate a JWT token for the collaborator
    const payload = {
      userId: user._id,
      isCollaborator: true,
      collaboratorEmail: email,
      collaboratorRole: collaborator.role
    };
    
    const jwtToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      message: 'Invitation accepted successfully',
      token: jwtToken,
      user: {
        _id: user._id,
        email: collaborator.email,
        isCollaborator: true,
        collaborator: {
          email: collaborator.email,
          role: collaborator.role
        }
      }
    });
    
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
