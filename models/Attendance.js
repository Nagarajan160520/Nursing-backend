const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  semester: {
    type: Number,
    required: true
  },
  session: {
    type: String,
    enum: ['Morning', 'Afternoon', 'Full Day'],
    default: 'Full Day'
  },
  type: {
    type: String,
    enum: ['Theory', 'Practical', 'Clinical', 'Tutorial', 'Lab'],
    required: true
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Late', 'Leave', 'Medical Leave', 'Holiday'],
    default: 'Absent'
  },
  hoursAttended: {
    type: Number,
    min: 0,
    max: 8,
    default: 0
  },
  totalHours: {
    type: Number,
    default: function() {
      return this.session === 'Full Day' ? 8 : 4;
    }
  },
  remarks: String,
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verificationStatus: {
    type: String,
    enum: ['Pending', 'Verified', 'Rejected'],
    default: 'Pending'
  },
  isHoliday: {
    type: Boolean,
    default: false
  },
  holidayReason: String
}, {
  timestamps: true
});

// Compound index for unique attendance per student per day per subject
attendanceSchema.index({ student: 1, date: 1, subject: 1, session: 1 }, { unique: true });

// Indexes for faster queries
attendanceSchema.index({ course: 1 });
attendanceSchema.index({ semester: 1 });
attendanceSchema.index({ status: 1 });
attendanceSchema.index({ recordedBy: 1 });
attendanceSchema.index({ date: -1 });

// Calculate attendance percentage
attendanceSchema.statics.calculatePercentage = async function(studentId, subject, semester) {
  const attendanceRecords = await this.find({
    student: studentId,
    subject: subject,
    semester: semester,
    isHoliday: false
  });

  const totalSessions = attendanceRecords.length;
  const presentSessions = attendanceRecords.filter(record => 
    ['Present', 'Late'].includes(record.status)
  ).length;

  return totalSessions > 0 ? (presentSessions / totalSessions) * 100 : 0;
};

module.exports = mongoose.model('Attendance', attendanceSchema);