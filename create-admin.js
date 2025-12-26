const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createAdmin() {
  try {
    console.log('🚀 Creating admin with manual hash...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const User = require('./models/User');
    const Admin = require('./models/Admin');

    // Clear existing
    await User.deleteMany({});
    await Admin.deleteMany({});
    console.log('🗑️ Cleared all users');

    // Create password DIRECTLY
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    
    console.log('🔐 Generated hash:', hashedPassword);
    
    // Test the hash immediately
    const testCompare = await bcrypt.compare('admin123', hashedPassword);
    console.log('🔐 Immediate test:', testCompare ? '✅ PASS' : '❌ FAIL');

    // Create user with the hash
    const user = new User({
      username: 'admin',
      email: 'admin@institute.edu',
      password: hashedPassword,  // Direct hash, no pre-save hook
      role: 'admin',
      isActive: true,
      phoneNumber: '9876543210'
    });

    // Save WITHOUT triggering pre-save hook
    user.isNew = false;  // Prevent pre-save hook
    await User.collection.insertOne(user.toObject());
    console.log('✅ Admin user inserted directly');

    // Create admin profile
    const admin = new Admin({
      userId: user._id,
      employeeId: 'ADMIN001',
      fullName: 'System Administrator',
      email: 'admin@institute.edu'
    });

    await admin.save();

    // Verify in database
    const dbUser = await User.findOne({ email: 'admin@institute.edu' });
    const dbCompare = await bcrypt.compare('admin123', dbUser.password);
    
    console.log('\n📋 FINAL VERIFICATION:');
    console.log('=======================');
    console.log('📧 Email:', dbUser.email);
    console.log('🔑 Password input: admin123');
    console.log('🗄️ Stored hash:', dbUser.password.substring(0, 20) + '...');
    console.log('🔐 Database test:', dbCompare ? '✅ SUCCESS' : '❌ FAILED');
    console.log('=======================\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createAdmin();