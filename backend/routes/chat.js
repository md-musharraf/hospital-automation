const express = require('express');
const router = express.Router();
const ChatSession = require('../models/ChatSession');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const Queue = require('../models/Queue');
const Hospital = require('../models/Hospital');
const { recalculateQueueTimes } = require('../utils/queueHelper');
const { sendWhatsAppNotification, getWhatsAppConfig, setWhatsAppConfig, getWhatsAppHistory } = require('../utils/whatsappHelper');
const { generateUniqueTokenNumber, saveTokenWithRetry } = require('../utils/tokenHelper');

// Bilingual Translation Dictionary
const dictionary = {
  en: {
    welcome: 'Welcome to CareSync AI Assistant! 🏥 (You can also chat with us on WhatsApp at ' + (process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886').replace(/^whatsapp:/i, '') + ')',
    selectOption: 'Please select an option below to proceed:',
    options: [
      'Book New Appointment / Generate Token',
      'Re-visit (Existing Patient)',
      'Emergency SOS Token',
      'Check Live Queue Status'
    ],
    enterPhone: "To begin, please enter the Patient's Phone Number (e.g. +91 9876543210):",
    invalidPhone: 'Please enter a valid Phone Number (minimum 7 characters):',
    invalidName: 'Please enter a valid name (at least 2 characters):',
    welcomeBackPhone: "Welcome back! Please enter your registered Phone Number to locate your file:",
    emergencyPhone: "🚨 EMERGENCY SOS TRIGGERED. Please enter the Patient's Phone Number immediately:",
    welcomeBackText: (name, age, gender) => `Welcome back, ${name}! I located your details (Age: ${age}, Gender: ${gender}).`,
    describeSymptoms: 'Please describe your current symptoms (e.g. high fever, throat pain):',
    phoneNotFound: "I couldn't find a registration for this number. Let's register you as a new patient.",
    enterFullName: "Please enter the Patient's Full Name:",
    enterFullNameGeneric: "Thank you. Now, please enter the Patient's Full Name:",
    enterAge: (name) => `Got it. What is the age of ${name}?`,
    invalidAge: 'Please enter a valid age (a number between 1 and 130):',
    selectGender: "Select the patient's gender:",
    genderOptions: ['Male', 'Female', 'Other'],
    invalidGender: 'Please choose one of the options below:',
    describeSymptomsLong: 'Please describe the symptoms (e.g., high fever, chest tightness, coughing):',
    noDoctors: 'No doctors are currently available. Type "Hi" to try again later.',
    selectDoctorPrompt: 'Select an available doctor to book your token:',
    invalidDoctor: 'Invalid doctor selection. Please choose from the list:',
    bookingCompleteHeader: 'Booking Complete! 🎉',
    bookingCompleteBody: (tokenNumber, doctor, room, wait) => `• Token Number: ${tokenNumber}\n• Doctor: ${doctor}\n• Cabin: ${room}\n• Estimated Wait: ${wait} mins.`,
    defaultCatchAll: 'Your previous booking is complete. Type "Hi" to start a new inquiry!',
    enterTokenToCheck: 'Please enter your Token Number (e.g., T-101 or T-102):',
    tokenNotFound: 'Token not found. Please verify the token number and try again, or type "Hi" to restart.',
    statusInCabin: 'You are currently inside the cabin! Please proceed.',
    statusWaiting: (position, wait) => `There are ${position - 1} patient(s) ahead of you. Estimated wait: ${wait} mins.`,
    statusCompleted: (status) => `Status: ${status}. Checkup complete or token cancelled.`,
    tokenDetailsHeader: (tokenNumber) => `Token Details for ${tokenNumber}:`,
    tokenDetailsBody: (patient, doctor, dept, statusText) => `• Patient: ${patient}\n• Doctor: ${doctor} (${dept})\n• Live Status: ${statusText}`
  },
  hi: {
    welcome: 'केयरसिंक एआई असिस्टेंट में आपका स्वागत है! 🏥 (आप हमसे सीधे व्हाट्सएप पर ' + (process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886').replace(/^whatsapp:/i, '') + ' पर भी चैट कर सकते हैं)',
    selectOption: 'कृपया आगे बढ़ने के लिए नीचे दिए गए विकल्पों में से एक चुनें:',
    options: [
      'नया अपॉइंटमेंट बुक करें / टोकन जेनरेट करें',
      'दोबारा विजिट (मौजूदा मरीज)',
      'इमरजेंसी एसओएस टोकन',
      'लाइव क्यू स्टेटस जांचें'
    ],
    enterPhone: "शुरू करने के लिए, कृपया मरीज का मोबाइल नंबर दर्ज करें (उदा. +91 9876543210):",
    invalidPhone: 'कृपया एक सही मोबाइल नंबर दर्ज करें (कम से कम 7 अंक):',
    invalidName: 'कृपया एक वैध नाम दर्ज करें (कम से कम 2 अक्षर):',
    welcomeBackPhone: "वापसी पर आपका स्वागत है! अपनी फ़ाइल ढूँढने के लिए अपना पंजीकृत मोबाइल नंबर दर्ज करें:",
    emergencyPhone: "🚨 इमरजेंसी एसओएस। कृपया तुरंत मरीज का मोबाइल नंबर दर्ज करें:",
    welcomeBackText: (name, age, gender) => `वापसी पर आपका स्वागत है, ${name}! मुझे आपकी जानकारी मिल गई है (उम्र: ${age}, लिंग: ${gender === 'Male' ? 'पुरुष' : gender === 'Female' ? 'महिला' : 'अन्य'}).`,
    describeSymptoms: 'कृपया अपने वर्तमान लक्षणों का वर्णन करें (जैसे: तेज़ बुखार, गले में दर्द):',
    phoneNotFound: "मुझे इस नंबर का कोई रजिस्ट्रेशन नहीं मिला। आइए आपको एक नए मरीज के रूप में पंजीकृत करें।",
    enterFullName: "कृपया मरीज का पूरा नाम दर्ज करें:",
    enterFullNameGeneric: "धन्यवाद। अब, कृपया मरीज का पूरा नाम दर्ज करें:",
    enterAge: (name) => `ठीक है। ${name} की उम्र क्या है?`,
    invalidAge: 'कृपया एक सही उम्र दर्ज करें (1 से 130 के बीच की संख्या):',
    selectGender: 'मरीज का लिंग चुनें:',
    genderOptions: ['पुरुष', 'महिला', 'अन्य'],
    invalidGender: 'कृपया नीचे दिए गए विकल्पों में से एक चुनें:',
    describeSymptomsLong: 'कृपया अपने लक्षणों का संक्षेप में वर्णन करें (जैसे: तेज़ बुखार, सांस लेने में तकलीफ, खांसी):',
    noDoctors: 'वर्तमान में कोई डॉक्टर उपलब्ध नहीं हैं। बाद में पुनः प्रयास करने के लिए "Hi" टाइप करें।',
    selectDoctorPrompt: 'टोकन बुक करने के लिए उपलब्ध डॉक्टर का चयन करें:',
    invalidDoctor: 'गलत डॉक्टर का चयन। कृपया सूची में से चुनें:',
    bookingCompleteHeader: 'बुकिंग पूरी हो गई! 🎉',
    bookingCompleteBody: (tokenNumber, doctor, room, wait) => `• टोकन नंबर: ${tokenNumber}\n• डॉक्टर: ${doctor}\n• केबिन: ${room}\n• अनुमानित प्रतीक्षा समय: ${wait} मिनट।`,
    defaultCatchAll: 'आपकी पिछली बुकिंग पूरी हो चुकी है। नया टोकन बनाने के लिए "Hi" टाइप करें!',
    enterTokenToCheck: 'कृपया अपना टोकन नंबर दर्ज करें (उदा. T-101 या T-102):',
    tokenNotFound: 'टोकन नहीं मिला। कृपया टोकन नंबर की जांच करें और पुनः प्रयास करें, या पुनरारंभ करने के लिए "Hi" टाइप करें।',
    statusInCabin: 'आप वर्तमान में केबिन के अंदर हैं! कृपया आगे बढ़ें।',
    statusWaiting: (position, wait) => `आपसे आगे ${position - 1} मरीज हैं। अनुमानित प्रतीक्षा समय: ${wait} मिनट।`,
    statusCompleted: (status) => `स्थिति: ${status === 'Completed' ? 'पूर्ण' : status}. चेकअप पूरा हो चुका है या टोकन रद्द कर दिया गया है.`,
    tokenDetailsHeader: (tokenNumber) => `टोकन विवरण ${tokenNumber} के लिए:`,
    tokenDetailsBody: (patient, doctor, dept, statusText) => `• मरीज: ${patient}\n• डॉक्टर: ${doctor} (${dept})\n• लाइव स्थिति: ${statusText}`
  }
};


