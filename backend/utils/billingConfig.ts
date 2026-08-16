/**
 * Rate-card resolution for a facility.
 *
 * The rule this file enforces: no price is ever hard-coded in a route or a
 * screen. Anything that costs money is read from the calling facility's own
 * BillingConfig, and a facility that has never opened the billing settings gets
 * a sensible starter rate card seeded on first use rather than an empty screen.
 */

import { randomUUID } from 'crypto';
import BillingConfig from '../models/BillingConfig';
import Hospital from '../models/Hospital';
import logger from './logger';

export interface ServiceItem {
  _id?: string;
  category: string;
  name: string;
  price: number;
  active?: boolean;
}

export interface DefaultBillingConfig {
  currencySymbol: string;
  invoicePrefix: string;
  taxPercent: number;
  consultationFee: number;
  labTestPrice: number;
  urgentLabTestPrice: number;
  defaultMedicinePrice: number;
  registrationFee: number;
  footerNote: string;
  gstin: string;
}

/**
 * Starter catalogue for a facility that has not customised anything yet. These
 * are Indian small/mid hospital ballpark rates and are meant to be edited from
 * the reception's Rate Card screen — they are a starting point, not a standard.
 */
export const DEFAULT_SERVICES: ServiceItem[] = [
  { category: 'Consultation', name: 'OPD Doctor Consultation Fee', price: 300 },
  { category: 'Consultation', name: 'Follow-up Consultation', price: 150 },
  { category: 'Consultation', name: 'Specialist Consultation', price: 600 },
  { category: 'Lab Test', name: 'CBC Blood Test', price: 350 },
  { category: 'Lab Test', name: 'Blood Sugar (Fasting)', price: 150 },
  { category: 'Lab Test', name: 'Urine Routine', price: 200 },
  { category: 'Lab Test', name: 'X-Ray (Chest)', price: 400 },
  { category: 'Lab Test', name: 'ECG', price: 300 },
  { category: 'Medicine', name: 'Paracetamol 500mg (strip)', price: 20 },
  { category: 'Medicine', name: 'ORS Sachet', price: 25 },
  { category: 'Medicine', name: 'Antibiotic Course (5 days)', price: 250 },
  { category: 'Nursing / Bandage', name: 'Wound Bandage & Dressing', price: 150 },
  { category: 'Nursing / Bandage', name: 'Injection Administration', price: 100 },
  { category: 'Nursing / Bandage', name: 'Stitching / Suture', price: 500 },
  { category: 'Room / Bed', name: 'General Ward Bed (per day)', price: 500 },
  { category: 'Room / Bed', name: 'Private Room (per day)', price: 2000 },
  { category: 'Room / Bed', name: 'ICU Bed (per day)', price: 5000 },
  { category: 'Equipment / Consumable', name: 'Oxygen Support (per hour)', price: 200 },
  { category: 'Equipment / Consumable', name: 'Nebulization', price: 150 },
  { category: 'Other', name: 'Ambulance Service', price: 800 },
  { category: 'Other', name: 'Registration / File Charge', price: 50 }
];

/** Every default written out explicitly — the mock DB used in tests and offline
 *  runs does not apply schema defaults, so the seed must not depend on them. */
export const DEFAULT_CONFIG: DefaultBillingConfig = {
  currencySymbol: '₹',
  invoicePrefix: 'INV',
  taxPercent: 0,
  consultationFee: 300,
  labTestPrice: 350,
  urgentLabTestPrice: 500,
  defaultMedicinePrice: 50,
  registrationFee: 0,
  footerNote: 'Thank you for choosing us. Get well soon!',
  gstin: ''
};

/**
 * This facility's rate card, creating it on first use.
 *
 * The letterhead is pre-filled from the Hospital record so a newly onboarded
 * facility prints its own name and address on day one without anyone typing it
 * a second time.
 */
