const User = require('../models/User');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { username, email, password, role, ...profileData } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or username'
      });
    }

    // Create user
    const user = await User.create({
      username,
      email,
      password,
      role: role || 'student'
    });

    // Create profile based on role
    if (role === 'student') {
      await Student.create({
        userId: user._id,
        studentId: profileData.studentId || `STU${Date.now()}`,
        fullName: profileData.fullName || username,
        email: user.email,
        ...profileData
      });
    } else if (role === 'faculty') {
      await Faculty.create({
        userId: user._id,
        facultyId: profileData.facultyId || `FAC${Date.now()}`,
        fullName: profileData.fullName || username,
        email: user.email,
        ...profileData
      });
    } else if (role === 'admin') {
      // Only existing admins can create new admins
      // For initial setup, we'll handle this in server.js
      return res.status(403).json({
        success: false,
        message: 'Admin accounts can only be created by existing administrators'
      });
    }

    // Generate token
    const token = user.generateAuthToken();

    // Update last login
    await user.updateLastLogin();

    // Reset login attempts
    await user.resetLoginAttempts();

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('Registration Error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Registration failed'
    });
  }
};

// @desc    Login user - SIMPLE WORKING VERSION
// @route   POST /api/auth/login
// @access  Public
// SIMPLE WORKING LOGIN FUNCTION
// Supports login using Email OR Username (Student ID)
exports.login = async (req, res) => {
  try {
    // `email` here may be an actual email OR a student username (studentId)
    const { email: identifier, password } = req.body;

    console.log(`🔐 Login attempt for: ${identifier}`);

    // Basic validation
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/Student ID and password required'
      });
    }

    // Find user by email OR username
    const User = require('../models/User');
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }]
    }).select('+password');

    if (!user) {
      console.log(`❌ User not found: ${identifier}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log(`✅ User found: ${user.email || user.username}, Role: ${user.role}`);

    // Check if active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // SIMPLE PASSWORD CHECK - Direct bcrypt
    const bcrypt = require('bcryptjs');
    let isPasswordValid = await bcrypt.compare(password, user.password);

    // Compatibility: if stored password is plaintext (old data), bcrypt.compare will be false.
    // Detect plaintext by direct equality and upgrade to hashed password on first successful login.
    if (!isPasswordValid) {
      try {
        if (user.password === password) {
          // Re-hash and save the password to migrate to hashed storage
          user.password = await bcrypt.hash(password, 10);
          await user.save();
          isPasswordValid = true;
          console.log('🔁 Upgraded plaintext password to hashed for user:', user.email || user.username);
        }
      } catch (migrateErr) {
        console.error('Password migration error:', migrateErr);
      }
    }

    console.log(`🔐 Password check: ${isPasswordValid ? '✅ VALID' : '❌ INVALID'}`);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = user.generateAuthToken();

    // Get profile based on role
    let profile = null;
    if (user.role === 'admin') {
      const Admin = require('../models/Admin');
      profile = await Admin.findOne({ userId: user._id });
    } else if (user.role === 'student') {
      const Student = require('../models/Student');
      profile = await Student.findOne({ userId: user._id });
    }

    // Remove password from response
    user.password = undefined;

    console.log(`🎉 Login successful for: ${user.email}`);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        profileImage: user.profileImage,
        profile: profile
      }
    });

  } catch (error) {
    console.error('💥 Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
}; 
// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = req.user;
    let profile = null;
    
    if (user.role === 'student') {
      profile = await Student.findOne({ userId: user._id })
        .populate('courseEnrolled');
    } else if (user.role === 'faculty') {
      profile = await Faculty.findOne({ userId: user._id });
    } else if (user.role === 'admin') {
      profile = await Admin.findOne({ userId: user._id });
    }

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        profile
      }
    });
  } catch (error) {
    console.error('Get User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user data'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const user = req.user;

    // Update user document
    const allowedUpdates = ['username', 'email', 'phoneNumber', 'profileImage'];
    Object.keys(updates).forEach(update => {
      if (allowedUpdates.includes(update)) {
        user[update] = updates[update];
      }
    });

    await user.save();

    // Update profile based on role
    if (user.role === 'student') {
      await Student.findOneAndUpdate(
        { userId: user._id },
        updates,
        { new: true, runValidators: true }
      );
    } else if (user.role === 'faculty') {
      await Faculty.findOneAndUpdate(
        { userId: user._id },
        updates,
        { new: true, runValidators: true }
      );
    } else if (user.role === 'admin') {
      await Admin.findOneAndUpdate(
        { userId: user._id },
        updates,
        { new: true, runValidators: true }
      );
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all password fields'
      });
    }

    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match'
      });
    }

    // Check password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const user = await User.findById(req.user._id).select('+password');

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is same as old
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Send email notification
    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Changed Successfully',
        message: `Your password has been changed successfully on ${new Date().toLocaleString()}. If you did not make this change, please contact support immediately.`
      });
    } catch (emailError) {
      console.error('Password change email error:', emailError);
    }

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email address'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // For security, don't reveal if user exists
      return res.json({
        success: true,
        message: 'If your email is registered, you will receive a password reset link'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpire = Date.now() + 30 * 60 * 1000; // 30 minutes

    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    user.resetPasswordExpire = resetTokenExpire;
    
    await user.save();

    // Create reset URL
    const resetUrl = `${req.protocol}://${req.get('host')}/api/auth/reset-password/${resetToken}`;

    // Send email
    const message = `
      <h2>Password Reset Request</h2>
      <p>You are receiving this email because you (or someone else) has requested to reset your password.</p>
      <p>Please click on the following link to reset your password:</p>
      <p><a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
      <p>This link will expire in 30 minutes.</p>
      <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
      <hr>
      <p><strong>Note:</strong> For security reasons, please do not share this link with anyone.</p>
    `;

    await sendEmail({
      email: user.email,
      subject: 'Password Reset Request - Nursing Institute',
      html: message
    });

    res.json({
      success: true,
      message: 'Password reset email sent'
    });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset'
    });
  }
};

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide password and confirm password'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Hash token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Check if new password is same as old
    const isSamePassword = await user.comparePassword(password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from old password'
      });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    
    await user.save();

    // Send confirmation email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset Successful - Nursing Institute',
        message: `Your password has been successfully reset on ${new Date().toLocaleString()}. If you did not perform this action, please contact support immediately.`
      });
    } catch (emailError) {
      console.error('Password reset confirmation email error:', emailError);
    }

    res.json({
      success: true,
      message: 'Password reset successful. You can now login with your new password.'
    });
  } catch (error) {
    console.error('Reset Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    // Add logout history if user is admin
    if (req.user.role === 'admin') {
      const adminProfile = await Admin.findOne({ userId: req.user._id });
      if (adminProfile && adminProfile.addLoginHistory) {
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];
        await adminProfile.addLoginHistory(ip, userAgent, 'Logout');
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout Error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

// @desc    Verify token
// @route   GET /api/auth/verify-token
// @access  Private
exports.verifyToken = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Token is valid',
      user: req.user
    });
  } catch (error) {
    console.error('Verify Token Error:', error);
    res.status(500).json({
      success: false,
      message: 'Token verification failed'
    });
  }
};