async function processChatMessage({ sessionId, message, hospitalId, socketIo }) {
  let session = await ChatSession.findOne({ sessionId });
  if (!session) {
    session = new ChatSession({ sessionId, currentState: 'LANGUAGE', tempData: {} });
  }

  // Refresh the TTL field on every turn so the 1-hour `expires` index (see
  // models/ChatSession.js) is a sliding inactivity window, not a hard
  // 1-hour-from-creation cutoff that would delete an in-progress booking
  // session out from under an actively chatting patient.
  session.lastActivity = new Date();

  if (!session.tempData) {
    session.tempData = {};
  }

  if (hospitalId) {
    session.tempData = { ...session.tempData, hospitalId };
    session.markModified && session.markModified('tempData');
    await session.save();
  }

  const cleanMsg = message ? message.trim() : '';

  // Direct Hospital QR Code Trigger Detector (e.g. "HI_general-hospital", "BOOK_general-hospital", "HI_CITY_CARE")
  let qrHospital = null;
  const qrPrefixMatch = cleanMsg.match(/^(?:hi_|book_|hosp_)?([a-z0-9_-]+)$/i);
  if (qrPrefixMatch && cleanMsg.length >= 3) {
    const candidateIdOrSlug = qrPrefixMatch[1].toLowerCase();
    qrHospital = await Hospital.findOne({
      $or: [
        { id: candidateIdOrSlug },
        { slug: candidateIdOrSlug },
        { id: cleanMsg.toLowerCase() },
        { slug: cleanMsg.toLowerCase() }
      ]
    });
  }

  // If message is a Hospital QR Code trigger scan
  if (qrHospital) {
    session.currentState = 'LANGUAGE';
    session.tempData = { hospitalId: qrHospital.id };
    session.markModified && session.markModified('tempData');
    await session.save();

    const rawWhatsapp = qrHospital.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';
    const num = rawWhatsapp.replace(/^whatsapp:/i, '');

    return {
      messages: [
        { 
          sender: 'bot', 
          text: `🏥 *Welcome to ${qrHospital.name}!*\n📍 ${qrHospital.address}, ${qrHospital.city}\n📞 Phone: ${qrHospital.phone}\n\nPlease select your preferred language / अपनी पसंदीदा भाषा चुनें:\n• English\n• हिन्दी\n\n(Tip: Reply "Info" for facility photos & services)` 
        }
      ],
      options: ['English', 'हिन्दी', 'Facility Info']
    };
  }

  const currentHospId = (session.tempData && session.tempData.hospitalId) || hospitalId || 'general-hospital';
  const hospital = await Hospital.findOne({ id: currentHospId }) || await Hospital.findOne({});

  // Reset triggers
  const resetTriggers = ['hi', 'hello', 'hey', 'start', 'reset', 'restart', 'नमस्ते'];
  if (resetTriggers.includes(cleanMsg.toLowerCase())) {
    session.currentState = 'LANGUAGE';
    session.tempData = { hospitalId: currentHospId };
    session.markModified && session.markModified('tempData');
    await session.save();

    const rawWhatsapp = hospital ? (hospital.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886') : '+14155238886';
    const num = rawWhatsapp.replace(/^whatsapp:/i, '');
    const facilityName = hospital ? hospital.name : 'CareSync';

    return {
      messages: [
        { sender: 'bot', text: `Welcome to ${facilityName} AI Assistant! 🏥\n(WhatsApp: ${num})\n\nPlease select your preferred language / अपनी पसंदीदा भाषा चुनें:\n• English\n• हिन्दी\n\n(Tip: Reply "Info" for facility images, doctors count & services)` }
      ],
      options: ['English', 'हिन्दी', 'Facility Info']
    };
  }

  // Facility Info inquiry trigger
  const infoTriggers = ['info', 'facility info', 'doctor info', 'doctors', 'images', 'photos', 'gallery', 'services', 'facility'];
  if (infoTriggers.includes(cleanMsg.toLowerCase())) {
    if (hospital) {
      const docCount = hospital.doctorCount || await Doctor.countDocuments({ hospital: hospital.id });
      const logoStr = hospital.logoUrl ? `\n• Logo: ${hospital.logoUrl}` : '';
      const coverStr = hospital.coverImage ? `\n• Cover Photo: ${hospital.coverImage}` : '';
      const galleryStr = (hospital.galleryImages && hospital.galleryImages.length > 0) 
        ? `\n• Gallery Photos:\n  ${hospital.galleryImages.join('\n  ')}` 
        : '';
      const servicesStr = (hospital.customServices && hospital.customServices.length > 0) 
        ? `\n• Key Services: ${hospital.customServices.map(s => s.title).join(', ')}` 
        : '';

      const infoText = `🏥 *${hospital.name}* (${hospital.type || 'Hospital'})\n📍 ${hospital.address}, ${hospital.city}\n📞 Phone: ${hospital.phone}\n💬 WhatsApp: ${hospital.whatsappNumber}\n👨‍⚕️ Registered Doctors: ${docCount}${logoStr}${coverStr}${galleryStr}${servicesStr}`;
      return {
        messages: [{ sender: 'bot', text: infoText }],
        options: dictionary[(session.tempData && session.tempData.language) || 'en'].options
      };
    }
  }

  // Handshake for language choice at the start
  if (session.currentState === 'LANGUAGE') {
    const selectedLanguage = (cleanMsg === 'हिन्दी' || cleanMsg === '2') ? 'hi' : 'en';
    session.tempData = { ...session.tempData, language: selectedLanguage };
    session.currentState = 'WELCOME';
    session.markModified && session.markModified('tempData');
    await session.save();

    const langText = dictionary[selectedLanguage];
    return {
      messages: [
        { sender: 'bot', text: langText.welcome },
        { sender: 'bot', text: langText.selectOption }
      ],
      options: langText.options
    };
  }

  // Fetch current language
  const lang = (session.tempData && session.tempData.language) || 'en';
  const text = dictionary[lang];
  const state = session.currentState;

  // WELCOME state processing
  if (state === 'WELCOME') {
    const isRegular = cleanMsg === '1' || cleanMsg === 'Book New Appointment / Generate Token' || cleanMsg === 'नया अपॉइंटमेंट बुक करें / टोकन जेनरेट करें';
    const isRevisit = cleanMsg === '2' || cleanMsg === 'Re-visit (Existing Patient)' || cleanMsg === 'दोबारा विजिट (मौजूदा मरीज)';
    const isEmergency = cleanMsg === '3' || cleanMsg === 'Emergency SOS Token' || cleanMsg === 'इमरजेंसी एसओएस टोकन';
    const isCheckStatus = cleanMsg === '4' || cleanMsg === 'Check Live Queue Status' || cleanMsg === 'लाइव क्यू स्टेटस जांचें';

    if (isRegular) {
      session.currentState = 'AWAITING_PHONE';
      session.tempData = { ...session.tempData, tokenType: 'Regular' };
      session.markModified && session.markModified('tempData');
      await session.save();
      return {
        messages: [{ sender: 'bot', text: text.enterPhone }],
        options: []
      };
    } 
    else if (isRevisit) {
      session.currentState = 'AWAITING_PHONE';
      session.tempData = { ...session.tempData, tokenType: 'Re-visit' };
      session.markModified && session.markModified('tempData');
      await session.save();
      return {
        messages: [{ sender: 'bot', text: text.welcomeBackPhone }],
        options: []
      };
    } 
    else if (isEmergency) {
      session.currentState = 'AWAITING_PHONE';
      session.tempData = { ...session.tempData, tokenType: 'Emergency' };
      session.markModified && session.markModified('tempData');
      await session.save();
      return {
        messages: [{ sender: 'bot', text: text.emergencyPhone }],
        options: []
      };
    } 
    else if (isCheckStatus) {
      session.tempData = { ...session.tempData, checkingStatus: true };
      session.markModified && session.markModified('tempData');
      await session.save();
      return {
        messages: [{ sender: 'bot', text: text.enterTokenToCheck }],
        options: []
      };
    } 
    else if (session.tempData && session.tempData.checkingStatus) {
      const token = await Token.findOne({ tokenNumber: cleanMsg.toUpperCase() })
        .populate('patient')
        .populate('doctor');

      if (!token || !token.doctor || !token.patient) {
        // token.doctor/token.patient can be null if the referenced Doctor or
        // Patient document was deleted after the token was created — treat
        // that the same as "not found" instead of crashing on `._id`/`.name`.
        return {
          messages: [{ sender: 'bot', text: text.tokenNotFound }],
          options: []
        };
      }

      const queue = await Queue.findOne({ doctor: token.doctor._id });
      let position = -1;
      if (queue) {
        if (queue.currentToken && queue.currentToken.toString() === token._id.toString()) {
          position = 0; // In cabin
        } else {
          position = queue.activeQueue.findIndex(id => id.toString() === token._id.toString()) + 1;
        }
      }

      let statusText = '';
      if (position === 0) {
        statusText = text.statusInCabin;
      } else if (position > 0) {
        statusText = text.statusWaiting(position, token.estimatedWaitTime);
      } else {
        statusText = text.statusCompleted(token.status);
      }

      session.tempData = { language: lang, hospitalId: currentHospId };
      session.currentState = 'WELCOME';
      session.markModified && session.markModified('tempData');
      await session.save();

      return {
        messages: [
          { sender: 'bot', text: text.tokenDetailsHeader(token.tokenNumber) },
          { sender: 'bot', text: text.tokenDetailsBody(token.patient.name, token.doctor.name, token.doctor.department, statusText) }
        ],
        options: text.options
      };
    } 
    else {
      return {
        messages: [{ sender: 'bot', text: text.defaultCatchAll }],
        options: text.options
      };
    }
  }

  // AWAITING_PHONE state
  if (state === 'AWAITING_PHONE') {
    if (!cleanMsg || cleanMsg.length < 7) {
      return {
        messages: [{ sender: 'bot', text: text.invalidPhone }],
        options: []
      };
    }

    session.tempData = { ...session.tempData, phone: cleanMsg };

    if (session.tempData.tokenType === 'Re-visit') {
      const patient = await Patient.findOne({ 
        hospital: currentHospId, 
        $or: [{ phone: cleanMsg }, { phone: cleanMsg.replace(/\s+/g, '') }] 
      });
      if (patient) {
        session.tempData = {
          ...session.tempData,
          name: patient.name,
          age: patient.age,
          gender: patient.gender
        };
        session.currentState = 'AWAITING_SYMPTOMS';
        session.markModified && session.markModified('tempData');
        await session.save();

        return {
          messages: [
            { sender: 'bot', text: text.welcomeBackText(patient.name, patient.age, patient.gender) },
            { sender: 'bot', text: text.describeSymptoms }
          ],
          options: []
        };
      } else {
        session.currentState = 'AWAITING_NAME';
        session.markModified && session.markModified('tempData');
        await session.save();
        return {
          messages: [
            { sender: 'bot', text: text.phoneNotFound },
            { sender: 'bot', text: text.enterFullName }
          ],
          options: []
        };
      }
    }

    session.currentState = 'AWAITING_NAME';
    session.markModified && session.markModified('tempData');
    await session.save();
    return {
      messages: [{ sender: 'bot', text: text.enterFullNameGeneric }],
      options: []
    };
  }

  // AWAITING_NAME state
  if (state === 'AWAITING_NAME') {
    if (!cleanMsg) {
      return {
        messages: [{ sender: 'bot', text: text.invalidName }],
        options: []
      };
    }
    session.tempData = { ...session.tempData, name: cleanMsg };
    session.currentState = 'AWAITING_AGE';
    session.markModified && session.markModified('tempData');
    await session.save();
    return {
      messages: [{ sender: 'bot', text: text.enterAge(cleanMsg) }],
      options: []
    };
  }

  // AWAITING_AGE state
  if (state === 'AWAITING_AGE') {
    const age = parseInt(cleanMsg);
    if (isNaN(age) || age <= 0 || age > 130) {
      return {
        messages: [{ sender: 'bot', text: text.invalidAge }],
        options: []
      };
    }
    session.tempData = { ...session.tempData, age };
    session.currentState = 'AWAITING_GENDER';
    session.markModified && session.markModified('tempData');
    await session.save();
    return {
      messages: [{ sender: 'bot', text: text.selectGender }],
      options: text.genderOptions
    };
  }

  // AWAITING_GENDER state
  if (state === 'AWAITING_GENDER') {
    const isMale = cleanMsg === '1' || cleanMsg === 'Male' || cleanMsg === 'पुरुष';
    const isFemale = cleanMsg === '2' || cleanMsg === 'Female' || cleanMsg === 'महिला';
    const isOther = cleanMsg === '3' || cleanMsg === 'Other' || cleanMsg === 'अन्य';

    if (!isMale && !isFemale && !isOther) {
      return {
        messages: [{ sender: 'bot', text: text.invalidGender }],
        options: text.genderOptions
      };
    }
    session.tempData = { ...session.tempData, gender: isMale ? 'Male' : isFemale ? 'Female' : 'Other' };
    session.currentState = 'AWAITING_SYMPTOMS';
    session.markModified && session.markModified('tempData');
    await session.save();
    return {
      messages: [{ sender: 'bot', text: text.describeSymptomsLong }],
      options: []
    };
  }

  // AWAITING_SYMPTOMS state
  if (state === 'AWAITING_SYMPTOMS') {
    if (!session.tempData || !session.tempData.symptoms) {
      session.tempData = { ...session.tempData, symptoms: cleanMsg };
      session.markModified && session.markModified('tempData');
      await session.save();

      let doctors = await Doctor.find({ 
        hospital: currentHospId, 
        availabilityStatus: { $ne: 'Unavailable' } 
      });
      if (!doctors || doctors.length === 0) {
        doctors = await Doctor.find({ availabilityStatus: { $ne: 'Unavailable' } });
      }
      if (!doctors || doctors.length === 0) {
        doctors = await Doctor.find({});
      }
      if (!doctors || doctors.length === 0) {
        doctors = [
          { _id: 'doc_sarah', name: 'Dr. Sarah Jenkins', department: 'General Medicine', specialization: 'General Physician', currentRoom: '101', averageCheckupTime: 15 },
          { _id: 'doc_rahul', name: 'Dr. Rahul Sharma', department: 'Cardiology', specialization: 'Cardiologist', currentRoom: '102', averageCheckupTime: 15 }
        ];
      }

      const docNames = doctors.map(d => `${d.name} (${d.department})`);
      return {
        messages: [{ sender: 'bot', text: text.selectDoctorPrompt }],
        options: docNames
      };
    } 
    else {
      let doctors = await Doctor.find({ 
        hospital: currentHospId, 
        availabilityStatus: { $ne: 'Unavailable' } 
      });
      if (!doctors || doctors.length === 0) {
        doctors = await Doctor.find({ availabilityStatus: { $ne: 'Unavailable' } });
      }
      if (!doctors || doctors.length === 0) {
        doctors = await Doctor.find({});
      }
      if (!doctors || doctors.length === 0) {
        doctors = [
          { _id: 'doc_sarah', name: 'Dr. Sarah Jenkins', department: 'General Medicine', specialization: 'General Physician', currentRoom: '101', averageCheckupTime: 15 },
          { _id: 'doc_rahul', name: 'Dr. Rahul Sharma', department: 'Cardiology', specialization: 'Cardiologist', currentRoom: '102', averageCheckupTime: 15 }
        ];
      }

      let selectedDoc = doctors.find(d => `${d.name} (${d.department})` === cleanMsg);
      
      // Numeric option selection fallback
      const docIdx = parseInt(cleanMsg) - 1;
      if (!selectedDoc && !isNaN(docIdx) && doctors[docIdx]) {
        selectedDoc = doctors[docIdx];
      }

      // Name-based loose matching fallback
      if (!selectedDoc) {
        selectedDoc = doctors.find(d => 
          cleanMsg.toLowerCase().includes(d.name.toLowerCase()) || 
          d.name.toLowerCase().includes(cleanMsg.toLowerCase())
        );
      }

      if (!selectedDoc) {
        const docNames = doctors.map(d => `${d.name} (${d.department})`);
        return {
          messages: [{ sender: 'bot', text: text.invalidDoctor }],
          options: docNames
        };
      }

      // Complete booking!
      const phone = (session.tempData && session.tempData.phone) || `+1 555-${session.sessionId.slice(-4)}`;
      let patient = await Patient.findOne({ phone, hospital: currentHospId });
      if (!patient) {
        patient = new Patient({
          name: (session.tempData && session.tempData.name) || 'Valued Patient',
          age: (session.tempData && session.tempData.age) || 30,
          gender: (session.tempData && session.tempData.gender) || 'Other',
          phone,
          hospital: currentHospId
        });
      } else {
        patient.visitCount = (patient.visitCount || 1) + 1;
        if (session.tempData && session.tempData.name) patient.name = session.tempData.name;
        if (session.tempData && session.tempData.age) patient.age = session.tempData.age;
        if (session.tempData && session.tempData.gender) patient.gender = session.tempData.gender;
      }
      await patient.save();

      // Unique token number generation (collision-free)
      const tokenNumber = await generateUniqueTokenNumber(currentHospId);

      const token = new Token({
        tokenNumber,
        hospital: currentHospId,
        status: 'Waiting',
        tokenType: session.tempData.tokenType || 'Regular',
        patient: patient._id,
        doctor: selectedDoc._id,
        symptoms: session.tempData.symptoms || 'General Checkup'
      });
      await saveTokenWithRetry(token);

      let queue = await Queue.findOne({ doctor: selectedDoc._id });
      if (!queue) {
        queue = new Queue({ doctor: selectedDoc._id, activeQueue: [] });
      }

      if (token.tokenType === 'Emergency') {
        queue.activeQueue.unshift(token._id);
      } else {
        queue.activeQueue.push(token._id);
      }
      await queue.save();

      try {
        await recalculateQueueTimes(selectedDoc._id);
      } catch (qErr) {
        console.error('Error recalculating queue times:', qErr);
      }

      session.currentState = 'COMPLETED';
      session.markModified && session.markModified('tempData');
      await session.save();

      const refreshedToken = (await Token.findById(token._id)) || token;
      const trackerLink = `https://hospital-automation-wine.vercel.app/track/${refreshedToken._id}`;
      const bookingMessage = `Hello ${patient.name}, your token ${refreshedToken.tokenNumber} is booked successfully for ${selectedDoc.name} in ${selectedDoc.currentRoom || 'Cabin A'}. Estimated wait time: ${refreshedToken.estimatedWaitTime || 0} mins. Track live: ${trackerLink}`;
      
      try {
        await sendWhatsAppNotification(patient.phone, bookingMessage);
      } catch (waErr) {
        console.error('WhatsApp notification error:', waErr);
      }

      if (socketIo) {
        try {
          socketIo.to('queue:global').emit('queue-updated', { doctorId: selectedDoc._id });
          socketIo.to(`doctor:${selectedDoc._id}`).emit('queue-updated');
        } catch (sErr) {
          console.error('Socket emit error:', sErr);
        }
      }

      const waitMins = typeof refreshedToken.estimatedWaitTime === 'number' ? refreshedToken.estimatedWaitTime : 0;

      return {
        messages: [
          { sender: 'bot', text: text.bookingCompleteHeader },
          { sender: 'bot', text: text.bookingCompleteBody(refreshedToken.tokenNumber, selectedDoc.name, selectedDoc.currentRoom || 'Cabin A', waitMins) }
        ],
        options: text.options,
        token: {
          id: refreshedToken._id,
          tokenNumber: refreshedToken.tokenNumber,
          estimatedWaitTime: waitMins,
          status: refreshedToken.status || 'Waiting',
          department: selectedDoc.department || 'General Practice'
        }
      };
    }
  }

  return {
    messages: [{ sender: 'bot', text: text.defaultCatchAll }],
    options: text.options
  };
}

router.post('/message', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1 && process.env.USE_MOCK_DB !== 'true') {
      return res.status(503).json({
        message: 'Database connection is offline. Please verify you have whitelisted all IP addresses (0.0.0.0/0) in your MongoDB Atlas Network Access panel.'
      });
    }

    const { sessionId, message, hospitalId } = req.body;
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
      return res.status(400).json({ message: 'Invalid or missing sessionId (must be string <= 100 chars)' });
    }
    if (message && (typeof message !== 'string' || message.length > 500)) {
      return res.status(400).json({ message: 'Invalid message (must be string <= 500 chars)' });
    }
    if (hospitalId && (typeof hospitalId !== 'string' || hospitalId.length > 100)) {
      return res.status(400).json({ message: 'Invalid hospitalId (must be string <= 100 chars)' });
    }

    const result = await processChatMessage({
      sessionId,
      message,
      hospitalId,
      socketIo: req.io
    });

    res.json(result);
  } catch (error) {
    console.error('Chat error details:', error);
    res.status(500).json({ 
      message: error.message || 'Server error in chatbot'
    });
  }
});

