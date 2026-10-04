#!/usr/bin/env python3
"""Convert Anas's messy booking sheets into clean ledger + Migration Review JSON."""

from __future__ import annotations

import hashlib
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / "data" / "legacy"
DOWNLOADS = Path.home() / "Downloads"
OUT = ROOT / "src" / "data" / "import-result.json"

FILES = [
    {
        "file": "802 Booking-2026.xlsx",
        "flat": "802-A",
        "sheets": {"May": 5, "June": 6, "July": 7, "Aug": 8, "Sept": 9},
    },
    {
        "file": "408 B block.xlsx",
        "flat": "408-B",
        "sheets": {"July": 7, "Aug": 8, "Sept": 9},
    },
]

RECEIVED_WORDS = re.compile(
    r"\b(wasol|wasool|receive|received|recive|recived|mila|aya|aaya|paid|settled|clear)\b",
    re.I,
)
REMAINING_RE = re.compile(r"\bremain(?:ing|d)?\b", re.I)
SUMMARY_RE = re.compile(
    r"\b(total amount|total expanse|total expense|77643 total|combined)\b",
    re.I,
)
STANDALONE_SUMMARY_RE = re.compile(
    r"^\s*(anas received|total amount|total expanse|total expense|total)\b",
    re.I,
)
TRANSFER_RE = re.compile(
    r"\b(send to|sent to|send capital|money transferred)\b",
    re.I,
)
EMPTY_GUEST_RE = re.compile(r"^\s*(empty)?\s*$", re.I)

EXPENSE_RULES = [
    (re.compile(r"ptcl|internet", re.I), "INTERNET", "PTCL / Internet"),
    (re.compile(r"electric", re.I), "ELECTRICITY", "Electricity"),
    (re.compile(r"\bgas", re.I), "GAS", "Gas"),
    (re.compile(r"watar|water", re.I), "WATER", "Water"),
    (re.compile(r"sofa", re.I), "CLEANING", "Sofa cleaning"),
    (re.compile(r"safyai|safayi|safa[yi]|cleaning", re.I), "CLEANING", "Cleaning"),
    (re.compile(r"plamber|plumber|plumbing", re.I), "PLUMBING", "Plumbing"),
    (re.compile(r"maintenance", re.I), "MAINTENANCE", "Maintenance"),
    (re.compile(r"repair", re.I), "REPAIRS", "Repairs"),
    (re.compile(r"grocery|grocer", re.I), "GROCERIES", "Groceries"),
    (re.compile(r"bedsheet|linen", re.I), "BEDSHEETS_LINEN", "Bedsheets / Linen"),
    (re.compile(r"furniture", re.I), "FURNITURE", "Furniture"),
    (re.compile(r"staff|sikander|sikandar", re.I), "STAFF", "Staff"),
    (re.compile(r"commission", re.I), "COMMISSION", "Commission"),
    (re.compile(r"supply|supplies|sapry|tezab|hand wash|carpanter|dewdrop", re.I), "SUPPLIES", "Supplies"),
]


def slug_id(*parts: object) -> str:
    raw = "|".join("" if p is None else str(p) for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]
    return f"imp_{digest}"


