const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  studentId: {
    type: String,
    required: [true, 'Student ID is required'],
    unique: true,
    uppercase: true
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },
  bloodGroup: String,
  contactNumber: {
    type: String,
    required: [true, 'Contact number is required'],
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  alternateContact: String,
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true
  },
  emergencyContact: {
    name: String,
    relation: String,
    phone: String,
    email: String
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: {
      type: String,
      default: 'India'
    }
  },
  guardianDetails: {
    fatherName: String,
    motherName: String,
    guardianName: String,
    guardianRelation: String,
    guardianContact: String,
    guardianEmail: String,
    guardianOccupation: String,
    annualIncome: String
  },
  courseEnrolled: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  batchYear: {
    type: Number,
    required: true,
    min: [2000, 'Invalid year'],
    max: [new Date().getFullYear() + 5, 'Invalid year']
  },
  semester: {
    type: Number,
    required: true,
    min: 1,
    max: 8
  },
  rollNumber: String,
  admissionDate: {
    type: Date,
    default: Date.now
  },
  hostelAllotted: {
    type: Boolean,
    default: false
  },
  hostelDetails: {
    hostelName: String,
    roomNumber: String,
    roomType: String,
    fees: Number
  },
  transportFacility: {
    type: Boolean,
    default: false
  },
  transportDetails: {
    routeNumber: String,
    pickupPoint: String,
    fees: Number
  },
  documents: [{
    documentType: {
      type: String,
      enum: ['Aadhar', 'TC', 'Marksheet', 'Photo', 'Medical', 'Caste', 'Income', 'Other']
    },
    documentName: String,
    documentUrl: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    verified: {
      type: Boolean,
      default: false
    }
  }],
  academicStatus: {
    type: String,
    enum: ['Active', 'Completed', 'Discontinued', 'On Leave', 'Suspended'],
    default: 'Active'
  },
  attendancePercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  cgpa: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },
  fees: {
    totalFees: Number,
    feesPaid: {
      type: Number,
      default: 0
    },
    pendingFees: {
      type: Number,
      default: function() {
        return this.totalFees - (this.feesPaid || 0);
      }
    },
    lastPaymentDate: Date,
    paymentHistory: [{
      amount: Number,
      paymentDate: Date,
      receiptNumber: String,
      mode: String,
      remarks: String
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for age
studentSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Index for faster queries
studentSchema.index({ studentId: 1 });
studentSchema.index({ batchYear: 1, semester: 1 });
studentSchema.index({ academicStatus: 1 });

module.exports = mongoose.model('Student', studentSchema);