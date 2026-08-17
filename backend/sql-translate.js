'use strict';

// Translates SQLite-flavored SQL (as written throughout server.js) into
// Postgres-compatible SQL, so the ~400 existing query call sites can stay
// textually unchanged. Two things need translating:
//
//   1. Positional placeholders: SQLite uses `?`; Postgres uses `$1, $2, ...`.
//   2. camelCase identifiers: Postgres folds unquoted identifiers to
//      lowercase, but this schema and the JS code that reads query results
//      both use exact camelCase (accountId, createdAt, ...). Known
//      identifiers get wrapped in double quotes so Postgres preserves case.
//
// Both translations must skip over single-quoted string literals — this
// codebase has real `?` characters inside survey-question text
// ("...on tracking?"), so a naive global replace would corrupt those.

const fs = require('fs');
const path = require('path');

// Build the set of camelCase identifiers (columns + tables) that need
// quoting, from the schema extracted out of the original SQLite DDL.
let KNOWN_IDENTIFIERS = new Set();
try {
  const schemaPath = path.join(__dirname, 'schema-identifiers.json');
  const list = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  KNOWN_IDENTIFIERS = new Set(list);
} catch (e) {
  // If the identifier list is missing, translation still runs (placeholder
  // conversion still works) but camelCase columns won't be quoted — this
  // would break queries, so surface it loudly rather than fail silently.
  console.error('[sql-translate] WARNING: schema-identifiers.json not found — camelCase identifiers will NOT be quoted. Run generate-identifier-list.js.');
}

// SQL keywords/functions that happen to be mixed-case in this codebase's
// query text (e.g. none currently, but kept as a safety net) should never
// be quoted even if they collide with a known identifier name.
const NEVER_QUOTE = new Set([
  'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'ORDER', 'BY',
  'ASC', 'DESC', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'SELECT', 'FROM',
  'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'JOIN',
  'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS', 'DISTINCT', 'COUNT', 'SUM',
  'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'EXISTS',
]);

// Split SQL into alternating [nonLiteral, literal, nonLiteral, literal, ...]
// segments on single-quoted string boundaries, respecting '' as an escaped
// quote inside a literal (standard SQL escaping, used identically by both
// SQLite and Postgres).
function splitOnStringLiterals(sql) {
  const segments = [];
  let i = 0;
  let cur = '';
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      segments.push({ text: cur, literal: false });
      cur = '';
      let lit = "'";
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { lit += "''"; i += 2; continue; }
        if (sql[i] === "'") { lit += "'"; i++; break; }
        lit += sql[i]; i++;
      }
      segments.push({ text: lit, literal: true });
      continue;
    }
    cur += ch;
    i++;
  }
  segments.push({ text: cur, literal: false });
  return segments;
}

// SQLite's autoincrement syntax has no direct Postgres equivalent — this
// only appears in the CREATE TABLE statements server.js runs at startup to
// self-create its schema, never in application queries.
function translateSqliteTypesInSegment(text) {
  return text.replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/gi, 'INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY');
}

function quoteIdentifiersInSegment(text) {
  return text.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (word) => {
    if (NEVER_QUOTE.has(word.toUpperCase())) return word;
    if (KNOWN_IDENTIFIERS.has(word)) return `"${word}"`;
    return word;
  });
}

// Converts every `?` in non-literal segments to sequential `$1, $2, ...`.
function convertPlaceholders(text, counterRef) {
  return text.replace(/\?/g, () => `$${++counterRef.n}`);
}

/**
 * translate(sql) -> postgres-flavored SQL string.
 * Idempotent-ish: safe to call once per query execution (queries are static
 * strings built fresh per call site in this codebase, not cached/reused
 * across the translation boundary).
 */
function translate(sql) {
  const segments = splitOnStringLiterals(sql);
  const counter = { n: 0 };
  let out = '';
  for (const seg of segments) {
    if (seg.literal) { out += seg.text; continue; }
    out += convertPlaceholders(quoteIdentifiersInSegment(translateSqliteTypesInSegment(seg.text)), counter);
  }
  return out;
}

module.exports = { translate, splitOnStringLiterals, KNOWN_IDENTIFIERS };
