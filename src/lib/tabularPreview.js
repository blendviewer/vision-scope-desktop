/** Tabular formats that support DuckDB streaming preview (no full-file JS buffer). */
const DUCKDB_TABULAR_EXTENSIONS = new Set(['csv', 'tsv', 'parquet', 'jsonl', 'ndjson', 'arrow', 'feather', 'avro']);

/** SQLite extensions routed through sql.js (multi-table model). */
const SQLITE_TABULAR_EXTENSIONS = new Set(['db', 'sqlite', 'sqlite3']);

/**
 * @param {string} filename
 */
export function isDuckdbTabularFilename(filename) {
  const ext = String(filename || '').split('.').pop()?.toLowerCase() ?? '';
  return DUCKDB_TABULAR_EXTENSIONS.has(ext) || SQLITE_TABULAR_EXTENSIONS.has(ext);
}
