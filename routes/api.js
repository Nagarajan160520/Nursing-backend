const express = require('express');
const router = express.Router();

// Import all route files
const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const studentRoutes = require('./studentRoutes');
const publicRoutes = require('./publicRoutes');

// Use routes
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/student', studentRoutes);
router.use('/public', publicRoutes);

// Export as a function
module.exports = (app) => {
  app.use('/api', router);
};