# Provenance — WordPress

Every claim in the entry reduces to this file: the exact commands that produced the capture. Run them, diff us.

## Extraction

1. Spin up a throwaway single-site WordPress on MySQL (docker compose or the official `wordpress` image) and finish the 5-minute install.
2. Dump structure only:

   ```
   mysqldump --no-data --skip-comments wordpress > apps/wordpress/work/wp-<version>.sql
   ```

3. Read the exact version from the dump header (or `wp core version`) and record it below.
4. Import the dump into FigSchema (Pro SQL import) → arrange by feature cluster (posts/content, taxonomy, users, options/settings, multisite) → export SVG + thumbnail + DBML.

Rules: the raw dump never leaves `work/` (gitignored) — only renders, DBML, and verified counts get committed. Schema defined in PHP (`wp-admin/includes/schema.php`); the dump captures exactly what an install creates.

## Checklist

- [ ] captured from version: ______ on ______
- [ ] dump stored locally in `work/`, confirmed gitignored
- [ ] SVG + thumbnail exported
- [ ] DBML exported from FigSchema
- [ ] table/FK counts verified against the dump
- [ ] FigJam Community file published, link added to the entry
