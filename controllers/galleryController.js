const Gallery = require('../models/Gallery');
const cloudinary = require('../config/cloudinary');
const path = require('path');
const fs = require('fs');

// @desc    Get all gallery items
// @route   GET /api/gallery
// @access  Public
exports.getAllGallery = async (req, res) => {
  try {
    const { category, album, featured, search, page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { isPublished: true };
    
    if (category) {
      query.category = category;
    }
    
    if (album) {
      query.album = album;
    }
    
    if (featured) {
      query.featured = featured === 'true';
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    const [gallery, total] = await Promise.all([
      Gallery.find(query)
        .sort({ displayOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('uploadedBy', 'username')
        .select('-__v'),
      Gallery.countDocuments(query)
    ]);

    // Get unique albums and categories for filters
    const albums = await Gallery.distinct('album', { isPublished: true });
    const categories = await Gallery.distinct('category', { isPublished: true });

    // Increment views for fetched items
    await Promise.all(
      gallery.map(item => item.incrementViews())
    );

    res.json({
      success: true,
      data: {
        gallery,
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
    console.error('Get All Gallery Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gallery'
    });
  }
};

// @desc    Get gallery item by ID
// @route   GET /api/gallery/:id
// @access  Public
exports.getGalleryItem = async (req, res) => {
  try {
    const galleryItem = await Gallery.findById(req.params.id)
      .populate('uploadedBy', 'username')
      .populate('comments.user', 'username')
      .select('-__v');

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
    .sort({ createdAt: -1 })
    .limit(4)
    .select('title imageUrl thumbnailUrl category');

    res.json({
      success: true,
      data: {
        galleryItem,
        relatedGallery
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

// @desc    Create gallery item
// @route   POST /api/gallery
// @access  Private (Admin)
exports.createGalleryItem = async (req, res) => {
  try {
    const { title, description, category, tags, album, featured } = req.body;

    // Validate required fields
    if (!title || !req.file) {
      return res.status(400).json({
        success: false,
        message: 'Title and image are required'
      });
    }

    // Process tags
    const tagsArray = tags ? tags.split(',').map(tag => tag.trim().toLowerCase()) : [];

    // Upload to Cloudinary if configured, otherwise save locally
    let imageUrl, thumbnailUrl;
    
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      // Upload to Cloudinary
      const result = await cloudinary.uploadImage(req.file.path, 'nursing_institute/gallery');
      
      imageUrl = result.secure_url;
      thumbnailUrl = cloudinary.getThumbnailUrl(result.public_id, 300, 200);
      
      // Delete local file after upload
      fs.unlinkSync(req.file.path);
    } else {
      // Save locally
      imageUrl = `/uploads/gallery/${req.file.filename}`;
      thumbnailUrl = `/uploads/gallery/${req.file.filename}`;
    }

    // Create gallery item
    const galleryItem = new Gallery({
      title,
      description,
      imageUrl,
      thumbnailUrl,
      category: category || 'Events',
      tags: tagsArray,
      album: album || 'General',
      uploadedBy: req.user._id,
      featured: featured === 'true',
      metadata: {
        fileSize: req.file.size,
        dimensions: {
          width: 800, // You might want to get actual dimensions
          height: 600
        },
        format: path.extname(req.file.originalname).substring(1)
      }
    });

    await galleryItem.save();

    res.status(201).json({
      success: true,
      message: 'Gallery item created successfully',
      data: galleryItem
    });
  } catch (error) {
    console.error('Create Gallery Item Error:', error);
    
    // Clean up uploaded file if error occurred
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create gallery item'
    });
  }
};

// @desc    Update gallery item
// @route   PUT /api/gallery/:id
// @access  Private (Admin)
exports.updateGalleryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const galleryItem = await Gallery.findById(id);
    if (!galleryItem) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    // Handle new image upload if provided
    if (req.file) {
      // Delete old image if exists
      if (galleryItem.imageUrl && !galleryItem.imageUrl.startsWith('http')) {
        const oldPath = path.join(__dirname, '..', galleryItem.imageUrl);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      // Upload new image
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        const result = await cloudinary.uploadImage(req.file.path, 'nursing_institute/gallery');
        galleryItem.imageUrl = result.secure_url;
        galleryItem.thumbnailUrl = cloudinary.getThumbnailUrl(result.public_id, 300, 200);
        fs.unlinkSync(req.file.path);
      } else {
        galleryItem.imageUrl = `/uploads/gallery/${req.file.filename}`;
        galleryItem.thumbnailUrl = `/uploads/gallery/${req.file.filename}`;
      }
    }

    // Update other fields
    if (updates.title) galleryItem.title = updates.title;
    if (updates.description !== undefined) galleryItem.description = updates.description;
    if (updates.category) galleryItem.category = updates.category;
    if (updates.tags) {
      galleryItem.tags = updates.tags.split(',').map(tag => tag.trim().toLowerCase());
    }
    if (updates.album) galleryItem.album = updates.album;
    if (updates.featured !== undefined) galleryItem.featured = updates.featured === 'true';
    if (updates.displayOrder !== undefined) galleryItem.displayOrder = parseInt(updates.displayOrder);
    if (updates.isPublished !== undefined) galleryItem.isPublished = updates.isPublished === 'true';

    await galleryItem.save();

    res.json({
      success: true,
      message: 'Gallery item updated successfully',
      data: galleryItem
    });
  } catch (error) {
    console.error('Update Gallery Item Error:', error);
    
    // Clean up uploaded file if error occurred
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update gallery item'
    });
  }
};

// @desc    Delete gallery item
// @route   DELETE /api/gallery/:id
// @access  Private (Admin)
exports.deleteGalleryItem = async (req, res) => {
  try {
    const { id } = req.params;

    const galleryItem = await Gallery.findById(id);
    if (!galleryItem) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    // Delete image file
    if (galleryItem.imageUrl) {
      if (galleryItem.imageUrl.startsWith('http')) {
        // Cloudinary image - extract public ID and delete
        const publicId = galleryItem.imageUrl.split('/').pop().split('.')[0];
        await cloudinary.deleteImage(`nursing_institute/gallery/${publicId}`);
      } else {
        // Local file
        const filePath = path.join(__dirname, '..', galleryItem.imageUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    // Delete from database
    await galleryItem.deleteOne();

    res.json({
      success: true,
      message: 'Gallery item deleted successfully'
    });
  } catch (error) {
    console.error('Delete Gallery Item Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete gallery item'
    });
  }
};

// @desc    Like gallery item
// @route   POST /api/gallery/:id/like
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
    const alreadyLiked = galleryItem.likes.some(
      like => like.toString() === userId.toString()
    );

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
// @route   POST /api/gallery/:id/comments
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
    await galleryItem.populate({
      path: 'comments.user',
      select: 'username'
    });

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

// @desc    Get gallery albums
// @route   GET /api/gallery/albums
// @access  Public
exports.getGalleryAlbums = async (req, res) => {
  try {
    const albums = await Gallery.aggregate([
      {
        $match: { isPublished: true }
      },
      {
        $group: {
          _id: '$album',
          count: { $sum: 1 },
          featuredImage: { $first: '$imageUrl' },
          lastUpdated: { $max: '$createdAt' }
        }
      },
      {
        $sort: { lastUpdated: -1 }
      }
    ]);

    // Format response
    const formattedAlbums = albums.map(album => ({
      name: album._id,
      count: album.count,
      featuredImage: album.featuredImage,
      lastUpdated: album.lastUpdated
    }));

    res.json({
      success: true,
      data: formattedAlbums
    });
  } catch (error) {
    console.error('Get Gallery Albums Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gallery albums'
    });
  }
};

// @desc    Get gallery by album
// @route   GET /api/gallery/album/:album
// @access  Public
exports.getGalleryByAlbum = async (req, res) => {
  try {
    const { album } = req.params;
    const { page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [gallery, total] = await Promise.all([
      Gallery.find({
        album: album,
        isPublished: true
      })
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('title imageUrl thumbnailUrl category tags views likesCount commentsCount'),
      Gallery.countDocuments({
        album: album,
        isPublished: true
      })
    ]);

    // Get album info
    const albumInfo = {
      name: album,
      totalItems: total,
      featuredItems: gallery.filter(item => item.featured).length
    };

    res.json({
      success: true,
      data: {
        albumInfo,
        gallery,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get Gallery By Album Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gallery by album'
    });
  }
};

// @desc    Get gallery by category
// @route   GET /api/gallery/category/:category
// @access  Public
exports.getGalleryByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [gallery, total] = await Promise.all([
      Gallery.find({
        category: category,
        isPublished: true
      })
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('title imageUrl thumbnailUrl album tags views likesCount commentsCount'),
      Gallery.countDocuments({
        category: category,
        isPublished: true
      })
    ]);

    // Get category stats
    const categoryStats = {
      name: category,
      totalItems: total,
      totalViews: gallery.reduce((sum, item) => sum + item.views, 0),
      totalLikes: gallery.reduce((sum, item) => sum + item.likes.length, 0)
    };

    res.json({
      success: true,
      data: {
        categoryStats,
        gallery,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get Gallery By Category Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gallery by category'
    });
  }
};

// @desc    Get featured gallery items
// @route   GET /api/gallery/featured
// @access  Public
exports.getFeaturedGallery = async (req, res) => {
  try {
    const gallery = await Gallery.find({
      isPublished: true,
      featured: true
    })
    .sort({ displayOrder: 1, createdAt: -1 })
    .limit(8)
    .select('title imageUrl thumbnailUrl category album');

    res.json({
      success: true,
      data: gallery
    });
  } catch (error) {
    console.error('Get Featured Gallery Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured gallery'
    });
  }
};

// @desc    Get gallery statistics
// @route   GET /api/gallery/stats
// @access  Private (Admin)
exports.getGalleryStats = async (req, res) => {
  try {
    // Overall statistics
    const overallStats = await Gallery.aggregate([
      {
        $group: {
          _id: null,
          totalItems: { $sum: 1 },
          publishedItems: { $sum: { $cond: ['$isPublished', 1, 0] } },
          featuredItems: { $sum: { $cond: ['$featured', 1, 0] } },
          totalViews: { $sum: '$views' },
          totalLikes: { $sum: { $size: '$likes' } },
          totalComments: { $sum: { $size: '$comments' } }
        }
      }
    ]);

    // Category-wise statistics
    const categoryStats = await Gallery.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          views: { $sum: '$views' },
          likes: { $sum: { $size: '$likes' } },
          comments: { $sum: { $size: '$comments' } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Album-wise statistics
    const albumStats = await Gallery.aggregate([
      {
        $group: {
          _id: '$album',
          count: { $sum: 1 },
          lastUpdated: { $max: '$createdAt' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Monthly upload trends
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyStats = await Gallery.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          uploads: { $sum: 1 },
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

    // Most viewed items
    const mostViewed = await Gallery.find()
      .sort({ views: -1 })
      .limit(10)
      .select('title category views likesCount commentsCount');

    res.json({
      success: true,
      data: {
        overall: overallStats[0] || {
          totalItems: 0,
          publishedItems: 0,
          featuredItems: 0,
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0
        },
        categoryStats,
        albumStats,
        monthlyStats,
        mostViewed
      }
    });
  } catch (error) {
    console.error('Get Gallery Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gallery statistics'
    });
  }
};

// @desc    Search gallery
// @route   GET /api/gallery/search
// @access  Public
exports.searchGallery = async (req, res) => {
  try {
    const { q, category, album } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const query = {
      isPublished: true,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ]
    };

    if (category) {
      query.category = category;
    }

    if (album) {
      query.album = album;
    }

    const gallery = await Gallery.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .select('title imageUrl thumbnailUrl category album tags');

    res.json({
      success: true,
      count: gallery.length,
      data: gallery
    });
  } catch (error) {
    console.error('Search Gallery Error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};