/**
 * Verifies an entry's dictionary.md against its captured DDL in work/:
 * every table present, every column present both ways, no extras.
 * Usage: node verify-dictionary.js apps/<app>/dictionary.md apps/<app>/work/<capture>.sql
 */
const fs = require('fs');
const [, , dictPath, ddlPath] = process.argv;
const dict = fs.readFileSync(dictPath, 'utf8').replace(/\r/g, '');
const ddl = fs.readFileSync(ddlPath, 'utf8');

// dictionary: "## table" sections with "| column |" rows
const dictTables = new Map();
let current = null;
for (const line of dict.split('\n')) {
  const h = line.match(/^## (.+)$/);
  if (h) {
    current = h[1].trim();
    if (current === 'Relationships') current = null;
    else dictTables.set(current, new Set());
    continue;
  }
  if (current) {
    const c = line.match(/^\| (\S+) \|/);
    if (c && c[1] !== 'Column' && c[1] !== '---') dictTables.get(current).add(c[1]);
  }
}

// ddl: create table blocks with leading column identifiers
const ddlTables = new Map();
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
  }
}

let issues = 0;
for (const [t, cols] of ddlTables) {
  const d = dictTables.get(t);
  if (!d) { console.log('MISSING TABLE in dictionary:', t); issues++; continue; }
  for (const c of cols) if (!d.has(c)) { console.log(`MISSING COLUMN in dictionary: ${t}.${c}`); issues++; }
  for (const c of d) if (!cols.has(c)) { console.log(`EXTRA COLUMN in dictionary: ${t}.${c}`); issues++; }
}
for (const t of dictTables.keys()) if (!ddlTables.has(t)) { console.log('EXTRA TABLE in dictionary:', t); issues++; }
console.log(`checked ${ddlTables.size} ddl tables / ${dictTables.size} dict tables - issues: ${issues}`);
