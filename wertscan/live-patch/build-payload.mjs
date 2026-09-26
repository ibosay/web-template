/**
 * Gibt das files[]-Feld für den einen AppDeploy-Deploy aus: die zwei neuen Quelldateien
 * (unverändert aus ../sources) plus die exakten Änderungen aus diffs.json.
 * Enthält keine Schlüssel; die kommen ausschließlich aus den App-Secrets.
 *
 * Aufruf: node wertscan/live-patch/build-payload.mjs > deploy-files.json
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const patch = JSON.parse(readFileSync(join(here, 'diffs.json'), 'utf8'));
const source = name => readFileSync(join(here, '../sources', name), 'utf8');

const files = [
  { filename: 'backend/sources/ebayBrowseProvider.ts', content: source('ebayBrowseProvider.ts') },
  { filename: 'backend/sources/googleLensProvider.ts', content: source('googleLensProvider.ts') },
  ...patch.files,
];
process.stdout.write(JSON.stringify(files, null, 2) + '\n');
