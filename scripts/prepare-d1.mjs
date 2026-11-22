import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareLegacySchema } from './d1-preflight.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--local', '--remote'].includes(mode)) {
  console.error('Usage: node scripts/prepare-d1.mjs --local | --remote');
  process.exit(1);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

async function query(sql) {
  const output = execFileSync(process.execPath, [
    wrangler, 'd1', 'execute', 'planetary-max-db', mode,
    '--config', './wrangler.toml', '--json', '--command', sql,
  ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const result = JSON.parse(output);
  if (!Array.isArray(result) || result.length !== 1 || result[0].success !== true || !Array.isArray(result[0].results)) {
    throw new Error('Wrangler returned an unexpected D1 response.');
  }
  return result[0].results;
}

try {
  console.log(`Checking existing D1 schema using ${mode} and ./wrangler.toml.`);
  await prepareLegacySchema(query, message => console.log(message));
  console.log('D1 prerequisites are ready for Wrangler migrations.');
} catch (error) {
  console.error('D1 preparation failed. No migrations were applied by this step. A retry is safe after checking the database; some additive columns may already have been created.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
