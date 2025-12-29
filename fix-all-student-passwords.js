const mongoose = require('mongoose');
const User = require('./models/User');
const Student = require('./models/Student');
const bcrypt = require('bcryptjs');

async function fixAllStudentPasswords() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://nagarajan16052001:NAGARAJAN2001@cluster0.jxnj3.mongodb.net/nursing_institute1');

    console.log('🔍 Finding all students...');

    // Find all students
    const students = await Student.find({}).populate('userId');
    console.log(`📊 Found ${students.length} students`);

    let fixed = 0;
    let alreadyValid = 0;
    let errors = 0;

    for (const student of students) {
      try {
        if (!student.userId) {
          console.log(`⚠️  Student ${student.studentId} has no user account`);
          continue;
        }

        const user = await User.findById(student.userId).select('+password');
        if (!user) {
          console.log(`⚠️  User account not found for ${student.studentId}`);
          continue;
        }

        // Test current password
        const testPassword = 'student123';
        const isValid = await bcrypt.compare(testPassword, user.password);

        if (!isValid) {
          console.log(`🔄 Fixing password for ${student.studentId} (${student.instituteEmail})`);

          // Reset password
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(testPassword, salt);

          // Update directly in database
          const db = mongoose.connection.db;
          await db.collection('users').updateOne(
            { _id: user._id },
            { $set: { password: hashedPassword } }
          );

          fixed++;
        } else {
          alreadyValid++;
        }

      } catch (error) {
        console.error(`❌ Error fixing ${student.studentId}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 SUMMARY:');
    console.log(`✅ Fixed: ${fixed}`);
    console.log(`✅ Already valid: ${alreadyValid}`);
    console.log(`❌ Errors: ${errors}`);

    console.log('\n🎯 ALL STUDENT LOGIN CREDENTIALS:');
    console.log('=====================================');
    console.log('🔑 Password for all students: student123');
    console.log('=====================================');

    // List all students with their credentials
    const allStudents = await Student.find({}).select('studentId instituteEmail fullName');
    allStudents.forEach(student => {
      console.log(`${student.studentId} | ${student.instituteEmail} | ${student.fullName}`);
    });

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixAllStudentPasswords();
