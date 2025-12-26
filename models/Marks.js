const mongoose = require('mongoose');

const marksSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
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
  examType: {
    type: String,
    enum: ['Internal', 'External', 'Practical', 'Assignment', 'Project', 'Terminal'],
    required: true
  },
  examDate: {
    type: Date,
    default: Date.now
  },
  marks: {
    theory: {
      max: {
        type: Number,
        default: 100
      },
      obtained: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      }
    },
    practical: {
      max: {
        type: Number,
        default: 100
      },
      obtained: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      }
    },
    viva: {
      max: {
        type: Number,
        default: 50
      },
      obtained: {
        type: Number,
        min: 0,
        max: 50,
        default: 0
      }
    },
    assignment: {
      max: {
        type: Number,
        default: 50
      },
      obtained: {
        type: Number,
        min: 0,
        max: 50,
        default: 0
      }
    }
  },
  totalMarks: {
    max: {
      type: Number,
      default: 300
    },
    obtained: {
      type: Number,
      default: function() {
        const theory = this.marks.theory.obtained || 0;
        const practical = this.marks.practical.obtained || 0;
        const viva = this.marks.viva.obtained || 0;
        const assignment = this.marks.assignment.obtained || 0;
        return theory + practical + viva + assignment;
      }
    }
  },
  percentage: {
    type: Number,
    default: function() {
      return this.totalMarks.max > 0 ? 
        (this.totalMarks.obtained / this.totalMarks.max) * 100 : 0;
    }
  },
  grade: {
    type: String,
    enum: ['O', 'A+', 'A', 'B+', 'B', 'C', 'D', 'F', 'Absent', 'Withheld'],
    default: function() {
      const percent = this.percentage;
      if (percent >= 90) return 'O';
      if (percent >= 80) return 'A+';
      if (percent >= 70) return 'A';
      if (percent >= 60) return 'B+';
      if (percent >= 50) return 'B';
      if (percent >= 40) return 'C';
      if (percent >= 35) return 'D';
      return 'F';
    }
  },
  resultStatus: {
    type: String,
    enum: ['Pass', 'Fail', 'Supplementary', 'Absent', 'Pending'],
    default: 'Pending'
  },
  enteredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verificationDate: Date,
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedDate: Date,
  remarks: String,
  revaluationRequested: {
    type: Boolean,
    default: false
  },
  revaluationStatus: {
    type: String,
    enum: ['Not Requested', 'Pending', 'Approved', 'Rejected', 'Completed'],
    default: 'Not Requested'
  },
  revaluationMarks: {
    theory: Number,
    practical: Number,
    viva: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index
marksSchema.index({ student: 1, subject: 1, semester: 1, examType: 1 }, { unique: true });

// Indexes
marksSchema.index({ course: 1 });
marksSchema.index({ semester: 1 });
marksSchema.index({ examType: 1 });
marksSchema.index({ resultStatus: 1 });
marksSchema.index({ grade: 1 });

// Calculate GPA
marksSchema.statics.calculateGPA = async function(studentId, semester) {
  const marks = await this.find({
    student: studentId,
    semester: semester,
    resultStatus: 'Pass'
  });

  if (marks.length === 0) return 0;

  const gradePoints = {
    'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'D': 4, 'F': 0
  };

  let totalPoints = 0;
  let totalCredits = 0;

  // Assuming each subject has 4 credits
  marks.forEach(mark => {
    totalPoints += gradePoints[mark.grade] * 4;
    totalCredits += 4;
  });

  return totalCredits > 0 ? totalPoints / totalCredits : 0;
};

module.exports = mongoose.model('Marks', marksSchema);