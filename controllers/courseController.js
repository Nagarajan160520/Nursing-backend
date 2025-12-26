const Course = require('../models/Course');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');

// @desc    Get all courses (public)
// @route   GET /api/courses
// @access  Public
exports.getAllCourses = async (req, res) => {
  try {
    const { status, search, duration } = req.query;
    
    const query = { isActive: true };
    
    if (status) {
      query.isActive = status === 'active';
    }
    
    if (search) {
      query.$or = [
        { courseCode: { $regex: search, $options: 'i' } },
        { courseName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (duration) {
      query.duration = duration;
    }

    const courses = await Course.find(query)
      .select('-createdBy -approvalStatus -__v')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: courses.length,
      data: courses
    });
  } catch (error) {
    console.error('Get All Courses Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch courses'
    });
  }
};

// @desc    Get single course
// @route   GET /api/courses/:id
// @access  Public
exports.getCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('subjects.faculty', 'fullName designation department')
      .select('-createdBy -approvalStatus -__v');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Get number of enrolled students
    const enrolledStudents = await Student.countDocuments({
      courseEnrolled: course._id,
      academicStatus: 'Active'
    });

    // Get faculty teaching this course
    const facultyIds = course.subjects.map(subject => subject.faculty).filter(Boolean);
    const faculty = await Faculty.find({ _id: { $in: facultyIds } })
      .select('fullName designation department qualification profileImage');

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
        stats: {
          enrolledStudents,
          availableSeats: course.seatsAvailable - enrolledStudents,
          seatsFilled: enrolledStudents,
          seatsPercentage: (enrolledStudents / course.seatsAvailable) * 100
        },
        faculty,
        relatedCourses
      }
    });
  } catch (error) {
    console.error('Get Course Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch course'
    });
  }
};

// @desc    Get course syllabus
// @route   GET /api/courses/:id/syllabus
// @access  Public
exports.getCourseSyllabus = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .select('syllabus subjects semester');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Organize subjects by semester
    const semesterWiseSubjects = {};
    course.subjects.forEach(subject => {
      const semester = subject.semester || 1;
      if (!semesterWiseSubjects[semester]) {
        semesterWiseSubjects[semester] = [];
      }
      semesterWiseSubjects[semester].push(subject);
    });

    res.json({
      success: true,
      data: {
        syllabus: course.syllabus,
        semesterWiseSubjects,
        totalSemesters: course.duration.includes('Year') ? 
          parseInt(course.duration) * 2 : 
          parseInt(course.duration.split(' ')[0]) || 1
      }
    });
  } catch (error) {
    console.error('Get Course Syllabus Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch course syllabus'
    });
  }
};

// @desc    Get course eligibility
// @route   GET /api/courses/:id/eligibility
// @access  Public
exports.getCourseEligibility = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .select('eligibility duration seatsAvailable feesStructure');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    res.json({
      success: true,
      data: {
        eligibility: course.eligibility,
        duration: course.duration,
        seatsAvailable: course.seatsAvailable,
        fees: course.feesStructure,
        admissionProcess: [
          'Fill online application form',
          'Submit required documents',
          'Appear for entrance test (if applicable)',
          'Attend counseling session',
          'Complete admission formalities',
          'Pay admission fees'
        ]
      }
    });
  } catch (error) {
    console.error('Get Course Eligibility Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch course eligibility'
    });
  }
};

// @desc    Get course career opportunities
// @route   GET /api/courses/:id/careers
// @access  Public
exports.getCourseCareers = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .select('careerOpportunities courseName duration');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Additional career information
    const additionalInfo = {
      placementAssistance: [
        'Hospital tie-ups for placements',
        'Campus recruitment drives',
        'Internship opportunities',
        'Career counseling sessions',
        'Resume building workshops',
        'Interview preparation'
      ],
      furtherStudies: [
        'Higher studies in nursing specialization',
        'Post graduate diploma courses',
        'Research opportunities',
        'Teaching positions',
        'Administrative roles'
      ],
      averagePackage: {
        fresher: '₹2.5 - ₹4 LPA',
        experienced: '₹5 - ₹8 LPA',
        abroad: '$40,000 - $70,000'
      }
    };

    res.json({
      success: true,
      data: {
        courseName: course.courseName,
        duration: course.duration,
        careerOpportunities: course.careerOpportunities,
        additionalInfo
      }
    });
  } catch (error) {
    console.error('Get Course Careers Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch career opportunities'
    });
  }
};

