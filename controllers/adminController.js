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

    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: galleryItem
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

    res.json({
      success: true,
      data: {
        gallery,
        filters: {
          albums,
          categories
        },
        count: gallery.length
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

// @desc    Get all news
// @route   GET /api/admin/news
// @access  Private (Admin)
exports.getAllNews = async (req, res) => {
  try {
    const { category, status, search, startDate, endDate } = req.query;
    
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
      .populate('author', 'username');

    // Get statistics
    const totalNews = await News.countDocuments();
    const publishedNews = await News.countDocuments({ isPublished: true });
    const draftNews = totalNews - publishedNews;

    res.json({
      success: true,
      data: {
        news,
        stats: {
          total: totalNews,
          published: publishedNews,
          draft: draftNews
        }
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

// @desc    Add new student
// @route   POST /api/admin/students
// @access  Private (Admin)
exports.addStudent = async (req, res) => {
  try {
    const { email, password, ...studentData } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Check if student ID already exists
    const existingStudent = await Student.findOne({ studentId: studentData.studentId });
    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: 'Student ID already exists'
      });
    }

    // Create user account
    const user = new User({
      username: studentData.studentId,
      email,
      password: password || 'password123', // Default password
      role: 'student'
    });
    await user.save();

    // Create student profile
    const student = new Student({
      userId: user._id,
      email: user.email,
      ...studentData
    });
    await student.save();

    // Send welcome email with credentials (optional)
    // await sendWelcomeEmail(user.email, studentData.studentId, password);

    res.status(201).json({
      success: true,
      message: 'Student added successfully',
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        student
      }
    });
  } catch (error) {
    console.error('Add Student Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add student'
    });
  }
};

// @desc    Get all students
// @route   GET /api/admin/students
// @access  Private (Admin)
exports.getAllStudents = async (req, res) => {
  try {
    const { course, semester, status, search } = req.query;
    
    const query = {};
    
    if (course) {
      query.courseEnrolled = course;
    }
    
    if (semester) {
      query.semester = parseInt(semester);
    }
    
    if (status) {
      query.academicStatus = status;
    }
    
    if (search) {
      query.$or = [
        { studentId: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const students = await Student.find(query)
      .populate('courseEnrolled', 'courseName')
      .sort({ createdAt: -1 });

    // Get statistics
    const totalStudents = await Student.countDocuments();
    const activeStudents = await Student.countDocuments({ academicStatus: 'Active' });
    const completedStudents = await Student.countDocuments({ academicStatus: 'Completed' });

    res.json({
      success: true,
      data: {
        students,
        stats: {
          total: totalStudents,
          active: activeStudents,
          completed: completedStudents
        }
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

// @desc    Update student
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

    // Update student data
    Object.keys(updates).forEach(key => {
      if (key !== 'userId' && key !== '_id') {
        student[key] = updates[key];
      }
    });

    await student.save();

    // Update user account if needed
    if (updates.email) {
      await User.findByIdAndUpdate(student.userId, {
        email: updates.email,
        username: updates.studentId || student.studentId
      });
    }

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
    await User.findByIdAndDelete(student.userId);

    // Delete student profile
    await Student.findByIdAndDelete(id);

    // Delete related data
    await Promise.all([
      Attendance.deleteMany({ student: id }),
      Marks.deleteMany({ student: id })
    ]);

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

// @desc    Bulk upload students
// @route   POST /api/admin/students/bulk-upload
// @access  Private (Admin)
exports.bulkUploadStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a CSV/Excel file'
      });
    }

    // Parse CSV/Excel file
    // This is a placeholder - you'll need to implement CSV/Excel parsing
    // using libraries like csv-parser, xlsx, etc.

    const results = {
      total: 0,
      success: 0,
      failed: 0,
      errors: []
    };

    // TODO: Implement CSV parsing and student creation
    // For each row in CSV:
    // 1. Validate data
    // 2. Check for duplicates
    // 3. Create user and student
    // 4. Track success/failure

    res.json({
      success: true,
      message: 'Bulk upload completed',
      data: results
    });
  } catch (error) {
    console.error('Bulk Upload Students Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk upload'
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
      } catch (error) {
        results.failed++;
        results.errors.push({
          studentId: record.studentId,
          error: error.message
        });
      }
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
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          studentId: record.studentId,
          error: error.message
        });
      }
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