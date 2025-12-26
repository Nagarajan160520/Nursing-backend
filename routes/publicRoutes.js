const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  getHomeData,
  getAllCourses,
  getCourseDetails,
  getGallery,
  getGalleryItem,
  likeGalleryItem,
  addComment,
  getAllNews,
  getNewsDetails,
  getFaculty,
  getFacultyDetails,
  getPublicEvents,
  submitContactForm,
  getAboutInfo,
  search
} = require('../controllers/publicController');

// Public routes (no authentication required)
router.get('/home', getHomeData);
router.get('/courses', getAllCourses);
router.get('/courses/:id', getCourseDetails);
router.get('/gallery', getGallery);
router.get('/gallery/:id', getGalleryItem);
router.get('/news', getAllNews);
router.get('/news/:slug', getNewsDetails);
router.get('/faculty', getFaculty);
router.get('/faculty/:id', getFacultyDetails);
router.get('/events', getPublicEvents);
router.post('/contact', submitContactForm);
router.get('/about', getAboutInfo);
router.get('/search', search);

// Routes requiring authentication
router.post('/gallery/:id/like', auth, likeGalleryItem);
router.post('/gallery/:id/comments', auth, addComment);

module.exports = router;