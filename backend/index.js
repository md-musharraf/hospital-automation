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

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const staffRoutes = require('./routes/staff');
const doctorRoutes = require('./routes/doctor');
const labRoutes = require('./routes/lab');
const messageRoutes = require('./routes/messages');

const Token = require('./models/Token');
const Queue = require('./models/Queue');
const ChatSession = require('./models/ChatSession');
const ArchivedToken = require('./models/ArchivedToken');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'https://hospital-automation-wine.vercel.app',
  'https://www.hospital-automation-wine.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
];

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    // Remove trailing slashes for comparison
    const cleanOrigin = origin.replace(/\/+$/, '');
    const isAllowed = allowedOrigins.some(o => o.replace(/\/+$/, '') === cleanOrigin);
    if (!isAllowed) {
      const msg = `The CORS policy for this site does not allow access from origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Socket.io initialization
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
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
  try {
    const Doctor = require('./models/Doctor');
    const Staff = require('./models/Staff');
    const Queue = require('./models/Queue');
    const bcrypt = require('bcryptjs');

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
      ]);

      for (const doc of doctors) {
        await new Queue({ doctor: doc._id, activeQueue: [] }).save();
      }

      await Staff.insertMany([
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
      ]);

      const LabAssistant = require('./models/LabAssistant');
      await LabAssistant.insertMany([
        {
          name: 'CareSync Lab Tech',
          username: 'lab_assistant',
          passwordHash
        }
      ]);
      console.log('[Mock DB] Seeding completed successfully. Login ready.');
    }
  } catch (err) {
    console.error('[Mock DB] Auto-seeding failed:', err);
  }
};

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Successfully connected to MongoDB.');
    await seedMockData();
    server.listen(PORT, () => {
      console.log(`Backend server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database connection error:', err);
  });
