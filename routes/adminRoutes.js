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

// Student Management
router.post('/students', adminController.addStudent);
router.get('/students', adminController.getAllStudents);
router.get('/students/:id', adminController.getStudentDetails);
router.put('/students/:id', adminController.updateStudent);
router.delete('/students/:id', adminController.deleteStudent);
router.post('/students/bulk-upload', upload.single('file'), adminController.bulkUploadStudents);
router.post('/students/:id/create-user', adminController.createUserForStudent);
router.post('/students/create-missing-users', adminController.createUsersForMissingStudents);
// Reset user password by user id
router.post('/users/:id/reset-password', adminController.resetUserPassword);

// Attendance Management
router.post('/attendance', adminController.manageAttendance);

// Marks Management
router.post('/marks', adminController.manageMarks);
router.put('/marks/publish', adminController.publishMarks);

// Content Management
router.post('/downloads', upload.single('file'), adminController.uploadStudyMaterial);
router.get('/downloads', adminController.getAllDownloads);
router.put('/downloads/:id', adminController.updateDownload);
router.delete('/downloads/:id', adminController.deleteDownload);

module.exports = router;