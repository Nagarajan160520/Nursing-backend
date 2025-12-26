const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Simple admin creation with debugging
async function fixAdmin() {
  try {
    console.log('🔧 Fixing admin account...\n');
    
    // Connect directly
    const MONGODB_URI = 'mongodb+srv://nagarajan16052001:NAGARAJAN2001@cluster0.jxnj3.mongodb.net/nursing_institute1';
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');
    
    // Get models
    const User = require('./models/User');
    const Admin = require('./models/Admin');
    
    // Clear everything first
    console.log('🗑️ Clearing existing data...');
    await User.deleteMany({});
    await Admin.deleteMany({});
    console.log('✅ Cleared all users and admins\n');
    
    // Create SIMPLE admin without middleware
    console.log('🔐 Creating password hash...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    console.log('Hash created:', hashedPassword.substring(0, 30) + '...\n');
    
    // Create user directly (bypassing pre-save hooks)
    console.log('👤 Creating admin user...');
    const userDoc = {
      _id: new mongoose.Types.ObjectId(),
      username: 'admin',
      email: 'admin@institute.edu',
      password: hashedPassword,
      role: 'admin',
      isActive: true,
      phoneNumber: '9876543210',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await mongoose.connection.collection('users').insertOne(userDoc);
    console.log('✅ Admin user inserted directly\n');
    
    // Test the password immediately
    console.log('🧪 Testing password...');
    const storedUser = await mongoose.connection.collection('users').findOne({ 
      email: 'admin@institute.edu' 
    });
    
    if (!storedUser) {
      console.log('❌ User not found after insert');
      return;
    }
    
    console.log('Stored hash:', storedUser.password.substring(0, 30) + '...');
    console.log('Hash length:', storedUser.password.length);
    
    // Test compare
    const test1 = await bcrypt.compare('admin123', storedUser.password);
    console.log('Test 1 (admin123):', test1 ? '✅ PASS' : '❌ FAIL');
    
    // Test wrong password
    const test2 = await bcrypt.compare('wrongpass', storedUser.password);
    console.log('Test 2 (wrongpass):', test2 ? '✅ PASS (should fail)' : '✅ FAIL (correct)');
    
    // Create admin profile
    console.log('\n👨‍💼 Creating admin profile...');
    const adminDoc = {
      userId: storedUser._id,
      employeeId: 'ADMIN001',
      fullName: 'System Administrator',
      designation: 'Administrator',
      department: 'Administration',
      contactNumber: '9876543210',
      email: 'admin@institute.edu',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await mongoose.connection.collection('admins').insertOne(adminDoc);
    console.log('✅ Admin profile created\n');
    
    console.log('='.repeat(50));
    console.log('🎉 ADMIN ACCOUNT FIXED SUCCESSFULLY!');
    console.log('='.repeat(50));
    console.log('📧 Email: admin@institute.edu');
    console.log('🔑 Password: admin123');
    console.log('👤 Username: admin');
    console.log('👨‍💼 Role: admin');
    console.log('='.repeat(50));
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixAdmin();