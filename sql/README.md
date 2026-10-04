# KHIZER LEDGER MySQL (Hostinger)

Hostinger MySQL is the permanent database. Import the three files in order, then point the app at it.

## phpMyAdmin upload order

Use a **fresh empty** KHIZER LEDGER database. Do not import these into Finance Flow or any other website database.

1. `sql/1_schema.sql` — tables, indexes, foreign keys. No rows.
2. `sql/2_historical_data.sql` — six flats plus 802-A / 408-B history.
3. `sql/3_app_settings.sql` — timezone, reminder window, app name. No finance.

Then set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` on the KHIZER LEDGER Node.js app only. Do not put the password in Git.

`4_alter_amount_bigint.sql` is a later one-time repair for the Sept 2026 phone-as-rent row. Do not use it as a fresh import. The live app also applies that repair on first load.

Open `/api/health`. You should see `{ "app": "ok", "database": "ok" }`.

Optional local check: `npm run validate:db`.

Do not import `anas-ledger-production.sql` if you are using the three-file set. That older combined file is leftover.

`001_schema.sql`, `002_seed_flats.sql`, and `003_active_pending.sql` are leftover helpers. Do not use them for a new production import.

Do not put database passwords in GitHub.
Do not hard-code secrets.
