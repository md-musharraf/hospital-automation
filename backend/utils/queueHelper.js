const Queue = require('../models/Queue');
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');

async function recalculateQueueTimes(doctorId) {
  try {
    const queue = await Queue.findOne({ doctor: doctorId }).populate('activeQueue');
    if (!queue || !queue.activeQueue) return;

    const doctor = await Doctor.findById(doctorId);
    const avgTime = doctor ? (doctor.averageCheckupTime || 10) : 10;
    const buffer = queue.bufferDelay || 0;

    let pos = 0;
    for (let i = 0; i < queue.activeQueue.length; i++) {
      const token = queue.activeQueue[i];
      if (token && typeof token.save === 'function') {
        token.estimatedWaitTime = (pos * avgTime) + buffer;
        await token.save();
        pos++;
      } else if (token && (token._id || typeof token === 'string')) {
        const tokenId = token._id || token;
        const realToken = await Token.findById(tokenId);
        if (realToken) {
          realToken.estimatedWaitTime = (pos * avgTime) + buffer;
          await realToken.save();
          pos++;
        }
      }
    }
  } catch (err) {
    console.error('Error in recalculateQueueTimes:', err);
  }
}

module.exports = { recalculateQueueTimes };
