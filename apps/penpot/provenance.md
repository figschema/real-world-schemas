# Provenance - Penpot

Every claim in the entry reduces to this file: the exact commands that produced the capture. Run them, diff us.

## Extraction

This is the gallery's first REPLAY capture: Penpot ships numbered raw SQL migrations (not a schema dump), so the capture replays them against a local PostgreSQL and dumps the result.

1. Get the migration files at the pinned tag (sparse git clone, only the migrations dir):

   ```
   git clone --depth 1 --branch 2.18.5 --filter=blob:none --sparse https://github.com/penpot/penpot.git
   git sparse-checkout set backend/src/app/migrations/sql
   ```

   Result: 167 SQL files (0001-...-0156 plus the XXXX manual-intervention migration).

2. Stand up a portable PostgreSQL 17.5 (EDB binaries zip, no installer, no admin rights; `work/tools/pgsql/`), init a cluster (`initdb -U postgres -A trust -E UTF8 --locale=C`), start on port 54329, create database `penpot`.

3. Replay in filename order (`psql -v ON_ERROR_STOP=1 -f <file>`), then dump:

   ```
   pg_dump --schema-only --no-owner --no-privileges penpot > work/penpot-2.18.5.sql
   ```

4. Replay notes, each verified against the sources:
   - **0122 exists twice** in Penpot's tree (`0122-mod-file-fragment-table.sql` and `0122-mod-file-data-fragment-table.sql`) - byte-identical duplicates. Applied once; the final schema is identical either way.
   - **XXXX-drop-obsolete-tables.sql is a manual-intervention migration** (Penpot's own header says so) - never auto-applied on fresh installs, therefore excluded. Its first statement duplicates a SET NOT NULL already present in the numbered migrations, so the excluded state matches the fresh-install state exactly.

5. Derived stats, counted from `work/penpot-2.18.5.sql` on 2026-11-02: **59 tables · 65 foreign keys · 3 trigger functions**.

Rules: the replay stack (PostgreSQL, penpot-repo clone, raw dump) stays in `work/` (gitignored) - only this provenance file, the renders, and verified counts are published.

Alternative reproduction path: install Penpot from docker-compose against PostgreSQL and `pg_dump --schema-only` - the table set matches.

## Checklist

- [x] captured from Penpot 2.18.5 on 2026-11-02
- [x] replay stack + dump stored locally in `work/`, confirmed gitignored
- [x] table/FK counts verified against the dump (59 · 65)
- [x] SVG + thumbnail exported
- [x] DBML exported from FigSchema
- [x] dictionary.md exported from FigSchema
- [x] mermaid exported from FigSchema
- [x] FigJam Community file published, link added to the entry
