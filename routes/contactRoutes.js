const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { auth, isAdmin } = require('../middleware/auth');

// Public routes
router.post('/', contactController.submitContact);

// Admin routes
router.use(auth, isAdmin);
router.get('/', contactController.getAllContacts);
router.get('/stats', contactController.getContactStats);
router.get('/:id', contactController.getContactById);
router.put('/:id/status', contactController.updateContactStatus);
router.post('/:id/reply', contactController.replyToContact);
router.delete('/:id', contactController.deleteContact);

module.exports = router;