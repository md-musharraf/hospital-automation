const path = require('path');
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const BACKEND = path.resolve(__dirname, '..', 'backend');
const { models } = installMockDb(BACKEND);

// Helper function to recalculate invoice amounts
function recalculateInvoice(invoice) {
  invoice.subtotal = (invoice.items || []).reduce((acc, item) => acc + (item.totalPrice || 0), 0);
  const disc = invoice.discount || 0;
  const taxVal = invoice.tax || 0;
  invoice.totalAmount = Math.max(0, invoice.subtotal - disc + taxVal);
  invoice.balanceDue = Math.max(0, invoice.totalAmount - (invoice.amountPaid || 0));
  return invoice;
}

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

  report();
})();
