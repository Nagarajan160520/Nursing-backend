const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Load environment variables
dotenv.config();

// Import all controllers
const authController = require('./controllers/authController');
const adminController = require('./controllers/adminController');
const studentController = require('./controllers/studentController');
const publicController = require('./controllers/publicController');
const courseController = require('./controllers/courseController');
const downloadController = require('./controllers/downloadController');
const facultyController = require('./controllers/facultyController');
const galleryController = require('./controllers/galleryController');
const newsController = require('./controllers/newsController');
const placementController = require('./controllers/placementController');
const eventsController = require('./controllers/eventsController');
const userController = require('./controllers/userController');

// Import routes
const adminRoutes = require('./routes/adminRoutes');

// Import middleware
const { auth, isAdmin, isStudent, isFaculty } = require('./middleware/auth');
const upload = require('./middleware/upload');

const app = express(); 

// ====================
// SECURITY MIDDLEWARE
// ====================
app.use(helmet()); // Set security HTTP headers

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp());

// ====================
// CORS CONFIGURATION
// ====================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Handle preflight requests
app.options('*', cors());

// ====================
// LOGGING MIDDLEWARE
// ====================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  const accessLogStream = fs.createWriteStream(
    path.join(__dirname, 'access.log'),
    { flags: 'a' }
  );
  app.use(morgan('combined', { stream: accessLogStream }));
}

// ====================
// STATIC FILES
// ====================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static images (used by placeholder previews)
const frontendImagesPath = path.join(__dirname, '..', 'frontend', 'public', 'images');
if (fs.existsSync(frontendImagesPath)) {
  app.use('/images', express.static(frontendImagesPath));
} else {
  // If images folder doesn't exist, create a placeholder directory to avoid 404s in logs
  try {
    fs.mkdirSync(frontendImagesPath, { recursive: true });
    app.use('/images', express.static(frontendImagesPath));
    console.log(`Created and serving placeholder images directory: ${frontendImagesPath}`);
  } catch (err) {
    console.warn('Could not create frontend images directory:', err.message);
  }
}

// Create uploads directory if it doesn't exist
const uploadDirs = [
  'uploads', 
  'uploads/documents', 
  'uploads/gallery', 
  'uploads/profile', 
  'uploads/news',
  'uploads/syllabus',
  'uploads/timetable'
];

uploadDirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
});

// ====================
// DATABASE CONNECTION
// ====================
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb+srv://nagarajan16052001:NAGARAJAN2001@cluster0.jxnj3.mongodb.net/nursing_institute1', 
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }
    );
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Create default admin if not exists
    await createDefaultAdmin();
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

// ====================
// EMERGENCY ADMIN CREATION
// ====================

