/**
 * Provenance tool for the MediaWiki gallery entry.
 *
 * Converts MediaWiki's own abstract schema definition - sql/tables.json at a
 * pinned release tag - into the MySQL DDL a fresh install creates, by
 * rendering MediaWiki's documented type mapping:
 *
 *   bigint -> bigint(20)          integer -> int(10)         smallint -> smallint
 *   mwtinyint -> tinyint(N)       string -> varchar(N)       text -> text
 *   binary(fixed) -> binary(N)    binary -> varbinary(N)
 *   mwtimestamp -> binary(14) (varbinary(14) when allowInfinite)
 *   datetimetz -> binary(14)     mwenum -> enum(...)        blob(N) -> tiny/blob/mediumblob
 *   float -> float
 *
 * NOT NULL only when options.notnull is explicitly true (the JSON always
 * declares it). Prefix lengths and FULLTEXT flags from index definitions are
 * preserved; MediaWiki declares NO foreign keys (integrity is in PHP, like
 * WordPress) so relationships are hand-drawn in the diagram.
 *
 * Usage: node extract.js <version> > work/mediawiki-<version>.sql
 * (tables.json stays in work/, never committed)
 */

const VERSION = process.argv[2] || 'unknown';
const tables = JSON.parse(require('fs').readFileSync(__dirname + '/work/tables.json', 'utf8'));

/** Identifiers FigSchema's SQL import classifies as table-constraint
 *  keywords before reading them as columns - quoted when used as names. */
const CONSTRAINT_KEYWORDS = new Set([
  'constraint', 'primary', 'foreign', 'unique', 'check',
  'key', 'index', 'fulltext', 'spatial', 'exclude', 'like',
]);

function quoteIfNeeded(name) {
  return CONSTRAINT_KEYWORDS.has(name.toLowerCase()) ? `"${name}"` : name;
}

function blobType(len) {
  if (len <= 255) return 'tinyblob';
  if (len <= 65535) return 'blob';
  if (len <= 16777215) return 'mediumblob';
  return 'longblob';
}

function mysqlType(c) {
  const o = c.options || {};
  const len = o.length;
  switch (c.type) {
    case 'bigint': return 'bigint(20)';
    case 'integer': return 'int(10)';
    case 'smallint': return 'smallint';
    case 'mwtinyint': return `tinyint(${len ?? 1})`;
    case 'string': return `varchar(${len ?? 255})`;
    case 'binary': return o.fixed ? `binary(${len})` : `varbinary(${len})`;
    case 'mwtimestamp': return o.PlatformOptions?.allowInfinite ? 'varbinary(14)' : 'binary(14)';
    case 'datetimetz': return 'binary(14)';
    case 'mwenum': {
      const values = o.PlatformOptions?.enum_values ?? [];
      return `enum(${values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(',')})`;
    }
    case 'blob': return blobType(len);
    case 'text': return 'text';
    case 'float': return 'float';
    default: return null;
  }
}

function sqlDefault(raw) {
  if (raw === null) return ' DEFAULT NULL';
  if (typeof raw === 'number') return ` DEFAULT ${raw}`;
  if (typeof raw === 'boolean') return ` DEFAULT ${raw ? 1 : 0}`;
  if (typeof raw === 'object') return ` DEFAULT '${JSON.stringify(raw).replace(/'/g, "''")}'`;
  return ` DEFAULT '${String(raw).replace(/'/g, "''")}'`;
}

const out = [];
out.push(`-- MediaWiki ${VERSION} database schema (MySQL, fresh install)`);
out.push(`-- Generated from MediaWiki's own abstract schema definition:`);
out.push(`--   sql/tables.json @ tag ${VERSION}`);
out.push(`-- via extract.js, rendering MediaWiki's documented type mapping.`);
out.push(`-- MediaWiki declares no foreign keys (integrity is in PHP).`);

const warnings = [];
let columnCount = 0;
let indexCount = 0;
let uniqueCount = 0;
let pkCount = 0;

for (const t of tables) {
  const columns = [];
  for (const c of t.columns) {
    columnCount++;
    const type = mysqlType(c);
    if (!type) {
      warnings.push(`${t.name}.${c.name}: unknown type ${c.type}`);
      continue;
    }
    const o = c.options || {};
    const notNull = o.notnull === true ? ' NOT NULL' : '';
    const unsigned = o.unsigned ? ' unsigned' : '';
    const ai = o.autoincrement ? ' AUTO_INCREMENT' : '';
    const def = 'default' in o ? sqlDefault(o.default) : '';
    columns.push(`  ${quoteIfNeeded(c.name)} ${type}${unsigned}${notNull}${ai}${def}`);
  }

  const keys = [];
  if (Array.isArray(t.pk) && t.pk.length) {
    pkCount++;
    keys.push(`  PRIMARY KEY (${t.pk.join(', ')})`);
  }
  for (const i of t.indexes ?? []) {
    indexCount++;
    if (i.unique) uniqueCount++;
    const lengths = i.options?.lengths;
    const cols = i.columns
      .map((c, idx) => {
        const l = Array.isArray(lengths) ? lengths[idx] : undefined;
        return l != null ? `${c}(${l})` : c;
      })
      .join(', ');
    const flag = Array.isArray(i.flags) && i.flags.includes('FULLTEXT') ? 'FULLTEXT ' : '';
    keys.push(`  ${flag}${i.unique ? 'UNIQUE ' : ''}KEY \`${i.name}\` (${cols})`);
  }

  const tableOpts = (t.table_options ?? []).join(' ');
  const closing = tableOpts || 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
  out.push('');
  out.push(`CREATE TABLE ${t.name} (`);
  out.push([...columns, ...keys].join(',\n'));
  out.push(`) ${closing};`);
}

out.push('');
out.push(`-- ${tables.length} tables, ${columnCount} columns, ${pkCount} primary keys, ${indexCount} secondary indexes (${uniqueCount} unique), 0 foreign keys`);
for (const warning of warnings) out.push(`-- WARNING: ${warning}`);
process.stdout.write(out.join('\n') + '\n');
