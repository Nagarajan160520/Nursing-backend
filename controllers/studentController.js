const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Marks = require('../models/Marks');
const Download = require('../models/Download');
const Notification = require('../models/Notification');

// @desc    Get student dashboard data
// @route   GET /api/student/dashboard
// @access  Private (Student)
exports.getDashboard = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id })
      .populate('courseEnrolled');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }

    // Get attendance summary
    const attendanceSummary = await Attendance.aggregate([
      {
        $match: {
          student: student._id,
          isHoliday: false
        }
      },
      {
        $group: {
          _id: '$subject',
          totalSessions: { $sum: 1 },
          presentSessions: {
            $sum: {
              $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Calculate overall attendance
    let totalSessions = 0;
    let presentSessions = 0;
    
    attendanceSummary.forEach(subject => {
      totalSessions += subject.totalSessions;
      presentSessions += subject.presentSessions;
    });

    const overallAttendance = totalSessions > 0 ? 
      (presentSessions / totalSessions) * 100 : 0;

    // Get recent marks
    const recentMarks = await Marks.find({ student: student._1?._id ? student._id : student._id })
      .sort({ examDate: -1 })
      .limit(5)
      .select('subject examType marks.obtained percentage grade');

    // Compute average internal marks (percentage) across all marks for the student
    const allMarks = await Marks.find({ student: student._id }).select('totalMarks percentage');
    let internalMarksAvg = 0;
    if (Array.isArray(allMarks) && allMarks.length > 0) {
      const sumPercent = allMarks.reduce((sum, m) => {
        if (m.totalMarks && m.totalMarks.max) {
          return sum + ((m.totalMarks.obtained || 0) / m.totalMarks.max) * 100;
        }
        if (typeof m.percentage === 'number') {
          return sum + m.percentage;
        }
        return sum;
      }, 0);
      internalMarksAvg = Math.round((sumPercent / allMarks.length) * 100) / 100;
    }

    // Get pending assignments/notices
    const notifications = await Notification.find({
      'receivers.user': req.user._id,
      'receivers.read': false
    })
    .sort({ sentAt: -1 })
    .limit(5)
    .select('title message category priority sentAt');

    // Get upcoming events/clinical postings
    const today = new Date();
    const upcomingWeek = new Date(today);
    upcomingWeek.setDate(upcomingWeek.getDate() + 7);

    const upcomingPostings = await Attendance.find({
      student: student._id,
      date: { $gte: today, $lte: upcomingWeek },
      type: 'Clinical'
    })
    .sort({ date: 1 })
    .select('date subject session type')
    .limit(5);

    res.json({
      success: true,
      data: {
        student,
        stats: {
          overallAttendance: Math.round(overallAttendance * 100) / 100,
          internalMarks: internalMarksAvg,
          totalSubjects: attendanceSummary.length,
          pendingAssignments: notifications.filter(n => n.category === 'Academic').length,
          upcomingEvents: upcomingPostings.length
        },
        attendanceSummary,
        recentMarks,
        notifications,
        upcomingPostings
      }
    });
  } catch (error) {
    console.error('Get Dashboard Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data'
    });
  }
};

// @desc    Get student attendance
// @route   GET /api/student/attendance
// @access  Private (Student)
exports.getAttendance = async (req, res) => {
  try {
    const { month, year, subject } = req.query;
    const student = await Student.findOne({ userId: req.user._id });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }

    // Build query
    const query = { student: student._id };
    
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      query.date = { $gte: startDate, $lte: endDate };
    }

    if (subject) {
      query.subject = subject;
    }

    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .populate('recordedBy', 'username')
      .select('-__v');

    // Calculate statistics
    const stats = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'Present').length,
      absent: attendance.filter(a => a.status === 'Absent').length,
      late: attendance.filter(a => a.status === 'Late').length,
      leave: attendance.filter(a => ['Leave', 'Medical Leave'].includes(a.status)).length
    };

    // Calculate percentage
    stats.percentage = stats.total > 0 ? 
      ((stats.present + stats.late) / stats.total) * 100 : 0;

    res.json({
      success: true,
      data: {
        attendance,
        stats,
        student: {
          name: student.fullName,
          studentId: student.studentId,
          course: student.courseEnrolled,
          semester: student.semester
        }
      }
    });
  } catch (error) {
    console.error('Get Attendance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance data'
    });
  }
};

