const express = require('express');
const router = express.Router();
const ChatSession = require('../models/ChatSession');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const Queue = require('../models/Queue');
const Hospital = require('../models/Hospital');
const {
  recalculateQueueTimes,
  formatApptTime,
  insertTokenByPriority,
  isDoctorFull,
  estimateWaitMinutes,
  projectedWaitMinutes,
  paceFromTokens,
  cabinRemainingFrom,
  parseTravelMinutes,
  leaveByLabel,
  travelMinutesOf,
  isInTransit,
  PREP_BUFFER_MINUTES
} = require('../utils/queueHelper');
const {
  sendWhatsAppNotification,
  getWhatsAppConfig,
  setWhatsAppConfig,
  getWhatsAppHistory,
  getPrimaryWhatsAppNumber,
  checkMetaToken
} = require('../utils/whatsappHelper');
const { generateUniqueTokenNumber, saveTokenWithRetry } = require('../utils/tokenHelper');
const { resolveLocation } = require('../utils/locationHelper');
const { buildLandingPage } = require('../utils/facilityProfile');
const { classifySymptoms, pickLeastBusyDoctor, detectPriorityCategory } = require('../utils/triageHelper');
const logger = require('../utils/logger');
const { useMockDb, trackerUrl } = require('../utils/env');
const { normalizePhone, phoneVariants, normalizeName } = require('@careeai/shared');
const { stageMessage } = require('../utils/journeyHelper');
const { onlyToday } = require('../utils/dates');
const { findPatientByPhone } = require('../utils/patientLookup');

// Bilingual Translation Dictionary
const dictionary = {
  en: {
    welcome:
      'Welcome to CareeAi AI Assistant! 🏥 (You can also chat with us on WhatsApp at ' +
      getPrimaryWhatsAppNumber() +
      ')',
    selectOption: 'Please select an option below to proceed:',
    options: [
      'Book New Appointment / Generate Token',
      'Re-visit (Existing Patient)',
      'Emergency SOS Token',
      'Check Live Queue Status',
      'Medicine Refill (Repeat)'
    ],
    refillPhone:
      "💊 Medicine Refill: please enter the patient's registered phone number to find the last prescription:",
    refillNoRecord:
      "I couldn't find any past prescription for this number. Please book a normal appointment so a doctor can prescribe.",
    refillRequested: (doctor, meds) =>
      `✅ Refill request sent to ${doctor}. You'll get a WhatsApp once it's approved — no need to visit the OPD.\n💊 Requested: ${meds}\n\n✅ रिफिल अनुरोध ${doctor} को भेज दिया गया है। मंज़ूरी मिलते ही आपको WhatsApp मिलेगा — OPD आने की ज़रूरत नहीं।`,
    enterPhone: "To begin, please enter the Patient's Phone Number (e.g. +91 9876543210):",
    invalidPhone: 'Please enter a valid Phone Number (minimum 7 characters):',
    invalidName: 'Please enter a valid name (at least 2 characters):',
    nameLooksLikePhone:
      "That looks like a phone number, not a name. Please type the patient's NAME (e.g. Ram Kumar):",
    welcomeBackPhone: 'Welcome back! Please enter your registered Phone Number to locate your file:',
    emergencyPhone: "🚨 EMERGENCY SOS TRIGGERED. Please enter the Patient's Phone Number immediately:",
    welcomeBackText: (name, age, gender) =>
      `Welcome back, ${name}! I located your details (Age: ${age}, Gender: ${gender}).`,
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
    emergencyDetected:
      '🚨 Your symptoms may need URGENT care. I have marked this token as EMERGENCY priority so you are seen first.',
    triageRecommend: (dept, doctor, room, wait) =>
      `✅ Based on your symptoms, the right department is *${dept}*.\n\n👨‍⚕️ Recommended: ${doctor}\n🚪 ${room}\n⏱️ Approx. wait: ${wait} min (least-busy doctor for you)`,
    triageConfirmPrompt: 'Shall I book this token for you now?',
    triageConfirmOptions: ['✅ Yes, Book My Token', '🔄 Choose Another Doctor'],
    // --- Travel time: asked ONCE, so every later alert is timed for THIS patient
    askTravelTime:
      '🚗 Last question — about how long do you need to REACH the hospital?\n\nTap one below (or type it, e.g. "45 min"). We use this to WhatsApp you exactly when to set off, so you never wait here.',
    travelOptions: [
      "I'm at the hospital",
      '15 minutes',
      '30 minutes',
      '1 hour',
      '2 hours',
      'More than 2 hours'
    ],
    // Minutes behind each option above, position for position — see
    // `travelChoiceMinutes`. Neither channel sends the label back, so the
    // option's meaning has to live somewhere other than its text.
    travelOptionMinutes: [0, 15, 30, 60, 120, 180],
    invalidTravelTime: 'Please tap one of the options below, or type a time like "20 min" or "1 hour".',
    travelSaved: (mins) =>
      mins === 0
        ? '👍 Noted — you are here already.'
        : `👍 Noted — about ${mins} min to reach. We will message you ${mins + 10} min before your turn so you can leave on time.`,
    travelReuse: (mins) =>
      `🚗 Last time you said you need about ${mins} min to reach us. Still right?\n\nTap *Yes* to keep it, or type a new time (e.g. "20 min").`,
    travelReuseOptions: ['✅ Yes, same as before', '✏️ It has changed'],
    travelTooFarToday: (mins) =>
      `⚠️ You said about ${Math.round(mins / 60)} hour(s) to reach — today's OPD is likely to close before you can get here. I have still booked your token, but please check the timing below before setting off.`,
    facilityUnavailable:
      '🛑 This facility is not accepting online bookings at the moment. Please call them directly or visit the reception desk.\n🛑 यह सुविधा अभी ऑनलाइन बुकिंग नहीं ले रही है। कृपया सीधे फ़ोन करें या रिसेप्शन पर संपर्क करें।',
    opdFull:
      "🛑 Sorry, today's OPD token limit for this department is full. Please come tomorrow morning, or choose another facility. No need to travel today — you would not get a token.\n🛑 क्षमा करें, आज के OPD टोकन full हो चुके हैं। कृपया कल सुबह आएं — आज आने की ज़रूरत नहीं।",
    priorityNote: (cat) =>
      cat === 'Senior'
        ? '👵 Senior citizen — you have been given priority in the queue.'
        : cat === 'Pregnant'
          ? '🤰 Expecting mother — you have been given priority in the queue.'
          : '♿ Priority patient — you have been moved ahead in the queue.',
    bookingCompleteHeader: 'Booking Complete! 🎉',
    bookingCompleteBody: (tokenNumber, doctor, room, wait) =>
      `• Token Number: ${tokenNumber}\n• Doctor: ${doctor}\n• Cabin: ${room}\n• Estimated Wait: ${wait} mins.`,
    defaultCatchAll: 'Your previous booking is complete. Type "Hi" to start a new inquiry!',
    enterTokenToCheck: 'Please enter your Token Number (e.g., T-101 or T-102):',
    tokenNotFound: 'Token not found. Please verify the token number and try again, or type "Hi" to restart.',
    statusInCabin: 'You are currently inside the cabin! Please proceed.',
    statusWaiting: (position, wait) =>
      `There are ${position - 1} patient(s) ahead of you. Estimated wait: ${wait} mins.`,
    statusCompleted: (status) => `Status: ${status}. Checkup complete or token cancelled.`,
    tokenDetailsHeader: (tokenNumber) => `Token Details for ${tokenNumber}:`,
    tokenDetailsBody: (patient, doctor, dept, statusText) =>
      `• Patient: ${patient}\n• Doctor: ${doctor} (${dept})\n• Live Status: ${statusText}`,
    // --- Ease-of-use additions -------------------------------------------------
    menuTitle: 'Main Menu — what would you like to do?',
    notUnderstood:
      'Sorry, I didn\'t quite get that. Tap an option below, reply with its number, or just type your problem (e.g. "fever since 2 days").',
    helpText:
      '🆘 *How to use this assistant*\n\n• Just type your problem — e.g. "fever and cough" — and I will pick the right department & doctor for you.\n• Reply with a number (1-5) or tap an option to use the menu.\n• Type your token number (e.g. T-101) anytime to see your live queue position.\n• Type *MENU* to go back • *HELP* for this help • *HOSPITAL* to pick a different hospital • *CHANGE* to use a different phone number.\n\n✅ You never need to stand in line — we WhatsApp you when your turn is near.',
    usingWhatsAppNumber: (num) =>
      `📱 Using your WhatsApp number ${num} — no need to type it. (Reply *CHANGE* to use a different number.)`,
    changeNumberPrompt: 'Sure — please enter the phone number you would like to use:',
    symptomsNoted: (s) => `Got it — "${s}". Let me find the right doctor for you.`,
    tipTypeProblem: 'Tip: you can also just type your problem (e.g. "chest pain") and I will do the rest.',
    // --- Facility selection (book at ANY registered hospital) -------------------
    chooseFacility:
      '🏥 Which hospital or clinic do you want?\n\nTap one below, reply with its number, or type a name/city to search (e.g. "Patna" or "dental").',
    facilityLine: (index, h) =>
      `${index}. ${h.name} — ${h.city}${h.type && h.type !== 'Hospital' ? ` (${h.type})` : ''}`,
    facilityNotFound: (q) =>
      `I couldn't find a facility matching "${q}". Try a city name, or reply *LIST* to see all facilities.`,
    facilityChosen: (h) =>
      `✅ ${h.name}\n📍 ${h.address}, ${h.city}\n📞 ${h.phone}\n\nYou are now booking at this facility. (Reply *HOSPITAL* anytime to switch.)`,
    facilityMore: 'Reply *MORE* to see more facilities, or type a city/name to search.',
    lastVisited: (h) => `🕘 Last time you visited ${h.name}. Reply *1* to use it again.`,
    bookingAtFooter: (h) => `You are booking at *${h.name}*. Reply *HOSPITAL* to change.`,

    // --- Location cascade: state → district → facility ------------------------
    chooseState:
      '📍 Which state are you in?\n\nReply with the number, or type your city directly (e.g. "Patna") to skip ahead.',
    chooseDistrict: (state) =>
      `📍 Which district in ${state}?\n\nReply with the number, or type a hospital name to search. Reply *BACK* for states.`,
    chooseFacilityIn: (district) =>
      `🏥 Hospitals & clinics in ${district}:\n\nReply with the number, or type a name to search. Reply *BACK* for districts.`,
    stateLine: (index, state, count) => `${index}. ${state} (${count})`,
    districtLine: (index, district, count) => `${index}. ${district} (${count})`,
    noneInDistrict: (district) => `No facilities are registered in ${district} yet.`,
    searchHint: 'You can type a city or hospital name at any point to jump straight there.',
    symptomNoted: (dept) =>
      `📝 Noted — that sounds like *${dept}*. I'll book you there.\nFirst, tell me where you want to go:`,

    // --- Tracking -------------------------------------------------------------
    trackHowPrompt:
      '🔍 What would you like to track?\n\nReply *1* to look up by your phone number, or send your token number (e.g. T-101).',
    trackNoRecords:
      "I couldn't find any booking for this number at this facility. Reply *BOOK* to make a new appointment.",
    trackAheadOf: (ahead, mins) =>
      ahead === 0
        ? '🟢 You are next — please be at the cabin now.'
        : `⏳ ${ahead} patient${ahead === 1 ? '' : 's'} ahead of you · approx. ${mins} min.`,
    trackStage: (stage) => `📍 Current stage: ${stage}`,
    trackRxReady: (doctor) => `💊 Prescription from ${doctor} is ready — collect it at the pharmacy counter.`,
    trackRxDispensed: '💊 Your medicines have been dispensed.',
    statusInQueue: (status) => `${status} — you are booked in. We will alert you as your turn approaches.`,
    trackLabReady: (n) => `🧪 ${n} lab report${n === 1 ? '' : 's'} ready — collect them at the lab counter.`,
    trackNothingToday: (name) =>
      `${name}, you have no active token today. Reply *BOOK* for a new appointment, or *REVISIT* to book again with your last doctor.`,
    revisitOffer: (doctor, dept, when) =>
      `🔁 Last visit: ${doctor} (${dept}) on ${when}.\nReply *REVISIT* to book with them again.`
  },
  hi: {
    welcome:
      'केयरसिंक एआई असिस्टेंट में आपका स्वागत है! 🏥 (आप हमसे सीधे व्हाट्सएप पर ' +
      getPrimaryWhatsAppNumber() +
      ' पर भी चैट कर सकते हैं)',
    selectOption: 'कृपया आगे बढ़ने के लिए नीचे दिए गए विकल्पों में से एक चुनें:',
    options: [
      'नया अपॉइंटमेंट बुक करें / टोकन जेनरेट करें',
      'दोबारा विजिट (मौजूदा मरीज)',
      'इमरजेंसी एसओएस टोकन',
      'लाइव क्यू स्टेटस जांचें',
      'दवा रिफिल (दोबारा)'
    ],
    refillPhone: '💊 दवा रिफिल: पिछली पर्ची ढूँढने के लिए कृपया मरीज का पंजीकृत मोबाइल नंबर दर्ज करें:',
    refillNoRecord:
      'इस नंबर के लिए कोई पुरानी पर्ची नहीं मिली। कृपया सामान्य अपॉइंटमेंट बुक करें ताकि डॉक्टर दवा लिख सकें।',
    refillRequested: (doctor, meds) =>
      `✅ रिफिल अनुरोध ${doctor} को भेज दिया गया है। मंज़ूरी मिलते ही आपको WhatsApp मिलेगा — OPD आने की ज़रूरत नहीं।\n💊 अनुरोधित: ${meds}`,
    enterPhone: 'शुरू करने के लिए, कृपया मरीज का मोबाइल नंबर दर्ज करें (उदा. +91 9876543210):',
    invalidPhone: 'कृपया एक सही मोबाइल नंबर दर्ज करें (कम से कम 7 अंक):',
    invalidName: 'कृपया एक वैध नाम दर्ज करें (कम से कम 2 अक्षर):',
    nameLooksLikePhone: 'यह फ़ोन नंबर जैसा लग रहा है, नाम नहीं। कृपया मरीज़ का *नाम* लिखें (जैसे राम कुमार):',
    welcomeBackPhone: 'वापसी पर आपका स्वागत है! अपनी फ़ाइल ढूँढने के लिए अपना पंजीकृत मोबाइल नंबर दर्ज करें:',
    emergencyPhone: '🚨 इमरजेंसी एसओएस। कृपया तुरंत मरीज का मोबाइल नंबर दर्ज करें:',
    welcomeBackText: (name, age, gender) =>
      `वापसी पर आपका स्वागत है, ${name}! मुझे आपकी जानकारी मिल गई है (उम्र: ${age}, लिंग: ${gender === 'Male' ? 'पुरुष' : gender === 'Female' ? 'महिला' : 'अन्य'}).`,
    describeSymptoms: 'कृपया अपने वर्तमान लक्षणों का वर्णन करें (जैसे: तेज़ बुखार, गले में दर्द):',
    phoneNotFound: 'मुझे इस नंबर का कोई रजिस्ट्रेशन नहीं मिला। आइए आपको एक नए मरीज के रूप में पंजीकृत करें।',
    enterFullName: 'कृपया मरीज का पूरा नाम दर्ज करें:',
    enterFullNameGeneric: 'धन्यवाद। अब, कृपया मरीज का पूरा नाम दर्ज करें:',
    enterAge: (name) => `ठीक है। ${name} की उम्र क्या है?`,
    invalidAge: 'कृपया एक सही उम्र दर्ज करें (1 से 130 के बीच की संख्या):',
    selectGender: 'मरीज का लिंग चुनें:',
    genderOptions: ['पुरुष', 'महिला', 'अन्य'],
    invalidGender: 'कृपया नीचे दिए गए विकल्पों में से एक चुनें:',
    describeSymptomsLong:
      'कृपया अपने लक्षणों का संक्षेप में वर्णन करें (जैसे: तेज़ बुखार, सांस लेने में तकलीफ, खांसी):',
    noDoctors: 'वर्तमान में कोई डॉक्टर उपलब्ध नहीं हैं। बाद में पुनः प्रयास करने के लिए "Hi" टाइप करें।',
    selectDoctorPrompt: 'टोकन बुक करने के लिए उपलब्ध डॉक्टर का चयन करें:',
    invalidDoctor: 'गलत डॉक्टर का चयन। कृपया सूची में से चुनें:',
    emergencyDetected:
      '🚨 आपके लक्षणों को तुरंत इलाज की ज़रूरत हो सकती है। मैंने इस टोकन को इमरजेंसी प्राथमिकता दे दी है ताकि आपको पहले देखा जाए।',
    triageRecommend: (dept, doctor, room, wait) =>
      `✅ आपके लक्षणों के आधार पर सही विभाग है *${dept}*।\n\n👨‍⚕️ सुझाव: ${doctor}\n🚪 ${room}\n⏱️ अनुमानित प्रतीक्षा: ${wait} मिनट (आपके लिए सबसे कम भीड़ वाले डॉक्टर)`,
    triageConfirmPrompt: 'क्या मैं आपका टोकन अभी बुक कर दूँ?',
    triageConfirmOptions: ['✅ हाँ, मेरा टोकन बुक करें', '🔄 दूसरा डॉक्टर चुनें'],
    // --- यात्रा समय: एक बार पूछा जाता है, फिर हर अलर्ट इसी हिसाब से जाता है
    askTravelTime:
      '🚗 आख़िरी सवाल — अस्पताल पहुँचने में आपको लगभग कितना समय लगेगा?\n\nनीचे से चुनें (या टाइप करें, जैसे "45 मिनट")। इसी से हम आपको ठीक समय पर WhatsApp करेंगे कि अब निकलिए — यहाँ इंतज़ार करने की ज़रूरत नहीं।',
    travelOptions: ['मैं अस्पताल में ही हूँ', '15 मिनट', '30 मिनट', '1 घंटा', '2 घंटे', '2 घंटे से ज़्यादा'],
    travelOptionMinutes: [0, 15, 30, 60, 120, 180],
    invalidTravelTime: 'कृपया नीचे दिए विकल्पों में से चुनें, या समय टाइप करें जैसे "20 मिनट" या "1 घंटा"।',
    travelSaved: (mins) =>
      mins === 0
        ? '👍 ठीक है — आप यहीं हैं।'
        : `👍 ठीक है — पहुँचने में लगभग ${mins} मिनट। आपकी बारी से ${mins + 10} मिनट पहले हम आपको संदेश भेज देंगे ताकि आप समय पर निकल सकें।`,
    travelReuse: (mins) =>
      `🚗 पिछली बार आपने बताया था कि पहुँचने में लगभग ${mins} मिनट लगते हैं। अब भी वही है?\n\n*हाँ* चुनें, या नया समय टाइप करें (जैसे "20 मिनट")।`,
    travelReuseOptions: ['✅ हाँ, वही है', '✏️ बदल गया है'],
    travelTooFarToday: (mins) =>
      `⚠️ आपने बताया कि पहुँचने में करीब ${Math.round(mins / 60)} घंटे लगेंगे — आज की OPD उससे पहले बंद हो सकती है। टोकन बुक कर दिया है, पर निकलने से पहले नीचे दिया समय ज़रूर देख लें।`,
    facilityUnavailable:
      '🛑 यह सुविधा अभी ऑनलाइन बुकिंग नहीं ले रही है। कृपया सीधे फ़ोन करें या रिसेप्शन पर संपर्क करें।',
    opdFull:
      '🛑 क्षमा करें, आज इस विभाग के OPD टोकन full हो चुके हैं। कृपया कल सुबह आएं, या कोई दूसरी सुविधा चुनें। आज आने की ज़रूरत नहीं — टोकन नहीं मिलेगा।',
    priorityNote: (cat) =>
      cat === 'Senior'
        ? '👵 वरिष्ठ नागरिक — आपको क़तार में प्राथमिकता दी गई है।'
        : cat === 'Pregnant'
          ? '🤰 गर्भवती महिला — आपको क़तार में प्राथमिकता दी गई है।'
          : '♿ प्राथमिकता मरीज़ — आपको क़तार में आगे कर दिया गया है।',
    bookingCompleteHeader: 'बुकिंग पूरी हो गई! 🎉',
    bookingCompleteBody: (tokenNumber, doctor, room, wait) =>
      `• टोकन नंबर: ${tokenNumber}\n• डॉक्टर: ${doctor}\n• केबिन: ${room}\n• अनुमानित प्रतीक्षा समय: ${wait} मिनट।`,
    defaultCatchAll: 'आपकी पिछली बुकिंग पूरी हो चुकी है। नया टोकन बनाने के लिए "Hi" टाइप करें!',
    enterTokenToCheck: 'कृपया अपना टोकन नंबर दर्ज करें (उदा. T-101 या T-102):',
    tokenNotFound:
      'टोकन नहीं मिला। कृपया टोकन नंबर की जांच करें और पुनः प्रयास करें, या पुनरारंभ करने के लिए "Hi" टाइप करें।',
    statusInCabin: 'आप वर्तमान में केबिन के अंदर हैं! कृपया आगे बढ़ें।',
    statusWaiting: (position, wait) =>
      `आपसे आगे ${position - 1} मरीज हैं। अनुमानित प्रतीक्षा समय: ${wait} मिनट।`,
    statusCompleted: (status) =>
      `स्थिति: ${status === 'Completed' ? 'पूर्ण' : status}. चेकअप पूरा हो चुका है या टोकन रद्द कर दिया गया है.`,
    tokenDetailsHeader: (tokenNumber) => `टोकन विवरण ${tokenNumber} के लिए:`,
    tokenDetailsBody: (patient, doctor, dept, statusText) =>
      `• मरीज: ${patient}\n• डॉक्टर: ${doctor} (${dept})\n• लाइव स्थिति: ${statusText}`,
    // --- Ease-of-use additions -------------------------------------------------
    menuTitle: 'मुख्य मेनू — मैं आपकी क्या मदद करूँ?',
    notUnderstood:
      'माफ़ कीजिए, मैं समझ नहीं पाया। नीचे कोई विकल्प चुनें, उसका नंबर भेजें, या सीधे अपनी तकलीफ़ लिखें (जैसे "2 दिन से बुखार")।',
    helpText:
      '🆘 *इस असिस्टेंट का उपयोग कैसे करें*\n\n• बस अपनी तकलीफ़ लिखें — जैसे "बुखार और खांसी" — मैं सही विभाग और डॉक्टर चुन दूँगा।\n• मेनू के लिए नंबर (1-5) भेजें या विकल्प पर टैप करें।\n• अपना टोकन नंबर (जैसे T-101) कभी भी भेजें और लाइव स्थिति देखें।\n• *MENU* लिखें — मेनू पर वापस • *HELP* — यह मदद • *HOSPITAL* — दूसरा अस्पताल • *CHANGE* — दूसरा मोबाइल नंबर।\n\n✅ लाइन में खड़े होने की ज़रूरत नहीं — आपकी बारी पास आते ही हम WhatsApp कर देंगे।',
    usingWhatsAppNumber: (num) =>
      `📱 आपका WhatsApp नंबर ${num} इस्तेमाल कर रहे हैं — टाइप करने की ज़रूरत नहीं। (दूसरा नंबर देने के लिए *CHANGE* लिखें।)`,
    changeNumberPrompt: 'ठीक है — कृपया वह मोबाइल नंबर दर्ज करें जिसे आप उपयोग करना चाहते हैं:',
    symptomsNoted: (s) => `समझ गया — "${s}"। मैं आपके लिए सही डॉक्टर ढूँढता हूँ।`,
    tipTypeProblem:
      'सुझाव: आप सीधे अपनी तकलीफ़ भी लिख सकते हैं (जैसे "सीने में दर्द") — बाकी मैं संभाल लूँगा।',
    // --- Facility selection (book at ANY registered hospital) -------------------
    chooseFacility:
      '🏥 आप किस अस्पताल या क्लिनिक में दिखाना चाहते हैं?\n\nनीचे से चुनें, उसका नंबर भेजें, या नाम/शहर लिखकर खोजें (जैसे "पटना" या "dental")।',
    facilityLine: (index, h) =>
      `${index}. ${h.name} — ${h.city}${h.type && h.type !== 'Hospital' ? ` (${h.type})` : ''}`,
    facilityNotFound: (q) =>
      `"${q}" से मेल खाती कोई सुविधा नहीं मिली। कृपया शहर का नाम लिखें, या सभी सुविधाएँ देखने के लिए *LIST* भेजें।`,
    facilityChosen: (h) =>
      `✅ ${h.name}\n📍 ${h.address}, ${h.city}\n📞 ${h.phone}\n\nअब आपकी बुकिंग यहीं होगी। (बदलने के लिए कभी भी *HOSPITAL* लिखें।)`,
    facilityMore: 'और सुविधाएँ देखने के लिए *MORE* भेजें, या शहर/नाम लिखकर खोजें।',
    lastVisited: (h) => `🕘 पिछली बार आप ${h.name} गए थे। दोबारा वही चुनने के लिए *1* भेजें।`,
    bookingAtFooter: (h) => `आपकी बुकिंग *${h.name}* में हो रही है। बदलने के लिए *HOSPITAL* लिखें।`,

    // --- Location cascade: state → district → facility ------------------------
    chooseState:
      '📍 आप किस राज्य में हैं?\n\nनंबर भेजें, या सीधे अपना शहर लिखें (जैसे "पटना") — आगे पहुँच जाएँगे।',
    chooseDistrict: (state) =>
      `📍 ${state} के किस ज़िले में?\n\nनंबर भेजें, या अस्पताल का नाम लिखकर खोजें। राज्य सूची के लिए *BACK* लिखें।`,
    chooseFacilityIn: (district) =>
      `🏥 ${district} के अस्पताल व क्लिनिक:\n\nनंबर भेजें, या नाम लिखकर खोजें। ज़िलों के लिए *BACK* लिखें।`,
    stateLine: (index, state, count) => `${index}. ${state} (${count})`,
    districtLine: (index, district, count) => `${index}. ${district} (${count})`,
    noneInDistrict: (district) => `${district} में अभी कोई सुविधा पंजीकृत नहीं है।`,
    searchHint: 'आप कभी भी शहर या अस्पताल का नाम लिखकर सीधे वहाँ पहुँच सकते हैं।',
    symptomNoted: (dept) =>
      `📝 समझ गया — यह *${dept}* का मामला लगता है। वहीं बुक कर दूँगा।\nपहले बताइए कहाँ दिखाना है:`,

    // --- Tracking -------------------------------------------------------------
    trackHowPrompt:
      '🔍 आप क्या ट्रैक करना चाहते हैं?\n\nअपने फ़ोन नंबर से देखने के लिए *1* भेजें, या अपना टोकन नंबर भेजें (जैसे T-101)।',
    trackNoRecords: 'इस नंबर से इस सुविधा में कोई बुकिंग नहीं मिली। नई अपॉइंटमेंट के लिए *BOOK* भेजें।',
    trackAheadOf: (ahead, mins) =>
      ahead === 0
        ? '🟢 अगला नंबर आपका है — कृपया अभी कैबिन पर पहुँचें।'
        : `⏳ आपसे पहले ${ahead} मरीज़ · लगभग ${mins} मिनट।`,
    trackStage: (stage) => `📍 वर्तमान चरण: ${stage}`,
    trackRxReady: (doctor) => `💊 ${doctor} का पर्चा तैयार है — फार्मेसी काउंटर से लें।`,
    trackRxDispensed: '💊 आपकी दवाइयाँ दे दी गई हैं।',
    statusInQueue: (status) => `${status} — आपकी बुकिंग हो चुकी है। बारी पास आते ही हम बताएंगे।`,
    trackLabReady: (n) => `🧪 ${n} लैब रिपोर्ट तैयार — लैब काउंटर से लें।`,
    trackNothingToday: (name) =>
      `${name}, आज आपका कोई सक्रिय टोकन नहीं है। नई अपॉइंटमेंट के लिए *BOOK*, या पिछले डॉक्टर से दोबारा दिखाने के लिए *REVISIT* भेजें।`,
    revisitOffer: (doctor, dept, when) =>
      `🔁 पिछली विज़िट: ${doctor} (${dept}), ${when}।\nदोबारा उन्हीं से दिखाने के लिए *REVISIT* भेजें।`
  }
};

