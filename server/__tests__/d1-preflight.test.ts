import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { prepareLegacySchema } from '../../scripts/d1-preflight.mjs';

let db: DatabaseSync;
const query = async (sql: string): Promise<any[]> => db.prepare(sql).all() as any[];
function columns(table: string) { return db.prepare(`PRAGMA table_info("${table}")`).all().map(row => row.name); }
function runMigration(name: string) {
  db.exec(readFileSync(`migrations/${name}`, 'utf8'));
  db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
}
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)');
  for (const name of readdirSync('migrations').filter(name => name.endsWith('.sql') && name < '0014').sort()) runMigration(name);
  // 0014 is already recorded on the failing remote, although its legacy fields
  // are not guaranteed to exist in that database.
  db.exec('ALTER TABLE artworks ADD COLUMN access_token TEXT');
  runMigration('0014_usdc_checkout.sql');
  runMigration('0015_treasury_withdrawal_demos.sql');
});
afterEach(() => db.close());

describe('existing D1 schema preparation', () => {
  it('repairs missing prerequisites, preserves rows, and allows the full pending migration chain', async () => {
    db.exec(`
      UPDATE artworks SET status='sold', access_token='existing-token' WHERE id='art_001';
      INSERT INTO transactions (artwork_id, buyer_email, tx_reference, created_at)
        VALUES ('art_001', 'buyer@example.test', 'synthetic-receipt', 1);
    `);
    const before = db.prepare('SELECT id, status, access_token FROM artworks ORDER BY id').all();
    const receipts = db.prepare('SELECT * FROM transactions').all();
    await prepareLegacySchema(query);
    expect(columns('artworks')).toEqual(expect.arrayContaining(['fulfillment_uri', 'buyer_email', 'access_token', 'is_demo']));
    expect(columns('transactions')).toContain('buyer_wallet');
    expect(db.prepare('SELECT id, status, access_token FROM artworks ORDER BY id').all()).toEqual(before);
    expect(db.prepare('SELECT id, artwork_id, buyer_email, tx_reference, created_at FROM transactions').all()).toEqual(receipts);
    for (const name of readdirSync('migrations').filter(name => name.endsWith('.sql') && name >= '0016').sort()) runMigration(name);
    expect(db.prepare("SELECT asset_id FROM settlement_claims WHERE tx_reference='synthetic-receipt'").get()).toMatchObject({ asset_id: 'art_001' });
    expect(() => db.exec("UPDATE settlement_claims SET asset_id='other'")).toThrow();
    await prepareLegacySchema(query);
  });

  it('preserves existing fulfillment, buyer, and wallet data and only marks an unchanged eligible demo', async () => {
    db.exec(`
      ALTER TABLE artworks ADD COLUMN fulfillment_uri TEXT;
      ALTER TABLE artworks ADD COLUMN buyer_email TEXT;
      ALTER TABLE transactions ADD COLUMN buyer_wallet TEXT;
      UPDATE artworks SET fulfillment_uri='https://private.test/item', buyer_email='buyer@example.test',
        image_url='https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1200&q=85' WHERE id='art_001';
      UPDATE artworks SET image_url='https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&w=1200&q=85' WHERE id='art_004';
      INSERT INTO transactions (artwork_id, buyer_email, tx_reference, created_at, buyer_wallet)
        VALUES ('art_002','buyer@example.test','receipt',1,'0xwallet');
    `);
    await prepareLegacySchema(query);
    await prepareLegacySchema(query);
    runMigration('0016_catalog_release.sql');
    runMigration('0017_collector_recovery.sql');
    expect(db.prepare("SELECT fulfillment_uri, buyer_email, is_demo FROM artworks WHERE id='art_001'").get()).toMatchObject({
      fulfillment_uri: 'https://private.test/item', buyer_email: 'buyer@example.test', is_demo: 0,
    });
    expect(db.prepare("SELECT is_demo FROM artworks WHERE id='art_004'").get()).toMatchObject({ is_demo: 1 });
    expect(db.prepare("SELECT buyer_wallet FROM transactions WHERE tx_reference='receipt'").get()).toMatchObject({ buyer_wallet: '0xwallet' });
  });

  it('rejects unknown schemas and a missing flag on an already migrated database before writing', async () => {
    db.exec("INSERT INTO d1_migrations(name) VALUES ('0016_catalog_release.sql')");
    await expect(prepareLegacySchema(query)).rejects.toThrow('0016 is already recorded');
    expect(columns('artworks')).not.toContain('fulfillment_uri');
    db.exec("DELETE FROM d1_migrations WHERE name='0016_catalog_release.sql'; DROP TABLE transactions;");
    await expect(prepareLegacySchema(query)).rejects.toThrow('Unexpected transactions schema');
    expect(columns('artworks')).not.toContain('fulfillment_uri');
  });

  it('rejects a misleading non-unique access-token index', async () => {
    db.exec('DROP INDEX idx_artworks_access_token; CREATE INDEX idx_artworks_access_token ON artworks(access_token)');
    await expect(prepareLegacySchema(query)).rejects.toThrow('does not uniquely index access_token');
    expect(columns('artworks')).not.toContain('fulfillment_uri');
    db.exec('DROP INDEX idx_artworks_access_token; CREATE UNIQUE INDEX idx_artworks_access_token ON transactions(tx_reference)');
    await expect(prepareLegacySchema(query)).rejects.toThrow('does not uniquely index access_token');
    expect(columns('artworks')).not.toContain('fulfillment_uri');
  });
});