// @desc    Get student marks
// @route   GET /api/student/marks
// @access  Private (Student)
exports.getMarks = async (req, res) => {
  try {
    const { semester, subject, examType } = req.query;
    const student = await Student.findOne({ userId: req.user._id });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }

    // Build query
    const query = { student: student._id };

    if (semester) {
      query.semester = parseInt(semester);
    }

    if (subject) {
      query.subject = subject;
    }

    if (examType) {
      query.examType = examType;
    }

    const marks = await Marks.find(query)
      .sort({ examDate: -1 })
      .populate('course', 'courseName')
      .select('-__v');

    // Calculate semester-wise statistics
    const semesterStats = {};
    marks.forEach(mark => {
      const sem = mark.semester;
      if (!semesterStats[sem]) {
        semesterStats[sem] = {
          totalSubjects: 0,
          totalMarks: 0,
          obtainedMarks: 0,
          passedSubjects: 0
        };
      }

      semesterStats[sem].totalSubjects++;
      semesterStats[sem].totalMarks += mark.totalMarks.max;
      semesterStats[sem].obtainedMarks += mark.totalMarks.obtained;

      if (mark.resultStatus === 'Pass') {
        semesterStats[sem].passedSubjects++;
      }
    });

    // Calculate percentages
    Object.keys(semesterStats).forEach(sem => {
      const stats = semesterStats[sem];
      stats.percentage = stats.totalMarks > 0 ?
        (stats.obtainedMarks / stats.totalMarks) * 100 : 0;
      stats.passPercentage = stats.totalSubjects > 0 ?
        (stats.passedSubjects / stats.totalSubjects) * 100 : 0;
    });

    res.json({
      success: true,
      data: {
        marks,
        semesterStats,
        student: {
          name: student.fullName,
          studentId: student.studentId,
          course: student.courseEnrolled,
          currentSemester: student.semester,
          cgpa: student.cgpa
        }
      }
    });
  } catch (error) {
    console.error('Get Marks Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch marks data'
    });
  }
};

