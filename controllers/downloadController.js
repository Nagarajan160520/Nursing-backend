const Download = require('../models/Download');
const Student = require('../models/Student');
const path = require('path');
const fs = require('fs');

// @desc    Get all downloads
// @route   GET /api/downloads
// @access  Public/Private
exports.getAllDownloads = async (req, res) => {
  try {
    const { category, academicYear, semester, search } = req.query;
    
    const query = { isActive: true };
    
    if (category) {
      query.category = category;
    }
    
    if (academicYear) {
      query.academicYear = academicYear;
    }
    
    if (semester) {
      query.semester = parseInt(semester);
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // If user is logged in, show all downloads
    // If not logged in, only show downloads that don't require login
    if (!req.user) {
      query.requiresLogin = false;
    }

    const downloads = await Download.find(query)
      .sort({ uploadedAt: -1 })
      .populate('uploadedBy', 'username')
      .select('-__v');

    // Get categories for filter
    const categories = await Download.distinct('category', { isActive: true });
    const academicYears = await Download.distinct('academicYear', { isActive: true });
    const semesters = await Download.distinct('semester', { isActive: true }).sort();

    res.json({
      success: true,
      data: {
        downloads,
        filters: {
          categories,
          academicYears,
          semesters
        },
        count: downloads.length
      }
    });
  } catch (error) {
    console.error('Get All Downloads Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch downloads'
    });
  }
};

// @desc    Get download by ID
// @route   GET /api/downloads/:id
// @access  Public/Private
exports.getDownload = async (req, res) => {
  try {
    const download = await Download.findById(req.params.id)
      .populate('uploadedBy', 'username')
      .select('-__v');

    if (!download || !download.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Download not found'
      });
    }

    // Check if download requires login and user is not logged in
    if (download.requiresLogin && !req.user) {
      return res.status(401).json({
        success: false,
        message: 'Login required to access this download'
      });
    }

    // Check if download is expired
    if (download.expiryDate && new Date() > download.expiryDate) {
      return res.status(410).json({
        success: false,
        message: 'This download has expired'
      });
    }

    // Check user access based on target audience
    if (req.user) {
      const hasAccess = await checkDownloadAccess(download, req.user);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access this download'
        });
      }
    }

    // Increment download count
    await download.incrementDownloadCount();

    res.json({
      success: true,
      data: download
    });
  } catch (error) {
    console.error('Get Download Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch download'
    });
  }
};

// Helper function to check download access
const checkDownloadAccess = async (download, user) => {
  try {
    // If target audience is 'all', everyone has access
    if (download.targetAudience.includes('all')) {
      return true;
    }

    // Check based on user role
    if (download.targetAudience.includes(user.role)) {
      return true;
    }

    // For students, check specific targets
    if (user.role === 'student') {
      const student = await Student.findOne({ userId: user._id });
      
      if (!student) return false;

      // Check course-specific access
      if (download.targetAudience.includes('specific_course') &&
          download.specificTargets?.courses?.includes(student.courseEnrolled.toString())) {
        return true;
      }

      // Check year-specific access
      if (download.targetAudience.includes('specific_year') &&
          download.specificTargets?.years?.includes(student.batchYear)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Check Download Access Error:', error);
    return false;
  }
};

// @desc    Download file
// @route   GET /api/downloads/:id/file
// @access  Public/Private
exports.downloadFile = async (req, res) => {
  try {
    const download = await Download.findById(req.params.id);

    if (!download || !download.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Download not found'
      });
    }

    // Check access permissions
    if (download.requiresLogin && !req.user) {
      return res.status(401).json({
        success: false,
        message: 'Login required to download this file'
      });
    }

    if (req.user) {
      const hasAccess = await checkDownloadAccess(download, req.user);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to download this file'
        });
      }
    }

    // Check if file exists
    const filePath = path.join(__dirname, '..', download.fileUrl);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    // Increment download count
    await download.incrementDownloadCount();

    // Send file
    res.download(filePath, download.fileName, (err) => {
      if (err) {
        console.error('File Download Error:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Failed to download file'
          });
        }
      }
    });
  } catch (error) {
    console.error('Download File Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download file'
    });
  }
};

// @desc    Get download categories
// @route   GET /api/downloads/categories
// @access  Public
exports.getDownloadCategories = async (req, res) => {
  try {
    const categories = await Download.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalDownloads: { $sum: '$downloadCount' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Get Download Categories Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch download categories'
    });
  }
};

