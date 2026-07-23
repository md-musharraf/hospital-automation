const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const { authenticateToken } = require('../middleware/auth');

// Middleware to ensure the user is a pharmacist / medical-store operator
const ensurePharmacy = (req, res, next) => {
  if (req.user.role !== 'pharmacy') {
    return res.status(403).json({ message: 'Access denied: Pharmacy / Medical staff only' });
  }
  next();
};

// GET all tokens with a doctor's prescription in the pharmacist's facility.
// Scoped strictly to the pharmacist's own facility (via that facility's doctors),
// so one facility's medical store never sees another facility's prescriptions.
router.get('/prescriptions', authenticateToken, ensurePharmacy, async (req, res) => {
  try {
    const doctors = await Doctor.find({ hospital: req.user.hospital });
    const docIds = doctors.map(d => d._id);

    // Fetch this facility's tokens then keep only those that actually carry a
    // prescription. We filter in JS (not a `prescription.medicines.0 $exists`
    // query) so it behaves identically on real MongoDB and the in-memory mock.
    const all = await Token.find({ doctor: { $in: docIds } })
      .populate('patient')
      .populate('doctor', '-passwordHash');

    const tokens = all
      .filter(t => t.prescription && Array.isArray(t.prescription.medicines) && t.prescription.medicines.length > 0)
      .sort((a, b) => {
        const ad = a.prescription.dispensed ? 1 : 0;
        const bd = b.prescription.dispensed ? 1 : 0;
        if (ad !== bd) return ad - bd; // undispensed first
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });

    res.json(tokens);
  } catch (err) {
    console.error('Error fetching pharmacy prescriptions:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST mark a token's prescription as dispensed (medicines handed to the patient)
router.post('/prescriptions/:tokenId/dispense', authenticateToken, ensurePharmacy, async (req, res) => {
  try {
    const { tokenId } = req.params;

    // Load WITHOUT populate so token.doctor / token.patient stay ObjectIds — saving
    // a populated document would persist the nested objects and break later
    // `{ doctor: { $in: docIds } }` lookups. Fetch the related docs separately.
    const token = await Token.findById(tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    // TENANT ISOLATION: the token's doctor must belong to this pharmacist's facility.
    const doctor = token.doctor ? await Doctor.findById(token.doctor) : null;
    if (!doctor || doctor.hospital !== req.user.hospital) {
      return res.status(403).json({ message: 'This prescription belongs to another facility.' });
    }

    if (!token.prescription || !token.prescription.medicines || token.prescription.medicines.length === 0) {
      return res.status(400).json({ message: 'This token has no prescription to dispense.' });
    }

    if (token.prescription.dispensed) {
      return res.status(400).json({ message: 'This prescription has already been dispensed.' });
    }

    token.prescription.dispensed = true;
    token.prescription.dispensedAt = new Date();
    token.prescription.dispensedBy = req.user.username || 'Pharmacy';
    token.markModified && token.markModified('prescription');
    await token.save();

    // Notify the patient that their medicines are ready
    const patient = token.patient ? await Patient.findById(token.patient) : null;
    if (patient && patient.phone) {
      try {
        const { sendWhatsAppNotification } = require('../utils/whatsappHelper');
        const msg = `Hello ${patient.name}, your medicines for token ${token.tokenNumber} are ready for pickup at our pharmacy counter. Please collect them.`;
        await sendWhatsAppNotification(patient.phone, msg);
      } catch (waErr) {
        console.error('Pharmacy WhatsApp notify failed:', waErr);
      }
    }

    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId: doctor._id });
    }

    // Re-fetch populated for the client response (this copy is NOT saved).
    const updated = await Token.findById(tokenId).populate('patient').populate('doctor', '-passwordHash');
    res.json({ message: `Medicines for token ${token.tokenNumber} marked as dispensed.`, token: updated });
  } catch (err) {
    console.error('Error dispensing prescription:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
