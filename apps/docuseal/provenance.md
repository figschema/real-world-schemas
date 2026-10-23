# Provenance — DocuSeal

Every claim in the entry reduces to this file: the exact commands that produced the capture. Run them, diff us.

## Extraction

The schema is generated from DocuSeal's own ActiveRecord schema definition (`db/schema.rb` - the project ships no SQL dump), not inferred:

1. Download `db/schema.rb` from the pinned release tag (GitHub contents API):

   ```
   curl -fsSL "https://api.github.com/repos/docusealco/docuseal/contents/db/schema.rb?ref=3.3.3" ...
   ```

2. Convert to PostgreSQL DDL with the committed converter (any Node 18+; line-parses the Rails DSL: `create_table` blocks, column types/nullability/defaults, `t.index` secondary + partial + unique indexes, `add_foreign_key` with column overrides and delete rules). Implicit Rails primary keys are rendered as `bigserial`. Foreign keys are emitted as table-level `FOREIGN KEY` clauses inside each `CREATE TABLE` (not `ALTER TABLE`) so FigSchema's SQL import links the tables automatically; Rails' runtime `fk_rails_*` constraint names are left to PostgreSQL to auto-name:

   ```
   node extract.js 3.3.3 > work/docuseal-3.3.3.sql
   ```

3. Derived stats, counted from `work/docuseal-3.3.3.sql` on 2026-10-23: **44 tables · 371 explicit columns (+ 44 implicit `id`s) · 43 foreign keys · 117 secondary indexes (36 unique)**. Extensions enabled by the schema: `btree_gin`, `plpgsql`.

Rules: the downloaded `schema.rb` (AGPL) and the raw DDL stay in `work/` (gitignored) - only this provenance file, `extract.js`, the renders, and verified counts are published.

Alternative reproduction path: start DocuSeal against PostgreSQL and `pg_dump --schema-only` - the table set matches.

## Checklist

- [x] captured from DocuSeal 3.3.3 on 2026-10-23
- [x] `schema.rb` + DDL stored locally in `work/`, confirmed gitignored
- [x] table/FK/column counts verified against the DDL (44 · 43 · 371)
- [ ] SVG + thumbnail exported
- [ ] DBML exported from FigSchema
- [ ] dictionary.md exported from FigSchema
- [ ] FigJam Community file published, link added to the entry
