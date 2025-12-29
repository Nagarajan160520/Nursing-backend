const mongoose = require('mongoose');
const User = require('./models/User');
const Student = require('./models/Student');
const bcrypt = require('bcryptjs');

async function fixStudentLogin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://nagarajan16052001:NAGARAJAN2001@cluster0.jxnj3.mongodb.net/nursing_institute1');

    console.log('🔍 Looking for student: TEGU6372025001');

    // Find the student
    const student = await Student.findOne({ studentId: 'TEGU6372025001' });
    if (!student) {
      console.log('❌ Student not found');
      return;
    }

    console.log('✅ Student found:', student.studentId);
    console.log('📧 Institute Email:', student.instituteEmail);
    console.log('👤 User ID:', student.userId);

    // Find the user
    const user = await User.findById(student.userId).select('+password');
    if (!user) {
      console.log('❌ User account not found');
      return;
    }

    console.log('✅ User found:', user.email);
    console.log('🔐 Current hash:', user.password.substring(0, 30) + '...');

    // Test the current password
    const testPassword = 'student123';
    const isValid = await bcrypt.compare(testPassword, user.password);
    console.log(`🧪 Testing password "${testPassword}": ${isValid ? '✅ VALID' : '❌ INVALID'}`);

    if (!isValid) {
      console.log('🔄 Password is invalid, resetting...');

      // Hash the password directly
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(testPassword, salt);

      // Update using direct database operation to avoid mongoose hooks
      const db = mongoose.connection.db;
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { password: hashedPassword } }
      );

      console.log('✅ Password reset in database');

      // Verify the new password
      const updatedUser = await User.findById(user._id).select('+password');
      const newIsValid = await bcrypt.compare(testPassword, updatedUser.password);
      console.log(`🧪 Verifying new password: ${newIsValid ? '✅ VALID' : '❌ INVALID'}`);
    }

    console.log('\n🎯 LOGIN CREDENTIALS:');
    console.log('=======================');
    console.log('👤 Student ID: TEGU6372025001');
    console.log('📧 Email: varun.m.001@nursinginstitute.edu');
    console.log('🔑 Password: student123');
    console.log('=======================');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixStudentLogin();
