const mongoose = require('mongoose');
require('dotenv').config();

(async function(){
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const Student = require('../models/Student');

    const studentId = 'TEST2025001';
    const newMobile = '9999900001';

    const res = await Student.updateOne({ studentId }, { $set: { mobileNumber: newMobile, updatedAt: new Date() } });
    const s = await Student.findOne({ studentId });
    console.log('Update result:', res.nModified || res.modifiedCount);
    console.log('Student mobileNumber:', s.mobileNumber);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
