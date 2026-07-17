const Queue = require('../models/Queue');
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');

async function recalculateQueueTimes(doctorId) {
  const queue = await Queue.findOne({ doctor: doctorId }).populate('activeQueue');
  if (!queue) return;

  const doctor = await Doctor.findById(doctorId);
  const avgTime = doctor ? doctor.averageCheckupTime : 10;
  const buffer = queue.bufferDelay || 0;

  for (let i = 0; i < queue.activeQueue.length; i++) {
    const token = queue.activeQueue[i];
    if (token) {
      token.estimatedWaitTime = (i * avgTime) + buffer;
      await token.save();
    }
  }
}

module.exports = { recalculateQueueTimes };