// POST WhatsApp Business API Webhook integration
router.post('/whatsapp', async (req, res) => {
  try {
    const fromNumber = req.body.From || req.body.from;
    const toNumber = req.body.To || req.body.to;
    const incomingBody = req.body.Body || req.body.text || req.body.message || '';

    if (!fromNumber) {
      return res.status(400).json({ message: 'Missing From parameter' });
    }

    const cleanTo = toNumber ? toNumber.replace(/^whatsapp:/i, '').trim() : '';
    const cleanFrom = fromNumber.replace(/^whatsapp:/i, '').trim();

    // Match hospital by registered WhatsApp Business number
    let hospital = null;
    if (cleanTo) {
      hospital = await Hospital.findOne({ whatsappNumber: new RegExp(cleanTo, 'i') });
    }
    if (!hospital) {
      hospital = await Hospital.findOne({}) || { id: 'general-hospital' };
    }

    const result = await processChatMessage({
      sessionId: `wa_${cleanFrom}`,
      message: incomingBody,
      hospitalId: hospital.id,
      socketIo: req.io
    });

    const replyText = result.messages.map(m => m.text).join('\n\n');
    const optionsText = (result.options && result.options.length > 0)
      ? `\n\nReply with option:\n` + result.options.map((o, idx) => `${idx + 1}. ${o}`).join('\n')
      : '';

    const fullMessage = replyText + optionsText;

    // If incoming request is a Twilio form-encoded webhook, reply with TwiML XML
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('x-www-form-urlencoded')) {
      const xmlEscaped = fullMessage
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      res.type('text/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscaped}</Message></Response>`);
    }

    // Standard JSON response
    return res.json({
      from: cleanFrom,
      to: cleanTo,
      response: fullMessage,
      details: result
    });
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    res.status(500).json({ message: 'Server error processing WhatsApp webhook' });
  }
});

