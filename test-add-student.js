const mongoose = require('mongoose');
const User = require('./models/User');
const Student = require('./models/Student');
const Course = require('./models/Course');
require('dotenv').config();

const testAddStudent = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    // Get a course
    const course = await Course.findOne();
    if (!course) {
      console.log('No courses found. Please create a course first.');
      process.exit(1);
    }

    console.log('Using course:', course.courseName);

    // Check if test student exists
    const existing = await Student.findOne({ personalEmail: 'test.student@gmail.com' });
    if (existing) {
      console.log('Test student already exists:', existing.studentId);
      process.exit(0);
    }

    // Create user
    const user = new User({
      username: 'TEST2025001',
      email: 'test.student@nursinginstitute.edu',
      password: 'test123',
      role: 'student',
      isActive: true
    });

    await user.save();
    console.log('User created:', user._id);

    // Create student
    const student = new Student({
      userId: user._id,
      studentId: 'TEST2025001',
      admissionNumber: 'TEST2025001',
      firstName: 'Test',
      lastName: 'Student',
      personalEmail: 'test.student@gmail.com',
      instituteEmail: 'test.student@nursinginstitute.edu',
      mobileNumber: '9876543210',
      gender: 'Male',
      courseEnrolled: course._id,
      admissionYear: 2025,
      semester: 1,
      academicStatus: 'Active',
      admissionDate: new Date(),
      isActive: true
    });

    await student.save();
    console.log('Student created:', student._id);
    console.log('Student ID:', student.studentId);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

testAddStudent();