export async function getBillingConfig(hospital?: string | null): Promise<any> {
  const tenant = hospital || 'general-hospital';

  const readFacility = async (): Promise<any> => {
    try {
      return await (Hospital as any).findOne({ id: tenant });
    } catch (err) {
      logger.error('Could not read facility profile for billing letterhead', { err, hospital: tenant });
      return null;
    }
  };

  let config = await (BillingConfig as any).findOne({ hospital: tenant });
  if (config) {
    // Back-fill a letterhead that was never filled in.
    //
    // The seeding below has always copied the facility's name onto the rate
    // card, but rate cards created before it did — and any created while the
    // Hospital lookup failed — carry an empty `displayName`. Every printed bill
    // from those facilities then had no facility on it, because the PDF has
    // nothing else to fall back to but the tenant slug. Repairing it on read
    // fixes the existing rows without a migration, and costs one extra query
    // only for the facilities that are actually broken.
    if (!String(config.displayName || '').trim()) {
      const facility = await readFacility();
      if (facility && facility.name) {
        config.displayName = facility.name;
        if (!String(config.address || '').trim()) config.address = facility.address || '';
        if (!String(config.phone || '').trim()) config.phone = facility.phone || '';
        try {
          await config.save();
          logger.info('Back-filled billing letterhead from facility profile', { hospital: tenant });
        } catch (err) {
          // A bill printed with the right name beats a failed request; the
          // in-memory value is already correct for this response.
          logger.error('Could not persist back-filled billing letterhead', { err, hospital: tenant });
        }
      }
    }
    return config;
  }

  const facility = await readFacility();

  config = new (BillingConfig as any)({
    hospital: tenant,
    ...DEFAULT_CONFIG,
    displayName: (facility && facility.name) || tenant,
    address: (facility && facility.address) || '',
    phone: (facility && facility.phone) || '',
    // Ids are assigned here rather than left to a schema default: the offline
    // database does not apply defaults to sub-documents, and the counter needs
    // a stable id to charge or delete a service by.
    services: DEFAULT_SERVICES.map((service) => ({ ...service, _id: randomUUID(), active: true }))
  });
  await config.save();

  logger.info('Seeded default billing rate card for facility', { hospital: tenant });
  return config;
}

/**
 * Price for a named service, or `fallback` when the facility does not sell it.
 * Matching is case-insensitive and tolerates the free-text the doctor typed
 * ("Paracetamol 650mg" vs the catalogue's "Paracetamol 500mg (strip)") by
 * accepting a containment match in either direction.
 */
export function priceOf(
  config: any,
  category: string | null | undefined,
  name: string | null | undefined,
  fallback: number
): number {
  if (!config || !Array.isArray(config.services) || !name) return fallback;

  const wanted = String(name).toLowerCase().trim();
  const candidates = config.services.filter(
    (service: any) => service.active !== false && (!category || service.category === category)
  );

  const exact = candidates.find((service: any) => String(service.name).toLowerCase().trim() === wanted);
  if (exact) return exact.price;

  const partial = candidates.find((service: any) => {
    const listed = String(service.name).toLowerCase().trim();
    return listed.includes(wanted) || wanted.includes(listed);
  });

  return partial ? partial.price : fallback;
}

/**
 * Recompute an invoice's money fields from its line items.
 *
 * Tax is a percentage of the discounted subtotal, taken from the facility's
 * config — passing no config keeps whatever `invoice.tax` already held, which is
 * what the older token-less callers expect.
 */
export function recalculateInvoice(invoice: any, config?: any): any {
  invoice.subtotal = (invoice.items || []).reduce(
    (acc: number, item: any) => acc + (item.totalPrice || 0),
    0
  );

  const discount = invoice.discount || 0;
  const taxable = Math.max(0, invoice.subtotal - discount);

  if (config && config.taxPercent) {
    invoice.tax = Math.round(taxable * (config.taxPercent / 100) * 100) / 100;
  }

  invoice.totalAmount = Math.max(0, taxable + (invoice.tax || 0));
  invoice.balanceDue = Math.max(0, invoice.totalAmount - (invoice.amountPaid || 0));
  return invoice;
}
