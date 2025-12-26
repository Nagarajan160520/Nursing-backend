const Faculty = require('../models/Faculty');
const User = require('../models/User');
const Course = require('../models/Course');

// @desc    Get all faculty
// @route   GET /api/faculty
// @access  Public
exports.getAllFaculty = async (req, res) => {
  try {
    const { department, designation, search } = req.query;
    
    const query = { isActive: true };
    
    if (department) {
      query.department = department;
    }
    
    if (designation) {
      query.designation = designation;
    }
    
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { qualification: { $elemMatch: { degree: { $regex: search, $options: 'i' } } } },
        { department: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } }
      ];
    }

    const faculty = await Faculty.find(query)
      .sort({ experience: -1 })
      .select('-__v -userId -isActive');

    // Get departments and designations for filters
    const departments = await Faculty.distinct('department', { isActive: true });
    const designations = await Faculty.distinct('designation', { isActive: true });

    res.json({
      success: true,
      data: {
        faculty,
        filters: {
          departments,
          designations
        },
        count: faculty.length
      }
    });
  } catch (error) {
    console.error('Get All Faculty Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty'
    });
  }
};

// @desc    Get single faculty
// @route   GET /api/faculty/:id
// @access  Public
exports.getFaculty = async (req, res) => {
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
    const courses = await Course.find({
      'subjects.faculty': faculty._id,
      isActive: true
    })
    .select('courseName courseCode subjects semester')
    .populate('subjects.faculty', 'fullName');

    // Filter only subjects taught by this faculty
    const subjectsTaught = [];
    courses.forEach(course => {
      course.subjects.forEach(subject => {
        if (subject.faculty && subject.faculty._id.toString() === faculty._id.toString()) {
          subjectsTaught.push({
            courseName: course.courseName,
            courseCode: course.courseCode,
            subjectName: subject.subjectName,
            subjectCode: subject.subjectCode,
            semester: subject.semester,
            credits: subject.credits
          });
        }
      });
    });

    // Get research publications count
    const researchCount = faculty.researchPublications ? faculty.researchPublications.length : 0;

    // Calculate total experience
    const totalExperience = faculty.experience?.total || 0;

    res.json({
      success: true,
      data: {
        faculty,
        academic: {
          subjectsTaught,
          totalSubjects: subjectsTaught.length,
          researchCount,
          totalExperience
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

// @desc    Get faculty by department
// @route   GET /api/faculty/department/:department
// @access  Public
exports.getFacultyByDepartment = async (req, res) => {
  try {
    const { department } = req.params;
    
    const faculty = await Faculty.find({
      department: department,
      isActive: true
    })
    .sort({ designation: 1, experience: -1 })
    .select('fullName designation qualification profileImage experience');

    if (faculty.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No faculty found in this department'
      });
    }

    // Get department head (usually Professor or senior faculty)
    const departmentHead = faculty.find(f => 
      f.designation === 'Professor' || 
      f.designation === 'Head of Department'
    );

    // Get department statistics
    const stats = {
      totalFaculty: faculty.length,
      professors: faculty.filter(f => f.designation === 'Professor').length,
      associateProfessors: faculty.filter(f => f.designation === 'Associate Professor').length,
      assistantProfessors: faculty.filter(f => f.designation === 'Assistant Professor').length,
      lecturers: faculty.filter(f => f.designation === 'Lecturer').length,
      averageExperience: Math.round(
        faculty.reduce((sum, f) => sum + (f.experience?.total || 0), 0) / faculty.length
      )
    };

    res.json({
      success: true,
      data: {
        department,
        departmentHead: departmentHead || null,
        faculty,
        stats
      }
    });
  } catch (error) {
    console.error('Get Faculty By Department Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty by department'
    });
  }
};

// @desc    Get faculty research publications
// @route   GET /api/faculty/:id/research
// @access  Public
exports.getFacultyResearch = async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id)
      .select('fullName designation researchPublications department');

    if (!faculty || !faculty.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Faculty not found'
      });
    }

    // Group publications by year
    const publicationsByYear = {};
    if (faculty.researchPublications && faculty.researchPublications.length > 0) {
      faculty.researchPublications.forEach(pub => {
        const year = pub.year || 'Unknown';
        if (!publicationsByYear[year]) {
          publicationsByYear[year] = [];
        }
        publicationsByYear[year].push(pub);
      });
    }

    // Calculate research metrics
    const researchMetrics = {
      totalPublications: faculty.researchPublications ? faculty.researchPublications.length : 0,
      yearsActive: Object.keys(publicationsByYear).length,
      publicationsByYear,
      recentPublications: faculty.researchPublications
        ? faculty.researchPublications
            .sort((a, b) => (b.year || 0) - (a.year || 0))
            .slice(0, 5)
        : []
    };

    res.json({
      success: true,
      data: {
        faculty: {
          name: faculty.fullName,
          designation: faculty.designation,
          department: faculty.department
        },
        researchMetrics
      }
    });
  } catch (error) {
    console.error('Get Faculty Research Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty research'
    });
  }
};

