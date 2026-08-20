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

  section('Stock tracking is optional — an untracked medicine is not a shortage');

  // A medical store carries thousands of items. Typing every one of them into
  // this system is work nobody has time for, and treating an absent row as a
  // shortage punished exactly the facilities that had not done it: the medicine
  // was on the shelf, the counter handed it over, and the patient still got a
  // WhatsApp saying it was unavailable.
  const { consumeStock, levelOf, checkAvailability } = require(path.join(BACKEND, 'utils', 'stockHelper.js'));

  check('A medicine with no inventory row reads as untracked, not out', levelOf(null) === 'untracked');
  check('A row that has run out still reads as out', levelOf({ stockQty: 0 }) === 'out');
  check('A stocked row reads as in-stock', levelOf({ stockQty: 5, reorderLevel: 2 }) === 'in-stock');

  const HOSP = 'stock-hospital';
  // The store tracks ONE medicine and carries the rest off-system.
  await new models.Medicine({ hospital: HOSP, name: 'Amoxicillin', stockQty: 4, unit: 'tabs' }).save();
  await new models.Medicine({ hospital: HOSP, name: 'Cetirizine', stockQty: 0, unit: 'tabs' }).save();

  const result = await consumeStock(null, {
    hospital: HOSP,
    medicines: [{ name: 'Amoxicillin' }, { name: 'Paracetamol' }, { name: 'Cetirizine' }],
    by: 'Counter',
    tokenNumber: 'T-13'
  });

  check(
    'The tracked, stocked medicine is deducted',
    result.deducted.length === 1 && result.deducted[0].name === 'Amoxicillin',
    result.deducted
  );
  check(
    'The medicine nobody entered is NOT reported as a shortage',
    result.shortages.every((sh) => sh.requested !== 'Paracetamol'),
    result.shortages
  );
  check('…it is recorded as untracked instead', result.untracked.join() === 'Paracetamol', result.untracked);
  check(
    'The tracked medicine that genuinely ran out IS a shortage',
    result.shortages.length === 1 && result.shortages[0].requested === 'Cetirizine',
    result.shortages
  );
  check(
    '…and says why, so it is not confused with an untracked one',
    result.shortages[0].reason === 'out-of-stock',
    result.shortages[0]
  );

  // The whole point: what the patient is told.
  const handed = ['Amoxicillin', 'Paracetamol'];
  const owed = result.shortages.map((sh) => sh.requested);
  const msg = dispenseMessage('Gopi', 'T-13', handed, owed);
  // The line that names what the patient still has to come back for.
  const stillToCollect = (msg.split('Still to collect:')[1] || '').split(String.fromCharCode(10))[0];
  check(
    'The untracked medicine is not in the list of what is still owed',
    !stillToCollect.includes('Paracetamol'),
    stillToCollect
  );
  check(
    '…it is in the list of what was handed over',
    msg.split('Still to collect:')[0].includes('Paracetamol'),
    msg.split('Still to collect:')[0]
  );
  check('…only the one that really ran out', /Still to collect: Cetirizine/.test(msg), msg);

  // A facility that tracks NOTHING keeps working exactly as it did before any
  // of this existed: everything is handed over, nobody is warned.
  const emptyStore = await consumeStock(null, {
    hospital: 'no-inventory-hospital',
    medicines: [{ name: 'Paracetamol' }, { name: 'Xyz' }, { name: 'Rdfg' }],
    by: 'Counter',
    tokenNumber: 'T-14'
  });
  check(
    'A facility with no inventory at all reports no shortages',
    emptyStore.shortages.length === 0,
    emptyStore.shortages
  );
  check('…and everything is simply untracked', emptyStore.untracked.length === 3, emptyStore.untracked);
  check(
    '…so that patient is told their medicines were handed over',
    /have been handed over/.test(dispenseMessage('Gopi', 'T-14', ['Paracetamol', 'Xyz', 'Rdfg'], [])),
    'full handover'
  );

  const availability = await checkAvailability(HOSP, ['Amoxicillin', 'Paracetamol']);
  check(
    'The doctor console sees the same distinction while prescribing',
    availability[0].level === 'in-stock' && availability[1].level === 'untracked',
    availability
  );

  report();
})();
