const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/', newsController.getNews);
router.get('/recent', newsController.getRecentNews); // This should be before /:id
router.get('/:id', newsController.getNewsItem);

// Admin routes
router.post('/', protect, admin, newsController.createNews);
router.put('/:id', protect, admin, newsController.updateNews);
router.delete('/:id', protect, admin, newsController.deleteNews);

module.exports = router; 