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
// Update the Student ID generation logic in addStudent function:

exports.addStudent = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      personalEmail,
      mobileNumber,
      courseEnrolled,
      dateOfBirth,
      gender,
      bloodGroup,
      fatherName,
      fatherMobile,
      motherName,
      motherMobile,
      permanentAddress,
      correspondenceAddress,
      admissionType,
      admissionQuota,
      semester,
      rollNumber,
      qualification,
      boardUniversity,
      passingYear,
      percentage,
      schoolCollege,
      requireHostel,
      requireTransport,
      hostelType,
      transportRoute,
      documents
    } = req.body;

    // ✅ 1. VALIDATE REQUIRED FIELDS
    if (!firstName || !lastName || !personalEmail || !mobileNumber || !courseEnrolled) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: firstName, lastName, personalEmail, mobileNumber, courseEnrolled'
      });
    }

    // ✅ 2. VALIDATE EMAIL FORMAT
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(personalEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // ✅ 3. CHECK IF PERSONAL EMAIL ALREADY EXISTS
    const existingStudentWithEmail = await Student.findOne({ 
      $or: [
        { personalEmail: personalEmail },
        { email: personalEmail }
      ]
    });
    
    if (existingStudentWithEmail) {
      return res.status(400).json({
        success: false,
        message: 'Student with this email already exists'
      });
    }

    // ✅ 4. GET COURSE DETAILS
    const course = await Course.findById(courseEnrolled);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // ✅ 5. GENERATE UNIQUE STUDENT ID (FIXED LOGIC)
    const generateUniqueStudentId = async (courseCode) => {
      const year = new Date().getFullYear();
      const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
      
      // Try multiple attempts to get unique ID
      for (let attempt = 1; attempt <= 10; attempt++) {
        // Get count of students in this course for current month
        const startOfMonth = new Date(year, new Date().getMonth(), 1);
        const endOfMonth = new Date(year, new Date().getMonth() + 1, 0);
        
        const monthlyCount = await Student.countDocuments({
          courseEnrolled,
          admissionDate: {
            $gte: startOfMonth,
            $lte: endOfMonth
          }
        });
        
        const sequence = (monthlyCount + attempt).toString().padStart(3, '0');
        const studentId = `${courseCode}${year}${month}${sequence}`;
        
        // Check if this ID already exists
        const existingStudent = await Student.findOne({ studentId });
        if (!existingStudent) {
          return studentId;
        }
      }
      
      // If all attempts fail, generate with timestamp
      return `${courseCode}${year}${month}${Date.now().toString().slice(-3)}`;
    };

    const studentId = await generateUniqueStudentId(course.courseCode);

    // ✅ 6. GENERATE UNIQUE INSTITUTE EMAIL (FIXED LOGIC)
    const generateUniqueInstituteEmail = async (firstName, lastName, studentId) => {
      const cleanFirstName = firstName.toLowerCase().replace(/[^a-z]/g, '');
      const cleanLastName = lastName.toLowerCase().replace(/[^a-z]/g, '');
      const randomSuffix = Math.floor(100 + Math.random() * 900); // 100-999
      
      // Try multiple email formats
      const emailFormats = [
        `${cleanFirstName}.${cleanLastName}.${studentId.substring(studentId.length - 3)}@nursinginstitute.edu`,
        `${cleanFirstName}.${cleanLastName}.${randomSuffix}@nursinginstitute.edu`,
        `${cleanFirstName[0]}${cleanLastName}.${studentId.substring(studentId.length - 4)}@nursinginstitute.edu`,
        `student.${studentId}@nursinginstitute.edu`
      ];
      
      for (const emailFormat of emailFormats) {
        const existingUser = await User.findOne({ email: emailFormat });
        if (!existingUser) {
          return emailFormat;
        }
      }
      
      // If all formats exist, use timestamp
      return `student.${studentId}.${Date.now().toString().slice(-6)}@nursinginstitute.edu`;
    };

    const instituteEmail = await generateUniqueInstituteEmail(firstName, lastName, studentId);

    // ✅ 7. CHECK IF INSTITUTE EMAIL EXISTS (DOUBLE CHECK)
    const existingUser = await User.findOne({ email: instituteEmail });
    if (existingUser) {
      // Generate new one with timestamp
      instituteEmail = `student.${studentId}.${Date.now().toString().slice(-6)}@nursinginstitute.edu`;
    }

    // ✅ 8. GENERATE STRONG PASSWORD
    const generateStrongPassword = () => {
      const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const lowercase = 'abcdefghijklmnopqrstuvwxyz';
      const numbers = '0123456789';
      const symbols = '!@#$%';
      
      let password = '';
      
      // Ensure at least one of each type
      password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
      password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
      password += numbers.charAt(Math.floor(Math.random() * numbers.length));
      password += symbols.charAt(Math.floor(Math.random() * symbols.length));
      
      // Fill remaining 4 characters
      const allChars = uppercase + lowercase + numbers + symbols;
      for (let i = 0; i < 4; i++) {
        password += allChars.charAt(Math.floor(Math.random() * allChars.length));
      }
      
      // Shuffle the password
      return password.split('').sort(() => 0.5 - Math.random()).join('');
    };
    
    const password = generateStrongPassword();

    // ✅ 9. HASH PASSWORD
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // ✅ 10. CREATE USER ACCOUNT
    const user = new User({
      username: studentId,
      email: instituteEmail,
      password: hashedPassword,
      role: 'student',
      isActive: true,
      lastLogin: null
    });

    await user.save();

    // ✅ 11. PROCESS DOCUMENTS CORRECTLY
    const processDocuments = (docsObj) => {
      if (!docsObj || typeof docsObj !== 'object') return [];
      
      const documentMap = {
        'aadhar': 'Aadhar',
        'tc': 'TC',
        'marksheet': 'MarkSheet',
        'photo': 'Photo',
        'medical': 'Medical',
        'caste': 'Caste',
        'income': 'Income',
        'other': 'Other'
      };
      
      const processedDocs = [];
      
      Object.entries(docsObj).forEach(([key, value]) => {
        const docType = documentMap[key.toLowerCase()];
        if (value === true && docType) {
          processedDocs.push({
            documentType: docType,
            documentName: `${docType} Certificate`,
            documentUrl: '',
            uploadedAt: null,
            verified: false
          });
        }
      });
      
      return processedDocs;
    };

    // ✅ 12. CREATE STUDENT PROFILE
    const student = new Student({
      userId: user._id,
      studentId: studentId,
      firstName: firstName,
      lastName: lastName,
      fullName: `${firstName} ${lastName}`,
      
      // Required fields by model
      email: personalEmail,
      personalEmail: personalEmail,
      instituteEmail: instituteEmail,
      
      contactNumber: mobileNumber,
      mobileNumber: mobileNumber,
      
      batchYear: req.body.batchYear || new Date().getFullYear(),
      
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender: gender || 'Other',
      bloodGroup: bloodGroup || '',
      
      // Address
      address: {
        street: permanentAddress?.addressLine1 || '',
        city: permanentAddress?.city || '',
        state: permanentAddress?.state || '',
        pincode: permanentAddress?.pincode || '',
        country: permanentAddress?.country || 'India'
      },
      
      correspondenceAddress: correspondenceAddress?.sameAsPermanent ? null : {
        street: correspondenceAddress?.addressLine1 || '',
        city: correspondenceAddress?.city || '',
        state: correspondenceAddress?.state || '',
        pincode: correspondenceAddress?.pincode || ''
      },
      
      // Guardian Details
      guardianDetails: {
        fatherName: fatherName || '',
        fatherOccupation: req.body.fatherOccupation || '',
        fatherContact: fatherMobile || '',
        motherName: motherName || '',
        motherOccupation: req.body.motherOccupation || '',
        motherContact: motherMobile || '',
        guardianName: req.body.guardianName || '',
        guardianRelation: req.body.guardianRelation || '',
        guardianContact: req.body.guardianMobile || ''
      },
      
      // Academic Details
      courseEnrolled: courseEnrolled,
      admissionYear: new Date().getFullYear(),
      admissionType: admissionType || 'Regular',
      admissionQuota: admissionQuota || 'General',
      semester: parseInt(semester) || 1,
      rollNumber: rollNumber || '',
      admissionDate: new Date(),
      
      // Previous Education
      previousEducation: {
        qualification: qualification || '12th',
        boardUniversity: boardUniversity || '',
        passingYear: passingYear || '',
        percentage: percentage || '',
        schoolCollege: schoolCollege || ''
      },
      
      // Facilities
      hostelAllotted: requireHostel || false,
      hostelDetails: requireHostel ? {
        hostelName: `${hostelType} Hostel`,
        roomNumber: 'To be allocated',
        fees: hostelType === 'Boys' ? 50000 : 55000
      } : null,
      
      transportFacility: requireTransport || false,
      transportDetails: requireTransport ? {
        routeNumber: transportRoute || 'Route 1',
        pickupPoint: 'To be assigned',
        fees: 15000
      } : null,
      
      // Documents
      documents: processDocuments(documents),
      
      // Status
      academicStatus: 'Active',
      attendancePercentage: 0,
      cgpa: 0,
      
      // Fees
      fees: {
        totalFees: course.feesStructure?.totalFee || 50000,
        feesPaid: 0,
        pendingFees: course.feesStructure?.totalFee || 50000,
        lastPaymentDate: null
      },
      
      // Payment History
      paymentHistory: []
    });

    await student.save();

    // ✅ 13. SEND EMAIL
    try {
      await sendStudentCredentials({
        studentName: `${firstName} ${lastName}`,
        personalEmail: personalEmail,
        instituteEmail: instituteEmail,
        studentId: studentId,
        password: password
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Continue even if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Student added successfully',
      data: {
        student: {
          _id: student._id,
          studentId: studentId,
          fullName: `${firstName} ${lastName}`,
          personalEmail: personalEmail,
          instituteEmail: instituteEmail,
          course: course.courseName,
          batchYear: student.batchYear
        },
        credentials: {
          studentId: studentId,
          instituteEmail: instituteEmail,
          password: password,
          note: 'Please change password on first login'
        }
      }
    });

  } catch (error) {
    console.error('❌ Add Student Error:', error);
    
    // Clean up if student creation failed
    if (req.body.studentId) {
      await User.findOneAndDelete({ username: req.body.studentId });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add student',
      validationErrors: error.errors ? Object.keys(error.errors) : [],
      errorDetails: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
// Helper: Send student credentials email
const sendStudentCredentials = async ({ studentName, personalEmail, instituteEmail, studentId, password }) => {
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
    cc: process.env.ADMIN_EMAIL,
    subject: 'Welcome to Nursing Institute - Your Login Credentials',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(to right, #1e40af, #3b82f6); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0;">🎓 Nursing Institute</h1>
          <p style="margin: 5px 0 0 0; font-size: 18px;">Excellence in Healthcare Education</p>
        </div>
        
        <div style="padding: 30px; background: #f8fafc; border-radius: 0 0 10px 10px; border: 1px solid #e2e8f0;">
          <h2 style="color: #1e40af;">Welcome ${studentName}!</h2>
          <p>Your admission to Nursing Institute has been processed successfully. We are pleased to welcome you to our institute.</p>
          
          <div style="background: white; border: 2px solid #3b82f6; border-radius: 10px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #1e40af; margin-top: 0;">Your Login Credentials</h3>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>Student ID:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #1e40af;">${studentId}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>Institute Email:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #1e40af;">${instituteEmail}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>Password:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #ef4444;">${password}</td>
              </tr>
              <tr>
                <td style="padding: 10px;"><strong>Login URL:</strong></td>
                <td style="padding: 10px;">
                  <a href="${process.env.FRONTEND_URL}/login" style="color: #3b82f6; text-decoration: none;">
                    ${process.env.FRONTEND_URL}/login
                  </a>
                </td>
              </tr>
            </table>
          </div>
          
          <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <h4 style="color: #d97706; margin-top: 0;">⚠️ Important Instructions</h4>
            <ol style="margin: 0; padding-left: 20px;">
              <li><strong>Change your password immediately</strong> after first login</li>
              <li>Use your <strong>Institute Email</strong> for all academic communications</li>
              <li>Check your institute email regularly for updates</li>
              <li>Your Student ID must be mentioned in all communications</li>
            </ol>
          </div>
          
          <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
            <h4 style="color: #059669; margin-top: 0;">📅 Next Steps</h4>
            <ul style="margin: 0; padding-left: 20px;">
              <li>Complete your profile in the Student Portal</li>
              <li>Upload required documents within 7 days</li>
              <li>Check the academic calendar for important dates</li>
              <li>Join the orientation program (Date will be announced)</li>
            </ul>
          </div>
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="${process.env.FRONTEND_URL}/login" style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Go to Student Portal
            </a>
          </p>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
          
          <div style="text-align: center; color: #64748b; font-size: 14px;">
            <p>For any queries, contact:</p>
            <p>
              📞 Admission Office: +91 9876543210<br>
              📧 Email: admissions@nursinginstitute.edu<br>
              🏢 Address: Nursing Institute Campus, Education City, State - 600001
            </p>
            <p style="margin-top: 20px;">
              <em>This is an automated email. Please do not reply.</em>
            </p>
          </div>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
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
      academicStatus, 
      batchYear,
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
    if (course && mongoose.Types.ObjectId.isValid(course)) {
      query.courseEnrolled = course;
    }

    // Semester filter
    if (semester) {
      query.semester = parseInt(semester);
    }

    // Status filter
    if (academicStatus) {
      query.academicStatus = academicStatus;
    }

    // Batch year filter
    if (batchYear) {
      query.admissionYear = parseInt(batchYear);
    }

    // Get students with pagination
    const students = await Student.find(query)
      .populate('courseEnrolled', 'courseName courseCode duration')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v -userId');

    // Get total count for pagination
    const total = await Student.countDocuments(query);

    // Get statistics
    const stats = {
      total: await Student.countDocuments(),
      active: await Student.countDocuments({ academicStatus: 'Active' }),
      completed: await Student.countDocuments({ academicStatus: 'Completed' }),
      onLeave: await Student.countDocuments({ academicStatus: 'On Leave' }),
      discontinued: await Student.countDocuments({ academicStatus: 'Discontinued' })
    };

    // Course-wise distribution
    const courseWise = await Student.aggregate([
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
          courseCode: '$course.courseCode',
          count: 1
        }
      }
    ]);

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
        stats,
        distribution: {
          courses: courseWise,
          semesterWise: await getSemesterWiseDistribution(),
          statusWise: await getStatusWiseDistribution()
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

// Helper: Get semester-wise distribution
const getSemesterWiseDistribution = async () => {
  return await Student.aggregate([
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
};

// Helper: Get status-wise distribution
const getStatusWiseDistribution = async () => {
  return await Student.aggregate([
    {
      $group: {
        _id: '$academicStatus',
        count: { $sum: 1 }
      }
    }
  ]);
};
// @desc    Get student by ID
// @route   GET /api/admin/students/:id
// @access  Private (Admin)
exports.getStudentById = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('courseEnrolled')
      .populate('userId', 'username email isActive lastLogin')
      .select('-__v');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get attendance summary
    const attendanceSummary = await Attendance.aggregate([
      {
        $match: { 
          student: student._id,
          isHoliday: false 
        }
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
      .select('subject semester examType marks.obtained percentage grade resultStatus')
      .limit(10);

    // Calculate GPA
    const gpa = await calculateGPA(student._id);

    // Get fees status
    const feesStatus = {
      totalFees: student.fees?.totalFees || 0,
      paid: student.fees?.feesPaid || 0,
      pending: student.fees?.pendingFees || 0,
      lastPayment: student.fees?.lastPaymentDate,
      paymentHistory: student.paymentHistory || []
    };

    // Get documents status
    const documentsStatus = student.documents?.map(doc => ({
      type: doc.documentType,
      name: doc.documentName,
      uploaded: !!doc.documentUrl,
      verified: doc.verified,
      uploadedAt: doc.uploadedAt
    })) || [];

    res.json({
      success: true,
      data: {
        student,
        academic: {
          attendance: {
            summary: attendanceSummary,
            percentage: student.attendancePercentage || 0
          },
          marks: marksSummary,
          gpa: gpa.toFixed(2)
        },
        fees: feesStatus,
        documents: documentsStatus,
        hostel: student.hostelDetails,
        transport: student.transportDetails
      }
    });

  } catch (error) {
    console.error('Get Student By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student details'
    });
  }
};

// Helper: Calculate GPA
const calculateGPA = async (studentId) => {
  const marks = await Marks.find({ 
    student: studentId,
    resultStatus: 'Pass'
  });

  if (marks.length === 0) return 0;

  const gradePoints = {
    'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'D': 4, 'F': 0
  };

  let totalPoints = 0;
  let totalCredits = 0;

  marks.forEach(mark => {
    const points = gradePoints[mark.grade] || 0;
    const credits = 4; // Assuming each subject has 4 credits
    totalPoints += points * credits;
    totalCredits += credits;
  });

  return totalCredits > 0 ? totalPoints / totalCredits : 0;
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

    // Fields that can be updated
    const allowedUpdates = [
      'firstName', 'lastName', 'fullName',
      'mobileNumber', 'alternateContact', 'whatsappNumber',
      'dateOfBirth', 'gender', 'bloodGroup',
      'address', 'correspondenceAddress',
      'guardianDetails',
      'courseEnrolled', 'semester', 'rollNumber',
      'academicStatus',
      'hostelAllotted', 'hostelDetails',
      'transportFacility', 'transportDetails',
      'documents',
      'fees'
    ];

    // Apply updates
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        if (key === 'documents' && Array.isArray(updates[key])) {
          student[key] = updates[key];
        } else if (typeof updates[key] === 'object' && updates[key] !== null) {
          student[key] = { ...student[key], ...updates[key] };
        } else {
          student[key] = updates[key];
        }
      }
    });

    // Update full name if first/last name changed
    if (updates.firstName || updates.lastName) {
      student.fullName = `${updates.firstName || student.firstName} ${updates.lastName || student.lastName}`;
    }

    // Update user email if institute email changed
    if (updates.instituteEmail && updates.instituteEmail !== student.instituteEmail) {
      const user = await User.findById(student.userId);
      if (user) {
        user.email = updates.instituteEmail;
        await user.save();
        student.instituteEmail = updates.instituteEmail;
      }
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

    // Check if student can be deleted
    if (student.academicStatus === 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete active student. Change status first.'
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

    const filePath = req.file.path;
    const results = {
      total: 0,
      success: 0,
      failed: 0,
      errors: []
    };

    const studentsData = [];
    const errors = [];

    // Read CSV file
    const readCSV = () => {
      return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => {
            studentsData.push(row);
          })
          .on('end', () => {
            resolve();
          })
          .on('error', (error) => {
            reject(error);
          });
      });
    };

    await readCSV();

    // Process each row
    for (let i = 0; i < studentsData.length; i++) {
      const row = studentsData[i];
      const rowNumber = i + 2; // +2 because header is row 1

      try {
        // Validate required fields
        if (!row.firstName || !row.lastName || !row.personalEmail || !row.mobileNumber || !row.courseCode) {
          throw new Error('Missing required fields');
        }

        // Validate email
        if (!row.personalEmail.includes('@')) {
          throw new Error('Invalid email format');
        }

        // Find course by code
        const course = await Course.findOne({ courseCode: row.courseCode.toUpperCase() });
        if (!course) {
          throw new Error(`Course ${row.courseCode} not found`);
        }

        // Check if email already exists
        const existingStudent = await Student.findOne({ personalEmail: row.personalEmail });
        if (existingStudent) {
          throw new Error('Email already exists');
        }

        // Generate Student ID
        const year = row.admissionYear || new Date().getFullYear();
        const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
        const studentCount = await Student.countDocuments({
          courseEnrolled: course._id,
          admissionYear: year
        });
        const sequence = (studentCount + 1).toString().padStart(3, '0');
        const studentId = `${course.courseCode}${year}${month}${sequence}`;

        // Generate Institute Email
        const cleanFirstName = row.firstName.toLowerCase().replace(/[^a-z]/g, '');
        const cleanLastName = row.lastName.toLowerCase().replace(/[^a-z]/g, '');
        const instituteEmail = `${cleanFirstName}.${cleanLastName}.${studentId.substring(studentId.length - 3)}@nursinginstitute.edu`;

        // Generate Password
        const generatePassword = () => {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
          let password = '';
          for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return password;
        };
        const password = generatePassword();

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
          firstName: row.firstName,
          lastName: row.lastName,
          fullName: `${row.firstName} ${row.lastName}`,
          personalEmail: row.personalEmail,
          instituteEmail: instituteEmail,
          mobileNumber: row.mobileNumber,
          dateOfBirth: row.dateOfBirth || null,
          gender: row.gender || 'Other',
          courseEnrolled: course._id,
          admissionYear: parseInt(year),
          admissionType: row.admissionType || 'Regular',
          admissionQuota: row.admissionQuota || 'General',
          semester: parseInt(row.semester) || 1,
          academicStatus: 'Active',
          admissionDate: new Date(),
          previousEducation: {
            qualification: row.qualification || '12th',
            boardUniversity: row.boardUniversity || '',
            passingYear: row.passingYear || '',
            percentage: row.percentage || ''
          },
          fees: {
            totalFees: course.feesStructure?.totalFee || 50000,
            feesPaid: 0,
            pendingFees: course.feesStructure?.totalFee || 50000
          }
        });

        await student.save();

        // Send email (in background, don't wait)
        setTimeout(async () => {
          try {
            await sendStudentCredentials({
              studentName: `${row.firstName} ${row.lastName}`,
              personalEmail: row.personalEmail,
              instituteEmail: instituteEmail,
              studentId: studentId,
              password: password
            });
          } catch (emailError) {
            console.error('Failed to send email for:', row.personalEmail, emailError);
          }
        }, 0);

        results.success++;
        results.total++;

      } catch (error) {
        results.failed++;
        results.total++;
        errors.push({
          row: rowNumber,
          student: `${row.firstName} ${row.lastName}`,
          error: error.message
        });
      }
    }

    // Clean up file
    fs.unlinkSync(filePath);

    results.errors = errors;

    res.json({
      success: true,
      message: 'Bulk upload completed',
      data: results
    });

  } catch (error) {
    console.error('Bulk Upload Students Error:', error);
    
    // Clean up file if exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
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
    const { newPassword, sendEmail } = req.body;

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const user = await User.findById(student.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    // Generate new password if not provided
    const password = newPassword || generateStrongPassword();

    // Hash and update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
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
        emailSent: sendEmail || false
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

// Helper: Generate strong password
const generateStrongPassword = () => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  
  let password = '';
  
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += symbols.charAt(Math.floor(Math.random() * symbols.length));
  
  const allChars = uppercase + lowercase + numbers + symbols;
  for (let i = 4; i < 12; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  
  return password.split('').sort(() => 0.5 - Math.random()).join('');
};

// Helper: Send password reset email
const sendPasswordResetEmail = async ({ studentName, personalEmail, instituteEmail, newPassword }) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: `"Nursing Institute IT Support" <${process.env.EMAIL_USER}>`,
    to: personalEmail,
    subject: 'Password Reset - Nursing Institute Student Portal',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h2 style="margin: 0;">🔐 Password Reset Notification</h2>
        </div>
        
        <div style="padding: 30px; background: #f8fafc; border-radius: 0 0 10px 10px; border: 1px solid #e2e8f0;">
          <p>Hello ${studentName},</p>
          <p>Your password for the Nursing Institute Student Portal has been reset by the administrator.</p>
          
          <div style="background: white; border: 2px solid #ef4444; border-radius: 10px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #ef4444; margin-top: 0;">New Login Credentials</h3>
            <p><strong>Institute Email:</strong> ${instituteEmail}</p>
            <p><strong>New Password:</strong> <code style="background: #fee2e2; padding: 5px 10px; border-radius: 4px;">${newPassword}</code></p>
          </div>
          
          <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <h4 style="color: #d97706; margin-top: 0;">⚠️ Security Alert</h4>
            <ul style="margin: 0; padding-left: 20px;">
              <li>Change your password immediately after login</li>
              <li>Do not share your password with anyone</li>
              <li>Use a strong, unique password</li>
              <li>Logout after each session</li>
            </ul>
          </div>
          
          <p style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/login" style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Login to Student Portal
            </a>
          </p>
          
          <p style="margin-top: 30px; color: #64748b; font-size: 14px;">
            If you did not request this password reset, please contact the IT department immediately.
          </p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// @desc    Export students to CSV
// @route   GET /api/admin/students/export
// @access  Private (Admin)
exports.exportStudents = async (req, res) => {
  try {
    const { course, academicStatus, batchYear } = req.query;

    const query = {};
    if (course) query.courseEnrolled = course;
    if (academicStatus) query.academicStatus = academicStatus;
    if (batchYear) query.admissionYear = parseInt(batchYear);

    const students = await Student.find(query)
      .populate('courseEnrolled', 'courseName courseCode')
      .select('studentId fullName personalEmail instituteEmail mobileNumber courseEnrolled semester academicStatus admissionDate')
      .sort({ studentId: 1 });

    // Create CSV content
    let csvContent = 'Student ID,Full Name,Personal Email,Institute Email,Mobile Number,Course,Semester,Status,Admission Date\n';
    
    students.forEach(student => {
      csvContent += `"${student.studentId}","${student.fullName}","${student.personalEmail}","${student.instituteEmail}","${student.mobileNumber}","${student.courseEnrolled?.courseName || 'N/A'}","${student.semester}","${student.academicStatus}","${student.admissionDate.toISOString().split('T')[0]}"\n`;
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=students_export.csv');
    
    res.send(csvContent);

  } catch (error) {
    console.error('Export Students Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export students'
    });
  }
};

// @desc    Get student statistics
// @route   GET /api/admin/students/stats/overview
// @access  Private (Admin)
exports.getStudentStatistics = async (req, res) => {
  try {
    // Overall statistics
    const overallStats = await Student.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$academicStatus', 'Active'] }, 1, 0] }
          },
          male: {
            $sum: { $cond: [{ $eq: ['$gender', 'Male'] }, 1, 0] }
          },
          female: {
            $sum: { $cond: [{ $eq: ['$gender', 'Female'] }, 1, 0] }
          },
          avgAttendance: { $avg: '$attendancePercentage' },
          avgCGPA: { $avg: '$cgpa' }
        }
      }
    ]);

    // Year-wise admission trend
    const admissionTrend = await Student.aggregate([
      {
        $group: {
          _id: { $year: '$admissionDate' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $limit: 5
      }
    ]);

    // Course-wise statistics
    const courseStats = await Student.aggregate([
      {
        $group: {
          _id: '$courseEnrolled',
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$academicStatus', 'Active'] }, 1, 0] }
          }
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
          courseCode: '$course.courseCode',
          total: 1,
          active: 1,
          percentage: { $multiply: [{ $divide: ['$active', '$total'] }, 100] }
        }
      },
      {
        $sort: { total: -1 }
      }
    ]);

    // Semester-wise distribution
    const semesterStats = await Student.aggregate([
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

    // Hostel statistics
    const hostelStats = await Student.aggregate([
      {
        $group: {
          _id: '$hostelAllotted',
          count: { $sum: 1 },
          male: {
            $sum: { $cond: [{ $eq: ['$gender', 'Male'] }, 1, 0] }
          },
          female: {
            $sum: { $cond: [{ $eq: ['$gender', 'Female'] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        overall: overallStats[0] || {
          total: 0,
          active: 0,
          male: 0,
          female: 0,
          avgAttendance: 0,
          avgCGPA: 0
        },
        trends: {
          admission: admissionTrend,
          semester: semesterStats
        },
        courses: courseStats,
        facilities: {
          hostel: hostelStats,
          transport: await Student.countDocuments({ transportFacility: true })
        },
        fees: await getFeesStatistics()
      }
    });

  } catch (error) {
    console.error('Get Student Statistics Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student statistics'
    });
  }
};

// Helper: Get fees statistics
const getFeesStatistics = async () => {
  const result = await Student.aggregate([
    {
      $group: {
        _id: null,
        totalFees: { $sum: '$fees.totalFees' },
        paidFees: { $sum: '$fees.feesPaid' },
        pendingFees: { $sum: '$fees.pendingFees' },
        studentsWithPendingFees: {
          $sum: {
            $cond: [{ $gt: ['$fees.pendingFees', 0] }, 1, 0]
          }
        }
      }
    }
  ]);

  return result[0] || {
    totalFees: 0,
    paidFees: 0,
    pendingFees: 0,
    studentsWithPendingFees: 0
  };
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