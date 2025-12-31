const User = require('../models/User');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Admin = require('../models/Admin');
const Course = require('../models/Course');
const bcrypt = require('bcryptjs');

// @desc    Get all users with profiles
// @route   GET /api/admin/users
// @access  Private (Admin)
exports.getAllUsers = async (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    
    // Build query
    let query = {};
    
    if (role) {
      query.role = role;
    }
    
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get users with pagination
    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -resetPasswordToken -resetPasswordExpire')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);
    
    // Get profiles for each user
    const usersWithProfiles = await Promise.all(
      users.map(async (user) => {
        let profile = null;
        
        if (user.role === 'student') {
          profile = await Student.findOne({ userId: user._id })
            .select('studentId firstName lastName fullName contactNumber academicStatus courseEnrolled batchYear semester')
            .populate('courseEnrolled', 'courseName courseCode');
        } else if (user.role === 'faculty') {
          profile = await Faculty.findOne({ userId: user._id })
            .select('facultyId fullName designation department contactNumber');
        } else if (user.role === 'admin') {
          profile = await Admin.findOne({ userId: user._id })
            .select('employeeId fullName designation department contactNumber');
        }
        
        return {
          ...user.toObject(),
          profile
        };
      })
    );
    
    res.json({
      success: true,
      count: total,
      data: usersWithProfiles,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

// @desc    Get user by ID
// @route   GET /api/admin/users/:id
// @access  Private (Admin)
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpire');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    let profile = null;
    
    // Get profile based on role
    if (user.role === 'student') {
      profile = await Student.findOne({ userId: user._id })
        .populate('courseEnrolled')
        .select('-userId -__v');
    } else if (user.role === 'faculty') {
      profile = await Faculty.findOne({ userId: user._id })
        .select('-userId -__v');
    } else if (user.role === 'admin') {
      profile = await Admin.findOne({ userId: user._id })
        .select('-userId -__v');
    }
    
    res.json({
      success: true,
      data: {
        ...user.toObject(),
        profile
      }
    });
    
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
};

// @desc    Create new user with profile
// @route   POST /api/admin/users
// @access  Private (Admin)
exports.createUser = async (req, res) => {
  const session = await User.startSession();
  session.startTransaction();
  
  try {
    const {
      username,
      email,
      password,
      role,
      fullName,
      contactNumber,
      isActive = true,
      courseEnrolled,
      batchYear,
      semester,
      designation,
      department
    } = req.body;
    
    // Validation
    if (!username || !email || !role || !fullName) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Username, email, role, and fullName are required'
      });
    }
    
    // Check for existing user
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    }).session(session);
    
    if (existingUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }
    
    // Generate password if not provided
    let userPassword = password;
    if (!password) {
      userPassword = generateRandomPassword();
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userPassword, salt);
    
    // Create User
    const user = new User({
      username,
      email,
      password: hashedPassword,
      role,
      isActive
    });
    
    await user.save({ session });
    
    // Create profile based on role
    let profile = null;
    
    if (role === 'student') {
      // Validate course
      const course = await Course.findById(courseEnrolled).session(session);
      if (!course) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Invalid course selected'
        });
      }
      
      // Generate student ID
      const studentId = await generateUniqueStudentId(batchYear);
      
      profile = new Student({
        userId: user._id,
        studentId,
        fullName,
        email,
        contactNumber: contactNumber || '',
        courseEnrolled,
        batchYear: batchYear || new Date().getFullYear(),
        semester: semester || 1,
        admissionDate: new Date(),
        academicStatus: 'Active'
      });
      
      await profile.save({ session });
      
      // Update course seats
      course.seatsFilled += 1;
      await course.save({ session });
      
    } else if (role === 'faculty') {
      // Generate faculty ID
      const facultyId = await generateUniqueFacultyId();
      
      profile = new Faculty({
        userId: user._id,
        facultyId,
        fullName,
        email,
        contactNumber: contactNumber || '',
        designation: designation || 'Lecturer',
        department: department || 'Medical-Surgical Nursing',
        dateOfJoining: new Date(),
        isActive: true
      });
      
      await profile.save({ session });
      
    } else if (role === 'admin') {
      // Generate admin ID
      const employeeId = await generateUniqueAdminId();
      
      profile = new Admin({
        userId: user._id,
        employeeId,
        fullName,
        email,
        contactNumber: contactNumber || '',
        designation: designation || 'Administrator',
        department: department || 'Administration',
        dateOfJoining: new Date()
      });
      
      await profile.save({ session });
    }
    
    // Commit transaction
    await session.commitTransaction();
    session.endSession();
    
    // Prepare response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.status(201).json({
      success: true,
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully`,
      data: {
        user: userResponse,
        profile: profile.toObject(),
        credentials: !password ? {
          username,
          password: userPassword,
          note: 'Generated password - change on first login'
        } : null
      }
    });
    
  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    session.endSession();
    
    console.error('Create user error:', error);
    
    // Check for duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error. User may already exist.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create user'
    });
  }
};

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private (Admin)
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Update user fields
    const allowedUserUpdates = ['username', 'email', 'isActive'];
    Object.keys(updates).forEach(key => {
      if (allowedUserUpdates.includes(key)) {
        user[key] = updates[key];
      }
    });
    
    await user.save();
    
    // Update profile based on role
    if (user.role === 'student') {
      await Student.findOneAndUpdate(
        { userId: id },
        {
          $set: {
            fullName: updates.fullName || user.profile?.fullName,
            contactNumber: updates.contactNumber,
            courseEnrolled: updates.courseEnrolled,
            batchYear: updates.batchYear,
            semester: updates.semester,
            academicStatus: updates.academicStatus
          }
        },
        { new: true, runValidators: true }
      );
    } else if (user.role === 'faculty') {
      await Faculty.findOneAndUpdate(
        { userId: id },
        {
          $set: {
            fullName: updates.fullName || user.profile?.fullName,
            contactNumber: updates.contactNumber,
            designation: updates.designation,
            department: updates.department,
            isActive: updates.isActive !== undefined ? updates.isActive : true
          }
        },
        { new: true, runValidators: true }
      );
    } else if (user.role === 'admin') {
      await Admin.findOneAndUpdate(
        { userId: id },
        {
          $set: {
            fullName: updates.fullName || user.profile?.fullName,
            contactNumber: updates.contactNumber,
            designation: updates.designation,
            department: updates.department
          }
        },
        { new: true, runValidators: true }
      );
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
    
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update user'
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin)
exports.deleteUser = async (req, res) => {
  const session = await User.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    const user = await User.findById(id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Delete profile based on role
    if (user.role === 'student') {
      const student = await Student.findOne({ userId: id }).session(session);
      if (student) {
        // Update course seats if student is enrolled
        if (student.courseEnrolled) {
          await Course.findByIdAndUpdate(
            student.courseEnrolled,
            { $inc: { seatsFilled: -1 } },
            { session }
          );
        }
        await Student.findByIdAndDelete(student._id).session(session);
      }
    } else if (user.role === 'faculty') {
      await Faculty.findOneAndDelete({ userId: id }).session(session);
    } else if (user.role === 'admin') {
      await Admin.findOneAndDelete({ userId: id }).session(session);
    }
    
    // Delete user account
    await User.findByIdAndDelete(id).session(session);
    
    // Commit transaction
    await session.commitTransaction();
    session.endSession();
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
    
  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    session.endSession();
    
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

// @desc    Toggle user active status
// @route   PATCH /api/admin/users/:id/toggle-active
// @access  Private (Admin)
exports.toggleUserActive = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    user.isActive = !user.isActive;
    await user.save();
    
    // Also update profile active status for faculty/admin
    if (user.role === 'faculty') {
      await Faculty.findOneAndUpdate(
        { userId: id },
        { $set: { isActive: user.isActive } }
      );
    }
    
    res.json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: user.isActive }
    });
    
  } catch (error) {
    console.error('Toggle active error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
};

// @desc    Reset user password
// @route   POST /api/admin/users/:id/reset-password
// @access  Private (Admin)
exports.resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword, sendEmail = true } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password is required'
      });
    }
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    user.password = hashedPassword;
    await user.save();
    
    // TODO: Send email notification
    if (sendEmail) {
      console.log(`Password reset email would be sent to ${user.email}`);
      // await sendPasswordResetEmail(user.email, newPassword);
    }
    
    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        email: user.email,
        passwordSent: sendEmail,
        password: newPassword // Only for immediate display, not for production
      }
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

// Helper functions
const generateRandomPassword = () => {
  const length = 10;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$!';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return password;
};

const generateUniqueStudentId = async (batchYear) => {
  const year = batchYear || new Date().getFullYear();
  const yearShort = year.toString().slice(-2);
  
  let studentId;
  let isUnique = false;
  
  while (!isUnique) {
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    studentId = `STU${yearShort}${random}`;
    
    const existing = await Student.findOne({ studentId });
    if (!existing) {
      isUnique = true;
    }
  }
  
  return studentId;
};

const generateUniqueFacultyId = async () => {
  let facultyId;
  let isUnique = false;
  
  while (!isUnique) {
    const yearShort = new Date().getFullYear().toString().slice(-2);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    facultyId = `FAC${yearShort}${random}`;
    
    const existing = await Faculty.findOne({ facultyId });
    if (!existing) {
      isUnique = true;
    }
  }
  
  return facultyId;
};

const generateUniqueAdminId = async () => {
  let employeeId;
  let isUnique = false;
  
  while (!isUnique) {
    const yearShort = new Date().getFullYear().toString().slice(-2);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    employeeId = `ADM${yearShort}${random}`;
    
    const existing = await Admin.findOne({ employeeId });
    if (!existing) {
      isUnique = true;
    }
  }
  
  return employeeId;
};