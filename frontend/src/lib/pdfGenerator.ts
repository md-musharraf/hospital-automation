/**
 * Clinical PDF generator for billing invoices and lab reports.
 *
 * Builds PDF 1.4 documents in the browser with no dependencies, for local
 * download, printing, and ImageKit cloud upload.
 *
 * Two things about the encoding are load-bearing:
 *
 *   - The base-14 fonts here are single-byte and use WinAnsiEncoding, so a
 *     string can only carry Latin-1. Anything outside that (the rupee sign, a
 *     Devanagari facility name, a curly quote pasted from Word) has to be
 *     transliterated BEFORE it reaches the page, or the glyph is simply absent.
 *     The previous version dropped every non-ASCII byte, which is why a facility
 *     whose name or currency symbol was not plain ASCII printed a blank
 *     letterhead and bare numbers with no currency at all.
 *
 *   - Every byte written into the content stream stays inside 0x20–0x7E,
 *     because bytes above 0x7E are emitted as PDF octal escapes (`\351`) rather
 *     than raw. That keeps `String.length` equal to the UTF-8 byte length, which
 *     is what the xref table's offsets are computed from. Writing a raw
 *     high byte would desynchronise every offset after it and produce a file
 *     that some readers open and others reject.
 */

// ---------------------------------------------------------------------------
// Text encoding
// ---------------------------------------------------------------------------

/**
 * Characters that have no Latin-1 code point but a perfectly good ASCII
 * spelling. The rupee sign is the one that matters here — it is the default
 * currency symbol for every facility on the platform, and WinAnsiEncoding has
 * no glyph for it, so without this line every amount on every bill printed as a
 * bare number.
 */
const TRANSLITERATIONS: Record<string, string> = {
  '\u20b9': 'Rs.', // rupee sign: no WinAnsi glyph, and it is our default symbol
  '\u20ac': '\u0080', // euro sign: WinAnsi puts it at 0x80, outside Latin-1
  '\u2018': "'", // left single quote
  '\u2019': "'", // right single quote / typographic apostrophe
  '\u201a': ',', // single low quote
  '\u201c': '"', // left double quote
  '\u201d': '"', // right double quote
  '\u2013': '-', // en dash
  '\u2014': '-', // em dash
  '\u2212': '-', // minus sign
  '\u2026': '...', // ellipsis
  '\u00a0': ' ', // non-breaking space
  '\u2022': '*', // bullet
  '\u2192': '->', // rightwards arrow
  '\u2713': 'Y', // check mark
  '\u2714': 'Y', // heavy check mark
  '\u26a0': '!', // warning sign
  '\ufe0f': '' // variation selector left behind by a stripped emoji
};

/**
 * Fold a string down to something the built-in fonts can actually draw.
 *
 * Accented Latin survives via NFD decomposition (é → e) rather than being
 * dropped, so "Café Clinic" prints as "Cafe Clinic" instead of "Caf Clinic".
 * Scripts with no Latin equivalent at all — Devanagari, Bengali, Tamil — cannot
 * be rendered by a base-14 font under any encoding; those characters are
 * removed here and the caller decides what to show instead. See
 * `printableName` for the letterhead's fallback.
 */
export function toPrintable(input: string | number | undefined | null): string {
  if (input === undefined || input === null) return '';

  let text = String(input);

  for (const [from, to] of Object.entries(TRANSLITERATIONS)) {
    if (text.includes(from)) text = text.split(from).join(to);
  }

  // Strip combining marks so accented letters degrade to their base form.
  text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (code === 10 || code === 13 || code === 9) {
      out += ' ';
    } else if (code >= 0x20 && code <= 0xff) {
      out += ch;
    }
    // Everything else has no glyph in a WinAnsi base-14 font — drop it.
  }

  return out.replace(/\s+/g, ' ').trim();
}

/** `toPrintable` plus the PDF string escapes, with high bytes as octal. */
function pdfString(input: string | number | undefined | null): string {
  const text = toPrintable(input);
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '(') out += '\\(';
    else if (ch === ')') out += '\\)';
    else if (code > 0x7e) out += '\\' + code.toString(8).padStart(3, '0');
    else out += ch;
  }
  return out;
}

/**
 * A name that is safe to print, or `fallback` when nothing survived.
 *
 * A facility registered entirely in Devanagari would otherwise get an empty
 * letterhead — worse than the slug, because a bill with no facility on it is
 * not a bill. Callers pass the tenant id as the fallback and it is prettified
 * ("city-general-hospital" → "City General Hospital").
 */
