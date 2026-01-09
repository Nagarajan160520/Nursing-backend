const axios = require('axios');

// MSG91 SMS Configuration
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || 'your-msg91-auth-key';
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || 'NURINS'; // Nursing Institute
const MSG91_ROUTE = process.env.MSG91_ROUTE || '4'; // Transactional route
const MSG91_COUNTRY = process.env.MSG91_COUNTRY || '91'; // India

/**
 * Send SMS using MSG91 API
 * @param {string} mobile - Mobile number (10 digits)
 * @param {string} message - SMS message content
 * @returns {Promise<Object>} - Response from MSG91 API
 */
const sendSMS = async (mobile, message) => {
  try {
    // Validate mobile number (should be 10 digits)
    const cleanMobile = mobile.replace(/\D/g, '');
    if (cleanMobile.length !== 10) {
      throw new Error(`Invalid mobile number: ${mobile}. Must be 10 digits.`);
    }

    // MSG91 API endpoint
    const url = `https://api.msg91.com/api/sendhttp.php`;

    // Prepare parameters
    const params = {
      authkey: MSG91_AUTH_KEY,
      mobiles: `${MSG91_COUNTRY}${cleanMobile}`,
      message: message,
      sender: MSG91_SENDER_ID,
      route: MSG91_ROUTE,
      country: MSG91_COUNTRY,
      response: 'json'
    };

    console.log('📱 Sending SMS to:', cleanMobile);
    console.log('📱 Message:', message.substring(0, 50) + '...');

    // Send SMS
    const response = await axios.get(url, { params });

    console.log('📱 SMS Response:', response.data);

    // Check if SMS was sent successfully
    if (response.data && response.data.type === 'success') {
      return {
        success: true,
        messageId: response.data.message,
        mobile: cleanMobile,
        status: 'sent'
      };
    } else {
      throw new Error(response.data?.message || 'Failed to send SMS');
    }

  } catch (error) {
    console.error('❌ SMS sending failed:', error.message);
    return {
      success: false,
      mobile: mobile,
      error: error.message,
      status: 'failed'
    };
  }
};

/**
 * Send marks notification SMS to parent
 * @param {Object} student - Student object with parent details
 * @param {Object} marksData - Marks information
 * @returns {Promise<Array>} - Array of SMS send results
 */
const sendMarksNotificationSMS = async (student, marksData) => {
  const results = [];

  try {
    // Prepare SMS message
    const message = `Dear Parent, Your ward ${student.firstName} ${student.lastName || ''} (${student.studentId}) marks have been updated for ${marksData.subject} - ${marksData.examType}. Total: ${marksData.totalMarks || 'N/A'}. Login to student portal for details. - Nursing Institute`;

    // Send to father if mobile available
    if (student.fatherMobile && student.fatherMobile.trim()) {
      const fatherResult = await sendSMS(student.fatherMobile, message);
      results.push({
        recipient: 'father',
        mobile: student.fatherMobile,
        ...fatherResult
      });
    }

    // Send to mother if mobile available
    if (student.motherMobile && student.motherMobile.trim()) {
      const motherResult = await sendSMS(student.motherMobile, message);
      results.push({
        recipient: 'mother',
        mobile: student.motherMobile,
        ...motherResult
      });
    }

    // Send to guardian if mobile available and different from parents
    if (student.guardianMobile && student.guardianMobile.trim()) {
      const parentMobiles = [student.fatherMobile, student.motherMobile].filter(Boolean);
      if (!parentMobiles.includes(student.guardianMobile)) {
        const guardianResult = await sendSMS(student.guardianMobile, message);
        results.push({
          recipient: 'guardian',
          mobile: student.guardianMobile,
          ...guardianResult
        });
      }
    }

    console.log(`📱 SMS notifications sent for student ${student.studentId}:`, results.length, 'messages');

  } catch (error) {
    console.error('❌ Error sending marks notification SMS:', error.message);
    results.push({
      recipient: 'error',
      error: error.message,
      status: 'failed'
    });
  }

  return results;
};

/**
 * Send bulk SMS to multiple recipients
 * @param {Array} recipients - Array of {mobile, message} objects
 * @returns {Promise<Array>} - Array of send results
 */
const sendBulkSMS = async (recipients) => {
  const results = [];

  for (const recipient of recipients) {
    try {
      const result = await sendSMS(recipient.mobile, recipient.message);
      results.push({
        ...recipient,
        ...result
      });
    } catch (error) {
      results.push({
        ...recipient,
        success: false,
        error: error.message,
        status: 'failed'
      });
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
};

module.exports = {
  sendSMS,
  sendMarksNotificationSMS,
  sendBulkSMS
};
