require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (err) {
  console.warn('Could not set custom DNS servers:', err.message);
}

// Check the environment before anything else — in particular before the mongoose
// swap below, so a production process configured to run on an in-memory store
// exits here instead of quietly serving a hospital from RAM.
const { useMockDb, allowAnyOrigin, assertEnvironment } = require('./utils/env');
assertEnvironment();

if (useMockDb()) {
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
const pharmacyRoutes = require('./routes/pharmacy');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');
const opsRoutes = require('./routes/ops');
const billingRoutes = require('./routes/billing');
const uploadRoutes = require('./routes/uploads');
const logger = require('./utils/logger');
const { requestObservability, metricsSnapshot } = require('./middleware/observability');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const { runDailyReset } = require('./jobs/dailyReset');
const { apiLimiter } = require('./middleware/rateLimits');

// Every facility this platform serves is in India, and the schedules that matter
// to them — close-of-day, morning reminders — are stated in their local time, not
// the hosting region's. Kept as one constant so a job can never silently inherit
// UTC from the host again.
const FACILITY_TIMEZONE = process.env.FACILITY_TIMEZONE || 'Asia/Kolkata';

const app = express();
const server = http.createServer(app);

// Behind Render/Vercel's reverse proxy the real client IP is in X-Forwarded-For.
// Trust the first proxy hop so express-rate-limit keys on the actual visitor IP
// instead of the proxy IP — otherwise EVERY user shares one bucket and the whole
// site gets throttled (or the limiter never bites). Required for the per-IP
// DDoS/abuse throttling below to work at all in production.
app.set('trust proxy', 1);

// Abuse throttling, keyed by identity rather than IP — see middleware/rateLimits.js
// for why a per-IP cap throttles an entire hospital through one NAT address.
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

  // Outside production, accept anything — that is what makes local work painless.
  // This deliberately no longer consults USE_MOCK_DB: one database convenience
  // flag must not be able to turn the allow-list off on a live server.
  if (allowAnyOrigin()) {
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

  const isAllowed = allowedOrigins.some((o) => o.replace(/\/+$/, '') === cleanOrigin);
  if (isAllowed) {
    return callback(null, true);
  }

  // Gracefully block CORS without throwing a server-side 500 error (return false instead)
  return callback(null, false);
};

// CORS configuration
app.use(
  cors({
    origin: checkOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
    credentials: true
  })
);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled to allow inline styles/scripts from frontend
    crossOriginEmbedderPolicy: false
  })
);
app.use(mongoSanitize()); // Prevent NoSQL query injection
app.use(xss()); // Prevent XSS attacks (inputs)
app.use(hpp()); // Prevent HTTP Parameter Pollution
app.use(express.json({ limit: '1mb' })); // Prevent payload bomb / DoS attacks
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Observability: tag every request with an id, time it, and record metrics.
// Mounted after body parsing but BEFORE the routes, so every handler's logs
// inherit the request id and every response is timed.
app.use(requestObservability);