// ---------------------------------------------------------------------------
// Input understanding helpers.
// Real patients type "book appointment", "mujhe bukhar hai", "+91 98765 43210",
// "T 101" — not the exact option strings. Everything below makes the bot accept
// what a person would actually send, on the web widget AND on WhatsApp.
// ---------------------------------------------------------------------------

const norm = (s) => (s || '').toString().trim().toLowerCase();
const digitsOnly = (s) => (s || '').toString().replace(/\D/g, '');

// Global commands understood in EVERY state, on both channels.
const MENU_TRIGGERS = [
  'menu',
  'main menu',
  '0',
  'back',
  'cancel',
  'exit',
  'stop',
  'मेनू',
  'मुख्य मेनू',
  'वापस',
  'रद्द',
  'बंद'
];
const HELP_TRIGGERS = ['help', '?', 'help me', 'commands', 'options', 'मदद', 'सहायता'];
const CHANGE_FACILITY_TRIGGERS = [
  'hospital',
  'change hospital',
  'other hospital',
  'facility',
  'change facility',
  'clinic',
  'change clinic',
  'अस्पताल',
  'अस्पताल बदलें',
  'दूसरा अस्पताल',
  'क्लिनिक'
];
const CHANGE_PHONE_TRIGGERS = [
  'change',
  'change number',
  'other number',
  'change phone',
  'बदलें',
  'नंबर बदलें',
  'दूसरा नंबर'
];
const RESET_TRIGGERS = ['hi', 'hello', 'hey', 'start', 'reset', 'restart', 'नमस्ते', 'हैलो', 'शुरू'];
// Only these wipe the chosen language too; a plain "hi" just returns to the menu.
const HARD_RESET_TRIGGERS = ['reset', 'restart'];

/** A phone number a human might type: 7-15 digits, spaces/dashes/+ allowed. */
function isLikelyPhone(raw) {
  const d = digitsOnly(raw);
  return d.length >= 7 && d.length <= 15;
}

// `normalizePhone`, `phoneVariants` and `findPatientByPhone` used to be defined
// here, and this file was the ONLY place that canonicalized a phone number —
// which is precisely why reception and billing drifted: they could not reuse a
// private function buried in the chat engine, so they each invented something
// weaker. All three now come from `@careeai/shared` and `utils/patientLookup`
// (imported at the top of this file), so there is one definition of what a
// phone number is and every route gets the same answer.
//
// One behaviour change worth naming: the old `normalizePhone` returned the raw
// string when it found no digits, so unparseable junk was stored as a phone
// number. The shared version returns null, and callers check.

/** "T-101", "t101", "101" → the canonical token number, else null. */
function parseTokenNumber(raw) {
  const s = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (/^T-?\d{1,6}$/.test(s)) return s.startsWith('T-') ? s : `T-${s.slice(1)}`;
  if (/^\d{2,6}$/.test(s)) return `T-${s}`; // bare number typed while checking status
  return null;
}

/** WhatsApp sessions are `wa_<digits>` — we already know the patient's number. */
function whatsappPhoneFromSession(sessionId) {
  if (!sessionId || !sessionId.startsWith('wa_')) return null;
  const d = digitsOnly(sessionId.slice(3));
  return d ? `+${d}` : null;
}

/**
 * Which menu action does this message mean? Accepts the option number, the exact
 * option label in either language, and everyday free text ("book appointment",
 * "dawa chahiye", "kitni der lagegi").
 */
function detectMenuIntent(raw) {
  const m = norm(raw);
  if (!m) return null;

  // 1. Exact option number.
  if (['1', '2', '3', '4', '5'].includes(m)) {
    return ['book', 'revisit', 'emergency', 'status', 'refill'][Number(m) - 1];
  }

  // 2. Exact option label in either language.
  for (const lang of ['en', 'hi']) {
    const idx = dictionary[lang].options.findIndex((o) => norm(o) === m);
    if (idx >= 0) return ['book', 'revisit', 'emergency', 'status', 'refill'][idx];
  }

  // 3. Free-text keywords. Order matters: safety-critical intents first, and the
  //    more specific intent before the generic "book" catch-all.
  if (/(emerg|sos|urgent|serious|critical|ambulance|इमरजेंसी|आपात|तुरंत|गंभीर)/.test(m)) return 'emergency';
  if (/(refill|repeat|same medicine|medicine|tablet|dawa|davai|रिफिल|दवा|दवाई|गोली)/.test(m)) return 'refill';
  if (
    /(status|queue|position|how long|kitna|kitni|kab tak|number kaha|स्थिति|कतार|क़तार|कितनी देर|मेरा नंबर)/.test(
      m
    )
  )
    return 'status';
  if (/(re-?visit|revisit|follow ?up|again|existing|purana|दोबारा|पुराना|फिर से)/.test(m)) return 'revisit';
  if (/(book|appoint|token|slot|consult|doctor|new patient|बुक|अपॉइंटमेंट|टोकन|नया|डॉक्टर|दिखाना)/.test(m))
    return 'book';

  return null;
}

/**
 * Which channel raised this booking. Stored on the token so the facility's
 * reception desk can work its remote (WhatsApp/web) arrivals separately from the
 * walk-ins standing in front of it.
 */
function bookingSourceOf(session) {
  if (session.tempData && session.tempData.viaQr) return 'QR Scan';
  return String(session.sessionId || '').startsWith('wa_') ? 'WhatsApp' : 'Web Assistant';
}

