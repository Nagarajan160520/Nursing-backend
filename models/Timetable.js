const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  semester: {
    type: Number,
    required: true,
    min: 1,
    max: 8
  },
  day: {
    type: String, 
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  startTime: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Start time must be in HH:MM format'
    }
  },
  endTime: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'End time must be in HH:MM format'
    }
  },
  type: {
    type: String,
    enum: ['Theory', 'Practical', 'Clinical', 'Tutorial', 'Lab', 'Lecture'],
    default: 'Theory'
  },
  faculty: {
    type: String,
    required: true
  },
  room: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Compound index for unique timetable entries
timetableSchema.index({ course: 1, semester: 1, day: 1, startTime: 1, endTime: 1 }, { unique: true });

// Indexes for faster queries
timetableSchema.index({ course: 1, semester: 1 });
timetableSchema.index({ day: 1 });
timetableSchema.index({ isActive: 1 });

module.exports = mongoose.model('Timetable', timetableSchema);
