const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  content: {
    type: String,
    required: [true, 'Content is required']
  },
  excerpt: {
    type: String,
    maxlength: 200
  },
  category: {
    type: String,
    enum: ['General', 'Exam', 'Event', 'Result', 'Holiday', 'Placement', 'Admission', 'Circular', 'Important', 'Achievement'],
    default: 'General'
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  publishedAt: {
    type: Date,
    default: Date.now
  },
  featuredImage: String,
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    fileSize: Number
  }],
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  targetAudience: [{
    type: String,
    enum: ['all', 'students', 'faculty', 'admin', 'specific_course', 'specific_batch']
  }],
  specificTargets: {
    courses: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    }],
    batches: [Number],
    departments: [String]
  },
  views: {
    type: Number,
    default: 0
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  expiryDate: Date,
  meta: {
    keywords: [String],
    description: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate slug before saving
newsSchema.pre('save', function(next) {
  if (!this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
  }
  next();
});

// Virtual for formatted date
newsSchema.virtual('formattedDate').get(function() {
  return this.publishedAt.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Check if news is expired
newsSchema.virtual('isExpired').get(function() {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

// Indexes
newsSchema.index({ category: 1 });
newsSchema.index({ isPublished: 1 });
newsSchema.index({ isPinned: 1 });
newsSchema.index({ publishedAt: -1 });
newsSchema.index({ slug: 1 });
newsSchema.index({ tags: 1 });

module.exports = mongoose.model('News', newsSchema);