// @desc    Get faculty awards and achievements
// @route   GET /api/faculty/:id/awards
// @access  Public
exports.getFacultyAwards = async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id)
      .select('fullName designation awards department');

    if (!faculty || !faculty.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Faculty not found'
      });
    }

    // Group awards by year
    const awardsByYear = {};
    if (faculty.awards && faculty.awards.length > 0) {
      faculty.awards.forEach(award => {
        const year = award.year || 'Unknown';
        if (!awardsByYear[year]) {
          awardsByYear[year] = [];
        }
        awardsByYear[year].push(award);
      });
    }

    // Calculate awards metrics
    const awardsMetrics = {
      totalAwards: faculty.awards ? faculty.awards.length : 0,
      yearsWithAwards: Object.keys(awardsByYear).length,
      awardsByYear,
      recentAwards: faculty.awards
        ? faculty.awards
            .sort((a, b) => (b.year || 0) - (a.year || 0))
            .slice(0, 5)
        : []
    };

    res.json({
      success: true,
      data: {
        faculty: {
          name: faculty.fullName,
          designation: faculty.designation,
          department: faculty.department
        },
        awardsMetrics
      }
    });
  } catch (error) {
    console.error('Get Faculty Awards Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty awards'
    });
  }
};

// @desc    Get faculty teaching schedule
// @route   GET /api/faculty/:id/schedule
// @access  Private (Faculty/Admin)
exports.getFacultySchedule = async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id);

    if (!faculty || !faculty.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Faculty not found'
      });
    }

    // Check if requesting user is the faculty member or admin
    if (req.user.role !== 'admin' && 
        (!faculty.userId || faculty.userId.toString() !== req.user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get courses taught by this faculty
    const courses = await Course.find({
      'subjects.faculty': faculty._id,
      isActive: true
    })
    .select('courseName courseCode subjects semester')
    .populate('subjects.faculty', 'fullName');

    // Create teaching schedule
    const teachingSchedule = [];
    const daySchedule = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: []
    };

    courses.forEach(course => {
      course.subjects.forEach(subject => {
        if (subject.faculty && subject.faculty._id.toString() === faculty._id.toString()) {
          // Create a sample schedule (in real app, this would come from a separate schedule model)
          const scheduleEntry = {
            course: course.courseName,
            subject: subject.subjectName,
            semester: subject.semester,
            day: getRandomDay(),
            time: getRandomTime(),
            room: `Room ${Math.floor(Math.random() * 50) + 101}`,
            type: subject.credits > 2 ? 'Theory' : 'Practical',
            hours: subject.credits
          };

          teachingSchedule.push(scheduleEntry);
          
          // Add to day schedule
          if (daySchedule[scheduleEntry.day]) {
            daySchedule[scheduleEntry.day].push(scheduleEntry);
          }
        }
      });
    });

    // Sort day schedule by time
    Object.keys(daySchedule).forEach(day => {
      daySchedule[day].sort((a, b) => {
        const timeA = convertTimeToMinutes(a.time);
        const timeB = convertTimeToMinutes(b.time);
        return timeA - timeB;
      });
    });

    res.json({
      success: true,
      data: {
        faculty: {
          name: faculty.fullName,
          designation: faculty.designation,
          officeHours: faculty.officeHours || '9:00 AM - 5:00 PM',
          officeLocation: faculty.officeLocation || 'Main Building, Room 201'
        },
        teachingSchedule,
        daySchedule,
        totalSubjects: teachingSchedule.length,
        totalHours: teachingSchedule.reduce((sum, entry) => sum + entry.hours, 0)
      }
    });
  } catch (error) {
    console.error('Get Faculty Schedule Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty schedule'
    });
  }
};

