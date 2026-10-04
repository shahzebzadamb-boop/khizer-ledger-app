import { LETTERHEAD_SRC, RECEIPT_CONFIRMATION, RECEIPT_THANK_YOU, receiptPdfFileName, type ReceiptView } from "@/lib/receipts";
import { formatPKR } from "@/lib/money";

const LETTERHEAD_PX_W = 792;
const LETTERHEAD_PX_H = 1024;
const PAGE_W = 595;
const PAGE_H = 842;
const SCALE = PAGE_W / LETTERHEAD_PX_W;
const IMG_H = LETTERHEAD_PX_H * SCALE;

/** Map letterhead pixels (origin top-left) to PDF points (origin bottom-left), image fitted to A4 width at top. */
function fromLetterhead(px: number, py: number): { x: number; y: number } {
  return { x: px * SCALE, y: PAGE_H - py * SCALE };
}

const CONTENT_LEFT = fromLetterhead(52, 0).x;
const CONTENT_RIGHT = fromLetterhead(740, 0).x;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const DATE_LINE = fromLetterhead(0, 296);
const BODY_TOP = fromLetterhead(0, 338).y;
const BODY_BOTTOM = fromLetterhead(0, 908).y;

function escapePdf(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function ascii(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, (char) => {
    if (char === "–" || char === "—" || char === "−") return "-";
    if (char === "’" || char === "‘") return "'";
    if (char === "“" || char === "”") return '"';
    if (char === "\u00a0") return " ";
    return " ";
  });
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function textWidth(text: string, size: number, bold = false): number {
  return text.length * size * (bold ? 0.52 : 0.48);
}

function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(next, size, bold) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

type PdfFont = "F1" | "F2";
type DrawOp =
  | { kind: "text"; x: number; y: number; size: number; font: PdfFont; text: string }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; width: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "image"; x: number; y: number; width: number; height: number };

function opStream(ops: DrawOp[]): string {
  return ops
    .map((op) => {
      if (op.kind === "text") {
        return `BT /${op.font} ${op.size} Tf ${op.x.toFixed(2)} ${op.y.toFixed(2)} Td (${escapePdf(ascii(op.text))}) Tj ET`;
      }
      if (op.kind === "line") {
        return `0 0 0 RG ${op.width} w ${op.x1.toFixed(2)} ${op.y1.toFixed(2)} m ${op.x2.toFixed(2)} ${op.y2.toFixed(2)} l S`;
      }
      if (op.kind === "rect") {
        return `1 1 1 rg ${op.x.toFixed(2)} ${op.y.toFixed(2)} ${op.w.toFixed(2)} ${op.h.toFixed(2)} re f 0 0 0 rg`;
      }
      return `q ${op.width.toFixed(2)} 0 0 ${op.height.toFixed(2)} ${op.x.toFixed(2)} ${op.y.toFixed(2)} cm /Im1 Do Q`;
    })
    .join("\n");
}

function addCentered(ops: DrawOp[], y: number, size: number, font: PdfFont, text: string) {
  const x = CONTENT_LEFT + (CONTENT_WIDTH - textWidth(text, size, font === "F2")) / 2;
  ops.push({ kind: "text", x, y, size, font, text });
}

function addRow(ops: DrawOp[], y: number, label: string, value: string, emphasize = false): number {
  const font: PdfFont = emphasize ? "F2" : "F1";
  const size = emphasize ? 11 : 10;
  const labelW = textWidth(label, 10, false);
  const gap = 16;
  const valueMax = Math.max(80, CONTENT_WIDTH - labelW - gap);
  const lines = wrapText(value, size, valueMax, emphasize);
  ops.push({ kind: "text", x: CONTENT_LEFT, y, size: 10, font: "F1", text: label });
  lines.forEach((line, index) => {
    ops.push({
      kind: "text",
      x: CONTENT_RIGHT - textWidth(line, size, emphasize),
      y: y - index * (size + 3),
      size,
      font,
      text: line,
    });
  });
  return y - (lines.length - 1) * (size + 3);
}

export function letterheadContentBounds() {
  return { left: CONTENT_LEFT, right: CONTENT_RIGHT, top: BODY_TOP, bottom: BODY_BOTTOM, date: DATE_LINE };
}

