const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  }, 
  imageUrl: {
    type: String,
    required: [true, 'Image URL is required']
  },
  thumbnailUrl: String,
  category: {
    type: String,
    enum: ['Events', 'Campus', 'Practical', 'Cultural', 'Sports', 'Workshop', 'Seminar', 'Graduation', 'Placement', 'Other'],
    default: 'Events'
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  album: {
    type: String,
    default: 'General'
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  views: {
    type: Number,
    default: 0
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    text: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  featured: {
    type: Boolean,
    default: false
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  metadata: {
    fileSize: Number,
    dimensions: {
      width: Number,
      height: Number
    },
    format: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for likes count
gallerySchema.virtual('likesCount').get(function() {
  return (this.likes || []).length;
});

// Virtual for comments count
gallerySchema.virtual('commentsCount').get(function() {
  return (this.comments || []).length;
});

// Increment views
gallerySchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save();
};

// Indexes
gallerySchema.index({ category: 1 });
gallerySchema.index({ tags: 1 });
gallerySchema.index({ isPublished: 1 });
gallerySchema.index({ featured: 1 });
gallerySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Gallery', gallerySchema);