const Notification = require('../models/Notification');
const User = require('../models/User');
const Student = require('../models/Student');
const Course = require('../models/Course');

// @desc    Create new notification
// @route   POST /api/admin/notifications
// @access  Private (Admin)
exports.createNotification = async (req, res) => {
    try {
        const {
            title,
            message,
            type = 'info',
            category = 'General',
            priority = 'medium',
            targetType = 'all',
            targetIds = [],
            targetModel = 'User',
            sendMethod = ['dashboard'],
            actionUrl,
            actionText,
            scheduleAt,
            expiryDate
        } = req.body;

        // Validate required fields
        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        // Determine receivers based on target type
        let receivers = [];

        switch (targetType) {
            case 'all':
                // Get all active users
                const allUsers = await User.find({ isActive: true })
                    .select('_id');
                receivers = allUsers.map(user => ({
                    user: user._id,
                    read: false
                }));
                break;

            case 'students':
                // Get all students
                const students = await Student.find({ academicStatus: 'Active' })
                    .populate('userId', '_id');
                receivers = students.map(student => ({
                    user: student.userId._id,
                    read: false
                }));
                break;

            case 'course':
                // Get students of specific courses
                const courseStudents = await Student.find({
                    courseEnrolled: { $in: targetIds },
                    academicStatus: 'Active'
                }).populate('userId', '_id');
                
                receivers = courseStudents.map(student => ({
                    user: student.userId._id,
                    read: false
                }));
                break;

            case 'batch':
                // Get students of specific batch years
                const batchStudents = await Student.find({
                    batchYear: { $in: targetIds },
                    academicStatus: 'Active'
                }).populate('userId', '_id');
                
                receivers = batchStudents.map(student => ({
                    user: student.userId._id,
                    read: false
                }));
                break;

            case 'individual':
                // Specific users
                receivers = targetIds.map(userId => ({
                    user: userId,
                    read: false
                }));
                break;

            default:
                receivers = [];
        }

        // Create notification
        const notification = new Notification({
            title,
            message,
            type,
            category,
            priority,
            sender: req.user._id,
            receivers,
            targetType,
            targetIds: targetIds.length > 0 ? targetIds : undefined,
            targetModel: targetType !== 'individual' ? targetModel : null,
            sendMethod,
            actionUrl,
            actionText,
            scheduleAt: scheduleAt ? new Date(scheduleAt) : null,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            isActive: true
        });

        await notification.save();

        // Update metadata
        notification.metadata.sentCount = receivers.length;
        await notification.save();

        // Populate sender info
        await notification.populate('sender', 'username email');

        // Emit real-time notification events
        const io = req.app.get('io');
        if (io) {
            // Emit to all receivers
            receivers.forEach(receiver => {
                io.to(`user:${receiver.user}`).emit('notification:created', {
                    notification: {
                        _id: notification._id,
                        title: notification.title,
                        message: notification.message,
                        type: notification.type,
                        category: notification.category,
                        priority: notification.priority,
                        createdAt: notification.createdAt,
                        sender: notification.sender
                    }
                });
            });

            // Also emit to admin room for admin dashboard updates
            io.to('admins').emit('notification:created', {
                notification: notification,
                stats: {
                    totalReceivers: receivers.length
                }
            });
        }

        res.status(201).json({
            success: true,
            message: 'Notification created successfully',
            data: notification
        });

    } catch (error) {
        console.error('Create Notification Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create notification'
        });
    }
};

// @desc    Get all notifications (admin view)
// @route   GET /api/admin/notifications
// @access  Private (Admin)
exports.getAllNotifications = async (req, res) => {
    try {
        const { 
            category, 
            priority, 
            status, 
            startDate, 
            endDate, 
            page = 1, 
            limit = 20 
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};

        if (category) {
            query.category = category;
        }

        if (priority) {
            query.priority = priority;
        }

        if (status === 'active') {
            query.isActive = true;
        } else if (status === 'expired') {
            query.expiryDate = { $lt: new Date() };
        } else if (status === 'scheduled') {
            query.scheduleAt = { $gt: new Date() };
        }

        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const [notifications, total] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('sender', 'username email')
                .populate('targetIds', 'courseName fullName')
                .select('-__v'),
            Notification.countDocuments(query)
        ]);

        // Get statistics
        const stats = await Notification.aggregate([
            {
                $facet: {
                    total: [{ $count: 'count' }],
                    byCategory: [
                        { $group: { _id: '$category', count: { $sum: 1 } } }
                    ],
                    byPriority: [
                        { $group: { _id: '$priority', count: { $sum: 1 } } }
                    ],
                    recentStats: [
                        { 
                            $match: { 
                                createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
                            } 
                        },
                        {
                            $group: {
                                _id: { 
                                    $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } 
                                },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { _id: 1 } },
                        { $limit: 7 }
                    ]
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                notifications,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                },
                stats: stats[0]
            }
        });

    } catch (error) {
        console.error('Get All Notifications Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notifications'
        });
    }
};

