// Bring existing pre-catalog databases up to the schema expected by 0014–0017.
// Only static, additive DDL is executed; existing values and migration records
// are never rewritten.
const required = {
  artworks: ['id', 'artist_id', 'title', 'medium', 'dimensions', 'price_cents', 'status', 'image_url', 'metadata_hash'],
  marketplace_orders: ['artwork_id'],
  transactions: ['artwork_id', 'tx_reference', 'buyer_email', 'created_at'],
  d1_migrations: ['name'],
};
const additions = [
  ['artworks', 'fulfillment_uri', 'TEXT'],
  ['artworks', 'buyer_email', 'TEXT'],
  ['artworks', 'access_token', 'TEXT'],
  ['artworks', 'is_demo', 'INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1))'],
  ['transactions', 'buyer_wallet', 'TEXT'],
];

export async function prepareLegacySchema(query, log = () => {}) {
  const columns = new Map();
  for (const [table, names] of Object.entries(required)) {
    const rows = await query(`PRAGMA table_info("${table}")`);
    const present = new Set(rows.map(row => row.name));
    const missing = names.filter(name => !present.has(name));
    if (missing.length) throw new Error(`Unexpected ${table} schema: missing ${missing.join(', ')}. Inspect the database before continuing.`);
    columns.set(table, present);
  }
  // Recreating this flag after 0016 has already run could expose demo rows.
  const migration = await query("SELECT name FROM d1_migrations WHERE name = '0016_catalog_release.sql'");
  if (migration.length && !columns.get('artworks').has('is_demo')) {
    throw new Error('Migration 0016 is already recorded but artworks.is_demo is missing. Inspect the database before continuing.');
  }

  async function verifyAccessTokenIndex() {
    const existing = await query("SELECT tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_artworks_access_token'");
    if (!existing.length) return false;
    const indexes = await query('PRAGMA index_list("artworks")');
    const named = indexes.find(index => index.name === 'idx_artworks_access_token');
    const fields = await query('PRAGMA index_info("idx_artworks_access_token")');
    const coversAllTokens = named?.partial === 0 || (
      named?.partial === 1 && /\bWHERE\s+access_token\s+IS\s+NOT\s+NULL\s*;?\s*$/i.test(existing[0].sql || '')
    );
    if (existing[0].tbl_name !== 'artworks' || named?.unique !== 1 || !coversAllTokens ||
        fields.length !== 1 || fields[0].name !== 'access_token') {
      throw new Error('The existing idx_artworks_access_token does not uniquely index access_token. Inspect it before continuing.');
    }
    return true;
  }
  const indexExists = await verifyAccessTokenIndex();

  for (const [table, column, definition] of additions) {
    if (columns.get(table).has(column)) continue;
    try {
      await query(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
    } catch (error) {
      // A concurrent preflight may have added the same column. Do not hide
      // any other failure, including an indeterminate schema read.
      const current = await query(`PRAGMA table_info("${table}")`);
      if (!current.some(row => row.name === column)) throw error;
    }
    log(`Prepared ${table}.${column}.`);
  }

  if (!indexExists) {
    await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_artworks_access_token ON artworks(access_token) WHERE access_token IS NOT NULL');
    if (!await verifyAccessTokenIndex()) throw new Error('Unable to verify the artwork access-token index.');
    log('Prepared the unique artwork access-token index.');
  }
}