// GET public queue wait times and WhatsApp config
router.get('/queues/public-status', async (req, res) => {
  try {
    const { hospitalId } = req.query;
    
    const filter = {};
    if (hospitalId) {
      const doctors = await Doctor.find({ hospital: hospitalId });
      const docIds = doctors.map(d => d._id);
      filter.doctor = { $in: docIds };
    }

    const queues = await Queue.find(filter).populate('doctor');
    const deptTimes = {
      'Emergency': 15,
      'General Practice': 15,
      'Pediatrics': 10
    };

    queues.forEach(q => {
      if (!q.doctor) return;
      const dept = q.doctor.department;
      const count = q.activeQueue ? q.activeQueue.length : 0;
      const avgCheckup = q.doctor.averageCheckupTime || 10;
      const buffer = q.bufferDelay || 0;
      const wait = (count * avgCheckup) + buffer;

      let frontendDept = dept;
      if (dept === 'General Medicine' || dept === 'Cardiology') {
        frontendDept = 'General Practice';
      }
      
      deptTimes[frontendDept] = wait > 0 ? wait : (frontendDept === 'Pediatrics' ? 10 : 15);
    });

    const activeHospId = hospitalId || 'general-hospital';
    const hospital = await Hospital.findOne({ id: activeHospId }) || await Hospital.findOne({});
    const rawWhatsapp = hospital
      ? (hospital.id === 'general-hospital' ? (process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886') : hospital.whatsappNumber)
      : '+14155238886';
    const cleanWhatsapp = rawWhatsapp.replace(/^whatsapp:/i, '');

    res.json({
      ...deptTimes,
      whatsappNumber: cleanWhatsapp
    });
  } catch (error) {
    console.error('Error fetching public status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET sanitized live queue data for the unauthenticated waiting-room TV display
// (optionally scoped to one hospital via ?hospitalId=). No passwordHash or
// other sensitive fields are ever populated here.
router.get('/public-tv-queues', async (req, res) => {
  try {
    const { hospitalId } = req.query;

    const filter = {};
    if (hospitalId) {
      const doctors = await Doctor.find({ hospital: hospitalId });
      filter.doctor = { $in: doctors.map(d => d._id) };
    }

    const queues = await Queue.find(filter)
      .populate('doctor', '-passwordHash')
      .populate({
        path: 'currentToken',
        populate: { path: 'patient' }
      })
      .populate({
        path: 'activeQueue',
        populate: { path: 'patient' }
      });

    res.json(queues);
  } catch (error) {
    console.error('Error fetching public TV queues:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET token details and queue position by Mongo ID
router.get('/token/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const token = await Token.findById(tokenId).populate('patient').populate('doctor', '-passwordHash');
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    const queue = token.doctor ? await Queue.findOne({ doctor: token.doctor._id }) : null;
    let position = -1;
    if (queue) {
      if (queue.currentToken && queue.currentToken.toString() === token._id.toString()) {
        position = 0; // Currently inside the cabin
      } else {
        // Find position index in the active queue array
        position = queue.activeQueue.findIndex(id => id.toString() === token._id.toString()) + 1;
      }
    }

    res.json({ token, position });
  } catch (err) {
    console.error('Error fetching token details:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all registered hospitals
router.get('/hospitals', async (req, res) => {
  try {
    const dbHospitals = await Hospital.find({});
    const formattedHospitals = dbHospitals.map(h => {
      const rawWhatsapp = h.id === 'general-hospital' 
        ? (process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886')
        : h.whatsappNumber;
      return {
        ...h.toObject(),
        whatsappNumber: rawWhatsapp.replace(/^whatsapp:/i, '')
      };
    });
    res.json(formattedHospitals);
  } catch (err) {
    console.error('Error fetching hospitals:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single hospital details
router.get('/hospital/:hospitalId', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const hospital = await Hospital.findOne({ id: hospitalId });
    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' });
    }
    const rawWhatsapp = hospital.id === 'general-hospital'
      ? (process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886')
      : hospital.whatsappNumber;
    res.json({
      ...hospital.toObject(),
      whatsappNumber: rawWhatsapp.replace(/^whatsapp:/i, '')
    });
  } catch (err) {
    console.error('Error fetching hospital details:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all active doctors of a specific hospital
router.get('/hospital/:hospitalId/doctors', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const doctors = await Doctor.find({ hospital: hospitalId }, '-passwordHash');
    res.json(doctors);
  } catch (err) {
    console.error('Error fetching hospital doctors:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST delay token by 3 places
router.post('/token/delay', async (req, res) => {
  try {
    const { tokenId } = req.body;
    if (!tokenId) {
      return res.status(400).json({ message: 'Token ID is required' });
    }

    const token = await Token.findById(tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    // Find the queue for this doctor / department
    const queue = await Queue.findOne({ doctor: token.doctor });
    if (!queue) {
      return res.status(404).json({ message: 'Queue not found for this facility/doctor' });
    }

    const index = queue.activeQueue.findIndex(id => id.toString() === tokenId);
    if (index === -1) {
      return res.status(400).json({ message: 'Token is not active or waiting in queue' });
    }

    // Move the token 3 places back
    const [movedToken] = queue.activeQueue.splice(index, 1);
    const targetIndex = Math.min(index + 3, queue.activeQueue.length);
    queue.activeQueue.splice(targetIndex, 0, movedToken);

    await queue.save();

    // Recalculate queue wait times dynamically
    await recalculateQueueTimes(queue.doctor);

    // Emit live update event
    if (req.io) {
      req.io.emit('queue-updated');
    }

    res.json({ message: 'Token successfully delayed by 3 places!', token });
  } catch (error) {
    console.error('Token delay error:', error);
    res.status(500).json({ message: 'Server error delaying token' });
  }
});

// GET WhatsApp API Engine Configuration & Status
router.get('/whatsapp/config', (req, res) => {
  try {
    const config = getWhatsAppConfig();
    res.json(config);
  } catch (err) {
    console.error('Error fetching WhatsApp config:', err);
    res.status(500).json({ message: 'Failed to fetch WhatsApp API configuration' });
  }
});

// POST Update WhatsApp API Sender Number & Auto-Start Engine
router.post('/whatsapp/config', async (req, res) => {
  try {
    const { whatsappNumber, isAutoWorking } = req.body;
    if (!whatsappNumber || typeof whatsappNumber !== 'string') {
      return res.status(400).json({ message: 'WhatsApp API number is required (e.g. +14155238886)' });
    }

    const updatedConfig = setWhatsAppConfig({ whatsappNumber, isAutoWorking });

    // Also sync default hospital whatsappNumber in DB if exists
    try {
      let hospital = await Hospital.findOne({ id: 'general-hospital' });
      if (hospital) {
        hospital.whatsappNumber = updatedConfig.whatsappNumber;
        await hospital.save();
      }
    } catch (hErr) {
      console.warn('Could not update hospital DB record for WhatsApp number:', hErr.message);
    }

    res.json({
      message: 'WhatsApp API Number updated successfully. Automatic Engine is now ACTIVE!',
      config: updatedConfig
    });
  } catch (err) {
    console.error('Error updating WhatsApp config:', err);
    res.status(500).json({ message: 'Failed to update WhatsApp API configuration' });
  }
});

// POST Trigger test outgoing WhatsApp notification
router.post('/whatsapp/send-test', async (req, res) => {
  try {
    const { phone, message, type } = req.body;
    const recipientPhone = phone || '+919876543210';
    let bodyText = message;

    if (!bodyText) {
      if (type === 'walkin') {
        bodyText = `Hello Patient, your walk-in token T-105 has been generated for Dr. Sarah Jenkins in Cabin 101. Estimated wait is 15 mins.`;
      } else if (type === 'call') {
        bodyText = `ALERT: Hello Patient, your token T-105 is now ACTIVE! Please proceed to Cabin 101 immediately.`;
      } else if (type === 'sos') {
        bodyText = `🚨 EMERGENCY SOS ALERT: Patient token T-999 upgraded to Emergency Priority!`;
      } else if (type === 'reminder') {
        bodyText = `CareSync Reminder: You have a follow-up appointment scheduled with Dr. Sarah Jenkins tomorrow at 10:00 AM.`;
      } else {
        bodyText = `Test notification from CareSync WhatsApp API Engine (${getWhatsAppConfig().whatsappNumber}). System is working automatically!`;
      }
    }

    const result = await sendWhatsAppNotification(recipientPhone, bodyText, req.io);
    res.json({
      message: 'WhatsApp notification dispatched successfully',
      result
    });
  } catch (err) {
    console.error('Error sending test WhatsApp message:', err);
    res.status(500).json({ message: 'Failed to send WhatsApp message', error: err.message });
  }
});

// GET Hospital WhatsApp QR Code & Direct Deep Link Generator
router.get('/whatsapp/qr/:hospitalId', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    let hospital = await Hospital.findOne({ 
      $or: [{ id: hospitalId }, { slug: hospitalId }] 
    }) || await Hospital.findOne({});

    if (!hospital) {
      hospital = {
        id: hospitalId || 'general-hospital',
        name: 'CareSync Healthcare Hospital',
        city: 'Main City',
        address: 'Main Hospital Road',
        phone: '+919876543210'
      };
    }

    const waConfig = getWhatsAppConfig();
    const cleanNumber = (waConfig.whatsappNumber || '+13613160967').replace(/\D/g, '');
    const prefilledText = `HI_${hospital.id}`;
    const waDeepLink = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(prefilledText)}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(waDeepLink)}`;

    res.json({
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      whatsappNumber: waConfig.whatsappNumber,
      prefilledText: prefilledText,
      waDeepLink: waDeepLink,
      qrImageUrl: qrImageUrl
    });
  } catch (err) {
    console.error('Error generating hospital QR:', err);
    res.status(500).json({ message: 'Failed to generate hospital WhatsApp QR Code' });
  }
});

// GET WhatsApp Message History Audit Log
router.get('/whatsapp/history', (req, res) => {
  try {
    const history = getWhatsAppHistory(30);
    res.json(history);
  } catch (err) {
    console.error('Error fetching WhatsApp history:', err);
    res.status(500).json({ message: 'Failed to fetch WhatsApp history' });
  }
});

// GET Meta WhatsApp Cloud API Webhook Verification Endpoint
router.get('/whatsapp/webhook/meta', (req, res) => {
  try {
    // express-mongo-sanitize (mounted globally in index.js) strips/rewrites
    // dotted keys from req.query to block NoSQL-injection payloads — but
    // Meta's verification handshake uses fixed, non-negotiable dotted keys
    // (hub.mode, hub.verify_token, hub.challenge), so req.query['hub.mode']
    // is always undefined by the time it gets here. Read them straight off
    // the raw, untouched query string instead.
    const rawQuery = new URLSearchParams(req.originalUrl.split('?')[1] || '');
    const mode = rawQuery.get('hub.mode');
    const token = rawQuery.get('hub.verify_token');
    const challenge = rawQuery.get('hub.challenge');
    const expectedToken = process.env.META_VERIFY_TOKEN;

    console.log(`[META WEBHOOK GET] mode: ${mode} | token: ${token} | challenge: ${challenge}`);

    if (mode === 'subscribe' && expectedToken && token === expectedToken) {
      console.log('[META WEBHOOK VERIFIED] Meta Cloud API webhook successfully verified.');
      return res.status(200).send(challenge);
    }

    console.warn('[META WEBHOOK VERIFICATION FAILED] hub.mode or hub.verify_token did not match META_VERIFY_TOKEN.');
    return res.status(403).send('Forbidden: verify token mismatch');
  } catch (err) {
    console.error('Error in Meta GET webhook:', err);
    return res.status(500).send('Server error');
  }
});

// POST Meta WhatsApp Cloud API Webhook Event Handler (Incoming Messages)
router.post('/whatsapp/webhook/meta', async (req, res) => {
  try {
    const body = req.body;

    // Acknowledge receipt to Meta immediately (must respond within 3 seconds)
    res.status(200).send('EVENT_RECEIVED');

    if (body && body.object === 'whatsapp_business_account' && body.entry) {
      for (const entry of body.entry) {
        if (!entry.changes) continue;
        for (const change of entry.changes) {
          const value = change.value;
          if (value && value.messages && value.messages.length > 0) {
            for (const msg of value.messages) {
              const fromPhone = msg.from; // e.g. "15551234567" or "919876543210"
              let textContent = '';

              if (msg.type === 'text' && msg.text) {
                textContent = msg.text.body;
              } else if (msg.type === 'interactive' && msg.interactive) {
                if (msg.interactive.type === 'button_reply' && msg.interactive.button_reply) {
                  textContent = msg.interactive.button_reply.title || msg.interactive.button_reply.id;
                } else if (msg.interactive.type === 'list_reply' && msg.interactive.list_reply) {
                  textContent = msg.interactive.list_reply.title || msg.interactive.list_reply.id;
                }
              } else if (msg.type === 'button' && msg.button) {
                textContent = msg.button.text || msg.button.payload;
              }

              if (fromPhone && textContent) {
                const formattedPhone = fromPhone.startsWith('+') ? fromPhone : `+${fromPhone}`;
                const sessionId = `wa_${formattedPhone.replace(/\D/g, '')}`;

                console.log(`[META INCOMING WHATSAPP] From: ${formattedPhone} | Session: ${sessionId} | Text: "${textContent}"`);

                // Feed input into CareSync patient appointment state engine
                const botResponse = await processChatMessage({
                  sessionId,
                  message: textContent,
                  hospitalId: 'general-hospital',
                  socketIo: req.io || global.io
                });

                // Dispatch state machine response back to user via Meta Cloud API
                if (botResponse && botResponse.messages) {
                  for (let i = 0; i < botResponse.messages.length; i++) {
                    const m = botResponse.messages[i];
                    const opts = (i === botResponse.messages.length - 1 && botResponse.options && botResponse.options.length > 0)
                      ? botResponse.options
                      : [];

                    await sendWhatsAppNotification(formattedPhone, m.text, opts, req.io || global.io);
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error processing Meta POST webhook:', err);
  }
});

module.exports = router;
