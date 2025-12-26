const News = require('../models/News');
const User = require('../models/User');
const Student = require('../models/Student');
const Notification = require('../models/Notification');

// @desc    Get all news
// @route   GET /api/news
// @access  Public
exports.getAllNews = async (req, res) => {
  try {
    const { category, status, search, page = 1, limit = 10 } = req.query;
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
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    const [news, total] = await Promise.all([
      News.find(query)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('author', 'username')
        .select('-__v'),
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

// @desc    Get single news
// @route   GET /api/news/:slug
// @access  Public
exports.getNews = async (req, res) => {
  try {
    const news = await News.findOne({ 
      slug: req.params.slug,
      isPublished: true,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: new Date() } }
      ]
    })
    .populate('author', 'username')
    .select('-__v');

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
    .select('title excerpt category publishedAt slug featuredImage');

    res.json({
      success: true,
      data: {
        news,
        relatedNews
      }
    });
  } catch (error) {
    console.error('Get News Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch news'
    });
  }
};

// @desc    Create news
// @route   POST /api/news
// @access  Private (Admin/Faculty)
exports.createNews = async (req, res) => {
  try {
    const { 
      title, 
      content, 
      category, 
      isPublished, 
      isPinned,
      targetAudience,
      priority,
      expiryDate 
    } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required'
      });
    }

    // Handle attachments if any
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          fileName: file.originalname,
          fileUrl: `/uploads/news/${file.filename}`,
          fileType: file.mimetype,
          fileSize: file.size
        });
      });
    }

    // Handle target audience
    const targetAudienceArray = targetAudience ? 
      targetAudience.split(',').map(item => item.trim()) : 
      ['all'];

    // Create excerpt from content (first 200 characters)
    const excerpt = content.substring(0, 200) + (content.length > 200 ? '...' : '');

    // Create news
    const news = new News({
      title,
      content,
      excerpt,
      category: category || 'General',
      author: req.user._id,
      isPublished: isPublished === 'true',
      isPinned: isPinned === 'true',
      attachments,
      targetAudience: targetAudienceArray,
      priority: priority || 'medium',
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      tags: extractTags(content)
    });

    await news.save();

    // Create notification if news is published
    if (news.isPublished) {
      await createNewsNotification(news);
    }

    res.status(201).json({
      success: true,
      message: 'News created successfully',
      data: news
    });
  } catch (error) {
    console.error('Create News Error:', error);
    
    // Clean up uploaded files if error occurred
    if (req.files) {
      req.files.forEach(file => {
        const fs = require('fs');
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create news'
    });
  }
};

// Helper function to extract tags from content
const extractTags = (content) => {
  const tags = [];
  const commonTags = [
    'nursing', 'education', 'healthcare', 'students', 'faculty',
    'admission', 'exam', 'result', 'placement', 'event'
  ];
  
  commonTags.forEach(tag => {
    if (content.toLowerCase().includes(tag)) {
      tags.push(tag);
    }
  });
  
  return tags;
};

// Helper function to create notification for news
const createNewsNotification = async (news) => {
  try {
    let receivers = [];

    // Determine receivers based on target audience
    if (news.targetAudience.includes('all')) {
      // Get all active users
      const allUsers = await User.find({ isActive: true }).select('_id');
      receivers = allUsers.map(user => ({
        user: user._id,
        read: false
      }));
    } else if (news.targetAudience.includes('students')) {
      // Get all students
      const students = await Student.find().populate('userId');
      receivers = students.map(student => ({
        user: student.userId._id,
        read: false
      }));
    } else if (news.targetAudience.includes('faculty')) {
      // Get all faculty
      const faculty = await require('../models/Faculty').find().populate('userId');
      receivers = faculty.map(fac => ({
        user: fac.userId._id,
        read: false
      }));
    }

    // Create notification
    if (receivers.length > 0) {
      const notification = new Notification({
        title: news.title,
        message: news.excerpt || news.content.substring(0, 200) + '...',
        type: getNotificationType(news.category),
        category: news.category,
        priority: news.priority,
        sender: news.author,
        receivers,
        targetType: 'all',
        sendMethod: ['dashboard'],
        actionUrl: `/news/${news.slug}`,
        actionText: 'Read More',
        expiresAt: news.expiryDate
      });

      await notification.save();
    }
  } catch (error) {
    console.error('Create News Notification Error:', error);
  }
};

