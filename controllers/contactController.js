const Contact = require('../models/Contact');
const nodemailer = require('nodemailer');
const validator = require('validator');

// @desc    Submit contact form
// @route   POST /api/contact
// @access  Public
exports.submitContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message, category } = req.body;

    // Validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please fill all required fields'
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    if (phone && !validator.isMobilePhone(phone, 'any')) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid phone number'
      });
    }

    // Get client info
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Create contact entry
    const contact = new Contact({
      name,
      email,
      phone,
      subject,
      message,
      category: category || 'General',
      ipAddress,
      userAgent,
      source: 'Website',
      status: 'New'
    });

    await contact.save();

    // Send confirmation email to user
    await sendConfirmationEmail(email, name, subject);

    // Send notification email to admin
    await sendAdminNotification(email, name, subject, message, contact._id);

    res.status(201).json({
      success: true,
      message: 'Thank you for your message. We will get back to you soon.',
      data: {
        contactId: contact._id,
        reference: `CONTACT-${contact._id.toString().substring(0, 8).toUpperCase()}`
      }
    });

  } catch (error) {
    console.error('Submit Contact Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit contact form'
    });
  }
};

// @desc    Get all contacts (admin)
// @route   GET /api/admin/contacts
// @access  Private (Admin)
exports.getAllContacts = async (req, res) => {
  try {
    const {
      status,
      category,
      priority,
      search,
      startDate,
      endDate,
      assignedTo,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // Filters
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (assignedTo) query.assignedTo = assignedTo;

    // Date range filter
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const [contacts, total] = await Promise.all([
      Contact.find(query)
        .populate('assignedTo', 'username email')
        .populate('repliedBy', 'username')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Contact.countDocuments(query)
    ]);

    // Get statistics
    const stats = await Contact.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const categoryStats = await Contact.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        contacts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        stats: {
          byStatus: stats,
          byCategory: categoryStats,
          totalContacts: total,
          newContacts: await Contact.countDocuments({ status: 'New' }),
          resolvedContacts: await Contact.countDocuments({ status: 'Resolved' })
        }
      }
    });

  } catch (error) {
    console.error('Get All Contacts Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contacts'
    });
  }
};

// @desc    Get contact by ID
// @route   GET /api/admin/contacts/:id
// @access  Private (Admin)
exports.getContactById = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
      .populate('assignedTo', 'username email')
      .populate('repliedBy', 'username')
      .populate('notes.addedBy', 'username');

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    res.json({
      success: true,
      data: contact
    });

  } catch (error) {
    console.error('Get Contact By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact'
    });
  }
};

// @desc    Update contact status
// @route   PUT /api/admin/contacts/:id/status
// @access  Private (Admin)
exports.updateContactStatus = async (req, res) => {
  try {
    const { status, assignedTo } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    contact.status = status || contact.status;
    if (assignedTo) contact.assignedTo = assignedTo;

    await contact.save();

    res.json({
      success: true,
      message: 'Contact status updated successfully',
      data: contact
    });

  } catch (error) {
    console.error('Update Contact Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update contact status'
    });
  }
};

// @desc    Add note to contact
// @route   POST /api/admin/contacts/:id/notes
// @access  Private (Admin)
exports.addContactNote = async (req, res) => {
  try {
    const { note } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    contact.notes.push({
      note,
      addedBy: req.user._id
    });

    await contact.save();

    res.json({
      success: true,
      message: 'Note added successfully',
      data: contact.notes[contact.notes.length - 1]
    });

  } catch (error) {
    console.error('Add Contact Note Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add note'
    });
  }
};

// @desc    Reply to contact
// @route   POST /api/admin/contacts/:id/reply
// @access  Private (Admin)
exports.replyToContact = async (req, res) => {
  try {
    const { replyMessage } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Send email reply
    await sendReplyEmail(contact.email, contact.name, contact.subject, replyMessage);

    // Update contact record
    contact.replied = true;
    contact.replyMessage = replyMessage;
    contact.repliedBy = req.user._id;
    contact.repliedAt = new Date();
    contact.status = 'Resolved';

    await contact.save();

    res.json({
      success: true,
      message: 'Reply sent successfully',
      data: contact
    });

  } catch (error) {
    console.error('Reply To Contact Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send reply'
    });
  }
};

