import { buildReceiptPdfFile } from "@/lib/receipt-pdf";
import { buildReceiptWhatsAppMessage, receiptWhatsAppHref } from "@/lib/reminders";
import type { ReceiptView } from "@/lib/receipts";

type ShareNav = Navigator & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

export function canShareReceiptFile(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as ShareNav;
  try {
    return typeof nav.canShare === "function" && nav.canShare({ files: [file] }) && typeof nav.share === "function";
  } catch {
    return false;
  }
}

export function downloadBlob(file: Blob, name: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function shareOrFallbackReceipt(opts: {
  view: ReceiptView;
  phone?: string | null;
}): Promise<"shared" | "fallback" | "cancelled"> {
  const file = await buildReceiptPdfFile(opts.view);
  const text = buildReceiptWhatsAppMessage({ clientName: opts.view.clientName });
  const nav = navigator as ShareNav;
  if (canShareReceiptFile(file) && nav.share) {
    try {
      await nav.share({ files: [file], text, title: "Payment receipt" });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  downloadBlob(file, file.name);
  const href = receiptWhatsAppHref({ phone: opts.phone, clientName: opts.view.clientName });
  if (href) window.open(href, "_blank", "noopener,noreferrer");
  return "fallback";
}
