const Placement = require('../models/Placement');
const Student = require('../models/Student');
const Company = require('../models/Company');

// @desc    Get all placements
// @route   GET /api/placements
// @access  Public
exports.getAllPlacements = async (req, res) => {
  try {
    const { year, company, status, search } = req.query;
    
    const query = {};
    
    if (year) {
      query.year = parseInt(year);
    }
    
    if (company) {
      query.company = company;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { jobTitle: { $regex: search, $options: 'i' } },
        { 'company.name': { $regex: search, $options: 'i' } },
        { 'student.fullName': { $regex: search, $options: 'i' } }
      ];
    }

    const placements = await Placement.find(query)
      .populate('student', 'fullName studentId courseEnrolled')
      .populate('company', 'name logo industry')
      .sort({ placedDate: -1 })
      .select('-__v');

    // Get placement statistics
    const stats = {
      total: placements.length,
      placed: placements.filter(p => p.status === 'Placed').length,
      internship: placements.filter(p => p.status === 'Internship').length,
      pending: placements.filter(p => p.status === 'Pending').length,
      averagePackage: calculateAveragePackage(placements)
    };

    // Get unique years and companies for filters
    const years = await Placement.distinct('year').sort((a, b) => b - a);
    const companies = await Company.find().select('name').sort('name');

    res.json({
      success: true,
      data: {
        placements,
        stats,
        filters: {
          years,
          companies: companies.map(c => ({ value: c._id, label: c.name }))
        },
        count: placements.length
      }
    });
  } catch (error) {
    console.error('Get All Placements Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch placements'
    });
  }
};

// Helper function to calculate average package
const calculateAveragePackage = (placements) => {
  const placedPlacements = placements.filter(p => 
    p.status === 'Placed' && p.package && p.package.annualSalary
  );
  
  if (placedPlacements.length === 0) return 0;
  
  const total = placedPlacements.reduce(
    (sum, p) => sum + p.package.annualSalary, 
    0
  );
  
  return Math.round(total / placedPlacements.length);
};

// @desc    Get single placement
// @route   GET /api/placements/:id
// @access  Public
exports.getPlacement = async (req, res) => {
  try {
    const placement = await Placement.findById(req.params.id)
      .populate('student')
      .populate('company')
      .populate('coordinator', 'fullName designation department')
      .select('-__v');

    if (!placement) {
      return res.status(404).json({
        success: false,
        message: 'Placement record not found'
      });
    }

    // Get similar placements
    const similarPlacements = await Placement.find({
      _id: { $ne: placement._id },
      company: placement.company,
      status: 'Placed'
    })
    .populate('student', 'fullName studentId')
    .limit(4)
    .select('jobTitle package placedDate');

    res.json({
      success: true,
      data: {
        placement,
        similarPlacements
      }
    });
  } catch (error) {
    console.error('Get Placement Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch placement'
    });
  }
};

// @desc    Create placement record
// @route   POST /api/placements
// @access  Private (Admin/Placement Coordinator)
exports.createPlacement = async (req, res) => {
  try {
    const placementData = req.body;

    // Validate required fields
    if (!placementData.student || !placementData.company) {
      return res.status(400).json({
        success: false,
        message: 'Student and company are required'
      });
    }

    // Check if student already has a placement for this company
    const existingPlacement = await Placement.findOne({
      student: placementData.student,
      company: placementData.company,
      status: { $in: ['Placed', 'Internship'] }
    });

    if (existingPlacement) {
      return res.status(400).json({
        success: false,
        message: 'Student already has a placement/internship with this company'
      });
    }

    // Set coordinator if not provided
    if (!placementData.coordinator) {
      placementData.coordinator = req.user._id;
    }

    // Set year if not provided
    if (!placementData.year) {
      const currentYear = new Date().getFullYear();
      placementData.year = currentYear;
    }

    const placement = new Placement(placementData);
    await placement.save();

    // Update student's placement status
    await Student.findByIdAndUpdate(placementData.student, {
      placementStatus: placementData.status,
      placedCompany: placementData.company,
      placementDate: placementData.placedDate || new Date()
    });

    // Populate references
    await placement.populate('student', 'fullName studentId');
    await placement.populate('company', 'name logo');
    await placement.populate('coordinator', 'fullName');

    res.status(201).json({
      success: true,
      message: 'Placement record created successfully',
      data: placement
    });
  } catch (error) {
    console.error('Create Placement Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create placement record'
    });
  }
};

