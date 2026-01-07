const Course = require('../models/Course');
const Gallery = require('../models/Gallery');
const News = require('../models/News');
const Faculty = require('../models/Faculty');
const Event = require('../models/Event');

// @desc    Get homepage data
// @route   GET /api/public/home
// @access  Public
exports.getHomeData = async (req, res) => {
  try {
    // Get active courses
    const courses = await Course.find({ isActive: true })
      .select('courseCode courseName description duration seatsAvailable')
      .limit(6);

    // Get featured gallery items
    const gallery = await Gallery.find({ 
      isPublished: true,
      featured: true 
    })
    .sort({ displayOrder: 1, createdAt: -1 })
    .limit(8)
    .select('title imageUrl thumbnailUrl category');

    // Get latest news
    const news = await News.find({ 
      isPublished: true,
      isPinned: false 
    })
    .sort({ publishedAt: -1 })
    .limit(5)
    .select('title excerpt category publishedAt slug');

    // Get pinned news
    const pinnedNews = await News.find({ 
      isPublished: true,
      isPinned: true 
    })
    .sort({ publishedAt: -1 })
    .limit(3)
    .select('title excerpt category publishedAt slug');

    // Get featured faculty
    const faculty = await Faculty.find({ isActive: true })
      .sort({ experience: -1 })
      .limit(4)
    .select('fullName designation department qualification profileImage');

    // Get statistics
    const stats = {
      totalStudents: await getTotalStudents(),
      totalCourses: await Course.countDocuments({ isActive: true }),
      totalFaculty: await Faculty.countDocuments({ isActive: true }),
      placementRate: 95 // This could be calculated from placement data
    };

    // Get upcoming published events; if none, fall back to recent published events
    let upcomingEvents = await Event.find({ isPublished: true, endDate: { $gte: new Date() } })
      .sort({ startDate: 1 })
      .limit(3)
      .select('title description startDate endDate venue slug');

    if (!upcomingEvents || upcomingEvents.length === 0) {
      upcomingEvents = await Event.find({ isPublished: true })
        .sort({ startDate: -1 })
        .limit(3)
        .select('title description startDate endDate venue slug');
    }

    res.json({
      success: true,
      data: {
        courses,
        gallery,
        events: upcomingEvents,
        news: {
          latest: news,
          pinned: pinnedNews
        },
        faculty,
        stats
      }
    });
  } catch (error) {
    console.error('Get Home Data Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch homepage data'
    });
  }
};

// Helper function to get total students
const getTotalStudents = async () => {
  try {
    const count = await require('../models/Student').countDocuments({ 
      academicStatus: 'Active' 
    });
    return count;
  } catch (error) {
    console.error('Get Total Students Error:', error);
    return 0;
  }
};

// @desc    Get all courses
// @route   GET /api/public/courses
// @access  Public
exports.getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true })
      .select('courseCode courseName description duration eligibility seatsAvailable careerOpportunities')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: courses,
      count: courses.length
    });
  } catch (error) {
    console.error('Get All Courses Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch courses'
    });
  }
};

// @desc    Get course details
// @route   GET /api/public/courses/:id
// @access  Public
exports.getCourseDetails = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .select('-createdBy -approvalStatus -__v');

    if (!course || !course.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Get related courses
    const relatedCourses = await Course.find({
      _id: { $ne: course._id },
      isActive: true,
      duration: course.duration
    })
    .limit(4)
    .select('courseCode courseName description duration');

    res.json({
      success: true,
      data: {
        course,
        relatedCourses
      }
    });
  } catch (error) {
    console.error('Get Course Details Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch course details'
    });
  }
};

