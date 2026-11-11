# Provenance - MediaWiki

Every claim in the entry reduces to this file: the exact commands that produced the capture. Run them, diff us.

## Extraction

The schema is generated from MediaWiki's own abstract schema definition - the machine-readable `sql/tables.json` the project compiles into dialect-specific SQL at install time:

1. Download `sql/tables.json` from the pinned release tag (GitHub contents API):

   ```
   curl -fsSL "https://api.github.com/repos/wikimedia/mediawiki/contents/sql/tables.json?ref=1.46.2" ...
   ```

2. Convert to MySQL DDL with the committed converter (any Node 18+; renders MediaWiki's documented type mapping: `mwtimestamp` -> `binary(14)` (varbinary when `allowInfinite`), `mwenum` -> enum from `PlatformOptions.enum_values`, `blob(length)` -> tiny/blob/mediumblob, `binary(fixed)` -> binary vs varbinary, prefix index lengths, FULLTEXT flags, and the MyISAM `table_options` on `searchindex`). NOT NULL only when the JSON declares it; MediaWiki declares NO foreign keys:

   ```
   node extract.js 1.46.2 > work/mediawiki-1.46.2.sql
   ```

3. Derived stats, counted from `work/mediawiki-1.46.2.sql` on 2026-10-31: **64 tables · 387 columns · 60 primary keys (4 tables have none: `oldimage` plus 3 declared-empty) · 132 secondary indexes (23 unique) · 0 foreign keys**.

Rules: the downloaded `tables.json` (GPL) and the raw DDL stay in `work/` (gitignored) - only this provenance file, `extract.js`, the renders, and verified counts are published.

Alternative reproduction path: install MediaWiki against MySQL and `mysqldump --no-data` - the table set matches (per-engine DDL like `searchindex`'s MyISAM included).

## Checklist

- [x] captured from MediaWiki 1.46.2 on 2026-10-31
- [x] `tables.json` + DDL stored locally in `work/`, confirmed gitignored
- [x] table/column/index counts verified against the DDL (64 · 387 · 132)
- [x] SVG + thumbnail exported
- [x] DBML exported from FigSchema
- [x] dictionary.md exported from FigSchema
- [x] mermaid exported from FigSchema
- [x] FigJam Community file published, link added to the entry
