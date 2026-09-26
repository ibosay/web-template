/**
 * Laufzeittest der Live-Anbindung (diffs.json): Secrets, Token-Cache, Lens-Fehler, Zeitbudget,
 * /api/market. Wird von verify.mjs gegen einen nachgebauten Live-Rahmen ausgeführt.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const sdk = require(process.env.LIVE_PATCH_BUILD + '/node_modules/@appdeploy/sdk');
const calls = [];
let lensStatus = 200;
let hang = false;
global.fetch = async (input, init) => {
  const url = String(input);
  calls.push(url);
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/oauth2/token')) return reply({ access_token: 'T', expires_in: 7200 });
  if (url.includes('/item_summary/search')) {
    if (hang) return new Promise(() => {});
    return reply({ itemSummaries: [{ itemId: 'x', title: 'PlayStation 5 Slim Disc', price: { value: '399.00', currency: 'EUR' }, itemWebUrl: 'https://www.ebay.de/itm/1', buyingOptions: ['FIXED_PRICE'] }] });
  }
  if (url.startsWith('https://serpapi.com/image')) return reply({ image_id: 'IMG' }, lensStatus);
  if (url.startsWith('https://serpapi.com/search.json')) return reply({ visual_matches: [{ title: 'PS5 Slim', link: 'https://www.willhaben.at/iad/1', price: { value: '€350', extracted_value: 350 } }] });
  throw new Error('unexpected ' + url);
};
const mod = require(process.env.LIVE_PATCH_BUILD + '/backend/index.js');
const analysis = { title: 'Sony PlayStation 5 Slim', confidence: 0.9, categoryConfidence: 0.9 };
const lensImage = { data: Buffer.from('jpeg').toString('base64'), mimeType: 'image/jpeg' };

test('ohne Secrets: keine Zusatzquellen, Suche läuft wie bisher', async () => {
  sdk.__store.secrets = {};
  calls.length = 0;
  assert.deepEqual(await mod.freeMarketProviders(lensImage), []);
  const res = await mod.buildMarketResult(analysis, lensImage);
  assert.deepEqual(res.internetData, { rows: [], errors: [] });
  assert.equal(calls.length, 0);
});

test('eBay-Secrets: eBay-Angebote kommen an, Token wird über Anfragen hinweg wiederverwendet', async () => {
  sdk.__store.secrets = { EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 'sec' };
  calls.length = 0;
  const first = await mod.buildMarketResult(analysis, null);
  const second = await mod.buildMarketResult(analysis, null);
  assert.equal(first.internetData.rows.length, 1);
  assert.equal(second.internetData.rows.length, 1);
  assert.equal(calls.filter(u => u.includes('/oauth2/token')).length, 1);
  assert.ok(!calls.some(u => u.includes('serpapi')), 'ohne Foto keine Lens-Suche');
});

test('Lens-Fehler (Kontingent aufgebraucht) bricht die Suche nicht ab', async () => {
  sdk.__store.secrets = { EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 'sec', SERPAPI_API_KEY: 'k' };
  lensStatus = 429;
  const res = await mod.buildMarketResult(analysis, lensImage);
  assert.equal(res.internetData.rows.length, 1);
  assert.match(res.internetData.errors.join(' '), /web_search: Error: Lens: Upload fehlgeschlagen \(HTTP 429\)/);
  lensStatus = 200;
  const ok = await mod.buildMarketResult(analysis, lensImage);
  assert.deepEqual(ok.internetData.rows.map(r => r.price).sort(), [350, 399]);
});

test('hängende Quelle wird innerhalb des Budgets abgebrochen', async () => {
  sdk.__store.secrets = { EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 'sec' };
  hang = true;
  const started = Date.now();
  const res = await mod.liveMarketLookup(analysis, { providers: await mod.freeMarketProviders(null), marketBudgetMs: 4500 });
  hang = false;
  assert.ok(Date.now() - started < 7000, 'endet vor dem eBay-Timeout von 6 s + Puffer');
  assert.equal(res.rows.length, 0);
});

test('/api/market: ungültiges lensImage wird ignoriert, gültiges weitergereicht', async () => {
  sdk.__store.secrets = { SERPAPI_API_KEY: 'k' };
  calls.length = 0;
  const bad = await mod.handler({ route: 'POST /api/market', body: { analysis, lensImage: { data: 5, mimeType: 'image/jpeg' } } });
  assert.equal(bad.statusCode, 200);
  assert.equal(calls.length, 0);
  const good = await mod.handler({ route: 'POST /api/market', body: { analysis, lensImage } });
  assert.equal(JSON.parse(good.body).internetData.rows.length, 1);
  const missing = await mod.handler({ route: 'POST /api/market', body: {} });
  assert.equal(missing.statusCode, 400);
});
