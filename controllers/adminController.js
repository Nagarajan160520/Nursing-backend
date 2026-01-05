const User = require('../models/User');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Course = require('../models/Course');
const Gallery = require('../models/Gallery');
const News = require('../models/News');
const Attendance = require('../models/Attendance');
const Marks = require('../models/Marks');
const Download = require('../models/Download');
const Notification = require('../models/Notification');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const sendEmail = require('../utils/sendEmail');
const fs = require('fs');
const nodemailer = require('nodemailer');

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/dashboard/stats
// @access  Private (Admin)
exports.getDashboardStats = async (req, res) => {
  try {
    // Get counts
    const [
      totalStudents,
      totalFaculty,
      totalCourses,
      totalGallery,
      totalNews,
      totalDownloads
    ] = await Promise.all([
      Student.countDocuments(),
      Faculty.countDocuments(),
      Course.countDocuments(),
      Gallery.countDocuments(),
      News.countDocuments(),
      Download.countDocuments()
    ]);

    // Get recent students
    const recentStudents = await Student.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('courseEnrolled', 'courseName')
      .select('studentId fullName courseEnrolled semester admissionDate academicStatus');

    // Get recent news
    const recentNews = await News.find()
      .sort({ publishedAt: -1 })
      .limit(5)
      .select('title category publishedAt views');

    // Get admission trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const admissionTrends = await Student.aggregate([
      {
        $match: {
          admissionDate: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$admissionDate' },
            month: { $month: '$admissionDate' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      },
      {
        $limit: 6
      }
    ]);

    // Get course-wise student distribution
    const courseDistribution = await Student.aggregate([
      {
        $group: {
          _id: '$courseEnrolled',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'courses',
          localField: '_id',
          foreignField: '_id',
          as: 'course'
        }
      },
      {
        $unwind: '$course'
      },
      {
        $project: {
          courseName: '$course.courseName',
          count: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalStudents,
          totalFaculty,
          totalCourses,
          totalGallery,
          totalNews,
          totalDownloads
        },
        recentStudents,
        recentNews,
        admissionTrends,
        courseDistribution
      }
    });
  } catch (error) {
    console.error('Get Dashboard Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
};

// @desc    Add new course
// @route   POST /api/admin/courses
// @access  Private (Admin)
exports.addCourse = async (req, res) => {
  try {
    const courseData = {
      ...req.body,
      createdBy: req.user._id
    };

    // Check if course code already exists
    const existingCourse = await Course.findOne({ courseCode: courseData.courseCode });
    if (existingCourse) {
      return res.status(400).json({
        success: false,
        message: 'Course code already exists'
      });
    }

    const course = new Course(courseData);
    await course.save();

    res.status(201).json({
      success: true,
      message: 'Course added successfully',
      data: course
    });
  } catch (error) {
    console.error('Add Course Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add course'
    });
  }
};

// @desc    Update course
// @route   PUT /api/admin/courses/:id
// @access  Private (Admin)
exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Prevent updating course code if it already exists elsewhere
    if (updates.courseCode && updates.courseCode !== course.courseCode) {
      const existingCourse = await Course.findOne({ 
        courseCode: updates.courseCode,
        _id: { $ne: id }
      });
      
      if (existingCourse) {
        return res.status(400).json({
          success: false,
          message: 'Course code already exists'
        });
      }
    }

    Object.keys(updates).forEach(key => {
      course[key] = updates[key];
    });

    await course.save();

    res.json({
      success: true,
      message: 'Course updated successfully',
      data: course
    });
  } catch (error) {
    console.error('Update Course Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update course'
    });
  }
};

// @desc    Delete course
// @route   DELETE /api/admin/courses/:id
// @access  Private (Admin)
exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if course has enrolled students
    const enrolledStudents = await Student.countDocuments({ courseEnrolled: id });
    if (enrolledStudents > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete course with enrolled students'
      });
    }

    const course = await Course.findByIdAndDelete(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    res.json({
      success: true,
      message: 'Course deleted successfully'
    });
  } catch (error) {
    console.error('Delete Course Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete course'
    });
  }
};

// @desc    Get all courses
// @route   GET /api/admin/courses
// @access  Private (Admin)
exports.getAllCourses = async (req, res) => {
  try {
    const { status, search } = req.query;
    
    const query = {};
    
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }
    
    if (search) {
      query.$or = [
        { courseCode: { $regex: search, $options: 'i' } },
        { courseName: { $regex: search, $options: 'i' } }
      ];
    }

    const courses = await Course.find(query)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'username');

    res.json({
      success: true,
      data: courses,
      count: courses.length
    });
  } catch (error) {
    console.error('Get All Courses Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch courses'
    });
  }
};

// @desc    Get course details
// @route   GET /api/admin/courses/:id
// @access  Private (Admin)
exports.getCourseDetails = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('createdBy', 'username')
      .populate('subjects.faculty', 'fullName designation');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Get enrolled students count and details
    const students = await Student.find({ courseEnrolled: course._id })
      .select('studentId fullName semester academicStatus')
      .sort({ semester: 1 });

    // Get course faculty
    const facultyIds = course.subjects.map(subject => subject.faculty).filter(Boolean);
    const faculty = await Faculty.find({ _id: { $in: facultyIds } })
      .select('fullName designation department');

    res.json({
      success: true,
      data: {
        course,
        students: {
          count: students.length,
          list: students
        },
        faculty
      }
    });
  } catch (error) {
    console.error('Get Course Details Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch course details'
    });
  }
};

// @desc    Upload gallery image
// @route   POST /api/admin/gallery
// @access  Private (Admin)
exports.uploadGallery = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image'
      });
    }

    const galleryData = {
      title: req.body.title,
      description: req.body.description,
      imageUrl: `/uploads/gallery/${req.file.filename}`,
      thumbnailUrl: `/uploads/gallery/${req.file.filename}`,
      category: req.body.category || 'Events',
      tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim().toLowerCase()) : [],
      album: req.body.album || 'General',
      uploadedBy: req.user._id,
      featured: req.body.featured === 'true',
      displayOrder: parseInt(req.body.displayOrder) || 0
    };

    const galleryItem = new Gallery(galleryData);
    await galleryItem.save();

    // Build full URLs so frontend can display immediately
    const host = `${req.protocol}://${req.get('host')}`;
    const itemObj = galleryItem.toObject ? galleryItem.toObject() : galleryItem;
    itemObj.fullImageUrl = `${host}${itemObj.imageUrl}`;
    itemObj.fullThumbnailUrl = `${host}${itemObj.thumbnailUrl || itemObj.imageUrl}`;

    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: itemObj
    });
  } catch (error) {
    console.error('Upload Gallery Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload image'
    });
  }
};

// @desc    Get all gallery items
// @route   GET /api/admin/gallery
// @access  Private (Admin)
exports.getAllGallery = async (req, res) => {
  try {
    const { category, album, featured, search } = req.query;
    
    const query = {};
    
    if (category) {
      query.category = category;
    }
    
    if (album) {
      query.album = album;
    }
    
    if (featured) {
      query.featured = featured === 'true';
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    const gallery = await Gallery.find(query)
      .sort({ displayOrder: 1, createdAt: -1 })
      .populate('uploadedBy', 'username');

    // Get unique albums and categories for filters
    const albums = await Gallery.distinct('album');
    const categories = await Gallery.distinct('category');

    // Attach full URLs so admin UI does not need to build them
    const host = `${req.protocol}://${req.get('host')}`;
    const galleryWithUrls = gallery.map(item => {
      const obj = item.toObject ? item.toObject() : item;
      obj.fullImageUrl = obj.imageUrl && obj.imageUrl.startsWith('http') ? obj.imageUrl : `${host}${obj.imageUrl}`;
      obj.fullThumbnailUrl = obj.thumbnailUrl && obj.thumbnailUrl.startsWith('http') ? obj.thumbnailUrl : `${host}${obj.thumbnailUrl || obj.imageUrl}`;
      return obj;
    });

    res.json({
      success: true,
      data: {
        gallery: galleryWithUrls,
        filters: {
          albums,
          categories
        },
        count: galleryWithUrls.length
      }
    });
  } catch (error) {
    console.error('Get All Gallery Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gallery items'
    });
  }
};

