# Contributing to Real-World Database Schemas

Corrections, fixes and app suggestions are welcome. This repo is a curated, weekly-cadence gallery run by one person - think of contributions as feeding that pipeline rather than changing it.

## What is hand-made vs generated

Each entry has two kinds of files:

- **Hand-made**: the annotation (`README.md` per app), `provenance.md`, and the diagram layout in FigJam
- **Pipeline-generated**: `schema.svg`, `thumbnail.svg`, `schema.dbml`, `dictionary.md`

Please don't hand-edit the generated files - they are regenerated from the capture, so manual edits would be overwritten and would break the "reproduce and diff us" promise. If a generated file is wrong, the *capture or converter* is wrong: open an issue with the evidence.

## Reporting a diagram error

Open an issue with the **Diagram correction** template. The one thing that makes a correction actionable is evidence: the upstream migration line, DDL statement or documentation that contradicts what we drew. Every entry's `provenance.md` ships the exact reproduction commands, so you can regenerate the capture yourself and diff us.

## Suggesting an app

Open a regular issue titled "Schema suggestion: \<app\>". Criteria, in order:

1. The app is open source and ships its schema in its own repo (migrations, structure dump or schema definition) - we never publish approximations
2. Recognisability: would a developer or student care about this schema?
3. Actively maintained is preferred; famous archived projects are fine (their frozen schemas make honest snapshots)

New entries are added one per week, so a suggestion may take a few weeks to land. Upstream projects: you can simply ask - if your project's docs lack a schema diagram, we will happily provide one, credited, for free.

## Pull requests

Text fixes (annotations, provenance, this file) are perfect as PRs. Anything touching generated files or adding new entries is better discussed in an issue first, since those flow through the capture pipeline.

By contributing you agree that your contribution is published under the repo's [CC BY 4.0](LICENSE) license.