// Helper function to determine notification type based on category
const getNotificationType = (category) => {
  const typeMap = {
    'Exam': 'warning',
    'Result': 'success',
    'Event': 'info',
    'Placement': 'primary',
    'Admission': 'info',
    'Holiday': 'success',
    'Emergency': 'danger',
    'Important': 'danger'
  };
  
  return typeMap[category] || 'info';
};

// @desc    Update news
// @route   PUT /api/news/:id
// @access  Private (Admin/Faculty)
exports.updateNews = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const news = await News.findById(id);
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News not found'
      });
    }

    // Check if user is authorized to update this news
    if (req.user.role !== 'admin' && news.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this news'
      });
    }

    // Handle attachments if any new files uploaded
    if (req.files && req.files.length > 0) {
      const newAttachments = req.files.map(file => ({
        fileName: file.originalname,
        fileUrl: `/uploads/news/${file.filename}`,
        fileType: file.mimetype,
        fileSize: file.size
      }));
      
      // Merge with existing attachments
      updates.attachments = [...(news.attachments || []), ...newAttachments];
    }

    // Handle target audience
    if (updates.targetAudience && typeof updates.targetAudience === 'string') {
      updates.targetAudience = updates.targetAudience.split(',').map(item => item.trim());
    }

    // Handle tags
    if (updates.content) {
      updates.tags = extractTags(updates.content);
      updates.excerpt = updates.content.substring(0, 200) + 
        (updates.content.length > 200 ? '...' : '');
    }

    // Update news
    Object.keys(updates).forEach(key => {
      if (key !== '_id' && key !== 'author' && key !== 'createdAt') {
        news[key] = updates[key];
      }
    });

    await news.save();

    // Create notification if news is being published now
    if (updates.isPublished === 'true' && !news.isPublished) {
      await createNewsNotification(news);
    }

    res.json({
      success: true,
      message: 'News updated successfully',
      data: news
    });
  } catch (error) {
    console.error('Update News Error:', error);
    
    // Clean up uploaded files if error occurred
    if (req.files) {
      const fs = require('fs');
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update news'
    });
  }
};

// @desc    Delete news
// @route   DELETE /api/news/:id
// @access  Private (Admin/Faculty)
exports.deleteNews = async (req, res) => {
  try {
    const { id } = req.params;

    const news = await News.findById(id);
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News not found'
      });
    }

    // Check if user is authorized to delete this news
    if (req.user.role !== 'admin' && news.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this news'
      });
    }

    // Delete attachment files
    if (news.attachments && news.attachments.length > 0) {
      const fs = require('fs');
      const path = require('path');
      
      news.attachments.forEach(attachment => {
        if (attachment.fileUrl && !attachment.fileUrl.startsWith('http')) {
          const filePath = path.join(__dirname, '..', attachment.fileUrl);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      });
    }

    // Delete from database
    await news.deleteOne();

    res.json({
      success: true,
      message: 'News deleted successfully'
    });
  } catch (error) {
    console.error('Delete News Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete news'
    });
  }
};

// @desc    Get news by category
// @route   GET /api/news/category/:category
// @access  Public
exports.getNewsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [news, total] = await Promise.all([
      News.find({
        category: category,
        isPublished: true,
        $or: [
          { expiryDate: { $exists: false } },
          { expiryDate: { $gt: new Date() } }
        ]
      })
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('author', 'username')
      .select('title excerpt category publishedAt slug featuredImage views'),
      News.countDocuments({
        category: category,
        isPublished: true,
        $or: [
          { expiryDate: { $exists: false } },
          { expiryDate: { $gt: new Date() } }
        ]
      })
    ]);

    // Get category statistics
    const categoryStats = {
      name: category,
      totalNews: total,
      totalViews: news.reduce((sum, item) => sum + item.views, 0),
      pinnedNews: news.filter(item => item.isPinned).length
    };

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
        categoryStats,
        news,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get News By Category Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch news by category'
    });
  }
};

// @desc    Get recent news
// @route   GET /api/news/recent
// @access  Public
exports.getRecentNews = async (req, res) => {
  try {
    const news = await News.find({
      isPublished: true,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: new Date() } }
      ]
    })
    .sort({ publishedAt: -1 })
    .limit(5)
    .select('title excerpt category publishedAt slug featuredImage');

    res.json({
      success: true,
      data: news
    });
  } catch (error) {
    console.error('Get Recent News Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent news'
    });
  }
};

