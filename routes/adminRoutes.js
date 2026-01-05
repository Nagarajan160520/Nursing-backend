const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const userController = require('../controllers/userController');
const { auth, isAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const contactController = require('../controllers/contactController');
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

// User Management Routes
router.get('/users', userController.getAllUsers);
router.get('/users/:id', userController.getUserById);
router.post('/users', userController.createUser);
router.put('/users/:id', userController.updateUser);
router.delete('/users/:id', userController.deleteUser);
router.post('/users/:id/reset-password', userController.resetUserPassword);
router.patch('/users/:id/toggle-active', userController.toggleUserActive);

// News Management
router.post('/news', upload.array('attachments', 5), adminController.addNews);
router.get('/news', adminController.getAllNews);
router.put('/news/:id', adminController.updateNews);
router.delete('/news/:id', adminController.deleteNews);

// Notifications Management
router.post('/notifications', adminController.addNotification);
router.get('/notifications', adminController.getAllNotifications);
router.get('/notifications/:id', adminController.getNotification);
router.put('/notifications/:id', adminController.updateNotification);
router.delete('/notifications/:id', adminController.deleteNotification);

// ✅ **CRITICAL - Student Management Routes MUST be added:**
router.post('/students', adminController.addStudent);
router.get('/students', adminController.getAllStudents);

// ✅ **Essential Validation Routes:**
router.get('/students/check-email', adminController.checkEmail);
router.get('/students/check-mobile', adminController.checkMobile);
router.get('/students/count', adminController.getStudentCount);

// Parameterized routes after specific ones
router.get('/students/:id', adminController.getStudentDetails);
router.put('/students/:id', adminController.updateStudent);
router.delete('/students/:id', adminController.deleteStudent);

// ✅ **Add these as well:**
router.post('/students/bulk-upload', upload.single('file'), adminController.bulkUploadStudents);
router.post('/students/:id/reset-password', adminController.resetStudentPassword);
// Student User Management
router.post('/students/:id/create-user', adminController.createUserForStudent);
router.post('/students/create-missing-users', adminController.createUsersForMissingStudents);



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
router.get('/marks', adminController.getAllMarks);
router.get('/marks/:id', adminController.getMark);
router.put('/marks/:id', adminController.updateMark);
router.delete('/marks/:id', adminController.deleteMark);
router.put('/marks/publish', adminController.publishMarks);
 
// Content Management
router.post('/downloads', upload.single('file'), adminController.uploadStudyMaterial);
router.get('/downloads', adminController.getAllDownloads);
router.put('/downloads/:id', adminController.updateDownload);
router.delete('/downloads/:id', adminController.deleteDownload);

// Settings Management
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);
router.post('/settings/reset', adminController.resetSystemSettings);
router.post('/clear-cache', adminController.clearCache);
router.get('/system-check', adminController.systemCheck);

// Add these lines in admin routes:
router.get('/contacts', contactController.getAllContacts);
router.get('/contacts/stats', contactController.getContactStats);
router.get('/contacts/:id', contactController.getContactById);
router.put('/contacts/:id/status', contactController.updateContactStatus);
router.post('/contacts/:id/notes', contactController.addContactNote);
router.post('/contacts/:id/reply', contactController.replyToContact);
module.exports = router; 