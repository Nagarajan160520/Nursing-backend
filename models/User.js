const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  personalEmail: {
        type: String,
        lowercase: true,
        trim: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    needsPasswordReset: {
        type: Boolean,
        default: false
    },
  role: {
    type: String,
    enum: ['admin', 'student', 'faculty'],
    default: 'student'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  profileImage: {
    type: String,
    default: '/uploads/profile/default.jpg'
  },
  phoneNumber: String,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date
}, {
  timestamps: true
});

// SIMPLIFIED password comparison
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    // Get the actual user with password
    const user = await mongoose.model('User').findById(this._id).select('+password');
    
    if (!user || !user.password) {
      return false;
    }
    
    // Direct bcrypt compare
    return await bcrypt.compare(candidatePassword, user.password);
    
  } catch (error) {
    console.error('Password compare error:', error);
    return false;
  }
};

// SIMPLIFIED token generation
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      userId: this._id, 
      role: this.role,
      username: this.username
    },
    process.env.JWT_SECRET || 'nursing_institute_secret_key',
    { 
      expiresIn: '30d'
    }
  );
};

// Remove all pre-save hooks temporarily
// userSchema.pre('save', async function(next) {
//   // Comment out for now
//   next();
// });

// Hash password before save if modified
userSchema.pre('save', async function(next) {
  try {
    if (!this.isModified('password')) return next();

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    console.error('Error hashing password:', err);
    next(err);
  }
});

module.exports = mongoose.model('User', userSchema);