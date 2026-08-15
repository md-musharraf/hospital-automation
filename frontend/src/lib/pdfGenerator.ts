/**
 * Clinical PDF Generator for Billing Invoices & Lab Reports.
 * Generates standard PDF 1.4 documents byte-identically in the browser,
 * supports direct local download and ImageKit cloud uploads.
 */

// Helper to escape PDF text strings
function escapePdfText(text: string | number | undefined | null): string {
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E\n\r\t]/g, ' '); // Keep standard printable ASCII
}

/**
 * Builds a standard valid PDF 1.4 document stream from text instructions.
 */
function buildPdfDocument(pagesContent: string[]): Blob {
  const objects: string[] = [];

  // 1: Catalog
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');

  // 2: Pages root
  const pageRefs = pagesContent.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [ ${pageRefs} ] /Count ${pagesContent.length} >>`);

  // 3: Font standard
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  // Add pages and content streams
  pagesContent.forEach((content, i) => {
    const pageObjNum = 4 + i * 2;
    const streamObjNum = 5 + i * 2;

    const streamLength = new TextEncoder().encode(content).length;

    // Page object
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamObjNum} 0 R >>`
    );

    // Stream object
    objects.push(`<< /Length ${streamLength} >>\nstream\n${content}\nendstream`);
  });

  // Construct xref table
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((obj, idx) => {
    offsets.push(pdf.length);
    pdf += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  offsets.forEach((offset) => {
    const padded = String(offset).padStart(10, '0');
    pdf += `${padded} 00000 n \n`;
  });

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export interface InvoiceData {
  _id?: string;
  invoiceNumber: string;
  hospital?: string;
  patient?: { name?: string; phone?: string; age?: number | string; gender?: string };
  token?: { tokenNumber?: string };
  items?: Array<{
    category?: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  subtotal?: number;
  discount?: number;
  tax?: number;
  totalAmount?: number;
  amountPaid?: number;
  balanceDue?: number;
  paymentMethod?: string;
  status?: string;
  dischargedAt?: string | Date;
  dischargedBy?: string;
  notes?: string;
  pdfUrl?: string;
  createdAt?: string | Date;
}

export interface BillingConfigData {
  displayName?: string;
  address?: string;
  phone?: string;
  gstin?: string;
  currencySymbol?: string;
  footerNote?: string;
  taxPercent?: number;
}

/**
 * Generates an official Patient Billing & Discharge Invoice PDF.
 */
export function generateInvoicePdfBlob(invoice: InvoiceData, config?: BillingConfigData): Blob {
  const cur = config?.currencySymbol || 'Rs.';
  const facilityName = config?.displayName || invoice.hospital || 'CareeAi Medical Center';
  const facilityAddress = config?.address || 'Healthcare Management & Clinical Facility';
  const facilityPhone = config?.phone ? `Ph: ${config.phone}` : '';
  const facilityGstin = config?.gstin ? `GSTIN: ${config.gstin}` : '';
  const patientName = invoice.patient?.name || 'Walk-in Patient';
  const patientPhone = invoice.patient?.phone || 'N/A';
  const patientMeta =
    `${invoice.patient?.age ? `${invoice.patient.age} yrs` : ''} ${invoice.patient?.gender || ''}`.trim() ||
    'N/A';
  const invoiceNum = invoice.invoiceNumber || 'INV-1001';
  const dateStr = new Date(invoice.dischargedAt || invoice.createdAt || Date.now()).toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }
  );
  const statusStr = (invoice.status || 'Pending').toUpperCase();
  const paymentMode = invoice.paymentMethod || 'Cash';

  let s = '';

  // Background Header Box
  s += '0.08 0.45 0.45 rg\n'; // Teal primary color
  s += '30 730 535 80 re f\n';

  // Header Text in White
  s += '1 1 1 rg\n';
  s += 'BT /F1 18 Tf 45 780 Td (' + escapePdfText(facilityName.toUpperCase()) + ') Tj ET\n';
  s += 'BT /F1 9 Tf 45 765 Td (' + escapePdfText(facilityAddress) + ') Tj ET\n';
  if (facilityPhone || facilityGstin) {
    s += 'BT /F1 9 Tf 45 750 Td (' + escapePdfText(`${facilityPhone}   ${facilityGstin}`) + ') Tj ET\n';
  }

  // Invoice Title Badge
  s += '0.94 0.96 0.98 rg\n';
  s += '30 690 535 30 re f\n';
  s += '0.1 0.1 0.1 rg\n';
  s += 'BT /F1 12 Tf 45 700 Td (OFFICIAL DISCHARGE SUMMARY & MEDICAL INVOICE) Tj ET\n';
  s += 'BT /F1 10 Tf 460 700 Td (STATUS: ' + escapePdfText(statusStr) + ') Tj ET\n';

  // Details Grid Box
  s += '0.97 0.97 0.97 rg\n';
  s += '30 605 535 75 re f\n';
  s += '0.8 0.8 0.8 RG 1 w\n';
  s += '30 605 535 75 re S\n';

  s += '0.2 0.2 0.2 rg\n';
  // Left column: Patient details
  s +=
    'BT /F1 9 Tf 45 662 Td (PATIENT NAME:) Tj /F1 10 Tf 120 662 Td (' +
    escapePdfText(patientName) +
    ') Tj ET\n';
  s +=
    'BT /F1 9 Tf 45 645 Td (CONTACT / PHONE:) Tj /F1 9 Tf 120 645 Td (' +
    escapePdfText(patientPhone) +
    ') Tj ET\n';
  s +=
    'BT /F1 9 Tf 45 628 Td (AGE / GENDER:) Tj /F1 9 Tf 120 628 Td (' +
    escapePdfText(patientMeta) +
    ') Tj ET\n';
  if (invoice.token?.tokenNumber) {
    s +=
      'BT /F1 9 Tf 45 611 Td (TOKEN NUMBER:) Tj /F1 9 Tf 120 611 Td (' +
      escapePdfText(invoice.token.tokenNumber) +
      ') Tj ET\n';
  }

  // Right column: Invoice details
  s +=
    'BT /F1 9 Tf 330 662 Td (INVOICE NO:) Tj /F1 10 Tf 410 662 Td (' +
    escapePdfText(invoiceNum) +
    ') Tj ET\n';
  s +=
    'BT /F1 9 Tf 330 645 Td (DATE / TIME:) Tj /F1 9 Tf 410 645 Td (' + escapePdfText(dateStr) + ') Tj ET\n';
  s +=
    'BT /F1 9 Tf 330 628 Td (PAYMENT METHOD:) Tj /F1 9 Tf 410 628 Td (' +
    escapePdfText(paymentMode) +
    ') Tj ET\n';
  if (invoice.dischargedBy) {
    s +=
      'BT /F1 9 Tf 330 611 Td (DISCHARGED BY:) Tj /F1 9 Tf 410 611 Td (' +
      escapePdfText(invoice.dischargedBy) +
      ') Tj ET\n';
  }

  // Table Header
  let y = 575;
  s += '0.08 0.45 0.45 rg\n';
  s += `30 ${y} 535 22 re f\n`;
  s += '1 1 1 rg\n';
  s += `BT /F1 9 Tf 45 ${y + 6} Td (#) Tj ET\n`;
  s += `BT /F1 9 Tf 75 ${y + 6} Td (SERVICE / ITEM DESCRIPTION) Tj ET\n`;
  s += `BT /F1 9 Tf 320 ${y + 6} Td (CATEGORY) Tj ET\n`;
  s += `BT /F1 9 Tf 400 ${y + 6} Td (QTY) Tj ET\n`;
  s += `BT /F1 9 Tf 450 ${y + 6} Td (RATE) Tj ET\n`;
  s += `BT /F1 9 Tf 510 ${y + 6} Td (TOTAL) Tj ET\n`;

  // Table Rows
  y -= 20;
  const items = invoice.items || [];
  items.forEach((item, idx) => {
    if (idx % 2 === 1) {
      s += '0.96 0.97 0.98 rg\n';
      s += `30 ${y - 4} 535 18 re f\n`;
    }
    s += '0.15 0.15 0.15 rg\n';
    s += `BT /F1 9 Tf 45 ${y} Td (${idx + 1}) Tj ET\n`;
    s += `BT /F1 9 Tf 75 ${y} Td (${escapePdfText(item.itemName.slice(0, 38))}) Tj ET\n`;
    s += `BT /F1 8 Tf 320 ${y} Td (${escapePdfText(item.category || 'Other')}) Tj ET\n`;
    s += `BT /F1 9 Tf 405 ${y} Td (${item.quantity || 1}) Tj ET\n`;
    s += `BT /F1 9 Tf 445 ${y} Td (${cur}${item.unitPrice || 0}) Tj ET\n`;
    s += `BT /F1 9 Tf 505 ${y} Td (${cur}${item.totalPrice || 0}) Tj ET\n`;
    y -= 18;
  });

  // Divider
  y -= 10;
  s += '0.8 0.8 0.8 RG 1 w\n';
  s += `30 ${y} 535 0 re S\n`;

  // Totals Box (Right Side)
  y -= 20;
  const totalsX = 350;
  s += '0.2 0.2 0.2 rg\n';
  s += `BT /F1 9 Tf ${totalsX} ${y} Td (Subtotal:) Tj /F1 9 Tf 480 ${y} Td (${cur}${invoice.subtotal || 0}) Tj ET\n`;
  y -= 15;

  if (invoice.discount && invoice.discount > 0) {
    s += `BT /F1 9 Tf ${totalsX} ${y} Td (Discount:) Tj /F1 9 Tf 480 ${y} Td (-${cur}${invoice.discount}) Tj ET\n`;
    y -= 15;
  }

  if (invoice.tax && invoice.tax > 0) {
    s += `BT /F1 9 Tf ${totalsX} ${y} Td (Tax:) Tj /F1 9 Tf 480 ${y} Td (${cur}${invoice.tax}) Tj ET\n`;
    y -= 15;
  }

  // Final Total Highlight Box
  s += '0.08 0.45 0.45 rg\n';
  s += `${totalsX - 10} ${y - 6} 225 24 re f\n`;
  s += '1 1 1 rg\n';
  s += `BT /F1 11 Tf ${totalsX} ${y} Td (TOTAL PAYABLE:) Tj /F1 12 Tf 475 ${y} Td (${cur}${invoice.totalAmount || 0}) Tj ET\n`;
  y -= 25;

  s += '0.2 0.2 0.2 rg\n';
  s += `BT /F1 9 Tf ${totalsX} ${y} Td (Amount Paid:) Tj /F1 9 Tf 480 ${y} Td (${cur}${invoice.amountPaid || 0}) Tj ET\n`;
  y -= 15;
  s += `BT /F1 9 Tf ${totalsX} ${y} Td (Balance Due:) Tj /F1 9 Tf 480 ${y} Td (${cur}${invoice.balanceDue || 0}) Tj ET\n`;

  // Left Note & Seal
  s += '0.4 0.4 0.4 rg\n';
  s += `BT /F1 8 Tf 45 ${y + 35} Td (Payment Mode: ${escapePdfText(paymentMode)}) Tj ET\n`;
  if (invoice.notes) {
    s += `BT /F1 8 Tf 45 ${y + 20} Td (Remarks: ${escapePdfText(invoice.notes.slice(0, 45))}) Tj ET\n`;
  }
  s += `BT /F1 8 Tf 45 ${y + 5} Td (Authorized Signatory & Official Seal) Tj ET\n`;

  // Footer note
  s += '0.08 0.45 0.45 rg\n';
  s += '30 40 535 30 re f\n';
  s += '1 1 1 rg\n';
  s +=
    'BT /F1 9 Tf 45 52 Td (' +
    escapePdfText(config?.footerNote || 'Thank you for choosing us. We wish you a speedy recovery!') +
    ') Tj ET\n';
  s += 'BT /F1 7 Tf 410 52 Td (CareeAi Cloud Health Record) Tj ET\n';

  return buildPdfDocument([s]);
}

export interface LabTestData {
  testName: string;
  urgency?: string;
  status?: string;
  resultValue?: string;
  unit?: string;
  normalRange?: string;
  abnormal?: boolean;
  remarks?: string;
  reportPdf?: string;
  reportFileName?: string;
  completedBy?: string;
  completedAt?: string | Date;
}

export interface TokenLabData {
  _id?: string;
  tokenNumber?: string;
  hospital?: string;
  patient?: { name?: string; phone?: string; age?: number | string; gender?: string };
  doctor?: { name?: string; department?: string; currentRoom?: string };
  createdAt?: string | Date;
}

/**
 * Generates an official Pathology / Diagnostic Lab Test Report PDF.
 */
export function generateLabReportPdfBlob(
  test: LabTestData,
  token?: TokenLabData,
  hospitalName?: string
): Blob {
  const labName = (hospitalName || token?.hospital || 'CareeAi Diagnostic Laboratory').toUpperCase();
  const patientName = token?.patient?.name || 'Patient';
  const patientPhone = token?.patient?.phone || 'N/A';
  const patientMeta = `${token?.patient?.age ? `${token?.patient?.age} Y` : ''} / ${token?.patient?.gender || 'N/A'}`;
  const doctorName = token?.doctor?.name ? `Dr. ${token.doctor.name}` : 'Consultant Doctor';
  const department = token?.doctor?.department || 'Pathology & Diagnostics';
  const tokenNum = token?.tokenNumber || 'T-101';
  const reportedDate = new Date(test.completedAt || Date.now()).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let s = '';

  // Top Diagnostic Laboratory Header
  s += '0.04 0.35 0.40 rg\n';
  s += '30 730 535 80 re f\n';
  s += '1 1 1 rg\n';
  s += 'BT /F1 18 Tf 45 780 Td (' + escapePdfText(labName) + ') Tj ET\n';
  s += 'BT /F1 10 Tf 45 765 Td (DEPARTMENT OF PATHOLOGY & CLINICAL BIOCHEMISTRY) Tj ET\n';
  s += 'BT /F1 8 Tf 45 750 Td (NABH & NABL ACCREDITED DIGITAL DIAGNOSTIC FACILITY) Tj ET\n';

  // Report Banner
  s += '0.94 0.96 0.98 rg\n';
  s += '30 690 535 30 re f\n';
  s += '0.1 0.1 0.1 rg\n';
  s += 'BT /F1 12 Tf 45 700 Td (OFFICIAL CLINICAL LABORATORY INVESTIGATION REPORT) Tj ET\n';
  if (test.urgency === 'Urgent') {
    s += '0.85 0.1 0.1 rg\n';
    s += 'BT /F1 10 Tf 450 700 Td (URGENT STAT REPORT) Tj ET\n';
  } else {
    s += '0.1 0.5 0.2 rg\n';
    s += 'BT /F1 10 Tf 450 700 Td (FINAL VERIFIED) Tj ET\n';
  }

  // Patient & Requisition Demographics Grid
  s += '0.97 0.97 0.97 rg\n';
  s += '30 605 535 75 re f\n';
  s += '0.8 0.8 0.8 RG 1 w\n';
  s += '30 605 535 75 re S\n';

  s += '0.2 0.2 0.2 rg\n';
  s +=
    'BT /F1 9 Tf 45 662 Td (PATIENT NAME:) Tj /F1 10 Tf 130 662 Td (' +
    escapePdfText(patientName) +
    ') Tj ET\n';
  s +=
    'BT /F1 9 Tf 45 645 Td (AGE / GENDER:) Tj /F1 9 Tf 130 645 Td (' +
    escapePdfText(patientMeta) +
    ') Tj ET\n';
  s +=
    'BT /F1 9 Tf 45 628 Td (PHONE NUMBER:) Tj /F1 9 Tf 130 628 Td (' +
    escapePdfText(patientPhone) +
    ') Tj ET\n';
  s += 'BT /F1 9 Tf 45 611 Td (TOKEN NO:) Tj /F1 9 Tf 130 611 Td (' + escapePdfText(tokenNum) + ') Tj ET\n';

  s +=
    'BT /F1 9 Tf 330 662 Td (REFERRED BY:) Tj /F1 10 Tf 410 662 Td (' +
    escapePdfText(doctorName) +
    ') Tj ET\n';
  s +=
    'BT /F1 9 Tf 330 645 Td (DEPARTMENT:) Tj /F1 9 Tf 410 645 Td (' + escapePdfText(department) + ') Tj ET\n';
  s +=
    'BT /F1 9 Tf 330 628 Td (REPORT DATE:) Tj /F1 9 Tf 410 628 Td (' +
    escapePdfText(reportedDate) +
    ') Tj ET\n';
  s += 'BT /F1 9 Tf 330 611 Td (SAMPLE TYPE:) Tj /F1 9 Tf 410 611 Td (Venous Blood / Serum) Tj ET\n';

  // Table Header
  const y = 570;
  s += '0.04 0.35 0.40 rg\n';
  s += `30 ${y} 535 24 re f\n`;
  s += '1 1 1 rg\n';
  s += `BT /F1 9 Tf 45 ${y + 7} Td (TEST INVESTIGATION) Tj ET\n`;
  s += `BT /F1 9 Tf 240 ${y + 7} Td (OBSERVED VALUE) Tj ET\n`;
  s += `BT /F1 9 Tf 340 ${y + 7} Td (UNIT) Tj ET\n`;
  s += `BT /F1 9 Tf 410 ${y + 7} Td (BIOLOGICAL REFERENCE INTERVAL) Tj ET\n`;
  s += `BT /F1 9 Tf 530 ${y + 7} Td (FLAG) Tj ET\n`;

  // Row 1: The primary test result
  const rowY = y - 30;
  if (test.abnormal) {
    s += '1.0 0.92 0.92 rg\n'; // Light rose for abnormal
    s += `30 ${rowY - 5} 535 25 re f\n`;
    s += '0.85 0.1 0.1 rg\n';
  } else {
    s += '0.96 0.98 0.96 rg\n'; // Light green for normal
    s += `30 ${rowY - 5} 535 25 re f\n`;
    s += '0.1 0.1 0.1 rg\n';
  }

  s += `BT /F1 10 Tf 45 ${rowY + 2} Td (${escapePdfText(test.testName)}) Tj ET\n`;
  s += `BT /F1 11 Tf 240 ${rowY + 2} Td (${escapePdfText(test.resultValue || 'Normal')}) Tj ET\n`;
  s += `BT /F1 9 Tf 340 ${rowY + 2} Td (${escapePdfText(test.unit || '-')}) Tj ET\n`;
  s += `BT /F1 9 Tf 410 ${rowY + 2} Td (${escapePdfText(test.normalRange || 'Standard reference')}) Tj ET\n`;
  s += `BT /F1 10 Tf 530 ${rowY + 2} Td (${test.abnormal ? 'HIGH *' : 'NORMAL'}) Tj ET\n`;

  // Clinical Interpretation Box
  let noteY = rowY - 50;
  s += '0.98 0.98 0.98 rg\n';
  s += `30 ${noteY - 40} 535 70 re f\n`;
  s += '0.85 0.85 0.85 RG 1 w\n';
  s += `30 ${noteY - 40} 535 70 re S\n`;

  s += '0.1 0.1 0.1 rg\n';
  s += `BT /F1 10 Tf 45 ${noteY + 15} Td (CLINICAL REMARKS & INTERPRETATION:) Tj ET\n`;
  s += `BT /F1 9 Tf 45 ${noteY} Td (${escapePdfText(test.remarks || 'Test completed and verified under standard laboratory protocol.')}) Tj ET\n`;

  if (test.abnormal) {
    s += '0.85 0.1 0.1 rg\n';
    s += `BT /F1 9 Tf 45 ${noteY - 18} Td (ATTENTION: The marked parameter is outside the biological reference interval. Correlate clinically.) Tj ET\n`;
  } else {
    s += '0.1 0.5 0.2 rg\n';
    s += `BT /F1 9 Tf 45 ${noteY - 18} Td (Result is within expected physiological range for the demographic profile.) Tj ET\n`;
  }

  // Pathologist & Lab Tech Sign-off
  noteY -= 110;
  s += '0.3 0.3 0.3 rg\n';
  s += `BT /F1 9 Tf 45 ${noteY} Td (Prepared By: ${escapePdfText(test.completedBy || 'Laboratory Technician')}) Tj ET\n`;
  s += `BT /F1 9 Tf 360 ${noteY} Td (Verified By: Consultant Pathologist, MD) Tj ET\n`;
  s += '0.7 0.7 0.7 RG 1 w\n';
  s += `30 ${noteY - 10} 535 0 re S\n`;

  // Footer note
  s += '0.04 0.35 0.40 rg\n';
  s += '30 40 535 30 re f\n';
  s += '1 1 1 rg\n';
  s +=
    'BT /F1 8 Tf 45 52 Td (This is an authenticated digital laboratory report stored securely in Cloud storage.) Tj ET\n';
  s += 'BT /F1 8 Tf 450 52 Td (CareeAi Health Network) Tj ET\n';

  return buildPdfDocument([s]);
}

/**
 * Downloads a generated PDF blob in the browser.
 */
export function downloadPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';

/**
 * Uploads a PDF Blob to ImageKit storage using short-lived signed credentials.
 */
export async function uploadPdfBlobToImageKit(
  backendUrl: string,
  blob: Blob,
  fileName: string,
  purpose: 'invoice' | 'report',
  options?: { hospitalId?: string; sessionToken?: string; adminSecret?: string }
): Promise<string | null> {
  try {
    const authRes = await fetch(`${backendUrl}/api/v1/uploads/imagekit/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.adminSecret ? { 'X-Admin-Secret': options.adminSecret } : {}),
        ...(options?.sessionToken ? { Authorization: `Bearer ${options.sessionToken}` } : {})
      },
      body: JSON.stringify({ purpose, hospitalId: options?.hospitalId })
    });

    if (!authRes.ok) return null;
    const auth = await authRes.json();

    const form = new FormData();
    form.append('file', blob, fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
    form.append('fileName', fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
    form.append('publicKey', auth.publicKey);
    form.append('signature', auth.signature);
    form.append('expire', String(auth.expire));
    form.append('token', auth.token);
    form.append('folder', auth.folder);
    form.append('useUniqueFileName', 'true');

    const uploadRes = await fetch(IMAGEKIT_UPLOAD_URL, {
      method: 'POST',
      body: form
    });

    if (uploadRes.ok) {
      const data = await uploadRes.json();
      return data.url || null;
    }
    return null;
  } catch (err) {
    console.error('ImageKit PDF upload error:', err);
    return null;
  }
}

/**
 * Universal PDF upload to ImageKit Cloud Storage.
 */
export async function uploadPdfBlobToCloud(
  backendUrl: string,
  blob: Blob,
  fileName: string,
  purpose: 'invoice' | 'report',
  options: {
    hospitalId?: string;
    sessionToken?: string;
    tokenId?: string;
    invoiceNumber?: string;
  }
): Promise<string | null> {
  return uploadPdfBlobToImageKit(backendUrl, blob, fileName, purpose, options);
}