// @desc    Update placement record
// @route   PUT /api/placements/:id
// @access  Private (Admin/Placement Coordinator)
exports.updatePlacement = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const placement = await Placement.findById(id);
    if (!placement) {
      return res.status(404).json({
        success: false,
        message: 'Placement record not found'
      });
    }

    // Update placement
    Object.keys(updates).forEach(key => {
      if (key !== '_id' && key !== 'createdAt' && key !== 'updatedAt') {
        placement[key] = updates[key];
      }
    });

    await placement.save();

    // Update student's placement status if changed
    if (updates.status) {
      await Student.findByIdAndUpdate(placement.student, {
        placementStatus: updates.status,
        placedCompany: placement.company,
        placementDate: placement.placedDate || new Date()
      });
    }

    res.json({
      success: true,
      message: 'Placement record updated successfully',
      data: placement
    });
  } catch (error) {
    console.error('Update Placement Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update placement record'
    });
  }
};

// @desc    Delete placement record
// @route   DELETE /api/placements/:id
// @access  Private (Admin)
exports.deletePlacement = async (req, res) => {
  try {
    const { id } = req.params;

    const placement = await Placement.findById(id);
    if (!placement) {
      return res.status(404).json({
        success: false,
        message: 'Placement record not found'
      });
    }

    // Remove placement reference from student
    await Student.findByIdAndUpdate(placement.student, {
      $unset: {
        placementStatus: '',
        placedCompany: '',
        placementDate: ''
      }
    });

    await placement.deleteOne();

    res.json({
      success: true,
      message: 'Placement record deleted successfully'
    });
  } catch (error) {
    console.error('Delete Placement Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete placement record'
    });
  }
};

// @desc    Get placement statistics
// @route   GET /api/placements/stats
// @access  Public
exports.getPlacementStats = async (req, res) => {
  try {
    // Overall placement statistics
    const overallStats = await Placement.aggregate([
      {
        $group: {
          _id: null,
          totalPlacements: { $sum: 1 },
          totalPlaced: {
            $sum: { $cond: [{ $eq: ['$status', 'Placed'] }, 1, 0] }
          },
          totalInternships: {
            $sum: { $cond: [{ $eq: ['$status', 'Internship'] }, 1, 0] }
          },
          totalPending: {
            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] }
          },
          avgPackage: { $avg: '$package.annualSalary' },
          highestPackage: { $max: '$package.annualSalary' }
        }
      }
    ]);

    // Year-wise statistics
    const yearlyStats = await Placement.aggregate([
      {
        $group: {
          _id: '$year',
          placements: { $sum: 1 },
          placed: {
            $sum: { $cond: [{ $eq: ['$status', 'Placed'] }, 1, 0] }
          },
          internships: {
            $sum: { $cond: [{ $eq: ['$status', 'Internship'] }, 1, 0] }
          },
          avgPackage: { $avg: '$package.annualSalary' }
        }
      },
      {
        $sort: { _id: -1 }
      },
      {
        $limit: 5
      }
    ]);

    // Company-wise statistics
    const companyStats = await Placement.aggregate([
      {
        $lookup: {
          from: 'companies',
          localField: 'company',
          foreignField: '_id',
          as: 'companyInfo'
        }
      },
      {
        $unwind: '$companyInfo'
      },
      {
        $group: {
          _id: '$company',
          companyName: { $first: '$companyInfo.name' },
          placements: { $sum: 1 },
          avgPackage: { $avg: '$package.annualSalary' }
        }
      },
      {
        $sort: { placements: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Course-wise placement statistics
    const courseStats = await Placement.aggregate([
      {
        $lookup: {
          from: 'students',
          localField: 'student',
          foreignField: '_id',
          as: 'studentInfo'
        }
      },
      {
        $unwind: '$studentInfo'
      },
      {
        $lookup: {
          from: 'courses',
          localField: 'studentInfo.courseEnrolled',
          foreignField: '_id',
          as: 'courseInfo'
        }
      },
      {
        $unwind: '$courseInfo'
      },
      {
        $group: {
          _id: '$studentInfo.courseEnrolled',
          courseName: { $first: '$courseInfo.courseName' },
          placements: { $sum: 1 },
          placed: {
            $sum: { $cond: [{ $eq: ['$status', 'Placed'] }, 1, 0] }
          },
          avgPackage: { $avg: '$package.annualSalary' }
        }
      },
      {
        $sort: { placements: -1 }
      }
    ]);

    // Placement trend (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const monthlyTrend = await Placement.aggregate([
      {
        $match: {
          placedDate: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$placedDate' },
            month: { $month: '$placedDate' }
          },
          placements: { $sum: 1 },
          placed: {
            $sum: { $cond: [{ $eq: ['$status', 'Placed'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        overall: overallStats[0] || {
          totalPlacements: 0,
          totalPlaced: 0,
          totalInternships: 0,
          totalPending: 0,
          avgPackage: 0,
          highestPackage: 0
        },
        yearlyStats,
        companyStats,
        courseStats,
        monthlyTrend
      }
    });
  } catch (error) {
    console.error('Get Placement Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch placement statistics'
    });
  }
};

// @desc    Get student placements
// @route   GET /api/placements/student/:studentId
// @access  Private (Student/Admin)
exports.getStudentPlacements = async (req, res) => {
  try {
    const { studentId } = req.params;

    const placements = await Placement.find({ student: studentId })
      .populate('company', 'name logo industry location')
      .populate('coordinator', 'fullName designation')
      .sort({ placedDate: -1 })
      .select('-__v');

    // Get student info
    const student = await Student.findById(studentId)
      .populate('courseEnrolled', 'courseName');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Check if requesting user is the student or admin
    if (req.user.role !== 'admin' && 
        req.user.role !== 'faculty' &&
        (!student.userId || student.userId.toString() !== req.user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: {
        student: {
          name: student.fullName,
          studentId: student.studentId,
          course: student.courseEnrolled,
          batchYear: student.batchYear
        },
        placements,
        count: placements.length
      }
    });
  } catch (error) {
    console.error('Get Student Placements Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student placements'
    });
  }
};

// @desc    Get company placements
// @route   GET /api/placements/company/:companyId
// @access  Public
exports.getCompanyPlacements = async (req, res) => {
  try {
    const { companyId } = req.params;

    const placements = await Placement.find({ company: companyId })
      .populate('student', 'fullName studentId courseEnrolled')
      .populate('company', 'name logo industry')
      .sort({ placedDate: -1 })
      .select('-__v');

    if (placements.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No placements found for this company'
      });
    }

    // Get company info
    const company = await Company.findById(companyId);
    
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Calculate company statistics
    const companyStats = {
      totalPlacements: placements.length,
      totalPlaced: placements.filter(p => p.status === 'Placed').length,
      totalInternships: placements.filter(p => p.status === 'Internship').length,
      averagePackage: calculateAveragePackage(placements),
      firstPlacement: placements[placements.length - 1]?.placedDate,
      latestPlacement: placements[0]?.placedDate
    };

    // Get unique years
    const years = [...new Set(placements.map(p => p.year))].sort((a, b) => b - a);

    res.json({
      success: true,
      data: {
        company: {
          name: company.name,
          logo: company.logo,
          industry: company.industry,
          description: company.description
        },
        companyStats,
        placements,
        years,
        count: placements.length
      }
    });
  } catch (error) {
    console.error('Get Company Placements Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch company placements'
    });
  }
};

