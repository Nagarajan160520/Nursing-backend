const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('../models/User');

    const username = 'testadmin';
    const plain = 'admin123!';

    const user = await User.findOne({ username });
    if (!user) {
      console.error('User not found:', username);
      process.exit(1);
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(plain, salt);
    user.password = hashed;
    await user.save();

    console.log('Password reset for', username);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

resetPassword();