def normalize_name(name: str) -> str:
    cleaned = re.sub(r"[.]+", " ", name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().lower()
    return cleaned


def title_name(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", name).strip()
    return cleaned


MAX_LEDGER_AMOUNT = 9_999_999


def looks_like_phone_amount(amount: int) -> bool:
    digits = str(abs(amount))
    return len(digits) >= 10 or bool(re.fullmatch(r"(?:92)?3\d{9}", digits))


def plausible_amount(amount: int) -> bool:
    return 0 < amount <= MAX_LEDGER_AMOUNT and not looks_like_phone_amount(amount)


def first_amount(text: str) -> int | None:
    if not text:
        return None
    if "*" in text and "=" in text:
        right = text.split("=")[-1]
        return first_amount(right)
    matches = re.findall(r"(\d{1,3}(?:,\d{3})+|\d+)", text.replace(" ", ""))
    if not matches:
        matches = re.findall(r"(\d{1,3}(?:,\d{3})+|\d+)", text)
    for raw in matches:
        amount = int(raw.replace(",", ""))
        if plausible_amount(amount):
            return amount
    return None


def all_amounts(text: str) -> list[int]:
    return [
        amount
        for amount in (int(m.replace(",", "")) for m in re.findall(r"\d{1,3}(?:,\d{3})+|\d{3,}", text))
        if plausible_amount(amount)
    ]


def detect_method(text: str) -> str:
    t = text.lower()
    if re.search(r"easy\s*pis[ae]|easy\s*paisa", t):
        return "EASYPAISA"
    if "jazz" in t:
        return "JAZZCASH"
    if "alfalah" in t or re.search(r"\bbank\b", t):
        return "BANK_TRANSFER"
    if "cash" in t:
        return "CASH"
    return "OTHER"


def parse_nights(text: str) -> int | None:
    if not text:
        return None
    match = re.search(r"(\d+)\s*(?:nights?|nigh|days?|din|raat)", text, re.I)
    if match:
        return int(match.group(1))
    return None


def source_path(filename: str) -> Path:
    download = DOWNLOADS / filename
    local = LEGACY / filename
    if download.exists():
        LEGACY.mkdir(parents=True, exist_ok=True)
        local.write_bytes(download.read_bytes())
        return local
    return local


NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _col_row(cell_ref: str) -> tuple[int, int]:
    col = "".join(ch for ch in cell_ref if ch.isalpha())
    row = int("".join(ch for ch in cell_ref if ch.isdigit()))
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch.upper()) - 64)
    return n, row


def _shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    out: list[str] = []
    for si in root.findall("m:si", NS):
        texts = [t.text or "" for t in si.findall(".//m:t", NS)]
        out.append("".join(texts))
    return out


def _sheet_rows(zf: zipfile.ZipFile, sheet_path: str, strings: list[str]) -> dict[int, list]:
    root = ET.fromstring(zf.read(sheet_path))
    rows: dict[int, dict[int, object]] = {}
    for c in root.findall(".//m:c", NS):
        ref = c.attrib.get("r")
        if not ref:
            continue
        col, row = _col_row(ref)
        kind = c.attrib.get("t")
        v = c.find("m:v", NS)
        inline = c.find("m:is", NS)
        val: object | None = None
        if kind == "s" and v is not None and v.text is not None:
            val = strings[int(v.text)]
        elif kind == "inlineStr" and inline is not None:
            val = "".join((t.text or "") for t in inline.findall(".//m:t", NS))
        elif v is not None and v.text is not None:
            try:
                num = float(v.text)
                val = int(num) if num.is_integer() else num
            except ValueError:
                val = v.text
        rows.setdefault(row, {})[col] = val
    out: dict[int, list] = {}
    for row, cols in rows.items():
        width = max(cols) if cols else 0
        out[row] = [cols.get(i) for i in range(1, max(width, 6) + 1)]
    return out


def iter_workbook(path: Path):
    with zipfile.ZipFile(path) as zf:
        strings = _shared_strings(zf)
        book = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rid_to_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        for sh in book.findall("m:sheets/m:sheet", NS):
            rid = sh.attrib.get(f"{{{REL_NS}}}id")
            target = rid_to_target[rid]
            if not target.startswith("xl/"):
                target = "xl/" + target.lstrip("/")
            yield sh.attrib.get("name"), _sheet_rows(zf, target, strings)


def normalize_date(value, sheet_month: int) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)) and 30000 < float(value) < 80000:
        value = datetime(1899, 12, 30) + timedelta(days=float(value))
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        if value.year in (2626, 2627):
            value = value.replace(year=2026)
        if value.month == sheet_month:
            return value
        if value.day == sheet_month and value.month != sheet_month:
            try:
                return date(value.year if value.year < 2100 else 2026, value.day, value.month)
            except ValueError:
                return None
        if value.year > 2026 and sheet_month:
            try:
                return date(2026, value.month, value.day)
            except ValueError:
                return None
        return value
    text = str(value).strip()
    match = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})$", text)
    if match:
        day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
        if year in (2626, 2627):
            year = 2026
        if year > 2026:
            year = 2026
        try:
            return date(year, month, day)
        except ValueError:
            return None
    return None