// @desc    Get contact statistics
// @route   GET /api/admin/contacts/stats
// @access  Private (Admin)
exports.getContactStats = async (req, res) => {
  try {
    // Daily contacts for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyContacts = await Contact.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
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
      {
        $sort: { _id: 1 }
      }
    ]);

    // Category distribution
    const categoryDistribution = await Contact.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Status distribution
    const statusDistribution = await Contact.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Average response time
    const responseTimeStats = await Contact.aggregate([
      {
        $match: {
          replied: true,
          repliedAt: { $exists: true }
        }
      },
      {
        $addFields: {
          responseHours: {
            $divide: [
              { $subtract: ["$repliedAt", "$createdAt"] },
              1000 * 60 * 60
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgResponseTime: { $avg: "$responseHours" },
          minResponseTime: { $min: "$responseHours" },
          maxResponseTime: { $max: "$responseHours" }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        dailyContacts,
        categoryDistribution,
        statusDistribution,
        responseTime: responseTimeStats[0] || {
          avgResponseTime: 0,
          minResponseTime: 0,
          maxResponseTime: 0
        },
        summary: {
          total: await Contact.countDocuments(),
          new: await Contact.countDocuments({ status: 'New' }),
          resolved: await Contact.countDocuments({ status: 'Resolved' }),
          replied: await Contact.countDocuments({ replied: true })
        }
      }
    });

  } catch (error) {
    console.error('Get Contact Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact statistics'
    });
  }
};

// Email sending functions
const sendConfirmationEmail = async (to, name, subject) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_PORT === '465',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"Nursing Institute" <${process.env.EMAIL_USER}>`,
      to,
      subject: 'Thank you for contacting us',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Thank You for Contacting Nursing Institute</h2>
          <p>Dear ${name},</p>
          <p>We have received your message regarding <strong>"${subject}"</strong>.</p>
          <p>Our team will review your inquiry and get back to you within 24-48 hours.</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Your Reference ID:</strong> CONTACT-${Date.now().toString().substring(7)}</p>
            <p><strong>Submitted On:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p>For urgent inquiries, please call us at: +91-XXXXXXXXXX</p>
          <p>Best regards,<br>Nursing Institute Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Confirmation email sent to ${to}`);
  } catch (error) {
    console.error('Confirmation email error:', error);
  }
};

const sendAdminNotification = async (fromEmail, fromName, subject, message, contactId) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_PORT === '465',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"Website Contact" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || 'admin@institute.edu',
      subject: `New Contact Form: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h3 style="color: #e74c3c;">New Contact Form Submission</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>From:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${fromName} (${fromEmail})</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Subject:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${subject}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Message:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${message}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Contact ID:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${contactId}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Time:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${new Date().toLocaleString()}</td></tr>
          </table>
          <p style="margin-top: 20px;">
            <a href="${process.env.APP_URL}/admin/contacts/${contactId}" style="background-color: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in Admin Panel</a>
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Admin notification sent for contact ${contactId}`);
  } catch (error) {
    console.error('Admin notification error:', error);
  }
};

const sendReplyEmail = async (to, name, subject, replyMessage) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_PORT === '465',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"Nursing Institute Support" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Re: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Response from Nursing Institute</h2>
          <p>Dear ${name},</p>
          <p>Thank you for contacting us. Here is our response to your inquiry:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #3498db;">
            ${replyMessage}
          </div>
          <p>If you have any further questions, please don't hesitate to contact us again.</p>
          <p>Best regards,<br>Nursing Institute Support Team</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #7f8c8d;">
            This is an automated response. Please do not reply to this email.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Reply email sent to ${to}`);
  } catch (error) {
    console.error('Reply email error:', error);
    throw new Error('Failed to send reply email');
  }
};