# Real-World Database Schemas

Beautiful, annotated ER diagrams of **real open-source applications' databases** - not templates, not approximations. Every schema is captured from the project's own migrations and rendered with [FigSchema](https://figschema.com), the schema designer that lives in FigJam.

![WordPress database schema - Real-World Schemas #1](apps/wordpress/thumbnail.svg)

## Why this repo exists

The best database-design education is reading how real systems model real problems - and almost no project documents its schema well. When an ERD exists at all, it's usually an auto-generated blob nobody can read. This gallery is the fix: each entry pairs a carefully arranged ER diagram with a short walkthrough of what the schema gets right (and what it gets wrong).

## The gallery

| App | What it is | Tables | Stack | License | Diagram |
|---|---|---|---|---|---|
| [WordPress](apps/wordpress/) | The CMS running ~43% of the web | 12 | PHP · MySQL | GPL-2.0+ | ✅ done |
| [Ghost](apps/ghost/) | The publishing platform (Ghost 6) | 97 | Node · MySQL/SQLite | MIT | 🚧 in progress |

One new schema every week.

## How these are made

1. **Source of truth: the app's own repo.** Migrations or structure dumps - never templates, never guesses. The exact file path or extraction command lives in every entry's `provenance.md`.
2. **Dated, versioned captures.** Every entry states the release it was captured from and when. Schemas drift; our snapshots don't pretend otherwise.
3. **Deterministic rendering.** Diagrams are imported and drawn with FigSchema - same input, same output, so a re-run is a clean diff.
4. **Reproducible.** Every entry ships the extraction commands. Run them yourself and diff us - that's the point.

**What we publish:** only our own rendering, our own annotations, and derived stats (table/FK counts). Never the project's source files - each entry links upstream and carries its license note. Diagram and annotation errors are ours, not theirs.

## Using these diagrams

- **Read** them right here - every entry is a full-size SVG.
- **Explore** them interactively - each diagram also exists as a public FigJam file you can open, pan, and duplicate (link in each entry).
- **Reuse** the data - every entry includes the schema as [DBML](https://dbml.dbdiagram.io) for import into your own tools, under the same CC BY 4.0 license as the rest of the gallery.

## Made with FigSchema

Every diagram here was built with [FigSchema](https://figschema.com) - paste a schema (SQL today, Prisma/Drizzle on the roadmap), get a fully linked ER diagram you can actually edit, and export SQL, DBML, and documentation. <!-- TODO: add Community listing link on publish -->

## Corrections & suggestions

Something wrong in a diagram? Open an issue or a PR - hand-arranged diagrams improve the same way software does. Suggestions for which app to visualize next are welcome; preference goes to actively maintained open-source projects.
