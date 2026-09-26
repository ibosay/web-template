/**
 * Prüft das Live-Patch-Paket ohne AppDeploy:
 *  1. baut aus diffs.json (neuer Code) und ../sources einen Live-Rahmen mit den bekannten
 *     Live-Typen (MarketProvider, withTimeout, budgeted, secrets.readSecret, aiImage),
 *  2. kompiliert Backend und Frontend-Ausschnitt mit TypeScript strict,
 *  3. führt glue.test.cjs aus (Secrets, Token-Cache, Lens-Fehler, Zeitbudget, /api/market).
 *
 * Aufruf: node wertscan/live-patch/verify.mjs
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const patch = JSON.parse(readFileSync(join(here, 'diffs.json'), 'utf8'));
const indexDiffs = patch.files.find(file => file.filename === 'backend/index.ts').diffs;
const appDiffs = patch.files.find(file => file.filename === 'src/App.tsx').diffs;
const to = (diffs, n) => diffs[n - 1].to;

const dir = mkdtempSync(join(tmpdir(), 'wertscan-live-patch-'));
try {
  mkdirSync(join(dir, 'backend/sources'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  cpSync(join(here, '../sources'), join(dir, 'backend/sources'), { recursive: true });

  writeFileSync(
    join(dir, 'sdk.d.ts'),
    `declare module '@appdeploy/sdk' {
  export type RouterResponse = { statusCode: number; headers: Record<string, string>; body: string };
  export type RouterContext = { body: unknown; query: Record<string, string>; params: Record<string, string> };
  export function router(routes: Record<string, ((ctx: RouterContext) => Promise<RouterResponse | void>)[]>): (event: unknown) => Promise<RouterResponse>;
  export function json(data: unknown, status?: number): RouterResponse;
  export function error(message: string, status?: number): RouterResponse;
  export const ai: { scrape(input: { url: string }): Promise<unknown> };
  export const secrets: { readSecret(name: string): Promise<string> };
}
`
  );

  // Live-Rahmen: nur die Teile von backend/index.ts, die der Patch berührt oder verwendet.
  writeFileSync(
    join(dir, 'backend/index.ts'),
    to(indexDiffs, 1) +
      `void ai;
type Analysis = { title: string; confidence: number; categoryConfidence: number };
type SourceKey = 'ebay_sold' | 'ebay_offer' | 'willhaben_offer' | 'web_search' | 'chrono24_offer';
type MarketProviderListing = { title: string; price: number; currency: string; conditionText: string; date: string; url: string };
type MarketProvider = { sourceKey: SourceKey; fetch: (ctx: { analysis: Analysis; queries: string[] }) => Promise<MarketProviderListing[]> };
type MarketLookupOptions = { providers?: MarketProvider[]; marketBudgetMs?: number };
type PageDebug = { url: string };
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout:' + label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function buildSearchPages(analysis: Analysis, plan: string[]) {
  void analysis;
  return plan.map(url => ({ url }));
}
export async function liveMarketLookup(analysis: Analysis, options: MarketLookupOptions = {}) {
  const { providers = [], marketBudgetMs = 25000 } = options;
  const deadline = Date.now() + marketBudgetMs;
  const remainingMs = () => deadline - Date.now();
  const budgeted = (ms: number, reserveMs = 0) => Math.max(0, Math.min(ms, remainingMs() - reserveMs));
  const FINALIZE_RESERVE_MS = 1500;
  const MIN_STEP_MS = 2000;
  const plan = [analysis.title];
  const baseQueries = plan;
` +
      to(indexDiffs, 3) +
      `    url: page.url,
  }));
  void perPage;
` +
      to(indexDiffs, 4) +
      `  const rows: MarketProviderListing[] = [];
  const errors: string[] = [];
  providerResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      errors.push(providers[index].sourceKey + ': ' + String(result.reason));
      return;
    }
    rows.push(...result.value);
  });
  return { rows, errors };
}
function recognitionResult(analysis: Analysis) {
  return { analysis, internetData: null };
}
function normalizeAnalysis(analysis: Analysis) {
  return analysis;
}
` +
      to(indexDiffs, 7) +
      `  return { analysis, internetData };
}
export const handler = router({
  'POST /api/market': [
    async ({ body }) => {
` +
      to(indexDiffs, 8) +
      `      } catch {
        return error('Marktpreise konnten gerade nicht geladen werden.', 502);
      }
    },
  ],
});
export { buildMarketResult, freeMarketProviders };
`
  );

  // Frontend-Ausschnitt: runMarketSearch, retryMarketSearch und der Aufruf aus analyze().
  writeFileSync(
    join(dir, 'src/App.ts'),
    `type Analysis = { title: string };
declare const aiImage: {
  resizeIfNeeded(file: File, o: { maxDimension: number; maxPixels: number; quality: number; mimeType: string }): Promise<{ data: string; mimeType: string }>;
};
declare const api: { post(url: string, data?: unknown): Promise<{ data: unknown }> };
export function useApp(files: File[], requestIdRef: { current: number }, result: { analysis: Analysis } | null) {
  const setMarketLoading = (value: boolean) => void value;
` +
      to(appDiffs, 1) +
      `      void marketResponse;
      void successNotice;
      void startedAt;
      return requestId === requestIdRef.current;
    } finally {
      setMarketLoading(false);
    }
  }
  async function retryMarketSearch() {
    if (!result) return;
    const requestId = requestIdRef.current + 1;
` +
      to(appDiffs, 3) +
      `  }
  async function analyze(demoId?: string) {
    const requestId = requestIdRef.current;
    const recognized = { analysis: { title: 't' } };
` +
      to(appDiffs, 2) +
      `  }
  return { retryMarketSearch, analyze };
}
`
  );

  const compilerOptions = {
    strict: true,
    noUnusedLocals: true,
    target: 'ES2022',
    module: 'commonjs',
    moduleResolution: 'node',
    lib: ['ES2022', 'DOM'],
    skipLibCheck: true,
    outDir: 'build',
  };
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions, files: ['sdk.d.ts', 'backend/index.ts', 'src/App.ts'] }, null, 2)
  );
  execFileSync('npx', ['-y', '-p', 'typescript@5', 'tsc', '-p', 'tsconfig.json'], { cwd: dir, stdio: 'inherit' });

  // Nachgestellte SDK-Laufzeit (Secrets aus einem Test-Speicher, einfacher Router).
  const sdkDir = join(dir, 'build/node_modules/@appdeploy/sdk');
  mkdirSync(sdkDir, { recursive: true });
  writeFileSync(
    join(sdkDir, 'index.js'),
    `const store = { secrets: {} };
module.exports = {
  __store: store,
  router: routes => async event => routes[event.route][0]({ body: event.body, query: {}, params: {} }),
  json: (data, status = 200) => ({ statusCode: status, headers: {}, body: JSON.stringify(data) }),
  error: (message, status = 500) => ({ statusCode: status, headers: {}, body: JSON.stringify({ error: message }) }),
  ai: {},
  secrets: {
    async readSecret(name) {
      if (!(name in store.secrets)) throw new Error('secret not found');
      return store.secrets[name];
    },
  },
};
`
  );
  execFileSync('node', ['--test', join(here, 'glue.test.cjs')], {
    stdio: 'inherit',
    env: { ...process.env, LIVE_PATCH_BUILD: join(dir, 'build') },
  });
  console.log('Live-Patch geprüft: Typen und Laufzeittests OK.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