// @desc    Get important news
// @route   GET /api/news/important
// @access  Public
exports.getImportantNews = async (req, res) => {
  try {
    const news = await News.find({
      isPublished: true,
      priority: 'high',
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: new Date() } }
      ]
    })
    .sort({ publishedAt: -1 })
    .limit(10)
    .select('title excerpt category publishedAt slug priority');

    res.json({
      success: true,
      data: news
    });
  } catch (error) {
    console.error('Get Important News Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch important news'
    });
  }
};

// @desc    Get news for specific audience
// @route   GET /api/news/audience/:audience
// @access  Private
exports.getNewsForAudience = async (req, res) => {
  try {
    const { audience } = req.params;
    
    if (!['students', 'faculty', 'admin'].includes(audience)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid audience type'
      });
    }

    // Check if user belongs to the requested audience
    if (req.user.role !== audience && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const query = {
      isPublished: true,
      $or: [
        { targetAudience: 'all' },
        { targetAudience: audience },
        { targetAudience: { $in: [audience] } }
      ],
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: new Date() } }
      ]
    };

    // For students, also check specific course/batch targets
    if (audience === 'students') {
      const student = await Student.findOne({ userId: req.user._id });
      if (student) {
        query.$or.push({
          $and: [
            { targetAudience: 'specific_course' },
            { 'specificTargets.courses': student.courseEnrolled }
          ]
        });
        query.$or.push({
          $and: [
            { targetAudience: 'specific_batch' },
            { 'specificTargets.batches': student.batchYear }
          ]
        });
      }
    }

    const news = await News.find(query)
      .sort({ publishedAt: -1 })
      .limit(20)
      .populate('author', 'username')
      .select('title excerpt category publishedAt slug priority targetAudience');

    res.json({
      success: true,
      data: news
    });
  } catch (error) {
    console.error('Get News For Audience Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch news for audience'
    });
  }
};

// @desc    Get news statistics
// @route   GET /api/news/stats
// @access  Private (Admin)
exports.getNewsStats = async (req, res) => {
  try {
    // Overall statistics
    const overallStats = await News.aggregate([
      {
        $group: {
          _id: null,
          totalNews: { $sum: 1 },
          publishedNews: { $sum: { $cond: ['$isPublished', 1, 0] } },
          pinnedNews: { $sum: { $cond: ['$isPinned', 1, 0] } },
          totalViews: { $sum: '$views' },
          expiredNews: {
            $sum: {
              $cond: [
                { $and: [
                  { $ifNull: ['$expiryDate', false] },
                  { $lt: ['$expiryDate', new Date()] }
                ]},
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Category-wise statistics
    const categoryStats = await News.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          views: { $sum: '$views' },
          published: { $sum: { $cond: ['$isPublished', 1, 0] } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Author-wise statistics
    const authorStats = await News.aggregate([
      {
        $group: {
          _id: '$author',
          count: { $sum: 1 },
          views: { $sum: '$views' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'authorInfo'
        }
      },
      {
        $unwind: '$authorInfo'
      },
      {
        $project: {
          authorName: '$authorInfo.username',
          count: 1,
          views: 1
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Monthly publication trends
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyStats = await News.aggregate([
      {
        $match: {
          publishedAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$publishedAt' },
            month: { $month: '$publishedAt' }
          },
          publications: { $sum: 1 },
          views: { $sum: '$views' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      },
      {
        $limit: 6
      }
    ]);

    // Most viewed news
    const mostViewed = await News.find()
      .sort({ views: -1 })
      .limit(10)
      .select('title category views publishedAt isPublished');

    res.json({
      success: true,
      data: {
        overall: overallStats[0] || {
          totalNews: 0,
          publishedNews: 0,
          pinnedNews: 0,
          totalViews: 0,
          expiredNews: 0
        },
        categoryStats,
        authorStats,
        monthlyStats,
        mostViewed
      }
    });
  } catch (error) {
    console.error('Get News Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch news statistics'
    });
  }
};

// @desc    Search news
// @route   GET /api/news/search
// @access  Public
exports.searchNews = async (req, res) => {
  try {
    const { q, category } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const query = {
      isPublished: true,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: new Date() } }
      ],
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ]
    };

    if (category) {
      query.category = category;
    }

    const news = await News.find(query)
      .sort({ publishedAt: -1 })
      .limit(20)
      .select('title excerpt category publishedAt slug featuredImage');

    res.json({
      success: true,
      count: news.length,
      data: news
    });
  } catch (error) {
    console.error('Search News Error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};