export function buildReceiptPdf(view: ReceiptView, letterheadJpeg?: Uint8Array | null): Blob {
  const ops: DrawOp[] = [];
  const jpeg = letterheadJpeg && jpegSize(letterheadJpeg) ? letterheadJpeg : null;
  const jpegMeta = jpeg ? jpegSize(jpeg) : null;

  if (jpeg && jpegMeta) {
    ops.push({
      kind: "image",
      x: 0,
      y: PAGE_H - IMG_H,
      width: PAGE_W,
      height: IMG_H,
    });
  }

  let cursor = BODY_TOP;
  addCentered(ops, cursor, 13, "F2", "PAYMENT RECEIPT");
  if (view.receipt.status === "VOID") {
    cursor -= 16;
    addCentered(ops, cursor, 10, "F2", "VOID");
  }

  cursor -= 28;
  const meta: Array<[string, string]> = [
    ["Receipt No.", view.receipt.receiptNumber],
    ["Client", view.clientName],
    ["Flat", view.flat],
    ["Check-in", view.checkInLabel],
    ["Check-out", view.checkOutLabel],
    ["Stay", `${view.nights} Night${view.nights === 1 ? "" : "s"}`],
  ];
  for (const [label, value] of meta) {
    cursor = addRow(ops, cursor, label, value) - 15;
  }

  cursor -= 6;
  ops.push({ kind: "line", x1: CONTENT_LEFT, y1: cursor, x2: CONTENT_RIGHT, y2: cursor, width: 0.4 });
  cursor -= 20;
  cursor = addRow(ops, cursor, "Total Stay Amount", formatPKR(view.totalStayAmount)) - 16;
  cursor = addRow(ops, cursor, "Amount Received", formatPKR(view.amountReceived), true) - 16;
  cursor = addRow(ops, cursor, "Total Received To Date", formatPKR(view.totalReceivedToDate)) - 16;
  if (view.paidInFull) {
    cursor = addRow(ops, cursor, "Balance", "PAID IN FULL", true) - 16;
  } else {
    cursor = addRow(ops, cursor, "Remaining Balance", formatPKR(view.remaining)) - 16;
  }

  cursor -= 6;
  ops.push({ kind: "line", x1: CONTENT_LEFT, y1: cursor, x2: CONTENT_RIGHT, y2: cursor, width: 0.4 });
  cursor -= 20;
  cursor = addRow(ops, cursor, "Payment Method", view.paymentMethod) - 15;
  cursor = addRow(ops, cursor, "Received By", view.receivedBy) - 22;

  for (const line of wrapText(RECEIPT_CONFIRMATION, 9.5, CONTENT_WIDTH)) {
    if (cursor < BODY_BOTTOM + 28) break;
    ops.push({ kind: "text", x: CONTENT_LEFT, y: cursor, size: 9.5, font: "F1", text: line });
    cursor -= 13;
  }
  cursor -= 8;
  for (const line of wrapText(RECEIPT_THANK_YOU, 9.5, CONTENT_WIDTH)) {
    if (cursor < BODY_BOTTOM + 12) break;
    ops.push({ kind: "text", x: CONTENT_LEFT, y: cursor, size: 9.5, font: "F1", text: line });
    cursor -= 13;
  }

  const content = opStream(ops);
  const contentBytes = encode(content);
  const parts: Uint8Array[] = [encode("%PDF-1.4\n")];
  const offsets = [0];
  let offset = 9;
  const addObject = (bytes: Uint8Array) => {
    offsets.push(offset);
    parts.push(bytes);
    offset += bytes.length;
    parts.push(encode("\n"));
    offset += 1;
  };

  addObject(encode("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj"));
  addObject(encode("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj"));
  const resources = jpeg
    ? "/Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Im1 7 0 R >>"
    : "/Font << /F1 5 0 R /F2 6 0 R >>";
  addObject(
    encode(
      `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 4 0 R /Resources << ${resources} >> >> endobj`,
    ),
  );
  addObject(concat([encode(`4 0 obj << /Length ${contentBytes.length} >> stream\n`), contentBytes, encode("\nendstream endobj")]));
  addObject(encode("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj"));
  addObject(encode("6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj"));
  if (jpeg && jpegMeta) {
    addObject(
      concat([
        encode(
          `7 0 obj << /Type /XObject /Subtype /Image /Width ${jpegMeta.width} /Height ${jpegMeta.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >> stream\n`,
        ),
        jpeg,
        encode("\nendstream endobj"),
      ]),
    );
  }

  const startxref = offset;
  const objectCount = offsets.length;
  const xref = offsets
    .slice(1)
    .map((value) => `${String(value).padStart(10, "0")} 00000 n `)
    .join("\n");
  parts.push(
    encode(`xref\n0 ${objectCount}\n0000000000 65535 f \n${xref}\ntrailer << /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`),
  );
  const bytes = concat(parts);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/pdf" });
}

let cachedLetterhead: Uint8Array | null | undefined;

export async function loadLetterheadJpeg(): Promise<Uint8Array | null> {
  if (cachedLetterhead !== undefined) return cachedLetterhead;
  if (typeof fetch !== "function") {
    cachedLetterhead = null;
    return null;
  }
  try {
    const response = await fetch(LETTERHEAD_SRC, { cache: "force-cache" });
    if (!response.ok) {
      cachedLetterhead = null;
      return null;
    }
    cachedLetterhead = new Uint8Array(await response.arrayBuffer());
    return cachedLetterhead;
  } catch {
    cachedLetterhead = null;
    return null;
  }
}

export async function buildReceiptPdfFile(view: ReceiptView): Promise<File> {
  const letterhead = await loadLetterheadJpeg();
  const blob = buildReceiptPdf(view, letterhead);
  return new File([blob], receiptPdfFileName(view.receipt.receiptNumber), { type: "application/pdf" });
}
