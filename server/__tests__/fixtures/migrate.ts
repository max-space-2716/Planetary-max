import { readFileSync, readdirSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

// These fields and historical seed URLs predated the pending migrations in
// production D1 (see 0014, 0016 and 0017). Recreate that starting state in tests.
export function migrateFixture(db: DatabaseSync, before?: string) {
  for (const file of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) {
    if (before && file >= before) break;
    if (file.startsWith('0014_')) db.exec(`
      ALTER TABLE artworks ADD COLUMN fulfillment_uri TEXT;
      ALTER TABLE artworks ADD COLUMN buyer_email TEXT;
      ALTER TABLE artworks ADD COLUMN access_token TEXT;
      ALTER TABLE artworks ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1));
      UPDATE artworks SET image_url = 'https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1200&q=85' WHERE id = 'art_001';
      UPDATE artworks SET image_url = replace(image_url, 'w=1400', 'w=1200') WHERE id IN ('art_002', 'art_003');
      UPDATE artworks SET image_url = 'https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&w=1200&q=85' WHERE id = 'art_004';
    `);
    if (file.startsWith('0017_')) db.exec('ALTER TABLE transactions ADD COLUMN buyer_wallet TEXT;');
    db.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
}
