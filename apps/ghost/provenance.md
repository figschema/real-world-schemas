# Provenance - Ghost

Every claim in the entry reduces to this file: the exact commands that produced the capture. Run them, diff us.

## Extraction

The schema is generated from Ghost's own schema definition, not inferred:

1. Download the schema files from the pinned release tag (via the GitHub contents API; `schema.js` is the source of truth, `in-development.ts` the exclusion list, `commands.js` + `lib/foreign-keys.ts` the mapping rules we mirror):

   ```
   curl -fsSL "https://api.github.com/repos/TryGhost/Ghost/contents/ghost/core/server/data/schema/schema.js?ref=v6.72.0" ...
   ```

   Files fetched: `schema.js`, `in-development.ts`, `views.js`, `lib/foreign-keys.ts`, `commands.js` - all into `work/` (never committed).

2. Convert to MySQL DDL with the committed converter (any Node 18+; mirrors `commands.js`' knex-to-MySQL mapping: varchar maxlengths, text fieldtypes `long`->`longtext`, NOT NULL by default, unsigned, defaults, `index: true` + `@@INDEXES@@`, composite `@@PRIMARY_KEY@@`/`@@UNIQUE_CONSTRAINTS@@`, column `references` FKs with delete rules):

   ```
   node extract.js 6.72.0 > work/ghost-6.72.0.sql
   ```

3. Exclusions, per Ghost's own docs: `app_installations`, `app_installation_manifests`, `jobs_outbox` are in-development tables that production databases never contain.

4. Derived stats, counted from `work/ghost-6.72.0.sql` on 2026-10-23: **97 tables · 920 columns · 109 foreign keys**. The DDL pins InnoDB/utf8mb4, matching Ghost's documented MySQL 8 requirements.

Rules: the downloaded Ghost files (MIT) and the raw DDL stay in `work/` (gitignored) - only this provenance file, `extract.js`, the renders, and verified counts are published.

Alternative reproduction path: install Ghost against MySQL 8 and `mysqldump --no-data` - the table set matches (SQLite installs have the same logical schema in SQLite dialect).

## Checklist

- [x] captured from Ghost 6.72.0 on 2026-10-23
- [x] Ghost files + DDL stored locally in `work/`, confirmed gitignored
- [x] table/FK/column counts verified against the DDL (97 · 920 · 109)
- [ ] SVG + thumbnail exported
- [ ] DBML exported from FigSchema
- [ ] dictionary.md exported from FigSchema
- [ ] FigJam Community file published, link added to the entry