// @desc    Get recent downloads
// @route   GET /api/downloads/recent
// @access  Public
exports.getRecentDownloads = async (req, res) => {
  try {
    const query = { isActive: true };
    
    if (!req.user) {
      query.requiresLogin = false;
    }

    const downloads = await Download.find(query)
      .sort({ uploadedAt: -1 })
      .limit(10)
      .select('title category fileType fileSize uploadedAt downloadCount');

    res.json({
      success: true,
      data: downloads
    });
  } catch (error) {
    console.error('Get Recent Downloads Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent downloads'
    });
  }
};

// @desc    Get popular downloads
// @route   GET /api/downloads/popular
// @access  Public
exports.getPopularDownloads = async (req, res) => {
  try {
    const query = { isActive: true };
    
    if (!req.user) {
      query.requiresLogin = false;
    }

    const downloads = await Download.find(query)
      .sort({ downloadCount: -1 })
      .limit(10)
      .select('title category fileType fileSize uploadedAt downloadCount');

    res.json({
      success: true,
      data: downloads
    });
  } catch (error) {
    console.error('Get Popular Downloads Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch popular downloads'
    });
  }
};

// @desc    Get downloads by category
// @route   GET /api/downloads/category/:category
// @access  Public
exports.getDownloadsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { academicYear, semester } = req.query;
    
    const query = { 
      category: category,
      isActive: true 
    };
    
    if (academicYear) {
      query.academicYear = academicYear;
    }
    
    if (semester) {
      query.semester = parseInt(semester);
    }
    
    if (!req.user) {
      query.requiresLogin = false;
    }

    const downloads = await Download.find(query)
      .sort({ uploadedAt: -1 })
      .populate('uploadedBy', 'username')
      .select('-__v');

    // Get available filters for this category
    const academicYears = await Download.distinct('academicYear', { 
      category: category,
      isActive: true 
    });
    
    const semesters = await Download.distinct('semester', { 
      category: category,
      isActive: true 
    }).sort();

    res.json({
      success: true,
      data: {
        downloads,
        filters: {
          academicYears,
          semesters
        },
        count: downloads.length
      }
    });
  } catch (error) {
    console.error('Get Downloads By Category Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch downloads by category'
    });
  }
};

// @desc    Get downloads statistics
// @route   GET /api/downloads/stats
// @access  Private (Admin)
exports.getDownloadStats = async (req, res) => {
  try {
    // Overall statistics
    const overallStats = await Download.aggregate([
      {
        $group: {
          _id: null,
          totalFiles: { $sum: 1 },
          totalSize: { $sum: '$fileSize' },
          totalDownloads: { $sum: '$downloadCount' },
          activeFiles: {
            $sum: { $cond: ['$isActive', 1, 0] }
          }
        }
      }
    ]);

    // Category-wise statistics
    const categoryStats = await Download.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalDownloads: { $sum: '$downloadCount' },
          totalSize: { $sum: '$fileSize' }
        }
      },
      {
        $sort: { totalDownloads: -1 }
      }
    ]);

    // Monthly download trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyStats = await Download.aggregate([
      {
        $match: {
          uploadedAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$uploadedAt' },
            month: { $month: '$uploadedAt' }
          },
          filesAdded: { $sum: 1 },
          downloads: { $sum: '$downloadCount' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      },
      {
        $limit: 6
      }
    ]);

    // Most downloaded files
    const mostDownloaded = await Download.find()
      .sort({ downloadCount: -1 })
      .limit(10)
      .select('title category fileType downloadCount uploadedAt');

    res.json({
      success: true,
      data: {
        overall: overallStats[0] || {
          totalFiles: 0,
          totalSize: 0,
          totalDownloads: 0,
          activeFiles: 0
        },
        categoryStats,
        monthlyStats,
        mostDownloaded
      }
    });
  } catch (error) {
    console.error('Get Download Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch download statistics'
    });
  }
};

// @desc    Search downloads
// @route   GET /api/downloads/search
// @access  Public
exports.searchDownloads = async (req, res) => {
  try {
    const { q, category } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const query = {
      isActive: true,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { subject: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ]
    };

    if (category) {
      query.category = category;
    }

    if (!req.user) {
      query.requiresLogin = false;
    }

    const downloads = await Download.find(query)
      .sort({ uploadedAt: -1 })
      .limit(20)
      .select('title category fileType fileSize uploadedAt downloadCount');

    res.json({
      success: true,
      count: downloads.length,
      data: downloads
    });
  } catch (error) {
    console.error('Search Downloads Error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};