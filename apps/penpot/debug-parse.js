const fs = require('fs');
const src = fs.readFileSync(__dirname + '/work/penpot-2.18.5.sql', 'utf8').replace(/\r/g, '');
const lines = src.split('\n');
let current = null;
let found = {};
const registered = [];
const swallowed = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const ct = line.match(/^CREATE TABLE (\S+) \($/);
  if (ct) {
    if (current) swallowed.push({ at: i + 1, inside: current.name, lost: ct[1] });
    current = { name: ct[1], startLine: i + 1 };
    registered.push({ name: ct[1], line: i + 1 });
    continue;
  }
  if (current && /^\);/.test(line)) { current = null; continue; }
}
console.log('registered:', registered.length);
console.log('swallowed (CREATE headers eaten by unterminated blocks):', JSON.stringify(swallowed));
console.log('file_change registered:', registered.some(r => r.name.includes('file_change')));
console.log('team registered:', registered.some(r => r.name === 'public.team'));
// show lines around the end of the block BEFORE file_change
const fc = registered.find(r => r.name.includes('file_change'));
if (fc) { console.log('file_change at line', fc.line); for (let l = fc.line - 4; l <= fc.line; l++) console.log(l + ':', JSON.stringify(lines[l - 1])); }