// Helper functions for schedule generation
const getRandomDay = () => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[Math.floor(Math.random() * days.length)];
};

const getRandomTime = () => {
  const hours = [9, 10, 11, 12, 14, 15, 16];
  const hour = hours[Math.floor(Math.random() * hours.length)];
  const minute = Math.random() > 0.5 ? '00' : '30';
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute} ${period}`;
};

const convertTimeToMinutes = (timeStr) => {
  const [time, period] = timeStr.split(' ');
  const [hours, minutes] = time.split(':').map(Number);
  let totalMinutes = hours * 60 + minutes;
  if (period === 'PM' && hours !== 12) totalMinutes += 12 * 60;
  if (period === 'AM' && hours === 12) totalMinutes -= 12 * 60;
  return totalMinutes;
};

// @desc    Get faculty statistics
// @route   GET /api/faculty/stats
// @access  Public
exports.getFacultyStats = async (req, res) => {
  try {
    // Overall statistics
    const overallStats = await Faculty.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: null,
          totalFaculty: { $sum: 1 },
          averageExperience: { $avg: '$experience.total' },
          totalResearch: { $sum: { $size: '$researchPublications' } },
          totalAwards: { $sum: { $size: '$awards' } }
        }
      }
    ]);

    // Department-wise distribution
    const departmentStats = await Faculty.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 },
          avgExperience: { $avg: '$experience.total' },
          totalResearch: { $sum: { $size: '$researchPublications' } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Designation-wise distribution
    const designationStats = await Faculty.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: '$designation',
          count: { $sum: 1 },
          avgExperience: { $avg: '$experience.total' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Faculty with most experience
    const experiencedFaculty = await Faculty.find({ isActive: true })
      .sort({ 'experience.total': -1 })
      .limit(5)
      .select('fullName designation department experience.total');

    // Faculty with most research
    const researchFaculty = await Faculty.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $project: {
          fullName: 1,
          designation: 1,
          department: 1,
          researchCount: { $size: '$researchPublications' }
        }
      },
      {
        $sort: { researchCount: -1 }
      },
      {
        $limit: 5
      }
    ]);

    res.json({
      success: true,
      data: {
        overall: overallStats[0] || {
          totalFaculty: 0,
          averageExperience: 0,
          totalResearch: 0,
          totalAwards: 0
        },
        departmentStats,
        designationStats,
        experiencedFaculty,
        researchFaculty
      }
    });
  } catch (error) {
    console.error('Get Faculty Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty statistics'
    });
  }
};

// @desc    Search faculty
// @route   GET /api/faculty/search
// @access  Public
exports.searchFaculty = async (req, res) => {
  try {
    const { q, department } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const query = {
      isActive: true,
      $or: [
        { fullName: { $regex: q, $options: 'i' } },
        { qualification: { $elemMatch: { degree: { $regex: q, $options: 'i' } } } },
        { department: { $regex: q, $options: 'i' } },
        { designation: { $regex: q, $options: 'i' } },
        { 'experience.details.organization': { $regex: q, $options: 'i' } }
      ]
    };

    if (department) {
      query.department = department;
    }

    const faculty = await Faculty.find(query)
      .sort({ experience: -1 })
      .limit(20)
      .select('fullName designation department qualification profileImage');

    res.json({
      success: true,
      count: faculty.length,
      data: faculty
    });
  } catch (error) {
    console.error('Search Faculty Error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};