const mongoose = require('mongoose');

const downloadSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  fileUrl: {
    type: String,
    required: [true, 'File URL is required']
  },
  fileName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX', 'ZIP', 'RAR', 'IMAGE', 'OTHER'],
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    enum: ['Syllabus', 'Timetable', 'Notes', 'Question Paper', 'Lab Manual', 'Form', 'Circular', 'Result', 'Hall Ticket', 'Certificate', 'Other'],
    required: true
  },
  targetAudience: {
    type: [String],
    enum: ['all', 'students', 'faculty', 'admin', 'specific_course', 'specific_year'],
    default: ['all']
  },
  specificTargets: {
    courses: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    }],
    years: [Number],
    departments: [String]
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  requiresLogin: {
    type: Boolean,
    default: false
  },
  expiryDate: Date,
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  version: {
    type: String,
    default: '1.0'
  },
  academicYear: {
    type: String,
    required: true
  },
  semester: Number,
  subject: String
}, {
  timestamps: true
});

// Virtual for formatted file size
downloadSchema.virtual('formattedSize').get(function() {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

// Virtual for expiry status
downloadSchema.virtual('isExpired').get(function() {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

// Increment download count
downloadSchema.methods.incrementDownloadCount = async function() {
  this.downloadCount += 1;
  await this.save();
};

// Indexes
downloadSchema.index({ category: 1 });
downloadSchema.index({ isActive: 1 });
downloadSchema.index({ uploadedAt: -1 });
downloadSchema.index({ academicYear: 1, semester: 1 });
downloadSchema.index({ subject: 1 });
downloadSchema.index({ tags: 1 });

module.exports = mongoose.model('Download', downloadSchema);