// @desc    Get gallery items
// @route   GET /api/public/gallery
// @access  Public
exports.getGallery = async (req, res) => {
  try {
    const { category, album, page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { isPublished: true };
    
    if (category) {
      query.category = category;
    }
    
    if (album) {
      query.album = album;
    }

    const [gallery, total] = await Promise.all([
      Gallery.find(query)
        .sort({ displayOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('title description imageUrl thumbnailUrl category tags views likesCount commentsCount'),
      Gallery.countDocuments(query)
    ]);

    // Get unique albums and categories for filters
    const albums = await Gallery.distinct('album', { isPublished: true });
    const categories = await Gallery.distinct('category', { isPublished: true });

    // Increment views for fetched items
    await Promise.all(
      gallery.map(item => item.incrementViews())
    );

    // Attach full URLs so clients don't need to build them
    const host = `${req.protocol}://${req.get('host')}`;
    const galleryWithUrls = gallery.map(item => {
      const obj = item.toObject ? item.toObject() : item;
      obj.fullImageUrl = obj.imageUrl && obj.imageUrl.startsWith('http') ? obj.imageUrl : `${host}${obj.imageUrl}`;
      obj.fullThumbnailUrl = obj.thumbnailUrl && obj.thumbnailUrl.startsWith('http') ? obj.thumbnailUrl : `${host}${obj.thumbnailUrl || obj.imageUrl}`;
      return obj;
    });

    res.json({
      success: true,
      data: {
        gallery: galleryWithUrls,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        filters: {
          albums,
          categories
        }
      }
    });
  } catch (error) {
    console.error('Get Gallery Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gallery'
    });
  }
};

// @desc    Get gallery item details
// @route   GET /api/public/gallery/:id
// @access  Public
exports.getGalleryItem = async (req, res) => {
  try {
    const galleryItem = await Gallery.findById(req.params.id)
      .populate('uploadedBy', 'username')
      .populate('comments.user', 'username');

    if (!galleryItem || !galleryItem.isPublished) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    // Increment views
    await galleryItem.incrementViews();

    // Get related gallery items
    const relatedGallery = await Gallery.find({
      _id: { $ne: galleryItem._id },
      isPublished: true,
      category: galleryItem.category
    })
    .limit(4)
    .select('title imageUrl thumbnailUrl category');

    // Attach full URLs
    const host = `${req.protocol}://${req.get('host')}`;
    const galleryItemObj = galleryItem.toObject ? galleryItem.toObject() : galleryItem;
    galleryItemObj.fullImageUrl = galleryItemObj.imageUrl && galleryItemObj.imageUrl.startsWith('http') ? galleryItemObj.imageUrl : `${host}${galleryItemObj.imageUrl}`;
    galleryItemObj.fullThumbnailUrl = galleryItemObj.thumbnailUrl && galleryItemObj.thumbnailUrl.startsWith('http') ? galleryItemObj.thumbnailUrl : `${host}${galleryItemObj.thumbnailUrl || galleryItemObj.imageUrl}`;

    const relatedWithUrls = relatedGallery.map(item => {
      const obj = item.toObject ? item.toObject() : item;
      obj.fullImageUrl = obj.imageUrl && obj.imageUrl.startsWith('http') ? obj.imageUrl : `${host}${obj.imageUrl}`;
      obj.fullThumbnailUrl = obj.thumbnailUrl && obj.thumbnailUrl.startsWith('http') ? obj.thumbnailUrl : `${host}${obj.thumbnailUrl || obj.imageUrl}`;
      return obj;
    });

    res.json({
      success: true,
      data: {
        galleryItem: galleryItemObj,
        relatedGallery: relatedWithUrls
      }
    });
  } catch (error) {
    console.error('Get Gallery Item Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gallery item'
    });
  }
};

// @desc    Like gallery item
// @route   POST /api/public/gallery/:id/like
// @access  Private
exports.likeGalleryItem = async (req, res) => {
  try {
    const galleryItem = await Gallery.findById(req.params.id);

    if (!galleryItem || !galleryItem.isPublished) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    const userId = req.user._id;
    const alreadyLiked = galleryItem.likes.includes(userId);

    if (alreadyLiked) {
      // Unlike
      galleryItem.likes = galleryItem.likes.filter(
        like => like.toString() !== userId.toString()
      );
    } else {
      // Like
      galleryItem.likes.push(userId);
    }

    await galleryItem.save();

    res.json({
      success: true,
      message: alreadyLiked ? 'Unliked successfully' : 'Liked successfully',
      data: {
        likesCount: galleryItem.likes.length,
        liked: !alreadyLiked
      }
    });
  } catch (error) {
    console.error('Like Gallery Item Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process like'
    });
  }
};

