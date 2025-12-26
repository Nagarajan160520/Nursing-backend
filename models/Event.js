const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Event description is required']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  eventType: {
    type: String,
    required: true,
    enum: [ 
      'Academic',
      'Cultural',
      'Sports',
      'Workshop',
      'Seminar',
      'Conference',
      'Celebration',
      'Competition',
      'Guest Lecture',
      'Field Trip',
      'Other'
    ],
    default: 'Academic'
  },
  category: {
    type: String,
    enum: [
      'College Day',
      'Annual Day',
      'Freshers Party',
      'Farewell',
      'Sports Day',
      'Cultural Fest',
      'Tech Fest',
      'Health Camp',
      'Blood Donation',
      'Awareness Program',
      'Other'
    ],
    default: 'Other'
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  startTime: String,
  endTime: String,
  venue: {
    type: String,
    required: [true, 'Venue is required']
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  coOrganizers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  targetAudience: {
    type: [String],
    enum: ['all', 'students', 'faculty', 'staff', 'alumni', 'public', 'specific_course', 'specific_year'],
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
  featuredImage: String,
  gallery: [{
    imageUrl: String,
    caption: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  registrationRequired: {
    type: Boolean,
    default: false
  },
  registrationLink: String,
  registrationDeadline: Date,
  maxParticipants: Number,
  registeredParticipants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    registeredAt: {
      type: Date,
      default: Date.now
    },
    attended: {
      type: Boolean,
      default: false
    }
  }],
  speakers: [{
    name: String,
    designation: String,
    organization: String,
    topic: String,
    time: String
  }],
  schedule: [{
    time: String,
    activity: String,
    speaker: String,
    venue: String
  }],
  sponsors: [{
    name: String,
    logo: String,
    website: String,
    sponsorshipType: String
  }],
  budget: {
    estimated: Number,
    actual: Number,
    expenses: [{
      item: String,
      amount: Number,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  },
  volunteers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: String,
    assignedTasks: [String]
  }],
  isPublished: {
    type: Boolean,
    default: true
  },
  publishedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Upcoming', 'Ongoing', 'Completed', 'Cancelled', 'Postponed'],
    default: 'Upcoming'
  },
  views: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  highlights: [String],
  outcomes: [String],
  feedback: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  meta: {
    keywords: [String],
    description: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate slug before saving
eventSchema.pre('save', function(next) {
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

// Virtual for event duration
eventSchema.virtual('duration').get(function() {
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1;
});

// Virtual for formatted dates
eventSchema.virtual('formattedStartDate').get(function() {
  return this.startDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

eventSchema.virtual('formattedEndDate').get(function() {
  return this.endDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Virtual for registration status
eventSchema.virtual('registrationStatus').get(function() {
  if (!this.registrationRequired) return 'Not Required';
  if (!this.registrationDeadline) return 'Open';
  
  const now = new Date();
  if (now > this.registrationDeadline) return 'Closed';
  
  if (this.maxParticipants && this.registeredParticipants.length >= this.maxParticipants) {
    return 'Full';
  }
  
  return 'Open';
});

// Virtual for participants count
eventSchema.virtual('participantsCount').get(function() {
  return this.registeredParticipants.length;
});

// Virtual for average rating
eventSchema.virtual('averageRating').get(function() {
  if (!this.feedback || this.feedback.length === 0) return 0;
  const total = this.feedback.reduce((sum, item) => sum + item.rating, 0);
  return total / this.feedback.length;
});

// Check if event is upcoming
eventSchema.virtual('isUpcoming').get(function() {
  const now = new Date();
  return this.startDate > now;
});

// Check if event is ongoing
eventSchema.virtual('isOngoing').get(function() {
  const now = new Date();
  return now >= this.startDate && now <= this.endDate;
});

// Indexes
eventSchema.index({ slug: 1 });
eventSchema.index({ eventType: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ startDate: 1 });
eventSchema.index({ endDate: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ isPublished: 1 });
eventSchema.index({ organizer: 1 });
eventSchema.index({ tags: 1 });

// Increment views
eventSchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save();
};

// Register participant
eventSchema.methods.registerParticipant = async function(userId) {
  // Check if already registered
  const alreadyRegistered = this.registeredParticipants.some(
    participant => participant.user.toString() === userId.toString()
  );
  
  if (alreadyRegistered) {
    throw new Error('Already registered for this event');
  }
  
  // Check if registration is open
  if (this.registrationStatus !== 'Open') {
    throw new Error('Registration is not open for this event');
  }
  
  this.registeredParticipants.push({
    user: userId,
    registeredAt: new Date()
  });
  
  await this.save();
};

// Add feedback
eventSchema.methods.addFeedback = async function(userId, rating, comment) {
  // Check if user attended the event
  const attended = this.registeredParticipants.some(
    participant => participant.user.toString() === userId.toString() && participant.attended
  );
  
  if (!attended) {
    throw new Error('Only attendees can provide feedback');
  }
  
  // Check if already provided feedback
  const existingFeedback = this.feedback.find(
    feedback => feedback.user.toString() === userId.toString()
  );
  
  if (existingFeedback) {
    existingFeedback.rating = rating;
    existingFeedback.comment = comment;
  } else {
    this.feedback.push({
      user: userId,
      rating,
      comment
    });
  }
  
  await this.save();
};

module.exports = mongoose.model('Event', eventSchema);