// @desc    Update gallery item
// @route   PUT /api/admin/gallery/:id
// @access  Private (Admin)
exports.updateGallery = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const galleryItem = await Gallery.findById(id);
    if (!galleryItem) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    // Handle tags conversion
    if (updates.tags && typeof updates.tags === 'string') {
      updates.tags = updates.tags.split(',').map(tag => tag.trim().toLowerCase());
    }

    Object.keys(updates).forEach(key => {
      galleryItem[key] = updates[key];
    });

    await galleryItem.save();

    res.json({
      success: true,
      message: 'Gallery item updated successfully',
      data: galleryItem
    });
  } catch (error) {
    console.error('Update Gallery Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update gallery item'
    });
  }
};

// @desc    Delete gallery item
// @route   DELETE /api/admin/gallery/:id
// @access  Private (Admin)
exports.deleteGallery = async (req, res) => {
  try {
    const { id } = req.params;

    const galleryItem = await Gallery.findByIdAndDelete(id);
    if (!galleryItem) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    // TODO: Delete actual image file from server

    res.json({
      success: true,
      message: 'Gallery item deleted successfully'
    });
  } catch (error) {
    console.error('Delete Gallery Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete gallery item'
    });
  }
};

// Helper function to create notification for news
const createNotificationForNews = async (news) => {
  try {
    // Determine receivers based on target audience
    let receivers = [];

    if (news.targetAudience.includes('all')) {
      // Get all users
      const allUsers = await User.find({ isActive: true }).select('_id');
      receivers = allUsers.map(user => ({
        user: user._id,
        read: false
      }));
    } else if (news.targetAudience.includes('students')) {
      // Get all students
      const students = await Student.find().populate('userId');
      receivers = students.map(student => ({
        user: student.userId._id,
        read: false
      }));
    }
    // Add more conditions for other target audiences

    const notification = new Notification({
      title: news.title,
      message: news.excerpt || news.content.substring(0, 200) + '...',
      type: 'info',
      category: news.category,
      priority: news.priority,
      sender: news.author,
      receivers,
      targetType: 'all',
      sendMethod: ['dashboard'],
      actionUrl: `/news/${news.slug}`,
      actionText: 'Read More'
    });

    await notification.save();
  } catch (error) {
    console.error('Create News Notification Error:', error);
  }
};

// @desc    Add news/event
// @route   POST /api/admin/news
// @access  Private (Admin)
exports.addNews = async (req, res) => {
  try {
    const newsData = {
      ...req.body,
      author: req.user._id
    };

    // Handle attachments if any
    if (req.files && req.files.length > 0) {
      newsData.attachments = req.files.map(file => ({
        fileName: file.originalname,
        fileUrl: `/uploads/news/${file.filename}`,
        fileType: file.mimetype,
        fileSize: file.size
      }));
    }

    const news = new News(newsData);
    await news.save();

    // Create notification for target audience
    if (news.isPublished) {
      await createNotificationForNews(news);
    }

    res.status(201).json({
      success: true,
      message: 'News added successfully',
      data: news
    });
  } catch (error) {
    console.error('Add News Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add news'
    });
  }
};

// @desc    Get all news
// @route   GET /api/admin/news
// @access  Private (Admin)
exports.getAllNews = async (req, res) => {
  try {
    const { category, status, search, startDate, endDate, page = 1, limit = 20 } = req.query;
    
    const query = {};
    
    if (category) {
      query.category = category;
    }
    
    if (status === 'published') {
      query.isPublished = true;
    } else if (status === 'draft') {
      query.isPublished = false;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (startDate && endDate) {
      query.publishedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const news = await News.find(query)
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-__v');

    const total = await News.countDocuments(query);

    res.json({
      success: true,
      data: {
        news,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get All News Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch news'
    });
  }
};

// -----------------------
// Admin Notifications
// -----------------------

// @desc    Create notification
// @route   POST /api/admin/notifications
// @access  Private (Admin)
exports.addNotification = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      sender: req.user._id
    };

    // If targetType is 'all', populate receivers automatically
    if (payload.targetType === 'all') {
      const users = await User.find({ isActive: true }).select('_id');
      payload.receivers = users.map(u => ({ user: u._id, read: false }));
    } else if (payload.targetType === 'students' || payload.targetType === 'course') {
      // Support populating receivers by course or student later; for now rely on provided targetIds or manual receivers
      if (payload.targetIds && payload.targetIds.length > 0) {
        // If targetModel is Student or Course, find related users
        if (payload.targetModel === 'Student') {
          const students = await Student.find({ _id: { $in: payload.targetIds } }).populate('userId');
          payload.receivers = students.map(s => ({ user: s.userId._id, read: false }));
        }
      }
    }

    const notification = new Notification(payload);
    await notification.save();

    res.status(201).json({
      success: true,
      message: 'Notification created',
      data: notification
    });
  } catch (error) {
    console.error('Add Notification Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create notification'
    });
  }
};

// @desc    Get all notifications
// @route   GET /api/admin/notifications
// @access  Private (Admin)
exports.getAllNotifications = async (req, res) => {
  try {
    const { category, priority, status, search, page = 1, limit = 20 } = req.query;

    const query = {};
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('sender', 'username email')
      .select('-__v');

    res.json({
      success: true,
      data: {
        notifications,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get All Notifications Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
};

// @desc    Get one notification
// @route   GET /api/admin/notifications/:id
// @access  Private (Admin)
exports.getNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id).populate('sender', 'username email');
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    console.error('Get Notification Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notification' });
  }
};

// @desc    Update notification
// @route   PUT /api/admin/notifications/:id
// @access  Private (Admin)
exports.updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    Object.keys(req.body).forEach(key => {
      notification[key] = req.body[key];
    });

    // If set to broadcast to all, populate receivers
    if (req.body.targetType === 'all' && (!notification.receivers || notification.receivers.length === 0)) {
      const users = await User.find({ isActive: true }).select('_id');
      notification.receivers = users.map(u => ({ user: u._id, read: false }));
    }

    await notification.save();

    res.json({ success: true, message: 'Notification updated', data: notification });
  } catch (error) {
    console.error('Update Notification Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
};

// @desc    Delete notification
// @route   DELETE /api/admin/notifications/:id
// @access  Private (Admin)
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    await notification.remove();

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete Notification Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
};

// @desc    Update news
// @route   PUT /api/admin/news/:id
// @access  Private (Admin)
exports.updateNews = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const news = await News.findById(id);
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News not found'
      });
    }

    // Handle tags
    if (updates.tags && typeof updates.tags === 'string') {
      updates.tags = updates.tags.split(',').map(tag => tag.trim().toLowerCase());
    }

    // Handle target audiences
    if (updates.targetAudience && typeof updates.targetAudience === 'string') {
      updates.targetAudience = updates.targetAudience.split(',').map(item => item.trim());
    }

    Object.keys(updates).forEach(key => {
      news[key] = updates[key];
    });

    await news.save();

    res.json({
      success: true,
      message: 'News updated successfully',
      data: news
    });
  } catch (error) {
    console.error('Update News Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update news'
    });
  }
};

// @desc    Delete news
// @route   DELETE /api/admin/news/:id
// @access  Private (Admin)
exports.deleteNews = async (req, res) => {
  try {
    const { id } = req.params;

    const news = await News.findByIdAndDelete(id);
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News not found'
      });
    }

    res.json({
      success: true,
      message: 'News deleted successfully'
    });
  } catch (error) {
    console.error('Delete News Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete news'
    });
  }
};

// @desc    Generate unique student ID
// @param   batchYear, courseCode
const generateStudentId = async (batchYear, courseCode) => {
  try {
    // Format: COURSE-BATCHYEAR-001 (e.g., GNM-2024-001)
    const prefix = `${courseCode}-${batchYear}`;
    
    // Find the last student ID with this prefix
    const lastStudent = await Student.findOne({
      studentId: new RegExp(`^${prefix}`)
    }).sort({ studentId: -1 });
    
    let sequence = 1;
    if (lastStudent && lastStudent.studentId) {
      const lastSeq = parseInt(lastStudent.studentId.split('-')[2]);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }
    
    // Format sequence with leading zeros (001, 002, etc.)
    const sequenceStr = sequence.toString().padStart(3, '0');
    return `${prefix}-${sequenceStr}`;
  } catch (error) {
    console.error('Generate Student ID Error:', error);
    // Fallback: timestamp-based ID
    return `${courseCode}-${batchYear}-${Date.now().toString().slice(-3)}`;
  }
};