// Shared booking completion — used by BOTH the smart-triage auto-route path and
// the manual "pick a doctor" fallback, so the token/queue/WhatsApp logic lives in
// exactly one place. Creates/updates the patient, mints a token, pushes it into
// the chosen doctor's queue (Emergency jumps to the front), recalculates waits,
// notifies via WhatsApp, and returns the completed-booking chat payload.
async function finalizeBooking({ session, selectedDoc, currentHospId, text, socketIo }) {
  // A facility whose subscription has lapsed cannot take new bookings.
  //
  // Checked here rather than at the top of the conversation on purpose: a
  // patient who already holds a token can still look up their queue position and
  // read their reports. Switching off the FACILITY must not strand the patients
  // already inside its day.
  const { licenseFor } = require('../middleware/license');
  const licence = await licenseFor(currentHospId);
  if (licence.blocked) {
    return { messages: [{ sender: 'bot', text: text.facilityUnavailable }], options: text.options };
  }

  const phone = (session.tempData && session.tempData.phone) || `+1 555-${session.sessionId.slice(-4)}`;
  // Match on every spelling of the number, not just an exact string compare —
  // otherwise a patient who registered as "+91 98765 43210" and comes back as
  // "9876543210" gets a duplicate record (and loses their visit history).
  let patient = await findPatientByPhone(currentHospId, phone);
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

  // Remembered on the PATIENT, not just this token, so the question is asked
  // once in a lifetime rather than at every booking. A patient who never
  // answered keeps `null` — that is what turns the departure alert off for them
  // instead of inventing a time to leave home.
  const travelMinutes = parseTravelMinutes(session.tempData && session.tempData.travelMinutes);
  if (travelMinutes !== null) patient.travelMinutes = travelMinutes;
  await patient.save();

  const tokenType = session.tempData.tokenType || 'Regular';

  // OPD capacity cutoff — never refuse an Emergency, but a Regular/Re-visit booking
  // is blocked once the doctor hits the daily token limit, so the patient is told
  // NOW (before travelling) instead of standing in a line for a token that won't come.
  if (tokenType !== 'Emergency' && (await isDoctorFull(selectedDoc))) {
    return {
      messages: [{ sender: 'bot', text: text.opdFull }],
      options: text.options
    };
  }

  // Vulnerable-group priority: auto Senior (age>=60) / Pregnant (symptoms), or an
  // explicit category set by reception. Emergencies keep their own higher priority.
  const priorityCategory =
    (session.tempData && session.tempData.priorityCategory) ||
    detectPriorityCategory({
      age: session.tempData && session.tempData.age,
      symptoms: session.tempData && session.tempData.symptoms
    });

  const tokenNumber = await generateUniqueTokenNumber(currentHospId);

  const token = new Token({
    tokenNumber,
    hospital: currentHospId,
    status: 'Waiting',
    tokenType,
    priorityCategory: priorityCategory || 'None',
    bookingSource: bookingSourceOf(session),
    patient: patient._id,
    doctor: selectedDoc._id,
    symptoms: session.tempData.symptoms || 'General Checkup',
    // Fixed for THIS visit: someone who normally travels an hour but is next
    // door today should be alerted for where they are today.
    travelMinutes: travelMinutes !== null ? travelMinutes : (patient.travelMinutes ?? null)
  });
  await saveTokenWithRetry(token);

  let queue = await Queue.findOne({ doctor: selectedDoc._id });
  if (!queue) {
    queue = new Queue({ doctor: selectedDoc._id, activeQueue: [] });
  }

  await insertTokenByPriority(queue, token);
  await queue.save();

  try {
    await recalculateQueueTimes(selectedDoc._id);
  } catch (qErr) {
    logger.error('Error recalculating queue times', { err: qErr });
  }

  session.currentState = 'COMPLETED';
  session.markModified && session.markModified('tempData');
  await session.save();

  const refreshedToken = (await Token.findById(token._id)) || token;
  const trackerLink = trackerUrl(refreshedToken._id);
  const apptTime = formatApptTime(refreshedToken.estimatedWaitTime || 0);

  // The one line that decides whether this patient spends the morning in the
  // corridor: not when their turn is, but when to LEAVE HOME for it. Only shown
  // to someone who told us how long they need — for a walk-in or an unanswered
  // question there is nothing honest to put here.
  const tokenTravel = parseTravelMinutes(refreshedToken.travelMinutes);
  const leaveBy = leaveByLabel(refreshedToken.estimatedWaitTime || 0, tokenTravel);
  const leaveLine = leaveBy
    ? `\n🚗 Leave home by: ${leaveBy === 'now' ? 'NOW' : leaveBy} (${tokenTravel} min travel + ${PREP_BUFFER_MINUTES} min). We will also WhatsApp you at that moment.\n🚗 घर से निकलें: ${leaveBy === 'now' ? 'अभी' : leaveBy} — उसी समय हम आपको संदेश भी भेजेंगे।\n`
    : '';

  // Crowd-control message: tell the patient roughly WHEN to come and that they do
  // NOT need to stand in line — a WhatsApp ping will call them when their turn nears.
  const bookingMessage = `Hello ${patient.name}, your token ${refreshedToken.tokenNumber} is booked for ${selectedDoc.name} in ${selectedDoc.currentRoom || 'Cabin A'}. Your approx. turn: ${apptTime} (~${refreshedToken.estimatedWaitTime || 0} min).\n${leaveLine}\n✅ No need to stand in line — wait at home/outside. We will WhatsApp you when your turn is near.\n🔔 घर पर आराम करें, लाइन में खड़े होने की ज़रूरत नहीं — आपकी बारी पास आते ही हम आपको WhatsApp कर देंगे।\n\nTrack live: ${trackerLink}`;

  try {
    await sendWhatsAppNotification(patient.phone, bookingMessage);
  } catch (waErr) {
    logger.error('WhatsApp notification error', { err: waErr });
  }

  if (socketIo) {
    try {
      socketIo.to('queue:global').emit('queue-updated', { doctorId: selectedDoc._id });
      socketIo.to(`doctor:${selectedDoc._id}`).emit('queue-updated');
      socketIo.to(`hospital:${currentHospId}`).emit('queue-updated', { doctorId: selectedDoc._id });

      // The booking belongs to the facility the patient PICKED in the chat, so it
      // is announced only in that facility's room — this is what makes a WhatsApp
      // booking surface on the right hospital's reception desk and nowhere else.
      socketIo.to(`hospital:${currentHospId}`).emit('remote-arrival', {
        hospital: currentHospId,
        tokenId: refreshedToken._id,
        tokenNumber: refreshedToken.tokenNumber,
        patientName: patient.name,
        doctorName: selectedDoc.name,
        source: bookingSourceOf(session),
        tokenType,
        priorityCategory: priorityCategory || 'None'
      });
    } catch (sErr) {
      logger.error('Socket emit error', { err: sErr });
    }
  }

  // Self-service bookings show up in the facility's live feed too, so reception
  // sees chatbot/WhatsApp arrivals in the same place as their own walk-ins.
  try {
    const { logActivity } = require('../utils/realtime');
    await logActivity(socketIo, {
      hospital: currentHospId,
      type: 'token-created',
      role: 'patient',
      actor: patient.name,
      message: `${refreshedToken.tokenNumber} booked via ${session.sessionId.startsWith('wa_') ? 'WhatsApp' : 'the web assistant'} for ${selectedDoc.name}${tokenType === 'Emergency' ? ' — EMERGENCY' : ''}.`,
      tokenNumber: refreshedToken.tokenNumber,
      refId: refreshedToken._id,
      severity: tokenType === 'Emergency' ? 'critical' : 'info'
    });
  } catch (aErr) {
    logger.error('Activity log error', { err: aErr });
  }

  const waitMins =
    typeof refreshedToken.estimatedWaitTime === 'number' ? refreshedToken.estimatedWaitTime : 0;

  const completeMessages = [
    { sender: 'bot', text: text.bookingCompleteHeader },
    {
      sender: 'bot',
      text: text.bookingCompleteBody(
        refreshedToken.tokenNumber,
        selectedDoc.name,
        selectedDoc.currentRoom || 'Cabin A',
        waitMins
      )
    }
  ];
  if (priorityCategory && priorityCategory !== 'None') {
    completeMessages.push({ sender: 'bot', text: text.priorityNote(priorityCategory) });
  }
  if (leaveBy) {
    completeMessages.push({
      sender: 'bot',
      text: `🚗 ${leaveBy === 'now' ? 'Leave for the hospital NOW' : `Leave home by ${leaveBy}`} — we will WhatsApp you at that moment too.`
    });
  }

  return {
    messages: completeMessages,
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

/**
 * The gate in front of every booking: do we know how long this patient needs to
 * GET here?
 *
 * Asked at the moment of booking and nowhere else — this is the only point in
 * the conversation where the patient has already decided to come, so the answer
 * is worth a turn and will actually be given. Every departure alert afterwards
 * is counted back from it.
 *
 * Three ways past without asking, all deliberate:
 *   - An emergency. Nothing may stand between a red-flag symptom and a token.
 *   - A patient who has answered before. Once in a lifetime, not once a visit.
 *   - A walk-in, which never reaches this code at all — reception knows.
 */
/**
 * Which travel-time OPTION the patient picked, or null when they typed a
 * duration in their own words instead.
 *
 * Neither WhatsApp channel ever sends the label back. Meta collapses an
 * interactive reply to its 1-based option number ("4"), and the Twilio path
 * prints the choices as a numbered list the patient answers the same way. Both
 * therefore arrived at `parseTravelMinutes` as a bare digit and were read as a
 * duration: "1 hour" (option 4) became FOUR minutes, "I'm at the hospital"
 * became one — so every departure alert built on the answer fired hours late,
 * which is the one thing this question exists to prevent.
 *
 * Resolve the option first — by label for the web widget, by number for
 * WhatsApp — and only then fall back to reading free text.
 */
function travelChoiceMinutes(raw, text) {
  const labels = (text && text.travelOptions) || [];
  const minutes = (text && text.travelOptionMinutes) || [];
  const needle = norm(raw);
  if (!needle) return null;

  const byLabel = labels.findIndex((o) => norm(o) === needle);
  if (byLabel >= 0) return minutes[byLabel] ?? null;

  // A bare number inside the option range is a button press, not a journey:
  // the six choices are what the patient was just shown, and nobody types "5"
  // to mean they live five minutes away.
  if (/^\d+$/.test(needle)) {
    const idx = Number(needle) - 1;
    if (idx >= 0 && idx < labels.length) return minutes[idx] ?? null;
  }

  return null;
}

async function askTravelTimeOrBook({ session, selectedDoc, currentHospId, text, socketIo }) {
  const temp = session.tempData || {};
  const known = parseTravelMinutes(temp.travelMinutes);

  if (temp.tokenType === 'Emergency' || known !== null) {
    return await finalizeBooking({ session, selectedDoc, currentHospId, text, socketIo });
  }

  session.tempData = { ...temp, pendingDoctorId: String(selectedDoc._id) };
  session.currentState = 'AWAITING_TRAVEL_TIME';
  session.markModified && session.markModified('tempData');
  await session.save();

  return {
    messages: [{ sender: 'bot', text: text.askTravelTime }],
    options: text.travelOptions
  };
}

// ---------------------------------------------------------------------------
// Facility selection.
//
// Until now a WhatsApp patient could only reach a facility whose OWN number they
// messaged, or whose QR they scanned. Everyone else silently landed on
// 'general-hospital' — so a hospital added to the system was simply unreachable
// over the shared WhatsApp number. These helpers let one number serve every
// registered facility.
// ---------------------------------------------------------------------------

/** How many facilities are shown at once — WhatsApp interactive lists cap at 10. */
const FACILITY_PAGE_SIZE = 8;

/**
 * Facilities matching a free-text query across the fields a patient would
 * actually type: name, city, district, state, and the facility type
 * ("dental", "clinic"). An empty query returns everything.
 */
async function searchFacilities(query) {
  const all = (await Hospital.find({})) || [];
  const needle = norm(query);
  if (!needle) return all;

  return all.filter((h) =>
    [h.name, h.city, h.district, h.state, h.type, h.address, h.clinicSubtype]
      .filter(Boolean)
      .some((field) => norm(field).includes(needle))
  );
}

/**
 * Build the "which hospital?" prompt for a page of results.
 * Returns the chat payload AND the id list, which is stored on the session so a
 * numeric reply ("2") maps back to the exact facility the patient was shown.
 */
function facilityPrompt(text, facilities, { page = 0, query = '', lead = [] } = {}) {
  const start = page * FACILITY_PAGE_SIZE;
  const shown = facilities.slice(start, start + FACILITY_PAGE_SIZE);
  const hasMore = facilities.length > start + shown.length;

  const lines = shown.map((h, i) => text.facilityLine(start + i + 1, h)).join('\n');
  const messages = [...lead, { sender: 'bot', text: `${query ? '' : text.chooseFacility + '\n\n'}${lines}` }];
  if (hasMore) messages.push({ sender: 'bot', text: text.facilityMore });

  return {
    payload: {
      messages,
      // Quick-reply buttons carry the name; the numeric id mapping is what the
      // handler actually resolves against.
      options: shown.map((h) => h.name)
    },
    shownIds: shown.map((h) => h.id)
  };
}

/* ── Location cascade: state → district → facility ───────────────────────── */

/**
 * Below this many facilities, asking for a state is worse than just listing them.
 *
 * A three-clinic deployment making a patient answer "which state?" is pure
 * ceremony. Above it the flat list stops working: at 50 facilities a patient in
 * Ranchi had to reply MORE five times, paging through Patna and Gaya, and the
 * platform is built for 200.
 */
const CASCADE_THRESHOLD = 12;

/**
 * Go back up one rung of the cascade.
 *
 * `back` is deliberately shared with MENU_TRIGGERS rather than renamed: it is
 * the word people already type, and giving the cascade its own synonym would
 * mean two words for one idea. The collision is resolved by checking THIS list
 * first while a cascade state is active — see the handler above MENU_TRIGGERS.
 *
 * `b` is excluded on purpose. A single letter is how a patient typing a
 * hospital's initial ends up somewhere they did not ask for.
 */
const BACK_TRIGGERS = ['back', 'peeche', 'पीछे', 'wapas', 'वापस'];

/**
 * The escape hatch every rung of the cascade shares.
 *
 * Nobody thinks in states and districts when they already know where they are
 * going — they type "Gaya" or "dental" or the hospital's name. So a free-text
 * reply is tried as a search at EVERY rung, and:
 *
 *   - exactly one match  → skip the rest of the cascade, that is the facility
 *   - several matches    → show them, still skipping the rungs
 *   - none               → return null and let the caller re-ask its own step
 *
 * Returns null (not an error payload) so each rung can re-prompt in its own
 * words rather than all of them sharing one generic failure message.
 */
async function jumpBySearch(session, text, query, { waPhone = null } = {}) {
  const cleaned = String(query || '').trim();
  if (!cleaned) return null;

  // LIST is the documented way out of the cascade to a flat list of everything.
  if (norm(cleaned) === 'list') {
    return await openFacilityPicker(session, text, { waPhone });
  }

  const matches = await searchFacilities(cleaned);
  if (matches.length === 0) return null;
  return await openFacilityPicker(session, text, { waPhone, facilities: matches });
}

/**
 * The patient described their problem before choosing a hospital.
 *
 * This is not an edge case — the bot itself says "just type your problem", and
 * a person in pain leads with the pain, not with geography. It used to be read
 * as a facility search, so "bukhar hai" came back as *"I couldn't find a
 * facility matching bukhar hai"*, which reads as a rejection of the one thing
 * they came to say.
 *
 * Stash it and carry on asking which hospital — we genuinely cannot book
 * without one — but acknowledge it, and never ask for symptoms again.
 * Returns the acknowledgement line, or null when this is not symptom text.
 */
function stashSymptomsIfAny(session, text, message) {
  const cleaned = String(message || '').trim();
  if (cleaned.length < 3) return null;

  const triage = classifySymptoms(cleaned);
  if (!triage.confident) return null;

  session.tempData = { ...session.tempData, pendingSymptoms: cleaned };
  session.markModified && session.markModified('tempData');
  return { sender: 'bot', text: text.symptomNoted(triage.department) };
}

/** Facilities grouped by their resolved state, biggest group first. */
function groupByState(facilities) {
  const groups = new Map();
  for (const h of facilities) {
    const { state } = resolveLocation(h);
    if (!groups.has(state)) groups.set(state, []);
    groups.get(state).push(h);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

/** Facilities within one state, grouped by district, biggest group first. */
function groupByDistrict(facilities) {
  const groups = new Map();
  for (const h of facilities) {
    const { district } = resolveLocation(h);
    if (!groups.has(district)) groups.set(district, []);
    groups.get(district).push(h);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

/**
 * Ask which state, unless there is only one — in which case skip straight past
 * it. A patient in a single-state deployment should never be asked a question
 * with one possible answer.
 */
async function openStatePicker(session: any, text: any, { lead = [] as any[], waPhone = null as any } = {}) {
  const all = await searchFacilities('');

  // Small deployment: the cascade is overhead, show the list.
  if (all.length <= CASCADE_THRESHOLD) {
    return await openFacilityPicker(session, text, { lead, waPhone });
  }

  const states = groupByState(all);
  if (states.length === 1) {
    return await openDistrictPicker(session, text, states[0][0], { lead, waPhone });
  }

  const lines = states.map(([state, list], i) => text.stateLine(i + 1, state, list.length)).join('\n');
  session.currentState = 'AWAITING_STATE';
  session.tempData = {
    ...session.tempData,
    facilityChosen: false,
    stateShown: states.map(([state]) => state)
  };
  session.markModified && session.markModified('tempData');
  await session.save();

  return {
    messages: [...lead, { sender: 'bot', text: `${text.chooseState}\n\n${lines}` }],
    options: states.slice(0, 10).map(([state]) => state)
  };
}

/** Ask which district within `state`, skipping the question if there is only one. */
async function openDistrictPicker(
  session: any,
  text: any,
  state: any,
  { lead = [] as any[], waPhone = null as any } = {}
) {
  const all = await searchFacilities('');
  const inState = all.filter((h) => resolveLocation(h).state === state);
  const districts = groupByDistrict(inState);

  if (districts.length <= 1) {
    const only = districts[0];
    return await openFacilityPicker(session, text, {
      lead,
      waPhone,
      facilities: only ? only[1] : inState,
      district: only ? only[0] : state
    });
  }

  const lines = districts.map(([d, list], i) => text.districtLine(i + 1, d, list.length)).join('\n');
  session.currentState = 'AWAITING_DISTRICT';
  session.tempData = {
    ...session.tempData,
    facilityChosen: false,
    chosenState: state,
    districtShown: districts.map(([d]) => d)
  };
  session.markModified && session.markModified('tempData');
  await session.save();

  return {
    messages: [...lead, { sender: 'bot', text: `${text.chooseDistrict(state)}\n\n${lines}` }],
    options: districts.slice(0, 10).map(([d]) => d)
  };
}

/**
 * Bilingual header for the very first reply, shown BEFORE a language is known —
 * the facility list is now the first thing a patient sees after "hi".
 */
const GREETING_HEADER =
  '👋 Welcome to CareeAi! / केयरसिंक में आपका स्वागत है!\n' +
  'These are all the hospitals & clinics you can book at right now:\n' +
  'ये सभी अस्पताल व क्लिनिक अभी बुकिंग के लिए उपलब्ध हैं:';

/**
 * Open the "which hospital?" step with EVERY registered facility, the patient's
 * own last-visited one first. On the shared WhatsApp number this is the first
 * thing "hi" produces: the number belongs to the platform, not to one hospital,
 * so the list is the only way the patient reaches the facility they actually want
 * — and whatever they pick is the tenant every later step writes to.
 */
async function openFacilityPicker(
  session: any,
  text: any,
  { waPhone = null as any, lead = [] as any[], facilities = null as any, district = null as any } = {}
) {
  // `facilities` is passed when the cascade has already narrowed to a district;
  // omitted it means "every facility", which is the small-deployment path and
  // the LIST escape hatch.
  const pool = facilities || (await searchFacilities(''));
  const previous = waPhone ? await lastVisitedFacility(waPhone) : null;
  // Only promote the last-visited facility when it is actually in this pool —
  // pinning a Patna hospital to the top of a Ranchi district list would be
  // worse than not offering the shortcut at all.
  const promote = previous && pool.some((h) => h.id === previous.id) ? previous : null;
  const ordered = promote ? [promote, ...pool.filter((h) => h.id !== promote.id)] : pool;

  const { payload, shownIds } = facilityPrompt(text, ordered, {
    // Inside a district the heading names it, so the patient can see what the
    // list is scoped to and that BACK will widen it again.
    ...(district ? { query: district } : {}),
    lead: [
      ...lead,
      ...(district ? [{ sender: 'bot', text: text.chooseFacilityIn(district) }] : []),
      ...(promote ? [{ sender: 'bot', text: text.lastVisited(promote) }] : [])
    ]
  });

  session.currentState = 'AWAITING_FACILITY';
  session.tempData = {
    ...session.tempData,
    facilityChosen: false,
    facilityPage: 0,
    facilityShown: shownIds,
    ...(district ? { chosenDistrict: district } : {})
  };
  session.markModified && session.markModified('tempData');
  await session.save();
  return payload;
}

/** The facility this patient used last, so a returning patient can repeat it in one tap. */
async function lastVisitedFacility(phone) {
  if (!phone) return null;
  const variants = phoneVariants(phone);
  // Deliberately across facilities: the question this answers is "which facility
  // did this phone number last use", so it cannot be scoped to one of them. A
  // patient may hold records at several tenants under the same number.
  const patients =
    (await Patient.find({ $or: variants.map((p) => ({ phone: p })) }, null, { allTenants: true })) || [];
  if (patients.length === 0) return null;

  // Most recently updated patient record wins — that is the last facility they
  // actually interacted with.
  const newest = patients.sort(
    (a: any, b: any) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime()
  )[0];
  return newest && newest.hospital ? await Hospital.findOne({ id: newest.hospital }) : null;
}

/**
 * TENANT ISOLATION: only ever return doctors that belong to THIS facility.
 * Never fall back to Doctor.find({}) across all facilities — that would book
 * facility A's patient onto facility B's doctor and cross-contaminate tenant data.
 */
async function loadFacilityDoctors(currentHospId) {
  let doctors = await Doctor.find({
    hospital: currentHospId,
    availabilityStatus: { $ne: 'Unavailable' }
  });
  if (!doctors || doctors.length === 0) {
    doctors = await Doctor.find({ hospital: currentHospId });
  }
  return doctors || [];
}

/**
 * SMART TRIAGE — the single place symptoms turn into a doctor recommendation.
 * Shared by the "describe your symptoms" step AND the shortcut where a patient
 * just types their problem straight into the menu, so both behave identically:
 * read the symptoms, pick the department, escalate red flags, route to the
 * LEAST-BUSY doctor, and let the patient confirm with one tap.
 */
async function routeSymptoms({ session, symptoms, currentHospId, text, preMessages = [] }) {
  session.tempData = { ...session.tempData, symptoms };
  if (session.tempData.pendingSymptoms) delete session.tempData.pendingSymptoms;

  // Said here as well as at the booking itself, because this is the first moment
  // the answer is known. `finalizeBooking` is the gate that actually refuses;
  // this is so a patient is not walked through a doctor recommendation and two
  // more questions before being told the facility cannot take them.
  const { licenseFor } = require('../middleware/license');
  if ((await licenseFor(currentHospId)).blocked) {
    session.currentState = 'COMPLETED';
    session.markModified && session.markModified('tempData');
    await session.save();
    return {
      messages: [...preMessages, { sender: 'bot', text: text.facilityUnavailable }],
      options: text.options
    };
  }

  const doctors = await loadFacilityDoctors(currentHospId);
  if (doctors.length === 0) {
    session.markModified && session.markModified('tempData');
    await session.save();
    return { messages: [...preMessages, { sender: 'bot', text: text.noDoctors }], options: [] };
  }

  const triage = classifySymptoms(symptoms);

  // Red-flag symptoms auto-escalate to Emergency priority (unless the patient
  // already chose Emergency via the menu).
  const msgs = [...preMessages];
  if (triage.urgency === 'Emergency' && session.tempData.tokenType !== 'Emergency') {
    session.tempData.tokenType = 'Emergency';
    msgs.push({ sender: 'bot', text: text.emergencyDetected });
  }

  const {
    doctor: suggested,
    matchedDepartment,
    allFull
  } = await pickLeastBusyDoctor(doctors, triage.department);

  // OPD capacity cutoff: if every candidate doctor is full and this is not an
  // emergency, tell the patient now — don't recommend a doctor who can't take them.
  if (allFull && session.tempData.tokenType !== 'Emergency') {
    session.currentState = 'COMPLETED';
    session.markModified && session.markModified('tempData');
    await session.save();
    return { messages: [...msgs, { sender: 'bot', text: text.opdFull }], options: text.options };
  }

  if (suggested) {
    // Estimated wait for the suggested doctor so the patient sees the payoff of
    // load balancing before confirming.
    const sQueue = await Queue.findOne({ doctor: suggested._id });
    const sLen = (sQueue && sQueue.activeQueue && sQueue.activeQueue.length) || 0;
    // Shift-aware, cabin-aware and paced on what this doctor is actually
    // managing today. An empty queue is not "no wait" if the next sitting is at
    // five — that mismatch is what told a patient "Approx. wait: 0 min" for a
    // cabin that would be empty for hours — and it is not "no wait" either
    // while somebody is still inside the room.
    const sWait = await projectedWaitMinutes(suggested, sQueue, sLen);
    const shownDept = matchedDepartment ? triage.department : suggested.department || triage.department;

    session.tempData.suggestedDoctorId = String(suggested._id);
    session.currentState = 'AWAITING_TRIAGE_CONFIRM';
    session.markModified && session.markModified('tempData');
    await session.save();

    return {
      messages: [
        ...msgs,
        {
          sender: 'bot',
          text: text.triageRecommend(shownDept, suggested.name, suggested.currentRoom || 'Cabin A', sWait)
        },
        { sender: 'bot', text: text.triageConfirmPrompt }
      ],
      options: text.triageConfirmOptions
    };
  }

  // Fallback: could not auto-route — offer the full manual list.
  session.currentState = 'AWAITING_DOCTOR_CHOICE';
  session.markModified && session.markModified('tempData');
  await session.save();
  return {
    messages: [...msgs, { sender: 'bot', text: text.selectDoctorPrompt }],
    options: doctors.map((d) => `${d.name} (${d.department})`)
  };
}

/**
 * Live status of one token. Returns null when the token does not exist so the
 * caller can decide what to say.
 *
 * The facility is required, not optional. Token numbers restart at T-1 every
 * morning FOR EACH FACILITY, so `T-5` is not one token — it is one per tenant.
 * Looking one up by number alone returned whichever T-5 the database reached
 * first, which meant a patient asking about their own appointment could be shown
 * a stranger's name, doctor and queue position at a hospital they have never
 * visited. Wrong answer and cross-tenant disclosure from the same missing word.
 */
async function lookupTokenStatus(tokenNumber, text, hospital) {
  if (!hospital) return null;

  const token = await Token.findOne({ tokenNumber, hospital }).populate('patient').populate('doctor');

  // token.doctor/token.patient can be null if the referenced Doctor or Patient
  // document was deleted after the token was created — treat that the same as
  // "not found" instead of crashing on `._id`/`.name`.
  if (!token || !token.doctor || !token.patient) return null;

  const queue = await Queue.findOne({ doctor: token.doctor._id });
  let position = -1;
  if (queue) {
    if (queue.currentToken && queue.currentToken.toString() === token._id.toString()) {
      position = 0; // In cabin
    } else {
      position = queue.activeQueue.findIndex((id) => id.toString() === token._id.toString()) + 1;
    }
  }

  const statusText =
    position === 0
      ? text.statusInCabin
      : position > 0
        ? text.statusWaiting(position, token.estimatedWaitTime)
        : text.statusCompleted(token.status);

  return [
    { sender: 'bot', text: text.tokenDetailsHeader(token.tokenNumber) },
    {
      sender: 'bot',
      text: text.tokenDetailsBody(token.patient.name, token.doctor.name, token.doctor.department, statusText)
    }
  ];
}

/**
 * Everything a patient can usefully be told about one token, in one message.
 * ---------------------------------------------------------------------------
 * The old status reply was three lines: token number, doctor, and either "in
 * cabin" or "position N". That answers "where am I in the line" and nothing
 * else — so a patient whose sample was taken an hour ago, or whose prescription
 * has been sitting ready at the pharmacy, had to phone the hospital to find out.
 *
 * Everything below is already in the token; none of it needed new plumbing.
 */
async function describeToken(token, text) {
  const lines = [];

  const queue = await Queue.findOne({ doctor: token.doctor._id });
  let ahead = -1;
  if (queue) {
    if (queue.currentToken && String(queue.currentToken) === String(token._id)) {
      ahead = 0;
    } else {
      const idx = (queue.activeQueue || []).findIndex((id) => String(id) === String(token._id));
      ahead = idx; // 0 = next in line, -1 = not queued (done/absent)
    }
  }

  // The queue line goes INSIDE the details block rather than after it: the
  // template already has a "Live Status" field, and leaving it blank while
  // printing the same information two lines later reads like a bug.
  //
  // The token's OWN status is the source of truth for whether it is finished.
  // A missing queue position is not evidence of completion — it also happens
  // when the doctor's queue has not been built yet — and the old fallback
  // reported an actively-waiting patient as "checkup complete or cancelled",
  // which is the one thing they must never be told by mistake.
  const finished = token.status === 'Completed' || token.status === 'Absent';
  const liveStatus = finished
    ? text.statusCompleted(token.status)
    : ahead >= 0
      ? text.trackAheadOf(ahead, token.estimatedWaitTime || ahead * 10)
      : text.statusInQueue(token.status);

  lines.push(text.tokenDetailsHeader(token.tokenNumber));
  lines.push(
    text.tokenDetailsBody(token.patient.name, token.doctor.name, token.doctor.department, liveStatus)
  );

  // Where they physically are in the building, which is not the same question
  // as where they are in the queue — a patient at the lab is "in progress" but
  // has no queue position at all.
  const stage = token.journeyStage || 'Waiting';
  lines.push(text.trackStage(stage));
  const stageHint = stageMessage(stage);
  if (stageHint) lines.push(stageHint);

  // Pending work at other desks. Reported only when there is something to act
  // on — "0 reports ready" is noise on a phone.
  const readyLabs = (token.labTests || []).filter((t) => t.status === 'Completed');
  if (readyLabs.length) lines.push(text.trackLabReady(readyLabs.length));

  const rx = token.prescription;
  if (rx && (rx.medicines || []).length) {
    lines.push(rx.dispensed ? text.trackRxDispensed : text.trackRxReady(token.doctor.name));
  }

  return lines.filter(Boolean).map((t) => ({ sender: 'bot', text: t }));
}

/**
 * Track by phone number rather than token number.
 *
 * On WhatsApp this means ZERO typing: we already know the number they are
 * messaging from. Before this, "Check Live Queue Status" demanded a token
 * number, so a patient who had closed the chat or lost the message simply could
 * not track — which is most of them, and exactly the people who most need to
 * know whether to leave the house.
 */
async function trackByPhone(hospital, rawPhone, text) {
  const patient = await findPatientByPhone(hospital, rawPhone);
  if (!patient) return null;

  const tokens = onlyToday((await Token.find({ hospital, patient: patient._id })) || []);

  const active = tokens
    .filter((t) => t.status !== 'Completed' && t.status !== 'Absent')
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  if (active.length === 0) {
    return {
      patient,
      messages: [{ sender: 'bot', text: text.trackNothingToday(patient.name) }],
      hasActive: false
    };
  }

  // Populate is deliberately done per-token here rather than on the query:
  // `Token.find(...).populate()` then `.save()` is the trap documented in
  // utils/tenancy — these are read-only, but keeping the shape consistent
  // avoids anyone later adding a save to this path.
  const out = [];
  for (const t of active) {
    const full = await Token.findById(t._id).populate('patient').populate('doctor');
    if (full && full.doctor && full.patient) out.push(...(await describeToken(full, text)));
  }

  return { patient, messages: out, hasActive: true };
}

/**
 * The patient's last completed visit, for one-tap "book with them again".
 *
 * Scoped to the facility: "re-visit" means the same doctor at the same
 * hospital, and a doctor id from another tenant would fail the booking anyway.
 */
async function lastVisitFor(hospital, patientId) {
  const tokens = (await Token.find({ hospital, patient: patientId })) || [];
  const done = tokens
    .filter((t) => t.status === 'Completed')
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  if (done.length === 0) return null;
  return await Token.findById(done[0]._id).populate('doctor');
}

/**
 * The choices the CURRENT step offers. Used by HELP so showing help never wipes
 * the quick-reply buttons (and therefore the patient's place in the flow).
 */
async function optionsForState(session, text, currentHospId) {
  switch (session.currentState) {
    case 'LANGUAGE':
      return ['English', 'हिन्दी', 'Facility Info'];
    case 'AWAITING_FACILITY': {
      const facilities = await searchFacilities('');
      return facilities.slice(0, FACILITY_PAGE_SIZE).map((h) => h.name);
    }
    case 'AWAITING_GENDER':
      return text.genderOptions;
    case 'AWAITING_TRIAGE_CONFIRM':
      return text.triageConfirmOptions;
    case 'AWAITING_TRAVEL_TIME':
      return text.travelOptions;
    case 'AWAITING_DOCTOR_CHOICE': {
      const doctors = await loadFacilityDoctors(currentHospId);
      return doctors.map((d) => `${d.name} (${d.department})`);
    }
    case 'WELCOME':
    case 'COMPLETED':
      return text.options;
    default:
      return [];
  }
}

/** Reset the conversation back to a clean main menu, keeping language + facility. */
async function backToMenu(session, text, lang, currentHospId, leadMessages = []) {
  session.currentState = 'WELCOME';
  session.tempData = { language: lang, hospitalId: currentHospId, facilityChosen: true };
  session.markModified && session.markModified('tempData');
  await session.save();
  const facility = await Hospital.findOne({ id: currentHospId });
  return {
    messages: [
      ...leadMessages,
      { sender: 'bot', text: text.menuTitle },
      ...(facility ? [{ sender: 'bot', text: text.bookingAtFooter(facility) }] : [])
    ],
    options: text.options
  };
}

/**
 * MEDICINE REFILL: locate the patient's most recent prescription and raise a
 * refill request for the prescribing doctor to approve — no OPD slot consumed,
 * no trip to the hospital.
 */
async function handleRefill({ session, phone, currentHospId, text, lang, socketIo, leadMessages = [] }) {
  const patient = await findPatientByPhone(currentHospId, phone);

  let lastRx = null;
  if (patient) {
    // Newest token of this patient that actually carries medicines. We match the
    // patient in JS against both the id and a populated-object form of
    // token.patient — the complete-checkup handler saves the token after a
    // populate('patient'), which stores the populated object in place of the id,
    // so a plain `patient: id` query would miss it.
    const pid = String(patient._id);
    const toks = await Token.find({ hospital: currentHospId }).populate('doctor', '-passwordHash');
    lastRx =
      (toks || [])
        .filter((t) => {
          const tp = t.patient && (t.patient._id || t.patient);
          return (
            String(tp) === pid &&
            t.prescription &&
            Array.isArray(t.prescription.medicines) &&
            t.prescription.medicines.length > 0
          );
        })
        .sort(
          (a: any, b: any) =>
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime()
        )[0] || null;
  }

  if (!patient || !lastRx || !lastRx.doctor) {
    session.currentState = 'COMPLETED';
    session.tempData = { language: lang, hospitalId: currentHospId, facilityChosen: true };
    session.markModified && session.markModified('tempData');
    await session.save();
    return {
      messages: [...leadMessages, { sender: 'bot', text: text.refillNoRecord }],
      options: text.options
    };
  }

  const RefillRequest = require('../models/RefillRequest');
  const medsSnapshot = lastRx.prescription.medicines.map((m) => ({
    name: m.name,
    dosage: m.dosage,
    duration: m.duration,
    instructions: m.instructions
  }));
  await new RefillRequest({
    hospital: currentHospId,
    patient: patient._id,
    doctor: lastRx.doctor._id,
    sourceToken: lastRx._id,
    medicines: medsSnapshot,
    status: 'Pending'
  }).save();

  // Notify the doctor (best-effort push) that a refill is waiting.
  try {
    const pushHelper = require('../utils/pushHelper');
    await pushHelper.notifyByRole('Doctor', {
      title: '💊 New Medicine Refill Request',
      body: `${patient.name} has requested a repeat prescription. Tap to review.`,
      icon: '/icon.svg',
      url: '/'
    });
  } catch (_) {
    /* best-effort */
  }

  if (socketIo) {
    try {
      socketIo.to(`doctor:${lastRx.doctor._id}`).emit('refill-request');
    } catch (_) {}
  }

  const medsList =
    medsSnapshot
      .map((m) => m.name)
      .filter(Boolean)
      .join(', ') || 'previous medicines';
  session.currentState = 'COMPLETED';
  session.tempData = { language: lang, hospitalId: currentHospId, facilityChosen: true };
  session.markModified && session.markModified('tempData');
  await session.save();
  return {
    messages: [...leadMessages, { sender: 'bot', text: text.refillRequested(lastRx.doctor.name, medsList) }],
    options: text.options
  };
}

/**
 * Everything that happens once we know the patient's phone number — whether they
 * typed it or it came free with the WhatsApp session. A phone that is already
 * registered at this facility skips the name/age/gender interrogation entirely
 * (it used to be re-asked on every "Book New Appointment"), and if the patient
 * already told us their problem we go straight to the doctor recommendation.
 */
async function afterPhoneKnown({ session, phone, currentHospId, text, lang, socketIo, leadMessages = [] }) {
  // Look up with the raw input (tolerant), but STORE the canonical form.
  const patient =
    session.tempData && session.tempData.refillMode ? null : await findPatientByPhone(currentHospId, phone);

  session.tempData = { ...session.tempData, phone: patient ? patient.phone : normalizePhone(phone) };

  if (session.tempData.refillMode) {
    return await handleRefill({ session, phone, currentHospId, text, lang, socketIo, leadMessages });
  }

  if (patient) {
    session.tempData = {
      ...session.tempData,
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      // Carried forward so the travel question is not asked a second time. It
      // stays `undefined` for a patient who has never answered, which is what
      // makes the booking gate ask them.
      travelMinutes: patient.travelMinutes ?? undefined
    };
    const lead = [
      ...leadMessages,
      { sender: 'bot', text: text.welcomeBackText(patient.name, patient.age, patient.gender) }
    ];

    if (session.tempData.pendingSymptoms) {
      return await routeSymptoms({
        session,
        symptoms: session.tempData.pendingSymptoms,
        currentHospId,
        text,
        preMessages: lead
      });
    }

    session.currentState = 'AWAITING_SYMPTOMS';
    session.markModified && session.markModified('tempData');
    await session.save();
    return {
      messages: [...lead, { sender: 'bot', text: text.describeSymptoms }],
      options: []
    };
  }

  // Unknown number — register the patient first.
  session.currentState = 'AWAITING_NAME';
  session.markModified && session.markModified('tempData');
  await session.save();
  const lead = [...leadMessages];
  if (session.tempData.tokenType === 'Re-visit') {
    lead.push({ sender: 'bot', text: text.phoneNotFound });
  }
  return {
    messages: [...lead, { sender: 'bot', text: text.enterFullNameGeneric }],
    options: []
  };
}

/**
 * Start one of the menu flows. On WhatsApp the phone number is already known, so
 * the "enter your phone number" step is skipped completely — one less thing for
 * a patient to type on a small keypad.
 */
async function beginFlow({
  session,
  intent,
  text,
  currentHospId,
  lang,
  waPhone,
  socketIo,
  pendingSymptoms = null,
  leadMessages = []
}: any) {
  const tokenType = intent === 'emergency' ? 'Emergency' : intent === 'revisit' ? 'Re-visit' : 'Regular';

  // The earliest honest moment to say no.
  //
  // A facility whose subscription has lapsed cannot take a booking or a refill,
  // and the patient should hear that before typing a phone number, a name, an
  // age and a set of symptoms. `finalizeBooking` still refuses independently —
  // this is courtesy, that is the gate. Status lookups are untouched: a patient
  // holding a token today can still follow it.
  const { licenseFor } = require('../middleware/license');
  if (intent !== 'status' && (await licenseFor(currentHospId)).blocked) {
    session.currentState = 'COMPLETED';
    await session.save();
    return {
      messages: [...leadMessages, { sender: 'bot', text: text.facilityUnavailable }],
      options: text.options
    };
  }

  session.tempData = { ...session.tempData, refillMode: intent === 'refill' };
  if (intent !== 'refill') session.tempData.tokenType = tokenType;
  if (pendingSymptoms) session.tempData.pendingSymptoms = pendingSymptoms;

  if (waPhone) {
    return await afterPhoneKnown({
      session,
      phone: waPhone,
      currentHospId,
      text,
      lang,
      socketIo,
      leadMessages: [...leadMessages, { sender: 'bot', text: text.usingWhatsAppNumber(waPhone) }]
    });
  }

  session.currentState = 'AWAITING_PHONE';
  session.markModified && session.markModified('tempData');
  await session.save();

  const prompt =
    intent === 'refill'
      ? text.refillPhone
      : intent === 'emergency'
        ? text.emergencyPhone
        : intent === 'revisit'
          ? text.welcomeBackPhone
          : text.enterPhone;

  return { messages: [...leadMessages, { sender: 'bot', text: prompt }], options: [] };
}

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
    // The web widget always runs on a facility's own page, and a WhatsApp number
    // that serves exactly ONE facility is equally unambiguous — either way the
    // patient has effectively already chosen, so the picker is skipped and even a
    // fresh "hi" keeps them on that facility (`facilityLocked`).
    session.tempData = { ...session.tempData, hospitalId, facilityChosen: true, facilityLocked: true };
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
    session.tempData = { hospitalId: qrHospital.id, facilityChosen: true, facilityLocked: true, viaQr: true };
    session.markModified && session.markModified('tempData');
    await session.save();

    const rawWhatsapp = qrHospital.whatsappNumber || getPrimaryWhatsAppNumber();
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
  const hospital = (await Hospital.findOne({ id: currentHospId })) || (await Hospital.findOne({}));

  const lowerMsg = norm(cleanMsg);
  // WhatsApp sessions carry the patient's own number in the session id, so on
  // that channel we never have to ask "please enter your phone number".
  const waPhone = whatsappPhoneFromSession(sessionId);
  const knownLang = (session.tempData && session.tempData.language) || null;

  // `facility` defaults to the session's current one, but the facility picker
  // passes the freshly CHOSEN hospital so the language step is already branded
  // with the place the patient just selected.
  const languagePrompt = (facility = hospital) => {
    const rawWhatsapp = (facility && facility.whatsappNumber) || getPrimaryWhatsAppNumber();
    const num = rawWhatsapp.replace(/^whatsapp:/i, '');
    const facilityName = facility ? facility.name : 'CareeAi';
    return {
      messages: [
        {
          sender: 'bot',
          text: `Welcome to ${facilityName} AI Assistant! 🏥\n(WhatsApp: ${num})\n\nPlease select your preferred language / अपनी पसंदीदा भाषा चुनें:\n• English\n• हिन्दी\n\n(Tip: Reply "Info" for facility images, doctors count & services)`
        }
      ],
      options: ['English', 'हिन्दी', 'Facility Info']
    };
  };

  // Greeting / reset triggers. A patient who already picked a language should not
  // be asked for it again on every "hi" — send them straight to the menu. Only an
  // explicit "reset"/"restart" wipes the language choice.
  if (RESET_TRIGGERS.includes(lowerMsg)) {
    const hardReset = HARD_RESET_TRIGGERS.includes(lowerMsg);
    // A QR deep-link, the facility's own web page, or a WhatsApp number that
    // serves exactly one facility have all already answered "which hospital?" —
    // those sessions stay put. Everyone else is on the shared platform number, so
    // "hi" means "show me the hospitals".
    const locked = Boolean(session.tempData && session.tempData.facilityLocked);
    const facilities = await searchFacilities('');

    if (!locked && facilities.length > 1) {
      const keptLang = hardReset ? null : knownLang;
      const t0 = dictionary[keptLang || 'en'];
      session.tempData = keptLang ? { language: keptLang } : {};
      // Location first. A flat list of every facility is fine at three and
      // unusable at fifty — `openStatePicker` falls back to the flat list
      // itself below CASCADE_THRESHOLD, so a small deployment is unaffected.
      return await openStatePicker(session, t0, {
        waPhone,
        lead: [{ sender: 'bot', text: GREETING_HEADER } as any]
      });
    }

    if (knownLang && !hardReset) {
      const t0 = dictionary[knownLang];
      return await backToMenu(session, t0, knownLang, currentHospId, [{ sender: 'bot', text: t0.welcome }]);
    }
    session.currentState = 'LANGUAGE';
    session.tempData = { hospitalId: currentHospId, facilityChosen: locked, facilityLocked: locked };
    session.markModified && session.markModified('tempData');
    await session.save();
    return languagePrompt();
  }

  // --- Global commands, understood in EVERY state ---------------------------

  /**
   * "back" inside the location cascade means UP ONE RUNG, not "main menu".
   *
   * `back` is a MENU_TRIGGER, and MENU_TRIGGERS is checked before any state
   * handler — so without this the district list's own instruction ("Reply BACK
   * for states") threw the patient out to a language prompt for whatever
   * facility happened to be the session default. It has to be intercepted
   * before the global handler, not after.
   *
   * There is no menu to go back to at this point anyway: a facility has not
   * been chosen yet, which is the entire purpose of these three states.
   */
  if (BACK_TRIGGERS.includes(lowerMsg)) {
    const t0 = dictionary[knownLang || 'en'];
    const inCascade = session.tempData || {};

    if (session.currentState === 'AWAITING_FACILITY' && inCascade.chosenState) {
      return await openDistrictPicker(session, t0, inCascade.chosenState, { waPhone });
    }
    if (session.currentState === 'AWAITING_DISTRICT') {
      return await openStatePicker(session, t0, { waPhone });
    }
    if (session.currentState === 'AWAITING_STATE') {
      // Already at the top rung — re-show it rather than falling through to a
      // menu the patient cannot reach yet.
      return await openStatePicker(session, t0, { waPhone });
    }
    // Outside the cascade, `back` keeps its old meaning and falls through.
  }

  if (MENU_TRIGGERS.includes(lowerMsg)) {
    const t0 = dictionary[knownLang || 'en'];
    if (!knownLang) {
      session.currentState = 'LANGUAGE';
      session.markModified && session.markModified('tempData');
      await session.save();
      return languagePrompt();
    }
    return await backToMenu(session, t0, knownLang, currentHospId);
  }

  if (HELP_TRIGGERS.includes(lowerMsg)) {
    const t0 = dictionary[knownLang || 'en'];
    // Keep the patient exactly where they are — help must not throw away a
    // half-finished booking. Re-show whatever choices the current step offers.
    return {
      messages: [{ sender: 'bot', text: t0.helpText }],
      options: await optionsForState(session, t0, currentHospId)
    };
  }

  // Switch facility at any point — the patient may have picked the wrong one, or
  // simply want a different clinic today.
  if (CHANGE_FACILITY_TRIGGERS.includes(lowerMsg)) {
    const t0 = dictionary[knownLang || 'en'];
    // An explicit "HOSPITAL" overrides even a locked facility — the patient is
    // asking for a different one in so many words.
    session.tempData = { ...session.tempData, facilityLocked: false };
    return await openStatePicker(session, t0, { waPhone });
  }

  if (CHANGE_PHONE_TRIGGERS.includes(lowerMsg) && session.tempData && session.tempData.phone) {
    const t0 = dictionary[knownLang || 'en'];
    session.currentState = 'AWAITING_PHONE';
    session.tempData = { ...session.tempData, phone: undefined };
    session.markModified && session.markModified('tempData');
    await session.save();
    return { messages: [{ sender: 'bot', text: t0.changeNumberPrompt }], options: [] };
  }

  // "TIME 20" / "travel 1 hour" — correct a remembered travel time.
  //
  // The question is asked once and then reused for years, so there has to be a
  // way for the patient to say it has changed. Without one, a patient who moved
  // house keeps being told to leave an hour early forever, and the only person
  // who could fix it is a receptionist they never speak to.
  const travelEdit = lowerMsg.match(/^(travel|time|samay|समय|दूरी)\s+(.+)$/);
  if (travelEdit) {
    const t0 = dictionary[knownLang || 'en'];
    const minutes = parseTravelMinutes(travelEdit[2]);
    if (minutes !== null) {
      session.tempData = { ...session.tempData, travelMinutes: minutes };
      session.markModified && session.markModified('tempData');
      await session.save();

      // Persist against the patient's record when we know who they are, and
      // against any token they are still waiting on — a change announced while
      // already in the queue is exactly when it matters most.
      const known = session.tempData.phone
        ? await findPatientByPhone(currentHospId, session.tempData.phone)
        : null;
      if (known) {
        known.travelMinutes = minutes;
        await known.save();
        try {
          const live = onlyToday(
            await Token.find({ hospital: currentHospId, patient: known._id, status: 'Waiting' })
          );
          for (const tk of live) {
            await Token.findByIdAndUpdate(tk._id, { travelMinutes: minutes, departureAlerted: false });
          }
        } catch (tErr) {
          logger.error('Could not apply a travel-time change to live tokens', { err: tErr });
        }
      }
      return { messages: [{ sender: 'bot', text: t0.travelSaved(minutes) }], options: t0.options };
    }
  }

  // Facility Info inquiry trigger
  const infoTriggers = [
    'info',
    'facility info',
    'doctor info',
    'doctors',
    'images',
    'photos',
    'gallery',
    'services',
    'facility'
  ];
  if (infoTriggers.includes(cleanMsg.toLowerCase())) {
    if (hospital) {
      const docCount = hospital.doctorCount || (await Doctor.countDocuments({ hospital: hospital.id }));
      const logoStr = hospital.logoUrl ? `\n• Logo: ${hospital.logoUrl}` : '';
      const coverStr = hospital.coverImage ? `\n• Cover Photo: ${hospital.coverImage}` : '';
      const galleryStr =
        hospital.galleryImages && hospital.galleryImages.length > 0
          ? `\n• Gallery Photos:\n  ${hospital.galleryImages.join('\n  ')}`
          : '';
      const servicesStr =
        hospital.customServices && hospital.customServices.length > 0
          ? `\n• Key Services: ${hospital.customServices.map((s) => s.title).join(', ')}`
          : '';

      const infoText = `🏥 *${hospital.name}* (${hospital.type || 'Hospital'})\n📍 ${hospital.address}, ${hospital.city}\n📞 Phone: ${hospital.phone}\n💬 WhatsApp: ${hospital.whatsappNumber}\n👨‍⚕️ Registered Doctors: ${docCount}${logoStr}${coverStr}${galleryStr}${servicesStr}`;
      return {
        messages: [{ sender: 'bot', text: infoText }],
        options: dictionary[(session.tempData && session.tempData.language) || 'en'].options
      };
    }
  }

  // Handshake for language choice at the start. Accepts the button label, the
  // option number, and what people actually type ("hindi", "हिंदी", "eng").
  if (session.currentState === 'LANGUAGE') {
    // "3" is the third button (Facility Info) — a WhatsApp interactive reply
    // sends the number, not the label, so map it here instead of treating it
    // as an unrecognised language and silently defaulting to English.
    if (lowerMsg === '3') {
      return {
        messages: [
          {
            sender: 'bot',
            text: 'Please type *Info* to see facility photos, doctors and services — or pick a language above.'
          }
        ],
        options: ['English', 'हिन्दी', 'Facility Info']
      };
    }

    const selectedLanguage = lowerMsg === '2' || /हिन|hindi|hin$|^h$/.test(lowerMsg) ? 'hi' : 'en';
    session.tempData = { ...session.tempData, language: selectedLanguage };
    session.currentState = 'WELCOME';
    session.markModified && session.markModified('tempData');
    await session.save();

    const langText = dictionary[selectedLanguage];

    // Safety net: a session that somehow reached the language step without a
    // facility (an older session, or a locked one that lost its hospital) still
    // gets the picker before the menu — never silently book into the default
    // hospital while every other facility stays unreachable.
    const facilities = await searchFacilities('');
    if (!session.tempData.facilityChosen && facilities.length > 1) {
      return await openStatePicker(session, langText, { waPhone });
    }

    // The patient told us their problem back at the hospital picker, and has
    // now answered the last question we actually needed. Showing them a menu
    // whose first item is "Book New Appointment" would be asking them to say it
    // a third time.
    if (session.tempData.pendingSymptoms && session.tempData.facilityChosen) {
      const symptoms = session.tempData.pendingSymptoms;
      const triage = classifySymptoms(symptoms);
      return await beginFlow({
        session,
        intent: triage.urgency === 'Emergency' ? 'emergency' : 'book',
        text: langText,
        currentHospId: session.tempData.hospitalId || currentHospId,
        lang: selectedLanguage,
        waPhone,
        socketIo,
        pendingSymptoms: symptoms
      });
    }

    // A patient who just picked a hospital off the list gets that hospital's name
    // back, not the platform's: the generic welcome line names CareeAi and the
    // shared number, which reads as "wrong hospital" one message after choosing.
    // Sessions that arrived already tied to a facility (its own web page, its QR)
    // keep the welcome, whose WhatsApp hint is useful there.
    const branded = hospital && !session.tempData.facilityLocked;

    return {
      messages: [
        { sender: 'bot', text: branded ? langText.bookingAtFooter(hospital) : langText.welcome },
        { sender: 'bot', text: langText.selectOption },
        { sender: 'bot', text: langText.tipTypeProblem }
      ],
      options: langText.options
    };
  }

  // AWAITING_FACILITY — the patient picks which hospital/clinic they want.
  // Accepts the option number, the facility name, or a free-text search by city,
  // district or type ("dental", "Patna").
  /**
   * AWAITING_STATE — the first rung of the location cascade.
   *
   * Every rung accepts a free-text search as an escape hatch, because people
   * say "the Gaya one" far more often than they navigate a menu. A search that
   * lands on exactly one facility skips the remaining rungs entirely.
   */
  if (session.currentState === 'AWAITING_STATE') {
    const t0 = dictionary[knownLang || 'en'];
    const shown = (session.tempData && session.tempData.stateShown) || [];

    const picked = parseInt(cleanMsg, 10);
    if (!isNaN(picked) && picked >= 1 && picked <= shown.length) {
      return await openDistrictPicker(session, t0, shown[picked - 1], { waPhone });
    }

    const jumped = await jumpBySearch(session, t0, cleanMsg, { waPhone });
    if (jumped) return jumped;

    // Not a state, not a facility — but it may be why they are here at all.
    const noted = stashSymptomsIfAny(session, t0, cleanMsg);
    if (noted) return await openStatePicker(session, t0, { waPhone, lead: [noted as any] });

    return await openStatePicker(session, t0, {
      waPhone,
      lead: [{ sender: 'bot', text: t0.facilityNotFound(cleanMsg) } as any]
    });
  }

  /** AWAITING_DISTRICT — second rung. BACK widens to states again. */
  if (session.currentState === 'AWAITING_DISTRICT') {
    const t0 = dictionary[knownLang || 'en'];
    const shown = (session.tempData && session.tempData.districtShown) || [];
    const state = session.tempData && session.tempData.chosenState;

    if (BACK_TRIGGERS.includes(lowerMsg)) {
      return await openStatePicker(session, t0, { waPhone });
    }

    const picked = parseInt(cleanMsg, 10);
    if (!isNaN(picked) && picked >= 1 && picked <= shown.length) {
      const district = shown[picked - 1];
      const all = await searchFacilities('');
      const inDistrict = all.filter((h) => {
        const loc = resolveLocation(h);
        return loc.state === state && loc.district === district;
      });
      if (inDistrict.length === 0) {
        return await openDistrictPicker(session, t0, state, {
          waPhone,
          lead: [{ sender: 'bot', text: t0.noneInDistrict(district) } as any]
        });
      }
      return await openFacilityPicker(session, t0, { waPhone, facilities: inDistrict, district });
    }

    const jumped = await jumpBySearch(session, t0, cleanMsg, { waPhone });
    if (jumped) return jumped;

    const noted = stashSymptomsIfAny(session, t0, cleanMsg);
    if (noted) return await openDistrictPicker(session, t0, state, { waPhone, lead: [noted] });

    return await openDistrictPicker(session, t0, state, {
      waPhone,
      lead: [{ sender: 'bot', text: t0.facilityNotFound(cleanMsg) } as any]
    });
  }

  if (session.currentState === 'AWAITING_FACILITY') {
    const t0 = dictionary[knownLang || 'en'];

    // BACK from the facility list returns to the districts of the state the
    // patient already chose, rather than restarting the whole cascade.
    if (BACK_TRIGGERS.includes(lowerMsg) && session.tempData && session.tempData.chosenState) {
      return await openDistrictPicker(session, t0, session.tempData.chosenState, { waPhone });
    }
    const shownIds = (session.tempData && session.tempData.facilityShown) || [];

    // 1. A number refers to the numbered list we just showed.
    const picked = parseInt(cleanMsg, 10);
    let chosen = null;
    if (!isNaN(picked) && picked >= 1 && picked <= shownIds.length) {
      chosen = await Hospital.findOne({ id: shownIds[picked - 1] });
    }

    // 1b. The facility list is now the FIRST thing a patient sees, so a language
    //     word here ("English", "हिन्दी") is them answering the step they expected
    //     — not a hospital search. Remember it and re-show the list in that
    //     language instead of reporting "no facility matches English".
    if (!chosen && /^(english|eng|अंग्रेजी|hindi|hin|हिंदी|हिन्दी)$/.test(lowerMsg)) {
      const picked2 = /हिं|हिन्|hindi|^hin$/.test(lowerMsg) ? 'hi' : 'en';
      session.tempData = { ...session.tempData, language: picked2 };
      return await openFacilityPicker(session, dictionary[picked2], { waPhone });
    }

    // 2. Otherwise treat it as a name/city search.
    if (!chosen && cleanMsg) {
      if (['more', 'next', 'aur', 'और'].includes(lowerMsg)) {
        const all = await searchFacilities('');
        const page = ((session.tempData && session.tempData.facilityPage) || 0) + 1;
        const { payload, shownIds: nextIds } = facilityPrompt(t0, all, { page });
        session.tempData.facilityPage = page;
        session.tempData.facilityShown = nextIds;
        session.markModified && session.markModified('tempData');
        await session.save();
        return payload;
      }

      const matches = await searchFacilities(lowerMsg === 'list' ? '' : cleanMsg);
      if (matches.length === 1) {
        chosen = matches[0];
      } else if (matches.length > 1) {
        const { payload, shownIds: nextIds } = facilityPrompt(t0, matches, { query: cleanMsg });
        session.tempData.facilityPage = 0;
        session.tempData.facilityShown = nextIds;
        session.markModified && session.markModified('tempData');
        await session.save();
        return payload;
      }
    }

    if (!chosen) {
      // Symptoms typed at the hospital list are the commonest way into this
      // branch, and answering "no facility matches bukhar hai" is the single
      // worst reply the bot can give someone describing a fever.
      const noted = stashSymptomsIfAny(session, t0, cleanMsg);
      const district = session.tempData && session.tempData.chosenDistrict;
      if (noted) {
        // Re-show whatever list they were already looking at, not all 200.
        const pool = district
          ? (await searchFacilities('')).filter((h) => resolveLocation(h).district === district)
          : null;
        return await openFacilityPicker(session, t0, {
          waPhone,
          lead: [noted as any],
          ...(pool ? { facilities: pool, district } : {})
        });
      }

      const all = await searchFacilities('');
      const { payload, shownIds: nextIds } = facilityPrompt(t0, all, {
        lead: [{ sender: 'bot', text: t0.facilityNotFound(cleanMsg) } as any]
      });
      session.tempData.facilityShown = nextIds;
      session.markModified && session.markModified('tempData');
      await session.save();
      return payload;
    }

    // Locked in: every later turn — patient record, token, queue, bill — is
    // written against THIS facility, so the booking lands on its dashboard.
    //
    // `pendingSymptoms` is deliberately carried across. A patient who typed
    // "bukhar hai" while still choosing a hospital has already told us why they
    // are here; this object used to be rebuilt from scratch, throwing that away
    // and asking "describe your symptoms" one message later.
    const carriedSymptoms = session.tempData && session.tempData.pendingSymptoms;
    session.tempData = {
      language: knownLang || undefined,
      hospitalId: chosen.id,
      facilityChosen: true,
      ...(carriedSymptoms ? { pendingSymptoms: carriedSymptoms } : {})
    };

    // The picker now runs before the language step, so a first-time patient
    // still owes us a language. Ask it here, branded with the facility they
    // just chose, instead of assuming English.
    if (!knownLang) {
      session.currentState = 'LANGUAGE';
      session.markModified && session.markModified('tempData');
      await session.save();
      const prompt = languagePrompt(chosen);
      return {
        ...prompt,
        messages: [{ sender: 'bot', text: t0.facilityChosen(chosen) }, ...prompt.messages]
      };
    }

    // Symptoms already in hand and a facility now chosen — that is a complete
    // booking request, so start it instead of showing a menu the patient would
    // only use to say what they already said.
    if (carriedSymptoms) {
      session.currentState = 'WELCOME';
      session.markModified && session.markModified('tempData');
      await session.save();
      const triage = classifySymptoms(carriedSymptoms);
      return await beginFlow({
        session,
        intent: triage.urgency === 'Emergency' ? 'emergency' : 'book',
        text: t0,
        currentHospId: chosen.id,
        lang: knownLang,
        waPhone,
        socketIo,
        pendingSymptoms: carriedSymptoms,
        leadMessages: [{ sender: 'bot', text: t0.facilityChosen(chosen) }]
      });
    }

    session.currentState = 'WELCOME';
    session.markModified && session.markModified('tempData');
    await session.save();

    return {
      messages: [
        { sender: 'bot', text: t0.facilityChosen(chosen) },
        { sender: 'bot', text: t0.selectOption },
        { sender: 'bot', text: t0.tipTypeProblem }
      ],
      options: t0.options
    };
  }

  // Fetch current language
  const lang = (session.tempData && session.tempData.language) || 'en';
  const text = dictionary[lang];
  const state = session.currentState;

  // WELCOME state processing.
  // COMPLETED is handled here too: after a booking finishes, the menu options
  // are shown again, so selecting one (e.g. "Book New Appointment") must start
  // a fresh booking instead of endlessly repeating "previous booking complete".
  if (state === 'WELCOME' || state === 'COMPLETED') {
    // 1. A token number typed straight into the menu ("T-101", "101") is an
    //    obvious status request — answer it without making the patient first
    //    navigate to option 4.
    const menuToken = parseTokenNumber(cleanMsg);
    if (menuToken && !['1', '2', '3', '4', '5'].includes(lowerMsg)) {
      const statusMsgs = await lookupTokenStatus(menuToken, text, currentHospId);
      if (statusMsgs) {
        session.currentState = 'WELCOME';
        session.markModified && session.markModified('tempData');
        await session.save();
        return { messages: statusMsgs, options: text.options };
      }
    }

    // 2. Menu intent: option number, exact label, or plain language.
    const intent = detectMenuIntent(cleanMsg);

    if (intent === 'status') {
      // On WhatsApp we already know who is asking. Demanding a token number
      // from someone whose number we are literally reading the message from is
      // the reason "Check Live Queue Status" went unused: the patients who most
      // need it are the ones who closed the chat and lost the token message.
      if (waPhone) {
        const tracked = await trackByPhone(currentHospId, waPhone, text);
        if (tracked) {
          session.currentState = 'WELCOME';
          session.markModified && session.markModified('tempData');
          await session.save();

          // Nothing live today — offer the two things they would ask for next
          // rather than leaving them at a dead end.
          if (!tracked.hasActive) {
            const last = await lastVisitFor(currentHospId, tracked.patient._id);
            const extra =
              last && last.doctor
                ? [
                    {
                      sender: 'bot',
                      text: text.revisitOffer(
                        last.doctor.name,
                        last.doctor.department,
                        new Date(last.createdAt).toLocaleDateString()
                      )
                    }
                  ]
                : [];
            session.tempData = {
              ...session.tempData,
              revisitDoctorId: last && last.doctor ? String(last.doctor._id) : undefined
            };
            session.markModified && session.markModified('tempData');
            await session.save();
            return { messages: [...tracked.messages, ...extra], options: text.options };
          }

          return { messages: tracked.messages, options: text.options };
        }
        return { messages: [{ sender: 'bot', text: text.trackNoRecords }], options: text.options };
      }

      session.currentState = 'AWAITING_TOKEN';
      session.markModified && session.markModified('tempData');
      await session.save();
      return { messages: [{ sender: 'bot', text: text.trackHowPrompt }], options: [] };
    }

    if (intent) {
      return await beginFlow({ session, intent, text, currentHospId, lang, waPhone, socketIo });
    }

    // 3. No menu intent — but if the patient simply described their problem
    //    ("fever since 2 days", "seene me dard"), that IS the booking request.
    //    Remember the symptoms and jump straight into the flow.
    const triageGuess = classifySymptoms(cleanMsg);
    if (cleanMsg.length >= 3 && triageGuess.confident) {
      return await beginFlow({
        session,
        intent: triageGuess.urgency === 'Emergency' ? 'emergency' : 'book',
        text,
        currentHospId,
        lang,
        waPhone,
        socketIo,
        pendingSymptoms: cleanMsg
      });
    }

    return {
      messages: [{ sender: 'bot', text: text.notUnderstood }],
      options: text.options
    };
  }

  // AWAITING_TOKEN state — the patient is identifying themselves to be tracked.
  // Accepts a token number OR a phone number: on the web widget there is no
  // number to read off the message, and "I don't have the token" is the most
  // common reason tracking failed.
  if (state === 'AWAITING_TOKEN') {
    const tokenNumber = parseTokenNumber(cleanMsg);
    let statusMsgs = tokenNumber ? await lookupTokenStatus(tokenNumber, text, currentHospId) : null;

    if (!statusMsgs && isLikelyPhone(cleanMsg)) {
      const tracked = await trackByPhone(currentHospId, cleanMsg, text);
      if (tracked) statusMsgs = tracked.messages;
    }

    if (!statusMsgs) {
      return { messages: [{ sender: 'bot', text: text.tokenNotFound }], options: [] };
    }
    session.currentState = 'WELCOME';
    session.tempData = { language: lang, hospitalId: currentHospId, facilityChosen: true };
    session.markModified && session.markModified('tempData');
    await session.save();
    return { messages: statusMsgs, options: text.options };
  }

  // AWAITING_PHONE state
  if (state === 'AWAITING_PHONE') {
    if (!isLikelyPhone(cleanMsg)) {
      return {
        messages: [{ sender: 'bot', text: text.invalidPhone }],
        options: []
      };
    }

    return await afterPhoneKnown({ session, phone: cleanMsg, currentHospId, text, lang, socketIo });
  }

  // AWAITING_NAME state
  if (state === 'AWAITING_NAME') {
    if (cleanMsg.length < 2) {
      return {
        messages: [{ sender: 'bot', text: text.invalidName }],
        options: []
      };
    }

    // A phone number is not a name.
    //
    // On WhatsApp the bot says "using your number, no need to type it" and then
    // immediately asks for a name — so a patient mid-thought types their number
    // anyway. It was accepted verbatim, their real name was then rejected as an
    // invalid age, and the token was booked for a patient called "9999900001".
    // Reproduced end to end before this check existed.
    // `\p{L}` rather than an explicit Latin+Devanagari class: names arrive in
    // whatever script the patient types, and a hand-written range silently
    // rejects Bengali or Tamil while looking like it covers "all names".
    if (isLikelyPhone(cleanMsg) && !/\p{L}/u.test(cleanMsg)) {
      return {
        messages: [{ sender: 'bot', text: text.nameLooksLikePhone }],
        options: []
      };
    }

    session.tempData = { ...session.tempData, name: normalizeName(cleanMsg) };
    session.currentState = 'AWAITING_AGE';
    session.markModified && session.markModified('tempData');
    await session.save();
    return {
      messages: [{ sender: 'bot', text: text.enterAge(cleanMsg) }],
      options: []
    };
  }

  // AWAITING_AGE state. Accepts "45", "45 years", "45 saal", "उम्र 45".
  if (state === 'AWAITING_AGE') {
    const ageMatch = cleanMsg.match(/\d{1,3}/);
    const age = ageMatch ? parseInt(ageMatch[0], 10) : NaN;
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

  // AWAITING_GENDER state. Accepts the button, the number, and the short forms
  // people actually type ("m", "f", "male", "पुरुष", "mahila").
  if (state === 'AWAITING_GENDER') {
    const g = lowerMsg;
    const isMale = g === '1' || /^(m|male|man|boy|पुरुष|पुरुष|मर्द|आदमी|purush)$/.test(g);
    const isFemale = g === '2' || /^(f|female|woman|girl|महिला|स्त्री|औरत|mahila)$/.test(g);
    const isOther = g === '3' || /^(o|other|others|अन्य|dusra)$/.test(g);

    if (!isMale && !isFemale && !isOther) {
      return {
        messages: [{ sender: 'bot', text: text.invalidGender }],
        options: text.genderOptions
      };
    }
    session.tempData = { ...session.tempData, gender: isMale ? 'Male' : isFemale ? 'Female' : 'Other' };

    // If the patient already described their problem before we asked for their
    // details, don't ask for it a second time — go straight to the doctor.
    if (session.tempData.pendingSymptoms) {
      return await routeSymptoms({
        session,
        symptoms: session.tempData.pendingSymptoms,
        currentHospId,
        text,
        preMessages: [{ sender: 'bot', text: text.symptomsNoted(session.tempData.pendingSymptoms) }]
      });
    }

    session.currentState = 'AWAITING_SYMPTOMS';
    session.markModified && session.markModified('tempData');
    await session.save();
    return {
      messages: [{ sender: 'bot', text: text.describeSymptomsLong }],
      options: []
    };
  }

  // AWAITING_SYMPTOMS state — the patient describes the problem in their own
  // words and the smart-triage engine takes it from there.
  if (state === 'AWAITING_SYMPTOMS') {
    // Older sessions (started before AWAITING_DOCTOR_CHOICE existed) used this
    // state for the manual doctor list too, flagged by symptoms already being
    // set. Keep honouring that so an in-flight conversation doesn't dead-end.
    if (session.tempData && session.tempData.symptoms) {
      session.currentState = 'AWAITING_DOCTOR_CHOICE';
    } else {
      if (!cleanMsg) {
        return { messages: [{ sender: 'bot', text: text.describeSymptomsLong }], options: [] };
      }
      return await routeSymptoms({ session, symptoms: cleanMsg, currentHospId, text });
    }
  }

  // AWAITING_DOCTOR_CHOICE state — patient picks a doctor from the manual list.
  if (session.currentState === 'AWAITING_DOCTOR_CHOICE') {
    const doctors = await loadFacilityDoctors(currentHospId);
    if (doctors.length === 0) {
      return { messages: [{ sender: 'bot', text: text.noDoctors }], options: [] };
    }

    const docNames = doctors.map((d) => `${d.name} (${d.department})`);

    // Exact label, then option number, then a loose name match ("dr sarah").
    let selectedDoc = doctors.find((d) => `${d.name} (${d.department})` === cleanMsg);

    const docIdx = parseInt(cleanMsg, 10) - 1;
    if (!selectedDoc && !isNaN(docIdx) && doctors[docIdx]) {
      selectedDoc = doctors[docIdx];
    }

    if (!selectedDoc && cleanMsg.length >= 3) {
      const needle = lowerMsg.replace(/^dr\.?\s*/, '');
      selectedDoc = doctors.find((d) => {
        const dn = d.name.toLowerCase().replace(/^dr\.?\s*/, '');
        return dn.includes(needle) || needle.includes(dn);
      });
    }

    // Still nothing? Maybe they named a DEPARTMENT instead ("skin doctor").
    if (!selectedDoc && cleanMsg.length >= 3) {
      selectedDoc = doctors.find((d) => d.department && lowerMsg.includes(d.department.toLowerCase()));
    }

    if (!selectedDoc) {
      return {
        messages: [{ sender: 'bot', text: text.invalidDoctor }],
        options: docNames
      };
    }

    // Complete booking via the shared helper (same path as auto-triage) — after
    // the one travel-time question, if this patient has not answered it before.
    return await askTravelTimeOrBook({ session, selectedDoc, currentHospId, text, socketIo });
  }

  // AWAITING_TRAVEL_TIME state — the answer that makes every later alert this
  // patient's own. The doctor is already chosen and held in tempData; all that
  // is left is to read a duration out of whatever they replied.
  if (state === 'AWAITING_TRAVEL_TIME') {
    const picked = travelChoiceMinutes(cleanMsg, text);
    const minutes = picked !== null ? picked : parseTravelMinutes(cleanMsg);
    if (minutes === null) {
      return {
        messages: [{ sender: 'bot', text: text.invalidTravelTime }],
        options: text.travelOptions
      };
    }

    session.tempData = { ...session.tempData, travelMinutes: minutes };
    session.markModified && session.markModified('tempData');
    await session.save();

    const doctors = await loadFacilityDoctors(currentHospId);
    if (doctors.length === 0) {
      return { messages: [{ sender: 'bot', text: text.noDoctors }], options: [] };
    }
    const pendingId = session.tempData.pendingDoctorId;
    const selectedDoc = doctors.find((d) => String(d._id) === String(pendingId)) || doctors[0];

    const booked = await finalizeBooking({ session, selectedDoc, currentHospId, text, socketIo });
    return {
      ...booked,
      messages: [{ sender: 'bot', text: text.travelSaved(minutes) }, ...(booked.messages || [])]
    };
  }

  // AWAITING_TRIAGE_CONFIRM state — patient responds to the smart recommendation.
  // "Yes" books the suggested least-busy doctor in one tap; "Choose Another"
  // falls back to the full manual doctor list.
  if (state === 'AWAITING_TRIAGE_CONFIRM') {
    const isConfirm =
      cleanMsg === '1' ||
      cleanMsg === text.triageConfirmOptions[0] ||
      /^(yes|y|ok|okay|confirm|book|haan|हाँ|हां| हा|ठीक)/i.test(cleanMsg);
    const isChange =
      cleanMsg === '2' ||
      cleanMsg === text.triageConfirmOptions[1] ||
      /^(no|n|change|other|another|दूसरा|बदल)/i.test(cleanMsg);

    // Load doctors for this facility once (tenant-safe) — needed for both paths.
    const doctors = await loadFacilityDoctors(currentHospId);
    if (doctors.length === 0) {
      return { messages: [{ sender: 'bot', text: text.noDoctors }], options: [] };
    }

    if (isConfirm) {
      const suggestedId = session.tempData && session.tempData.suggestedDoctorId;
      const selectedDoc = doctors.find((d) => String(d._id) === String(suggestedId)) || doctors[0];
      return await askTravelTimeOrBook({ session, selectedDoc, currentHospId, text, socketIo });
    }

    if (isChange) {
      // Hand off to the manual doctor list.
      session.currentState = 'AWAITING_DOCTOR_CHOICE';
      if (session.tempData) delete session.tempData.suggestedDoctorId;
      session.markModified && session.markModified('tempData');
      await session.save();
      const docNames = doctors.map((d) => `${d.name} (${d.department})`);
      return {
        messages: [{ sender: 'bot', text: text.selectDoctorPrompt }],
        options: docNames
      };
    }

    // Unrecognized reply — re-show the confirm prompt.
    return {
      messages: [{ sender: 'bot', text: text.triageConfirmPrompt }],
      options: text.triageConfirmOptions
    };
  }

  // Unknown / stale state — never dead-end the patient, put them back on the menu.
  return await backToMenu(session, text, lang, currentHospId, [{ sender: 'bot', text: text.notUnderstood }]);
}

router.post('/message', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1 && !useMockDb()) {
      return res.status(503).json({
        message:
          'Database connection is offline. Please verify you have whitelisted all IP addresses (0.0.0.0/0) in your MongoDB Atlas Network Access panel.'
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
  } catch (error: any) {
    logger.error('Chat error details', { err: error });
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

    // Match hospital by registered WhatsApp Business number.
    // Compare on digits only — feeding a raw phone number like "+917484043690"
    // straight into `new RegExp()` throws "Nothing to repeat" (the leading `+`
    // is an invalid quantifier), which used to crash the whole webhook so the
    // patient's reply never got a response ("aage kuch nahi ho raha tha").
    // Only a number that serves EXACTLY ONE facility identifies a hospital. When
    // several facilities share the platform number (the normal case), the number
    // says nothing about where the patient wants to go — the "hi" hospital list
    // decides that.
    let hospital = null;
    const toDigits = cleanTo.replace(/\D/g, '');
    if (toDigits) {
      const allHospitals = await Hospital.find({});
      const owners = allHospitals.filter(
        (h) => h.whatsappNumber && h.whatsappNumber.replace(/\D/g, '') === toDigits
      );
      hospital = owners.length === 1 ? owners[0] : null;
    }

    // Which facility does this chat belong to? A hospital the session ALREADY
    // locked onto (e.g. via a scanned facility QR) must win on every later turn —
    // only SEED from the receiving number for a brand-new conversation, so we
    // never overwrite the patient's chosen facility mid-booking.
    // Digits-only session id — the Meta webhook builds it the same way, so the
    // SAME patient number is one conversation no matter which provider delivered
    // the message (and `whatsappPhoneFromSession` can read the number back out).
    const waSessionId = `wa_${cleanFrom.replace(/\D/g, '')}`;
    const priorSession = await ChatSession.findOne({ sessionId: waSessionId });
    let seedHospitalId;
    if (priorSession && priorSession.tempData && priorSession.tempData.hospitalId) {
      seedHospitalId = undefined; // preserve the session's facility
    } else {
      seedHospitalId = hospital ? hospital.id : undefined; // fall back to default inside the engine
    }

    const result = await processChatMessage({
      sessionId: waSessionId,
      message: incomingBody,
      hospitalId: seedHospitalId,
      socketIo: req.io
    });

    const replyText = result.messages.map((m) => m.text).join('\n\n');
    const optionsText =
      result.options && result.options.length > 0
        ? `\n\nReply with option:\n` + result.options.map((o, idx) => `${idx + 1}. ${o}`).join('\n')
        : '';

    const fullMessage = replyText + optionsText;

    // If incoming request is a Twilio form-encoded webhook, reply with TwiML XML
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('x-www-form-urlencoded')) {
      const xmlEscaped = fullMessage.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      res.type('text/xml');
      return res.send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscaped}</Message></Response>`
      );
    }

    // Standard JSON response
    return res.json({
      from: cleanFrom,
      to: cleanTo,
      response: fullMessage,
      details: result
    });
  } catch (err: any) {
    logger.error('WhatsApp webhook error', { err: err });
    res.status(500).json({ message: 'Server error processing WhatsApp webhook' });
  }
});

// GET public queue wait times and WhatsApp config
router.get('/queues/public-status', async (req, res) => {
  try {
    const { hospitalId } = req.query;

    const filter: any = {};
    if (hospitalId) {
      const doctors = await Doctor.find({ hospital: hospitalId });
      const docIds = doctors.map((d) => d._id);
      filter.doctor = { $in: docIds };
    }

    const queues = await Queue.find(filter).populate('doctor');
    const deptTimes = {
      Emergency: 15,
      'General Practice': 15,
      Pediatrics: 10
    };

    queues.forEach((q) => {
      if (!q.doctor) return;
      const dept = q.doctor.department;
      const count = q.activeQueue ? q.activeQueue.length : 0;
      const wait = estimateWaitMinutes(q.doctor, count, q.bufferDelay || 0);

      let frontendDept = dept;
      if (dept === 'General Medicine' || dept === 'Cardiology') {
        frontendDept = 'General Practice';
      }

      deptTimes[frontendDept] = wait > 0 ? wait : frontendDept === 'Pediatrics' ? 10 : 15;
    });

    const activeHospId = hospitalId || 'general-hospital';
    const hospital = (await Hospital.findOne({ id: activeHospId })) || (await Hospital.findOne({}));
    const rawWhatsapp = hospital
      ? hospital.id === 'general-hospital'
        ? getPrimaryWhatsAppNumber()
        : hospital.whatsappNumber
      : getPrimaryWhatsAppNumber();
    const cleanWhatsapp = rawWhatsapp.replace(/^whatsapp:/i, '');

    res.json({
      ...deptTimes,
      whatsappNumber: cleanWhatsapp
    });
  } catch (error: any) {
    logger.error('Error fetching public status', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET sanitized live queue data for the unauthenticated waiting-room TV display
// (optionally scoped to one hospital via ?hospitalId=). No passwordHash or
// other sensitive fields are ever populated here.
router.get('/public-tv-queues', async (req, res) => {
  try {
    const { hospitalId } = req.query;

    const filter: any = {};
    if (hospitalId) {
      const doctors = await Doctor.find({ hospital: hospitalId });
      filter.doctor = { $in: doctors.map((d) => d._id) };
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

    // The waiting room is where a delay costs the most: everyone here came for
    // the printed time and is now sitting because leaving risks missing the
    // call. The screen has to say so, not just the WhatsApp they may not read.
    const { delayNotice, todayOpdHours } = require('../utils/shiftHelper');
    res.json(
      queues.map((queue) => {
        const plain = typeof queue.toObject === 'function' ? queue.toObject() : { ...queue };
        return {
          ...plain,
          delay: queue.doctor ? delayNotice(queue.doctor) : null,
          opdHoursToday: queue.doctor ? todayOpdHours(queue.doctor) : ''
        };
      })
    );
  } catch (error: any) {
    logger.error('Error fetching public TV queues', { err: error });
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
        position = queue.activeQueue.findIndex((id) => id.toString() === token._id.toString()) + 1;
      }
    }

    // The patient's own live journey — where they are, what is outstanding, and
    // what they should do next, in English + Hindi.
    const { stageMessage } = require('../utils/journeyHelper');
    const stage = token.journeyStage || 'Waiting';
    const labTests = token.labTests || [];

    // Is the cabin behind, and by how much?
    //
    // The doctor could already announce a delay and every waiting patient was
    // WhatsApped — but the tracker they were told to watch said nothing, so a
    // patient who checked the page instead of their messages saw the original
    // time and came in on it. The two have to tell the same story.
    const { delayNotice, todayOpdHours } = require('../utils/shiftHelper');
    const notice = token.doctor ? delayNotice(token.doctor) : null;

    // When to LEAVE HOME, which is the only number a patient who is not here
    // yet can act on. Sent alongside the wait rather than instead of it: one
    // answers "how long", the other answers "what do I do now".
    const tokenTravel = travelMinutesOf(token);
    const departure = {
      travelMinutes: tokenTravel,
      leaveBy: leaveByLabel(token.estimatedWaitTime || 0, tokenTravel),
      alerted: Boolean(token.departureAlerted),
      inTransit: isInTransit(token)
    };

    res.json({
      token,
      position,
      departure,
      delay:
        notice && notice.delayed
          ? {
              ...notice,
              // The queue's own running buffer, which moves independently of the
              // announced start time (a sitting that began on time can still run
              // late once it is under way).
              bufferDelay: (queue && queue.bufferDelay) || 0,
              opdHoursToday: todayOpdHours(token.doctor)
            }
          : {
              delayed: (queue && queue.bufferDelay) > 0,
              minutesLate: (queue && queue.bufferDelay) || 0,
              reason: (queue && queue.delayReason) || '',
              revisedStart: '',
              originalStart: '',
              bufferDelay: (queue && queue.bufferDelay) || 0,
              message:
                queue && queue.bufferDelay > 0
                  ? `The cabin is running about ${queue.bufferDelay} min behind${queue.delayReason ? ` — ${queue.delayReason}` : ''}.`
                  : ''
            },
      journey: {
        stage,
        message: stageMessage(stage),
        history: token.stageHistory || [],
        labPending: labTests.filter((t) => t.status !== 'Completed').length,
        labReady: labTests.filter((t) => t.status === 'Completed').length,
        hasAbnormal: labTests.some((t) => t.abnormal),
        medicinesReady: Boolean(token.prescription && (token.prescription.medicines || []).length > 0),
        medicinesCollected: Boolean(token.prescription && token.prescription.dispensed)
      }
    });
  } catch (err: any) {
    logger.error('Error fetching token details', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * The public facility list.
 *
 * This used to return every facility's WHOLE document — landing copy, FAQs,
 * testimonials, gallery URLs, the module map, the lot. At 200 facilities that
 * is 554 KB, and it was downloaded by eight different screens: the directory,
 * the sign-in page and every portal's facility dropdown. A login form was
 * pulling a quarter of a megabyte of other hospitals' patient testimonials in
 * order to fill a `<select>`.
 *
 * Two shapes, because two screens need different things:
 *   ?view=picker  → {id, name, city, type} only. 16 KB at 200 facilities.
 *   (default)     → what a directory card renders. 93 KB at 200.
 *
 * Anything needing a facility's full record fetches that one facility: the
 * landing page has `/hospital/:id/landing`, and the admin panel has its own
 * secret-protected endpoint.
 */
const DIRECTORY_FIELDS = [
  'id',
  'name',
  'slug',
  'type',
  'city',
  'address',
  'phone',
  'description',
  'coverImage',
  'logoUrl',
  'coordinates',
  'doctorCount',
  'parentHospital',
  'hasInternalLab',
  'hasInternalPharmacy',
  'clinicSubtype',
  'primaryColor',
  'secondaryColor'
];

router.get('/hospitals', async (req, res) => {
  try {
    const picker = req.query.view === 'picker';
    const dbHospitals = await Hospital.find({});

    const formatted = dbHospitals.map((h) => {
      const obj = typeof h.toObject === 'function' ? h.toObject() : h;
      // State and district are derived from the city when not stored, so the
      // State → District discovery filter works for every facility.
      const loc = resolveLocation(obj);

      if (picker) {
        return { id: obj.id, name: obj.name, city: loc.district || obj.city, type: obj.type };
      }

      const card = {};
      for (const f of DIRECTORY_FIELDS) if (obj[f] !== undefined) card[f] = obj[f];
      const rawWhatsapp = h.id === 'general-hospital' ? getPrimaryWhatsAppNumber() : h.whatsappNumber;
      return {
        ...card,
        state: loc.state,
        district: loc.district,
        whatsappNumber: (rawWhatsapp || '').replace(/^whatsapp:/i, '')
      };
    });

    res.json(formatted);
  } catch (err: any) {
    logger.error('Error fetching hospitals', { err: err });
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
    const rawWhatsapp =
      hospital.id === 'general-hospital' ? getPrimaryWhatsAppNumber() : hospital.whatsappNumber;
    const hObj = hospital.toObject();
    const loc = resolveLocation(hObj);
    res.json({
      ...hObj,
      state: loc.state,
      district: loc.district,
      whatsappNumber: rawWhatsapp.replace(/^whatsapp:/i, '')
    });
  } catch (err: any) {
    logger.error('Error fetching hospital details', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET the facility's public landing page — the whole page as data.
//
// Every partner we onboard gets a real website without anyone building one:
// this composes the facility record, its enabled modules and its doctor roster
// into a finished page model (hero copy, services, departments, timings, FAQs),
// filling every blank from the template. A facility that registered in 90
// seconds and typed nothing optional still gets a complete page.
//
// Public and unauthenticated by design — it is a marketing page — so it must
// only ever expose what a visitor could read off a signboard. The doctor
// projection below is an allow-list for exactly that reason.
router.get('/hospital/:hospitalId/landing', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const hospital = await Hospital.findOne({ id: hospitalId });
    if (!hospital) {
      return res.status(404).json({ message: 'Facility not found' });
    }

    const doctors = await Doctor.find({ hospital: hospitalId }, '-passwordHash');

    // How many people are waiting for each doctor right now. A patient choosing
    // between four consultants gets more from "2 waiting" than from any amount
    // of profile copy. Best-effort: if the queues cannot be read the page still
    // renders, just without the live numbers — a marketing page must never fail
    // because a queue lookup did.
    let withQueues = doctors;
    try {
      // One tokens read for the whole page rather than two per doctor: this is a
      // public marketing page and it is polled by anyone who opens it, so the
      // live numbers have to be cheap or they are not worth having.
      const [queues, todaysTokens] = await Promise.all([
        Queue.find({ doctor: { $in: doctors.map((d) => d._id) } }),
        Token.find({ hospital: hospitalId })
      ]);
      const queueBy = new Map<string, any>(queues.map((q) => [String(q.doctor), q]));
      const tokenById = new Map<string, any>((todaysTokens || []).map((t) => [String(t._id), t]));

      withQueues = doctors.map((d) => {
        const obj = typeof d.toObject === 'function' ? d.toObject() : { ...d };
        const q = queueBy.get(String(d._id));
        obj.waiting = q ? (Array.isArray(q.activeQueue) ? q.activeQueue.length : 0) : null;
        // The wait is computed HERE, not on the page. The landing page used to
        // multiply `waiting × averageCheckupTime` itself, which is the one
        // estimate in the product that never learned about sittings: four people
        // queued for a doctor whose OPD starts at five read as "~40 min" at 2pm.
        // Only the server knows the schedule, so only the server should answer.
        const pace = paceFromTokens(todaysTokens || [], d._id, d.averageCheckupTime || 10);
        const inCabin = q && q.currentToken ? tokenById.get(String(q.currentToken)) : null;
        obj.estimatedWait = estimateWaitMinutes(d, obj.waiting || 0, (q && q.bufferDelay) || 0, {
          paceMinutes: pace,
          inCabinRemaining: cabinRemainingFrom(inCabin, pace)
        });
        return obj;
      });
    } catch (queueErr) {
      logger.error('Could not attach live queue depth to landing page', { err: queueErr });
    }

    const page = buildLandingPage(hospital, withQueues);

    // Same WhatsApp normalization the other public endpoints do, so the "Book on
    // WhatsApp" button on the landing page dials the same number the portal does.
    const rawWhatsapp =
      hospital.id === 'general-hospital' ? getPrimaryWhatsAppNumber() : hospital.whatsappNumber;
    const whatsappNumber = (rawWhatsapp || '').replace(/^whatsapp:/i, '');
    const loc = resolveLocation(hospital.toObject());

    page.facility.whatsappNumber = whatsappNumber;
    page.facility.state = loc.state;
    page.facility.district = loc.district;
    page.contact.whatsappNumber = whatsappNumber;

    res.json(page);
  } catch (err: any) {
    logger.error('Error building facility landing page', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all active doctors of a specific hospital
router.get('/hospital/:hospitalId/doctors', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const doctors = await Doctor.find({ hospital: hospitalId }, '-passwordHash');
    res.json(doctors);
  } catch (err: any) {
    logger.error('Error fetching hospital doctors', { err: err });
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

    const index = queue.activeQueue.findIndex((id) => id.toString() === tokenId);
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
  } catch (error: any) {
    logger.error('Token delay error', { err: error });
    res.status(500).json({ message: 'Server error delaying token' });
  }
});

// GET WhatsApp API Engine Configuration & Status
router.get('/whatsapp/config', (req, res) => {
  try {
    const config = getWhatsAppConfig();
    res.json(config);
  } catch (err: any) {
    logger.error('Error fetching WhatsApp config', { err: err });
    res.status(500).json({ message: 'Failed to fetch WhatsApp API configuration' });
  }
});

// POST Update WhatsApp API Sender Number & Auto-Start Engine
router.post('/whatsapp/config', async (req, res) => {
  try {
    const { whatsappNumber, isAutoWorking } = req.body;
    if (!whatsappNumber || typeof whatsappNumber !== 'string') {
      return res.status(400).json({ message: 'WhatsApp API number is required (e.g. +917484043690)' });
    }

    const updatedConfig = setWhatsAppConfig({ whatsappNumber, isAutoWorking });

    // Also sync default hospital whatsappNumber in DB if exists
    try {
      const hospital = await Hospital.findOne({ id: 'general-hospital' });
      if (hospital) {
        hospital.whatsappNumber = updatedConfig.whatsappNumber;
        await hospital.save();
      }
    } catch (hErr: any) {
      logger.warn('Could not update hospital DB record for WhatsApp number', { err: hErr.message });
    }

    res.json({
      message: 'WhatsApp API Number updated successfully. Automatic Engine is now ACTIVE!',
      config: updatedConfig
    });
  } catch (err: any) {
    logger.error('Error updating WhatsApp config', { err: err });
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
        bodyText = `CareeAi Reminder: You have a follow-up appointment scheduled with Dr. Sarah Jenkins tomorrow at 10:00 AM.`;
      } else {
        bodyText = `Test notification from CareeAi WhatsApp API Engine (${getWhatsAppConfig().whatsappNumber}). System is working automatically!`;
      }
    }

    const result = await sendWhatsAppNotification(recipientPhone, bodyText, req.io);
    res.json({
      message: 'WhatsApp notification dispatched successfully',
      result
    });
  } catch (err: any) {
    logger.error('Error sending test WhatsApp message', { err: err });
    res.status(500).json({ message: 'Failed to send WhatsApp message', error: err.message });
  }
});

// GET Hospital WhatsApp QR Code & Direct Deep Link Generator
router.get('/whatsapp/qr/:hospitalId', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    let hospital =
      (await Hospital.findOne({
        $or: [{ id: hospitalId }, { slug: hospitalId }]
      })) || (await Hospital.findOne({}));

    if (!hospital) {
      hospital = {
        id: hospitalId || 'general-hospital',
        name: 'CareeAi Healthcare Hospital',
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
  } catch (err: any) {
    logger.error('Error generating hospital QR', { err: err });
    res.status(500).json({ message: 'Failed to generate hospital WhatsApp QR Code' });
  }
});

// GET live Meta WhatsApp credential health. Makes one read-only call to Meta and
// says plainly whether the token is VALID, EXPIRED (code 190), or BLOCKED by Meta
// (code 200) — so you can verify a newly-pasted token in one click instead of
// booking a test token and hunting through logs.
router.get('/whatsapp/health', async (req, res) => {
  try {
    const health = await checkMetaToken();
    res.status(health.ok ? 200 : 503).json(health);
  } catch (err: any) {
    logger.error('WhatsApp health check error', { err: err });
    res.status(500).json({ ok: false, message: 'Health check failed', error: err.message });
  }
});

// GET WhatsApp Message History Audit Log
router.get('/whatsapp/history', (req, res) => {
  try {
    const history = getWhatsAppHistory(30);
    res.json(history);
  } catch (err: any) {
    logger.error('Error fetching WhatsApp history', { err: err });
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

    console.warn(
      '[META WEBHOOK VERIFICATION FAILED] hub.mode or hub.verify_token did not match META_VERIFY_TOKEN.'
    );
    return res.status(403).send('Forbidden: verify token mismatch');
  } catch (err: any) {
    logger.error('Error in Meta GET webhook', { err: err });
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
          // The number that RECEIVED this message (74 or 555). Reply FROM this
          // exact number so request & response stay on ONE number.
          const receivingPhoneNumberId = value && value.metadata && value.metadata.phone_number_id;
          // The display number that received the message (e.g. "917484043690").
          // Used to figure out WHICH facility this WhatsApp conversation belongs
          // to when it's a brand-new chat (multi-number setups).
          const receivingDisplayNumber = value && value.metadata && value.metadata.display_phone_number;
          if (value && value.messages && value.messages.length > 0) {
            for (const msg of value.messages) {
              const fromPhone = msg.from; // e.g. "15551234567" or "919876543210"
              let textContent = '';

              if (msg.type === 'text' && msg.text) {
                textContent = msg.text.body;
              } else if (msg.type === 'interactive' && msg.interactive) {
                const reply = msg.interactive.button_reply || msg.interactive.list_reply;
                if (reply) {
                  // Our interactive ids encode the 1-based option number
                  // (buttons: "btn_2_Female", lists: "opt_2"). WhatsApp echoes
                  // the TITLE back truncated to 20/24 chars, so the full option
                  // strings the state engine compares against ("Book New
                  // Appointment / Generate Token") never match. Extract the
                  // number from the id instead — every step accepts "1", "2", …
                  const idMatch = (reply.id || '').match(/^(?:btn|opt)_(\d+)/);
                  textContent = idMatch ? idMatch[1] : reply.title || reply.id || '';
                }
              } else if (msg.type === 'button' && msg.button) {
                textContent = msg.button.text || msg.button.payload;
              }

              if (fromPhone && textContent) {
                const formattedPhone = fromPhone.startsWith('+') ? fromPhone : `+${fromPhone}`;
                const sessionId = `wa_${formattedPhone.replace(/\D/g, '')}`;

                // Everything below can throw, and a throw here is INVISIBLE to
                // the patient: the 200 went back to Meta at the top of the
                // handler, so all a failure does is skip the reply. They see
                // nothing, send the same thing again, hit the same failure —
                // the "WhatsApp loop" where a booking never completes and the
                // only trace is a stack in the server log. Contain it to this
                // one message and always answer with a way out.
                try {
                  // Decide which facility this WhatsApp chat belongs to.
                  // Priority: a hospital the session ALREADY locked onto (e.g. the
                  // patient scanned a facility QR "HI_<id>") must ALWAYS win — never
                  // clobber it on later turns (that was the old bug: every message
                  // forced 'general-hospital', so QR-scanned facilities were lost).
                  // Only for a BRAND-NEW chat do we seed the facility from the number
                  // that RECEIVED the message (metadata.display_phone_number).
                  let seedHospitalId; // undefined => let the session / default decide
                  const existingSession = await ChatSession.findOne({ sessionId });
                  if (existingSession && existingSession.tempData && existingSession.tempData.hospitalId) {
                    seedHospitalId = undefined; // preserve the session's facility
                  } else if (receivingDisplayNumber) {
                    const rxDigits = receivingDisplayNumber.replace(/\D/g, '');
                    const allHosp = await Hospital.find({});
                    const matched = allHosp.filter(
                      (h) => h.whatsappNumber && h.whatsappNumber.replace(/\D/g, '') === rxDigits
                    );
                    // Seed the facility ONLY when this number belongs to exactly one
                    // of them. Facilities normally share the single platform number,
                    // and picking the first match there would lock every patient into
                    // whichever hospital happened to be registered first — the list of
                    // hospitals ("hi") is what must decide instead.
                    seedHospitalId = matched.length === 1 ? matched[0].id : undefined;
                  }

                  console.log(
                    `[META INCOMING WHATSAPP] From: ${formattedPhone} | To(phone_number_id): ${receivingPhoneNumberId} | RxNumber: ${receivingDisplayNumber || '-'} | Facility: ${seedHospitalId || (existingSession && existingSession.tempData && existingSession.tempData.hospitalId) || 'default'} | Session: ${sessionId} | Text: "${textContent}"`
                  );

                  // Feed input into CareeAi patient appointment state engine
                  const botResponse = await processChatMessage({
                    sessionId,
                    message: textContent,
                    hospitalId: seedHospitalId,
                    socketIo: req.io || global.io
                  });

                  // Dispatch the state-machine response back via Meta Cloud API.
                  // ONE reply per patient message: a 3-line bot answer used to
                  // arrive as 3 separate WhatsApp notifications, which reads as
                  // spam and pushes the option buttons off screen. Merge the lines
                  // into a single bubble and attach the choices to it.
                  if (botResponse && botResponse.messages && botResponse.messages.length > 0) {
                    const opts =
                      botResponse.options && botResponse.options.length > 0 ? botResponse.options : [];
                    const lines = botResponse.messages.map((m) => m.text).filter(Boolean);
                    const combined = lines.join('\n\n');

                    // Meta caps an interactive message body at 1024 chars. If the
                    // reply is longer, send the detail as plain text first and keep
                    // the (short) last line as the interactive prompt.
                    const INTERACTIVE_BODY_LIMIT = 1000;
                    if (opts.length > 0 && combined.length > INTERACTIVE_BODY_LIMIT && lines.length > 1) {
                      const head = lines.slice(0, -1).join('\n\n');
                      const tail = lines[lines.length - 1];
                      await sendWhatsAppNotification(
                        formattedPhone,
                        head,
                        [],
                        req.io || global.io,
                        receivingPhoneNumberId
                      );
                      await sendWhatsAppNotification(
                        formattedPhone,
                        tail,
                        opts,
                        req.io || global.io,
                        receivingPhoneNumberId
                      );
                    } else {
                      await sendWhatsAppNotification(
                        formattedPhone,
                        combined,
                        opts,
                        req.io || global.io,
                        receivingPhoneNumberId
                      );
                    }
                  }
                } catch (msgErr: any) {
                  logger.error('Could not answer a WhatsApp message', {
                    err: msgErr,
                    from: formattedPhone,
                    text: textContent
                  });
                  // Never leave the patient talking to silence.
                  try {
                    await sendWhatsAppNotification(
                      formattedPhone,
                      '⚠️ Sorry — something went wrong at our end and that step did not go through.\n\nPlease reply *HI* to start again from the menu.',
                      [],
                      req.io || global.io,
                      receivingPhoneNumberId
                    );
                  } catch (replyErr: any) {
                    logger.error('Could not even send the WhatsApp failure notice', { err: replyErr });
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (err: any) {
    logger.error('Error processing Meta POST webhook', { err: err });
  }
});

export default router;
(router as any)._internals = {
  processChatMessage,
  detectMenuIntent,
  parseTokenNumber,
  normalizePhone,
  phoneVariants,
  isLikelyPhone
};

module.exports = router;
module.exports._internals = (router as any)._internals;
