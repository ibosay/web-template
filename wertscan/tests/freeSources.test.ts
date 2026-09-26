/**
 * Kostenlose strukturierte Quellen: eBay Browse API und Google Lens (SerpApi).
 * Alle HTTP-Antworten sind nachgestellt, es gibt keine echten Netzaufrufe.
 */
import './setupGlobals';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiCalls, setAi } from './setupGlobals';
import { liveMarketLookup } from '../marketPricePipeline';
import { createEbayBrowseProvider, listingFromItemSummary } from '../sources/ebayBrowseProvider';
import { base64Bytes, lensCurrency, listingFromLensMatch, searchGoogleLens } from '../sources/googleLensProvider';

type Call = { url: string; init?: RequestInit };

function mockFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }, calls: Call[]) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const header = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);

const item = (id: string, title: string, price: string, extra: Record<string, unknown> = {}) => ({
  itemId: id,
  title,
  price: { value: price, currency: 'EUR' },
  condition: 'Gebraucht',
  itemWebUrl: 'https://www.ebay.de/itm/' + id,
  itemCreationDate: '2026-09-20T10:00:00.000Z',
  buyingOptions: ['FIXED_PRICE'],
  ...extra,
});

test('eBay Browse: Token einmal, Suche je Anfrage und Marktplatz, Auktionen und Duplikate raus', async () => {
  const calls: Call[] = [];
  const fetchFn = mockFetch(url => {
    if (url.includes('/oauth2/token')) return { body: { access_token: 'TOKEN', expires_in: 7200 } };
    return {
      body: {
        itemSummaries: [
          item('1', 'Apple AirPods Pro 2 Ladecase USB-C', '129.00'),
          item('2', 'Apple AirPods Pro 2 gebraucht', '119.50'),
          item('3', 'Apple AirPods Pro 2 Auktion', '40.00', { buyingOptions: ['AUCTION'] }),
          item('4', 'Apple AirPods Pro 2 ohne Preis', 'abc'),
        ],
      },
    };
  }, calls);
  const provider = createEbayBrowseProvider({ clientId: 'id', clientSecret: 'secret', fetchFn });
  const queries = ['Apple AirPods Pro 2', 'AirPods Pro 2 USB-C'];

  const first = await provider.fetch({ analysis: {} as Analysis, queries });
  const second = await provider.fetch({ analysis: {} as Analysis, queries });

  assert.equal(provider.sourceKey, 'ebay_offer');
  assert.deepEqual(first.map(row => row.price).sort((a, b) => a - b), [119.5, 129], 'Auktion und ungültiger Preis verworfen, Duplikate zusammengefasst');
  assert.equal(second.length, 2);
  assert.equal(calls.filter(call => call.url.includes('/oauth2/token')).length, 1, 'Token wird wiederverwendet');

  const token = calls.find(call => call.url.includes('/oauth2/token'))!;
  assert.equal(token.init?.method, 'POST');
  assert.equal(header(token.init, 'Authorization'), 'Basic ' + btoa('id:secret'));
  assert.match(String(token.init?.body), /grant_type=client_credentials&scope=https%3A%2F%2Fapi\.ebay\.com%2Foauth%2Fapi_scope/);

  const searches = calls.filter(call => call.url.includes('/item_summary/search'));
  assert.equal(searches.length, 8, '2 Anfragen × 2 Marktplätze × 2 Durchläufe');
  assert.deepEqual(Array.from(new Set(searches.map(call => header(call.init, 'X-EBAY-C-MARKETPLACE-ID')))).sort(), ['EBAY_AT', 'EBAY_DE']);
  assert.ok(searches.every(call => header(call.init, 'Authorization') === 'Bearer TOKEN'));
  assert.ok(searches.some(call => call.url.includes('q=Apple%20AirPods%20Pro%202&limit=50')));
});

test('eBay Browse: Fehler werden gemeldet, nie Preise erfunden', async () => {
  const noToken = createEbayBrowseProvider({
    clientId: 'id',
    clientSecret: 'falsch',
    fetchFn: mockFetch(() => ({ status: 401, body: { error: 'invalid_client' } }), []),
  });
  await assert.rejects(() => noToken.fetch({ analysis: {} as Analysis, queries: ['x'] }), /Token nicht erhalten \(HTTP 401\)/);

  const searchDown = createEbayBrowseProvider({
    clientId: 'id',
    clientSecret: 'secret',
    fetchFn: mockFetch(url => (url.includes('/oauth2/token') ? { body: { access_token: 'T', expires_in: 7200 } } : { status: 503, body: {} }), []),
  });
  await assert.rejects(() => searchDown.fetch({ analysis: {} as Analysis, queries: ['x'] }), /HTTP 503/);

  assert.equal(listingFromItemSummary({ title: 'x', price: { value: '10', currency: '' }, itemWebUrl: 'u' }), null, 'ohne Währung kein Beleg');
});