// @desc    Add comment to gallery item
// @route   POST /api/public/gallery/:id/comments
// @access  Private
exports.addComment = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment text is required'
      });
    }

    const galleryItem = await Gallery.findById(req.params.id);

    if (!galleryItem || !galleryItem.isPublished) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    const comment = {
      user: req.user._id,
      text: text.trim()
    };

    galleryItem.comments.push(comment);
    await galleryItem.save();

    // Populate user info in the new comment
    await galleryItem.populate('comments.user', 'username');

    const newComment = galleryItem.comments[galleryItem.comments.length - 1];

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: newComment
    });
  } catch (error) {
    console.error('Add Comment Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add comment'
    });
  }
};

// @desc    Get all news
// @route   GET /api/public/news
// @access  Public
exports.getAllNews = async (req, res) => {
  try {
    const { category, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { 
      isPublished: true,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: new Date() } }
      ]
    };
    
    if (category) {
      query.category = category;
    }

    const [news, total] = await Promise.all([
      News.find(query)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('title excerpt content category publishedAt slug featuredImage views'),
      News.countDocuments(query)
    ]);

    // Get pinned news
    const pinnedNews = await News.find({
      isPublished: true,
      isPinned: true,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: new Date() } }
      ]
    })
    .sort({ publishedAt: -1 })
    .limit(3)
    .select('title excerpt category publishedAt slug');

    // Get categories for filter
    const categories = await News.distinct('category', { 
      isPublished: true 
    });

    // Increment views
    await Promise.all(
      news.map(item => {
        item.views += 1;
        return item.save();
      })
    );

    res.json({
      success: true,
      data: {
        news,
        pinnedNews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        filters: {
          categories
        }
      }
    });
  } catch (error) {
    console.error('Get All News Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch news'
    });
  }
};

// @desc    Get news details
// @route   GET /api/public/news/:slug
// @access  Public
exports.getNewsDetails = async (req, res) => {
  try {
    const news = await News.findOne({ 
      slug: req.params.slug,
      isPublished: true,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: new Date() } }
      ]
    }).populate('author', 'username');

    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News not found'
      });
    }

    // Increment views
    news.views += 1;
    await news.save();

    // Get related news
    const relatedNews = await News.find({
      _id: { $ne: news._id },
      isPublished: true,
      category: news.category,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: new Date() } }
      ]
    })
    .sort({ publishedAt: -1 })
    .limit(4)
    .select('title excerpt category publishedAt slug');

    res.json({
      success: true,
      data: {
        news,
        relatedNews
      }
    });
  } catch (error) {
    console.error('Get News Details Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch news details'
    });
  }
};

// @desc    Get faculty list
// @route   GET /api/public/faculty
// @access  Public
exports.getFaculty = async (req, res) => {
  try {
    const { department } = req.query;

    const query = { isActive: true };
    
    if (department) {
      query.department = department;
    }

    const faculty = await Faculty.find(query)
      .sort({ experience: -1 })
      .select('fullName designation department qualification experience profileImage bio');

    // Get departments for filter
    const departments = await Faculty.distinct('department', { isActive: true });

    res.json({
      success: true,
      data: {
        faculty,
        filters: {
          departments
        }
      }
    });
  } catch (error) {
    console.error('Get Faculty Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty'
    });
  }
};

