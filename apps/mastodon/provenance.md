# Provenance — Mastodon

Every claim in the entry reduces to this file: the exact commands that produced the capture. Run them, diff us.

## Extraction

The schema is generated from Mastodon's own ActiveRecord schema definition (`db/schema.rb` - Mastodon commits the Ruby DSL, not a SQL dump), not inferred:

1. Download `db/schema.rb` from the pinned release tag (GitHub contents API):

   ```
   curl -fsSL "https://api.github.com/repos/mastodon/mastodon/contents/db/schema.rb?ref=v4.7.3" ...
   ```

2. Convert to PostgreSQL DDL with the committed converter (any Node 18+; line-parses the Rails DSL: `create_table` blocks, column types/nullability/defaults incl. `-> { ... }` lambda defaults, `t.index` secondary/partial/unique/GIN indexes, `add_foreign_key` with column overrides and delete rules, `primary_key:`-level PKs, `array: true` columns). Implicit Rails primary keys are rendered as `bigserial`; tables with explicit identity defaults render the lambda SQL:

   ```
   node extract.js 4.7.3 > work/mastodon-4.7.3.sql
   ```

3. Derived stats, counted from `work/mastodon-4.7.3.sql` on 2026-10-23: **116 tables · 1,016 explicit columns (+ implicit ids) · 156 foreign keys (124 ON DELETE CASCADE, 24 SET NULL) · 217 secondary indexes (86 unique)**. SQL views are defined separately by Mastodon (`db/views`) and are not part of this table capture.

Rules: the downloaded `schema.rb` (AGPL) and the raw DDL stay in `work/` (gitignored) - only this provenance file, `extract.js`, the renders, and verified counts are published.

Alternative reproduction path: run Mastodon against PostgreSQL and `pg_dump --schema-only` - the table set matches.

## Checklist

- [x] captured from Mastodon 4.7.3 on 2026-10-23
- [x] `schema.rb` + DDL stored locally in `work/`, confirmed gitignored
- [x] table/FK/column counts verified against the DDL (116 · 156 · 1,016)
- [ ] SVG + thumbnail exported
- [ ] DBML exported from FigSchema
- [ ] dictionary.md exported from FigSchema
- [ ] FigJam Community file published, link added to the entry
