require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (err) {
  console.warn('Could not set custom DNS servers:', err.message);
}

if (process.env.USE_MOCK_DB === 'true') {
  const mongooseMock = require('./utils/mongooseMock');
  require.cache[require.resolve('mongoose')] = {
    exports: mongooseMock
  };
}

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const staffRoutes = require('./routes/staff');
const doctorRoutes = require('./routes/doctor');
const labRoutes = require('./routes/lab');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');

const Token = require('./models/Token');
const Queue = require('./models/Queue');
const ChatSession = require('./models/ChatSession');
const ArchivedToken = require('./models/ArchivedToken');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// Rate limiter: 60 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many requests from this IP, please try again after a minute.'
  }
});
app.use('/api/', apiLimiter);

const allowedOrigins = [
  'https://hospital-automation-wine.vercel.app',
  'https://www.hospital-automation-wine.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
];

// Robust helper to validate request origins
const checkOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);

  // In development, mock database, or non-production environment, allow all origins
  if (process.env.NODE_ENV !== 'production' || process.env.USE_MOCK_DB === 'true') {
    return callback(null, true);
  }

  const cleanOrigin = origin.replace(/\/+$/, '');

  // Allow any localhost or 127.0.0.1 origin (including any port) in development
  if (
    cleanOrigin.startsWith('http://localhost:') || 
    cleanOrigin.startsWith('http://127.0.0.1:') || 
    cleanOrigin === 'http://localhost' || 
    cleanOrigin === 'http://127.0.0.1'
  ) {
    return callback(null, true);
  }

  const isAllowed = allowedOrigins.some(o => o.replace(/\/+$/, '') === cleanOrigin);
  if (isAllowed) {
    return callback(null, true);
  }

  // Gracefully block CORS without throwing a server-side 500 error (return false instead)
  return callback(null, false);
};

// CORS configuration
app.use(cors({
  origin: checkOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
  credentials: true
}));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow inline styles/scripts from frontend
  crossOriginEmbedderPolicy: false
}));
app.use(mongoSanitize()); // Prevent NoSQL query injection
app.use(xss()); // Prevent XSS attacks (inputs)
app.use(hpp()); // Prevent HTTP Parameter Pollution
app.use(express.json({ limit: '1mb' })); // Prevent payload bomb / DoS attacks
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Database connection check middleware (except health check, and only if not using mock DB)
app.use((req, res, next) => {
  if (req.path === '/api/v1/health') {
    return next();
  }
  if (process.env.USE_MOCK_DB !== 'true' && mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: 'Database connection is offline. Please verify you have whitelisted all IP addresses (0.0.0.0/0) in your MongoDB Atlas Network Access panel, or set USE_MOCK_DB=true in backend/.env to run in-memory.'
    });
  }
  next();
});

