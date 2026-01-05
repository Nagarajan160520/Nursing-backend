const mongoose = require('mongoose');
require('dotenv').config();

(async function(){
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('../models/User');
    const user = await User.findOne({ username: 'testadmin' }).lean();
    console.log('User:', user);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