// @desc    Check if email exists
// @route   GET /api/admin/students/check-email
// @access  Private (Admin)
exports.checkEmail = async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required'
      });
    }

    // Check in User collection
    const userExists = await User.findOne({ email: email.toLowerCase() });
    
    // Check in Student collection (personal email) 
    const studentExists = await Student.findOne({ 
      personalEmail: email.toLowerCase() 
    });

    res.json({
      success: true,
      exists: !!(userExists || studentExists),
      message: userExists || studentExists 
        ? 'Email already exists in system' 
        : 'Email is available'
    });

  } catch (error) {
    console.error('Check Email Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking email'
    });
  }
};

// @desc    Check if mobile exists
// @route   GET /api/admin/students/check-mobile
// @access  Private (Admin)
exports.checkMobile = async (req, res) => {
  try {
    const { mobile } = req.query;
    
    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile parameter is required'
      });
    }

    const studentExists = await Student.findOne({ 
      mobileNumber: mobile 
    });

    res.json({
      success: true,
      exists: !!studentExists,
      message: studentExists 
        ? 'Mobile number already exists' 
        : 'Mobile number is available'
    });

  } catch (error) {
    console.error('Check Mobile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking mobile number'
    });
  }
};

// @desc    Get student count for sequence
// @route   GET /api/admin/students/count
// @access  Private (Admin)
exports.getStudentCount = async (req, res) => {
  try {
    const { year, courseCode } = req.query;
    
    let query = {};
    
    if (year) {
      query.admissionYear = parseInt(year);
    }
    
    if (courseCode) {
      // Find course by code
      const course = await Course.findOne({ courseCode });
      if (course) {
        query.courseEnrolled = course._id;
      }
    }
    
    const count = await Student.countDocuments(query);
    
    res.json({
      success: true,
      count: count
    });

  } catch (error) {
    console.error('Get Student Count Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting student count'
    });
  }
};

// @desc    Get all faculty
// @route   GET /api/admin/faculty
// @access  Private (Admin)
exports.getAllFaculty = async (req, res) => {
  try {
    const { search, department, isActive } = req.query;
    
    let query = {};
    
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { facultyId: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (department) {
      query.department = department;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    const faculty = await Faculty.find(query)
      .select('-__v')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: faculty,
      count: faculty.length
    });

  } catch (error) {
    console.error('Get Faculty Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty'
    });
  }
};

// @desc    Get faculty by ID
// @route   GET /api/admin/faculty/:id
// @access  Private (Admin)
exports.getFacultyById = async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id)
      .select('-__v')
      .populate('userId', 'username email isActive');

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: 'Faculty not found'
      });
    }

    res.json({
      success: true,
      data: faculty
    });

  } catch (error) {
    console.error('Get Faculty By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty'
    });
  }
};

// @desc    Add new faculty
// @route   POST /api/admin/faculty
// @access  Private (Admin)
exports.addFaculty = async (req, res) => {
  try {
    const {
      facultyId,
      fullName,
      email,
      password,
      designation,
      department,
      qualification,
      experience,
      contactNumber,
      address,
      isActive = true
    } = req.body;

    // Validate required fields
    if (!facultyId || !fullName || !email || !designation || !department) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: facultyId, fullName, email, designation, department'
      });
    }

    // Check if email exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Check if faculty ID exists
    const existingFacultyId = await Faculty.findOne({ facultyId });
    if (existingFacultyId) {
      return res.status(400).json({
        success: false,
        message: 'Faculty ID already exists'
      });
    }

    // Create user account
    const user = new User({
      username: facultyId,
      email: email,
      password: password || 'faculty@123',
      role: 'faculty',
      isActive: isActive
    });

    await user.save();

    // Create faculty profile
    const faculty = new Faculty({
      userId: user._id,
      facultyId: facultyId,
      fullName: fullName,
      email: email,
      designation: designation,
      department: department,
      qualification: qualification || '',
      experience: experience || 0,
      contactNumber: contactNumber || '',
      address: address || '',
      isActive: isActive
    });

    await faculty.save();

    res.status(201).json({
      success: true,
      message: 'Faculty added successfully',
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        faculty: {
          _id: faculty._id,
          facultyId: faculty.facultyId,
          fullName: faculty.fullName,
          designation: faculty.designation,
          department: faculty.department
        }
      }
    });

  } catch (error) {
    console.error('Add Faculty Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add faculty'
    });
  }
};

// @desc    Update faculty
// @route   PUT /api/admin/faculty/:id
// @access  Private (Admin)
exports.updateFaculty = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const faculty = await Faculty.findById(id);
    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: 'Faculty not found'
      });
    }

    // Update faculty fields
    const allowedUpdates = [
      'fullName', 'designation', 'department', 'qualification',
      'experience', 'contactNumber', 'address', 'isActive'
    ];

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        faculty[key] = updates[key];
      }
    });

    await faculty.save();

    // Update user if needed
    if (updates.email) {
      await User.findByIdAndUpdate(faculty.userId, {
        email: updates.email,
        isActive: updates.isActive !== undefined ? updates.isActive : faculty.isActive
      });
    }

    res.json({
      success: true,
      message: 'Faculty updated successfully',
      data: faculty
    });

  } catch (error) {
    console.error('Update Faculty Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update faculty'
    });
  }
};

// @desc    Delete faculty
// @route   DELETE /api/admin/faculty/:id
// @access  Private (Admin)
exports.deleteFaculty = async (req, res) => {
  try {
    const { id } = req.params;

    const faculty = await Faculty.findById(id);
    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: 'Faculty not found'
      });
    }

    // Delete user account
    await User.findByIdAndDelete(faculty.userId);

    // Delete faculty profile
    await Faculty.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Faculty deleted successfully'
    });

  } catch (error) {
    console.error('Delete Faculty Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete faculty'
    });
  }
};

// Helper: Send student credentials email
const sendStudentCredentials = async ({ studentName, personalEmail, instituteEmail, studentId, password }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"Nursing Institute" <${process.env.EMAIL_USER}>`,
      to: personalEmail,
      subject: 'Welcome to Nursing Institute - Your Login Credentials',
      html: `
        <h2>Welcome ${studentName}!</h2>
        <p>Your admission to Nursing Institute has been processed successfully.</p>
        <h3>Your Login Credentials:</h3>
        <ul>
          <li><strong>Student ID:</strong> ${studentId}</li>
          <li><strong>Institute Email:</strong> ${instituteEmail}</li>
          <li><strong>Password:</strong> ${password}</li>
          <li><strong>Login URL:</strong> ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login</li>
        </ul>
        <p><strong>Important:</strong> Change your password after first login.</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Email sent to:', personalEmail);
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw error;
  }
};

// Helper: Send password reset email
const sendPasswordResetEmail = async ({ studentName, personalEmail, instituteEmail, newPassword }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"Nursing Institute" <${process.env.EMAIL_USER}>`,
      to: personalEmail,
      subject: 'Password Reset - Nursing Institute',
      html: `
        <h2>Hello ${studentName}!</h2>
        <p>Your password has been reset by the administrator.</p>
        <h3>Your New Credentials:</h3>
        <ul>
          <li><strong>Institute Email:</strong> ${instituteEmail}</li>
          <li><strong>New Password:</strong> ${newPassword}</li>
        </ul>
        <p><strong>Important:</strong> Please change your password after first login.</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent to:', personalEmail);
  } catch (error) {
    console.error('❌ Password reset email failed:', error);
    throw error;
  }
};