const airpods = {
  category: 'Audio',
  objectType: 'Kopfhörer',
  brand: 'Apple',
  model: 'AirPods Pro 2',
  title: 'Apple AirPods Pro 2',
  condition: 'gebraucht',
  confidence: 0.9,
  categoryConfidence: 0.9,
} as unknown as Analysis;

test('Pipeline: eBay-API liefert Belege, obwohl alle Marktplatzseiten blockiert sind; startet vor den Seitenabrufen; keine eBay-Verkauft-Seiten', async () => {
  const order: string[] = [];
  setAi(
    async url => {
      order.push('scrape');
      return { status: 403, text: '' };
    },
    async () => ({ data: { items: [] } })
  );
  const provider = createEbayBrowseProvider({
    clientId: 'id',
    clientSecret: 'secret',
    fetchFn: mockFetch(url => {
      if (url.includes('/oauth2/token')) {
        order.push('ebay_api');
        return { body: { access_token: 'T', expires_in: 7200 } };
      }
      return {
        body: {
          itemSummaries: [
            item('11', 'Apple AirPods Pro 2 Ladecase', '120.00'),
            item('12', 'Apple AirPods Pro 2 USB-C', '130.00'),
            item('13', 'Apple AirPods Pro 2 wie neu', '125.00'),
          ],
        },
      };
    }, []),
  });

  const result = await liveMarketLookup(airpods, { log: () => {}, providers: [provider] });

  assert.equal(order[0], 'ebay_api', 'strukturierte Quelle startet parallel und vor den Seitenabrufen');
  assert.ok(aiCalls.scrape.every(url => !url.includes('LH_Sold')), 'keine eBay-Verkauft-Seiten mehr (Login-Pflicht seit 22.07.2026)');
  assert.equal(result.currentOffers.length, 3);
  assert.equal(result.headline.price, 125);
  assert.match(result.headline.basis, /Marktangebot/, 'klar als Angebotspreise gekennzeichnet, nicht als Verkäufe');
});

test('Google Lens: Währung, Preis und Link nur, wenn eindeutig', () => {
  assert.equal(lensCurrency({ value: '€45*', extracted_value: 45 }), 'EUR');
  assert.equal(lensCurrency({ value: '45,00 €', currency: '€' }), 'EUR');
  assert.equal(lensCurrency({ value: 'CHF 50' }), 'CHF');
  assert.equal(lensCurrency({ value: '$260*', currency: '$' }), 'USD');
  assert.equal(lensCurrency({ value: '45' }), '', 'ohne Währung keine Annahme');
  assert.deepEqual(listingFromLensMatch({ title: 'Rena Marx Maxikleid', link: 'https://www.vinted.at/items/1', price: { value: '€150', extracted_value: 150 } }), {
    title: 'Rena Marx Maxikleid',
    price: 150,
    currency: 'EUR',
    conditionText: '',
    date: '',
    url: 'https://www.vinted.at/items/1',
  });
  assert.equal(listingFromLensMatch({ title: 'Ohne Preis', link: 'https://x' }), null);
  assert.equal(base64Bytes('QUJD'), 3);
  assert.equal(base64Bytes('data:image/jpeg;base64,QUI='), 2);
});

test('Google Lens: Upload, dann Suche mit image_id; nur Treffer mit Preis; Größen- und Formatgrenzen', async () => {
  const calls: Call[] = [];
  const fetchFn = mockFetch(url => {
    if (url.startsWith('https://serpapi.com/image')) return { body: { image_id: 'IMG123' } };
    return {
      body: {
        visual_matches: [
          { title: 'Rena Marx Maxikleid schwarz weiß', link: 'https://www.vinted.at/items/1', source: 'Vinted', price: { value: '€150*', extracted_value: 150, currency: '€' } },
          { title: 'Ähnliches Kleid ohne Preis', link: 'https://example.com/a' },
          { title: 'Rena Marx Maxikleid schwarz weiß', link: 'https://www.vinted.at/items/1', price: { value: '€150*', extracted_value: 150 } },
        ],
        products: [{ title: 'Rena Marx Kleid', link: 'https://shop.example/k', price: { value: '179,95 €', extracted_value: 179.95 } }],
      },
    };
  }, calls);
  const image = { data: btoa('fake-jpeg'), mimeType: 'image/jpeg' };

  const listings = await searchGoogleLens(image, { apiKey: 'KEY', fetchFn });

  assert.deepEqual(listings.map(row => [row.price, row.currency]), [[150, 'EUR'], [179.95, 'EUR']]);
  assert.equal(calls[0].init?.method, 'POST');
  assert.ok(calls[0].init?.body instanceof FormData);
  assert.match(calls[1].url, /engine=google_lens&image_id=IMG123&country=at&hl=de&api_key=KEY/);

  const big = { data: btoa('x'.repeat(600 * 1024)), mimeType: 'image/jpeg' };
  await assert.rejects(() => searchGoogleLens(big, { apiKey: 'KEY', fetchFn }), /größer als 500 KB/);
  await assert.rejects(() => searchGoogleLens({ data: 'QUJD', mimeType: 'image/heic' }, { apiKey: 'KEY', fetchFn }), /nicht unterstützt/);
});
