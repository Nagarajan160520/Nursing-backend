const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { auth, isStudent } = require('../middleware/auth');

// Apply auth and student middleware to all routes
router.use(auth, isStudent);

// Dashboard
router.get('/dashboard', studentController.getDashboard);

// Profile
router.get('/profile', studentController.getProfile);
router.put('/profile', studentController.updateProfile);

// Academic
router.get('/attendance', studentController.getAttendance);
router.get('/marks', studentController.getMarks);
router.get('/clinical-schedule', studentController.getClinicalSchedule);

// Downloads
router.get('/downloads', studentController.getDownloads);
router.post('/downloads/:id/record', studentController.recordDownload);

// Notifications
router.get('/notifications', studentController.getNotifications);
router.put('/notifications/:id/read', studentController.markNotificationAsRead);

module.exports = router;