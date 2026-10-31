/**
 * Verifies an entry's schema.dbml against its captured DDL in work/:
 * tables, columns, and - when the capture declares FK constraints - every
 * foreign-key ref with correct child > parent directions. When the capture
 * declares NO constraints (WordPress-style schemas), refs are hand-drawn and
 * cannot be derived from the DDL: they are counted, not judged.
 * Usage: node verify-dbml.js apps/<app>/schema.dbml apps/<app>/work/<capture>.sql
 */
const fs = require('fs');
const [, , dbmlPath, ddlPath] = process.argv;
const dbml = fs.readFileSync(dbmlPath, 'utf8').replace(/\r/g, '');
const ddl = fs.readFileSync(ddlPath, 'utf8');

const strip = (s) => s.replace(/[`"[\]]/g, '');

// --- dbml ---
const dbmlTables = new Map(); // name -> Set(columns)
const dbmlRefs = []; // {left, right, arrow}
let current = null;
for (const line of dbml.split('\n')) {
  const t = line.match(/^Table (\S+) \{/);
  if (t) { current = strip(t[1]); dbmlTables.set(current, new Set()); continue; }
  if (current) {
    if (/^\}/.test(line)) { current = null; continue; }
    const c = line.match(/^  "?([\w.]+)"? \S+ ?/);
    if (c) dbmlTables.get(current).add(strip(c[1]));
  }
  const r = line.match(/^Ref: (\S+) (>|-) (\S+)$/);
  if (r) dbmlRefs.push({ left: strip(r[1]), right: strip(r[3]), arrow: r[2] });
}

// --- ddl ---
const ddlTables = new Map();
const ddlFks = []; // {child: "table.col", parent: "table.col"}
current = null;
for (const line of ddl.split('\n')) {
  const t = line.match(/^CREATE TABLE (\S+) \(/);
  if (t) { current = strip(t[1]); ddlTables.set(current, new Set()); continue; }
  if (current) {
    if (/^\s*\)/.test(line)) { current = null; continue; }
    const c = line.match(/^\s+(\S+) /);
    const up = c && c[1].toUpperCase();
    // constraint keywords only when the token IS one or is immediately
    // followed by '(' - a bare prefix would eat real columns (CHECKSUM)
    const isConstraint = up && ['PRIMARY', 'FOREIGN', 'UNIQUE', 'KEY', 'CONSTRAINT', 'INDEX', 'FULLTEXT', 'SPATIAL', 'CHECK'].some((k) => up === k || up.startsWith(k + '('));
    if (c && !c[1].startsWith(')') && !isConstraint) {
      ddlTables.get(current).add(strip(c[1]));
    }
    const fk = line.match(/FOREIGN KEY \(([^)]+)\) REFERENCES (\S+) \(([^)]+)\)/);
    if (fk) ddlFks.push({ child: `${current}.${strip(fk[1])}`, parent: `${strip(fk[2])}.${strip(fk[3])}` });
  }
}

// --- tables + columns ---
let issues = 0;
if (dbmlTables.size !== ddlTables.size) { console.log(`TABLE COUNT: dbml ${dbmlTables.size} vs ddl ${ddlTables.size}`); issues++; }
for (const [t, cols] of ddlTables) {
  const d = dbmlTables.get(t);
  if (!d) { console.log('MISSING TABLE in dbml:', t); issues++; continue; }
  for (const c of cols) if (!d.has(c)) { console.log(`MISSING COLUMN in dbml: ${t}.${c}`); issues++; }
  for (const c of d) if (!cols.has(c)) { console.log(`EXTRA COLUMN in dbml: ${t}.${c}`); issues++; }
}
for (const t of dbmlTables.keys()) if (!ddlTables.has(t)) { console.log('EXTRA TABLE in dbml:', t); issues++; }

// --- refs ---
let missing = 0, extra = 0, inverted = 0, oneToOne = 0, correctN = 0;
if (ddlFks.length === 0) {
  console.log(`capture declares 0 FK constraints - ${dbmlRefs.length} hand-drawn refs are not auto-verifiable (audit them against the entry's relationship table)`);
} else {
  const endpointKey = (a, b) => [a, b].sort().join(' ~ ');
  const ddlRefIndex = new Map(ddlFks.map((f) => [endpointKey(f.child, f.parent), f]));
  const dbmlRefIndex = new Map(dbmlRefs.map((r) => [endpointKey(r.left, r.right), r]));
  for (const [key, fk] of ddlRefIndex) {
    const r = dbmlRefIndex.get(key);
    if (!r) { console.log('MISSING REF in dbml:', fk.child, '->', fk.parent); missing++; issues++; continue; }
    if (r.arrow === '>') {
      // exporter puts the CHILD on the left of `>`; inverted if parent is left
      if (r.left === fk.parent) { inverted++; console.log('INVERTED DIRECTION:', r.left, '>', r.right); }
      else correctN++;
    } else {
      oneToOne++;
    }
  }
  for (const [key, r] of dbmlRefIndex) {
    if (!ddlRefIndex.has(key)) { console.log('EXTRA REF in dbml:', r.left, r.arrow, r.right); extra++; issues++; }
  }
}

console.log(`\ntables: ddl ${ddlTables.size} / dbml ${dbmlTables.size} | fks: ddl ${ddlFks.length} / dbml refs ${dbmlRefs.length}`);
console.log(`refs: correct N:1 arrows ${correctN} | 1:1 renders ${oneToOne} | inverted ${inverted} | missing ${missing} | extra ${extra} | column/table issues ${issues}`);