// Socket.io initialization
const io = socketIo(server, {
  cors: {
    origin: checkOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Inject socket io into Express requests
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Register API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/staff', staffRoutes);
app.use('/api/v1/doctor', doctorRoutes);
app.use('/api/v1/lab', labRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Client requests to join a room
  socket.on('join-room', (roomName) => {
    socket.join(roomName);
    console.log(`Client ${socket.id} joined room: ${roomName}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Midnight Token Reset and Archival Cron Job
// Scheduled for every night at 12:00 AM (0 0 * * *)
cron.schedule('0 0 * * *', async () => {
  console.log('--- Executing Midnight Queue Archival & Token Reset ---');
  try {
    // Find all active tokens to archive
    const activeTokens = await Token.find().populate('patient').populate('doctor');
    
    const archiveRecords = activeTokens.map(token => {
      return {
        tokenNumber: token.tokenNumber,
        status: token.status,
        tokenType: token.tokenType,
        patientDetails: token.patient ? {
          name: token.patient.name,
          age: token.patient.age,
          gender: token.patient.gender,
          phone: token.patient.phone
        } : { name: 'Unknown' },
        doctorDetails: token.doctor ? {
          name: token.doctor.name,
          department: token.doctor.department,
          currentRoom: token.doctor.currentRoom
        } : { name: 'Unknown' },
        symptoms: token.symptoms,
        calledAt: token.calledAt,
        completedAt: token.completedAt
      };
    });

    if (archiveRecords.length > 0) {
      await ArchivedToken.insertMany(archiveRecords);
      console.log(`Archived ${archiveRecords.length} completed tokens.`);
    }

    // Delete active tokens to reset T-101 sequence
    const deleteResult = await Token.deleteMany({});
    console.log(`Cleared ${deleteResult.deletedCount} active tokens from database.`);

    // Reset Doctor Queues
    await Queue.updateMany({}, {
      currentToken: null,
      activeQueue: [],
      bufferDelay: 0
    });
    console.log('Reset all doctor active queues and buffer times to 0.');

    // Clear stale Chat sessions
    const sessionResult = await ChatSession.deleteMany({});
    console.log(`Cleared ${sessionResult.deletedCount} temporary chatbot sessions.`);

    // Broadcast reset to all clients
    io.emit('queue-reset');
    console.log('Broadcasted queue-reset event to all dashboards.');
    console.log('Midnight maintenance completed successfully. ✅');

  } catch (error) {
    console.error('Midnight archival cron failed:', error);
  }
});

// Re-visit Reminder Processor Cron
// Scheduled for every morning at 9:00 AM (0 9 * * *)
cron.schedule('0 9 * * *', async () => {
  console.log('--- Executing Morning Re-visit Reminders Dispatch ---');
  try {
    const { processPendingReminders } = require('./utils/reminderHelper');
    const processed = await processPendingReminders();
    console.log(`Processed and sent ${processed.length} re-visit reminders.`);
  } catch (error) {
    console.error('Error dispatching reminders cron:', error);
  }
});

// Periodic auto follow-up notifications checker (runs every 5 minutes)
setInterval(async () => {
  try {
    const { processPendingReminders } = require('./utils/reminderHelper');
    const processed = await processPendingReminders();
    if (processed.length > 0) {
      console.log(`[AUTO-REMINDERS] Automatically processed and sent ${processed.length} pending follow-up notifications.`);
    }
  } catch (error) {
    console.error('[AUTO-REMINDERS] Background auto follow-up process encountered an error:', error);
  }
}, 5 * 60 * 1000); // 5 minutes

// Serve frontend build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({ message: 'Hospital Queue Backend is running. Launch Frontend using Vite!' });
  });
}

// Database Connection and Server Startup
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hospital_queue';

const seedMockData = async () => {
  if (process.env.AUTO_SEED !== 'true') {
    console.log('[System DB] Auto-seeding disabled. Operating in clean manual database mode.');
    return;
  }
  try {
    const Hospital = require('./models/Hospital');
    const Doctor = require('./models/Doctor');
    const Staff = require('./models/Staff');
    const Queue = require('./models/Queue');
    const bcrypt = require('bcryptjs');

    const hospCount = await Hospital.countDocuments();
    if (hospCount === 0) {
      console.log('[Mock DB] Seeding initial hospitals...');
      await Hospital.insertMany([
        {
          id: 'general-hospital',
          name: 'CareSync General Hospital',
          slug: 'general-hospital',
          address: '123 Healthcare Blvd, Medical District',
          phone: '+1 (555) 123-4567',
          whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886',
          coverImage: 'https://images.unsplash.com/photo-1517122497576-4b2eb7482b8b?q=80&w=800&auto=format&fit=crop',
          description: 'Full-service tertiary care facility specializing in cardiology, internal medicine, and emergency care.',
          city: 'Delhi',
          coordinates: { lat: 28.6139, lng: 77.2090 },
          type: 'Hospital',
          clinicSubtype: 'General',
          customServices: [
            { title: 'Emergency Room', description: '24/7 fully equipped Emergency Room staffed by trauma specialists.', icon: 'local_hospital' },
            { title: 'Cardiology Unit', description: 'Advanced ECG, stress tests, echo screenings, and heart therapies.', icon: 'medical_services' },
            { title: 'Advanced Intensive Care', description: 'High-dependency patient care modules with critical monitoring.', icon: 'settings_accessibility' }
          ],
          features: ["24/7 Trauma Care Center", "Advanced ICU Ventilation Support", "Cashless Insurance Billing"]
        },
        {
          id: 'bright-dental-clinic',
          name: 'BrightDental Specialists Clinic',
          slug: 'bright-dental-clinic',
          address: '456 Kids Care Way, Suite B',
          phone: '+1 (555) 987-6543',
          whatsappNumber: '+15550199999',
          coverImage: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?q=80&w=800&auto=format&fit=crop',
          description: 'Dedicated children and adult dental health center providing laser surgery, cosmetic aligners, and cleanings.',
          city: 'Mumbai',
          coordinates: { lat: 19.0760, lng: 72.8777 },
          type: 'Clinic',
          clinicSubtype: 'Dental',
          customServices: [
            { title: 'Cosmetic Dentistry', description: 'Porcelain veneers, cosmetic bonding, and premium smile-designing.', icon: 'dentistry' },
            { title: 'Laser Root Canal', description: 'High-precision micro-endodontic root canal treatments with laser sterilization.', icon: 'dentistry' },
            { title: 'Orthodontics & Aligners', description: 'Invisible aligners, ceramic braces, and dental alignment correction.', icon: 'settings_accessibility' }
          ],
          features: ["Pain-Free Laser Technology", "Sterilized Zero-Infection Zone", "Experienced Oral Surgeon team"]
        },
        {
          id: 'care-diagnostics',
          name: 'CareSync Diagnostic Lab',
          slug: 'care-diagnostics',
          address: '789 Science Park East, Lab Block',
          phone: '+1 (555) 321-7654',
          whatsappNumber: '+15550288888',
          coverImage: 'https://images.unsplash.com/photo-1579154204601-01588f351167?q=80&w=800&auto=format&fit=crop',
          description: 'State of the art medical diagnostics laboratory, specialized hormone assays, radiography and health check packages.',
          city: 'Kolkata',
          coordinates: { lat: 22.5726, lng: 88.3639 },
          type: 'Lab',
          clinicSubtype: 'General',
          customServices: [
            { title: 'Blood & Chemistry Profiling', description: 'Automated blood draws, CBC checkups, and standard metabolic panels.', icon: 'bloodtype' },
            { title: 'Biotech Pathology Tests', description: 'PCR testing, specialized hormone analysis, and micro-organism checks.', icon: 'biotech' },
            { title: 'Radiology & X-Ray Scans', description: 'High-resolution digital chest x-rays, ultrasound screenings, and scans.', icon: 'settings_accessibility' }
          ],
          features: ["NABL Certified Laboratory", "Home Sample Collection Support", "Barcoded Sample Tracking Systems"]
        },
        {
          id: 'apex-pharmacy',
          name: 'Apex Wellness Pharmacy',
          slug: 'apex-pharmacy',
          address: '55 Station Road, Chemist Market',
          phone: '+1 (555) 765-4321',
          whatsappNumber: '+15550377777',
          coverImage: 'https://images.unsplash.com/photo-1607619056574-7b8d304a3b6f?q=80&w=800&auto=format&fit=crop',
          description: 'A genuine medical store and pharmacy supply center offering prescription refills, baby care, and surgical aids.',
          city: 'Delhi',
          coordinates: { lat: 28.6250, lng: 77.2150 },
          type: 'Medical',
          clinicSubtype: 'Pharmacy',
          customServices: [
            { title: 'Genuine Prescription Dispensing', description: 'Accurate dispensing of cardiac, diabetic, and general prescription drugs.', icon: 'medical_services' },
            { title: 'Vitamins & Wellness Supplies', description: 'Top-tier immunity supplements, baby wellness, and natural protein foods.', icon: 'bloodtype' },
            { title: 'Elder Care & Surgical Supplies', description: 'Wheelchairs, walking aids, blood sugar monitors, and knee supports.', icon: 'settings_accessibility' }
          ],
          features: ["100% Genuine Branded Medicines", "Cold-Chain Insulin Storage Control", "Neighborhood Home Delivery Support"]
        }
      ]);
      console.log('[Mock DB] Hospitals seeded successfully.');
    }

    const docCount = await Doctor.countDocuments();
    if (docCount === 0) {
      console.log('[Mock DB] Seeding initial mock data...');
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('password123', salt);

      const doctors = await Doctor.insertMany([
        {
          name: 'Dr. Sarah Jenkins',
          email: 'sarah.jenkins@hospital.com',
          passwordHash,
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
          passwordHash,
          department: 'Pediatrics',
          specialization: 'Child Healthcare',
          availabilityStatus: 'Available',
          averageCheckupTime: 8,
          currentRoom: 'Cabin 102',
          hospital: 'bright-dental-clinic'
        },
        {
          name: 'Dr. Emily Taylor',
          email: 'emily.taylor@hospital.com',
          passwordHash,
          department: 'General Medicine',
          specialization: 'General Diagnosis',
          availabilityStatus: 'Available',
          averageCheckupTime: 10,
          currentRoom: 'Cabin 103',
          hospital: 'general-hospital'
        },
        {
          name: 'Dr. Alan Green',
          email: 'alan.green@lab.com',
          passwordHash,
          department: 'Emergency',
          specialization: 'Hematology Specialist',
          availabilityStatus: 'Available',
          averageCheckupTime: 15,
          currentRoom: 'Lab Room A',
          hospital: 'care-diagnostics'
        },
        {
          name: 'Dr. Clara Watson',
          email: 'clara.watson@medical.com',
          passwordHash,
          department: 'General Medicine',
          specialization: 'Pharmacist Consultations',
          availabilityStatus: 'Available',
          averageCheckupTime: 5,
          currentRoom: 'Prescription Counter A',
          hospital: 'apex-pharmacy'
        }
      ]);

      for (const doc of doctors) {
        await new Queue({ doctor: doc._id, activeQueue: [] }).save();
      }

      await Staff.insertMany([
        {
          name: 'Alice Smith',
          username: 'alice_staff',
          passwordHash,
          counterNumber: 'Reception Counter 1',
          hospital: 'general-hospital'
        },
        {
          name: 'Bob Jones',
          username: 'bob_staff',
          passwordHash,
          counterNumber: 'Reception Counter 2',
          hospital: 'bright-dental-clinic'
        },
        {
          name: 'Charlie Brown',
          username: 'charlie_staff',
          passwordHash,
          counterNumber: 'Lab Ticket Counter 1',
          hospital: 'care-diagnostics'
        },
        {
          name: 'David Miller',
          username: 'david_staff',
          passwordHash,
          counterNumber: 'Billing Counter 1',
          hospital: 'apex-pharmacy'
        }
      ]);

      const LabAssistant = require('./models/LabAssistant');
      await LabAssistant.insertMany([
        {
          name: 'CareSync Lab Tech',
          username: 'lab_assistant',
          passwordHash,
          hospital: 'general-hospital'
        },
        {
          name: 'St. Jude Lab Tech',
          username: 'ped_lab_assistant',
          passwordHash,
          hospital: 'bright-dental-clinic'
        },
        {
          name: 'Diagnostic Lab Tech',
          username: 'diag_lab_assistant',
          passwordHash,
          hospital: 'care-diagnostics'
        },
        {
          name: 'Pharmacy Tech',
          username: 'pharm_assistant',
          passwordHash,
          hospital: 'apex-pharmacy'
        }
      ]);
      console.log('[Mock DB] Seeding completed successfully. Login ready.');
    }
  } catch (err) {
    console.error('[Mock DB] Auto-seeding failed:', err);
  }
};

server.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});

const repairDatabaseIndexes = async () => {
  try {
    if (mongoose.connection && mongoose.connection.db) {
      const collection = mongoose.connection.db.collection('tokens');
      const indexes = await collection.indexes();
      const legacyIndex = indexes.find(idx => idx.name === 'tokenNumber_1');
      if (legacyIndex) {
        await collection.dropIndex('tokenNumber_1');
        console.log('[DB REPAIR] Successfully dropped legacy single tokenNumber_1 index to prevent duplicate key collisions.');
      }
    }
  } catch (idxErr) {
    console.warn('[DB REPAIR] Index check completed:', idxErr.message);
  }
};

const connectWithFallback = async (uri) => {
  try {
    await mongoose.connect(uri);
    console.log('Successfully connected to MongoDB.');
    await repairDatabaseIndexes();
    await seedMockData();
  } catch (err) {
    console.error('Initial database connection failed:', err.message);

    if (uri.startsWith('mongodb+srv://')) {
      console.log('Attempting to resolve MongoDB SRV records via public DNS backup resolver...');
      try {
        // Parse mongodb+srv://username:password@host/database?...
        const match = uri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]*)/);
        if (match) {
          const [_, username, password, host, dbName] = match;

          // Query DNS SRV records using public resolver (8.8.8.8)
          const dns = require('dns');
          const resolver = new dns.Resolver();
          resolver.setServers(['8.8.8.8', '1.1.1.1']);

          const srvRecords = await new Promise((resolve, reject) => {
            resolver.resolveSrv(`_mongodb._tcp.${host}`, (srvErr, addresses) => {
              if (srvErr) reject(srvErr);
              else resolve(addresses);
            });
          });

          if (srvRecords && srvRecords.length > 0) {
            const hostList = srvRecords.map(r => `${r.name}:${r.port}`).join(',');
            const fallbackUri = `mongodb://${username}:${password}@${hostList}/${dbName}?ssl=true&authSource=admin`;

            console.log('Connecting to replica set hosts directly (bypassing SRV)...');
            await mongoose.connect(fallbackUri);
            console.log('Successfully connected to MongoDB replica set directly via fallback!');
            await seedMockData();
            return;
          }
        }
      } catch (fallbackErr) {
        console.error('Database connection fallback also failed:', fallbackErr.message);
      }
    }
    console.error('Database connection could not be established.');
  }
};

connectWithFallback(MONGODB_URI);