// @desc    Get placement by year
// @route   GET /api/placements/year/:year
// @access  Public
exports.getPlacementsByYear = async (req, res) => {
  try {
    const { year } = req.params;
    const yearInt = parseInt(year);

    if (isNaN(yearInt)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid year'
      });
    }

    const placements = await Placement.find({ year: yearInt })
      .populate('student', 'fullName studentId courseEnrolled')
      .populate('company', 'name logo industry')
      .sort({ placedDate: -1 })
      .select('-__v');

    // Calculate year statistics
    const yearStats = {
      totalPlacements: placements.length,
      totalPlaced: placements.filter(p => p.status === 'Placed').length,
      totalInternships: placements.filter(p => p.status === 'Internship').length,
      averagePackage: calculateAveragePackage(placements),
      highestPackage: Math.max(
        ...placements
          .filter(p => p.package && p.package.annualSalary)
          .map(p => p.package.annualSalary),
        0
      )
    };

    // Get top companies for the year
    const companyStats = await Placement.aggregate([
      {
        $match: { year: yearInt }
      },
      {
        $lookup: {
          from: 'companies',
          localField: 'company',
          foreignField: '_id',
          as: 'companyInfo'
        }
      },
      {
        $unwind: '$companyInfo'
      },
      {
        $group: {
          _id: '$company',
          companyName: { $first: '$companyInfo.name' },
          placements: { $sum: 1 },
          avgPackage: { $avg: '$package.annualSalary' }
        }
      },
      {
        $sort: { placements: -1 }
      },
      {
        $limit: 5
      }
    ]);

    res.json({
      success: true,
      data: {
        year: yearInt,
        yearStats,
        placements,
        topCompanies: companyStats,
        count: placements.length
      }
    });
  } catch (error) {
    console.error('Get Placements By Year Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch placements by year'
    });
  }
};

// @desc    Search placements
// @route   GET /api/placements/search
// @access  Public
exports.searchPlacements = async (req, res) => {
  try {
    const { q, year, status } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const query = {
      $or: [
        { jobTitle: { $regex: q, $options: 'i' } },
        { 'student.fullName': { $regex: q, $options: 'i' } },
        { 'company.name': { $regex: q, $options: 'i' } }
      ]
    };

    if (year) {
      query.year = parseInt(year);
    }

    if (status) {
      query.status = status;
    }

    const placements = await Placement.find(query)
      .populate('student', 'fullName studentId')
      .populate('company', 'name logo')
      .sort({ placedDate: -1 })
      .limit(20)
      .select('jobTitle company student package placedDate status');

    res.json({
      success: true,
      count: placements.length,
      data: placements
    });
  } catch (error) {
    console.error('Search Placements Error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};