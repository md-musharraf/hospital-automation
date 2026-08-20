/**
 * What a prescription actually is, and what a counter actually handed over.
 *
 * The pharmacy used to record one boolean. Pressing "dispense" set
 * `dispensed = true` whatever happened at the counter, so a patient who was
 * given nothing — every item out of stock — was recorded as dispensed, moved to
 * the "Medicines collected. Get well soon!" stage on their own tracker, cleared
 * off the pharmacy's pending list, and shown to the doctor as complete. The one
 * trace left was a note in the message: "your medicines have been handed over"
 * followed immediately by "Currently unavailable: Paracetamol, Xyz, Rdfg".
 *
 * Everything downstream reads that boolean, which is why the whole platform
 * agreed on something untrue at once. So the record is what was handed over and
 * what is still owed, and every dashboard derives its answer from that.
 */

/** One prescribed line, after cleaning. */
export interface MedicineLine {
  name: string;
  dosage?: string;
  duration?: string;
  instructions?: string;
}

export type DispenseState = 'none-required' | 'pending' | 'partial' | 'full';

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Compare medicine names the way a counter does: case and spacing don't count. */
export const medicineKey = (name: unknown): string => clean(name).toLowerCase().replace(/\s+/g, ' ');

/**
 * Clean the lines a doctor submitted before they are stored.
 *
 * "Paracetamol " and "paracetamol" are the same medicine, and storing the first
 * is what printed `Currently unavailable: Paracetamol , Xyz` — a stray space
 * before a comma that no amount of message formatting can fix, because the
 * space is in the data. Nameless rows are dropped rather than stored blank: an
 * empty line cannot be dispensed, matched against stock, or explained to a
 * patient, and it would sit on the pharmacy's list forever.
 */
export function normalizeMedicines(input: any): MedicineLine[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const lines: MedicineLine[] = [];

  for (const raw of input) {
    const name = clean(raw && (raw.name ?? raw));
    if (!name) continue;

    const key = medicineKey(name);
    if (seen.has(key)) continue; // the same medicine twice is a slip, not a double dose
    seen.add(key);

    lines.push({
      name,
      dosage: clean(raw && raw.dosage),
      duration: clean(raw && raw.duration),
      instructions: clean(raw && raw.instructions)
    });
  }

  return lines;
}

/** The prescribed names still owed to the patient. */
export function pendingOf(prescription: any): string[] {
  const medicines = (prescription && prescription.medicines) || [];
  if (!Array.isArray(medicines) || medicines.length === 0) return [];

  // Written by the counter. Before this field existed a dispensed prescription
  // simply had none, so an older record reads as "nothing outstanding" — which
  // is what it was taken to mean at the time.
  const stored = (prescription && prescription.pendingMedicines) || [];
  if (Array.isArray(stored) && stored.length > 0) {
    const owed = new Set(stored.map(medicineKey));
    return medicines.map((m: any) => clean(m && m.name)).filter((n: string) => owed.has(medicineKey(n)));
  }

  if (prescription && prescription.dispensed) return [];
  return medicines.map((m: any) => clean(m && m.name)).filter(Boolean);
}

/** Where this prescription stands, for anything that has to show or route it. */
export function dispenseStateOf(prescription: any): DispenseState {
  const medicines = (prescription && prescription.medicines) || [];
  if (!Array.isArray(medicines) || medicines.length === 0) return 'none-required';

  const pending = pendingOf(prescription);
  if (pending.length === 0) return 'full';
  if (pending.length === medicines.length) {
    // Nothing has been handed over. Whether the counter has tried yet is the
    // difference between "waiting for the patient" and "we could not supply it",
    // and only the second has a dispense attempt recorded against it.
    return prescription && prescription.dispensedAt ? 'partial' : 'pending';
  }
  return 'partial';
}

/** A readable list: "Paracetamol, Amoxicillin and Cetirizine". */
export function listNames(names: string[], joiner: string = 'and'): string {
  const clean_ = names.map(clean).filter(Boolean);
  if (clean_.length === 0) return '';
  if (clean_.length === 1) return clean_[0];
  return `${clean_.slice(0, -1).join(', ')} ${joiner} ${clean_[clean_.length - 1]}`;
}

/**
 * What to tell the patient, given what the counter could actually supply.
 *
 * Three different things happened and they now read as three different
 * messages. The old text asserted the handover in its first sentence and
 * contradicted it in the second.
 */
export function dispenseMessage(
  patientName: string,
  tokenNumber: string,
  handedOver: string[],
  stillOwed: string[]
): string {
  const name = clean(patientName) || 'Patient';

  if (stillOwed.length === 0) {
    return (
      `Hello ${name}, your medicines for token ${tokenNumber} have been handed over at our pharmacy counter.\n` +
      `नमस्ते ${name}, टोकन ${tokenNumber} की आपकी दवाइयाँ काउंटर से दे दी गई हैं।`
    );
  }

  if (handedOver.length === 0) {
    return (
      `Hello ${name}, we could NOT hand over the medicines for token ${tokenNumber} yet — ` +
      `${listNames(stillOwed)} ${stillOwed.length === 1 ? 'is' : 'are'} out of stock right now.\n` +
      `Please ask the counter for an alternative, or check back before you travel. ` +
      `Your prescription stays open until you have collected it.\n\n` +
      `नमस्ते ${name}, टोकन ${tokenNumber} की दवाइयाँ अभी नहीं दी जा सकीं — ${listNames(stillOwed, 'और')} स्टॉक में नहीं है। ` +
      `कृपया काउंटर पर विकल्प पूछें। आपका पर्चा तब तक खुला रहेगा जब तक दवा मिल न जाए।`
    );
  }

  return (
    `Hello ${name}, part of your prescription for token ${tokenNumber} has been handed over: ` +
    `${listNames(handedOver)}.\n` +
    `⚠️ Still to collect: ${listNames(stillOwed)} — out of stock right now. ` +
    `Please ask the counter for an alternative. We will message you when it is back.\n\n` +
    `नमस्ते ${name}, टोकन ${tokenNumber} की कुछ दवाइयाँ दे दी गई हैं: ${listNames(handedOver, 'और')}।\n` +
    `⚠️ बाकी है: ${listNames(stillOwed, 'और')} — अभी स्टॉक में नहीं। कृपया काउंटर पर विकल्प पूछें।`
  );
}
