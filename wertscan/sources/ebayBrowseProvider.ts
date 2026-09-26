/**
 * Kostenlose, offizielle eBay-Quelle: Browse API (item_summary/search).
 *
 * Warum: Seit Juli 2026 leitet eBay "Verkauft"-Suchseiten ohne Login auf die Anmeldung um, und
 * Angebots-Suchseiten sind beim Scraping oft blockiert oder langsam. Die Browse API liefert aktive
 * Angebote strukturiert (Titel, Preis, Zustand, Link) in ca. 1 s, kostenlos (Developers Program,
 * Tageslimit 5.000 Aufrufe).
 *
 * Nur serverseitig verwenden. Client-ID und Secret kommen aus den App-Secrets und dürfen nie im
 * Frontend, in Logs oder im Repository landen.
 *
 * Es werden nur Sofortkauf-Angebote (FIXED_PRICE, Standard der API) übernommen. Laufende Auktionen
 * haben keinen Marktpreis (aktuelles Gebot ≠ Verkaufspreis) und werden bewusst nicht gelesen.
 */
import type { MarketProvider, MarketProviderListing } from '../marketPricePipeline';

export type EbayMarketplaceId = 'EBAY_DE' | 'EBAY_AT';

export type EbayBrowseProviderOptions = {
  clientId: string;
  clientSecret: string;
  /** Standard: eBay.de und eBay.at. */
  marketplaces?: EbayMarketplaceId[];
  /** Wie viele Suchanfragen der Pipeline (in Reihenfolge) verwendet werden. Standard: 2. */
  maxQueries?: number;
  /** Treffer pro Suchanfrage und Marktplatz (API-Maximum 200). Standard: 50. */
  limit?: number;
  /** Zeitlimit je HTTP-Aufruf. Standard: 6000 ms. */
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
};

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const PUBLIC_SCOPE = 'https://api.ebay.com/oauth/api_scope';

type EbayItemSummary = {
  itemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  condition?: string;
  itemWebUrl?: string;
  itemCreationDate?: string;
  buyingOptions?: string[];
};

function base64(value: string) {
  // Node (Buffer) und Browser/Edge (btoa) unterstützen.
  const g = globalThis as unknown as { Buffer?: { from(v: string): { toString(enc: string): string } }; btoa?: (v: string) => string };
  if (g.Buffer) return g.Buffer.from(value).toString('base64');
  if (g.btoa) return g.btoa(value);
  throw new Error('Keine Base64-Kodierung verfügbar');
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout:' + label)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Liest einen Angebotsdatensatz; null, wenn er keinen verwertbaren Sofortkaufpreis hat. */
export function listingFromItemSummary(item: EbayItemSummary): MarketProviderListing | null {
  const title = String(item.title || '').trim();
  const price = Number(item.price?.value);
  const currency = String(item.price?.currency || '').trim().toUpperCase();
  const url = String(item.itemWebUrl || '').trim();
  const options = item.buyingOptions || [];
  if (!title || !url || !currency || !Number.isFinite(price) || price <= 0) return null;
  if (options.length && !options.includes('FIXED_PRICE')) return null;
  return {
    title,
    price,
    currency,
    conditionText: String(item.condition || '').trim(),
    date: String(item.itemCreationDate || '').trim(),
    url,
  };
}

export function createEbayBrowseProvider(options: EbayBrowseProviderOptions): MarketProvider {
  const marketplaces = options.marketplaces?.length ? options.marketplaces : (['EBAY_DE', 'EBAY_AT'] as EbayMarketplaceId[]);
  const maxQueries = Math.max(1, options.maxQueries ?? 2);
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  const timeoutMs = options.timeoutMs ?? 6000;
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    const response = await withTimeout(
      fetchFn(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + base64(options.clientId + ':' + options.clientSecret),
        },
        body: 'grant_type=client_credentials&scope=' + encodeURIComponent(PUBLIC_SCOPE),
      }),
      timeoutMs,
      'ebay_token'
    );
    if (!response.ok) throw new Error('eBay-Token nicht erhalten (HTTP ' + response.status + ')');
    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error('eBay-Token fehlt in der Antwort');
    token = { value: data.access_token, expiresAt: now() + Math.max(60, Number(data.expires_in) || 7200) * 1000 };
    return token.value;
  }

  async function search(query: string, marketplace: EbayMarketplaceId, bearer: string): Promise<EbayItemSummary[]> {
    const url = SEARCH_URL + '?q=' + encodeURIComponent(query) + '&limit=' + limit;
    const response = await withTimeout(
      fetchFn(url, {
        headers: {
          Authorization: 'Bearer ' + bearer,
          'X-EBAY-C-MARKETPLACE-ID': marketplace,
          'Accept-Language': 'de-DE',
        },
      }),
      timeoutMs,
      'ebay_search'
    );
    if (!response.ok) throw new Error('eBay-Suche ' + marketplace + ' fehlgeschlagen (HTTP ' + response.status + ')');
    const data = (await response.json()) as { itemSummaries?: EbayItemSummary[] };
    return Array.isArray(data.itemSummaries) ? data.itemSummaries : [];
  }

  return {
    sourceKey: 'ebay_offer',
    async fetch({ queries }) {
      const selected = queries.map(query => String(query || '').trim()).filter(Boolean).slice(0, maxQueries);
      if (!selected.length) return [];
      const bearer = await accessToken();
      const jobs = selected.flatMap(query => marketplaces.map(marketplace => search(query, marketplace, bearer)));
      const results = await Promise.allSettled(jobs);
      const seen = new Set<string>();
      const listings: MarketProviderListing[] = [];
      results.forEach(result => {
        if (result.status !== 'fulfilled') return;
        result.value.forEach(item => {
          const key = item.itemId || item.itemWebUrl || '';
          if (!key || seen.has(key)) return;
          const listing = listingFromItemSummary(item);
          if (!listing) return;
          seen.add(key);
          listings.push(listing);
        });
      });
      if (!listings.length && results.every(result => result.status === 'rejected')) {
        throw new Error((results[0] as PromiseRejectedResult).reason);
      }
      return listings;
    },
  };
}
