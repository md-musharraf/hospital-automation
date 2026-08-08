// Patient-journey helpers.
//
// The stage lives on the Token so every role reads the SAME value: reception sees
// "Lab Pending" without asking the lab, the doctor sees "Lab Complete" without
// the patient having to walk back and re-register, and the pharmacy sees
// "Pharmacy Pending" the moment the prescription is written.
//
// Plain functions rather than Mongoose schema methods on purpose — the in-memory
// mock DB (utils/mongooseMock.js) has no `schema.methods` support.

const STAGES = [
  'Waiting', 'In Consultation', 'Lab Pending', 'Lab Complete',
  'Pharmacy Pending', 'Dispensed', 'Completed', 'Absent'
];

/**
 * Move a token to a new stage and record the transition. Does NOT save — the
 * caller saves once, together with whatever else it is changing.
 * Returns true if the stage actually changed.
 */
function setStage(token, stage, by) {
  if (!token || !STAGES.includes(stage)) return false;
  if (token.journeyStage === stage) return false;

  token.journeyStage = stage;
  if (!Array.isArray(token.stageHistory)) token.stageHistory = [];
  token.stageHistory.push({ stage, at: new Date(), by: by || 'system' });
  token.markModified && token.markModified('stageHistory');
  return true;
}

/** Are all requested lab tests finished? (No tests at all counts as done.) */
function allTestsComplete(token) {
  const tests = (token && token.labTests) || [];
  if (tests.length === 0) return true;
  return tests.every(t => t.status === 'Completed');
}

/** Any test still waiting on the lab? */
function hasPendingTests(token) {
  const tests = (token && token.labTests) || [];
  return tests.some(t => t.status !== 'Completed');
}

/** Does this token carry medicines the pharmacy still has to hand over? */
function hasUndispensedRx(token) {
  const rx = token && token.prescription;
  return Boolean(rx && Array.isArray(rx.medicines) && rx.medicines.length > 0 && !rx.dispensed);
}

/**
 * What stage should this token be in, given everything on it? Used after a
 * doctor completes a checkup and after the lab/pharmacy act, so the stage can
 * never drift out of sync with the underlying data.
 */
function deriveStage(token) {
  if (!token) return 'Waiting';
  if (token.status === 'Absent') return 'Absent';
  if (hasPendingTests(token)) return 'Lab Pending';
  if (hasUndispensedRx(token)) return 'Pharmacy Pending';
  if (token.status === 'Completed') return 'Completed';
  if (token.status === 'Active' || token.status === 'Called') return 'In Consultation';
  return 'Waiting';
}

/**
 * Human sentence for the patient's own tracker, in English + Hindi so it works
 * for the same audience the chatbot serves.
 */
function stageMessage(stage) {
  switch (stage) {
    case 'In Consultation': return 'You are with the doctor now. / आप अभी डॉक्टर के पास हैं।';
    case 'Lab Pending': return 'Please visit the lab for your tests. / कृपया जांच के लिए लैब जाएँ।';
    case 'Lab Complete': return 'Your reports are ready — please go back to your doctor. / आपकी रिपोर्ट तैयार है — कृपया डॉक्टर के पास वापस जाएँ।';
    case 'Pharmacy Pending': return 'Collect your medicines from the pharmacy counter. / फार्मेसी काउंटर से दवा ले लें।';
    case 'Dispensed': return 'Medicines collected. Get well soon! / दवा मिल गई। जल्दी स्वस्थ हों!';
    case 'Completed': return 'Your visit is complete. / आपकी विजिट पूरी हो गई।';
    case 'Absent': return 'You missed your turn. Please contact reception. / आपकी बारी छूट गई। कृपया रिसेप्शन से संपर्क करें।';
    default: return 'You are in the queue. We will alert you when your turn is near. / आप क़तार में हैं। बारी पास आते ही हम बताएंगे।';
  }
}

module.exports = { STAGES, setStage, allTestsComplete, hasPendingTests, hasUndispensedRx, deriveStage, stageMessage };
