const Reminder = require('../models/Reminder');
const { sendWhatsAppNotification } = require('./whatsappHelper');

/**
 * Searches the database for pending reminders scheduled for today or earlier,
 * simulates sending them, and updates their status to 'Sent'.
 * 
 * @returns {Promise<Array>} List of processed reminders
 */
async function processPendingReminders() {
  const now = new Date();
  
  // Find all pending reminders where scheduledDate <= now
  const pendingReminders = await Reminder.find({
    status: 'Pending',
    scheduledDate: { $lte: now }
  })
  .populate('patient')
  .populate('doctor');

  const processed = [];
  
  for (const reminder of pendingReminders) {
    const phone = reminder.patient ? reminder.patient.phone : 'Unknown';
    const patientName = reminder.patient ? reminder.patient.name : 'Patient';
    const doctorName = reminder.doctor ? reminder.doctor.name : 'Doctor';

    // Send automated SMS & WhatsApp notification
    console.log(`[SIMULATED SMS SENT] To: ${phone} | Msg: "${reminder.message}"`);
    await sendWhatsAppNotification(phone, reminder.message);

    // Update status to Sent
    reminder.status = 'Sent';
    reminder.sentAt = new Date();
    await reminder.save();

    processed.push({
      id: reminder._id,
      patientName,
      patientPhone: phone,
      doctorName,
      message: reminder.message,
      scheduledDate: reminder.scheduledDate
    });
  }

  return processed;
}

module.exports = {
  processPendingReminders
};
