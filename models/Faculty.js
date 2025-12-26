const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  facultyId: {
    type: String,
    required: true,
    unique: true, 
    uppercase: true
  },
  fullName: {
    type: String,       
    required: true, 
    trim: true
  },
  designation: {
    type: String,
    required: true,
    enum: ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Lab Instructor', 'Clinical Instructor']
  },
  department: {
    type: String,
    required: true,
    enum: ['Medical-Surgical Nursing', 'Pediatric Nursing', 'Psychiatric Nursing', 'Community Health Nursing', 'Obstetric Nursing', 'Anatomy', 'Physiology', 'Pharmacology', 'Nutrition', 'Administration']
  },
  qualification: [{
    degree: String,
    specialization: String,
    university: String,
    year: Number
  }],
  experience: {
    total: Number,
    details: [{
      organization: String,
      position: String,
      from: Date,
      to: Date,
      duration: String
    }]
  },
  contactNumber: String,
  email: String,
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  dateOfJoining: {
    type: Date,
    default: Date.now
  },
  subjectsHandling: [{
    subjectName: String,
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    },
    semester: Number
  }],
  researchPublications: [{
    title: String,
    journal: String,
    year: Number,
    link: String
  }],
  awards: [{
    title: String,
    year: Number,
    organization: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  profileImage: String,
  bio: String,
  officeHours: String,
  officeLocation: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Faculty', facultySchema);