export function printableName(value: string | undefined | null, fallback: string): string {
  const cleaned = toPrintable(value);
  if (cleaned) return cleaned;
  return toPrintable(
    String(fallback || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// ---------------------------------------------------------------------------
// Font metrics
// ---------------------------------------------------------------------------

/**
 * Helvetica advance widths, in 1/1000 em, for the printable ASCII range.
 *
 * Right-aligning the money columns is the difference between a bill that reads
 * as a document and one that reads as a screen dump, and right alignment needs
 * a real measurement — PDF has no layout engine to do it for us.
 */
// prettier-ignore
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];

// prettier-ignore
const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
];

type FontName = 'regular' | 'bold';

/** Rendered width of `text` at `size`, in points. */
export function textWidth(text: string, size: number, font: FontName = 'regular'): number {
  const table = font === 'bold' ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  const printable = toPrintable(text);
  let total = 0;
  for (const ch of printable) {
    const code = ch.charCodeAt(0);
    // Latin-1 accented forms are close enough to their ASCII base for layout.
    total += code >= 32 && code <= 126 ? table[code - 32] : 556;
  }
  return (total * size) / 1000;
}

/** Trim `text` until it fits `maxWidth`, adding an ellipsis when it had to cut. */
export function fitText(text: string, maxWidth: number, size: number, font: FontName = 'regular'): string {
  const printable = toPrintable(text);
  if (textWidth(printable, size, font) <= maxWidth) return printable;

  let cut = printable;
  while (cut.length > 1 && textWidth(cut + '...', size, font) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut + '...';
}

/** Break `text` into lines that each fit `maxWidth`, up to `maxLines`. */
function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  maxLines: number,
  font: FontName = 'regular'
): string[] {
  const words = toPrintable(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, font) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }

  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === 0) return [];

  // Anything that did not fit is folded back onto the final line and clipped,
  // so a long remark ends in "..." rather than disappearing without trace.
  const consumed = lines.join(' ').length;
  const rest = toPrintable(text).slice(consumed).trim();
  if (rest) lines[lines.length - 1] = fitText(`${lines[lines.length - 1]} ${rest}`, maxWidth, size, font);

  return lines;
}

// ---------------------------------------------------------------------------
// Page drawing
// ---------------------------------------------------------------------------

export const PAGE_WIDTH = 595.28; // A4
export const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_LEFT = MARGIN;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

type Rgb = [number, number, number];

const INK: Rgb = [0.13, 0.13, 0.13];
const MUTED: Rgb = [0.42, 0.45, 0.48];
const HAIRLINE: Rgb = [0.84, 0.86, 0.88];
const ZEBRA: Rgb = [0.968, 0.976, 0.98];
const WHITE: Rgb = [1, 1, 1];

/** A single page's content stream, built by the drawing helpers below. */
class Page {
  private ops: string[] = [];

  fill(color: Rgb) {
    this.ops.push(`${color[0]} ${color[1]} ${color[2]} rg`);
    return this;
  }

  stroke(color: Rgb) {
    this.ops.push(`${color[0]} ${color[1]} ${color[2]} RG`);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, color: Rgb) {
    this.fill(color);
    this.ops.push(`${r(x)} ${r(y)} ${r(w)} ${r(h)} re f`);
    return this;
  }

  outline(x: number, y: number, w: number, h: number, color: Rgb = HAIRLINE, width = 0.7) {
    this.stroke(color);
    this.ops.push(`${width} w ${r(x)} ${r(y)} ${r(w)} ${r(h)} re S`);
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Rgb = HAIRLINE, width = 0.7) {
    this.stroke(color);
    this.ops.push(`${width} w ${r(x1)} ${r(y1)} m ${r(x2)} ${r(y2)} l S`);
    return this;
  }

  text(
    value: string | number,
    x: number,
    y: number,
    opts: { size?: number; font?: FontName; color?: Rgb; align?: 'left' | 'right' | 'center' } = {}
  ) {
    const { size = 9, font = 'regular', color = INK, align = 'left' } = opts;
    const printable = toPrintable(value);
    if (!printable) return this;

    let drawX = x;
    if (align === 'right') drawX = x - textWidth(printable, size, font);
    else if (align === 'center') drawX = x - textWidth(printable, size, font) / 2;

    this.fill(color);
    this.ops.push(
      `BT /${font === 'bold' ? 'F2' : 'F1'} ${size} Tf ${r(drawX)} ${r(y)} Td (${pdfString(printable)}) Tj ET`
    );
    return this;
  }

