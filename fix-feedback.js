const mongoose = require('mongoose');
const Event = require('./models/Event');

async function fixFeedback() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://nagarajan16052001:NAGARAJAN2001@cluster0.jxnj3.mongodb.net/nursing_institute1');
    console.log('Connected to MongoDB');

    const events = await Event.find({});
    console.log('Total events:', events.length);

    const eventsWithUndefinedFeedback = events.filter(e => !e.feedback);
    console.log('Events with undefined feedback:', eventsWithUndefinedFeedback.length);

    if (eventsWithUndefinedFeedback.length > 0) {
      console.log('Updating events...');
      await Event.updateMany(
        { feedback: { $exists: false } },
        { $set: { feedback: [] } }
      );
      console.log('Updated existing events');
    }

    console.log('Feedback fix completed');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixFeedback();
