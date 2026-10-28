/**
 * Provenance tool for the Mastodon gallery entry.
 *
 * Converts Mastodon's own ActiveRecord schema definition - db/schema.rb at a
 * pinned release tag - into PostgreSQL DDL, rendering the types Rails creates.
 * Implicit Rails primary keys are rendered as `bigserial`; tables declaring
 * `id: :bigint, default: -> { ... }` render the lambda expression as the
 * default. add_foreign_key constraints become table-level FOREIGN KEY clauses
 * (constraint names Rails generates at runtime are left to PostgreSQL).
 *
 * Usage: node extract.js <version> > work/mastodon-<version>.sql
 * (schema.rb stays in work/, never committed)
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
  float: 'float8',
  json: 'json',
  jsonb: 'jsonb',
  inet: 'inet',
  cidr: 'cidr',
  uuid: 'uuid',
  tsvector: 'tsvector',
  xml: 'xml',
};

/** Identifiers FigSchema's SQL import classifies as table-constraint
 *  keywords before reading them as columns - quoted when used as names. */
const CONSTRAINT_KEYWORDS = new Set([
  'constraint', 'primary', 'foreign', 'unique', 'check',
  'key', 'index', 'fulltext', 'spatial', 'exclude', 'like',
]);

function quoteIfNeeded(name) {
  return CONSTRAINT_KEYWORDS.has(name.toLowerCase()) ? `"${name}"` : name;
}

/** Rails' naive singularization for inferred foreign-key columns */
function singularize(table) {
  if (table.endsWith('ies')) return table.slice(0, -3) + 'y';
  if (table.endsWith('s')) return table.slice(0, -1);
  return table;
}

/** split "key: value, ..." honouring quotes, -> lambdas and nested braces */
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
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    if (ch === '}' || ch === ']' || ch === ')') depth--;
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

/** render an ActiveRecord default literal as SQL (lambdas stay raw SQL) */
function sqlDefault(raw) {
  if (raw === undefined) return '';
  const lambda = raw.match(/^-> \{ ([\s\S]+) \}$/);
  if (lambda) return ` DEFAULT ${lambda[1].trim()}`;
  if (raw === 'true' || raw === 'false') return ` DEFAULT ${raw}`;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return ` DEFAULT ${raw}`;
  return ` DEFAULT '${raw.replace(/'/g, "''")}'`;
}

/** same, for the create_table-level `default: -> { ... }` identity option */
function sqlDefaultFromRaw(raw) {
  const lambda = raw.match(/^-> \{ ([\s\S]+) \}$/);
  if (!lambda) return '';
  let body = lambda[1].trim();
  if (body.startsWith('"') && body.endsWith('"')) body = body.slice(1, -1);
  return ` DEFAULT ${body}`;
}

/** Rails' on_delete symbols -> SQL actions */
const ON_DELETE = {
  cascade: 'CASCADE',
  nullify: 'SET NULL',
  restrict: 'RESTRICT',
};

const out = [];
out.push(`-- Mastodon ${VERSION} database schema (PostgreSQL, fresh install)`);
out.push(`-- Generated from Mastodon's own ActiveRecord schema definition:`);
out.push(`--   db/schema.rb @ tag ${VERSION}`);
out.push(`-- via extract.js. Implicit Rails primary keys are rendered as bigserial;`);
out.push(`-- tables with explicit identity defaults render their lambda SQL.`);
out.push(`-- Rails' generated index names are preserved; FK constraint names are`);
out.push(`-- left to PostgreSQL to auto-name.`);

const tables = new Map(); // name -> { columns: [], constraints: [], indexes: [] }
const foreignKeySpecs = [];
const warnings = [];

