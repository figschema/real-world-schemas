/**
 * Provenance tool for the Penpot gallery entry - post-processing step.
 *
 * pg_dump emits table constraints as separate ALTER TABLE statements, which
 * FigSchema's SQL import does not parse (it links tables from constraints
 * declared inside CREATE TABLE). This script folds them back:
 *
 *   - PRIMARY KEY / UNIQUE (single-column) -> inline table constraints
 *   - FOREIGN KEY (single-column) -> inline, keeping ON DELETE/UPDATE,
 *     dropping DEFERRABLE markers
 *   - composite constraints and CHECKs -> skipped with warnings (the import
 *     models single-column keys only; composite counts are in provenance)
 *   - CREATE INDEX / SEQUENCE / SET statements -> dropped (not modeled)
 *
 * pg_dump shape quirks handled:
 *   - two-line closers: `)` then `WITH (...)` / `PARTITION BY ...` clauses
 *   - partitioned parent + one-line `PARTITION OF` partitions: the 16
 *     file_data_XX shards are emitted with their parent's columns (that is
 *     physically what a partition holds), so the import shows all 59 tables
 *   - `public.` schema qualifier and quoted identifiers stripped
 *
 * Usage: node extract.js > work/penpot-2.18.5-import.sql
 * (the raw dump stays in work/, never committed)
 */

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/work/penpot-2.18.5.sql', 'utf8').replace(/\r/g, '');

const cleanName = (name) => name.replace(/^public\./, '').replace(/"/g, '');

const tables = new Map(); // name -> { lines: [], constraints: [], isPartitionOf: null }
const warnings = [];
let pkInlined = 0, uqInlined = 0, fkInlined = 0, skippedComposite = 0, skippedCheck = 0;

const lines = src.split('\n');
let i = 0;
while (i < lines.length) {
  const line = lines[i];

  // partition one-liners: CREATE TABLE public.x PARTITION OF public.parent FOR VALUES ...;
  const part = line.match(/^CREATE TABLE (\S+) PARTITION OF (\S+) (FOR VALUES .*;)$/);
  if (part) {
    tables.set(cleanName(part[1]), { lines: [], constraints: [], isPartitionOf: cleanName(part[2]) });
    i++;
    continue;
  }

  const ct = line.match(/^CREATE TABLE (\S+) \($/);
  if (ct) {
    const name = cleanName(ct[1]);
    const block = { name, lines: [], constraints: [], isPartitionOf: null };
    tables.set(name, block);
    i++;
    while (i < lines.length && !/^\)/.test(lines[i])) {
      block.lines.push(lines[i].trimEnd());
      i++;
    }
    // closer line starts with `)`; if the statement continues past it
    // (WITH (...) / PARTITION BY ...), consume until the terminating `;`
    if (!/;\s*$/.test(lines[i])) {
      while (i < lines.length && !/;\s*$/.test(lines[i])) i++;
    }
    i++; // consume the closing `;` line
    continue;
  }

  if (/^ALTER TABLE /.test(line)) {
    let stmt = line;
    while (i < lines.length && !/;\s*$/.test(stmt)) {
      i++;
      stmt += ' ' + lines[i].trim();
    }
    const m = stmt.match(/^ALTER TABLE (?:ONLY )?(\S+)\s+ADD CONSTRAINT (\S+)\s+(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK)\s*\(([^)]*)\)\s*(REFERENCES\s+(\S+)\s*\(([^)]*)\))?\s*(.*?);?\s*$/);
    if (!m) { i++; continue; }
    const [, tblRaw, , kind, colsRaw, , refTblRaw, refColsRaw, tail] = m;
    const table = cleanName(tblRaw);
    const cols = colsRaw.split(',').map((c) => stripId(c.trim()));
    const target = tables.get(table);
    if (!target) { warnings.push(`constraint for unknown table ${table}`); i++; continue; }

    if (kind === 'CHECK') { skippedCheck++; i++; continue; }

    if (cols.length > 1) {
      skippedComposite++;
      warnings.push(`composite ${kind} on ${table} (${cols.join(', ')}) skipped - import models single-column keys`);
      i++; continue;
    }

    if (kind === 'PRIMARY KEY') {
      target.constraints.push(`  PRIMARY KEY (${cols[0]})`);
      pkInlined++;
    } else if (kind === 'UNIQUE') {
      target.constraints.push(`  UNIQUE (${cols[0]})`);
      uqInlined++;
    } else if (refTblRaw) {
      const tailClean = (tail || '').replace(/DEFERRABLE|INITIALLY \w+/g, '').trim();
      target.constraints.push(`  FOREIGN KEY (${cols[0]}) REFERENCES ${cleanName(refTblRaw)} (${stripId(refColsRaw)})${tailClean ? ' ' + tailClean : ''}`);
      fkInlined++;
    }
    i++;
    continue;
  }

  i++;
}

function stripId(s) {
  return s.replace(/"/g, '');
}

const out = [];
out.push(`-- Penpot 2.18.5 database schema (PostgreSQL, fresh install)`);
out.push(`-- Replayed from the project's 167 SQL migrations, then pg_dump --schema-only,`);
out.push(`-- with pg_dump's ALTER TABLE constraints folded back into their CREATE`);
out.push(`-- TABLE blocks so FigSchema's SQL import links the relationships.`);
out.push(`-- The 16 file_data_XX shard tables are emitted with their parent's columns`);

// partitions inherit the parent's column list - resolve at emit time
const withColumns = (entry) => {
  if (entry.isPartitionOf) {
    const parent = tables.get(entry.isPartitionOf);
    return parent ? parent.lines : entry.lines;
  }
  return entry.lines;
};

for (const [name, entry] of tables) {
  const cols = withColumns(entry).slice(); // copy - partitions share the parent's list by reference
  // normalize: strip pg_dump's trailing commas, then comma-join every line
  // (columns AND constraints) - the import splits items on top-level commas,
  // so two constraints without a separating comma merge into one unparseable
  // item and only the first relationship links
  const all = [...cols, ...entry.constraints].map((l) => l.replace(/,\s*$/, ''));
  out.push('');
  if (entry.isPartitionOf) {
    out.push(`-- partition of ${entry.isPartitionOf}`);
  }
  out.push(`CREATE TABLE ${name} (`);
  out.push(all.join(',\n'));
  out.push(`);`);
}

out.push('');
out.push(`-- ${tables.size} tables, ${fkInlined} foreign keys, ${pkInlined} primary keys, ${uqInlined} unique constraints inlined`);
for (const warning of warnings) out.push(`-- WARNING: ${warning}`);
process.stdout.write(out.join('\n') + '\n');
