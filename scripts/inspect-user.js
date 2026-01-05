const mongoose = require('mongoose');
require('dotenv').config();

(async function(){
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('../models/User');
    const user = await User.findOne({ username: 'TEST2025001' }).select('+password').lean();
    console.log('User:', user ? {
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      passwordStartsWith: user.password ? user.password.substring(0, 10) : null
    } : null);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
