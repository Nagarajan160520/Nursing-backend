const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  courseCode: {
    type: String,
    required: [true, 'Course code is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  courseName: {
    type: String,
    required: [true, 'Course name is required'],
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  duration: {
    type: String,
    required: true,
    enum: ['1 Year', '2 Years', '3 Years', '4 Years', '6 Months', 'Diploma 2 Years', 'Degree 4 Years']
  },
  eligibility: [{
    type: String,
    required: true
  }],
  syllabus: {
    outline: String,
    pdfUrl: String,
    uploadedAt: Date,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  clinicalTraining: {
    description: String,
    hospitals: [{
      name: String,
      address: String,
      contact: String,
      duration: String
    }],
    totalHours: Number,
    requirements: [String]
  },
 feesStructure: {
  tuitionFee: Number,
  hostelFee: Number,
  libraryFee: Number,
  labFee: Number,
  examFee: Number,
  otherCharges: Number,
  totalFee: Number,
  installmentPlan: [{
    installmentNo: Number,
    amount: Number,
    dueDate: Date,
    label: String
  }]
},
  seatsAvailable: {
    type: Number,
    required: true,
    min: 1
  },
  seatsFilled: {
    type: Number,
    default: 0,
    min: 0
  },
  seatsReserved: {
    general: Number,
    sc: Number,
    st: Number,
    obc: Number,
    ews: Number
  },
  careerOpportunities: [String],
  subjects: [{
    subjectCode: String,
    subjectName: String,
    credits: Number,
    semester: Number,
    theoryHours: Number,
    practicalHours: Number,
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faculty'
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvalStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Approved'
  },
  accreditation: {
    body: String,
    validity: Date,
    certificateUrl: String
  },
  batchStartDate: Date,
  batchEndDate: Date,
  highlights: [String],
  requirements: [String]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for available seats
courseSchema.virtual('availableSeats').get(function() {
  return this.seatsAvailable - this.seatsFilled;
});

// Virtual for course status
courseSchema.virtual('status').get(function() {
  if (this.availableSeats <= 0) return 'Full';
  if (!this.isActive) return 'Inactive';
  return 'Available';
});

// Indexes
courseSchema.index({ courseCode: 1 });
courseSchema.index({ isActive: 1 });
courseSchema.index({ duration: 1 });

module.exports = mongoose.model('Course', courseSchema);