def expense_matches(text: str) -> list[tuple[str, str]]:
    seen: list[tuple[str, str]] = []
    found: set[str] = set()
    for pattern, category, label in EXPENSE_RULES:
        if category in found:
            continue
        if pattern.search(text):
            found.add(category)
            seen.append((category, label))
    return seen


def expense_meta(text: str):
    matches = expense_matches(text)
    if len(matches) == 1:
        return matches[0]
    return None


def is_header(row) -> bool:
    joined = " ".join(str(c or "") for c in row).lower()
    return "check-in" in joined or "check-inn" in joined


def classify_payment(text: str) -> tuple[str, str]:
    """Return (kind, confidence) where kind is received|pending|review."""
    if not text.strip():
        return "missing", "review"
    if SUMMARY_RE.search(text) or text.lower().startswith("total"):
        return "summary", "review"
    if REMAINING_RE.search(text):
        return "pending", "review"
    if "+" in text and text.count("+") >= 2:
        return "expression", "review"
    if RECEIVED_WORDS.search(text) or re.search(
        r"\b(cash|easypisa|easypaisa|alfalah|bank|anas)\b", text, re.I
    ):
        return "received", "confirmed"
    if first_amount(text):
        return "received", "confirmed"
    return "unknown", "review"


def main() -> None:
    flats = [
        {"id": "flat_802-A", "name": "802-A", "sortOrder": 1},
        {"id": "flat_408-B", "name": "408-B", "sortOrder": 2},
        {"id": "flat_204-D", "name": "204-D", "sortOrder": 3},
        {"id": "flat_204-C", "name": "204-C", "sortOrder": 4},
        {"id": "flat_811-D", "name": "811-D", "sortOrder": 5},
        {"id": "flat_815-B", "name": "815-B", "sortOrder": 6},
    ]

    clients: dict[str, dict] = {}
    stays = []
    rent_entries = []
    payments = []
    expenses = []
    reviews = []
    stats = {
        "rows802": 0,
        "rows408": 0,
        "imported": 0,
        "reviews": 0,
        "expenses": 0,
        "pending": 0,
        "stays": 0,
        "payments": 0,
    }

    def client_for(name: str) -> dict:
        key = normalize_name(name)
        if key not in clients:
            cid = slug_id("client", key)
            clients[key] = {
                "id": cid,
                "name": title_name(name),
                "phone": None,
                "phoneMissing": True,
                "createdAt": "2026-04-01T00:00:00.000Z",
            }
        return clients[key]

    def add_review(item: dict) -> None:
        item["id"] = slug_id(
            "rev",
            item.get("sourceFile"),
            item.get("sourceSheet"),
            item.get("sourceRow"),
            item.get("proposedType"),
            item.get("reason"),
            item.get("sourceText"),
        )
        item.setdefault("status", "NEEDS_REVIEW")
        item.setdefault("month", item.get("sourceSheet"))
        item.setdefault("importedAt", datetime.utcnow().isoformat() + "Z")
        reviews.append(item)
        stats["reviews"] += 1

    for spec in FILES:
        path = source_path(spec["file"])
        sheets = {name: rows for name, rows in iter_workbook(path)}
        for sheet_name, month in spec["sheets"].items():
            if sheet_name not in sheets:
                continue
            ws_rows = sheets[sheet_name]
            for row_idx in sorted(ws_rows):
                row = ws_rows[row_idx]
                cells = [("" if c is None else c) for c in list(row)[:6]]
                if all(str(c).strip() == "" for c in cells):
                    continue
                if is_header(cells):
                    continue
                if spec["flat"] == "802-A":
                    stats["rows802"] += 1
                else:
                    stats["rows408"] += 1

                check_in_raw, check_out_raw, stay_raw, guest_raw, payment_raw, service_raw = cells
                guest = title_name(str(guest_raw))
                payment = str(payment_raw).strip()
                service = str(service_raw).strip()
                def cell_label(value: object) -> str:
                    parsed = normalize_date(value, month)
                    if parsed and isinstance(value, (int, float)):
                        return parsed.isoformat()
                    return str(value).strip()

                source = {
                    "sourceFile": spec["file"],
                    "sourceSheet": sheet_name,
                    "sourceRow": row_idx,
                    "flat": spec["flat"],
                    "sourceText": " | ".join(cell_label(c) for c in cells if str(c).strip()),
                }
                check_in = normalize_date(check_in_raw, month)
                check_out = normalize_date(check_out_raw, month)
                nights = parse_nights(str(stay_raw))
                if check_in and nights and not check_out:
                    check_out = check_in + timedelta(days=nights)
                if check_in and check_out and check_out.year > 2026:
                    check_out = check_out.replace(year=2026)
                if check_in and check_out and check_out < check_in and nights:
                    check_out = check_in + timedelta(days=nights)

                guest_empty = not guest or bool(EMPTY_GUEST_RE.match(guest))
                # Summary / transfer-only rows — only when the row itself is a total, not a stay.
                if (guest_empty and (SUMMARY_RE.search(payment) or SUMMARY_RE.search(service))) or STANDALONE_SUMMARY_RE.match(guest) or STANDALONE_SUMMARY_RE.match(payment):
                    add_review({
                        **source,
                        "date": check_in.isoformat() if check_in else None,
                        "customer": guest or None,
                        "proposedType": "SUMMARY",
                        "amount": first_amount(payment) or first_amount(service),
                        "reason": "Looks like a summary or total row. Not imported as a transaction.",
                    })
                    continue
                if guest_empty and (TRANSFER_RE.search(guest) or TRANSFER_RE.search(payment) or TRANSFER_RE.search(service)):
                    add_review({
                        **source,
                        "date": check_in.isoformat() if check_in else None,
                        "customer": guest or None,
                        "proposedType": "TRANSFER",
                        "amount": first_amount(payment) or first_amount(service),
                        "reason": "Looks like money sent/transferred, not a new stay or expense.",
                    })
                    continue

                # Service-only expense rows (empty guest or Empty)
                if guest_empty and not payment and service:
                    meta = expense_meta(service)
                    amount = first_amount(service)
                    if meta and amount and "+" not in service and "=" not in service:
                        category, label = meta
                        eid = slug_id("exp", spec["file"], sheet_name, row_idx, amount)
                        expenses.append({
                            "id": eid,
                            "flatId": f"flat_{spec['flat']}",
                            "amount": amount,
                            "category": category,
                            "description": label,
                            "spentAt": (check_in or date(2026, month, 1)).isoformat(),
                            "method": "OTHER",
                            "legacy": source,
                            "importKey": eid,
                        })
                        stats["expenses"] += 1
                        stats["imported"] += 1
                    else:
                        add_review({
                            **source,
                            "date": check_in.isoformat() if check_in else None,
                            "customer": None,
                            "proposedType": "EXPENSE",
                            "amount": amount,
                            "reason": "Service text is unclear or combined. Confirm before counting.",
                        })
                    continue

                # Guest stay
                if not guest_empty:
                    amount = first_amount(payment)
                    pay_kind, confidence = classify_payment(payment)
                    if not check_in:
                        add_review({
                            **source,
                            "date": None,
                            "customer": guest,
                            "proposedType": "STAY",
                            "amount": amount,
                            "reason": "Stay date is missing or unreadable.",
                        })
                    elif pay_kind in {"missing", "expression", "unknown", "summary"} or not amount:
                        add_review({
                            **source,
                            "date": check_in.isoformat(),
                            "customer": guest,
                            "proposedType": "STAY",
                            "amount": amount,
                            "reason": "Stay payment is missing, combined, or unclear.",
                        })
                    elif pay_kind == "pending":
                        client = client_for(guest)
                        stay_id = slug_id("stay", spec["file"], sheet_name, row_idx, guest)
                        stays.append({
                            "id": stay_id,
                            "flatId": f"flat_{spec['flat']}",
                            "clientId": client["id"],
                            "checkIn": check_in.isoformat(),
                            "checkOut": (check_out or check_in + timedelta(days=nights or 1)).isoformat(),
                            "nights": nights or ((check_out - check_in).days if check_out else 1) or 1,
                            "revenue": amount,
                            "notifyEnabled": False,
                            "activePending": False,
                            "importKey": stay_id,
                            "legacy": source,
                        })
                        rent_id = slug_id("rent", stay_id)
                        rent_entries.append({
                            "id": rent_id,
                            "stayId": stay_id,
                            "clientId": client["id"],
                            "flatId": f"flat_{spec['flat']}",
                            "amount": amount,
                            "occurredAt": check_in.isoformat(),
                            "importKey": rent_id,
                        })
                        stats["stays"] += 1
                        stats["imported"] += 1
                        stats["pending"] += 1
                        add_review({
                            **source,
                            "date": check_in.isoformat(),
                            "customer": guest,
                            "proposedType": "PENDING_BALANCE",
                            "amount": amount,
                            "stayId": stay_id,
                            "reason": "Sheet says remaining. Confirm whether this is still unpaid.",
                        })
                    else:
                        client = client_for(guest)
                        stay_id = slug_id("stay", spec["file"], sheet_name, row_idx, guest)
                        stays.append({
                            "id": stay_id,
                            "flatId": f"flat_{spec['flat']}",
                            "clientId": client["id"],
                            "checkIn": check_in.isoformat(),
                            "checkOut": (check_out or check_in + timedelta(days=nights or 1)).isoformat(),
                            "nights": nights or ((check_out - check_in).days if check_out else 1) or 1,
                            "revenue": amount,
                            "notifyEnabled": False,
                            "activePending": False,
                            "importKey": stay_id,
                            "legacy": source,
                        })
                        rent_id = slug_id("rent", stay_id)
                        rent_entries.append({
                            "id": rent_id,
                            "stayId": stay_id,
                            "clientId": client["id"],
                            "flatId": f"flat_{spec['flat']}",
                            "amount": amount,
                            "occurredAt": check_in.isoformat(),
                            "importKey": rent_id,
                        })
                        pay_id = slug_id("pay", stay_id, amount)
                        payments.append({
                            "id": pay_id,
                            "stayId": stay_id,
                            "clientId": client["id"],
                            "flatId": f"flat_{spec['flat']}",
                            "amount": amount,
                            "method": detect_method(payment),
                            "receivedAt": check_in.isoformat(),
                            "importKey": pay_id,
                            "notes": payment,
                        })
                        stats["stays"] += 1
                        stats["payments"] += 1
                        stats["imported"] += 2

                    if service:
                        meta = expense_meta(service)
                        amount_e = first_amount(service)
                        if TRANSFER_RE.search(service):
                            add_review({
                                **source,
                                "date": check_in.isoformat() if check_in else None,
                                "customer": guest or None,
                                "proposedType": "TRANSFER",
                                "amount": amount_e,
                                "reason": "Looks like money sent/transferred, not a new stay or expense.",
                            })
                        elif re.search(r"room rent", service, re.I) or SUMMARY_RE.search(service) or "=" in service or "+" in service or len(expense_matches(service)) > 1:
                            add_review({
                                **source,
                                "date": check_in.isoformat() if check_in else None,
                                "customer": guest or None,
                                "proposedType": "EXPENSE",
                                "amount": amount_e,
                                "reason": "Service cell looks like a total or mixed amounts.",
                            })
                        elif meta and amount_e:
                            category, label = meta
                            eid = slug_id("exp", spec["file"], sheet_name, row_idx, service)
                            expenses.append({
                                "id": eid,
                                "flatId": f"flat_{spec['flat']}",
                                "amount": amount_e,
                                "category": category,
                                "description": label,
                                "spentAt": (check_in or date(2026, month, 1)).isoformat(),
                                "method": "OTHER",
                                "legacy": source,
                                "importKey": eid,
                            })
                            stats["expenses"] += 1
                            stats["imported"] += 1
                        elif service:
                            add_review({
                                **source,
                                "date": check_in.isoformat() if check_in else None,
                                "customer": guest or None,
                                "proposedType": "EXPENSE",
                                "amount": amount_e,
                                "reason": "Service text is not a clear expense.",
                            })
                    continue

                add_review({
                    **source,
                    "date": check_in.isoformat() if check_in else None,
                    "customer": guest or None,
                    "proposedType": "UNKNOWN",
                    "amount": first_amount(payment) or first_amount(service),
                    "reason": "Row does not clearly describe a stay or expense.",
                })

    payload = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "flats": flats,
        "clients": list(clients.values()),
        "stays": stays,
        "rentEntries": rent_entries,
        "payments": payments,
        "expenses": expenses,
        "discounts": [],
        "security": [],
        "withdrawals": [],
        "reviews": reviews,
        "stats": stats,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(json.dumps(stats, indent=2))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
