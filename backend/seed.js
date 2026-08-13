require('dotenv').config();

if (process.env.USE_MOCK_DB === 'true') {
  const mongooseMock = require('./utils/mongooseMock');
  require.cache[require.resolve('mongoose')] = {
    exports: mongooseMock
  };
}

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Doctor = require('./models/Doctor');
const Staff = require('./models/Staff');
const LabAssistant = require('./models/LabAssistant');
const FacilityCredential = require('./models/FacilityCredential');
const Queue = require('./models/Queue');
const Token = require('./models/Token');
const Patient = require('./models/Patient');
const ChatSession = require('./models/ChatSession');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hospital_queue';

/**
 * The facility password this seed uses.
 *
 * `SEED_FACILITY_PASSWORD` if you set one, otherwise a fresh random phrase
 * printed once at the end of the run. What it is NOT is a constant in this file:
 * seeds get copied into staging, staging gets pointed at a real domain, and a
 * password committed to a repository is a published password. A different one
 * every run is mildly annoying exactly once, which is the point.
 */
function facilityPassword() {
  const configured = process.env.SEED_FACILITY_PASSWORD;
  if (configured && configured.length >= 12) return { password: configured, generated: false };
  return { password: `seed-${crypto.randomBytes(9).toString('base64url')}`, generated: true };
}

async function seedData() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    // Clear all existing data
    console.log('Clearing old collections...');
    await Doctor.deleteMany({});
    await Staff.deleteMany({});
    await LabAssistant.deleteMany({});
    await FacilityCredential.deleteMany({});
    await Queue.deleteMany({});
    await Token.deleteMany({});
    await Patient.deleteMany({});
    await ChatSession.deleteMany({});
    console.log('Collections cleared.');

    // Create Doctors. No passwords: a doctor is a cabin the facility console
    // picks, not an account. See utils/facilityAuth.js.
    console.log('Creating Doctors...');
    const doctorsData = [
      {
        name: 'Dr. Sarah Jenkins',
        email: 'sarah.jenkins@hospital.com',
        department: 'Cardiology',
        specialization: 'Heart Failure & Arrhythmias',
        availabilityStatus: 'Available',
        averageCheckupTime: 12,
        currentRoom: 'Cabin 101',
        hospital: 'general-hospital'
      },
      {
        name: 'Dr. Robert Chen',
        email: 'robert.chen@hospital.com',
        department: 'Pediatrics',
        specialization: 'Child Healthcare',
        availabilityStatus: 'Available',
        averageCheckupTime: 8,
        currentRoom: 'Cabin 102',
        hospital: 'pediatrics-clinic'
      },
      {
        name: 'Dr. Emily Taylor',
        email: 'emily.taylor@hospital.com',
        department: 'General Medicine',
        specialization: 'General Diagnosis',
        availabilityStatus: 'Available',
        averageCheckupTime: 10,
        currentRoom: 'Cabin 103',
        hospital: 'general-hospital'
      }
    ];

    const insertedDoctors = await Doctor.insertMany(doctorsData);
    console.log(`Inserted ${insertedDoctors.length} Doctors.`);

    // Initialize blank queues for each Doctor
    console.log('Initializing empty Queues for each doctor...');
    for (const doc of insertedDoctors) {
      const q = new Queue({ doctor: doc._id, activeQueue: [] });
      await q.save();
    }
    console.log('Queues initialized.');

    // Reception desks and the lab bench — names on a roster, nothing to log in with.
    console.log('Creating reception desks...');
    await Staff.insertMany([
      { name: 'Alice Smith', counterNumber: 'Reception Counter 1', hospital: 'general-hospital' },
      { name: 'Bob Jones', counterNumber: 'Reception Counter 2', hospital: 'pediatrics-clinic' }
    ]);

    await LabAssistant.insertMany([
      { name: 'CareeAi Lab Tech', hospital: 'general-hospital' },
      { name: 'St. Jude Lab Tech', hospital: 'pediatrics-clinic' }
    ]);

    // One credential per facility — the only thing anyone signs in with.
    const facilities = ['general-hospital', 'pediatrics-clinic'];
    const { password, generated } = facilityPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    for (const hospital of facilities) {
      await new FacilityCredential({ hospital, passwordHash, setBy: 'seed' }).save();
    }

    console.log('Database seeding successfully completed! 🎉');
    console.log('\n--- Sign in ---');
    console.log('One password per facility. Choose the facility at /login, then enter it.');
    for (const hospital of facilities) {
      console.log(`  Facility: ${hospital}`);
    }
    console.log(`  Password: ${password}`);
    if (generated) {
      console.log('  (generated for this run — set SEED_FACILITY_PASSWORD to choose your own)');
    }
    console.log('---------------');

    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seedData();