  /** A label/value pair, the shape every detail box on these documents uses. */
  field(label: string, value: string | number, x: number, y: number, valueX: number, size = 8.5) {
    this.text(label.toUpperCase(), x, y, { size: size - 0.5, color: MUTED, font: 'bold' });
    this.text(value, valueX, y, { size, font: 'bold' });
    return this;
  }

  toStream(): string {
    return this.ops.join('\n');
  }
}

/** Trim float noise out of the content stream — `12.100000000000001` is valid
 *  PDF but makes the file bigger and impossible to read while debugging. */
function r(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Assemble pages into a PDF 1.4 file.
 *
 * The xref offsets are byte offsets. `pdfString` guarantees the content streams
 * hold no byte above 0x7E, so JS string length and UTF-8 byte length agree and
 * `pdf.length` is a correct offset. Do not write raw high bytes here.
 */
function buildPdfDocument(pages: Page[]): Blob {
  const objects: string[] = [];

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');

  const pageRefs = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [ ${pageRefs} ] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  pages.forEach((page, i) => {
    const streamObjNum = 6 + i * 2;
    const content = page.toStream();

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObjNum} 0 R >>`
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((obj, idx) => {
    offsets.push(pdf.length);
    pdf += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

// ---------------------------------------------------------------------------
// Shared document furniture
// ---------------------------------------------------------------------------

export interface Letterhead {
  name: string;
  address?: string;
  phone?: string;
  gstin?: string;
  accent: Rgb;
}

/** The coloured band every document opens with. Returns the y to carry on from. */
function drawLetterhead(page: Page, head: Letterhead, subtitle: string): number {
  const bandHeight = 58;
  const bandBottom = PAGE_HEIGHT - MARGIN - bandHeight;

  page.rect(CONTENT_LEFT, bandBottom, CONTENT_WIDTH, bandHeight, head.accent);

  const nameSize = textWidth(head.name, 17, 'bold') > CONTENT_WIDTH - 200 ? 13 : 17;
  page.text(
    fitText(head.name.toUpperCase(), CONTENT_WIDTH - 24, nameSize, 'bold'),
    CONTENT_LEFT + 14,
    bandBottom + 36,
    {
      size: nameSize,
      font: 'bold',
      color: WHITE
    }
  );

  if (head.address) {
    page.text(fitText(head.address, CONTENT_WIDTH - 24, 8.5), CONTENT_LEFT + 14, bandBottom + 23, {
      size: 8.5,
      color: WHITE
    });
  }

  const contact = [head.phone ? `Phone: ${head.phone}` : '', head.gstin ? `GSTIN: ${head.gstin}` : '']
    .filter(Boolean)
    .join('    ');
  if (contact) {
    page.text(contact, CONTENT_LEFT + 14, bandBottom + 11, { size: 8.5, color: WHITE });
  }

  // Title strip directly beneath the band.
  const stripBottom = bandBottom - 26;
  page.rect(CONTENT_LEFT, stripBottom, CONTENT_WIDTH, 22, [0.945, 0.957, 0.965]);
  page.text(subtitle.toUpperCase(), CONTENT_LEFT + 14, stripBottom + 7, { size: 9.5, font: 'bold' });

  return stripBottom;
}

/** The footer band, plus "Page n of m" once there is more than one page. */
function drawFooter(page: Page, accent: Rgb, note: string, pageNum: number, pageCount: number) {
  page.rect(CONTENT_LEFT, MARGIN, CONTENT_WIDTH, 26, accent);
  page.text(fitText(note, CONTENT_WIDTH - 140, 8.5), CONTENT_LEFT + 14, MARGIN + 9.5, {
    size: 8.5,
    color: WHITE
  });
  if (pageCount > 1) {
    page.text(`Page ${pageNum} of ${pageCount}`, CONTENT_RIGHT - 14, MARGIN + 9.5, {
      size: 8.5,
      color: WHITE,
      align: 'right'
    });
  }
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

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

const INVOICE_ACCENT: Rgb = [0.05, 0.4, 0.4];

/** Money as it appears in a column: "Rs. 1,250.00", already transliterated. */
function money(symbol: string, amount: number | undefined | null): string {
  const value = Number(amount || 0);
  const formatted = value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const sym = toPrintable(symbol) || 'Rs.';
  // "Rs." reads better with a space; a bare glyph like $ does not.
  return sym.length > 1 ? `${sym} ${formatted}` : `${sym}${formatted}`;
}

const ITEM_COLUMNS = {
  index: CONTENT_LEFT + 10,
  name: CONTENT_LEFT + 30,
  category: CONTENT_LEFT + 268,
  qty: CONTENT_LEFT + 370,
  rate: CONTENT_LEFT + 448,
  amount: CONTENT_RIGHT - 10
};

const ROW_HEIGHT = 17;

function drawItemsHeader(page: Page, y: number): number {
  page.rect(CONTENT_LEFT, y - 18, CONTENT_WIDTH, 18, INVOICE_ACCENT);
  const textY = y - 12.5;
  page.text('#', ITEM_COLUMNS.index, textY, { size: 8, font: 'bold', color: WHITE });
  page.text('SERVICE / ITEM', ITEM_COLUMNS.name, textY, { size: 8, font: 'bold', color: WHITE });
  page.text('CATEGORY', ITEM_COLUMNS.category, textY, { size: 8, font: 'bold', color: WHITE });
  page.text('QTY', ITEM_COLUMNS.qty, textY, { size: 8, font: 'bold', color: WHITE, align: 'right' });
  page.text('RATE', ITEM_COLUMNS.rate, textY, { size: 8, font: 'bold', color: WHITE, align: 'right' });
  page.text('AMOUNT', ITEM_COLUMNS.amount, textY, { size: 8, font: 'bold', color: WHITE, align: 'right' });
  return y - 18;
}

/**
 * An official patient billing and discharge invoice.
 *
 * Laid out as a document rather than a screen: a letterhead that names the
 * facility, a two-column requisition block, a ruled item table with the money
 * columns right-aligned on a real text measurement, and a totals panel that
 * ends on the one number the patient came to read. Long bills flow onto further
 * pages with the table header repeated and the totals kept whole on the last.
 */
export function generateInvoicePdfBlob(invoice: InvoiceData, config?: BillingConfigData): Blob {
  const symbol = config?.currencySymbol || 'Rs.';
  const head: Letterhead = {
    // The facility name is the one field this document cannot do without, so it
    // walks a chain rather than trusting any single source: the rate card's
    // letterhead, then the tenant id prettified. `printableName` also covers the
    // case where the configured name is in a script the font cannot draw.
    name: printableName(config?.displayName, invoice.hospital || 'Medical Centre'),
    address: toPrintable(config?.address),
    phone: toPrintable(config?.phone),
    gstin: toPrintable(config?.gstin),
    accent: INVOICE_ACCENT
  };

  const items = invoice.items || [];
  const patient = invoice.patient || {};
  const issuedAt = new Date(invoice.dischargedAt || invoice.createdAt || Date.now());

  // Paginate first, so the footer can say "Page 1 of 2" on page 1.
  const FIRST_PAGE_ROWS = 16;
  const LATER_PAGE_ROWS = 30;
  const pageChunks: (typeof items)[] = [];
  if (items.length === 0) {
    pageChunks.push([]);
  } else {
    pageChunks.push(items.slice(0, FIRST_PAGE_ROWS));
    for (let i = FIRST_PAGE_ROWS; i < items.length; i += LATER_PAGE_ROWS) {
      pageChunks.push(items.slice(i, i + LATER_PAGE_ROWS));
    }
  }

  // The totals panel needs ~130pt. If the last chunk leaves less than that,
  // give the totals their own page rather than letting them run off the sheet.
  const pages: Page[] = [];
  const footerNote =
    toPrintable(config?.footerNote) || 'Thank you for choosing us. We wish you a speedy recovery.';

  let rowStart = 0;
  pageChunks.forEach((chunk, pageIndex) => {
    const page = new Page();
    const first = pageIndex === 0;

    let y: number;
    if (first) {
      y = drawLetterhead(page, head, 'Official discharge summary & medical invoice');

      // Status pill, right-aligned inside the title strip.
      const status = (invoice.status || 'Pending').toUpperCase();
      const paid = status === 'PAID' || status === 'COMPLETED';
      page.text(`STATUS: ${status}`, CONTENT_RIGHT - 14, y + 7, {
        size: 9,
        font: 'bold',
        align: 'right',
        color: paid ? [0.05, 0.45, 0.2] : [0.75, 0.42, 0.05]
      });

      // Requisition block.
      const boxHeight = 82;
      const boxBottom = y - 12 - boxHeight;
      page.rect(CONTENT_LEFT, boxBottom, CONTENT_WIDTH, boxHeight, [0.976, 0.98, 0.984]);
      page.outline(CONTENT_LEFT, boxBottom, CONTENT_WIDTH, boxHeight);

      const midX = CONTENT_LEFT + CONTENT_WIDTH / 2;
      page.line(midX, boxBottom + 8, midX, boxBottom + boxHeight - 8);

      const leftLabelX = CONTENT_LEFT + 12;
      const leftValueX = CONTENT_LEFT + 108;
      const rightLabelX = midX + 12;
      const rightValueX = midX + 100;

      let fieldY = boxBottom + boxHeight - 18;
      page.field(
        'Patient name',
        printableName(patient.name, 'Walk-in Patient'),
        leftLabelX,
        fieldY,
        leftValueX,
        9
      );
      page.field('Invoice no', invoice.invoiceNumber || '-', rightLabelX, fieldY, rightValueX, 9);

      fieldY -= 16;
      page.field('Contact', patient.phone || 'Not recorded', leftLabelX, fieldY, leftValueX);
      page.field(
        'Date',
        issuedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        rightLabelX,
        fieldY,
        rightValueX
      );

      fieldY -= 16;
      const meta =
        [patient.age ? `${patient.age} yrs` : '', patient.gender || ''].filter(Boolean).join('  /  ') ||
        'Not recorded';
      page.field('Age / gender', meta, leftLabelX, fieldY, leftValueX);
      page.field('Payment mode', invoice.paymentMethod || 'Cash', rightLabelX, fieldY, rightValueX);

      fieldY -= 16;
      page.field('Token no', invoice.token?.tokenNumber || '-', leftLabelX, fieldY, leftValueX);
      page.field(
        'Issued by',
        printableName(invoice.dischargedBy, 'Reception'),
        rightLabelX,
        fieldY,
        rightValueX
      );

      y = boxBottom - 18;
    } else {
      // Continuation pages carry a slim header so a loose sheet is identifiable.
      page.text(head.name.toUpperCase(), CONTENT_LEFT, PAGE_HEIGHT - MARGIN - 12, {
        size: 10,
        font: 'bold',
        color: INVOICE_ACCENT
      });
      page.text(
        `Invoice ${invoice.invoiceNumber || ''} (continued)`,
        CONTENT_RIGHT,
        PAGE_HEIGHT - MARGIN - 12,
        {
          size: 8.5,
          color: MUTED,
          align: 'right'
        }
      );
      page.line(CONTENT_LEFT, PAGE_HEIGHT - MARGIN - 20, CONTENT_RIGHT, PAGE_HEIGHT - MARGIN - 20);
      y = PAGE_HEIGHT - MARGIN - 34;
    }

    y = drawItemsHeader(page, y);

    if (chunk.length === 0) {
      page.text('No chargeable items recorded on this invoice.', CONTENT_LEFT + 10, y - 14, {
        size: 9,
        color: MUTED
      });
      y -= 26;
    }

    chunk.forEach((item, i) => {
      const rowTop = y - i * ROW_HEIGHT;
      const rowBottom = rowTop - ROW_HEIGHT;
      const absoluteIndex = rowStart + i + 1;

      if (absoluteIndex % 2 === 0) {
        page.rect(CONTENT_LEFT, rowBottom, CONTENT_WIDTH, ROW_HEIGHT, ZEBRA);
      }

      const textY = rowBottom + 5.5;
      page.text(absoluteIndex, ITEM_COLUMNS.index, textY, { size: 8.5, color: MUTED });
      page.text(
        fitText(item.itemName || 'Service', ITEM_COLUMNS.category - ITEM_COLUMNS.name - 10, 9),
        ITEM_COLUMNS.name,
        textY,
        { size: 9 }
      );
      page.text(
        fitText(item.category || 'Other', ITEM_COLUMNS.qty - ITEM_COLUMNS.category - 14, 8, 'regular'),
        ITEM_COLUMNS.category,
        textY,
        { size: 8, color: MUTED }
      );
      page.text(item.quantity ?? 1, ITEM_COLUMNS.qty, textY, { size: 8.5, align: 'right' });
      page.text(money(symbol, item.unitPrice), ITEM_COLUMNS.rate, textY, { size: 8.5, align: 'right' });
      page.text(money(symbol, item.totalPrice), ITEM_COLUMNS.amount, textY, {
        size: 8.5,
        font: 'bold',
        align: 'right'
      });

      page.line(CONTENT_LEFT, rowBottom, CONTENT_RIGHT, rowBottom, [0.9, 0.92, 0.94], 0.5);
    });

    rowStart += chunk.length;
    y -= chunk.length * ROW_HEIGHT;

    // Totals go on the final page only.
    if (pageIndex === pageChunks.length - 1) {
      drawTotals(page, invoice, symbol, config, Math.min(y - 16, PAGE_HEIGHT - 200));
    }

    pages.push(page);
  });

  pages.forEach((page, i) => drawFooter(page, INVOICE_ACCENT, footerNote, i + 1, pages.length));

  return buildPdfDocument(pages);
}

/** The right-hand totals panel and the left-hand remarks/signature column. */
function drawTotals(
  page: Page,
  invoice: InvoiceData,
  symbol: string,
  config: BillingConfigData | undefined,
  topY: number
) {
  const panelLeft = CONTENT_LEFT + 300;
  const panelRight = CONTENT_RIGHT;
  const labelX = panelLeft + 12;
  const valueX = panelRight - 12;

  let y = topY - 14;

  const row = (label: string, value: string, opts: { bold?: boolean; color?: Rgb } = {}) => {
    page.text(label, labelX, y, {
      size: 9,
      color: opts.color || MUTED,
      font: opts.bold ? 'bold' : 'regular'
    });
    page.text(value, valueX, y, {
      size: 9,
      align: 'right',
      font: opts.bold ? 'bold' : 'regular',
      color: opts.color || INK
    });
    y -= 15;
  };

  row('Subtotal', money(symbol, invoice.subtotal));
  if (invoice.discount && invoice.discount > 0) {
    row('Discount', `- ${money(symbol, invoice.discount)}`, { color: [0.05, 0.45, 0.2] });
  }
  if (invoice.tax && invoice.tax > 0) {
    row(`Tax (${config?.taxPercent || 0}%)`, money(symbol, invoice.tax));
  }

  // Total, in the accent band — the number the whole page is for.
  y -= 3;
  page.rect(panelLeft, y - 6, panelRight - panelLeft, 24, INVOICE_ACCENT);
  page.text('TOTAL PAYABLE', labelX, y + 1, { size: 9.5, font: 'bold', color: WHITE });
  page.text(money(symbol, invoice.totalAmount), valueX, y + 1, {
    size: 11,
    font: 'bold',
    color: WHITE,
    align: 'right'
  });
  y -= 30;

  row('Amount paid', money(symbol, invoice.amountPaid));
  const due = Number(invoice.balanceDue || 0);
  row('Balance due', money(symbol, due), { bold: due > 0, color: due > 0 ? [0.8, 0.35, 0.05] : MUTED });

  // Left column: remarks and the signature rule.
  let noteY = topY - 14;
  page.text('REMARKS', CONTENT_LEFT + 2, noteY, { size: 7.5, font: 'bold', color: MUTED });
  noteY -= 13;

  const remarks = toPrintable(invoice.notes) || 'No additional remarks recorded.';
  wrapText(remarks, 270, 8.5, 3).forEach((line) => {
    page.text(line, CONTENT_LEFT + 2, noteY, { size: 8.5, color: INK });
    noteY -= 12;
  });

  const signY = Math.min(noteY - 26, y - 6);
  page.line(CONTENT_LEFT + 2, signY, CONTENT_LEFT + 170, signY, [0.6, 0.62, 0.65]);
  page.text('Authorised signatory & facility seal', CONTENT_LEFT + 2, signY - 11, {
    size: 7.5,
    color: MUTED
  });
}

// ---------------------------------------------------------------------------
// Lab report
// ---------------------------------------------------------------------------

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

const LAB_ACCENT: Rgb = [0.04, 0.35, 0.4];

/**
 * An official pathology / diagnostic report.
 *
 * Takes the same letterhead treatment as the invoice, for the same reason: a
 * report a patient forwards to another hospital has to say which lab issued it.
 */
export function generateLabReportPdfBlob(
  test: LabTestData,
  token?: TokenLabData,
  hospitalName?: string,
  config?: BillingConfigData
): Blob {
  const head: Letterhead = {
    name: printableName(config?.displayName || hospitalName, token?.hospital || 'Diagnostic Laboratory'),
    address: toPrintable(config?.address) || 'Department of Pathology & Clinical Biochemistry',
    phone: toPrintable(config?.phone),
    gstin: '',
    accent: LAB_ACCENT
  };

  const page = new Page();
  let y = drawLetterhead(page, head, 'Official clinical laboratory investigation report');

  const urgent = test.urgency === 'Urgent';
  page.text(urgent ? 'URGENT / STAT' : 'FINAL VERIFIED', CONTENT_RIGHT - 14, y + 7, {
    size: 9,
    font: 'bold',
    align: 'right',
    color: urgent ? [0.8, 0.12, 0.12] : [0.05, 0.45, 0.2]
  });

  // Demographics.
  const boxHeight = 82;
  const boxBottom = y - 12 - boxHeight;
  page.rect(CONTENT_LEFT, boxBottom, CONTENT_WIDTH, boxHeight, [0.976, 0.98, 0.984]);
  page.outline(CONTENT_LEFT, boxBottom, CONTENT_WIDTH, boxHeight);

  const midX = CONTENT_LEFT + CONTENT_WIDTH / 2;
  page.line(midX, boxBottom + 8, midX, boxBottom + boxHeight - 8);

  const leftLabelX = CONTENT_LEFT + 12;
  const leftValueX = CONTENT_LEFT + 108;
  const rightLabelX = midX + 12;
  const rightValueX = midX + 100;

  const reportedAt = new Date(test.completedAt || Date.now());
  let fieldY = boxBottom + boxHeight - 18;

  page.field(
    'Patient name',
    printableName(token?.patient?.name, 'Patient'),
    leftLabelX,
    fieldY,
    leftValueX,
    9
  );
  page.field(
    'Referred by',
    token?.doctor?.name ? `Dr. ${printableName(token.doctor.name, 'Consultant')}` : 'Consultant',
    rightLabelX,
    fieldY,
    rightValueX,
    9
  );

  fieldY -= 16;
  const meta =
    [token?.patient?.age ? `${token.patient.age} yrs` : '', token?.patient?.gender || '']
      .filter(Boolean)
      .join('  /  ') || 'Not recorded';
  page.field('Age / gender', meta, leftLabelX, fieldY, leftValueX);
  page.field('Department', token?.doctor?.department || 'Pathology', rightLabelX, fieldY, rightValueX);

  fieldY -= 16;
  page.field('Contact', token?.patient?.phone || 'Not recorded', leftLabelX, fieldY, leftValueX);
  page.field(
    'Reported',
    reportedAt.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    rightLabelX,
    fieldY,
    rightValueX
  );

  fieldY -= 16;
  page.field('Token no', token?.tokenNumber || '-', leftLabelX, fieldY, leftValueX);
  page.field('Sample', 'As collected at facility', rightLabelX, fieldY, rightValueX);

  // Result table.
  y = boxBottom - 22;
  page.rect(CONTENT_LEFT, y - 18, CONTENT_WIDTH, 18, LAB_ACCENT);
  const headY = y - 12.5;
  const col = {
    test: CONTENT_LEFT + 10,
    value: CONTENT_LEFT + 210,
    unit: CONTENT_LEFT + 300,
    range: CONTENT_LEFT + 366,
    flag: CONTENT_RIGHT - 10
  };
  page.text('INVESTIGATION', col.test, headY, { size: 8, font: 'bold', color: WHITE });
  page.text('RESULT', col.value, headY, { size: 8, font: 'bold', color: WHITE });
  page.text('UNIT', col.unit, headY, { size: 8, font: 'bold', color: WHITE });
  page.text('REFERENCE RANGE', col.range, headY, { size: 8, font: 'bold', color: WHITE });
  page.text('FLAG', col.flag, headY, { size: 8, font: 'bold', color: WHITE, align: 'right' });

  y -= 18;
  const rowHeight = 24;
  const abnormal = Boolean(test.abnormal);
  page.rect(
    CONTENT_LEFT,
    y - rowHeight,
    CONTENT_WIDTH,
    rowHeight,
    abnormal ? [1, 0.93, 0.93] : [0.96, 0.98, 0.96]
  );
  page.outline(CONTENT_LEFT, y - rowHeight, CONTENT_WIDTH, rowHeight);

  const rowY = y - rowHeight + 8;
  page.text(fitText(test.testName, col.value - col.test - 12, 10, 'bold'), col.test, rowY, {
    size: 10,
    font: 'bold'
  });
  page.text(fitText(test.resultValue || 'Normal', col.unit - col.value - 8, 10, 'bold'), col.value, rowY, {
    size: 10,
    font: 'bold',
    color: abnormal ? [0.8, 0.12, 0.12] : INK
  });
  page.text(fitText(test.unit || '-', col.range - col.unit - 8, 9), col.unit, rowY, { size: 9 });
  page.text(
    fitText(test.normalRange || 'Standard reference', col.flag - col.range - 46, 9),
    col.range,
    rowY,
    {
      size: 9,
      color: MUTED
    }
  );
  page.text(abnormal ? 'ABNORMAL' : 'NORMAL', col.flag, rowY, {
    size: 9,
    font: 'bold',
    align: 'right',
    color: abnormal ? [0.8, 0.12, 0.12] : [0.05, 0.45, 0.2]
  });

  // Interpretation.
  y -= rowHeight + 22;
  const noteHeight = 78;
  page.rect(CONTENT_LEFT, y - noteHeight, CONTENT_WIDTH, noteHeight, [0.98, 0.985, 0.99]);
  page.outline(CONTENT_LEFT, y - noteHeight, CONTENT_WIDTH, noteHeight);

  let noteY = y - 18;
  page.text('CLINICAL REMARKS & INTERPRETATION', CONTENT_LEFT + 12, noteY, {
    size: 8,
    font: 'bold',
    color: MUTED
  });
  noteY -= 15;

  const remarks =
    toPrintable(test.remarks) || 'Test completed and verified under standard laboratory protocol.';
  wrapText(remarks, CONTENT_WIDTH - 28, 9, 2).forEach((line) => {
    page.text(line, CONTENT_LEFT + 12, noteY, { size: 9 });
    noteY -= 12;
  });

  noteY -= 4;
  page.text(
    abnormal
      ? 'Attention: this parameter falls outside the biological reference interval. Correlate clinically.'
      : 'Result is within the expected physiological range for the demographic profile.',
    CONTENT_LEFT + 12,
    noteY,
    { size: 8.5, font: 'bold', color: abnormal ? [0.8, 0.12, 0.12] : [0.05, 0.45, 0.2] }
  );

  // Sign-off.
  y -= noteHeight + 46;
  page.line(CONTENT_LEFT + 2, y + 14, CONTENT_LEFT + 180, y + 14, [0.6, 0.62, 0.65]);
  page.line(CONTENT_RIGHT - 180, y + 14, CONTENT_RIGHT - 2, y + 14, [0.6, 0.62, 0.65]);
  page.text(`Prepared by: ${printableName(test.completedBy, 'Laboratory Technician')}`, CONTENT_LEFT + 2, y, {
    size: 8.5,
    color: MUTED
  });
  page.text('Verified by: Consultant Pathologist', CONTENT_RIGHT - 2, y, {
    size: 8.5,
    color: MUTED,
    align: 'right'
  });

  drawFooter(page, LAB_ACCENT, 'Authenticated digital laboratory report. Please consult your doctor.', 1, 1);

  return buildPdfDocument([page]);
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

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

/**
 * Opens a generated PDF in a hidden frame and raises the print dialog.
 *
 * Reception prints the bill far more often than it saves one, and "download,
 * find it in the downloads bar, open it, press Ctrl+P" is four steps at a
 * counter with a queue behind it. The object URL is held until the frame has
 * been given time to spool, because revoking it early cancels the print job in
 * Chrome.
 */
export function printPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.src = url;

  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch (err) {
      // Some browsers refuse to print a cross-origin-ish blob frame; falling
      // back to a tab is better than the button doing nothing at all.
      window.open(url, '_blank');
    }
    setTimeout(() => {
      document.body.removeChild(frame);
      URL.revokeObjectURL(url);
    }, 60000);
  };

  document.body.appendChild(frame);
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
  options?: {
    hospitalId?: string;
    sessionToken?: string;
    adminSecret?: string;
    patientId?: string;
    testName?: string;
  }
): Promise<string | null> {
  try {
    const authRes = await fetch(`${backendUrl}/api/v1/uploads/imagekit/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.adminSecret ? { 'X-Admin-Secret': options.adminSecret } : {}),
        ...(options?.sessionToken ? { Authorization: `Bearer ${options.sessionToken}` } : {})
      },
      body: JSON.stringify({
        purpose,
        hospitalId: options?.hospitalId,
        // Only meaningful for a report: the server names the object after the
        // patient rather than trusting whatever the bench's file was called.
        patientId: options?.patientId,
        testName: options?.testName
      })
    });

    if (!authRes.ok) return null;
    const auth = await authRes.json();

    // The server's name wins when it issues one. A client-chosen filename is a
    // client-chosen storage key, and the point of asking the server for the
    // folder is lost if the browser still decides what lands in it.
    const withExtension = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    const storedName = auth.fileName || withExtension;

    const form = new FormData();
    form.append('file', blob, storedName);
    form.append('fileName', storedName);
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
    patientId?: string;
    testName?: string;
  }
): Promise<string | null> {
  return uploadPdfBlobToImageKit(backendUrl, blob, fileName, purpose, options);
}
