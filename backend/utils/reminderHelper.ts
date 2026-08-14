import Reminder from '../models/Reminder';
import { sendWhatsAppNotification } from './whatsappHelper';
import logger from './logger';

const log = logger.child({ module: 'reminders' });

/**
 * Searches the database for pending reminders scheduled for today or earlier,
 * simulates sending them, and updates their status to 'Sent'.
 *
 * @returns {Promise<Array>} List of processed reminders
 */
export async function processPendingReminders(): Promise<any[]> {
  const now = new Date();

  // Find all pending reminders where scheduledDate <= now
  const pendingReminders = await (Reminder as any)
    .find({
      status: 'Pending',
      scheduledDate: { $lte: now }
    })
    .populate('patient')
    .populate('doctor');

  const processed: any[] = [];

  for (const reminder of pendingReminders || []) {
    try {
      // Re-check status immediately before claiming it: the cron job and the
      // 5-minute interval in index.js can both call this function around the
      // same time, and both would otherwise fetch the same 'Pending' reminder
      // before either saves — sending duplicate WhatsApp messages.
      const fresh = await (Reminder as any).findById(reminder._id);
      if (!fresh || fresh.status !== 'Pending') continue;

      fresh.status = 'Sent';
      fresh.sentAt = new Date();
      await fresh.save();

      const phone = reminder.patient ? reminder.patient.phone : 'Unknown';
      const patientName = reminder.patient ? reminder.patient.name : 'Patient';
      const doctorName = reminder.doctor ? reminder.doctor.name : 'Doctor';

      // Send automated SMS & WhatsApp notification
      log.info(`To: ${phone} | Msg: "${reminder.message}"`);
      await sendWhatsAppNotification(phone, reminder.message);

      processed.push({
        id: reminder._id,
        patientName,
        patientPhone: phone,
        doctorName,
        message: reminder.message,
        scheduledDate: reminder.scheduledDate
      });
    } catch (err) {
      // Don't let one bad reminder abort the rest of the batch — it stays
      // claimed as 'Sent' if the save above succeeded, or 'Pending' (and
      // will be retried next cycle) if it failed before that point.
      log.error(`Failed to process reminder ${reminder._id}:`, { err });
    }
  }

  return processed;
}
