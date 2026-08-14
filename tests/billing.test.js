const path = require('path');
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models } = installMockDb(BACKEND);

// The real money maths and rate-card resolution, not a copy of them — a drift
// between this file and the route was exactly what these tests exist to catch.
const { getBillingConfig, priceOf, recalculateInvoice, DEFAULT_SERVICES } = require(
  path.join(BACKEND, 'utils', 'billingConfig')
);

(async () => {
  section('Reception Billing & Daily Expense Tracker Tests');

  // Seed Patient & Doctor
  const patient = new models.Patient({
    _id: 'pat-101',
    name: 'Rajesh Kumar',
    phone: '+919876543210',
    age: 42,
    gender: 'Male'
  });
  await patient.save();

  const doctor = new models.Doctor({
    _id: 'doc-201',
    name: 'Dr. A. K. Sharma',
    department: 'General Medicine',
    hospital: 'general-hospital'
  });
  await doctor.save();

  const token = new models.Token({
    _id: 'tok-301',
    tokenNumber: 'T-105',
    hospital: 'general-hospital',
    patient: patient._id,
    doctor: doctor._id,
    symptoms: 'Fever and body pain',
    prescription: {
      medicines: [
        { name: 'Paracetamol 650mg', dosage: '1-0-1', duration: '5 days' },
        { name: 'Amoxicillin 500mg', dosage: '1-0-1', duration: '5 days' }
      ]
    },
    labTests: [{ testName: 'CBC Blood Count', urgency: 'Routine' }]
  });
  await token.save();

  // Test 1: Initialize Invoice for Patient Token
  const invoice = new models.Invoice({
    invoiceNumber: 'INV-1001',
    hospital: 'general-hospital',
    patient: patient._id,
    token: token._id,
    status: 'Pending',
    items: [
      {
        category: 'Consultation',
        itemName: 'OPD Doctor Consultation Fee',
        quantity: 1,
        unitPrice: 300,
        totalPrice: 300,
        addedBy: 'System Auto-billing'
      }
    ]
  });
  recalculateInvoice(invoice);
  await invoice.save();

  check('Invoice initialized with OPD Consultation Fee', invoice.totalAmount === 300);

  // Test 2: Add Daily Medicines (Dawa) & Bandage Charges
  invoice.items.push({
    category: 'Medicine',
    itemName: 'Paracetamol 650mg & Syrups',
    quantity: 2,
    unitPrice: 40,
    totalPrice: 80,
    addedBy: 'Reception Staff'
  });
  invoice.items.push({
    category: 'Nursing / Bandage',
    itemName: 'Wound Dressing & Sterile Bandage',
    quantity: 1,
    unitPrice: 150,
    totalPrice: 150,
    addedBy: 'Nurse Desk'
  });
  invoice.items.push({
    category: 'Room / Bed',
    itemName: 'Daily General Ward Bed Charge',
    quantity: 1,
    unitPrice: 500,
    totalPrice: 500,
    addedBy: 'Billing Counter'
  });

  recalculateInvoice(invoice);
  await invoice.save();

  check('Daily itemized expenses added (dawa, bandage, bed)', invoice.items.length === 4);
  check('Subtotal updated to ₹1030', invoice.subtotal === 1030);
  check('Balance due equals total amount ₹1030', invoice.balanceDue === 1030);

  // Test 3: Auto-pull Doctor Prescriptions & Lab Tests
  token.prescription.medicines.forEach((med) => {
    const exists = invoice.items.some((i) => i.category === 'Medicine' && i.itemName.includes(med.name));
    if (!exists) {
      invoice.items.push({
        category: 'Medicine',
        itemName: `Rx: ${med.name}`,
        quantity: 1,
        unitPrice: 60,
        totalPrice: 60,
        addedBy: 'Doctor Rx Auto-sync'
      });
    }
  });

  token.labTests.forEach((lab) => {
    const exists = invoice.items.some((i) => i.category === 'Lab Test' && i.itemName.includes(lab.testName));
    if (!exists) {
      invoice.items.push({
        category: 'Lab Test',
        itemName: `Lab: ${lab.testName}`,
        quantity: 1,
        unitPrice: 350,
        totalPrice: 350,
        addedBy: 'Lab Request Auto-sync'
      });
    }
  });

  recalculateInvoice(invoice);
  await invoice.save();

  check('Auto-synced doctor prescribed items & lab tests', invoice.items.length === 6);
  check('Total amount updated with lab test & Rx', invoice.totalAmount === 1440);

  // Test 4: Apply Discount & Discharge Patient
  section('Discharge & Final Payment Collection');
  invoice.discount = 100;
  recalculateInvoice(invoice);
  check('Discount deducted ₹100 from bill', invoice.totalAmount === 1340);

  invoice.amountPaid = 1340;
  invoice.paymentMethod = 'UPI';
  invoice.status = 'Discharged';
  invoice.dischargedAt = new Date();
  invoice.dischargedBy = 'Reception Staff';
  recalculateInvoice(invoice);
  await invoice.save();

  check('Patient marked Discharged', invoice.status === 'Discharged');
  check('Balance due is ₹0 after full UPI payment', invoice.balanceDue === 0);
  check('Payment method recorded as UPI', invoice.paymentMethod === 'UPI');

  // Test 5: Each facility bills at its OWN rates — the SaaS requirement.
  section('Per-Facility Rate Card (multi-hospital environments)');

  await new models.Hospital({
    id: 'sunrise-clinic',
    name: 'Sunrise Multispeciality Clinic',
    address: '12 MG Road, Patna',
    phone: '+916122334455'
  }).save();

  const general = await getBillingConfig('general-hospital');
  check('Rate card auto-seeded on first use', general.services.length === DEFAULT_SERVICES.length);
  check('Starter consultation fee is ₹300', general.consultationFee === 300);

  const sunrise = await getBillingConfig('sunrise-clinic');
  check('Second facility gets its own rate card', sunrise.hospital === 'sunrise-clinic');
  check(
    'Letterhead pre-filled from the facility profile',
    sunrise.displayName === 'Sunrise Multispeciality Clinic' && sunrise.address === '12 MG Road, Patna'
  );

  // Sunrise charges more for a dressing and nothing for consultation.
  sunrise.consultationFee = 0;
  sunrise.services.push({ category: 'Nursing / Bandage', name: 'Wound Bandage & Dressing', price: 400 });
  sunrise.services = sunrise.services.filter(
    (svc) => !(svc.category === 'Nursing / Bandage' && svc.price === 150)
  );
  sunrise.taxPercent = 5;
  await sunrise.save();

  const generalAgain = await getBillingConfig('general-hospital');
  check('Editing one facility does not touch another', generalAgain.consultationFee === 300);
  check(
    'Bandage priced per facility (₹150 vs ₹400)',
    priceOf(generalAgain, 'Nursing / Bandage', 'Wound Bandage & Dressing', 0) === 150 &&
      priceOf(sunrise, 'Nursing / Bandage', 'Wound Bandage & Dressing', 0) === 400
  );
  check(
    'Unlisted service falls back to the passed default',
    priceOf(generalAgain, 'Other', 'Helicopter Transfer', 99) === 99
  );
  check(
    'Doctor free-text medicine matches the catalogue entry',
    priceOf(generalAgain, 'Medicine', 'Paracetamol 500mg', 0) === 20
  );

  // Test 6: Tax comes from the facility's own percentage.
  const sunriseInvoice = new models.Invoice({
    invoiceNumber: 'SUN-1001',
    hospital: 'sunrise-clinic',
    patient: patient._id,
    status: 'Pending',
    items: [
      {
        category: 'Nursing / Bandage',
        itemName: 'Wound Bandage & Dressing',
        quantity: 1,
        unitPrice: 400,
        totalPrice: 400
      }
    ]
  });
  recalculateInvoice(sunriseInvoice, sunrise);
  await sunriseInvoice.save();

  check('5% facility tax applied to the bill', sunriseInvoice.tax === 20);
  check('Total includes the tax (₹420)', sunriseInvoice.totalAmount === 420);

  sunriseInvoice.discount = 100;
  recalculateInvoice(sunriseInvoice, sunrise);
  check('Tax recomputed on the discounted subtotal (₹15)', sunriseInvoice.tax === 15);
  check('Total after discount and tax is ₹315', sunriseInvoice.totalAmount === 315);

  const untaxed = new models.Invoice({
    invoiceNumber: 'INV-1002',
    hospital: 'general-hospital',
    patient: patient._id,
    items: [{ category: 'Other', itemName: 'File charge', quantity: 1, unitPrice: 50, totalPrice: 50 }]
  });
  recalculateInvoice(untaxed, generalAgain);
  check('A facility with 0% tax bills the plain subtotal', untaxed.totalAmount === 50);

  // Test 7: A walk-in bill with no token still totals correctly.
  const walkIn = new models.Invoice({
    invoiceNumber: 'INV-1003',
    hospital: 'general-hospital',
    patient: patient._id,
    token: null,
    items: [
      {
        category: 'Nursing / Bandage',
        itemName: 'Injection Administration',
        quantity: 2,
        unitPrice: 100,
        totalPrice: 200
      }
    ]
  });
  recalculateInvoice(walkIn, generalAgain);
  await walkIn.save();

  check('Walk-in bill needs no token', walkIn.token === null && walkIn.totalAmount === 200);

  report();
})();
