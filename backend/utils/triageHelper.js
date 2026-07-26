// Smart Triage Engine — the "less staff / less doctor / less receptionist load"
// brain of CareeAi. A patient describes symptoms in plain English or Hindi and
// this module:
//   1. classifies them into a medical department (symptomToDepartment)
//   2. flags red-flag / emergency symptoms so they can be auto-escalated
//   3. picks the least-busy doctor in that department (load balancing)
//
// Designed for a high-volume Indian government hospital: patients have no medical
// knowledge and shouldn't have to guess which doctor to see, and no human
// receptionist should have to sort every walk-in into a department by hand.

const Queue = require('../models/Queue');
const { isDoctorFull } = require('./queueHelper');

// Pregnancy cues (English + Hindi) used to auto-flag a Pregnant priority token.
const PREGNANCY_KEYWORDS = [
  'pregnant', 'pregnancy', 'expecting', 'delivery', 'labour', 'labor pain',
  'गर्भवती', 'गर्भावस्था', 'प्रसव', 'गर्भ'
];

// Canonical department => trigger keywords (English + common Hindi / Hinglish).
// Order matters: the FIRST department with the most keyword hits wins, and the
// list is roughly ordered specific-specialty-first so a specific complaint
// ("chest pain") beats a generic one ("pain"). Keep keywords lowercase.
const DEPARTMENT_KEYWORDS = {
  Cardiology: [
    'chest pain', 'chest tightness', 'heart', 'palpitation', 'palpitations',
    'high bp', 'blood pressure', 'bp high', 'cardiac',
    'सीने में दर्द', 'दिल', 'धड़कन', 'बीपी', 'रक्तचाप', 'हृदय'
  ],
  Pediatrics: [
    'child', 'baby', 'infant', 'newborn', 'kid', 'toddler', 'my son', 'my daughter',
    'बच्चा', 'बच्ची', 'शिशु', 'बच्चे', 'नवजात'
  ],
  Orthopedics: [
    'bone', 'fracture', 'joint', 'knee pain', 'back pain', 'spine', 'sprain',
    'broken', 'shoulder pain', 'arthritis',
    'हड्डी', 'फ्रैक्चर', 'जोड़', 'घुटना', 'कमर दर्द', 'रीढ़', 'मोच', 'गठिया'
  ],
  Dermatology: [
    'skin', 'rash', 'itching', 'acne', 'pimple', 'allergy skin', 'eczema',
    ' त्वचा', 'खुजली', 'दाने', 'चर्म', 'फुंसी', 'एलर्जी'
  ],
  ENT: [
    'ear', 'nose', 'throat', 'ear pain', 'sore throat', 'sinus', 'tonsil',
    'hearing', 'nose bleed',
    'कान', 'नाक', 'गला', 'गले में दर्द', 'साइनस'
  ],
  Ophthalmology: [
    'eye', 'vision', 'blurred vision', 'red eye', 'eye pain', 'cataract',
    'आंख', 'आँख', 'दृष्टि', 'नज़र', 'आँखों'
  ],
  Gynecology: [
    'pregnant', 'pregnancy', 'periods', 'menstrual', 'gynae', 'gynec',
    'delivery', 'menstruation',
    'गर्भवती', 'गर्भावस्था', 'माहवारी', 'पीरियड', 'प्रसव', 'स्त्री रोग'
  ],
  Neurology: [
    'seizure', 'paralysis', 'numbness', 'migraine', 'severe headache', 'stroke',
    'fits', 'tremor', 'memory loss',
    'दौरा', 'लकवा', 'सुन्न', 'माइग्रेन', 'मिर्गी', 'कंपन'
  ],
  Gastroenterology: [
    'stomach pain', 'abdominal pain', 'vomiting', 'diarrhea', 'diarrhoea',
    'loose motion', 'acidity', 'constipation', 'stomach', 'ulcer', 'jaundice',
    'पेट दर्द', 'उल्टी', 'दस्त', 'अपच', 'कब्ज', 'पेट', 'पीलिया', 'एसिडिटी'
  ],
  Dental: [
    'tooth', 'teeth', 'toothache', 'gum', 'dental', 'cavity',
    'दांत', 'दाँत', 'मसूड़े', 'दांत दर्द'
  ],
  Psychiatry: [
    'depression', 'anxiety', 'stress', 'mental', 'sleep problem', 'insomnia',
    'panic', 'sad',
    'अवसाद', 'चिंता', 'तनाव', 'मानसिक', 'नींद', 'घबराहट'
  ],
  'General Medicine': [
    'fever', 'cold', 'cough', 'weakness', 'body pain', 'headache', 'flu',
    'tired', 'fatigue', 'general', 'checkup', 'infection', 'sugar', 'diabetes',
    'बुखार', 'सर्दी', 'खांसी', 'कमजोरी', 'बदन दर्द', 'सिरदर्द', 'शुगर', 'मधुमेह', 'जांच'
  ]
};

// Red-flag symptoms that should jump the patient straight to Emergency priority
// regardless of which department they map to. Erring toward caution is correct in
// a triage setting — a false positive costs one queue slot; a false negative can
// cost a life.
const EMERGENCY_KEYWORDS = [
  'chest pain', 'heart attack', 'unconscious', 'not breathing', "can't breathe",
  'cant breathe', 'difficulty breathing', 'breathless', 'severe bleeding',
  'heavy bleeding', 'stroke', 'paralysis', 'seizure', 'convulsion', 'accident',
  'poisoning', 'suicide', 'severe injury', 'high fever child', 'blue lips',
  'सीने में दर्द', 'दिल का दौरा', 'बेहोश', 'सांस नहीं', 'सांस लेने में तकलीफ',
  'तेज़ खून', 'लकवा', 'दौरा', 'दुर्घटना', 'ज़हर', 'गंभीर चोट'
];

