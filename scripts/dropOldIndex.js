const mongoose = require('mongoose');
require('dotenv').config();

const dropOldIndex = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    const db = mongoose.connection.db;
    const collection = db.collection('students');

    // Check if the index exists
    const indexes = await collection.indexes();
    const emailIndex = indexes.find(index => index.name === 'email_1');

    if (emailIndex) {
      console.log('Found old email_1 index, dropping it...');
      await collection.dropIndex('email_1');
      console.log('✅ Successfully dropped email_1 index'); 
    } else {
      console.log('No email_1 index found');
    }

    // List remaining indexes for verification
    const remainingIndexes = await collection.indexes();
    console.log('Remaining indexes:', remainingIndexes.map(idx => idx.name));

    process.exit(0);
  } catch (error) {
    console.error('Error dropping index:', error);
    process.exit(1);
  }
};

dropOldIndex();
