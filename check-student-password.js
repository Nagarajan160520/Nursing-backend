const mongoose = require('mongoose');
const User = require('./models/User');
const Student = require('./models/Student');
const bcrypt = require('bcryptjs');

async function checkStudentPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://nagarajan16052001:NAGARAJAN2001@cluster0.jxnj3.mongodb.net/nursing_institute1');

    // Find the student by ID
    const student = await Student.findOne({ studentId: 'TEGU6372025001' });
    if (!student) {
      console.log('❌ Student not found');
      return;
    }

    console.log('✅ Student found:', {
      studentId: student.studentId,
      fullName: student.fullName,
      instituteEmail: student.instituteEmail,
      personalEmail: student.personalEmail
    });

    // Find the user account
    const user = await User.findById(student.userId).select('+password');
    if (!user) {
      console.log('❌ User account not found');
      return;
    }

    console.log('✅ User account found:', {
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    });

    console.log('🔐 Password hash:', user.password.substring(0, 30) + '...');

    // Test common passwords
    const testPasswords = [
      'password123',
      'student123',
      'admin123',
      '123456',
      'password',
      'nursing123'
    ];

    console.log('\n🧪 Testing common passwords:');
    for (const testPass of testPasswords) {
      const isValid = await bcrypt.compare(testPass, user.password);
      console.log(`  ${testPass}: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
    }

    // Generate a new password and update
    const newPassword = 'student123';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    console.log('\n🔄 Password reset to:', newPassword);
    console.log('📧 Institute Email:', student.instituteEmail);
    console.log('👤 Student ID:', student.studentId);

    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkStudentPassword();
