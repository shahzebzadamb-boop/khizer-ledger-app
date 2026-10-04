import { isBrowser } from "@/lib/utils";
import { normalizePhone } from "@/lib/phone";

type ContactProperty = "name" | "tel" | "email" | "address" | "icon";

type ContactInfo = {
  name?: string[];
  tel?: string[];
};

type ContactsManager = {
  getProperties?: () => Promise<ContactProperty[]>;
  select: (properties: ContactProperty[], options?: { multiple?: boolean }) => Promise<ContactInfo[]>;
};

export type PickedContact = {
  name: string;
  phones: string[];
};

export type ContactPickResult =
  | { status: "ok"; contact: PickedContact }
  | { status: "cancelled" }
  | { status: "error" };

function contactsManager(): ContactsManager | null {
  if (!isBrowser() || !("contacts" in navigator)) return null;
  const contacts = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  if (!contacts || typeof contacts.select !== "function") return null;
  return contacts;
}

export function contactsPickerSupported(): boolean {
  return Boolean(contactsManager());
}

export function isLikelyIosDevice(): boolean {
  if (!isBrowser()) return false;
  const ua = navigator.userAgent;
  if (/iP(hone|ad|od)/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function cleanContactName(value: string | null | undefined): string {
  const name = (value ?? "").trim();
  if (!name || /^(undefined|null)$/i.test(name)) return "";
  return name;
}

export function uniqueContactPhones(raw: string[]): string[] {
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const item of raw) {
    const normalized = normalizePhone(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    phones.push(item.trim());
  }
  return phones;
}

function firstName(contact: ContactInfo): string {
  const parts = (contact.name ?? []).map((part) => cleanContactName(part)).filter(Boolean);
  return parts.join(" ");
}

// If full iPhone contact picker access is required in the future,
// a native iOS/Capacitor wrapper may be required. Do not migrate now.
export async function pickContact(): Promise<ContactPickResult> {
  const contacts = contactsManager();
  if (!contacts) return { status: "error" };
  try {
    let properties: ContactProperty[] = ["name", "tel"];
    if (typeof contacts.getProperties === "function") {
      const available = await contacts.getProperties();
      properties = properties.filter((item) => available.includes(item));
      if (properties.length === 0) return { status: "error" };
    }
    const selected = await contacts.select(properties, { multiple: false });
    const contact = selected?.[0];
    if (!contact) return { status: "cancelled" };
    const name = firstName(contact);
    const phones = uniqueContactPhones(contact.tel ?? []);
    if (!name && phones.length === 0) return { status: "cancelled" };
    return { status: "ok", contact: { name, phones } };
  } catch (error) {
    if (error instanceof DOMException && (error.name === "AbortError" || error.name === "InvalidStateError")) {
      return { status: "cancelled" };
    }
    return { status: "error" };
  }
}