// Direct admin creation endpoint - 100% WORKING
app.post('/api/auth/fix-admin', async (req, res) => {
  try {
    console.log('🛠️ FIXING ADMIN ACCOUNT...');
    
    const User = require('./models/User');
    const Admin = require('./models/Admin');
    
    // Delete existing
    await User.deleteMany({ email: 'admin@institute.edu' });
    await Admin.deleteMany({ email: 'admin@institute.edu' });
    console.log('🗑️ Cleared existing admin data');
    
    // Create password hash DIRECTLY
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    console.log('🔐 Created password hash');
    
    // Create user DIRECTLY in collection (bypass mongoose hooks)
    const userDoc = {
      username: 'admin',
      email: 'admin@institute.edu',
      password: hashedPassword,
      role: 'admin',
      isActive: true,
      phoneNumber: '9876543210',
      loginAttempts: 0,
      lockUntil: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const db = mongoose.connection.db;
    const userResult = await db.collection('users').insertOne(userDoc);
    console.log('✅ Created admin user');
    
    // Create admin profile
    const adminDoc = {
      userId: userResult.insertedId,
      employeeId: 'ADMIN001',
      fullName: 'System Administrator',
      designation: 'Administrator',
      department: 'Administration',
      contactNumber: '9876543210',
      email: 'admin@institute.edu',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await db.collection('admins').insertOne(adminDoc);
    console.log('✅ Created admin profile');
    
    // Test the password
    const testUser = await db.collection('users').findOne({ email: 'admin@institute.edu' });
    const passwordValid = await bcrypt.compare('admin123', testUser.password);
    
    console.log('🧪 Password test:', passwordValid ? '✅ SUCCESS' : '❌ FAILED');
    
    res.json({
      success: true,
      message: 'Admin account fixed successfully!',
      credentials: {
        email: 'admin@institute.edu',
        password: 'admin123',
        passwordValid: passwordValid
      }
    });
    
  } catch (error) {
    console.error('Fix admin error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Test login endpoint
app.post('/api/auth/test-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🧪 Testing login for:', email);
    
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({ email });
    
    if (!user) {
      return res.json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log('User found:', user.email);
    console.log('Password hash:', user.password.substring(0, 30) + '...');
    
    const passwordValid = await bcrypt.compare(password, user.password);
    
    res.json({
      success: true,
      data: {
        userExists: true,
        email: user.email,
        role: user.role,
        passwordValid: passwordValid,
        hash: user.password.substring(0, 30) + '...',
        hashLength: user.password.length
      }
    });
    
  } catch (error) {
    console.error('Test login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Direct login endpoint (bypasses everything)
app.post('/api/auth/direct-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔓 DIRECT LOGIN:', email);
    
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({ email });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }
    
    // Create token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { 
        userId: user._id, 
        role: user.role,
        email: user.email 
      },
      process.env.JWT_SECRET || 'nursing_institute_secret_key',
      { expiresIn: '30d' }
    );
    
    // Get admin profile if exists
    let profile = null;
    if (user.role === 'admin') {
      profile = await db.collection('admins').findOne({ userId: user._id });
    }
    
    console.log('✅ Direct login successful');
    
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
        profileImage: user.profileImage || '/uploads/profile/default.jpg',
        profile: profile
      }
    });
    
  } catch (error) {
    console.error('Direct login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Function to create default admin
const createDefaultAdmin = async () => {
  try {
    console.log('\n🔍 Checking for admin user...');
    
    const db = mongoose.connection.db;
    const adminUser = await db.collection('users').findOne({ email: 'admin@institute.edu' });
    
    if (!adminUser) {
      console.log('👤 Admin not found, creating...');
      
      // Create password hash
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      
      // Insert directly
      const userDoc = {
        username: 'admin',
        email: 'admin@institute.edu',
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        phoneNumber: '9876543210',
        loginAttempts: 0,
        lockUntil: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const userResult = await db.collection('users').insertOne(userDoc);
      
      // Create admin profile
      const adminDoc = {
        userId: userResult.insertedId,
        employeeId: 'ADMIN001',
        fullName: 'System Administrator',
        designation: 'Administrator',
        department: 'Administration',
        contactNumber: '9876543210',
        email: 'admin@institute.edu',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection('admins').insertOne(adminDoc);
      
      console.log('✅ Default admin created successfully!');
    } else {
      console.log('✅ Admin user already exists');
      
      // Test the password
      const passwordValid = await bcrypt.compare('admin123', adminUser.password);
      console.log(`🔐 Password test: ${passwordValid ? '✅ VALID' : '❌ INVALID'}`);
      
      if (!passwordValid) {
        console.log('🔄 Password mismatch, resetting...');
        const newHash = await bcrypt.hash('admin123', 10);
        await db.collection('users').updateOne(
          { _id: adminUser._id },
          { $set: { password: newHash } }
        );
        console.log('✅ Password reset');
      }
    }
    
    console.log('\n📋 ADMIN CREDENTIALS:');
    console.log('=======================');
    console.log('📧 Email: admin@institute.edu');
    console.log('🔑 Password: admin123');
    console.log('👤 Username: admin');
    console.log('👨‍💼 Role: admin');
    console.log('=======================\n');
    
  } catch (error) {
    console.error('❌ Admin setup error:', error.message);
  }
};

// ====================
// API ROUTES
// ====================

// ================
// AUTH ROUTES
// ================
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.post('/api/auth/forgot-password', authController.forgotPassword);
app.put('/api/auth/reset-password/:token', authController.resetPassword);
app.get('/api/auth/me', auth, authController.getMe);
app.put('/api/auth/profile', auth, authController.updateProfile);
app.put('/api/auth/change-password', auth, authController.changePassword);
app.post('/api/auth/logout', auth, authController.logout);

// ================
// ADMIN ROUTES
// ================
// Mount admin routes
app.use('/api/admin', adminRoutes);

app.get('/api/admin/dashboard/stats', auth, isAdmin, adminController.getDashboardStats);
app.post('/api/admin/courses', auth, isAdmin, adminController.addCourse);
app.get('/api/admin/courses', auth, isAdmin, adminController.getAllCourses);
app.get('/api/admin/courses/:id', auth, isAdmin, adminController.getCourseDetails);
app.put('/api/admin/courses/:id', auth, isAdmin, adminController.updateCourse);
app.delete('/api/admin/courses/:id', auth, isAdmin, adminController.deleteCourse);
app.post('/api/admin/gallery', auth, isAdmin, upload.single('image'), adminController.uploadGallery);
app.get('/api/admin/gallery', auth, isAdmin, adminController.getAllGallery);
app.put('/api/admin/gallery/:id', auth, isAdmin, adminController.updateGallery);
app.delete('/api/admin/gallery/:id', auth, isAdmin, adminController.deleteGallery);
app.post('/api/admin/news', auth, isAdmin, upload.array('attachments', 5), adminController.addNews);
app.get('/api/admin/news', auth, isAdmin, adminController.getAllNews);
app.put('/api/admin/news/:id', auth, isAdmin, adminController.updateNews);
app.delete('/api/admin/news/:id', auth, isAdmin, adminController.deleteNews);
// Event routes (Admin)
app.get('/api/admin/events', auth, isAdmin, eventsController.getAllAdminEvents);
app.post('/api/admin/events', auth, isAdmin, eventsController.createEvent);
app.put('/api/admin/events/:id', auth, isAdmin, eventsController.updateEvent);
app.delete('/api/admin/events/:id', auth, isAdmin, eventsController.deleteEvent);
app.post('/api/admin/students', auth, isAdmin, adminController.addStudent);
app.get('/api/admin/students', auth, isAdmin, adminController.getAllStudents);

// Essential validation routes (must come before parameterized routes)
app.get('/api/admin/students/check-email', auth, isAdmin, adminController.checkEmail);
app.get('/api/admin/students/check-mobile', auth, isAdmin, adminController.checkMobile);
app.get('/api/admin/students/count', auth, isAdmin, adminController.getStudentCount);

// Parameterized routes after specific ones
app.get('/api/admin/students/:id', auth, isAdmin, adminController.getStudentDetails);
app.put('/api/admin/students/:id', auth, isAdmin, adminController.updateStudent);
app.delete('/api/admin/students/:id', auth, isAdmin, adminController.deleteStudent);
app.post('/api/admin/students/bulk-upload', auth, isAdmin, upload.single('file'), adminController.bulkUploadStudents);
app.post('/api/admin/attendance', auth, isAdmin, adminController.manageAttendance);
app.post('/api/admin/marks', auth, isAdmin, adminController.manageMarks);
app.put('/api/admin/marks/publish', auth, isAdmin, adminController.publishMarks);
app.post('/api/admin/downloads', auth, isAdmin, upload.single('file'), adminController.uploadStudyMaterial);
app.get('/api/admin/downloads', auth, isAdmin, adminController.getAllDownloads);
app.put('/api/admin/downloads/:id', auth, isAdmin, adminController.updateDownload);
app.delete('/api/admin/downloads/:id', auth, isAdmin, adminController.deleteDownload);



// ================
// STUDENT ROUTES
// ================
app.get('/api/student/dashboard', auth, isStudent, studentController.getDashboard);
app.get('/api/student/profile', auth, isStudent, studentController.getProfile);
app.put('/api/student/profile', auth, isStudent, studentController.updateProfile);
app.get('/api/student/attendance', auth, isStudent, studentController.getAttendance);
app.get('/api/student/marks', auth, isStudent, studentController.getMarks);
app.get('/api/student/clinical-schedule', auth, isStudent, studentController.getClinicalSchedule);
app.get('/api/student/downloads', auth, isStudent, studentController.getDownloads);
app.post('/api/student/downloads/:id/record', auth, isStudent, studentController.recordDownload);
app.get('/api/student/notifications', auth, isStudent, studentController.getNotifications);
app.put('/api/student/notifications/:id/read', auth, isStudent, studentController.markNotificationAsRead);

// ================
// PUBLIC ROUTES
// ================
app.get('/api/public/home', publicController.getHomeData);
app.get('/api/public/events', publicController.getPublicEvents);
app.get('/api/public/courses', publicController.getAllCourses);
app.get('/api/public/courses/:id', publicController.getCourseDetails);
app.get('/api/public/gallery', publicController.getGallery);
app.get('/api/public/gallery/:id', publicController.getGalleryItem);
app.post('/api/public/gallery/:id/like', auth, publicController.likeGalleryItem);
app.post('/api/public/gallery/:id/comments', auth, publicController.addComment);
app.get('/api/public/news', publicController.getAllNews);
app.get('/api/public/news/:slug', publicController.getNewsDetails);
app.get('/api/public/faculty', publicController.getFaculty);
app.get('/api/public/faculty/:id', publicController.getFacultyDetails);
app.post('/api/public/contact', publicController.submitContactForm);
app.get('/api/public/about', publicController.getAboutInfo);
app.get('/api/public/search', publicController.search);

// ================
// COURSE ROUTES
// ================
app.get('/api/courses', courseController.getAllCourses);
app.get('/api/courses/:id', courseController.getCourse);
app.get('/api/courses/:id/syllabus', courseController.getCourseSyllabus);
app.get('/api/courses/:id/eligibility', courseController.getCourseEligibility);
app.get('/api/courses/:id/careers', courseController.getCourseCareers);
app.get('/api/courses/:id/clinical', courseController.getCourseClinical);
app.get('/api/courses/search', courseController.searchCourses);
app.get('/api/courses/featured', courseController.getFeaturedCourses);
app.get('/api/courses/stats', auth, isAdmin, courseController.getCourseStats);

// ================
// DOWNLOAD ROUTES
// ================
app.get('/api/downloads', downloadController.getAllDownloads);
app.get('/api/downloads/:id', downloadController.getDownload);
app.get('/api/downloads/:id/file', downloadController.downloadFile);
app.get('/api/downloads/categories', downloadController.getDownloadCategories);
app.get('/api/downloads/recent', downloadController.getRecentDownloads);
app.get('/api/downloads/popular', downloadController.getPopularDownloads);
app.get('/api/downloads/category/:category', downloadController.getDownloadsByCategory);
app.get('/api/downloads/stats', auth, isAdmin, downloadController.getDownloadStats);
app.get('/api/downloads/search', downloadController.searchDownloads);

// ================
// FACULTY ROUTES
// ================
app.get('/api/faculty', facultyController.getAllFaculty);
app.get('/api/faculty/:id', facultyController.getFaculty);
app.get('/api/faculty/department/:department', facultyController.getFacultyByDepartment);
app.get('/api/faculty/:id/research', facultyController.getFacultyResearch);
app.get('/api/faculty/:id/awards', facultyController.getFacultyAwards);
app.get('/api/faculty/:id/schedule', auth, facultyController.getFacultySchedule);
app.get('/api/faculty/stats', facultyController.getFacultyStats);
app.get('/api/faculty/search', facultyController.searchFaculty);

// ================
// GALLERY ROUTES
// ================
app.get('/api/gallery', galleryController.getAllGallery);
app.get('/api/gallery/featured', galleryController.getFeaturedGallery);
app.get('/api/gallery/:id', galleryController.getGalleryItem);
app.post('/api/gallery', auth, isAdmin, upload.single('image'), galleryController.createGalleryItem);
app.put('/api/gallery/:id', auth, isAdmin, upload.single('image'), galleryController.updateGalleryItem);
app.delete('/api/gallery/:id', auth, isAdmin, galleryController.deleteGalleryItem);
app.post('/api/gallery/:id/like', auth, galleryController.likeGalleryItem);
app.post('/api/gallery/:id/comments', auth, galleryController.addComment);
app.get('/api/gallery/albums', galleryController.getGalleryAlbums);
app.get('/api/gallery/album/:album', galleryController.getGalleryByAlbum);
app.get('/api/gallery/category/:category', galleryController.getGalleryByCategory);
app.get('/api/gallery/stats', auth, isAdmin, galleryController.getGalleryStats);
app.get('/api/gallery/search', galleryController.searchGallery);

// ================
// NEWS ROUTES
// ================
app.get('/api/news', newsController.getAllNews);
app.get('/api/news/:slug', newsController.getNews);
app.post('/api/news', auth, isAdmin, upload.array('attachments', 5), newsController.createNews);
app.put('/api/news/:id', auth, isAdmin, upload.array('attachments', 5), newsController.updateNews);
app.delete('/api/news/:id', auth, isAdmin, newsController.deleteNews);
app.get('/api/news/category/:category', newsController.getNewsByCategory);
app.get('/api/news/recent', newsController.getRecentNews);
app.get('/api/news/important', newsController.getImportantNews);
app.get('/api/news/audience/:audience', auth, newsController.getNewsForAudience);
app.get('/api/news/stats', auth, isAdmin, newsController.getNewsStats);
app.get('/api/news/search', newsController.searchNews);

// ================
// PLACEMENT ROUTES
// ================
app.get('/api/placements', placementController.getAllPlacements);
app.get('/api/placements/:id', placementController.getPlacement);
app.post('/api/placements', auth, isAdmin, placementController.createPlacement);
app.put('/api/placements/:id', auth, isAdmin, placementController.updatePlacement);
app.delete('/api/placements/:id', auth, isAdmin, placementController.deletePlacement);
app.get('/api/placements/stats', placementController.getPlacementStats);
app.get('/api/placements/student/:studentId', auth, placementController.getStudentPlacements);
app.get('/api/placements/company/:companyId', placementController.getCompanyPlacements);
app.get('/api/placements/year/:year', placementController.getPlacementsByYear);
app.get('/api/placements/search', placementController.searchPlacements);
 
// ====================
// HEALTH CHECK
// ====================
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage()
  });
});

// ====================
// FILE UPLOAD TEST
// ====================
app.post('/api/upload-test', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      }
    });
  } catch (error) {
    console.error('Upload test error:', error);
    res.status(500).json({
      success: false,
      message: 'File upload failed',
      error: error.message
    });
  }
});