// @desc    Get faculty details
// @route   GET /api/public/faculty/:id
// @access  Public
exports.getFacultyDetails = async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id)
      .select('-__v -userId -isActive');

    if (!faculty || !faculty.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Faculty not found'
      });
    }

    // Get courses taught by this faculty
    const courses = await require('../models/Course').find({
      'subjects.faculty': faculty._id,
      isActive: true
    })
    .select('courseName courseCode subjects')
    .limit(5);

    res.json({
      success: true,
      data: {
        faculty,
        courses
      }
    });
  } catch (error) {
    console.error('Get Faculty Details Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty details'
    });
  }
};

const Contact = require('../models/Contact');
const nodemailer = require('nodemailer');
const validator = require('validator');

// @desc    Submit contact form
// @route   POST /api/public/contact
// @access  Public
// @desc    Submit contact form (FIXED VERSION)
// @route   POST /api/public/contact
// @access  Public
exports.submitContactForm = async (req, res) => {
  try {
    const { name, email, phone, subject, message, category } = req.body;

    console.log('Contact form data:', { name, email, subject, category });

    // Basic validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please fill all required fields'
      });
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Normalize data for MongoDB
    const contactData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : '',
      subject: subject.trim(),
      message: message.trim(),
      category: (category || 'general').toLowerCase(),
      status: 'pending',
      priority: 'medium',
      source: 'website'
    };

    console.log('Normalized contact data:', contactData);

    // Save to database
    const Contact = require('../models/Contact');
    const contact = new Contact(contactData);
    await contact.save();

    console.log('✅ Contact saved to database with ID:', contact._id);

    res.status(201).json({
      success: true,
      message: 'Thank you for your message! We will get back to you within 24-48 hours.',
      data: {
        contactId: contact._id,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Contact form error details:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Form validation failed',
        errors
      });
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      message: 'Failed to submit contact form. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// @desc    Get about us information
// @route   GET /api/public/about
// @access  Public
exports.getAboutInfo = async (req, res) => {
  try {
    // This data would typically come from a database or CMS
    const aboutInfo = {
      history: "Our Nursing Institute was established in 1995 with a vision to provide quality nursing education. Over the years, we have trained thousands of nursing professionals who are serving in various healthcare sectors across the country.",
      mission: "To provide comprehensive nursing education that prepares competent, compassionate, and ethical nursing professionals committed to excellence in patient care, research, and community service.",
      vision: "To be a premier institution of nursing education recognized for excellence in healthcare education, research, and community service.",
      values: ["Excellence", "Compassion", "Integrity", "Respect", "Innovation"],
      accreditation: [
        { body: "Indian Nursing Council", status: "Approved" },
        { body: "State Nursing Council", status: "Recognized" },
        { body: "University Grants Commission", status: "Affiliated" }
      ],
      infrastructure: {
        labs: ["Nursing Foundation Lab", "Anatomy & Physiology Lab", "Community Health Lab", "Computer Lab"],
        library: "Well-stocked library with 10,000+ books and digital resources",
        hostel: "Separate hostel facilities for boys and girls with modern amenities",
        transport: "College buses covering all major routes in the city",
        cafeteria: "Hygienic and nutritious food available"
      },
      management: [
        { name: "Dr. R. Sharma", designation: "Principal", qualification: "Ph.D in Nursing", experience: "25 years" },
        { name: "Dr. S. Patel", designation: "Vice Principal", qualification: "M.Sc Nursing", experience: "20 years" }
      ]
    };

    res.json({
      success: true,
      data: aboutInfo
    });
  } catch (error) {
    console.error('Get About Info Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch about information'
    });
  }
};

