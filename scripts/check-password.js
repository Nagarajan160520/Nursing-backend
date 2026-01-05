const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('../models/User');
    const user = await User.findOne({ username: 'TEST2025001' }).select('+password');
    if (!user) return console.error('User not found');

    const match = await bcrypt.compare('test123', user.password);
    console.log('bcrypt compare result:', match);
    console.log('password field present:', !!user.password);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();