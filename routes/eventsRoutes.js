const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/eventsController');
const { auth, isAdmin } = require('../middleware/auth');

// Admin routes
router.get('/', auth, isAdmin, eventsController.getAllAdminEvents);
router.post('/', auth, isAdmin, eventsController.createEvent);
router.put('/:id', auth, isAdmin, eventsController.updateEvent);
router.delete('/:id', auth, isAdmin, eventsController.deleteEvent);

module.exports = router;
