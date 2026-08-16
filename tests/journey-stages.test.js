/**
 * The patient's stage, and the two ways it silently stopped tracking reality.
 *
 * `journeyStage` is the field the patient's own tracker renders — not `status`,
 * which is the queue's word for the same visit. Nothing enforced that the two
 * agreed, and both of the bugs pinned down here were invisible from the code:
 *
 *   - `setStage(token, 'Rescheduled')` returned false and did nothing, because
 *     'Rescheduled' is not a member of STAGES. A patient moved back into the
 *     queue went on being shown "You are with the doctor now."
 *   - Billing discharge set `status = 'Completed'` and never touched the stage,
 *     so someone who had paid and gone home still read "Your reports are ready —
 *     please go back to your doctor."
 *
 * Neither threw, neither logged, and both produced a screen that looked fine to
 * everyone except the person it was written for.
 */
const { section, check, report } = require('./helpers/assert');
const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');

const { STAGES, setStage, deriveStage, stageMessage } = require(`${BACKEND}/utils/journeyHelper`);

/** A token in whatever shape the routes hand to setStage. */
const mkToken = (over = {}) => ({
  tokenNumber: 'T-1',
  status: 'Waiting',
  journeyStage: 'Waiting',
  stageHistory: [],
  labTests: [],
  prescription: null,
  markModified() {},
  ...over
});

(async () => {
  section('An unknown stage is refused, and says so');

  const rescheduled = mkToken({ journeyStage: 'In Consultation', status: 'Waiting' });
  check("'Rescheduled' is not a journey stage", !STAGES.includes('Rescheduled'), STAGES);
  check('…so setting it is refused', setStage(rescheduled, 'Rescheduled', 'Reception') === false);
  check(
    '…and the token is left untouched rather than half-updated',
    rescheduled.journeyStage === 'In Consultation' && rescheduled.stageHistory.length === 0,
    rescheduled
  );

  // What the reschedule routes do now: derive the stage from the token's real
  // state, which for a patient put back in the queue is 'Waiting'.
  check(
    'The derived stage for a re-queued patient is Waiting',
    deriveStage(rescheduled) === 'Waiting',
    deriveStage(rescheduled)
  );
  check('…and setting THAT works', setStage(rescheduled, deriveStage(rescheduled), 'Reception') === true);
  check('…moving the patient back to the queue', rescheduled.journeyStage === 'Waiting', rescheduled);
  check(
    '…and recording who moved them',
    rescheduled.stageHistory.length === 1 && rescheduled.stageHistory[0].by === 'Reception',
    rescheduled.stageHistory
  );

  section('Setting the same stage twice is not a transition');

  const settled = mkToken({ journeyStage: 'Waiting' });
  check('Re-setting the current stage reports no change', setStage(settled, 'Waiting') === false);
  check('…and does not pad the history', settled.stageHistory.length === 0, settled.stageHistory);

  section('What the stage is derived from');

  check('A fresh token is Waiting', deriveStage(mkToken()) === 'Waiting');
  check(
    'A called patient is In Consultation',
    deriveStage(mkToken({ status: 'Active' })) === 'In Consultation'
  );
  check('An absent patient is Absent', deriveStage(mkToken({ status: 'Absent' })) === 'Absent');

  const pendingTest = mkToken({
    status: 'Completed',
    labTests: [{ testName: 'CBC', status: 'Pending' }]
  });
  check(
    'An outstanding test outranks a completed status',
    deriveStage(pendingTest) === 'Lab Pending',
    deriveStage(pendingTest)
  );

  const pendingRx = mkToken({
    status: 'Completed',
    prescription: { medicines: [{ name: 'Paracetamol' }], dispensed: false }
  });
  check(
    'Uncollected medicine outranks a completed status',
    deriveStage(pendingRx) === 'Pharmacy Pending',
    deriveStage(pendingRx)
  );

  section('Discharge ends the visit on the tracker, not just in the queue');

  // The exact shape billing discharge produces: every test reported, the
  // consultation finished, and the invoice settled.
  const discharged = mkToken({
    journeyStage: 'Lab Complete',
    status: 'Completed',
    labTests: [{ testName: 'CBC', status: 'Completed', resultValue: '13.4' }]
  });

  check('Before the fix this token read as Lab Complete', discharged.journeyStage === 'Lab Complete');
  check('The derived stage is Completed', deriveStage(discharged) === 'Completed', deriveStage(discharged));
  check('…and discharge moves it there', setStage(discharged, deriveStage(discharged), 'Reception') === true);
  check(
    '…so the patient no longer reads "go back to your doctor"',
    discharged.journeyStage === 'Completed',
    discharged.journeyStage
  );
  check(
    '…and is told the visit is over',
    /visit is complete/i.test(stageMessage('Completed')),
    stageMessage('Completed')
  );

  section('Every stage a patient can reach has something to read');

  for (const stage of STAGES) {
    const message = stageMessage(stage);
    check(
      `${stage} has a patient-facing message`,
      typeof message === 'string' && message.length > 0,
      message
    );
  }

  report();
})();
