const mongoose = require('mongoose');

const placementSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Student is required']
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company is required']
  },
  jobTitle: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true
  },
  jobDescription: {
    type: String,
    trim: true
  },
  jobType: {
    type: String,
    enum: ['Full-time', 'Part-time', 'Internship', 'Contract', 'Trainee'],
    default: 'Full-time'
  },
  department: {
    type: String,
    trim: true
  },
  location: {
    city: String,
    state: String,
    country: {
      type: String,
      default: 'India'
    }
  },
  package: {
    annualSalary: Number,
    bonus: Number,
    otherBenefits: [String],
    currency: {
      type: String,
      default: 'INR'
    }
  },
  offerLetterDate: Date,
  joiningDate: Date,
  placedDate: {
    type: Date,
    default: Date.now
  },
  year: {
    type: Number,
    required: true,
    min: [2000, 'Invalid year'],
    max: [new Date().getFullYear() + 5, 'Invalid year']
  },
  status: {
    type: String,
    enum: ['Offered', 'Accepted', 'Joined', 'Rejected', 'Internship', 'Completed', 'Terminated'],
    default: 'Offered'
  },
  selectionProcess: {
    writtenTest: Boolean,
    groupDiscussion: Boolean,
    technicalInterview: Boolean,
    hrInterview: Boolean,
    otherRounds: [String]
  },
  coordinator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  feedback: {
    student: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comments: String,
      submittedAt: Date
    },
    company: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comments: String,
      submittedBy: String,
      submittedAt: Date
    }
  },
  documents: [{
    documentType: {
      type: String,
      enum: ['Offer Letter', 'Joining Letter', 'Experience Letter', 'Relieving Letter', 'Other']
    },
    documentName: String,
    documentUrl: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  trainingPeriod: {
    duration: String,
    startDate: Date,
    endDate: Date,
    mentor: String
  },
  performanceReviews: [{
    period: String,
    rating: Number,
    comments: String,
    reviewedBy: String,
    reviewedAt: Date
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
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted package
placementSchema.virtual('formattedPackage').get(function() {
  if (!this.package || !this.package.annualSalary) return 'Not disclosed';
  
  const salary = this.package.annualSalary;
  const currency = this.package.currency || 'INR';
  
  if (salary >= 10000000) {
    return `${currency} ${(salary / 10000000).toFixed(2)} Crore`;
  } else if (salary >= 100000) {
    return `${currency} ${(salary / 100000).toFixed(2)} Lakh`;
  } else {
    return `${currency} ${salary.toLocaleString()}`;
  }
});

// Virtual for experience duration
placementSchema.virtual('experienceDuration').get(function() {
  if (!this.joiningDate) return 'Not joined yet';
  
  const start = new Date(this.joiningDate);
  const end = this.status === 'Completed' || this.status === 'Terminated' ? 
    new Date() : new Date();
  
  const diffTime = Math.abs(end - start);
  const diffYears = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365));
  const diffMonths = Math.floor((diffTime % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
  
  let result = '';
  if (diffYears > 0) result += `${diffYears} year${diffYears > 1 ? 's' : ''} `;
  if (diffMonths > 0) result += `${diffMonths} month${diffMonths > 1 ? 's' : ''}`;
  
  return result.trim() || 'Less than a month';
});

// Virtual for placement status color
placementSchema.virtual('statusColor').get(function() {
  const colorMap = {
    'Offered': 'warning',
    'Accepted': 'info',
    'Joined': 'success',
    'Rejected': 'danger',
    'Internship': 'primary',
    'Completed': 'success',
    'Terminated': 'danger'
  };
  
  return colorMap[this.status] || 'secondary';
});

// Indexes
placementSchema.index({ student: 1 });
placementSchema.index({ company: 1 });
placementSchema.index({ year: 1 });
placementSchema.index({ status: 1 });
placementSchema.index({ jobType: 1 });
placementSchema.index({ 'location.city': 1 });
placementSchema.index({ coordinator: 1 });

// Compound indexes
placementSchema.index({ student: 1, company: 1, year: 1 }, { unique: true });

// Pre-save middleware to set year from placedDate
placementSchema.pre('save', function(next) {
  if (!this.year && this.placedDate) {
    this.year = new Date(this.placedDate).getFullYear();
  }
  next();
});

// Method to update placement status
placementSchema.methods.updateStatus = async function(newStatus, updatedBy) {
  this.status = newStatus;
  this.updatedBy = updatedBy;
  
  if (newStatus === 'Joined' && !this.joiningDate) {
    this.joiningDate = new Date();
  }
  
  await this.save();
};

// Method to add document
placementSchema.methods.addDocument = async function(documentType, documentName, documentUrl) {
  this.documents.push({
    documentType,
    documentName,
    documentUrl
  });
  
  await this.save();
};

// Method to add performance review
placementSchema.methods.addPerformanceReview = async function(period, rating, comments, reviewedBy) {
  this.performanceReviews.push({
    period,
    rating,
    comments,
    reviewedBy,
    reviewedAt: new Date()
  });
  
  await this.save();
};

module.exports = mongoose.model('Placement', placementSchema);