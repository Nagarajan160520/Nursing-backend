const mongoose = require('mongoose');
require('dotenv').config();

(async function(){
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const Student = require('../models/Student');

    const studentId = 'TEST2025001';
    const newContact = '9999900001';

    const student = await Student.findOne({ studentId });
    if (!student) {
      console.error('Student not found:', studentId);
      process.exit(1);
    }

    student.contactNumber = newContact;
    student.updatedAt = new Date();
    await student.save();

    console.log('Updated student contactNumber to', newContact);
    console.log('Student:', { studentId: student.studentId, contactNumber: student.contactNumber });
    process.exit(0);
  } catch (err) {
    console.error('Error updating student:', err);
    process.exit(1);
  }
})();