// Helper: Generate random password
const generateRandomPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// @desc    Add new student - SIMPLIFIED VERSION
// @route   POST /api/admin/students
// @access  Private (Admin)
exports.addStudent = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    console.log('📝 ADD STUDENT REQUEST:', req.body);

    // Extract only essential fields (matches your frontend form)
    const {
      firstName,
      lastName,
      personalEmail,
      mobileNumber,
      courseEnrolled,
      gender = 'Male',
      dateOfBirth,
      fatherName,
      fatherMobile,
      admissionYear = new Date().getFullYear(),
      semester = 1
    } = req.body;

    // ✅ VALIDATE REQUIRED FIELDS
    const requiredFields = [
      'firstName', 'lastName', 'personalEmail', 
      'mobileNumber', 'courseEnrolled'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // ✅ Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(personalEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // ✅ Validate mobile number (10 digits)
    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobileNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number'
      });
    }

    // ✅ Check for existing email
    const existingEmail = await Student.findOne({ 
      personalEmail: personalEmail.toLowerCase() 
    }).session(session);
    
    if (existingEmail) {
      await session.abortTransaction();
      session.endSession();
      
      return res.status(400).json({
        success: false,
        message: 'Student with this email already exists',
        existingStudentId: existingEmail.studentId
      });
    }

    // ✅ Check for existing mobile
    const existingMobile = await Student.findOne({ 
      mobileNumber: mobileNumber 
    }).session(session);
    
    if (existingMobile) {
      await session.abortTransaction();
      session.endSession();
      
      return res.status(400).json({
        success: false,
        message: 'Student with this mobile number already exists',
        existingStudentId: existingMobile.studentId
      });
    }

    // ✅ Get course details
    const course = await Course.findById(courseEnrolled).session(session);
    if (!course) {
      await session.abortTransaction();
      session.endSession();
      
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // ✅ Generate UNIQUE Student ID
    const now = new Date();
    const year = now.getFullYear().toString();
    
    // Get count for sequence
    const count = await Student.countDocuments({
      courseEnrolled: course._id,
      admissionYear: year
    }).session(session);
    
    const sequence = (count + 1).toString().padStart(3, '0');
    const studentId = `${course.courseCode}${year}${sequence}`;
    
    console.log('🎯 Generated Student ID:', studentId);

    // ✅ Generate Institute Email
    const cleanFirstName = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const cleanLastName = lastName.toLowerCase().replace(/[^a-z]/g, '');
    const instituteEmail = `${cleanFirstName}.${cleanLastName}.${studentId.substring(studentId.length - 3)}@nursinginstitute.edu`.toLowerCase();
    
    console.log('📧 Generated Institute Email:', instituteEmail);

    // ✅ Generate Secure Password
    const generateSecurePassword = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      let password = '';
      
      // Ensure at least one of each type
      password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
      password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
      password += '0123456789'[Math.floor(Math.random() * 10)];
      password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
      
      // Fill rest
      for (let i = 4; i < 12; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
      }
      
      // Shuffle
      return password.split('').sort(() => Math.random() - 0.5).join('');
    };
    
    const password = generateSecurePassword();
    console.log('🔐 Generated Password:', password);

    // ✅ Create User Account
    const user = new User({
      username: studentId,
      email: instituteEmail,
      password: password,
      role: 'student',
      isActive: true
    });

    await user.save({ session });
    console.log('✅ User created:', user._id);

    // ✅ Create Student Profile (SIMPLIFIED - matches schema)
    const student = new Student({
      userId: user._id,
      studentId: studentId,
      admissionNumber: studentId, // Set admissionNumber same as studentId
      firstName: firstName,
      lastName: lastName,
      personalEmail: personalEmail.toLowerCase(),
      instituteEmail: instituteEmail,
      mobileNumber: mobileNumber,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender: gender,
      fatherName: fatherName || '',
      fatherMobile: fatherMobile || '',
      courseEnrolled: course._id,
      admissionYear: parseInt(admissionYear),
      semester: parseInt(semester) || 1,
      admissionDate: now,
      academicStatus: 'Active',
      isActive: true
    });

    await student.save({ session });
    console.log('✅ Student created:', student._id);

    // Update course seats
    course.seatsFilled = (course.seatsFilled || 0) + 1;
    await course.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    console.log('✅ Transaction committed successfully');

    // ✅ Send Welcome Email (async - optional)
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const mailOptions = {
        from: `"Nursing Institute" <${process.env.EMAIL_USER}>`,
        to: personalEmail,
        subject: 'Welcome to Nursing Institute - Your Login Credentials',
        html: `
          <h2>Welcome ${firstName} ${lastName}!</h2>
          <p>Your admission to ${course.courseName} has been processed successfully.</p>
          <h3>Your Login Credentials:</h3>
          <ul>
            <li><strong>Student ID:</strong> ${studentId}</li>
            <li><strong>Username/Email:</strong> ${instituteEmail}</li>
            <li><strong>Password:</strong> ${password}</li>
            <li><strong>Login URL:</strong> ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login</li>
          </ul>
          <p><strong>Important:</strong></p>
          <ul>
            <li>Use Institute Email as username to login</li>
            <li>Change your password after first login</li>
            <li>Keep these credentials secure</li>
          </ul>
          <p>Best regards,<br>Nursing Institute Administration</p>
        `
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.log('📧 Email sending failed:', error);
        } else {
          console.log('📧 Email sent:', info.response);
        }
      });
    } catch (emailError) {
      console.log('Email error (non-critical):', emailError.message);
    }

    // ✅ Return success response
    res.status(201).json({
      success: true,
      message: 'Student added successfully',
      data: {
        student: {
          _id: student._id,
          studentId: studentId,
          fullName: `${firstName} ${lastName}`,
          personalEmail: personalEmail,
          courseName: course.courseName
        },
        credentials: {
          studentId: studentId,
          instituteEmail: instituteEmail,
          password: password,
          loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`
        }
      }
    });

  } catch (error) {
    // Abort transaction on error
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    
    console.error('❌ Add Student Error:', error);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add student',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Test student creation with sample data
// @route   POST /api/admin/students/test
// @access  Private (Admin)
exports.testAddStudent = async (req, res) => {
  try {
    const testData = {
      firstName: "John",
      lastName: "Doe",
      personalEmail: "john.doe.test@gmail.com",
      mobileNumber: "9876543210",
      courseEnrolled: "", // Add a valid course ID here
      gender: "Male",
      dateOfBirth: "2000-01-01",
      fatherName: "Robert Doe",
      fatherMobile: "9876543211",
      admissionYear: 2024,
      semester: 1
    };

    // First, get a course ID
    const course = await Course.findOne();
    if (!course) {
      return res.status(400).json({
        success: false,
        message: "No courses found. Please create a course first."
      });
    }

    testData.courseEnrolled = course._id;

    console.log('🧪 Testing with data:', testData);
    
    // Call the actual addStudent function
    req.body = testData;
    return exports.addStudent(req, res);
    
  } catch (error) {
    console.error('Test Error:', error);
    res.status(500).json({
      success: false,
      message: 'Test failed: ' + error.message
    });
  }
};

// @desc    Handle student's first login/password setup
// @route   POST /api/auth/first-login/:token
// @access  Public
exports.firstLoginSetup = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Hash token
        const crypto = require('crypto');
        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Find user with valid token
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpire: { $gt: Date.now() },
            password: 'PENDING_FIRST_LOGIN'
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        // Set new password
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        user.lastLogin = new Date();

        await user.save();

        // Get student profile
        const student = await Student.findOne({ userId: user._id });
        
        // Generate JWT token for immediate login
        const authToken = user.generateAuthToken();

        res.json({
            success: true,
            message: 'Password set successfully. You can now login.',
            data: {
                token: authToken,
                user: {
                    _id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                },
                student: student ? {
                    studentId: student.studentId,
                    fullName: student.fullName,
                    courseEnrolled: student.courseEnrolled
                } : null
            }
        });

    } catch (error) {
        console.error('First Login Setup Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to set password'
        });
    }
};

// @desc    Get all students with filters
// @route   GET /api/admin/students
// @access  Private (Admin)
exports.getAllStudents = async (req, res) => {
  try {
    const { 
      search, 
      course, 
      semester, 
      status, 
      batch,
      page = 1,
      limit = 10
    } = req.query;

    const query = {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Search filter
    if (search) {
      query.$or = [
        { studentId: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { personalEmail: { $regex: search, $options: 'i' } },
        { instituteEmail: { $regex: search, $options: 'i' } },
        { mobileNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Course filter
    if (course) {
      query.courseEnrolled = course;
    }

    // Semester filter
    if (semester) {
      query.semester = parseInt(semester);
    }

    // Status filter
    if (status) {
      query.academicStatus = status;
    }

    // Batch filter
    if (batch) {
      query.batchYear = parseInt(batch);
    }

    // Get students with pagination
    const students = await Student.find(query)
      .populate('courseEnrolled', 'courseName courseCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v');

    // Get total count
    const total = await Student.countDocuments(query);

    // Get statistics
    const stats = {
      total: await Student.countDocuments(),
      active: await Student.countDocuments({ academicStatus: 'Active' }),
      male: await Student.countDocuments({ gender: 'Male' }),
      female: await Student.countDocuments({ gender: 'Female' }),
      withHostel: await Student.countDocuments({ hostelAllotted: true }),
      withTransport: await Student.countDocuments({ transportFacility: true })
    };

    res.json({
      success: true,
      data: {
        students,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        stats
      }
    });

  } catch (error) {
    console.error('Get All Students Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students'
    });
  }
};

// @desc    Get single student by ID
// @route   GET /api/admin/students/:id
// @access  Private (Admin)
exports.getStudentById = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('courseEnrolled', 'courseName courseCode duration')
      .populate('userId', 'username email isActive lastLogin');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.json({
      success: true,
      data: student
    });

  } catch (error) {
    console.error('Get Student By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student details'
    });
  }
};

// @desc    Get student details
// @route   GET /api/admin/students/:id
// @access  Private (Admin)
exports.getStudentDetails = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('courseEnrolled')
      .populate('userId', 'username email isActive');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get attendance summary
    const attendanceSummary = await Attendance.aggregate([
      {
        $match: { student: student._id }
      },
      {
        $group: {
          _id: '$subject',
          total: { $sum: 1 },
          present: {
            $sum: {
              $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Get marks summary
    const marksSummary = await Marks.find({ student: student._id })
      .sort({ semester: 1, examDate: -1 })
      .select('subject semester examType marks.obtained percentage grade resultStatus');

    // Calculate CGPA
    const gpa = await Marks.calculateGPA(student._id, student.semester);

    // Get fee status
    const feeStatus = {
      totalFees: student.fees.totalFees || 0,
      paid: student.fees.feesPaid || 0,
      pending: student.fees.pendingFees || 0,
      lastPayment: student.fees.lastPaymentDate
    };

    res.json({
      success: true,
      data: {
        student,
        academic: {
          attendanceSummary,
          marksSummary,
          gpa: gpa.toFixed(2)
        },
        feeStatus
      }
    });
  } catch (error) {
    console.error('Get Student Details Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student details'
    });
  }
};

// @desc    Update student profile
// @route   PUT /api/admin/students/:id
// @access  Private (Admin)
exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Fields that can be updated
    const allowedUpdates = [
      'firstName', 'lastName', 'fullName',
      'mobileNumber', 'contactNumber',
      'dateOfBirth', 'gender', 'bloodGroup',
      'address', 
      'guardianDetails',
      'courseEnrolled', 'semester', 'rollNumber',
      'academicStatus', 'batchYear',
      'hostelAllotted', 'transportFacility',
      'documents',
      'fees'
    ];

    // Apply updates
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        student[key] = updates[key];
      }
    });

    // Update full name
    if (updates.firstName || updates.lastName) {
      student.fullName = `${updates.firstName || student.firstName} ${updates.lastName || student.lastName}`;
    }

    await student.save();

    res.json({
      success: true,
      message: 'Student updated successfully',
      data: student
    });

  } catch (error) {
    console.error('Update Student Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update student'
    });
  }
};

// @desc    Delete student
// @route   DELETE /api/admin/students/:id
// @access  Private (Admin)
exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Delete user account
    if (student.userId) {
      await User.findByIdAndDelete(student.userId);
    }

    // Delete student profile
    await Student.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Student deleted successfully'
    });

  } catch (error) {
    console.error('Delete Student Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete student'
    });
  }
};

// @desc    Bulk upload students from CSV
// @route   POST /api/admin/students/bulk-upload
// @access  Private (Admin)
exports.bulkUploadStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a CSV file'
      });
    }

    const results = {
      total: 0,
      success: 0,
      failed: 0,
      errors: []
    };

    // Read CSV
    const csvData = fs.readFileSync(req.file.path, 'utf8');
    const rows = csvData.split('\n').slice(1); // Skip header

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].trim();
      if (!row) continue;

      const columns = row.split(',');
      if (columns.length < 8) {
        results.failed++;
        results.errors.push({ row: i + 2, error: 'Invalid CSV format' });
        continue;
      }

      try {
        const [firstName, lastName, email, mobile, courseCode, gender, dob, fatherName] = columns;

        // Find course
        const course = await Course.findOne({ courseCode: courseCode.trim().toUpperCase() });
        if (!course) {
          throw new Error(`Course ${courseCode} not found`);
        }

        // Check duplicate email
        const existingStudent = await Student.findOne({ personalEmail: email.trim() });
        if (existingStudent) {
          throw new Error('Email already exists');
        }

        // Generate Student ID
        const year = new Date().getFullYear();
        const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
        const count = await Student.countDocuments({
          courseEnrolled: course._id,
          admissionYear: year
        });
        const sequence = (count + 1).toString().padStart(3, '0');
        const studentId = `${course.courseCode}${year}${month}${sequence}`;

        // Generate Institute Email
        const cleanFirstName = firstName.toLowerCase().replace(/[^a-z]/g, '');
        const cleanLastName = lastName.toLowerCase().replace(/[^a-z]/g, '');
        const instituteEmail = `${cleanFirstName}.${cleanLastName}.${studentId.substring(studentId.length - 3)}@nursinginstitute.edu`;

        // Generate Password
        const password = generateRandomPassword();

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create User
        const user = new User({
          username: studentId,
          email: instituteEmail,
          password: hashedPassword,
          role: 'student',
          isActive: true
        });
        await user.save();

        // Create Student
        const student = new Student({
          userId: user._id,
          studentId: studentId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          fullName: `${firstName.trim()} ${lastName.trim()}`,
          email: email.trim(),
          personalEmail: email.trim(),
          instituteEmail: instituteEmail,
          contactNumber: mobile.trim(),
          mobileNumber: mobile.trim(),
          gender: gender.trim() || 'Other',
          dateOfBirth: dob.trim() || null,
          courseEnrolled: course._id,
          batchYear: year,
          admissionYear: year,
          semester: 1,
          academicStatus: 'Active',
          admissionDate: new Date(),
          guardianDetails: {
            fatherName: fatherName.trim() || ''
          }
        });

        await student.save();
        results.success++;
        results.total++;

      } catch (error) {
        results.failed++;
        results.total++;
        results.errors.push({
          row: i + 2,
          error: error.message
        });
      }
    }

    // Clean up file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: 'Bulk upload completed',
      data: results
    });

  } catch (error) {
    console.error('Bulk Upload Error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk upload'
    });
  }
};

// @desc    Reset student password
// @route   POST /api/admin/students/:id/reset-password
// @access  Private (Admin)
exports.resetStudentPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword, sendEmail = false } = req.body;

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Find user
    const user = await User.findById(student.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    // Generate password if not provided
    const password = newPassword || generateRandomPassword();

    // Update password (let the User model pre-save hook handle hashing)
    user.password = password;
    await user.save();

    // Send email if requested
    if (sendEmail) {
      try {
        await sendPasswordResetEmail({
          studentName: student.fullName,
          personalEmail: student.personalEmail,
          instituteEmail: student.instituteEmail,
          newPassword: password
        });
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        studentId: student.studentId,
        instituteEmail: student.instituteEmail,
        newPassword: password,
        emailSent: sendEmail
      }
    });

  } catch (error) {
    console.error('Reset Student Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

// @desc    Export students to CSV
// @route   GET /api/admin/students/export
// @access  Private (Admin)
exports.exportStudents = async (req, res) => {
  try {
    const students = await Student.find()
      .populate('courseEnrolled', 'courseName courseCode')
      .select('studentId fullName personalEmail instituteEmail mobileNumber courseEnrolled semester academicStatus admissionDate')
      .sort({ studentId: 1 });

    // Create CSV
    let csv = 'Student ID,Full Name,Personal Email,Institute Email,Mobile Number,Course,Semester,Status,Admission Date\n';
    
    students.forEach(s => {
      csv += `"${s.studentId}","${s.fullName}","${s.personalEmail}","${s.instituteEmail}","${s.mobileNumber}","${s.courseEnrolled?.courseName || ''}","${s.semester}","${s.academicStatus}","${s.admissionDate.toISOString().split('T')[0]}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=students.csv');
    res.send(csv);

  } catch (error) {
    console.error('Export Students Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export students'
    });
  }
};

// @desc    Get student statistics
// @route   GET /api/admin/students/stats
// @access  Private (Admin)
exports.getStudentStats = async (req, res) => {
  try {
    const stats = await Student.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$academicStatus', 'Active'] }, 1, 0] } },
          male: { $sum: { $cond: [{ $eq: ['$gender', 'Male'] }, 1, 0] } },
          female: { $sum: { $cond: [{ $eq: ['$gender', 'Female'] }, 1, 0] } }
        }
      }
    ]);

    // Course distribution
    const courseDistribution = await Student.aggregate([
      {
        $group: {
          _id: '$courseEnrolled',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'courses',
          localField: '_id',
          foreignField: '_id',
          as: 'course'
        }
      },
      {
        $unwind: '$course'
      },
      {
        $project: {
          courseName: '$course.courseName',
          count: 1
        }
      }
    ]);

    // Semester distribution
    const semesterDistribution = await Student.aggregate([
      {
        $match: { academicStatus: 'Active' }
      },
      {
        $group: {
          _id: '$semester',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        overall: stats[0] || { total: 0, active: 0, male: 0, female: 0 },
        courses: courseDistribution,
        semesters: semesterDistribution
      }
    });

  } catch (error) {
    console.error('Get Student Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student statistics'
    });
  }
};

