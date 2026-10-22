# WordPress database schema

> 🚧 **In progress** — captured, being arranged. This banner disappears when the diagram lands.

The database behind the CMS that runs ~43% of the web: 12 tables, zero foreign keys, and the most influential key-value design in open source.

## At a glance

| | |
|---|---|
| Tables | 12 · 0 foreign keys · 41 key/index declarations — counted from the captured DDL |
| Engine | MySQL / MariaDB |
| Source | [`wp-admin/includes/schema.php`](https://github.com/WordPress/WordPress/blob/7.1.3/wp-admin/includes/schema.php) @ tag `7.1.3` |
| Captured from | WordPress 7.1.3, on 2026-10-23 |
| License | GPL-2.0-or-later |

## What's interesting

- **Four meta tables are the whole architecture.** `postmeta`, `usermeta`, `commentmeta`, and `termmeta` (plus the `options` key-value store) let plugins attach unlimited data to anything without touching core tables — infinite flexibility, and the source of WordPress's most famous performance complaints.
- **The taxonomy trio.** `terms` → `term_taxonomy` → `term_relationships` is a three-table dance that lets one term be a category here and a tag there. Famously confusing, historically deliberate.
- **Zero foreign keys.** Referential integrity is enforced in PHP, not the engine — a MyISAM-era decision that survived the move to InnoDB. Related rows are deleted by code, which is why orphaned meta is a chronic WordPress support topic.
- **`posts.GUID` never changes.** A permanent, globally unique identifier for syndication, immune to URL and site moves — a quiet lesson in designing for content that outlives its address.
- **Multisite is one extra network layer.** `site`, `sitemeta`, `blogs`, `blogmeta`, `signups`, `registration_log`, and `blog_versions` turn a single install into thousands of independent sites sharing one users table.

## Files

- [`schema.svg`](schema.svg) — full-size diagram
- [`thumbnail.svg`](thumbnail.svg) — index thumbnail
- [`schema.dbml`](schema.dbml) — machine-readable schema (DBML)
- [`provenance.md`](provenance.md) — how this was captured, reproducibly

## Interactive version

🚧 Public FigJam file — link lands with the diagram.

---

*Diagram rendered with [FigSchema](https://figschema.com). WordPress is a trademark of the WordPress Foundation; this gallery is unaffiliated. The schema belongs to the WordPress contributors — the diagram and annotations are CC BY 4.0.*
