const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true
  },
  category: {
    type: String,
    enum: ['general', 'admission', 'course', 'fee', 'complaint', 'suggestion', 'other'],
    default: 'general'
  },
  status: {
    type: String,
    enum: ['pending', 'read', 'replied', 'resolved', 'archived'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  replyMessage: String,
  repliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  repliedAt: Date,
  isRead: {
    type: Boolean,
    default: false
  },
  readBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  readAt: Date,
  ipAddress: String,
  userAgent: String,
  source: {
    type: String,
    default: 'website'
  },
  attachments: [{
    filename: String,
    fileUrl: String,
    fileType: String,
    fileSize: Number
  }],
  notes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted date
contactSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Indexes for faster queries
contactSchema.index({ status: 1 });
contactSchema.index({ priority: 1 });
contactSchema.index({ createdAt: -1 });
contactSchema.index({ email: 1 });
contactSchema.index({ category: 1 });
contactSchema.index({ isRead: 1 });

module.exports = mongoose.model('Contact', contactSchema);