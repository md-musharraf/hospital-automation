/**
 * What the counter handed over, and everyone agreeing about it.
 *
 * The pharmacy recorded one boolean. Pressing "dispense" set it true whatever
 * the store could actually supply, so a patient given NOTHING — every item out
 * of stock — was recorded as dispensed, moved to "Medicines collected. Get well
 * soon!" on their own tracker, cleared off the counter's pending list, and shown
 * to the doctor as finished. The only trace was the WhatsApp, which asserted the
 * handover in its first line and contradicted it in the second:
 *
 *     your medicines for token T-13 have been handed over at our pharmacy
 *     counter.
 *     ⚠️ Currently unavailable: Paracetamol , Xyz, Rdfg.
 *
 * Both halves of that message came from the same button press. Everything
 * downstream read the boolean, which is why the whole platform agreed on
 * something untrue at once.
 *
 * What is pinned here: the record is what was handed over and what is still
 * owed; the patient stays at the pharmacy on every board until they have it;
 * they can come back for the rest; and the message says which of the three
 * things actually happened. Plus the stray space in "Paracetamol ," — that was
 * never a formatting bug, it was a trailing space stored in the data.
 */
const path = require('path');
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models } = installMockDb(BACKEND);

const { normalizeMedicines, pendingOf, dispenseStateOf, dispenseMessage, listNames, medicineKey } = require(
  path.join(BACKEND, 'utils', 'prescriptionHelper.js')
);
const { hasUndispensedRx, deriveStage } = require(path.join(BACKEND, 'utils', 'journeyHelper.js'));

const rx = (names, extra = {}) => ({
  medicines: names.map((n) => ({ name: n })),
  ...extra
});