// @desc    Download student marks as CSV
// @route   GET /api/student/marks/download
// @access  Private (Student)
exports.downloadMarks = async (req, res) => {
  try {
    const { semester, subject, examType, format = 'csv' } = req.query;
    const student = await Student.findOne({ userId: req.user._id })
      .populate('courseEnrolled', 'courseName courseCode');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }

    // Build query
    const query = { student: student._id };

    if (semester) {
      query.semester = parseInt(semester);
    }

    if (subject) {
      query.subject = subject;
    }

    if (examType) {
      query.examType = examType;
    }

    const marks = await Marks.find(query)
      .sort({ semester: 1, examDate: -1 })
      .populate('course', 'courseName')
      .select('-__v');

    if (marks.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No marks data found for download'
      });
    }

    // Generate CSV content
    let csvContent = 'Student ID,Student Name,Course,Semester,Subject,Exam Type,Exam Date,Theory Max,Theory Obtained,Practical Max,Practical Obtained,Viva Max,Viva Obtained,Assignment Max,Assignment Obtained,Total Max,Total Obtained,Percentage,Grade,Result Status\n';

    marks.forEach(mark => {
      const row = [
        student.studentId,
        student.fullName,
        student.courseEnrolled?.courseName || '',
        mark.semester,
        mark.subject,
        mark.examType,
        mark.examDate ? new Date(mark.examDate).toLocaleDateString('en-IN') : '',
        mark.marks.theory.max,
        mark.marks.theory.obtained,
        mark.marks.practical.max,
        mark.marks.practical.obtained,
        mark.marks.viva.max,
        mark.marks.viva.obtained,
        mark.marks.assignment.max,
        mark.marks.assignment.obtained,
        mark.totalMarks.max,
        mark.totalMarks.obtained,
        mark.percentage ? mark.percentage.toFixed(2) : '',
        mark.grade,
        mark.resultStatus
      ];

      // Escape commas and quotes in fields
      const escapedRow = row.map(field => {
        const str = String(field || '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      });

      csvContent += escapedRow.join(',') + '\n';
    });

    // Set headers for download
    const fileName = `marks_${student.studentId}_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.send(csvContent);

  } catch (error) {
    console.error('Download Marks Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download marks data'
    });
  }
};

// @desc    Get student profile
// @route   GET /api/student/profile
// @access  Private (Student)
exports.getProfile = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id })
      .populate('courseEnrolled')
      .select('-__v');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }

    // Set cache control headers to prevent aggressive caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile data'
    });
  }
};

// @desc    Update student profile
// @route   PUT /api/student/profile
// @access  Private (Student)
exports.updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const student = await Student.findOne({ userId: req.user._id });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }

    // Fields that can be updated by student
    const allowedUpdates = [
      'contactNumber',
      'alternateContact',
      'address',
      'guardianDetails',
      'documents'
    ];

    // Filter updates
    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    const updatedStudent = await Student.findByIdAndUpdate(
      student._id,
      { $set: filteredUpdates },
      { new: true, runValidators: true }
    ).populate('courseEnrolled');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedStudent
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// @desc    Get available downloads
// @route   GET /api/student/downloads
// @access  Private (Student)
exports.getDownloads = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }

    const { category, academicYear, semester } = req.query;

    // Build query for downloads available to student
    const query = {
      $or: [
        { targetAudience: 'all' },
        { targetAudience: 'students' },
        { 
          $and: [
            { targetAudience: 'specific_course' },
            { 'specificTargets.courses': student.courseEnrolled }
          ]
        },
        {
          $and: [
            { targetAudience: 'specific_year' },
            { 'specificTargets.years': student.batchYear }
          ]
        }
      ],
      isActive: true,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: new Date() } }
      ]
    };

    if (category) {
      query.category = category;
    }
    
    if (academicYear) {
      query.academicYear = academicYear;
    }
    
    if (semester) {
      query.semester = semester;
    }

    const downloads = await Download.find(query)
      .sort({ uploadedAt: -1 })
      .populate('uploadedBy', 'username')
      .select('-__v');

    // Group by category
    const downloadsByCategory = downloads.reduce((acc, download) => {
      if (!acc[download.category]) {
        acc[download.category] = [];
      }
      acc[download.category].push(download);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        downloads,
        downloadsByCategory,
        student: {
          name: student.fullName,
          course: student.courseEnrolled,
          batchYear: student.batchYear,
          semester: student.semester
        }
      }
    });
  } catch (error) {
    console.error('Get Downloads Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch downloads'
    });
  }
};

// @desc    Record download
// @route   POST /api/student/downloads/:id/record
// @access  Private (Student)
exports.recordDownload = async (req, res) => {
  try {
    const download = await Download.findById(req.params.id);

    if (!download) {
      return res.status(404).json({
        success: false,
        message: 'Download not found'
      });
    }

    // Check if download is accessible
    if (!download.isActive) {
      return res.status(403).json({
        success: false,
        message: 'This download is no longer available'
      });
    }

    // Increment download count
    await download.incrementDownloadCount();

    res.json({
      success: true,
      message: 'Download recorded successfully',
      data: {
        fileUrl: download.fileUrl,
        fileName: download.fileName,
        downloadCount: download.downloadCount + 1
      }
    });
  } catch (error) {
    console.error('Record Download Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record download'
    });
  }
};

// @desc    Get student notifications
// @route   GET /api/student/notifications
// @access  Private (Student)
exports.getNotifications = async (req, res) => {
  try {
    const { unread, category } = req.query;

    const query = {
      'receivers.user': req.user._id
    };

    if (unread === 'true') {
      query['receivers.read'] = false;
    }

    if (category) {
      query.category = category;
    }

    const notifications = await Notification.find(query)
      .sort({ sentAt: -1 })
      .populate('sender', 'username')
      .select('-__v');

    // Mark as read if specified
    if (req.query.markRead === 'true') {
      await Promise.all(
        notifications.map(async notification => {
          await notification.markAsRead(req.user._id);
        })
      );
    }

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Get Notifications Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/student/notifications/:id/read
// @access  Private (Student)
exports.markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await notification.markAsRead(req.user._id);

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark Notification Read Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
};

// @desc    Get clinical posting schedule
// @route   GET /api/student/clinical-schedule
// @access  Private (Student)
exports.getClinicalSchedule = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const student = await Student.findOne({ userId: req.user._id });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }

    const query = {
      student: student._id,
      type: 'Clinical'
    };

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default to current month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      query.date = {
        $gte: startOfMonth,
        $lte: endOfMonth
      };
    }

    const schedule = await Attendance.find(query)
      .sort({ date: 1 })
      .populate('recordedBy', 'username')
      .select('-__v');

    // Group by week
    const weeklySchedule = schedule.reduce((acc, posting) => {
      const weekStart = new Date(posting.date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
      
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!acc[weekKey]) {
        acc[weekKey] = {
          weekStart,
          postings: []
        };
      }
      
      acc[weekKey].postings.push(posting);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        schedule,
        weeklySchedule,
        student: {
          name: student.fullName,
          studentId: student.studentId,
          course: student.courseEnrolled,
          semester: student.semester
        }
      }
    });
  } catch (error) {
    console.error('Get Clinical Schedule Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clinical schedule'
    });
  }
};