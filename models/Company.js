const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Company name is required'],
    unique: true,
    trim: true
  },
  shortName: {
    type: String,
    trim: true
  },
  logo: String,
  website: String,
  description: {
    type: String,
    trim: true
  },
  industry: {
    type: String,
    required: true,
    enum: [
      'Healthcare',
      'Hospital',
      'Pharmaceutical',
      'Medical Devices',
      'Nursing Home',
      'Clinic',
      'Diagnostic Center',
      'Health Insurance',
      'Medical Education',
      'Research',
      'Government',
      'Other'
    ]
  },
  type: {
    type: String,
    enum: ['Private', 'Public', 'Government', 'NGO', 'Startup', 'Multinational'],
    default: 'Private'
  },
  foundedYear: Number,
  employeeStrength: String,
  headquarters: {
    city: String,
    state: String,
    country: {
      type: String,
      default: 'India'
    }
  },
  branches: [{
    city: String,
    address: String,
    contact: String
  }],
  contactDetails: {
    phone: String,
    email: String,
    address: String,
    contactPerson: {
      name: String,
      designation: String,
      phone: String,
      email: String
    }
  },
  hrDetails: {
    name: String,
    designation: String,
    phone: String,
    email: String,
    alternateContact: String
  },
  visitHistory: [{
    year: Number,
    date: Date,
    purpose: String,
    representative: String,
    studentsPlaced: Number,
    feedback: String
  }],
  packageRange: {
    min: Number,
    max: Number,
    average: Number,
    currency: {
      type: String,
      default: 'INR'
    }
  },
  selectionProcess: {
    typicallyIncludes: [String],
    rounds: Number,
    duration: String,
    specialRequirements: [String]
  },
  eligibilityCriteria: {
    minimumPercentage: Number,
    backlogsAllowed: Number,
    yearGapAllowed: Boolean,
    specificRequirements: [String]
  },
  partnershipType: {
    type: String,
    enum: ['Regular', 'Premium', 'Strategic', 'MOU', 'Research', 'Training'],
    default: 'Regular'
  },
  partnershipDate: Date,
  partnershipValidTill: Date,
  documents: [{
    name: String,
    type: String,
    url: String,
    uploadedAt: Date
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

// Virtual for total placements
companySchema.virtual('totalPlacements', {
  ref: 'Placement',
  localField: '_id',
  foreignField: 'company',
  count: true
});

// Virtual for average package
companySchema.virtual('calculatedAvgPackage', {
  ref: 'Placement',
  localField: '_id',
  foreignField: 'company',
  options: { match: { 'package.annualSalary': { $exists: true } } },
  pipeline: [
    {
      $group: {
        _id: null,
        average: { $avg: '$package.annualSalary' }
      }
    }
  ]
});

// Virtual for partnership duration
companySchema.virtual('partnershipDuration').get(function() {
  if (!this.partnershipDate) return 'N/A';
  
  const start = new Date(this.partnershipDate);
  const end = this.partnershipValidTill ? new Date(this.partnershipValidTill) : new Date();
  
  const diffTime = Math.abs(end - start);
  const diffYears = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365));
  const diffMonths = Math.floor((diffTime % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
  
  let result = '';
  if (diffYears > 0) result += `${diffYears} year${diffYears > 1 ? 's' : ''} `;
  if (diffMonths > 0) result += `${diffMonths} month${diffMonths > 1 ? 's' : ''}`;
  
  return result.trim() || 'Less than a month';
});

// Virtual for partnership status
companySchema.virtual('partnershipStatus').get(function() {
  if (!this.partnershipValidTill) return 'Active';
  
  const now = new Date();
  const validTill = new Date(this.partnershipValidTill);
  
  if (now > validTill) return 'Expired';
  if (validTill.getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000) return 'Expiring Soon';
  return 'Active';
});

// Indexes
companySchema.index({ name: 1 });
companySchema.index({ industry: 1 });
companySchema.index({ type: 1 });
companySchema.index({ 'headquarters.city': 1 });
companySchema.index({ partnershipType: 1 });
companySchema.index({ isActive: 1 });
companySchema.index({ createdBy: 1 });

// Text search index
companySchema.index({
  name: 'text',
  description: 'text',
  industry: 'text',
  'headquarters.city': 'text'
});

// Method to add visit
companySchema.methods.addVisit = async function(visitData) {
  this.visitHistory.push(visitData);
  await this.save();
};

// Method to update package range
companySchema.methods.updatePackageRange = async function() {
  const Placement = mongoose.model('Placement');
  
  const placements = await Placement.find({
    company: this._id,
    'package.annualSalary': { $exists: true }
  });
  
  if (placements.length > 0) {
    const salaries = placements.map(p => p.package.annualSalary);
    this.packageRange = {
      min: Math.min(...salaries),
      max: Math.max(...salaries),
      average: salaries.reduce((a, b) => a + b, 0) / salaries.length,
      currency: 'INR'
    };
    
    await this.save();
  }
};

module.exports = mongoose.model('Company', companySchema);