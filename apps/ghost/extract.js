/**
 * Provenance tool for the Ghost gallery entry.
 *
 * Converts Ghost's own schema definition - ghost/core/server/data/schema/schema.js
 * at a pinned release tag - into the MySQL DDL a fresh production install gets,
 * by mirroring the knex mapping Ghost's commands.js performs (varchar maxlengths,
 * text fieldtypes, NOT NULL by default, unsigned, defaults, indexes, and the
 * column `references` foreign keys with their delete rules).
 *
 * Handles schema.js' @@PRIMARY_KEY@@ (composite), @@UNIQUE_CONSTRAINTS@@ and
 * @@INDEXES@@ (string arrays, {columns, length} prefix indexes, {columns,
 * indexName} named indexes) declarations.
 *
 * Tables listed in schema's in-development.ts are excluded: knex-migrator never
 * creates them in production databases.
 *
 * Usage: node extract.js <ghost-version> > work/ghost-<version>.sql
 * (schema.js and the other downloaded files stay in work/, never committed)
 */

const VERSION = process.argv[2] || 'unknown';
const schema = require('./work/schema.js');

/** ghost/core/server/data/schema/in-development.ts */
const IN_DEVELOPMENT_TABLES = [
  'app_installations',
  'app_installation_manifests',
  'jobs_outbox',
];

/** knex's MySQL type output per schema.js `type` (see commands.js) */
const KNEX_MYSQL_TYPES = {
  boolean: 'tinyint(1)',
  integer: 'int',
  bigInteger: 'bigint',
  dateTime: 'datetime',
};

/**
 * Identifiers that FigSchema's SQL import classifies as table-constraint
 * keywords before reading them as columns (KEY, INDEX, CHECK, ...). Quoting
 * them makes the import read them as columns; MySQL accepts the quotes
 * regardless (Ghost's schema has a `key` column).
 */
const CONSTRAINT_KEYWORDS = new Set([
  'constraint', 'primary', 'foreign', 'unique', 'check',
  'key', 'index', 'fulltext', 'spatial', 'exclude', 'like',
]);

function quoteIfNeeded(name) {
  return CONSTRAINT_KEYWORDS.has(name.toLowerCase()) ? `\`${name}\`` : name;
}

function mysqlType(spec) {
  if (spec.type === 'text') {
    // knex's MySQL compiler concatenates the fieldtype: 'long' -> 'longtext'
    const fieldtype = spec.fieldtype ?? 'text';
    return (fieldtype === 'text' ? 'text' : `${fieldtype}text`).toUpperCase();
  }
  if (spec.type === 'binary') {
    return spec.maxlength ? `varbinary(${spec.maxlength})` : 'blob';
  }
  if (spec.type === 'string') {
    return `varchar(${spec.maxlength ?? 191})`;
  }
  return KNEX_MYSQL_TYPES[spec.type] ?? spec.type;
}

function sqlDefault(spec) {
  if (!Object.hasOwn(spec, 'defaultTo')) {
    return '';
  }
  const value = spec.defaultTo;
  if (typeof value === 'boolean') return ` DEFAULT ${value ? 1 : 0}`;
  if (typeof value === 'number') return ` DEFAULT ${value}`;
  return ` DEFAULT '${String(value).replace(/'/g, "''")}'`;
}

function deleteRule(spec) {
  if (spec.cascadeDelete === true) return ' ON DELETE CASCADE';
  if (spec.setNullDelete === true) return ' ON DELETE SET NULL';
  if (spec.restrictDelete === true) return ' ON DELETE RESTRICT';
  return '';
}

/** @@INDEXES@@/@@UNIQUE_CONSTRAINTS@@ entries: ["a","b"] or {columns, length?, indexName?} */
function indexParts(entry) {
  if (Array.isArray(entry)) return { columns: entry };
  return { columns: entry.columns, length: entry.length, indexName: entry.indexName };
}

const out = [];
out.push(`-- Ghost ${VERSION} database schema (MySQL, fresh production install)`);
out.push(`-- Generated from Ghost's own schema definition:`);
out.push(`--   ghost/core/server/data/schema/schema.js @ tag v${VERSION}`);
out.push(`-- via extract.js, mirroring schema/commands.js' knex-to-MySQL mapping.`);
out.push(`-- In-development tables (never created in production) are excluded.`);

let tableCount = 0;
let columnCount = 0;
let fkCount = 0;
const skipped = [];

for (const [table, spec] of Object.entries(schema)) {
  if (IN_DEVELOPMENT_TABLES.includes(table)) {
    skipped.push(table);
    continue;
  }
  tableCount++;

  const columns = [];
  const uniques = [];
  const indexes = [];
  const foreignKeys = [];
  const primaryKey = [...(spec['@@PRIMARY_KEY@@'] ?? [])];

  for (const [column, c] of Object.entries(spec)) {
    if (column.startsWith('@@')) continue;
    columnCount++;

    const notNull = c.nullable === true ? '' : ' NOT NULL';
    columns.push(`  ${quoteIfNeeded(column)} ${mysqlType(c)}${c.unsigned ? ' unsigned' : ''}${notNull}${sqlDefault(c)}`);

    if (c.primary === true) primaryKey.push(column);
    if (c.unique === true) uniques.push(`  UNIQUE KEY \`${table}_${column}_unique\` (${column})`);
    if (c.index === true) indexes.push(`  KEY \`${table}_${column}_index\` (${column})`);

    if (c.references) {
      const [refTable, refColumn] = c.references.split('.');
      foreignKeys.push(
        `  CONSTRAINT \`${table}_${column}_foreign\` FOREIGN KEY (${column}) REFERENCES ${refTable} (${refColumn})${deleteRule(c)}`,
      );
      fkCount++;
    }
  }

  for (const entry of spec['@@UNIQUE_CONSTRAINTS@@'] ?? []) {
    const { columns: cols, indexName } = indexParts(entry);
    const name = indexName ?? `${table}_${cols.join('_')}_unique`;
    uniques.push(`  UNIQUE KEY \`${name}\` (${cols.join(', ')})`);
  }

  for (const entry of spec['@@INDEXES@@'] ?? []) {
    const { columns: cols, length, indexName } = indexParts(entry);
    const name = indexName ?? `${table}_${cols.join('_')}_index`;
    const rendered = cols.map((c) => (length ? `${c}(${length})` : c)).join(', ');
    indexes.push(`  KEY \`${name}\` (${rendered})`);
  }

  if (primaryKey.length > 0) {
    columns.push(`  PRIMARY KEY (${primaryKey.join(', ')})`);
  }

  out.push('');
  out.push(`CREATE TABLE ${table} (`);
  out.push([...columns, ...uniques, ...indexes, ...foreignKeys].join(',\n'));
  out.push(`) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
}

out.push('');
out.push(`-- ${tableCount} tables, ${columnCount} columns, ${fkCount} foreign keys`);
out.push(`-- excluded in-development tables: ${skipped.join(', ') || 'none'}`);
process.stdout.write(out.join('\n') + '\n');
