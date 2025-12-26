const express = require('express');
const router = express.Router();
const galleryController = require('../controllers/galleryController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/', galleryController.getGallery);
router.get('/featured', galleryController.getFeaturedGallery); // This should be before /:id
router.get('/:id', galleryController.getGalleryItem);

// Admin routes
router.post('/', protect, admin, galleryController.createGalleryItem);
router.put('/:id', protect, admin, galleryController.updateGalleryItem);
router.delete('/:id', protect, admin, galleryController.deleteGalleryItem);

module.exports = router;