// @desc    Search across the website
// @route   GET /api/public/search
// @access  Public
exports.search = async (req, res) => {
  try {
    const { q, type } = req.query;

    if (!q || q.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 3 characters long'
      });
    }

    const searchQuery = { $regex: q, $options: 'i' };
    const results = {};

    // Search courses
    if (!type || type === 'courses') {
      const courses = await Course.find({
        $or: [
          { courseName: searchQuery },
          { courseCode: searchQuery },
          { description: searchQuery }
        ],
        isActive: true
      })
      .select('courseName courseCode description duration')
      .limit(5);
      results.courses = courses;
    }

    // Search news
    if (!type || type === 'news') {
      const news = await News.find({
        $or: [
          { title: searchQuery },
          { content: searchQuery },
          { tags: searchQuery }
        ],
        isPublished: true
      })
      .select('title excerpt category publishedAt slug')
      .limit(5);
      results.news = news;
    }

    // Search gallery
    if (!type || type === 'gallery') {
      const gallery = await Gallery.find({
        $or: [
          { title: searchQuery },
          { description: searchQuery },
          { tags: searchQuery }
        ],
        isPublished: true
      })
      .select('title imageUrl thumbnailUrl category')
      .limit(5);
      results.gallery = gallery;
    }

    // Search faculty
    if (!type || type === 'faculty') {
      const faculty = await Faculty.find({
        $or: [
          { fullName: searchQuery },
          { designation: searchQuery },
          { department: searchQuery },
          { qualification: { $elemMatch: { degree: searchQuery } } }
        ],
        isActive: true
      })
      .select('fullName designation department profileImage')
      .limit(5);
      results.faculty = faculty;
    }

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Search Error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};

// @desc    Get public events (upcoming / published)
// @route   GET /api/public/events
// @access  Public
exports.getPublicEvents = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    // Prefer upcoming events; if none found, fallback to recent published events
    let events = await Event.find({ isPublished: true, endDate: { $gte: new Date() } })
      .sort({ startDate: 1 })
      .limit(parseInt(limit))
      .select('title description startDate endDate venue slug');

    if (!events || events.length === 0) {
      events = await Event.find({ isPublished: true })
        .sort({ startDate: -1 })
        .limit(parseInt(limit))
        .select('title description startDate endDate venue slug');
    }

    // If still no events, provide mock data
    if (!events || events.length === 0) {
      events = [
        {
          title: 'Annual Nursing Conference 2024',
          description: 'Join us for our annual nursing conference featuring keynote speakers from leading healthcare institutions.',
          startDate: new Date('2024-12-15'),
          endDate: new Date('2024-12-16'),
          venue: 'Main Auditorium',
          slug: 'annual-nursing-conference-2024'
        },
        {
          title: 'Health Camp - Free Medical Checkup',
          description: 'Free medical checkup camp for students and faculty. Includes blood pressure, diabetes screening, and general health consultation.',
          startDate: new Date('2024-11-20'),
          endDate: new Date('2024-11-20'),
          venue: 'College Campus',
          slug: 'health-camp-free-medical-checkup'
        },
        {
          title: 'Workshop on Advanced Nursing Techniques',
          description: 'Hands-on workshop covering the latest nursing techniques and patient care methodologies.',
          startDate: new Date('2024-11-25'),
          endDate: new Date('2024-11-25'),
          venue: 'Nursing Lab',
          slug: 'workshop-advanced-nursing-techniques'
        },
        {
          title: 'Freshers Welcome Party',
          description: 'Welcome celebration for new nursing students with cultural performances and interactive sessions.',
          startDate: new Date('2024-10-30'),
          endDate: new Date('2024-10-30'),
          venue: 'College Ground',
          slug: 'freshers-welcome-party'
        },
        {
          title: 'Blood Donation Camp',
          description: 'Save lives by donating blood. All students and faculty are encouraged to participate.',
          startDate: new Date('2024-11-10'),
          endDate: new Date('2024-11-10'),
          venue: 'College Auditorium',
          slug: 'blood-donation-camp'
        }
      ];
    }

    res.json({ success: true, data: events, count: events.length });
  } catch (error) {
    console.error('Get Public Events Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch events' });
  }
};