// @desc    Search students
// @route   GET /api/admin/students/search
// @access  Private (Admin)
exports.searchStudents = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const students = await Student.find({
      $or: [
        { studentId: { $regex: q, $options: 'i' } },
        { fullName: { $regex: q, $options: 'i' } },
        { personalEmail: { $regex: q, $options: 'i' } },
        { mobileNumber: { $regex: q, $options: 'i' } }
      ]
    })
    .limit(10)
    .select('studentId fullName personalEmail courseEnrolled semester academicStatus');

    res.json({
      success: true,
      data: students
    });

  } catch (error) {
    console.error('Search Students Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search students'
    });
  }
};

// @desc    Manage attendance
// @route   POST /api/admin/attendance
// @access  Private (Admin)
exports.manageAttendance = async (req, res) => {
  try {
    const { date, course, semester, subject, attendanceData } = req.body;

    // Validate input
    if (!date || !course || !semester || !subject || !attendanceData) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const results = {
      total: attendanceData.length,
      success: 0,
      failed: 0,
      errors: []
    };

    // Process each attendance record
    const affectedStudentIds = new Set();
    for (const record of attendanceData) {
      try {
        const attendance = new Attendance({
          student: record.studentId,
          date: new Date(date),
          course,
          subject,
          semester: parseInt(semester),
          type: record.type || 'Theory',
          status: record.status || 'Absent',
          hoursAttended: record.hoursAttended || 0,
          remarks: record.remarks,
          recordedBy: req.user._id
        });

        await attendance.save();
        results.success++;
        affectedStudentIds.add(record.studentId);
      } catch (error) {
        results.failed++;
        results.errors.push({
          studentId: record.studentId,
          error: error.message
        });
      }
    }

    // Emit events to affected students and course room
    try {
      const io = req.app.get('io');
      if (io) {
        // Notify course-level listeners
        io.to(`course:${course}`).emit('attendance:changed', { date, subject, semester, course });

        // Notify each student's socket (resolve userIds)
        const studentDocs = await Student.find({ _id: { $in: Array.from(affectedStudentIds) } }).select('userId');
        studentDocs.forEach(s => {
          if (s.userId) io.to(`user:${s.userId}`).emit('attendance:changed', { date, subject, semester, course, studentId: s._id });
        });
      }
    } catch (err) {
      console.error('Emit attendance event error:', err.message);
    }

    res.json({
      success: true,
      message: 'Attendance recorded successfully',
      data: results
    });
  } catch (error) {
    console.error('Manage Attendance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record attendance'
    });
  }
};