// ====================
// 404 HANDLER
// ====================
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: {
      auth: [
        'POST /api/auth/login',
        'POST /api/auth/fix-admin (EMERGENCY)',
        'POST /api/auth/direct-login (EMERGENCY)'
      ],
      public: [
        'GET /api/public/home',
        'GET /api/public/courses'
      ]
    }
  });
});

// ====================
// GLOBAL ERROR HANDLER
// ====================
app.use((err, req, res, next) => {
  console.error('🚨 Global Error Handler:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired. Please log in again.'
    });
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`
    });
  }

  // Default error
  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';

  res.status(statusCode).json({
    success: false,
    status: status,
    message: err.message || 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      error: err 
    })
  });
});

// ====================
// UNHANDLED REJECTIONS & EXCEPTIONS
// ====================
process.on('unhandledRejection', (err) => {
  console.error('🚨 Unhandled Rejection:', err.name, err.message);
  console.error(err.stack);
  
  // Close server & exit process gracefully
  server.close(() => {
    console.log('💥 Process terminated due to unhandled promise rejection');
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err.name, err.message);
  console.error(err.stack);
  process.exit(1);
});

// ====================
// SERVER STARTUP
// ====================
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
  try {
    await connectDB();
    
    console.log(`
    ============================================
    🚀 NURSING INSTITUTE MANAGEMENT SYSTEM
    ============================================
    📦 Environment: ${process.env.NODE_ENV || 'development'}
    🌐 Server running on: http://localhost:${PORT}
    🔗 API Base URL: http://localhost:${PORT}/api
    📁 Uploads: http://localhost:${PORT}/uploads
    ============================================
    📋 EMERGENCY ENDPOINTS:
    POST /api/auth/fix-admin      - Fix admin account
    POST /api/auth/direct-login   - Direct login (bypasses everything)
    POST /api/auth/test-login     - Test password
    ============================================
    👤 ADMIN CREDENTIALS:
    📧 Email: admin@institute.edu
    🔑 Password: admin123
    👤 Username: admin
    ============================================
    `);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
});

// ====================
// GRACEFUL SHUTDOWN
// ====================
const gracefulShutdown = (signal) => {
  console.log(`\n👋 ${signal} received. Shutting down gracefully...`);
  
  server.close(() => {
    console.log('💤 HTTP server closed');
    
    mongoose.connection.close(false, () => {
      console.log('🗄️  MongoDB connection closed');
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    });
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⏰ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app; 