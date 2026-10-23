/**
 * Provenance tool for the DocuSeal gallery entry.
 *
 * Converts DocuSeal's own ActiveRecord schema definition - db/schema.rb at a
 * pinned release tag - into PostgreSQL DDL, rendering the types Rails creates.
 * Implicit Rails primary keys are rendered as `bigserial` (the serial-family
 * equivalent Rails' bigint identity); every other construct (columns, null
 * flags, defaults, t.index secondary indexes, add_foreign_key constraints) is
 * translated 1:1.
 *
 * Usage: node extract.js <version> > work/docuseal-<version>.sql
 * (schema.rb stays in work/, never committed)
 *
 * Foreign keys are emitted as table-level FOREIGN KEY clauses (not ALTER
 * TABLE) so FigSchema's SQL import links the tables; Rails' runtime-generated
 * fk_rails_* constraint names are not recorded in schema.rb and are left to
 * PostgreSQL to auto-name. ON DELETE rules are preserved.
 */

const VERSION = process.argv[2] || 'unknown';
const source = require('fs').readFileSync(__dirname + '/work/schema.rb', 'utf8');

/** Rails/ActiveRecord type -> PostgreSQL type */
const PG_TYPES = {
  bigint: 'bigint',
  integer: 'integer',
  string: 'varchar(255)',
  text: 'text',
  boolean: 'boolean',
  datetime: 'timestamp',
  date: 'date',
  decimal: 'numeric',
  float: 'float',
  json: 'json',
  jsonb: 'jsonb',
  tsvector: 'tsvector',
  uuid: 'uuid',
};

/** Rails' naive singularization for inferred foreign-key columns */
function singularize(table) {
  if (table.endsWith('ies')) return table.slice(0, -3) + 'y';
  if (table.endsWith('s')) return table.slice(0, -1);
  return table;
}

/** split "key: value, key: value" honouring quoted strings and -> lambdas */
function parseOptions(rest) {
  const options = {};
  if (!rest) return options;
  const parts = [];
  let depth = 0, quote = null, current = '';
  for (const ch of rest) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  for (const part of parts) {
    const m = part.match(/^\s*(\w+):\s*(.+?)\s*$/);
    if (m) {
      let value = m[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      options[m[1]] = value;
    }
  }
  return options;
}

/** render an ActiveRecord default literal as SQL */
function sqlDefault(raw) {
  if (raw === undefined) return '';
  const lambda = raw.match(/^-> \{ "?([^"}]+)"? \}$/); // default: -> { "expr" }
  if (lambda) return ` DEFAULT ${lambda[1]}`;
  if (raw === 'true' || raw === 'false') return ` DEFAULT ${raw}`;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return ` DEFAULT ${raw}`;
  return ` DEFAULT '${raw.replace(/'/g, "''")}'`;
}

const out = [];
out.push(`-- DocuSeal ${VERSION} database schema (PostgreSQL, fresh install)`);
out.push(`-- Generated from DocuSeal's own ActiveRecord schema definition:`);
out.push(`--   db/schema.rb @ tag v${VERSION}`);
out.push(`-- via extract.js. Implicit Rails primary keys are rendered as bigserial;`);
out.push(`-- Rails' generated index/FK names are preserved or auto-named by PostgreSQL.`);

const tables = new Map(); // name -> { columns: [], constraints: [], indexes: [] }
const foreignKeySpecs = [];
const extensions = [];
const warnings = [];

/** Rails' on_delete symbols -> SQL actions */
const ON_DELETE = {
  cascade: 'CASCADE',
  nullify: 'SET NULL',
  restrict: 'RESTRICT',
};

/**
 * Identifiers that FigSchema's SQL import classifies as table-constraint
 * keywords before reading them as columns (KEY, INDEX, CHECK, ...). Quoting
 * them makes the import read them as columns; PostgreSQL accepts the quotes
 * regardless.
 */
const CONSTRAINT_KEYWORDS = new Set([
  'constraint', 'primary', 'foreign', 'unique', 'check',
  'key', 'index', 'fulltext', 'spatial', 'exclude', 'like',
]);

function quoteIfNeeded(name) {
  return CONSTRAINT_KEYWORDS.has(name.toLowerCase()) ? `"${name}"` : name;
}