let current = null;
for (const line of source.split('\n')) {
  let m;
  if ((m = line.match(/^  enable_extension "([^"]+)"/))) {
    // extensions recorded, rendered as CREATE EXTENSION for completeness
    out.push(`CREATE EXTENSION IF NOT EXISTS ${m[1].replace('pg_catalog.', '')};`);
    continue;
  }
  if ((m = line.match(/^  create_table "([^"]+)"(?:, (.+))? do \|t\|$/))) {
    const [, name, optsRaw] = m;
    const opts = parseOptions(optsRaw ?? '');
    let entry;
    if (opts['primary_key']) {
      // PK declared at create_table level - it IS the first column and an FK source
      const pkCol = quoteIfNeeded(opts['primary_key'].replace(/"/g, ''));
      entry = { name, columns: [`  ${pkCol} bigint NOT NULL PRIMARY KEY`], constraints: [], indexes: [] };
    } else if (opts['id'] === ':uuid') {
      entry = { name, columns: [`  id uuid DEFAULT gen_random_uuid() PRIMARY KEY`], constraints: [], indexes: [] };
    } else if (opts['id'] === ':bigint' && opts['default']) {
      entry = { name, columns: [`  id bigint${sqlDefaultFromRaw(opts['default'])} PRIMARY KEY`], constraints: [], indexes: [] };
    } else if (opts['id'] === 'false') {
      entry = { name, columns: [], constraints: [], indexes: [] };
    } else {
      if (opts['id']) warnings.push(`${name}: unhandled id option ${optsRaw}`);
      entry = { name, columns: [`  id bigserial PRIMARY KEY`], constraints: [], indexes: [] };
    }
    tables.set(name, entry);
    current = entry;
    continue;
  }
  if (current && line.startsWith('    t.index ')) {
    const rest = line.slice('    t.index '.length).trim();
    const cols = rest.match(/^\[([^\]]*)\]/)?.[1]?.replace(/"/g, '') ?? '';
    const opts = parseOptions(rest.replace(/^\[([^\]]*)\]\s*,?\s*/, ''));
    const unique = opts['unique'] === 'true' ? 'UNIQUE ' : '';
    const using = opts['using'] ? ` USING ${opts['using'].replace(/^:/, '')}` : '';
    const where = opts['where'] ? ` WHERE ${opts['where']}` : '';
    current.indexes.push(`CREATE ${unique}INDEX "${opts['name']}" ON ${current.name}${using} (${cols})${where};`);
    continue;
  }
  if (current && (m = line.match(/^    t\.(\w+) "([^"]+)"(?:, (.+))?\s*$/))) {
    const [, type, name, optsRaw] = m;
    const opts = parseOptions(optsRaw ?? '');
    let pgType = PG_TYPES[type] ?? (warnings.push(`${current.name}.${name}: unknown type ${type}`), type);
    if (type === 'string' && opts['limit']) pgType = `varchar(${opts['limit']})`;
    if (type === 'decimal' && opts['precision']) {
      pgType = `numeric(${opts['precision']},${opts['scale'] ?? 0})`;
    }
    const notNull = opts['null'] === 'false' ? ' NOT NULL' : '';
    const arr = opts['array'] === 'true' ? '[]' : '';
    current.columns.push(`  ${quoteIfNeeded(name)} ${pgType}${arr}${notNull}${sqlDefault(opts['default'])}`);
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
  if (!table) { warnings.push(`FK source table not found: ${from}`); continue; }
  const column = opts['column'] ?? null;
  const primaryKey = opts['primary_key'] ?? 'id';
  if (column) {
    if (!table.columns.some((c) => c.trim().startsWith(`${column} `))) {
      warnings.push(`FK column not found: ${from}.${column} (references -> ${to})`);
      continue;
    }
  }
  // infer the FK column, validating candidates against the table's real columns
  let inferred = `${singularize(to)}_id`;
  if (!column) {
    const candidates = [inferred];
    if (to.endsWith('ses')) candidates.push(`${to.slice(0, -2)}_id`);
    candidates.push(`${to}_id`);
    inferred = candidates.find((c) => table.columns.some((x) => x.trim().startsWith(`${c} `))) ?? inferred;
  }
  const rule = ON_DELETE[(opts['on_delete'] ?? '').replace(/^:/, '').toLowerCase()] ?? '';
  table.constraints.push(`  FOREIGN KEY (${column ?? inferred}) REFERENCES ${to} (${primaryKey})${rule}`);
  fkCount++;
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
out.push(`-- ${tableCount} tables, ${columnCount} columns (+ implicit ids), ${fkCount} foreign keys`);
for (const warning of warnings) out.push(`-- WARNING: ${warning}`);
process.stdout.write(out.join('\n') + '\n');
