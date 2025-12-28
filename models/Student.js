const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  studentId: { // This is the generated ID, like GUIWG23202512001
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  rollNumber: {
    type: String,
    trim: true,
    unique: true,
    sparse: true // Allows multiple null/undefined values but unique if present
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },
  bloodGroup: String,
  personalEmail: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  instituteEmail: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values
    lowercase: true,
    trim: true
  },
  mobileNumber: {
    type: String,
    required: true,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  alternateMobile: String,
  whatsappNumber: String,
  permanentAddress: {
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  correspondenceAddress: {
    sameAsPermanent: Boolean,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  fatherName: String,
  fatherOccupation: String,
  fatherMobile: String,
  motherName: String,
  motherOccupation: String,
  motherMobile: String,
  guardianName: String,
  guardianRelation: String,
  guardianMobile: String,
  courseEnrolled: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  admissionYear: {
    type: Number,
    required: true
  },
  batchYear: Number,
  semester: {
    type: Number,
    required: true
  },
  admissionType: {
    type: String,
    enum: ['Regular', 'Lateral']
  },
  admissionQuota: {
    type: String,
    enum: ['General', 'Management', 'NRI']
  },
  academicStatus: {
    type: String,
    enum: ['Active', 'Completed', 'Discontinued', 'On Leave', 'Suspended'],
    default: 'Active'
  },
  admissionDate: {
    type: Date,
    default: Date.now
  },
  education: [{
    qualification: String,
    boardUniversity: String, 
    passingYear: String,
    percentage: String,
    schoolCollege: String
  }],
  requireHostel: Boolean,
  hostelType: String,
  requireTransport: Boolean,
  transportRoute: String,
  documents: mongoose.Schema.Types.Mixed,
  isActive: { // General status of the record
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
studentSchema.virtual('fullName').get(function() {
  return `${this.firstName || ''} ${this.lastName || ''}`.trim();
});

// Indexes
studentSchema.index({ studentId: 1 });
studentSchema.index({ personalEmail: 1 });
studentSchema.index({ instituteEmail: 1 });
studentSchema.index({ admissionYear: 1 });
studentSchema.index({ courseEnrolled: 1 });
studentSchema.index({ mobileNumber: 1 });


module.exports = mongoose.model('Student', studentSchema); 