// @desc    Get course clinical training details
// @route   GET /api/courses/:id/clinical
// @access  Public
exports.getCourseClinical = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .select('clinicalTraining courseName');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Default clinical training if not specified
    const clinicalTraining = course.clinicalTraining || {
      description: 'Comprehensive clinical training program covering various specialties',
      hospitals: [
        {
          name: 'City General Hospital',
          address: '123 Medical Street, City',
          contact: '0422-1234567',
          duration: '6 months'
        },
        {
          name: 'State Medical College',
          address: '456 Health Avenue, City',
          contact: '0422-7654321',
          duration: '4 months'
        }
      ],
      totalHours: 1200,
      requirements: [
        'White uniform with institute ID',
        'Clinical record book',
        'Stethoscope',
        'BP apparatus',
        'Nursing kit'
      ]
    };

    res.json({
      success: true,
      data: {
        courseName: course.courseName,
        clinicalTraining
      }
    });
  } catch (error) {
    console.error('Get Course Clinical Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clinical training details'
    });
  }
};

// @desc    Search courses
// @route   GET /api/courses/search
// @access  Public
exports.searchCourses = async (req, res) => {
  try {
    const { q, duration, eligibility } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const query = {
      isActive: true,
      $or: [
        { courseCode: { $regex: q, $options: 'i' } },
        { courseName: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { 'subjects.subjectName': { $regex: q, $options: 'i' } }
      ]
    };

    if (duration) {
      query.duration = duration;
    }

    if (eligibility) {
      query.eligibility = { $regex: eligibility, $options: 'i' };
    }

    const courses = await Course.find(query)
      .select('courseCode courseName description duration seatsAvailable')
      .limit(20)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: courses.length,
      data: courses
    });
  } catch (error) {
    console.error('Search Courses Error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};

// @desc    Get featured courses
// @route   GET /api/courses/featured
// @access  Public
exports.getFeaturedCourses = async (req, res) => {
  try {
    const courses = await Course.find({
      isActive: true,
      seatsAvailable: { $gt: 0 }
    })
    .select('courseCode courseName description duration seatsAvailable careerOpportunities')
    .sort({ seatsAvailable: 1 })
    .limit(6);

    res.json({
      success: true,
      data: courses
    });
  } catch (error) {
    console.error('Get Featured Courses Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured courses'
    });
  }
};

// @desc    Get course statistics
// @route   GET /api/courses/stats
// @access  Private (Admin)
exports.getCourseStats = async (req, res) => {
  try {
    const stats = await Course.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: null,
          totalCourses: { $sum: 1 },
          totalSeats: { $sum: '$seatsAvailable' },
          totalFilled: { $sum: '$seatsFilled' },
          averageDuration: { $avg: {
            $cond: [
              { $regexMatch: { input: '$duration', regex: 'Year' } },
              { $multiply: [
                { $toInt: { $arrayElemAt: [{ $split: ['$duration', ' '] }, 0] } },
                12
              ]},
              { $toInt: { $arrayElemAt: [{ $split: ['$duration', ' '] }, 0] } }
            ]
          }}
        }
      }
    ]);

    // Course-wise distribution
    const courseDistribution = await Course.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: '$duration',
          count: { $sum: 1 },
          seats: { $sum: '$seatsAvailable' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Popular courses based on enrollment
    const popularCourses = await Course.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $lookup: {
          from: 'students',
          localField: '_id',
          foreignField: 'courseEnrolled',
          as: 'enrolledStudents'
        }
      },
      {
        $project: {
          courseCode: 1,
          courseName: 1,
          duration: 1,
          enrolledCount: { $size: '$enrolledStudents' },
          seatsAvailable: 1,
          fillPercentage: {
            $multiply: [
              { $divide: [
                { $size: '$enrolledStudents' },
                '$seatsAvailable'
              ]},
              100
            ]
          }
        }
      },
      {
        $sort: { enrolledCount: -1 }
      },
      {
        $limit: 5
      }
    ]);

    res.json({
      success: true,
      data: {
        overall: stats[0] || {
          totalCourses: 0,
          totalSeats: 0,
          totalFilled: 0,
          averageDuration: 0
        },
        distribution: courseDistribution,
        popularCourses
      }
    });
  } catch (error) {
    console.error('Get Course Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch course statistics'
    });
  }
};