/**
 * Classify a free-text symptom string into a department + urgency.
 * @param {string} rawText patient's symptom description (any language)
 * @returns {{ department: string, urgency: 'Emergency'|'Normal', matched: string[], confident: boolean }}
 */
function classifySymptoms(rawText) {
  const text = (rawText || '').toLowerCase().trim();
  if (!text) {
    return { department: 'General Medicine', urgency: 'Normal', matched: [], confident: false };
  }

  // Urgency scan first — red flags override everything.
  const urgency = EMERGENCY_KEYWORDS.some(k => text.includes(k)) ? 'Emergency' : 'Normal';

  // Score each department by number of keyword hits.
  let bestDept = null;
  let bestScore = 0;
  let bestMatched = [];
  for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
    const hits = keywords.filter(k => text.includes(k));
    if (hits.length > bestScore) {
      bestScore = hits.length;
      bestDept = dept;
      bestMatched = hits;
    }
  }

  return {
    department: bestDept || 'General Medicine',
    urgency,
    matched: bestMatched,
    // "confident" only when we actually matched a keyword; otherwise we defaulted
    // to General Medicine and the caller may want to offer manual choice.
    confident: bestScore > 0
  };
}

/**
 * Loosely match a canonical department name against a facility's real, possibly
 * free-form department strings (e.g. canonical "Cardiology" ~ "Cardiology Dept",
 * "General Medicine" ~ "General Practice"/"General Physician").
 */
function departmentMatches(canonical, actual) {
  if (!actual) return false;
  const a = canonical.toLowerCase();
  const b = actual.toLowerCase();
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;
  // Common synonyms for the catch-all department.
  if (canonical === 'General Medicine') {
    return ['general', 'physician', 'medicine', 'medical', 'gp', 'family'].some(t => b.includes(t));
  }
  if (canonical === 'Gynecology') return b.includes('gyn') || b.includes('obs');
  if (canonical === 'Pediatrics') return b.includes('paed') || b.includes('ped') || b.includes('child');
  if (canonical === 'Orthopedics') return b.includes('ortho');
  if (canonical === 'ENT') return b.includes('ear') || b.includes('nose') || b.includes('throat');
  return false;
}

/**
 * Auto-detect a vulnerable-group priority category from what we already know about
 * the patient — no extra questions. Senior citizens (age >= 60) and pregnant
 * patients get queue priority. Returns 'Senior' | 'Pregnant' | 'None'.
 */
function detectPriorityCategory({ age, symptoms } = {}) {
  const text = (symptoms || '').toLowerCase();
  if (PREGNANCY_KEYWORDS.some(k => text.includes(k))) return 'Pregnant';
  const a = parseInt(age);
  if (!isNaN(a) && a >= 60) return 'Senior';
  return 'None';
}

/**
 * Given the facility's available doctors and a triage result, pick the single
 * best doctor to route to: prefer the target department, skip doctors whose daily
 * OPD limit is already full, and within the remainder choose the LEAST-BUSY doctor
 * (shortest estimated queue) so load spreads evenly instead of every patient
 * piling onto the first doctor in the list.
 *
 * @param {Array} doctors doctors already scoped to THIS facility (tenant-safe)
 * @param {string} department canonical department from classifySymptoms
 * @returns {Promise<{ doctor: object|null, matchedDepartment: boolean, allFull: boolean }>}
 */
async function pickLeastBusyDoctor(doctors, department) {
  if (!doctors || doctors.length === 0) {
    return { doctor: null, matchedDepartment: false, allFull: false };
  }

  // Candidates in the target department; if none, fall back to ALL doctors so the
  // patient still gets booked (a real facility may not staff every specialty).
  let candidates = doctors.filter(d => departmentMatches(department, d.department));
  const matchedDepartment = candidates.length > 0;
  if (!matchedDepartment) {
    // Prefer any general-medicine doctor as the fallback, else everyone.
    const general = doctors.filter(d => departmentMatches('General Medicine', d.department));
    candidates = general.length > 0 ? general : doctors;
  }

  // Capacity awareness: prefer doctors who still have OPD slots left today. If
  // EVERY candidate is full, keep them all (caller decides whether to refuse a
  // non-emergency booking) and report allFull so the patient can be told.
  let allFull = false;
  try {
    const fullFlags = await Promise.all(candidates.map(d => isDoctorFull(d)));
    const notFull = candidates.filter((_, i) => !fullFlags[i]);
    if (notFull.length > 0) {
      candidates = notFull;
    } else {
      allFull = true;
    }
  } catch (_) { /* capacity check is best-effort */ }

  // Compute current load (estimated wait) for each candidate from its queue.
  const ids = candidates.map(d => d._id);
  let queues = [];
  try {
    queues = await Queue.find({ doctor: { $in: ids } });
  } catch (_) {
    queues = [];
  }
  const loadByDoctor = new Map();
  queues.forEach(q => {
    const len = (q.activeQueue && q.activeQueue.length) || 0;
    loadByDoctor.set(String(q.doctor), { len, buffer: q.bufferDelay || 0 });
  });

  let best = candidates[0];
  let bestWait = Infinity;
  for (const d of candidates) {
    const load = loadByDoctor.get(String(d._id)) || { len: 0, buffer: 0 };
    const avg = d.averageCheckupTime || 10;
    const wait = load.len * avg + load.buffer;
    if (wait < bestWait) {
      bestWait = wait;
      best = d;
    }
  }

  return { doctor: best, matchedDepartment, allFull };
}

module.exports = {
  classifySymptoms,
  departmentMatches,
  pickLeastBusyDoctor,
  detectPriorityCategory,
  DEPARTMENT_KEYWORDS,
  EMERGENCY_KEYWORDS
};
