const mongoose = require('mongoose');

const HospitalSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true },
  address: { type: String, required: true },
  phone: { type: String, required: true },
  whatsappNumber: { type: String, required: true },
  coverImage: { type: String },
  description: { type: String },
  city: { type: String, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  type: { 
    type: String, 
    required: true, 
    enum: ['Hospital', 'Clinic', 'Medical', 'Lab', 'Government Hospital', 'Government Lab', 'Government'],
    default: 'Hospital'
  },
  logoUrl: { type: String },
  heroImage: { type: String },
  galleryImages: [{ type: String }],
  doctorCount: { type: Number, default: 1 },
  primaryColor: { type: String, default: '#0d9488' },
  secondaryColor: { type: String, default: '#0f172a' },
  welcomeMessage: { type: String },
  parentHospital: { type: String, default: null },
  hasInternalLab: { type: Boolean, default: true },
  hasInternalPharmacy: { type: Boolean, default: true },
  clinicSubtype: { type: String, default: 'General' },
  customServices: [
    {
      title: { type: String },
      description: { type: String },
      icon: { type: String }
    }
  ],
  features: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Hospital', HospitalSchema);
