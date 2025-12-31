const User = require('../models/User');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin)
exports.getAllUsers = async (req, res) => {
    try {
        const { role, status, search } = req.query;
        
        const query = {};
        
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
        
        const users = await User.find(query)
            .select('-password -resetPasswordToken -resetPasswordExpires')
            .sort({ createdAt: -1 });
        
        // Get additional info based on role
        const usersWithDetails = await Promise.all(
            users.map(async (user) => {
                const userObj = user.toObject();
                
                if (user.role === 'student') {
                    const student = await Student.findOne({ userId: user._id })
                        .select('fullName studentId contactNumber courseEnrolled academicStatus');
                    userObj.profile = student;
                } else if (user.role === 'faculty') {
                    const faculty = await Faculty.findOne({ userId: user._id })
                        .select('fullName facultyId designation department contactNumber');
                    userObj.profile = faculty;
                }
                
                return userObj;
            })
        );
        
        res.json({
            success: true,
            count: usersWithDetails.length,
            data: usersWithDetails
        });
        
    } catch (error) {
        console.error('Get All Users Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users'
        });
    }
};

// @desc    Get single user
// @route   GET /api/admin/users/:id
// @access  Private (Admin)
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password -resetPasswordToken -resetPasswordExpires');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        let profile = null;
        
        if (user.role === 'student') {
            profile = await Student.findOne({ userId: user._id })
                .populate('courseEnrolled', 'courseName')
                .select('-userId -__v');
        } else if (user.role === 'faculty') {
            profile = await Faculty.findOne({ userId: user._id })
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
        console.error('Get User By ID Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user'
        });
    }
};

// @desc    Create new user
// @route   POST /api/admin/users
// @access  Private (Admin)
exports.createUser = async (req, res) => {
    try {
        const { 
            username, 
            email, 
            password, 
            role, 
            fullName,
            contactNumber,
            ...additionalData 
        } = req.body;
        
        // Validate required fields
        if (!username || !email || !password || !role || !fullName) {
            return res.status(400).json({
                success: false,
                message: 'Required fields: username, email, password, role, fullName'
            });
        }
        
        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ username }, { email }]
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this username or email already exists'
            });
        }
        
        // Create user
        const user = new User({
            username,
            email,
            password,
            role,
            isActive: true
        });
        
        await user.save();
        
        // Create profile based on role
        let profile = null;
        
        if (role === 'student') {
            // Generate student ID
            const currentYear = new Date().getFullYear();
            const studentCount = await Student.countDocuments({ 
                batchYear: currentYear 
            });
            const studentId = `STU${currentYear}${String(studentCount + 1).padStart(3, '0')}`;
            
            profile = new Student({
                userId: user._id,
                studentId,
                fullName,
                email: user.email,
                contactNumber,
                courseEnrolled: additionalData.courseEnrolled || null,
                batchYear: additionalData.batchYear || currentYear,
                semester: additionalData.semester || 1,
                academicStatus: 'Active'
            });
            
            await profile.save();
            
        } else if (role === 'faculty') {
            // Generate faculty ID
            const facultyCount = await Faculty.countDocuments();
            const facultyId = `FAC${String(facultyCount + 1).padStart(3, '0')}`;
            
            profile = new Faculty({
                userId: user._id,
                facultyId,
                fullName,
                email: user.email,
                contactNumber,
                designation: additionalData.designation || 'Lecturer',
                department: additionalData.department || 'General',
                isActive: true
            });
            
            await profile.save();
        }
        
        // Send welcome email
        try {
            const emailText = `
Welcome to Nursing Institute Management System!

Your account has been created successfully.

Login Details:
Username: ${username}
Password: ${password}
Role: ${role}

Please login and change your password immediately.

Login URL: ${process.env.FRONTEND_URL}/login

Regards,
Nursing Institute Administration
            `;
            
            await sendEmail({
                email: user.email,
                subject: 'Welcome to Nursing Institute - Account Created',
                message: emailText
            });
        } catch (emailError) {
            console.warn('Failed to send welcome email:', emailError.message);
        }
        
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: {
                user: {
                    _id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    isActive: user.isActive
                },
                profile,
                credentials: {
                    username,
                    password,
                    note: 'User should change password on first login'
                }
            }
        });
        
    } catch (error) {
        console.error('Create User Error:', error);
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
        const allowedUserUpdates = ['username', 'email', 'role', 'isActive'];
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
                updates,
                { new: true, runValidators: true }
            );
        } else if (user.role === 'faculty') {
            await Faculty.findOneAndUpdate(
                { userId: id },
                updates,
                { new: true, runValidators: true }
            );
        }
        
        res.json({
            success: true,
            message: 'User updated successfully',
            data: user
        });
        
    } catch (error) {
        console.error('Update User Error:', error);
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
    try {
        const { id } = req.params;
        
        const user = await User.findById(id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Prevent deletion of last admin
        if (user.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
            if (adminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete the last active admin user'
                });
            }
        }
        
        // Delete user
        await user.deleteOne();
        
        // Delete associated profile
        if (user.role === 'student') {
            await Student.findOneAndDelete({ userId: id });
        } else if (user.role === 'faculty') {
            await Faculty.findOneAndDelete({ userId: id });
        }
        
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete User Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user'
        });
    }
};

// @desc    Reset user password
// @route   POST /api/admin/users/:id/reset-password
// @access  Private (Admin)
exports.resetUserPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword, sendEmail: sendResetEmail } = req.body;
        
        const user = await User.findById(id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Generate new password if not provided
        const password = newPassword || generateRandomPassword();
        
        // Update password
        user.password = password;
        await user.save();
        
        // Send email if requested
        if (sendResetEmail) {
            try {
                const emailText = `
Password Reset Notification

Your password has been reset by the administrator.

New Password: ${password}

Please login and change your password immediately for security.

Login URL: ${process.env.FRONTEND_URL}/login

If you didn't request this reset, please contact the administrator immediately.

Regards,
Nursing Institute Administration
                `;
                
                await sendEmail({
                    email: user.email,
                    subject: 'Password Reset - Nursing Institute',
                    message: emailText
                });
            } catch (emailError) {
                console.warn('Failed to send password reset email:', emailError.message);
            }
        }
        
        res.json({
            success: true,
            message: 'Password reset successfully',
            data: {
                username: user.username,
                email: user.email,
                newPassword: sendResetEmail ? 'Sent via email' : password
            }
        });
        
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password'
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
        
        // Prevent deactivating last admin
        if (user.role === 'admin' && user.isActive) {
            const activeAdminCount = await User.countDocuments({ 
                role: 'admin', 
                isActive: true 
            });
            
            if (activeAdminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot deactivate the last active admin user'
                });
            }
        }
        
        user.isActive = !user.isActive;
        await user.save();
        
        res.json({
            success: true,
            message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
            data: {
                isActive: user.isActive,
                username: user.username
            }
        });
        
    } catch (error) {
        console.error('Toggle Active Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user status'
        });
    }
};

// Helper function to generate random password
const generateRandomPassword = () => {
    const length = 10;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&';
    let password = '';
    
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
};