// Database connection check middleware (except health check, and only if not using mock DB)
app.use((req, res, next) => {
  if (req.path === '/api/v1/health') {
    return next();
  }
  if (!useMockDb() && mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message:
        'Database connection is offline. Please verify you have whitelisted all IP addresses (0.0.0.0/0) in your MongoDB Atlas Network Access panel, or set USE_MOCK_DB=true in backend/.env to run in-memory.'
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
app.use('/api/v1/pharmacy', pharmacyRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/ops', opsRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/uploads', uploadRoutes);

// Health check endpoint.
//
// Used by uptime monitors AND by a human diagnosing "the system is slow", so it
// reports more than a heartbeat: process uptime, memory, the database link, and
// live request metrics (volume, status mix, slowest routes). `?verbose=false`
// gives just the heartbeat for cheap polling.
app.get('/api/v1/health', (req, res) => {
  const dbConnected = useMockDb() || mongoose.connection.readyState === 1;
  const memory = process.memoryUsage();

  const body = {
    status: dbConnected ? 'healthy' : 'degraded',
    timestamp: new Date(),
    database: dbConnected ? 'connected' : 'disconnected',
    mode: useMockDb() ? 'in-memory' : 'mongodb'
  };

  if (req.query.verbose !== 'false') {
    body.process = {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      heapUsedMb: Math.round(memory.heapUsed / 1048576),
      rssMb: Math.round(memory.rss / 1048576)
    };
    body.requests = metricsSnapshot();
  }

  // A monitor should treat a lost database as DOWN, not as a healthy 200.
  res.status(dbConnected ? 200 : 503).json(body);
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Client requests to join a room
  socket.on('join-room', (roomName) => {
    socket.join(roomName);
    console.log(`Client ${socket.id} joined room: ${roomName}`);
  });

  // One-call registration for a portal. Puts the socket in its facility room and
  // its role room so events can be addressed precisely — a lab result no longer
  // wakes every dashboard in every other facility, and a portal can listen for
  // the events that concern IT rather than re-fetching on a global firehose.
  socket.on('register', (info = {}) => {
    const hospital = info.hospital || 'general-hospital';
    const role = info.role;

    socket.join(`hospital:${hospital}`);
    if (role) socket.join(`role:${role}:${hospital}`);
    if (info.doctorId) socket.join(`doctor:${info.doctorId}`);
    // Legacy room: existing screens (public TV, patient tracker) still listen here.
    socket.join('queue:global');

    socket.emit('registered', { hospital, role, rooms: Array.from(socket.rooms) });
    console.log(`Client ${socket.id} registered as ${role || 'viewer'} @ ${hospital}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Close-of-day: archive the day's tokens and clear every facility's board.
//
// The timezone is explicit and NOT the server's. Render runs UTC, so a bare
// '0 0 * * *' fired at 05:30 IST — in the middle of morning OPD preparation
// rather than overnight. Every scheduled job below states its timezone for the
// same reason.
cron.schedule(
  '0 0 * * *',
  async () => {
    try {
      await runDailyReset(io);
    } catch (error) {
      logger.error('[DAILY-RESET] Close-of-day failed', { err: error.message });
    }
  },
  { timezone: FACILITY_TIMEZONE }
);

// Morning re-visit reminders. Same timezone reasoning: on a UTC host this used
// to reach patients at 14:30 IST instead of 09:00.
cron.schedule(
  '0 9 * * *',
  async () => {
    try {
      const { processPendingReminders } = require('./utils/reminderHelper');
      const processed = await processPendingReminders();
      logger.info('[REMINDERS] Morning dispatch complete', { sent: processed.length });
    } catch (error) {
      logger.error('[REMINDERS] Morning dispatch failed', { err: error.message });
    }
  },
  { timezone: FACILITY_TIMEZONE }
);

// Periodic auto follow-up notifications checker (runs every 5 minutes)
setInterval(
  async () => {
    try {
      const { processPendingReminders } = require('./utils/reminderHelper');
      const processed = await processPendingReminders();
      if (processed.length > 0) {
        console.log(
          `[AUTO-REMINDERS] Automatically processed and sent ${processed.length} pending follow-up notifications.`
        );
      }
    } catch (error) {
      console.error('[AUTO-REMINDERS] Background auto follow-up process encountered an error:', error);
    }
  },
  5 * 60 * 1000
); // 5 minutes

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

// Error handling must be mounted LAST, after every route: an unknown path falls
// through to the 404, and anything a handler throws (or an asyncHandler forwards)
// lands in one place that logs it with the request id and returns a consistent
// body — instead of ~50 handlers each inventing their own 500.
app.use(notFoundHandler);
app.use(errorHandler);

// Any bug that escapes the request lifecycle entirely must still be recorded —
// an unlogged crash in a hospital system is the worst possible failure mode.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled promise rejection', {
    err: reason instanceof Error ? reason : new Error(String(reason))
  });
});
process.on('uncaughtException', (err) => {
  logger.error('uncaught exception — process will exit', { err, stack: err.stack });
  process.exit(1);
});

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
          name: 'CareeAi General Hospital',
          slug: 'general-hospital',
          address: '123 Healthcare Blvd, Medical District',
          phone: '+1 (555) 123-4567',
          whatsappNumber: require('./utils/whatsappHelper').getPrimaryWhatsAppNumber(),
          coverImage:
            'https://images.unsplash.com/photo-1517122497576-4b2eb7482b8b?q=80&w=800&auto=format&fit=crop',
          description:
            'Full-service tertiary care facility specializing in cardiology, internal medicine, and emergency care.',
          city: 'Delhi',
          state: 'Delhi',
          district: 'New Delhi',
          coordinates: { lat: 28.6139, lng: 77.209 },
          type: 'Hospital',
          clinicSubtype: 'General',
          customServices: [
            {
              title: 'Emergency Room',
              description: '24/7 fully equipped Emergency Room staffed by trauma specialists.',
              icon: 'local_hospital'
            },
            {
              title: 'Cardiology Unit',
              description: 'Advanced ECG, stress tests, echo screenings, and heart therapies.',
              icon: 'medical_services'
            },
            {
              title: 'Advanced Intensive Care',
              description: 'High-dependency patient care modules with critical monitoring.',
              icon: 'settings_accessibility'
            }
          ],
          features: [
            '24/7 Trauma Care Center',
            'Advanced ICU Ventilation Support',
            'Cashless Insurance Billing'
          ]
        },
        {
          id: 'bright-dental-clinic',
          name: 'BrightDental Specialists Clinic',
          slug: 'bright-dental-clinic',
          address: '456 Kids Care Way, Suite B',
          phone: '+1 (555) 987-6543',
          whatsappNumber: '+15550199999',
          coverImage:
            'https://images.unsplash.com/photo-1629909613654-28e377c37b09?q=80&w=800&auto=format&fit=crop',
          description:
            'Dedicated children and adult dental health center providing laser surgery, cosmetic aligners, and cleanings.',
          city: 'Mumbai',
          state: 'Maharashtra',
          district: 'Mumbai',
          coordinates: { lat: 19.076, lng: 72.8777 },
          type: 'Clinic',
          clinicSubtype: 'Dental',
          customServices: [
            {
              title: 'Cosmetic Dentistry',
              description: 'Porcelain veneers, cosmetic bonding, and premium smile-designing.',
              icon: 'dentistry'
            },
            {
              title: 'Laser Root Canal',
              description: 'High-precision micro-endodontic root canal treatments with laser sterilization.',
              icon: 'dentistry'
            },
            {
              title: 'Orthodontics & Aligners',
              description: 'Invisible aligners, ceramic braces, and dental alignment correction.',
              icon: 'settings_accessibility'
            }
          ],
          features: [
            'Pain-Free Laser Technology',
            'Sterilized Zero-Infection Zone',
            'Experienced Oral Surgeon team'
          ]
        },
        {
          id: 'care-diagnostics',
          name: 'CareeAi Diagnostic Lab',
          slug: 'care-diagnostics',
          address: '789 Science Park East, Lab Block',
          phone: '+1 (555) 321-7654',
          whatsappNumber: '+15550288888',
          coverImage:
            'https://images.unsplash.com/photo-1579154204601-01588f351167?q=80&w=800&auto=format&fit=crop',
          description:
            'State of the art medical diagnostics laboratory, specialized hormone assays, radiography and health check packages.',
          city: 'Kolkata',
          state: 'West Bengal',
          district: 'Kolkata',
          coordinates: { lat: 22.5726, lng: 88.3639 },
          type: 'Lab',
          clinicSubtype: 'General',
          customServices: [
            {
              title: 'Blood & Chemistry Profiling',
              description: 'Automated blood draws, CBC checkups, and standard metabolic panels.',
              icon: 'bloodtype'
            },
            {
              title: 'Biotech Pathology Tests',
              description: 'PCR testing, specialized hormone analysis, and micro-organism checks.',
              icon: 'biotech'
            },
            {
              title: 'Radiology & X-Ray Scans',
              description: 'High-resolution digital chest x-rays, ultrasound screenings, and scans.',
              icon: 'settings_accessibility'
            }
          ],
          features: [
            'NABL Certified Laboratory',
            'Home Sample Collection Support',
            'Barcoded Sample Tracking Systems'
          ]
        },
        {
          id: 'apex-pharmacy',
          name: 'Apex Wellness Pharmacy',
          slug: 'apex-pharmacy',
          address: '55 Station Road, Chemist Market',
          phone: '+1 (555) 765-4321',
          whatsappNumber: '+15550377777',
          coverImage:
            'https://images.unsplash.com/photo-1607619056574-7b8d304a3b6f?q=80&w=800&auto=format&fit=crop',
          description:
            'A genuine medical store and pharmacy supply center offering prescription refills, baby care, and surgical aids.',
          city: 'Delhi',
          state: 'Delhi',
          district: 'Central Delhi',
          coordinates: { lat: 28.625, lng: 77.215 },
          type: 'Medical',
          clinicSubtype: 'Pharmacy',
          customServices: [
            {
              title: 'Genuine Prescription Dispensing',
              description: 'Accurate dispensing of cardiac, diabetic, and general prescription drugs.',
              icon: 'medical_services'
            },
            {
              title: 'Vitamins & Wellness Supplies',
              description: 'Top-tier immunity supplements, baby wellness, and natural protein foods.',
              icon: 'bloodtype'
            },
            {
              title: 'Elder Care & Surgical Supplies',
              description: 'Wheelchairs, walking aids, blood sugar monitors, and knee supports.',
              icon: 'settings_accessibility'
            }
          ],
          features: [
            '100% Genuine Branded Medicines',
            'Cold-Chain Insulin Storage Control',
            'Neighborhood Home Delivery Support'
          ]
        }
      ]);
      console.log('[Mock DB] Hospitals seeded successfully.');
    }

    const docCount = await Doctor.countDocuments();
    if (docCount === 0) {
      console.log('[Mock DB] Seeding initial mock data...');

      const doctors = await Doctor.insertMany([
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
          hospital: 'bright-dental-clinic'
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
        },
        {
          name: 'Dr. Alan Green',
          email: 'alan.green@lab.com',
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
          counterNumber: 'Reception Counter 1',
          hospital: 'general-hospital'
        },
        {
          name: 'Bob Jones',
          counterNumber: 'Reception Counter 2',
          hospital: 'bright-dental-clinic'
        },
        {
          name: 'Charlie Brown',
          counterNumber: 'Lab Ticket Counter 1',
          hospital: 'care-diagnostics'
        },
        {
          name: 'David Miller',
          counterNumber: 'Billing Counter 1',
          hospital: 'apex-pharmacy'
        }
      ]);

      const LabAssistant = require('./models/LabAssistant');
      await LabAssistant.insertMany([
        {
          name: 'CareeAi Lab Tech',
          hospital: 'general-hospital'
        },
        {
          name: 'St. Jude Lab Tech',
          hospital: 'bright-dental-clinic'
        },
        {
          name: 'Diagnostic Lab Tech',
          hospital: 'care-diagnostics'
        }
      ]);

      // The pharmacy counter needs a Pharmacist, not a LabAssistant. "Pharmacy
      // Tech" used to sit in the LabAssistant array above, which meant the
      // pharmacy portal had NO seeded account at all — nobody could sign into it
      // locally — while apex-pharmacy, a Medical facility that requires a
      // pharmacy login and offers no lab bench, was given a lab account instead.
      // Exactly the half-configured tenant FACILITY_TYPE_RULES exists to prevent.
      const Pharmacist = require('./models/Pharmacist');
      await Pharmacist.insertMany([
        {
          name: 'Pharmacy Tech',
          counterNumber: 'Pharmacy Counter 1',
          hospital: 'apex-pharmacy'
        },
        {
          name: 'Hospital Pharmacist',
          counterNumber: 'Pharmacy Counter',
          hospital: 'general-hospital'
        }
      ]);
      console.log('[Mock DB] Seeding completed successfully.');
    }

    // One credential per facility — the only thing anyone signs in with. This
    // runs on every start rather than only alongside the personnel seed, so a
    // database seeded before single sign-in becomes reachable instead of
    // silently refusing every login.
    //
    // The password is taken from SEED_FACILITY_PASSWORD, or generated fresh and
    // printed once. Deliberately not a constant: this file ships to every
    // deployment that ever sets AUTO_SEED, and a password written here would be
    // the same password on all of them.
    const FacilityCredential = require('./models/FacilityCredential');
    const unseeded = [];
    for (const facility of await Hospital.find({})) {
      if (!(await FacilityCredential.findOne({ hospital: facility.id }))) unseeded.push(facility.id);
    }

    if (unseeded.length) {
      const configured = process.env.SEED_FACILITY_PASSWORD;
      const generated = !configured || configured.length < 12;
      const password = generated
        ? `seed-${require('crypto').randomBytes(9).toString('base64url')}`
        : configured;
      const passwordHash = await bcrypt.hash(password, 10);

      for (const hospital of unseeded) {
        await new FacilityCredential({ hospital, passwordHash, setBy: 'auto-seed' }).save();
      }

      console.log(
        `[Mock DB] Facility password set for ${unseeded.length} facilities: ${unseeded.join(', ')}`
      );
      console.log(`[Mock DB] Sign in at /login — password: ${password}`);
      if (generated) {
        console.log('[Mock DB] (generated for this run; set SEED_FACILITY_PASSWORD to pin it)');
      }
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
      const legacyIndex = indexes.find((idx) => idx.name === 'tokenNumber_1');
      if (legacyIndex) {
        await collection.dropIndex('tokenNumber_1');
        console.log(
          '[DB REPAIR] Successfully dropped legacy single tokenNumber_1 index to prevent duplicate key collisions.'
        );
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
            const hostList = srvRecords.map((r) => `${r.name}:${r.port}`).join(',');
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
