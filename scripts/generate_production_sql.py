#!/usr/bin/env python3
"""Build sql/anas-ledger-production.sql from the already-generated import JSON."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "data" / "import-result.json"
OUT = ROOT / "sql" / "anas-ledger-production.sql"

MONTHS = {
    "May": "May 2026",
    "June": "June 2026",
    "July": "July 2026",
    "Aug": "August 2026",
    "Sept": "September 2026",
}


def sql_str(value: object) -> str:
    if value is None:
        return "NULL"
    text = str(value)
    text = text.replace("\\", "\\\\").replace("'", "''")
    return f"'{text}'"


def sql_int(value: object) -> str:
    if value is None:
        return "NULL"
    return str(int(value))


def sql_dt(value: object) -> str:
    if not value:
        return "NULL"
    text = str(value)
    if "T" in text:
        text = text.replace("T", " ").replace("Z", "")
        if "." not in text:
            text += ".000"
        return sql_str(text)
    return sql_str(f"{text} 00:00:00.000")


def sql_bool(value: bool) -> str:
    return "1" if value else "0"


def is_spreadsheet_summary(text: object) -> bool:
    if not text:
        return False
    trimmed = str(text).strip()
    return trimmed.lower().startswith("total amount") or trimmed.lower().startswith("anas received |")


def month_label(sheet: str, date: str | None) -> str:
    if date:
        try:
            parsed = datetime.fromisoformat(date)
            return parsed.strftime("%B %Y")
        except ValueError:
            pass
    return MONTHS.get(sheet, sheet)


def default_interpretation(item: dict) -> str:
    kind = item.get("proposedType")
    amount = item.get("amount")
    if kind == "PENDING_BALANCE":
        if amount:
            return f"Open balance Rs {amount:,}. Reminders off until you confirm still pending.".replace(",", ",")
        return "Sheet says remaining. Reminders off until you confirm still pending."
    if kind == "EXPENSE":
        return "Possible expense. Confirm before counting."
    if kind == "SUMMARY":
        return "Spreadsheet total — not counted."
    if kind == "TRANSFER":
        return "Money sent/transferred — not rent or expense."
    if kind == "STAY":
        return "Stay needs a clearer date or payment."
    return str(item.get("reason") or "")


def main() -> None:
    imported = json.loads(SRC.read_text())
    generated_at = imported.get("generatedAt") or datetime.utcnow().isoformat() + "Z"
    flats = imported["flats"]
    clients = imported["clients"]
    stays = imported["stays"]
    rent_entries = imported["rentEntries"]
    payments = [item for item in imported["payments"] if not is_spreadsheet_summary(item.get("notes"))]
    expenses = [item for item in imported["expenses"] if not is_spreadsheet_summary(item.get("description"))]
    reviews = imported["reviews"]

    lines: list[str] = []
    add = lines.append

    add("-- KHIZER LEDGER production schema + historical seed")
    add("-- phpMyAdmin-ready. Import into an empty Hostinger MySQL database.")
    add("-- Safe, deterministic, utf8mb4 / InnoDB. Integer PKR only.")
    add("-- Do not store credentials in this file.")
    add("-- Historical pending stays stay quiet (activePending=0) until Migration Review confirms.")
    add("")
    add("SET NAMES utf8mb4;")
    add("SET time_zone = '+00:00';")
    add("SET FOREIGN_KEY_CHECKS = 0;")
    add("")

    tables = [
        "reminder_silences",
        "notifications",
        "notification_cycles",
        "audit_logs",
        "activity_logs",
        "migration_records",
        "withdrawals",
        "discounts",
        "security_transactions",
        "expenses",
        "payments",
        "business_entries",
        "stays",
        "clients",
        "flats",
        "app_settings",
        "users",
    ]
    for table in tables:
        add(f"DROP TABLE IF EXISTS `{table}`;")
    add("")

    add("""CREATE TABLE users (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  name VARCHAR(191) NOT NULL,
  role VARCHAR(191) NOT NULL DEFAULT 'owner',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE app_settings (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  settingKey VARCHAR(191) NOT NULL,
  settingValue TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY app_settings_settingKey (settingKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE flats (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  name VARCHAR(191) NOT NULL,
  sortOrder INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY flats_name_key (name),
  KEY flats_sortOrder_idx (sortOrder)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE clients (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  name VARCHAR(191) NOT NULL,
  phone VARCHAR(191) NULL,
  phoneNormalized VARCHAR(191) NULL,
  phoneMissing TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY clients_phoneNormalized_key (phoneNormalized),
  KEY clients_name_idx (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE stays (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  flatId VARCHAR(191) NOT NULL,
  clientId VARCHAR(191) NOT NULL,
  checkIn DATETIME(3) NOT NULL,
  checkOut DATETIME(3) NOT NULL,
  nights INT NOT NULL,
  notifyEnabled TINYINT(1) NOT NULL DEFAULT 0,
  activePending TINYINT(1) NOT NULL DEFAULT 0,
  importKey VARCHAR(191) NULL,
  legacyNote TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY stays_importKey_key (importKey),
  KEY stays_flatId_idx (flatId),
  KEY stays_clientId_idx (clientId),
  KEY stays_checkIn_idx (checkIn),
  KEY stays_activePending_idx (activePending),
  CONSTRAINT stays_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id),
  CONSTRAINT stays_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE business_entries (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  stayId VARCHAR(191) NOT NULL,
  clientId VARCHAR(191) NOT NULL,
  flatId VARCHAR(191) NOT NULL,
  amount INT NOT NULL,
  occurredAt DATETIME(3) NOT NULL,
  importKey VARCHAR(191) NULL,
  note TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY business_entries_importKey_key (importKey),
  KEY business_entries_stayId_idx (stayId),
  KEY business_entries_flatId_idx (flatId),
  KEY business_entries_occurredAt_idx (occurredAt),
  KEY business_entries_flat_occurred_idx (flatId, occurredAt),
  CONSTRAINT business_entries_stayId_fkey FOREIGN KEY (stayId) REFERENCES stays(id) ON DELETE CASCADE,
  CONSTRAINT business_entries_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id),
  CONSTRAINT business_entries_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE payments (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  stayId VARCHAR(191) NULL,
  clientId VARCHAR(191) NOT NULL,
  flatId VARCHAR(191) NULL,
  amount INT NOT NULL,
  method ENUM('CASH','EASYPAISA','BANK_TRANSFER','JAZZCASH','OTHER') NOT NULL,
  receivedAt DATETIME(3) NOT NULL,
  notes TEXT NULL,
  importKey VARCHAR(191) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY payments_importKey_key (importKey),
  KEY payments_clientId_idx (clientId),
  KEY payments_stayId_idx (stayId),
  KEY payments_flatId_idx (flatId),
  KEY payments_receivedAt_idx (receivedAt),
  KEY payments_flat_received_idx (flatId, receivedAt),
  CONSTRAINT payments_stayId_fkey FOREIGN KEY (stayId) REFERENCES stays(id) ON DELETE SET NULL,
  CONSTRAINT payments_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id),
  CONSTRAINT payments_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE expenses (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  flatId VARCHAR(191) NULL,
  amount INT NOT NULL,
  category ENUM('CLEANING','GROCERIES','ELECTRICITY','GAS','INTERNET','MAINTENANCE','PLUMBING','REPAIRS','FURNITURE','BEDSHEETS_LINEN','SUPPLIES','STAFF','COMMISSION','WATER','OTHER') NOT NULL,
  description VARCHAR(191) NOT NULL,
  method ENUM('CASH','EASYPAISA','BANK_TRANSFER','JAZZCASH','OTHER') NOT NULL,
  spentAt DATETIME(3) NOT NULL,
  notes TEXT NULL,
  importKey VARCHAR(191) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY expenses_importKey_key (importKey),
  KEY expenses_spentAt_idx (spentAt),
  KEY expenses_flatId_idx (flatId),
  KEY expenses_flat_spent_idx (flatId, spentAt),
  CONSTRAINT expenses_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE security_transactions (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  clientId VARCHAR(191) NOT NULL,
  stayId VARCHAR(191) NULL,
  flatId VARCHAR(191) NULL,
  kind ENUM('RECEIVED','ADJUSTED_TO_RENT') NOT NULL,
  amount INT NOT NULL,
  occurredAt DATETIME(3) NOT NULL,
  notes TEXT NULL,
  PRIMARY KEY (id),
  KEY security_clientId_idx (clientId),
  KEY security_occurredAt_idx (occurredAt),
  CONSTRAINT security_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id),
  CONSTRAINT security_stayId_fkey FOREIGN KEY (stayId) REFERENCES stays(id) ON DELETE SET NULL,
  CONSTRAINT security_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE discounts (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  stayId VARCHAR(191) NOT NULL,
  clientId VARCHAR(191) NOT NULL,
  flatId VARCHAR(191) NOT NULL,
  amount INT NOT NULL,
  occurredAt DATETIME(3) NOT NULL,
  note TEXT NULL,
  PRIMARY KEY (id),
  KEY discounts_stayId_idx (stayId),
  KEY discounts_occurredAt_idx (occurredAt),
  CONSTRAINT discounts_stayId_fkey FOREIGN KEY (stayId) REFERENCES stays(id) ON DELETE CASCADE,
  CONSTRAINT discounts_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id),
  CONSTRAINT discounts_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE withdrawals (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  amount INT NOT NULL,
  occurredAt DATETIME(3) NOT NULL,
  note TEXT NULL,
  PRIMARY KEY (id),
  KEY withdrawals_occurredAt_idx (occurredAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE notifications (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  kind ENUM('CLIENT_PENDING','NIGHT_SUMMARY') NOT NULL,
  title VARCHAR(191) NOT NULL,
  body TEXT NOT NULL,
  scheduledFor DATETIME(3) NOT NULL,
  sentAt DATETIME(3) NULL,
  clientId VARCHAR(191) NULL,
  stayId VARCHAR(191) NULL,
  cycleDate VARCHAR(191) NOT NULL,
  hour INT NOT NULL,
  PRIMARY KEY (id),
  KEY notifications_scheduledFor_idx (scheduledFor),
  KEY notifications_cycle_idx (cycleDate, hour),
  CONSTRAINT notifications_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE notification_cycles (
  id VARCHAR(191) NOT NULL,
  cycleDate VARCHAR(191) NOT NULL,
  summarySentAt DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY notification_cycles_cycleDate_key (cycleDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE reminder_silences (
  id VARCHAR(191) NOT NULL,
  clientId VARCHAR(191) NOT NULL,
  cycleDate VARCHAR(191) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY reminder_silences_client_cycle (clientId, cycleDate),
  CONSTRAINT reminder_silences_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE activity_logs (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  action VARCHAR(191) NOT NULL,
  entityType VARCHAR(191) NOT NULL,
  entityId VARCHAR(191) NOT NULL,
  summary TEXT NOT NULL,
  PRIMARY KEY (id),
  KEY activity_logs_createdAt_idx (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE audit_logs (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  action VARCHAR(191) NOT NULL,
  entityType VARCHAR(191) NOT NULL,
  entityId VARCHAR(191) NOT NULL,
  originalValue TEXT NULL,
  newValue TEXT NULL,
  reason TEXT NULL,
  PRIMARY KEY (id),
  KEY audit_logs_createdAt_idx (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("""CREATE TABLE migration_records (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sourceFile VARCHAR(191) NOT NULL,
  sourceSheet VARCHAR(191) NOT NULL,
  sourceRow INT NOT NULL,
  sourceText TEXT NOT NULL,
  flatName VARCHAR(191) NOT NULL,
  customer VARCHAR(191) NULL,
  occurredOn DATETIME(3) NULL,
  proposedType VARCHAR(191) NOT NULL,
  amount INT NULL,
  reason TEXT NOT NULL,
  status ENUM('NEEDS_REVIEW','CONFIRMED','IGNORED') NOT NULL DEFAULT 'NEEDS_REVIEW',
  pendingDecision ENUM('UNDECIDED','STILL_PENDING','ALREADY_PAID','IGNORE') NOT NULL DEFAULT 'UNDECIDED',
  stayId VARCHAR(191) NULL,
  monthLabel VARCHAR(191) NULL,
  currentInterpretation TEXT NULL,
  previousInterpretation TEXT NULL,
  lastQuickUpdate TEXT NULL,
  originalValue TEXT NULL,
  correctionText TEXT NULL,
  importedAt DATETIME(3) NULL,
  updatedAt DATETIME(3) NULL,
  importKey VARCHAR(191) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY migration_records_importKey_key (importKey),
  KEY migration_records_status_idx (status),
  KEY migration_records_stayId_idx (stayId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;""")
    add("")

    add("-- Owner and app settings")
    add(
        "INSERT INTO users (id, createdAt, name, role) VALUES "
        f"('user_anas', {sql_dt('2026-04-01T00:00:00.000Z')}, 'Anas', 'owner');"
    )
    add(
        "INSERT INTO app_settings (id, settingKey, settingValue) VALUES "
        "('set_timezone', 'timezone', 'Asia/Karachi'), "
        "('set_currency', 'currency', 'PKR'), "
        "('set_owner', 'ownerName', 'Anas');"
    )
    add("")

    add("-- Six flats. 204-D, 204-C, 811-D, 815-B start with zero financial rows.")
    add("INSERT INTO flats (id, createdAt, name, sortOrder) VALUES")
    flat_rows = []
    for flat in flats:
        flat_rows.append(
            f"  ({sql_str(flat['id'])}, {sql_dt('2026-04-01T00:00:00.000Z')}, {sql_str(flat['name'])}, {int(flat['sortOrder'])})"
        )
    add(",\n".join(flat_rows) + ";")
    add("")

    add("-- Clients from the already-generated 802-A / 408-B migration")
    add(
        "INSERT INTO clients (id, createdAt, name, phone, phoneNormalized, phoneMissing, notes) VALUES"
    )
    client_rows = []
    for client in clients:
        client_rows.append(
            "  ("
            f"{sql_str(client['id'])}, {sql_dt(client.get('createdAt'))}, {sql_str(client['name'])}, "
            f"{sql_str(client.get('phone'))}, {sql_str(client.get('phone'))}, "
            f"{sql_bool(bool(client.get('phoneMissing', True)))}, NULL)"
        )
    add(",\n".join(client_rows) + ";")
    add("")

    add("-- Historical stays. activePending=0 so imported remaining stays quiet.")
    add(
        "INSERT INTO stays (id, createdAt, flatId, clientId, checkIn, checkOut, nights, notifyEnabled, activePending, importKey, legacyNote) VALUES"
    )
    stay_rows = []
    for stay in stays:
        legacy = stay.get("legacy") or {}
        stay_rows.append(
            "  ("
            f"{sql_str(stay['id'])}, {sql_dt(stay.get('checkIn'))}, {sql_str(stay['flatId'])}, {sql_str(stay['clientId'])}, "
            f"{sql_dt(stay['checkIn'])}, {sql_dt(stay['checkOut'])}, {int(stay['nights'])}, "
            f"0, 0, {sql_str(stay.get('importKey') or stay['id'])}, {sql_str(legacy.get('sourceText'))})"
        )
    add(",\n".join(stay_rows) + ";")
    add("")

    add("-- Business (rent) entries")
    add(
        "INSERT INTO business_entries (id, createdAt, stayId, clientId, flatId, amount, occurredAt, importKey, note) VALUES"
    )
    rent_rows = []
    for item in rent_entries:
        rent_rows.append(
            "  ("
            f"{sql_str(item['id'])}, {sql_dt(item.get('occurredAt'))}, {sql_str(item['stayId'])}, "
            f"{sql_str(item['clientId'])}, {sql_str(item['flatId'])}, {int(item['amount'])}, "
            f"{sql_dt(item['occurredAt'])}, {sql_str(item.get('importKey') or item['id'])}, NULL)"
        )
    add(",\n".join(rent_rows) + ";")
    add("")

    add("-- Historical payments. Earlier payment rows are never overwritten later.")
    add(
        "INSERT INTO payments (id, createdAt, stayId, clientId, flatId, amount, method, receivedAt, notes, importKey) VALUES"
    )
    pay_rows = []
    for item in payments:
        pay_rows.append(
            "  ("
            f"{sql_str(item['id'])}, {sql_dt(item.get('receivedAt'))}, {sql_str(item.get('stayId'))}, "
            f"{sql_str(item['clientId'])}, {sql_str(item.get('flatId'))}, {int(item['amount'])}, "
            f"{sql_str(item.get('method') or 'OTHER')}, {sql_dt(item['receivedAt'])}, "
            f"{sql_str(item.get('notes'))}, {sql_str(item.get('importKey') or item['id'])})"
        )
    add(",\n".join(pay_rows) + ";")
    add("")

    add("-- Historical expenses")
    add(
        "INSERT INTO expenses (id, createdAt, flatId, amount, category, description, method, spentAt, notes, importKey) VALUES"
    )
    exp_rows = []
    for item in expenses:
        exp_rows.append(
            "  ("
            f"{sql_str(item['id'])}, {sql_dt(item.get('spentAt'))}, {sql_str(item.get('flatId'))}, "
            f"{int(item['amount'])}, {sql_str(item.get('category') or 'OTHER')}, {sql_str(item['description'])}, "
            f"{sql_str(item.get('method') or 'OTHER')}, {sql_dt(item['spentAt'])}, NULL, "
            f"{sql_str(item.get('importKey') or item['id'])})"
        )
    add(",\n".join(exp_rows) + ";")
    add("")

    add("-- Migration Review rows. Historical pending candidates stay UNDECIDED.")
    add(
        "INSERT INTO migration_records (id, createdAt, sourceFile, sourceSheet, sourceRow, sourceText, flatName, customer, occurredOn, proposedType, amount, reason, status, pendingDecision, stayId, monthLabel, currentInterpretation, previousInterpretation, lastQuickUpdate, originalValue, correctionText, importedAt, updatedAt, importKey) VALUES"
    )
    rev_rows = []
    for item in reviews:
        interpretation = default_interpretation(item)
        original = item.get("sourceText")
        if item.get("amount") is not None:
            original = f"{item.get('sourceText')} | imported {item['amount']}"
        rev_rows.append(
            "  ("
            f"{sql_str(item['id'])}, {sql_dt(item.get('importedAt') or generated_at)}, "
            f"{sql_str(item['sourceFile'])}, {sql_str(item['sourceSheet'])}, {int(item['sourceRow'])}, "
            f"{sql_str(item['sourceText'])}, {sql_str(item.get('flat') or item.get('flatName'))}, "
            f"{sql_str(item.get('customer'))}, {sql_dt(item.get('date'))}, {sql_str(item['proposedType'])}, "
            f"{sql_int(item.get('amount'))}, {sql_str(item['reason'])}, 'NEEDS_REVIEW', 'UNDECIDED', "
            f"{sql_str(item.get('stayId'))}, {sql_str(month_label(item.get('sourceSheet') or '', item.get('date')))}, "
            f"{sql_str(interpretation)}, NULL, NULL, {sql_str(original)}, NULL, "
            f"{sql_dt(item.get('importedAt') or generated_at)}, NULL, {sql_str(item['id'])})"
        )
    add(",\n".join(rev_rows) + ";")
    add("")

    add("SET FOREIGN_KEY_CHECKS = 1;")
    add("")

    pending_reviews = [item for item in reviews if item.get("proposedType") == "PENDING_BALANCE"]
    add("-- Validation snapshot at generation time (read-only comment)")
    add(f"-- flats={len(flats)} clients={len(clients)} stays={len(stays)} business_entries={len(rent_entries)}")
    add(f"-- payments={len(payments)} expenses={len(expenses)} migration_review={len(reviews)}")
    add(f"-- historical_pending_candidates={len(pending_reviews)}")
    add(f"-- spreadsheet_rows 802-A={imported['stats']['rows802']} 408-B={imported['stats']['rows408']}")
    add(
        "-- pending names: "
        + ", ".join(item.get("customer") or "?" for item in pending_reviews)
    )
    add("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT}")
    print(
        json.dumps(
            {
                "flats": len(flats),
                "clients": len(clients),
                "stays": len(stays),
                "business_entries": len(rent_entries),
                "payments": len(payments),
                "expenses": len(expenses),
                "migration_review": len(reviews),
                "historical_pending_candidates": len(pending_reviews),
                "rows802": imported["stats"]["rows802"],
                "rows408": imported["stats"]["rows408"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
