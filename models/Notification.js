const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Message is required']
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'danger', 'primary'],
    default: 'info'
  },
  category: {
    type: String,
    enum: ['Academic', 'Administrative', 'Event', 'Exam', 'Result', 'Placement', 'Fee', 'Holiday', 'Emergency', 'General'],
    default: 'General'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receivers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    read: {
      type: Boolean,
      default: false
    },
    readAt: Date
  }],
  targetType: {
    type: String,
    enum: ['individual', 'role', 'course', 'batch', 'all'],
    default: 'all'
  },
  targetIds: [{
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'targetModel'
  }],
  targetModel: {
    type: String,
    enum: ['User', 'Course', 'Student', null]
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String
  }],
  actionUrl: String,
  actionText: String,
  sendMethod: {
    type: [String],
    enum: ['dashboard', 'email', 'sms', 'push'],
    default: ['dashboard']
  },
  scheduledAt: Date,
  sentAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  requireAck: {
    type: Boolean,
    default: false
  },
  ackReceivers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    acknowledged: {
      type: Boolean,
      default: false
    },
    acknowledgedAt: Date
  }],
  metadata: {
    sentCount: Number,
    readCount: {
      type: Number,
      default: 0
    },
    ackCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for notification status
notificationSchema.virtual('status').get(function() {
  if (this.scheduledAt && this.scheduledAt > new Date()) {
    return 'scheduled';
  }
  if (this.expiresAt && this.expiresAt < new Date()) {
    return 'expired';
  }
  return 'active';
});

// Mark as read for a user
notificationSchema.methods.markAsRead = async function(userId) {
  const receiver = this.receivers.find(r => r.user.toString() === userId.toString());
  if (receiver && !receiver.read) {
    receiver.read = true;
    receiver.readAt = new Date();
    this.metadata.readCount += 1;
    await this.save();
  }
};

// Acknowledge notification
notificationSchema.methods.acknowledge = async function(userId) {
  const ackReceiver = this.ackReceivers.find(r => r.user.toString() === userId.toString());
  if (ackReceiver && !ackReceiver.acknowledged) {
    ackReceiver.acknowledged = true;
    ackReceiver.acknowledgedAt = new Date();
    this.metadata.ackCount += 1;
    await this.save();
  }
};

// Indexes
notificationSchema.index({ sender: 1 });
notificationSchema.index({ 'receivers.user': 1 });
notificationSchema.index({ priority: 1 });
notificationSchema.index({ category: 1 });
notificationSchema.index({ sentAt: -1 });
notificationSchema.index({ scheduledAt: 1 });
notificationSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Notification', notificationSchema);