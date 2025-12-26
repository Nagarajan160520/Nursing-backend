const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const { auth } = require('../middleware/auth');

// Public routes (no authentication required)
router.get('/home', publicController.getHomeData);
router.get('/courses', publicController.getAllCourses);
router.get('/courses/:id', publicController.getCourseDetails);
router.get('/gallery', publicController.getGallery);
router.get('/gallery/:id', publicController.getGalleryItem);
router.get('/news', publicController.getAllNews);
router.get('/news/:slug', publicController.getNewsDetails);
router.get('/faculty', publicController.getFaculty);
router.get('/faculty/:id', publicController.getFacultyDetails);
router.post('/contact', publicController.submitContactForm);
router.get('/about', publicController.getAboutInfo);
router.get('/search', publicController.search);

// Routes requiring authentication
router.post('/gallery/:id/like', auth, publicController.likeGalleryItem);
router.post('/gallery/:id/comments', auth, publicController.addComment);

module.exports = router;