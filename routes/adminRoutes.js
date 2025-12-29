const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { auth, isAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Apply auth and admin middleware to all routes
router.use(auth, isAdmin);

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);

// Course Management
router.post('/courses', adminController.addCourse);
router.get('/courses', adminController.getAllCourses);
router.get('/courses/:id', adminController.getCourseDetails);
router.put('/courses/:id', adminController.updateCourse);
router.delete('/courses/:id', adminController.deleteCourse);

// Gallery Management
router.post('/gallery', upload.single('image'), adminController.uploadGallery);
router.get('/gallery', adminController.getAllGallery);
router.put('/gallery/:id', adminController.updateGallery);
router.delete('/gallery/:id', adminController.deleteGallery);

// News Management
router.post('/news', upload.array('attachments', 5), adminController.addNews);
router.get('/news', adminController.getAllNews);
router.put('/news/:id', adminController.updateNews);
router.delete('/news/:id', adminController.deleteNews);

// ✅ **ADD THESE MISSING ROUTES HERE:**
// Student Management
router.post('/students', adminController.addStudent);
router.get('/students', adminController.getAllStudents);
router.get('/students/:id', adminController.getStudentDetails);
router.put('/students/:id', adminController.updateStudent);
router.delete('/students/:id', adminController.deleteStudent);
router.post('/students/bulk-upload', upload.single('file'), adminController.bulkUploadStudents);

// ✅ **ADD THESE CRITICAL ROUTES:**
router.get('/students/check-email', adminController.checkEmail);
router.get('/students/check-mobile', adminController.checkMobile);
router.get('/students/count', adminController.getStudentCount);

// Student User Management
router.post('/students/:id/create-user', adminController.createUserForStudent);
router.post('/students/create-missing-users', adminController.createUsersForMissingStudents);

// Reset user password by user id
router.post('/users/:id/reset-password', adminController.resetUserPassword);

// ✅ **ADD FACULTY ROUTES:**
router.post('/faculty', adminController.addFaculty);
router.get('/faculty', adminController.getAllFaculty);
router.get('/faculty/:id', adminController.getFacultyById);
router.put('/faculty/:id', adminController.updateFaculty);
router.delete('/faculty/:id', adminController.deleteFaculty);

// Attendance Management
router.post('/attendance', adminController.markAttendance);
router.get('/attendance', adminController.getAttendance);
router.get('/attendance/report', adminController.generateAttendanceReport);
router.post('/attendance/bulk', upload.single('file'), adminController.bulkUploadAttendance);

// Marks Management
router.post('/marks', adminController.manageMarks);
router.put('/marks/publish', adminController.publishMarks);
 
// Content Management
router.post('/downloads', upload.single('file'), adminController.uploadStudyMaterial);
router.get('/downloads', adminController.getAllDownloads);
router.put('/downloads/:id', adminController.updateDownload);
router.delete('/downloads/:id', adminController.deleteDownload);

// Settings Management
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);
router.post('/settings/reset', adminController.resetSettings);
router.post('/clear-cache', adminController.clearCache);
router.get('/system-check', adminController.systemCheck);

module.exports = router;