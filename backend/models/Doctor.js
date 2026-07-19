const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  department: { type: String, required: true },
  specialization: { type: String },
  availabilityStatus: { 
    type: String, 
    enum: ['Available', 'In Surgery', 'On Break', 'Unavailable'], 
    default: 'Available' 
  },
  averageCheckupTime: { type: Number, default: 10 }, // in minutes
  currentRoom: { type: String, required: true }, // e.g., "Cabin A"
  hospital: { type: String, default: 'general-hospital' }
}, { timestamps: true });

module.exports = mongoose.model('Doctor', DoctorSchema);