// @desc    Get notification by ID
// @route   GET /api/admin/notifications/:id
// @access  Private (Admin)
exports.getNotificationById = async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id)
            .populate('sender', 'username email')
            .populate('targetIds', 'courseName fullName username')
            .populate('receivers.user', 'username email')
            .select('-__v');

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        // Get engagement statistics
        const readCount = notification.receivers.filter(r => r.read).length;
        const ackCount = notification.ackReceivers.filter(a => a.acknowledged).length;

        res.json({
            success: true,
            data: {
                notification,
                stats: {
                    totalReceivers: notification.receivers.length,
                    readCount,
                    ackCount,
                    readPercentage: notification.receivers.length > 0 ? 
                        (readCount / notification.receivers.length * 100).toFixed(2) : 0
                }
            }
        });

    } catch (error) {
        console.error('Get Notification Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notification'
        });
    }
};

// @desc    Update notification
// @route   PUT /api/admin/notifications/:id
// @access  Private (Admin)
exports.updateNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const notification = await Notification.findById(id);
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        // Only allow certain fields to be updated
        const allowedUpdates = [
            'title', 'message', 'type', 'category', 'priority',
            'actionUrl', 'actionText', 'expiryDate', 'isActive'
        ];

        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                notification[key] = updates[key];
            }
        });

        await notification.save();

        res.json({
            success: true,
            message: 'Notification updated successfully',
            data: notification
        });

    } catch (error) {
        console.error('Update Notification Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notification'
        });
    }
};

// @desc    Delete notification
// @route   DELETE /api/admin/notifications/:id
// @access  Private (Admin)
exports.deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findByIdAndDelete(id);
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            message: 'Notification deleted successfully'
        });

    } catch (error) {
        console.error('Delete Notification Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete notification'
        });
    }
};

// @desc    Send notification immediately
// @route   POST /api/admin/notifications/:id/send
// @access  Private (Admin)
exports.sendNotificationNow = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findById(id);
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        // Update sentAt to now
        notification.sentAt = new Date();
        await notification.save();

        // TODO: Send push notifications/emails if configured
        // if (notification.sendMethod.includes('email')) {
        //     await sendEmailNotification(notification);
        // }
        // if (notification.sendMethod.includes('sms')) {
        //     await sendSmsNotification(notification);
        // }

        res.json({
            success: true,
            message: 'Notification sent successfully'
        });

    } catch (error) {
        console.error('Send Notification Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send notification'
        });
    }
};

// @desc    Get notification statistics
// @route   GET /api/admin/notifications/stats
// @access  Private (Admin)
exports.getNotificationStats = async (req, res) => {
    try {
        const stats = await Notification.aggregate([
            {
                $facet: {
                    overview: [
                        {
                            $group: {
                                _id: null,
                                total: { $sum: 1 },
                                active: {
                                    $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
                                },
                                scheduled: {
                                    $sum: {
                                        $cond: [
                                            { $and: [
                                                { $ne: ['$scheduleAt', null] },
                                                { $gt: ['$scheduleAt', new Date()] }
                                            ]},
                                            1, 0
                                        ]
                                    }
                                },
                                expired: {
                                    $sum: {
                                        $cond: [
                                            { $and: [
                                                { $ne: ['$expiryDate', null] },
                                                { $lt: ['$expiryDate', new Date()] }
                                            ]},
                                            1, 0
                                        ]
                                    }
                                }
                            }
                        }
                    ],
                    categoryDistribution: [
                        {
                            $group: {
                                _id: '$category',
                                count: { $sum: 1 },
                                readRate: {
                                    $avg: {
                                        $cond: [
                                            { $gt: ['$metadata.sentCount', 0] },
                                            { $divide: ['$metadata.readCount', '$metadata.sentCount'] },
                                            0
                                        ]
                                    }
                                }
                            }
                        },
                        { $sort: { count: -1 } }
                    ],
                    priorityDistribution: [
                        {
                            $group: {
                                _id: '$priority',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    recentActivity: [
                        {
                            $match: {
                                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                            }
                        },
                        {
                            $group: {
                                _id: {
                                    $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                                },
                                count: { $sum: 1 },
                                readCount: { $sum: "$metadata.readCount" }
                            }
                        },
                        { $sort: { _id: 1 } }
                    ]
                }
            }
        ]);

        res.json({
            success: true,
            data: stats[0]
        });

    } catch (error) {
        console.error('Get Notification Stats Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notification statistics'
        });
    }
};