let current = null;
for (const line of source.split('\n')) {
  let m;
  if ((m = line.match(/^  enable_extension "([^"]+)"/))) {
    extensions.push(m[1]);
    continue;
  }
  if ((m = line.match(/^  create_table "([^"]+)"(, (.+))? do \|t\|$/))) {
    const [, name, , optsRaw] = m;
    const opts = parseOptions(optsRaw ?? '');
    if (opts.id && opts.id !== ':cascade') warnings.push(`${name}: non-default id option ${optsRaw}`);
    current = { name, columns: [`  id bigserial PRIMARY KEY`], constraints: [], indexes: [] };
    tables.set(name, current);
    continue;
  }
  if (current && line.startsWith('    t.index ')) {
    const rest = line.slice('    t.index '.length).trim();
    const cols = rest.match(/^\[([^\]]*)\]/)?.[1]?.replace(/"/g, '') ?? '';
    const opts = parseOptions(rest.replace(/^\[([^\]]*)\]\s*,?\s*/, ''));
    const unique = opts['unique'] === 'true' ? 'UNIQUE ' : '';
    const where = opts['where'] ? ` WHERE ${opts['where']}` : '';
    current.indexes.push(`CREATE ${unique}INDEX "${opts['name']}" ON ${current.name} (${cols})${where};`);
    continue;
  }
  if (current && (m = line.match(/^    t\.(\w+) "([^"]+)"(?:, (.+))?\s*$/))) {
    const [, type, name, optsRaw] = m;
    if (type === 'index') {
      const opts = parseOptions(optsRaw ?? '');
      const cols = (optsRaw ?? '').match(/^\[([^\]]*)\]/)?.[1] ?? '';
      const unique = /unique: true/.test(optsRaw ?? '') ? 'UNIQUE ' : '';
      current.indexes.push(`CREATE ${unique}INDEX "${opts.name}" ON ${current.name} (${cols.replace(/"/g, '')});`);
      continue;
    }
    const opts = parseOptions(optsRaw ?? '');
    const pgType = PG_TYPES[type] ?? (warnings.push(`${current.name}.${name}: unknown type ${type}`), type);
    const notNull = opts['null'] === 'false' ? ' NOT NULL' : '';
    current.columns.push(`  ${quoteIfNeeded(name)} ${pgType}${notNull}${sqlDefault(opts['default'])}`);
    continue;
  }
  if (current && /^  end$/.test(line)) {
    current = null;
    continue;
  }
  if ((m = line.match(/^  add_foreign_key "([^"]+)", "([^"]+)"(?:, (.+))?\s*$/))) {
    foreignKeySpecs.push({ from: m[1], to: m[2], opts: parseOptions(m[3] ?? '') });
  }
}

let fkCount = 0;
for (const { from, to, opts } of foreignKeySpecs) {
  const table = tables.get(from);
  if (!table) {
    warnings.push(`FK source table not found: ${from}`);
    continue;
  }
  const column = opts['column'] ?? `${singularize(to)}_id`;
  const primaryKey = opts['primary_key'] ?? 'id';
  if (!table.columns.some((c) => c.trim().startsWith(`${column} `))) {
    warnings.push(`FK column not found: ${from}.${column} (references -> ${to})`);
    continue;
  }
  const rule = ON_DELETE[(opts['on_delete'] ?? '').replace(/^:/, '').toLowerCase()] ?? '';
  table.constraints.push(`  FOREIGN KEY (${column}) REFERENCES ${to} (${primaryKey})${rule}`);
  fkCount++;
}

for (const extension of extensions) {
  out.push(`CREATE EXTENSION IF NOT EXISTS ${extension.replace('pg_catalog.', '')};`);
}

let tableCount = 0;
let columnCount = 0;
for (const [name, { columns, constraints, indexes }] of tables) {
  tableCount++;
  columnCount += columns.length;
  out.push('');
  out.push(`CREATE TABLE ${name} (`);
  out.push([...columns, ...constraints].join(',\n'));
  out.push(`);`);
  for (const index of indexes) out.push(index);
}

out.push('');
out.push(`-- ${tableCount} tables, ${columnCount} columns (+ implicit ids), ${fkCount} foreign keys, extensions: ${extensions.join(', ') || 'none'}`);
for (const warning of warnings) out.push(`-- WARNING: ${warning}`);
process.stdout.write(out.join('\n') + '\n');
