const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  employeeId: {
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
    enum: [
      'Principal',
      'Vice Principal',
      'Administrator',
      'Registrar',
      'Accountant',
      'Librarian',
      'IT Administrator',
      'Placement Officer',
      'Examination Officer',
      'Admission Officer',
      'Other'
    ],
    default: 'Administrator'
  },
  department: {
    type: String,
    required: true,
    enum: [
      'Administration',
      'Accounts',
      'Examination',
      'Admission',
      'Library',
      'IT',
      'Placement',
      'Academic',
      'Student Affairs',
      'Other'
    ],
    default: 'Administration'
  },
  contactNumber: {
    type: String,
    required: true,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
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
  dateOfJoining: {
    type: Date,
    default: Date.now
  },
  experience: {
    total: { type: Number, default: 0 },
    details: [{
      organization: String,
      position: String,
      from: Date,
      to: Date,
      duration: String
    }]
  },
  qualification: [{
    degree: String,
    specialization: String,
    university: String,
    year: Number,
    grade: String
  }],
  responsibilities: [{
    title: String,
    description: String,
    startDate: Date,
    endDate: Date,
    isActive: { type: Boolean, default: true }
  }],
  permissions: {
    canManageUsers: { type: Boolean, default: true },
    canManageStudents: { type: Boolean, default: true },
    canManageFaculty: { type: Boolean, default: true },
    canManageCourses: { type: Boolean, default: true },
    canManageContent: { type: Boolean, default: true },
    canManageGallery: { type: Boolean, default: true },
    canManageNews: { type: Boolean, default: true },
    canManageAttendance: { type: Boolean, default: true },
    canManageMarks: { type: Boolean, default: true },
    canManageDownloads: { type: Boolean, default: true },
    canManagePlacements: { type: Boolean, default: true },
    canManageWebsite: { type: Boolean, default: true },
    canViewReports: { type: Boolean, default: true },
    canExportData: { type: Boolean, default: true }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  profileImage: {
    type: String,
    default: '/uploads/profile/admin-default.jpg'
  },
  officeLocation: String,
  officeHours: String,
  emergencyContact: {
    name: String,
    relation: String,
    phone: String
  },
  lastLogin: Date,
  loginHistory: [{
    timestamp: { type: Date, default: Date.now },
    ipAddress: String,
    userAgent: String,
    action: String
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full designation
adminSchema.virtual('fullDesignation').get(function() {
  return `${this.designation}, ${this.department} Department`;
});

// Virtual for experience in years
adminSchema.virtual('experienceYears').get(function() {
  if (!this.dateOfJoining) return 0;
  const today = new Date();
  const joinDate = new Date(this.dateOfJoining);
  let years = today.getFullYear() - joinDate.getFullYear();
  const monthDiff = today.getMonth() - joinDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < joinDate.getDate())) {
    years--;
  }
  return years;
});

// Add login history
adminSchema.methods.addLoginHistory = async function(ipAddress, userAgent, action = 'Login') {
  this.loginHistory.push({
    ipAddress,
    userAgent,
    action
  });
  
  // Keep only last 50 login records
  if (this.loginHistory.length > 50) {
    this.loginHistory = this.loginHistory.slice(-50);
  }
  
  this.lastLogin = new Date();
  await this.save();
};

// Check permission
adminSchema.methods.hasPermission = function(permission) {
  return this.permissions[permission] === true;
};

// Indexes for faster queries
adminSchema.index({ employeeId: 1 });
adminSchema.index({ designation: 1 });
adminSchema.index({ department: 1 });
adminSchema.index({ isActive: 1 });
adminSchema.index({ userId: 1 });

module.exports = mongoose.model('Admin', adminSchema);