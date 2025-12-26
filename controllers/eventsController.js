const Event = require('../models/Event');

// @desc    Get all events (admin view - returns all events)
// @route   GET /api/admin/events
// @access  Private (Admin)
exports.getAllAdminEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ startDate: -1 }).select('-__v');
    res.json({ success: true, data: events });
  } catch (error) {
    console.error('Get All Events Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch events' });
  }
};

// @desc    Create event
// @route   POST /api/admin/events
// @access  Private (Admin)
exports.createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      eventType,
      category,
      startDate,
      endDate,
      startTime,
      endTime,
      venue,
      registrationRequired,
      maxParticipants,
      isPublished
    } = req.body;

    if (!title || !description || !startDate || !endDate || !venue) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const event = new Event({
      title,
      description,
      eventType: eventType || 'Academic',
      category: category || 'Other',
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      startTime,
      endTime,
      venue,
      registrationRequired: registrationRequired === 'true' || registrationRequired === true,
      maxParticipants: maxParticipants ? Number(maxParticipants) : undefined,
      isPublished: isPublished === undefined ? true : (isPublished === 'true' || isPublished === true),
      organizer: req.user ? req.user._id : null,
      createdBy: req.user ? req.user._id : null
    });

    await event.save();

    res.status(201).json({ success: true, message: 'Event created successfully', data: event });
  } catch (error) {
    console.error('Create Event Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create event' });
  }
};

// @desc    Update event
// @route   PUT /api/admin/events/:id
// @access  Private (Admin)
exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    Object.keys(updates).forEach(key => {
      if (key === 'startDate' || key === 'endDate') {
        event[key] = updates[key] ? new Date(updates[key]) : event[key];
      } else {
        event[key] = updates[key];
      }
    });

    await event.save();

    res.json({ success: true, message: 'Event updated successfully', data: event });
  } catch (error) {
    console.error('Update Event Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update event' });
  }
};

// @desc    Delete event
// @route   DELETE /api/admin/events/:id
// @access  Private (Admin)
exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    await event.remove();

    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete Event Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete event' });
  }
};