// @desc    Manage marks
// @route   POST /api/admin/marks
// @access  Private (Admin)
exports.manageMarks = async (req, res) => {
  try {
    const { examType, course, semester, subject, marksData } = req.body;

    // Validate input
    if (!examType || !course || !semester || !subject || !marksData) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const results = {
      total: marksData.length,
      success: 0,
      failed: 0,
      errors: []
    };

    // Process each marks record
    const affectedStudentIds = new Set();
    const savedMarks = [];
    for (const record of marksData) {
      try {
        const marks = new Marks({
          student: record.studentId,
          course,
          subject,
          semester: parseInt(semester),
          examType,
          examDate: new Date(),
          marks: {
            theory: {
              max: record.theoryMax || 100,
              obtained: record.theoryObtained || 0
            },
            practical: {
              max: record.practicalMax || 100,
              obtained: record.practicalObtained || 0
            },
            viva: {
              max: record.vivaMax || 50,
              obtained: record.vivaObtained || 0
            },
            assignment: {
              max: record.assignmentMax || 50,
              obtained: record.assignmentObtained || 0
            }
          },
          enteredBy: req.user._id,
          isPublished: false
        });

        await marks.save();
        savedMarks.push(marks);
        results.success++;
        affectedStudentIds.add(record.studentId);
      } catch (error) {
        results.failed++;
        results.errors.push({
          studentId: record.studentId,
          error: error.message
        });
      }
    }

    // Emit events to affected students and course room
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`course:${course}`).emit('marks:added', { course, semester, subject, examType });
        const studentDocs = await Student.find({ _id: { $in: Array.from(affectedStudentIds) } }).select('userId');
        studentDocs.forEach(s => {
          if (s.userId) io.to(`user:${s.userId}`).emit('marks:added', { course, semester, subject, examType });
        });
      }
    } catch (err) {
      console.error('Emit marks event error:', err.message);
    }

    res.json({
      success: true,
      message: 'Marks recorded successfully',
      data: results
    });
  } catch (error) {
    console.error('Manage Marks Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record marks'
    });
  }
};

// @desc    Publish marks
// @route   PUT /api/admin/marks/publish
// @access  Private (Admin)
exports.publishMarks = async (req, res) => {
  try {
    const { examType, course, semester, subject } = req.body;

    const updateResult = await Marks.updateMany(
      {
        course,
        semester,
        subject,
        examType,
        isPublished: false
      },
      {
        $set: {
          isPublished: true,
          publishedDate: new Date(),
          verifiedBy: req.user._id
        }
      }
    );

    // Emit marks published event to course/semester/subject room
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`course:${course}`).emit('marks:published', { course, semester, subject, examType });
      }
    } catch (err) {
      console.error('Emit marks published event error:', err.message);
    }

    res.json({
      success: true,
      message: 'Marks published successfully',
      data: {
        modifiedCount: updateResult.modifiedCount
      }
    });
  } catch (error) {
    console.error('Publish Marks Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish marks'
    });
  }
};

