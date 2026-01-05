const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetStudentPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const User = require('../models/User');
    const username = 'TEST2025001';
    const plain = 'test123';

    const user = await User.findOne({ username });
    if (!user) {
      console.error('User not found:', username);
      process.exit(1);
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(plain, salt);

    // Directly set hashed password in DB to avoid double-hashing by pre-save hook
    await User.updateOne({ username }, { $set: { password: hashed } });

    console.log('Password reset for', username);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

resetStudentPassword();