(async () => {
  section('The data a prescription is stored as');

  // The exact input behind "Currently unavailable: Paracetamol , Xyz, Rdfg".
  const messy = normalizeMedicines([
    { name: 'Paracetamol ', dosage: ' 500mg ' },
    { name: 'Xyz' },
    { name: 'Rdfg' }
  ]);
  check('A trailing space never reaches storage', messy[0].name === 'Paracetamol', messy[0]);
  check('…nor the fields beside it', messy[0].dosage === '500mg', messy[0]);
  check(
    'The printed list has no stray space before the comma',
    listNames(messy.map((m) => m.name)) === 'Paracetamol, Xyz and Rdfg',
    listNames(messy.map((m) => m.name))
  );

  const dupes = normalizeMedicines([{ name: 'Paracetamol' }, { name: 'paracetamol ' }, { name: '  ' }]);
  check('The same medicine typed twice is stored once', dupes.length === 1, dupes);
  check(
    'A blank line is dropped rather than stored',
    dupes.every((m) => m.name),
    dupes
  );
  check('Names match regardless of case and spacing', medicineKey(' PARA cetamol ') === 'para cetamol');
  check('Anything that is not a list yields nothing', normalizeMedicines(null).length === 0);

  section('Nothing handed over is not "dispensed"');

  // Every item out of stock: the screenshot's T-13.
  const nothingGiven = rx(['Paracetamol', 'Xyz', 'Rdfg'], {
    dispensed: false,
    dispensedAt: new Date(),
    pendingMedicines: ['Paracetamol', 'Xyz', 'Rdfg']
  });
  check('The state is not "full"', dispenseStateOf(nothingGiven) !== 'full', dispenseStateOf(nothingGiven));
  check('Everything is still owed', pendingOf(nothingGiven).length === 3, pendingOf(nothingGiven));
  check(
    'The patient is still the pharmacy’s problem',
    hasUndispensedRx({ prescription: nothingGiven }) === true
  );
  check(
    '…so their journey does not say "medicines collected"',
    deriveStage({ prescription: nothingGiven, status: 'Completed' }) === 'Pharmacy Pending',
    deriveStage({ prescription: nothingGiven, status: 'Completed' })
  );

  section('Partly handed over is its own answer');

  const partly = rx(['Paracetamol', 'Amoxicillin', 'Cetirizine'], {
    dispensed: false,
    dispensedAt: new Date(),
    pendingMedicines: ['Cetirizine']
  });
  check('The state is partial', dispenseStateOf(partly) === 'partial', dispenseStateOf(partly));
  check('Only the missing item is owed', pendingOf(partly).join() === 'Cetirizine', pendingOf(partly));
  check(
    'A patient owed one of three items is not finished',
    deriveStage({ prescription: partly, status: 'Completed' }) === 'Pharmacy Pending'
  );

  section('A complete handover closes it');

  const full = rx(['Paracetamol'], { dispensed: true, pendingMedicines: [] });
  check('The state is full', dispenseStateOf(full) === 'full', dispenseStateOf(full));
  check('Nothing is owed', pendingOf(full).length === 0);
  check('The pharmacy is done with them', hasUndispensedRx({ prescription: full }) === false);
  check(
    '…and the journey can complete',
    deriveStage({ prescription: full, status: 'Completed' }) === 'Completed',
    deriveStage({ prescription: full, status: 'Completed' })
  );

  // Records written before this field existed carry no pending list. A dispensed
  // one meant "finished", which is what it was taken to mean at the time.
  const legacy = rx(['Paracetamol'], { dispensed: true });
  check('A record from before this change still reads as finished', pendingOf(legacy).length === 0, legacy);
  const legacyOpen = rx(['Paracetamol'], { dispensed: false });
  check('…and an undispensed one still reads as owed', pendingOf(legacyOpen).length === 1, legacyOpen);

  section('Never prescribed, never pending');

  check('A token with no prescription needs no pharmacy', dispenseStateOf({}) === 'none-required');
  check('…and is not held at the counter', hasUndispensedRx({ prescription: {} }) === false);
  check('…nor is one with an empty list', dispenseStateOf({ medicines: [] }) === 'none-required');

  section('The message says which of the three things happened');

  const fullMsg = dispenseMessage('Gopi', 'T-13', ['Paracetamol'], []);
  check('A complete handover reads as one', /have been handed over/.test(fullMsg), fullMsg);
  check('…and claims nothing is missing', !/unavailable|out of stock/i.test(fullMsg), fullMsg);
  check('…in both languages', /दवाइयाँ काउंटर से दे दी गई/.test(fullMsg), fullMsg);

  const noneMsg = dispenseMessage('Gopi', 'T-13', [], ['Paracetamol', 'Xyz', 'Rdfg']);
  check('Nothing handed over does NOT claim a handover', !/have been handed over/.test(noneMsg), noneMsg);
  check('…it says so plainly', /could NOT hand over/.test(noneMsg), noneMsg);
  check('…names what is missing', /Paracetamol, Xyz and Rdfg/.test(noneMsg), noneMsg);
  check('…and tells them the prescription stays open', /stays open/.test(noneMsg), noneMsg);
  check('…in both languages', /नहीं दी जा सकीं/.test(noneMsg), noneMsg);

  const partMsg = dispenseMessage('Gopi', 'T-13', ['Paracetamol', 'Xyz'], ['Rdfg']);
  check('A partial handover says which part', /part of your prescription/.test(partMsg), partMsg);
  check('…lists what was given', /Paracetamol and Xyz/.test(partMsg), partMsg);
  check('…and what is still to collect', /Still to collect: Rdfg/.test(partMsg), partMsg);
  check(
    'No message ever asserts a handover and denies it at once',
    !(/have been handed over/.test(partMsg) && /Still to collect/.test(partMsg)) ||
      /part of your prescription/.test(partMsg),
    partMsg
  );

  section('One item, plural grammar');

  const oneMsg = dispenseMessage('Gopi', 'T-13', [], ['Rdfg']);
  check('A single missing medicine reads as "is", not "are"', /Rdfg is out of stock/.test(oneMsg), oneMsg);
  const twoMsg = dispenseMessage('Gopi', 'T-13', [], ['Rdfg', 'Xyz']);
  check('Two of them read as "are"', /Rdfg and Xyz are out of stock/.test(twoMsg), twoMsg);

  section('A patient with no name still gets a sentence');

  const anon = dispenseMessage('', 'T-13', ['Paracetamol'], []);
  check('The greeting falls back rather than reading "Hello ,"', /Hello Patient,/.test(anon), anon);

  report();
})();
