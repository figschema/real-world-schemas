/**
 * Verifies an entry's schema.dbml against its captured DDL in work/:
 * tables, columns, and all foreign-key refs with correct child > parent
 * directions.
 * Usage: node verify-dbml.js apps/<app>/schema.dbml apps/<app>/work/<capture>.sql
 */
const fs = require('fs');
const [, , dbmlPath, ddlPath] = process.argv;
const dbml = fs.readFileSync(dbmlPath, 'utf8').replace(/\r/g, '');
const ddl = fs.readFileSync(ddlPath, 'utf8');

// --- dbml ---
const dbmlTables = new Map(); // name -> Set(columns)
const dbmlRefs = new Set(); // "table.col > table.col"
let current = null;
for (const line of dbml.split('\n')) {
  const t = line.match(/^Table (\S+) \{/);
  if (t) { current = t[1].replace(/"/g, ''); dbmlTables.set(current, new Set()); continue; }
  if (current) {
    if (/^\}/.test(line)) { current = null; continue; }
    const c = line.match(/^  "?([\w.]+)"? \S+ ?/);
    if (c) dbmlTables.get(current).add(c[1].replace(/"/g, ''));
  }
  const r = line.match(/^Ref: (\S+) > (\S+)$/);
  if (r) dbmlRefs.add(`${r[1]} > ${r[2]}`);
}

// --- ddl ---
const ddlTables = new Map();
const ddlRefs = new Set();
current = null;
for (const line of ddl.split('\n')) {
  const t = line.match(/^CREATE TABLE (\S+) \(/);
  if (t) { current = t[1]; ddlTables.set(current, new Set()); continue; }
  if (current) {
    if (/^\);/.test(line)) { current = null; continue; }
    const c = line.match(/^  (\S+) /);
    if (c && !['PRIMARY', 'FOREIGN', 'UNIQUE', 'KEY'].includes(c[1])) {
      ddlTables.get(current).add(c[1].replace(/"/g, ''));
    }
    const fk = line.match(/^  FOREIGN KEY \((\S+)\) REFERENCES (\S+) \((\S+)\)/);
    if (fk) ddlRefs.add(`${current}.${fk[1]} > ${fk[2]}.${fk[3]}`);
  }
}

let issues = 0;
if (dbmlTables.size !== ddlTables.size) { console.log(`TABLE COUNT: dbml ${dbmlTables.size} vs ddl ${ddlTables.size}`); issues++; }
for (const [t, cols] of ddlTables) {
  const d = dbmlTables.get(t);
  if (!d) { console.log('MISSING TABLE in dbml:', t); issues++; continue; }
  for (const c of cols) if (!d.has(c)) { console.log(`MISSING COLUMN in dbml: ${t}.${c}`); issues++; }
  for (const c of d) if (!cols.has(c)) { console.log(`EXTRA COLUMN in dbml: ${t}.${c}`); issues++; }
}
for (const expected of ddlRefs) {
  if (!dbmlRefs.has(expected)) { console.log('MISSING/WRONG REF in dbml:', expected); issues++; }
}
for (const actual of dbmlRefs) {
  if (!ddlRefs.has(actual)) { console.log('EXTRA REF in dbml:', actual); issues++; }
}
console.log(`checked ${ddlTables.size} tables / ${ddlRefs.size} refs from ddl - dbml: ${dbmlTables.size} tables, ${dbmlRefs.size} refs - issues: ${issues}`);