// @desc    Get all marks (admin view)
// @route   GET /api/admin/marks
// @access  Private (Admin)
exports.getAllMarks = async (req, res) => {
  try {
    const { course, semester, subject, examType, studentId, page = 1, limit = 50 } = req.query;

    const query = {};
    if (course) query.course = course;
    if (semester) query.semester = parseInt(semester);
    if (subject) query.subject = subject;
    if (examType) query.examType = examType;
    if (studentId) query.student = studentId;

    const total = await Marks.countDocuments(query);
    const marks = await Marks.find(query)
      .sort({ examDate: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('student', 'fullName studentId')
      .populate('enteredBy', 'username')
      .select('-__v');

    res.json({
      success: true,
      data: {
        marks,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get All Marks Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch marks' });
  }
};

// @desc    Get a single mark
// @route   GET /api/admin/marks/:id
// @access  Private (Admin)
exports.getMark = async (req, res) => {
  try {
    const mark = await Marks.findById(req.params.id)
      .populate('student', 'fullName studentId')
      .populate('enteredBy', 'username');
    if (!mark) return res.status(404).json({ success: false, message: 'Mark not found' });
    res.json({ success: true, data: mark });
  } catch (error) {
    console.error('Get Mark Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch mark' });
  }
};

// @desc    Update a mark
// @route   PUT /api/admin/marks/:id
// @access  Private (Admin)
exports.updateMark = async (req, res) => {
  try {
    const mark = await Marks.findById(req.params.id);
    if (!mark) return res.status(404).json({ success: false, message: 'Mark not found' });

    Object.keys(req.body).forEach(key => {
      mark[key] = req.body[key];
    });

    // If marks object provided, merge subfields
    if (req.body.marks) {
      mark.marks = { ...mark.marks, ...req.body.marks };
    }

    await mark.save();

    // Emit mark-updated to the student and course room
    try {
      const io = req.app.get('io');
      if (io) {
        const studentDoc = await Student.findById(mark.student).select('userId');
        if (studentDoc && studentDoc.userId) io.to(`user:${studentDoc.userId}`).emit('marks:updated', mark);
        io.to(`course:${mark.course}`).emit('marks:updated', { mark });
      }
    } catch (err) {
      console.error('Emit mark updated error:', err.message);
    }

    res.json({ success: true, message: 'Mark updated', data: mark });
  } catch (error) {
    console.error('Update Mark Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update mark' });
  }
};

// @desc    Delete a mark
// @route   DELETE /api/admin/marks/:id
// @access  Private (Admin)
exports.deleteMark = async (req, res) => {
  try {
    const mark = await Marks.findById(req.params.id);
    if (!mark) return res.status(404).json({ success: false, message: 'Mark not found' });

    await mark.remove();
    res.json({ success: true, message: 'Mark deleted' });
  } catch (error) {
    console.error('Delete Mark Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete mark' });
  }
};
// Helper function to get file type
const getFileType = (mimeType) => {
  const types = {
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.ms-powerpoint': 'PPT',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'application/zip': 'ZIP',
    'application/x-rar-compressed': 'RAR'
  };

  return types[mimeType] || 'OTHER';
};

// @desc    Upload study material
// @route   POST /api/admin/downloads
// @access  Private (Admin)
exports.uploadStudyMaterial = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a file'
      });
    }

    const downloadData = {
      title: req.body.title,
      description: req.body.description,
      fileUrl: `/uploads/documents/${req.file.filename}`,
      fileName: req.file.originalname,
      fileType: req.body.fileType || getFileType(req.file.mimetype),
      fileSize: req.file.size,
      category: req.body.category,
      targetAudience: req.body.targetAudience ? 
        req.body.targetAudience.split(',').map(item => item.trim()) : ['all'],
      uploadedBy: req.user._id,
      academicYear: req.body.academicYear,
      semester: req.body.semester ? parseInt(req.body.semester) : null,
      subject: req.body.subject,
      tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim().toLowerCase()) : [],
      requiresLogin: req.body.requiresLogin === 'true',
      expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : null
    };

    // Handle specific targets
    if (req.body.specificTargets) {
      const targets = JSON.parse(req.body.specificTargets);
      downloadData.specificTargets = targets;
    }

    const download = new Download(downloadData);
    await download.save();

    // Emit real-time event to students (and course rooms if specific targets set)
    try {
      const io = req.app.get('io');
      if (io) {
        io.to('students').emit('downloads:created', download);
        if (download.targetAudience && Array.isArray(download.targetAudience) && download.targetAudience.includes('specific_course')) {
          const courses = download.specificTargets?.courses || [];
          courses.forEach(courseId => {
            io.to(`course:${courseId}`).emit('downloads:created', download);
          });
        }
      }
    } catch (err) {
      console.error('Emit downloads event error:', err.message);
    }

    res.status(201).json({
      success: true,
      message: 'Study material uploaded successfully',
      data: download
    });
  } catch (error) {
    console.error('Upload Study Material Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload study material'
    });
  }
};

// @desc    Get all downloads
// @route   GET /api/admin/downloads
// @access  Private (Admin)
exports.getAllDownloads = async (req, res) => {
  try {
    const { category, academicYear, semester, search } = req.query;
    
    const query = {};
    
    if (category) {
      query.category = category;
    }
    
    if (academicYear) {
      query.academicYear = academicYear;
    }
    
    if (semester) {
      query.semester = parseInt(semester);
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    const downloads = await Download.find(query)
      .sort({ uploadedAt: -1 })
      .populate('uploadedBy', 'username');

    // Get statistics
    const totalDownloads = await Download.countDocuments();
    const totalDownloadCount = await Download.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$downloadCount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        downloads,
        stats: {
          totalFiles: totalDownloads,
          totalDownloads: totalDownloadCount[0]?.total || 0
        }
      }
    });
  } catch (error) {
    console.error('Get All Downloads Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch downloads'
    });
  }
};

// @desc    Update download
// @route   PUT /api/admin/downloads/:id
// @access  Private (Admin)
exports.updateDownload = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const download = await Download.findById(id);
    if (!download) {
      return res.status(404).json({
        success: false,
        message: 'Download not found'
      });
    }

    // Handle arrays
    if (updates.targetAudience && typeof updates.targetAudience === 'string') {
      updates.targetAudience = updates.targetAudience.split(',').map(item => item.trim());
    }
    
    if (updates.tags && typeof updates.tags === 'string') {
      updates.tags = updates.tags.split(',').map(tag => tag.trim().toLowerCase());
    }
    
    if (updates.specificTargets && typeof updates.specificTargets === 'string') {
      updates.specificTargets = JSON.parse(updates.specificTargets);
    }

    Object.keys(updates).forEach(key => {
      download[key] = updates[key];
    });

    await download.save();

    res.json({
      success: true,
      message: 'Download updated successfully',
      data: download
    });
  } catch (error) {
    console.error('Update Download Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update download'
    });
  }
};

// @desc    Delete download
// @route   DELETE /api/admin/downloads/:id
// @access  Private (Admin)
exports.deleteDownload = async (req, res) => {
  try {
    const { id } = req.params;

    const download = await Download.findByIdAndDelete(id);
    if (!download) {
      return res.status(404).json({
        success: false,
        message: 'Download not found'
      });
    }

    // TODO: Delete actual file from server

    res.json({
      success: true,
      message: 'Download deleted successfully'
    });
  } catch (error) {
    console.error('Delete Download Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete download'
    });
  }
};

// @desc    Create user account for existing student (if missing)
// @route   POST /api/admin/students/:id/create-user
// @access  Private (Admin)
exports.createUserForStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (student.userId) {
      return res.status(400).json({ success: false, message: 'User account already exists for this student' });
    }

    if (!student.email) {
      return res.status(400).json({ success: false, message: 'Student must have an email to create a user account' });
    }

    // Check for existing user by email or username
    const existingUser = await User.findOne({ $or: [{ email: student.email }, { username: student.studentId }] });
    if (existingUser) {
      // If a user exists but not linked, attach and return credentials (without password)
      // If password provided in request, reset user's password
      if (password && password.length >= 6) {
        existingUser.password = password;
        await existingUser.save();
      }

      student.userId = existingUser._id;
      await student.save();
      return res.json({ success: true, message: 'User linked to student', data: { username: existingUser.username, email: existingUser.email, password: password && password.length >= 6 ? password : undefined } });
    }

    // Generate password if not provided
    const genPassword = password && password.length >= 6 ? password : `stu${Math.random().toString(36).slice(-8)}`;

    const user = new User({
      username: student.studentId,
      email: student.email,
      password: genPassword,
      role: 'student'
    });

    await user.save();

    student.userId = user._id;
    await student.save();

    // Optionally send welcome email (best-effort)
    try {
      await sendEmail({
        email: user.email,
        subject: 'Student Portal Account Created',
        message: `Your student portal account has been created.\nUsername: ${user.username}\nPassword: ${genPassword}\nPlease login at ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`,
      });
    } catch (emailErr) {
      console.error('Welcome email failed:', emailErr);
    }

    res.status(201).json({
      success: true,
      message: 'User account created successfully',
      data: {
        username: user.username,
        email: user.email,
        password: genPassword
      }
    });
  } catch (error) {
    console.error('Create User For Student Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user account' });
  }
};

