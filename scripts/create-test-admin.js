const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createTestAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const User = require('../models/User');
    const Admin = require('../models/Admin');

    const email = 'test.admin@nursinginstitute.edu';
    const username = 'testadmin';
    const plainPassword = 'admin123!';

    let user = await User.findOne({ $or: [{ email }, { username }] });
    if (user) {
      console.log('Test admin already exists:', user.email || user.username);
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(plainPassword, salt);

    user = new User({
      username,
      email,
      password: hashed,
      role: 'admin',
      isActive: true
    });

    await user.save();

    const admin = new Admin({
      userId: user._id,
      employeeId: 'TESTADMIN001',
      fullName: 'Test Admin',
      email,
      contactNumber: '9876543210'
    });

    await admin.save();

    console.log('Test admin created. Credentials:');
    console.log(' Username:', username);
    console.log(' Email:', email);
    console.log(' Password:', plainPassword);

    process.exit(0);
  } catch (err) {
    console.error('Error creating test admin:', err);
    process.exit(1);
  }
}

createTestAdmin();
