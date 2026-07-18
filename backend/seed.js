require('dotenv').config();

if (process.env.USE_MOCK_DB === 'true') {
  const mongooseMock = require('./utils/mongooseMock');
  require.cache[require.resolve('mongoose')] = {
    exports: mongooseMock
  };
}

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Doctor = require('./models/Doctor');
const Staff = require('./models/Staff');
const LabAssistant = require('./models/LabAssistant');
const Queue = require('./models/Queue');
const Token = require('./models/Token');
const Patient = require('./models/Patient');
const ChatSession = require('./models/ChatSession');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hospital_queue';

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
    await Queue.deleteMany({});
    await Token.deleteMany({});
    await Patient.deleteMany({});
    await ChatSession.deleteMany({});
    console.log('Collections cleared.');

    // Hash passwords
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);

    // Create Doctors
    console.log('Creating Doctors...');
    const doctorsData = [
      {
        name: 'Dr. Sarah Jenkins',
        email: 'sarah.jenkins@hospital.com',
        passwordHash,
        department: 'Cardiology',
        specialization: 'Heart Failure & Arrhythmias',
        availabilityStatus: 'Available',
        averageCheckupTime: 12,
        currentRoom: 'Cabin 101'
      },
      {
        name: 'Dr. Robert Chen',
        email: 'robert.chen@hospital.com',
        passwordHash,
        department: 'Pediatrics',
        specialization: 'Child Healthcare',
        availabilityStatus: 'Available',
        averageCheckupTime: 8,
        currentRoom: 'Cabin 102'
      },
      {
        name: 'Dr. Emily Taylor',
        email: 'emily.taylor@hospital.com',
        passwordHash,
        department: 'General Medicine',
        specialization: 'General Diagnosis',
        availabilityStatus: 'Available',
        averageCheckupTime: 10,
        currentRoom: 'Cabin 103'
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

    // Create Staff
    console.log('Creating Staff members...');
    const staffData = [
      {
        name: 'Alice Smith',
        username: 'alice_staff',
        passwordHash,
        counterNumber: 'Reception Counter 1'
      },
      {
        name: 'Bob Jones',
        username: 'bob_staff',
        passwordHash,
        counterNumber: 'Reception Counter 2'
      }
    ];

    const insertedStaff = await Staff.insertMany(staffData);
    console.log(`Inserted ${insertedStaff.length} Staff members.`);

    // Create Lab Assistant
    const labData = [
      {
        name: 'CareSync Lab Tech',
        username: 'lab_assistant',
        passwordHash
      }
    ];
    const insertedLab = await LabAssistant.insertMany(labData);
    console.log(`Inserted ${insertedLab.length} Lab Assistants.`);

    console.log('Database seeding successfully completed! 🎉');
    console.log('\n--- Login Credentials ---');
    console.log('Doctor logins:');
    for (const doc of insertedDoctors) {
      console.log(`  Email: ${doc.email} | Password: password123`);
    }
    console.log('Staff logins:');
    for (const st of insertedStaff) {
      console.log(`  Username: ${st.username} | Password: password123`);
    }
    console.log('Lab Assistant logins:');
    for (const lb of insertedLab) {
      console.log(`  Username: ${lb.username} | Password: password123`);
    }
    console.log('-------------------------');

    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seedData();
