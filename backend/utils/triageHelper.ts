// Smart Triage Engine — the "less staff / less doctor / less receptionist load"
// brain of CareeAi. A patient describes symptoms in plain English or Hindi and
// this module:
//   1. classifies them into a medical department (symptomToDepartment)
//   2. flags red-flag / emergency symptoms so they can be auto-escalated
//   3. picks the least-busy doctor in that department (load balancing)

import Queue from '../models/Queue';
import { isDoctorFull, estimateWaitMinutes, projectedWaitMinutes } from './queueHelper';

// Pregnancy cues (English + Hindi + Hinglish) used to auto-flag a Pregnant token.
export const PREGNANCY_KEYWORDS: string[] = [
  'pregnant',
  'pregnancy',
  'expecting',
  'delivery',
  'labour',
  'labor pain',
  'garbhvati',
  'garbhwati',
  'pregnency',
  'गर्भवती',
  'गर्भावस्था',
  'प्रसव',
  'गर्भ'
];

/**
 * Whole-word keyword match for Latin-script keywords, plain substring for
 * Devanagari (which has no \b word boundaries in JS regex).
 */
export function hasKeyword(text: string, keyword: string): boolean {
  const kw = keyword.trim();
  if (!kw) return false;
  if (!/^[\x20-\x7E]+$/.test(kw)) return text.includes(kw); // Devanagari etc.
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z])${escaped}(?![a-z])`, 'i').test(text);
}

export const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
  Cardiology: [
    'chest pain',
    'chest tightness',
    'heart',
    'palpitation',
    'palpitations',
    'high bp',
    'blood pressure',
    'bp high',
    'bp',
    'cardiac',
    'seene',
    'sine',
    'chhati',
    'chati',
    'dil',
    'dhadkan',
    'सीने में दर्द',
    'सीने',
    'दिल',
    'धड़कन',
    'बीपी',
    'रक्तचाप',
    'हृदय'
  ],
  Pediatrics: [
    'child',
    'baby',
    'infant',
    'newborn',
    'kid',
    'toddler',
    'my son',
    'my daughter',
    'bacha',
    'baccha',
    'bachcha',
    'bachche',
    'bacche',
    'beta',
    'beti',
    'बच्चा',
    'बच्ची',
    'शिशु',
    'बच्चे',
    'नवजात'
  ],
  Orthopedics: [
    'bone',
    'fracture',
    'joint',
    'knee pain',
    'back pain',
    'spine',
    'sprain',
    'broken',
    'shoulder pain',
    'arthritis',
    'knee',
    'waist',
    'haddi',
    'ghutna',
    'ghutne',
    'kamar',
    'jod',
    'moch',
    'kandha',
    'हड्डी',
    'फ्रैक्चर',
    'जोड़',
    'घुटना',
    'घुटने',
    'कमर दर्द',
    'कमर',
    'रीढ़',
    'मोच',
    'गठिया'
  ],
  Dermatology: [
    'skin',
    'rash',
    'itching',
    'acne',
    'pimple',
    'allergy skin',
    'eczema',
    'khujli',
    'daane',
    'dane',
    'chakatte',
    'phunsi',
    'twacha',
    'त्वचा',
    'खुजली',
    'दाने',
    'चर्म',
    'फुंसी',
    'एलर्जी'
  ],
  ENT: [
    'ear',
    'ears',
    'nose',
    'throat',
    'ear pain',
    'sore throat',
    'sinus',
    'tonsil',
    'hearing',
    'nose bleed',
    'kaan',
    'kan dard',
    'gala',
    'gale',
    'naak',
    'nak',
    'कान',
    'नाक',
    'गला',
    'गले',
    'गले में दर्द',
    'साइनस'
  ],
  Ophthalmology: [
    'eye',
    'eyes',
    'vision',
    'blurred vision',
    'red eye',
    'eye pain',
    'cataract',
    'aankh',
    'ankh',
    'aankhon',
    'aankhein',
    'nazar',
    'motiyabind',
    'आंख',
    'आँख',
    'दृष्टि',
    'नज़र',
    'आँखों'
  ],
  Gynecology: [
    'pregnant',
    'pregnancy',
    'periods',
    'menstrual',
    'gynae',
    'gynec',
    'delivery',
    'menstruation',
    'garbhvati',
    'garbhwati',
    'mahwari',
    'period',
    'गर्भवती',
    'गर्भावस्था',
    'माहवारी',
    'पीरियड',
    'प्रसव',
    'स्त्री रोग'
  ],
  Neurology: [
    'seizure',
    'paralysis',
    'numbness',
    'migraine',
    'severe headache',
    'stroke',
    'fits',
    'tremor',
    'memory loss',
    'lakwa',
    'daura',
    'mirgi',
    'jhatke',
    'sunn',
    'दौरा',
    'लकवा',
    'सुन्न',
    'माइग्रेन',
    'मिर्गी',
    'कंपन'
  ],
  Gastroenterology: [
    'stomach pain',
    'abdominal pain',
    'vomiting',
    'diarrhea',
    'diarrhoea',
    'loose motion',
    'acidity',
    'constipation',
    'stomach',
    'ulcer',
    'jaundice',
    'pet',
    'pet dard',
    'ulti',
    'dast',
    'kabz',
    'gas',
    'piliya',
    'jaundis',
    'पेट दर्द',
    'उल्टी',
    'दस्त',
    'अपच',
    'कब्ज',
    'पेट',
    'पीलिया',
    'एसिडिटी'
  ],
  Dental: [
    'tooth',
    'teeth',
    'toothache',
    'gum',
    'gums',
    'dental',
    'cavity',
    'dant',
    'daant',
    'danth',
    'masude',
    'दांत',
    'दाँत',
    'मसूड़े',
    'दांत दर्द'
  ],
  Psychiatry: [
    'depression',
    'anxiety',
    'stress',
    'mental',
    'sleep problem',
    'insomnia',
    'panic',
    'sad',
    'tanav',
    'chinta',
    'nind',
    'neend',
    'ghabrahat',
    'udasi',
    'अवसाद',
    'चिंता',
    'तनाव',
    'मानसिक',
    'नींद',
    'घबराहट'
  ],
  'General Medicine': [
    'fever',
    'cold',
    'cough',
    'weakness',
    'body pain',
    'headache',
    'flu',
    'tired',
    'fatigue',
    'general',
    'checkup',
    'infection',
    'sugar',
    'diabetes',
    'bukhar',
    'khansi',
    'khasi',
    'sardi',
    'jukam',
    'zukam',
    'kamjori',
    'sir dard',
    'sar dard',
    'sirdard',
    'badan dard',
    'thakan',
    'shugar',
    'dard',
    'takleef',
    'bimar',
    'tabiyat',
    'बुखार',
    'सर्दी',
    'खांसी',
    'कमजोरी',
    'बदन दर्द',
    'सिरदर्द',
    'शुगर',
    'मधुमेह',
    'जांच',
    'दर्द',
    'तकलीफ'
  ]
};

export const EMERGENCY_KEYWORDS: string[] = [
  'chest pain',
  'heart attack',
  'unconscious',
  'not breathing',
  "can't breathe",
  'cant breathe',
  'difficulty breathing',
  'breathless',
  'severe bleeding',
  'heavy bleeding',
  'stroke',
  'paralysis',
  'seizure',
  'convulsion',
  'accident',
  'poisoning',
  'suicide',
  'severe injury',
  'high fever child',
  'blue lips',
  // Hinglish
  'seene me dard',
  'seene mein dard',
  'sine me dard',
  'chhati me dard',
  'saans nahi',
  'saans lene me takleef',
  'sans lene me dikkat',
  'behosh',
  'bahut khoon',
  'khoon bah',
  'lakwa',
  'zeher',
  'jahar',
  'durghatna',
  'सीने में दर्द',
  'दिल का दौरा',
  'बेहोश',
  'सांस नहीं',
  'सांस लेने में तकलीफ',
  'साँस लेने में तकलीफ',
  'साँस नहीं',
  'तेज़ खून',
  'लकवा',
  'दौरा',
  'दुर्घटना',
  'ज़हर',
  'गंभीर चोट'
];

export interface SymptomClassification {
  department: string;
  urgency: 'Emergency' | 'Normal';
  matched: string[];
  confident: boolean;
}

/**
 * Classify a free-text symptom string into a department + urgency.
 */
export function classifySymptoms(rawText?: string | null): SymptomClassification {
  const text = (rawText || '').toLowerCase().trim();
  if (!text) {
    return { department: 'General Medicine', urgency: 'Normal', matched: [], confident: false };
  }

  // Urgency scan first — red flags override everything.
  const urgency = EMERGENCY_KEYWORDS.some((k) => hasKeyword(text, k)) ? 'Emergency' : 'Normal';

  // Score each department by number of keyword hits.
  let bestDept: string | null = null;
  let bestScore = 0;
  let bestMatched: string[] = [];
  for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
    const hits = keywords.filter((k) => hasKeyword(text, k));
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
    confident: bestScore > 0
  };
}

/**
 * Loosely match a canonical department name against a facility's real, possibly
 * free-form department strings.
 */
export function departmentMatches(canonical: string, actual?: string | null): boolean {
  if (!actual) return false;
  const a = canonical.toLowerCase();
  const b = actual.toLowerCase();
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;
  // Common synonyms for the catch-all department.
  if (canonical === 'General Medicine') {
    return ['general', 'physician', 'medicine', 'medical', 'gp', 'family'].some((t) => b.includes(t));
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
export function detectPriorityCategory({
  age,
  symptoms
}: { age?: number | string | null; symptoms?: string | null } = {}): string {
  const text = (symptoms || '').toLowerCase();
  if (PREGNANCY_KEYWORDS.some((k) => hasKeyword(text, k))) return 'Pregnant';
  const a = parseInt(String(age || ''), 10);
  if (!isNaN(a) && a >= 60) return 'Senior';
  return 'None';
}

export interface PickDoctorResult {
  doctor: any | null;
  matchedDepartment: boolean;
  allFull: boolean;
}

/**
 * Given the facility's available doctors and a triage result, pick the single
 * best doctor to route to: prefer the target department, skip doctors whose daily
 * OPD limit is already full, and within the remainder choose the LEAST-BUSY doctor.
 */
export async function pickLeastBusyDoctor(
  doctors: any[] = [],
  department: string
): Promise<PickDoctorResult> {
  if (!doctors || doctors.length === 0) {
    return { doctor: null, matchedDepartment: false, allFull: false };
  }

  let candidates = doctors.filter((d) => departmentMatches(department, d.department));
  const matchedDepartment = candidates.length > 0;
  if (!matchedDepartment) {
    const general = doctors.filter((d) => departmentMatches('General Medicine', d.department));
    candidates = general.length > 0 ? general : doctors;
  }

  let allFull = false;
  try {
    const fullFlags = await Promise.all(candidates.map((d) => isDoctorFull(d)));
    const notFull = candidates.filter((_, i) => !fullFlags[i]);
    if (notFull.length > 0) {
      candidates = notFull;
    } else {
      allFull = true;
    }
  } catch (_) {
    /* capacity check is best-effort */
  }

  const ids = candidates.map((d) => d._id);
  let queues: any[] = [];
  try {
    queues = await (Queue as any).find({ doctor: { $in: ids } });
  } catch (_) {
    queues = [];
  }
  const loadByDoctor = new Map<string, any>();
  queues.forEach((q) => {
    loadByDoctor.set(String(q.doctor), q);
  });

  // "Least busy" has to mean "will see this patient soonest", not "has the
  // shortest list". A doctor whose evening sitting starts in three hours has an
  // empty queue all afternoon, so by queue length alone they won every walk-in
  // at 2pm — routing patients to the one cabin guaranteed not to open. The same
  // reasoning covers the cabin that is empty of QUEUE but not of patient: a
  // consultation with eight minutes left is eight minutes this walk-in waits.
  const waits = await Promise.all(
    candidates.map(async (d) => {
      const queue = loadByDoctor.get(String(d._id));
      try {
        return await projectedWaitMinutes(d, queue);
      } catch (_) {
        return estimateWaitMinutes(d, (queue && queue.activeQueue && queue.activeQueue.length) || 0, 0);
      }
    })
  );

  let best = candidates[0];
  let bestWait = Infinity;
  candidates.forEach((d, i) => {
    const wait = waits[i] ?? Infinity;
    if (wait < bestWait) {
      bestWait = wait;
      best = d;
    }
  });

  return { doctor: best, matchedDepartment, allFull };
}
