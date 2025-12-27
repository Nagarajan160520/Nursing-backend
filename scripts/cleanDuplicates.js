// Create backend/scripts/cleanDuplicates.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
require('dotenv').config();

const cleanDuplicates = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    // Find duplicate emails in Student collection
    const duplicateEmails = await Student.aggregate([
      {
        $group: {
          _id: { $toLower: '$personalEmail' },
          count: { $sum: 1 },
          docs: { $push: '$_id' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    console.log(`Found ${duplicateEmails.length} duplicate email groups`);

    for (const group of duplicateEmails) {
      console.log(`\nProcessing: ${group._id}`);
      console.log(`Duplicates: ${group.docs.length}`);
      
      // Keep the first document, delete others
      const [keepId, ...deleteIds] = group.docs;
      
      console.log(`Keeping: ${keepId}`);
      console.log(`Deleting: ${deleteIds.length} records`);
      
      // Delete duplicate students
      for (const id of deleteIds) {
        const student = await Student.findById(id);
        if (student) {
          // Delete associated user
          await User.findByIdAndDelete(student.userId);
          // Delete student
          await Student.findByIdAndDelete(id);
          console.log(`Deleted student: ${id}`);
        }
      }
    }

    // Find duplicate mobile numbers
    const duplicateMobiles = await Student.aggregate([
      {
        $group: {
          _id: '$mobileNumber',
          count: { $sum: 1 },
          docs: { $push: '$_id' }
        }
      },
      {
        $match: {
          count: { $gt: 1 },
          _id: { $ne: null }
        }
      }
    ]);

    console.log(`\nFound ${duplicateMobiles.length} duplicate mobile groups`);

    for (const group of duplicateMobiles) {
      console.log(`\nProcessing mobile: ${group._id}`);
      console.log(`Duplicates: ${group.docs.length}`);
      
      const [keepId, ...deleteIds] = group.docs;
      
      for (const id of deleteIds) {
        const student = await Student.findById(id);
        if (student) {
          await User.findByIdAndDelete(student.userId);
          await Student.findByIdAndDelete(id);
          console.log(`Deleted student with mobile: ${id}`);
        }
      }
    }

    console.log('\n✅ Duplicate cleanup completed!');
    process.exit(0);

  } catch (error) {
    console.error('Cleanup Error:', error);
    process.exit(1);
  }
};

cleanDuplicates();