// @desc    Create user accounts for all students missing a linked User
// @route   POST /api/admin/students/create-missing-users
// @access  Private (Admin)
exports.createUsersForMissingStudents = async (req, res) => {
  try {
    const students = await Student.find({ userId: { $exists: false } });
    const results = { total: students.length, created: 0, linked: 0, skipped: 0, errors: [] };

    for (const student of students) {
      try {
        if (!student.email) {
          results.skipped++;
          results.errors.push({ studentId: student.studentId, reason: 'Missing email' });
          continue;
        }

        const existingUser = await User.findOne({ $or: [{ email: student.email }, { username: student.studentId }] });
        if (existingUser) {
          student.userId = existingUser._id;
          await student.save();
          results.linked++;
          continue;
        }

        const genPassword = `stu${Math.random().toString(36).slice(-8)}`;
        const user = new User({ username: student.studentId, email: student.email, password: genPassword, role: 'student' });
        await user.save();
        student.userId = user._id;
        await student.save();

        // best-effort email
        try {
          await sendEmail({
            email: user.email,
            subject: 'Student Portal Account Created',
            message: `Your account has been created. Username: ${user.username}\nPassword: ${genPassword}\nPlease login at ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`
          });
        } catch (e) {
          // ignore email errors
        }

        results.created++;
      } catch (err) {
        results.errors.push({ studentId: student.studentId, error: err.message });
      }
    }

    res.json({ success: true, message: 'Bulk create complete', data: results });
  } catch (error) {
    console.error('Create Users For Missing Students Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user accounts' });
  }
};

// @desc    Reset password for a user by admin
// @route   POST /api/admin/users/:id/reset-password
// @access  Private (Admin)
exports.resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.password = password;
    await user.save();

    // send optional email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset by Admin',
        message: `Your password has been reset by the administrator. Username: ${user.username}\nIf you did not request this, contact support.`
      });
    } catch (e) {
      // ignore
    }

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Reset User Password Error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin)
exports.getAllUsers = async (req, res) => {
  try {
    const { role, isActive, search } = req.query;
    
    const query = {};
    
    if (role) {
      query.role = role;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: users,
      count: users.length
    });
  } catch (error) {
    console.error('Get All Users Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

// @desc    Update user status
// @route   PUT /api/admin/users/:id/status
// @access  Private (Admin)
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = isActive;
    await user.save();

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: user
    });
  } catch (error) {
    console.error('Update User Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
};

// @desc    Get system logs
// @route   GET /api/admin/logs
// @access  Private (Admin)
exports.getSystemLogs = async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    
    // This is a placeholder - implement actual logging system
    res.json({
      success: true,
      data: {
        logs: [],
        message: 'Logging system not implemented'
      }
    });
  } catch (error) {
    console.error('Get System Logs Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system logs'
    });
  }
};

// @desc    Backup database
// @route   POST /api/admin/backup
// @access  Private (Admin)
exports.backupDatabase = async (req, res) => {
  try {
    // This is a placeholder - implement actual backup system
    res.json({
      success: true,
      message: 'Backup initiated successfully',
      data: {
        backupId: Date.now(),
        timestamp: new Date().toISOString(),
        status: 'completed'
      }
    });
  } catch (error) {
    console.error('Backup Database Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to backup database'
    });
  }
};

// @desc    Get system settings
// @route   GET /api/admin/settings
// @access  Private (Admin)
exports.getSystemSettings = async (req, res) => {
  try {
    // This is a placeholder - implement actual settings system
    res.json({
      success: true,
      data: {
        general: {
          instituteName: 'Nursing Institute',
          instituteAddress: '123 Nursing Street, Medical City',
          contactEmail: 'admin@nursinginstitute.edu',
          contactPhone: '+91 9876543210',
          websiteUrl: 'https://nursinginstitute.edu',
          timezone: 'Asia/Kolkata',
          language: 'English',
          dateFormat: 'DD/MM/YYYY',
          currency: 'INR',
          academicYear: new Date().getFullYear(),
          maxLoginAttempts: 5,
          sessionTimeout: 30
        },
        theme: {
          primaryColor: '#0d6efd',
          secondaryColor: '#6c757d',
          accentColor: '#198754',
          themeMode: 'light',
          logoUrl: '/logo.png',
          faviconUrl: '/favicon.ico',
          headerColor: '#ffffff',
          sidebarColor: '#343a40'
        },
        notification: {
          emailNotifications: true,
          smsNotifications: false,
          pushNotifications: true,
          studentAlerts: true,
          facultyAlerts: true,
          adminAlerts: true,
          attendanceAlerts: true,
          marksAlerts: true,
          feeAlerts: true,
          newsAlerts: true
        },
        security: {
          requireStrongPassword: true,
          passwordExpiryDays: 90,
          twoFactorAuth: false,
          ipWhitelist: '',
          allowedFileTypes: 'pdf,doc,docx,xls,xlsx,jpg,jpeg,png',
          maxFileSize: 10,
          sslEnforced: true,
          cookieSecure: true
        },
        backup: {
          autoBackup: true,
          backupFrequency: 'daily',
          backupTime: '02:00',
          keepBackups: 30,
          backupLocation: 'local',
          cloudStorage: false,
          lastBackup: null,
          nextBackup: null
        }
      }
    });
  } catch (error) {
    console.error('Get System Settings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system settings'
    });
  }
};

// @desc    Update system settings
// @route   PUT /api/admin/settings
// @access  Private (Admin)
exports.updateSystemSettings = async (req, res) => {
  try {
    const updates = req.body;
    
    // This is a placeholder - implement actual settings update
    res.json({
      success: true,
      message: 'System settings updated successfully',
      data: updates
    });
  } catch (error) {
    console.error('Update System Settings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system settings'
    });
  }
};

// @desc    Reset system settings to defaults
// @route   POST /api/admin/settings/reset
// @access  Private (Admin)
exports.resetSystemSettings = async (req, res) => {
  try {
    // Return default values - implement persistent reset as needed
    const defaults = {
      general: {
        instituteName: 'Nursing Institute',
        instituteAddress: '123 Nursing Street, Medical City',
        contactEmail: 'admin@nursinginstitute.edu',
        contactPhone: '+91 9876543210',
        websiteUrl: 'https://nursinginstitute.edu',
        timezone: 'Asia/Kolkata',
        language: 'English',
        dateFormat: 'DD/MM/YYYY',
        currency: 'INR',
        academicYear: new Date().getFullYear(),
        maxLoginAttempts: 5,
        sessionTimeout: 30
      },
      theme: {
        primaryColor: '#0d6efd',
        secondaryColor: '#6c757d',
        accentColor: '#198754',
        themeMode: 'light',
        logoUrl: '/logo.png',
        faviconUrl: '/favicon.ico',
        headerColor: '#ffffff',
        sidebarColor: '#343a40'
      },
      notification: {
        emailNotifications: true,
        smsNotifications: false,
        pushNotifications: true,
        studentAlerts: true,
        facultyAlerts: true,
        adminAlerts: true,
        attendanceAlerts: true,
        marksAlerts: true,
        feeAlerts: true,
        newsAlerts: true
      },
      security: {
        requireStrongPassword: true,
        passwordExpiryDays: 90,
        twoFactorAuth: false,
        ipWhitelist: '',
        allowedFileTypes: 'pdf,doc,docx,xls,xlsx,jpg,jpeg,png',
        maxFileSize: 10,
        sslEnforced: true,
        cookieSecure: true
      },
      backup: {
        autoBackup: true,
        backupFrequency: 'daily',
        backupTime: '02:00',
        keepBackups: 30,
        backupLocation: 'local',
        cloudStorage: false,
        lastBackup: null,
        nextBackup: null
      }
    };

    // TODO: Persist defaults to DB/config if required
    res.json({
      success: true,
      message: 'Settings reset to defaults',
      data: defaults
    });
  } catch (error) {
    console.error('Reset System Settings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset system settings'
    });
  }
};

// @desc    Clear application cache
// @route   POST /api/admin/clear-cache
// @access  Private (Admin)
exports.clearCache = async (req, res) => {
  try {
    // Placeholder: clear in-memory caches, temp files, etc.
    // Implement actual cache clearing for your environment
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Clear Cache Error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear cache' });
  }
};

// @desc    Run basic system checks
// @route   GET /api/admin/system-check
// @access  Private (Admin)
exports.systemCheck = async (req, res) => {
  try {
    // Perform simple checks (DB connection, disk space, etc.) - placeholder implementation
    const issues = [];
    // Example check placeholders (expand as needed)
    // if (!db.isConnected) issues.push({name: 'Database', severity: 'critical', message: 'DB not connected'});

    res.json({ success: true, data: { issues } });
  } catch (error) {
    console.error('System Check Error:', error);
    res.status(500).json({ success: false, message: 'System check failed' });
  }
};
