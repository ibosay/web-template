/**
 * Kostenlose Bildsuche: Google Lens über SerpApi (Free-Plan, ohne Abo).
 *
 * Findet visuell gleiche Angebote zum Foto, z. B. dasselbe Kleid auf Vinted, auch wenn der
 * Titel dort anders oder falsch geschrieben ist. Übernommen werden nur Treffer mit Preis.
 * Die Treffer laufen danach durch dieselbe strenge Identitätsprüfung der Pipeline wie alle
 * anderen Quellen, Lens entscheidet also nie allein über einen Preis.
 *
 * Nur serverseitig verwenden. Der SerpApi-Schlüssel kommt aus den App-Secrets und darf nie im
 * Frontend, in Logs oder im Repository landen. Jeder Lens-Aufruf verbraucht eine Suche des
 * kostenlosen Monatskontingents.
 */
import type { ProviderListing, StructuredMarketProvider } from './ebayBrowseProvider';

export type LensImage = { data: string; mimeType: string };

export type GoogleLensOptions = {
  apiKey: string;
  /** Standard: Österreich, deutsche Oberfläche. */
  country?: string;
  hl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
};

/** SerpApi-Limit für hochgeladene Bilder. */
export const LENS_MAX_UPLOAD_BYTES = 500 * 1024;

const UPLOAD_URL = 'https://serpapi.com/image';
const SEARCH_URL = 'https://serpapi.com/search.json';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

type LensMatch = {
  title?: string;
  link?: string;
  source?: string;
  condition?: string;
  price?: { value?: string; extracted_value?: number; currency?: string };
};

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

/**
 * Der SerpApi-Schlüssel steht in der Abruf-URL. Fehlermeldungen gehen in die Diagnose der App,
 * deshalb nie die Originalmeldung weitergeben (sie könnte die URL enthalten), nur die Art des Fehlers.
 */
async function lensFetch(run: () => Promise<Response>, ms: number, label: string): Promise<Response> {
  try {
    return await withTimeout(run(), ms, label);
  } catch (error) {
    const timedOut = String(error).includes('timeout:');
    throw new Error('Lens: ' + (timedOut ? 'Zeitlimit' : 'Netzwerkfehler') + ' (' + label + ')');
  }
}

/** Nur eindeutige Währungsangaben; "$" ohne Zusatz wird als USD gelesen, unbekannte bleiben leer. */
export function lensCurrency(price: LensMatch['price']): string {
  const text = String(price?.currency || price?.value || '').toUpperCase();
  if (text.includes('€') || text.includes('EUR')) return 'EUR';
  if (text.includes('CHF')) return 'CHF';
  if (text.includes('£') || text.includes('GBP')) return 'GBP';
  if (text.includes('$') || text.includes('USD')) return 'USD';
  return '';
}

/** Liest einen Lens-Treffer; null ohne Preis, Link oder eindeutige Währung. */
export function listingFromLensMatch(match: LensMatch): ProviderListing | null {
  const title = String(match.title || '').trim();
  const url = String(match.link || '').trim();
  const price = Number(match.price?.extracted_value);
  const currency = lensCurrency(match.price);
  if (!title || !url || !currency || !Number.isFinite(price) || price <= 0) return null;
  return { title, price, currency, conditionText: String(match.condition || '').trim(), date: '', url };
}

/** Bytes eines Base64-Strings (ohne Data-URL-Präfix). */
export function base64Bytes(data: string) {
  const clean = String(data || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function toBlob(image: LensImage) {
  const clean = image.data.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  const g = globalThis as unknown as { Buffer?: { from(v: string, enc: string): Uint8Array }; atob?: (v: string) => string };
  let bytes: Uint8Array;
  if (g.Buffer) {
    bytes = g.Buffer.from(clean, 'base64');
  } else if (g.atob) {
    const binary = g.atob(clean);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } else {
    throw new Error('Keine Base64-Dekodierung verfügbar');
  }
  // Eigene Kopie in einem ArrayBuffer (nicht SharedArrayBuffer), damit Blob den Typ akzeptiert.
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: image.mimeType });
}

/** Lädt ein Foto hoch und liefert die Lens-Treffer mit Preis. */
export async function searchGoogleLens(image: LensImage, options: GoogleLensOptions): Promise<ProviderListing[]> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 12000;
  const mimeType = String(image.mimeType || '').toLowerCase();
  if (!ALLOWED_TYPES.has(mimeType)) throw new Error('Lens: Bildformat nicht unterstützt (' + mimeType + ')');
  if (base64Bytes(image.data) > LENS_MAX_UPLOAD_BYTES) throw new Error('Lens: Bild größer als 500 KB');

  const form = new FormData();
  form.append('image', toBlob({ data: image.data, mimeType }), 'scan.' + (mimeType.split('/')[1] || 'jpg'));
  const upload = await lensFetch(
    () => fetchFn(UPLOAD_URL + '?api_key=' + encodeURIComponent(options.apiKey), { method: 'POST', body: form }),
    timeoutMs,
    'lens_upload'
  );
  if (!upload.ok) throw new Error('Lens: Upload fehlgeschlagen (HTTP ' + upload.status + ')');
  const imageId = String(((await upload.json()) as { image_id?: string }).image_id || '');
  if (!imageId) throw new Error('Lens: keine image_id erhalten');

  const url =
    SEARCH_URL +
    '?engine=google_lens' +
    '&image_id=' + encodeURIComponent(imageId) +
    '&country=' + encodeURIComponent(options.country || 'at') +
    '&hl=' + encodeURIComponent(options.hl || 'de') +
    '&api_key=' + encodeURIComponent(options.apiKey);
  const response = await lensFetch(() => fetchFn(url), timeoutMs, 'lens_search');
  if (!response.ok) throw new Error('Lens: Suche fehlgeschlagen (HTTP ' + response.status + ')');
  const data = (await response.json()) as { visual_matches?: LensMatch[]; products?: LensMatch[] };

  const seen = new Set<string>();
  const listings: ProviderListing[] = [];
  [...(data.visual_matches || []), ...(data.products || [])].forEach(match => {
    const listing = listingFromLensMatch(match);
    if (!listing || seen.has(listing.url)) return;
    seen.add(listing.url);
    listings.push(listing);
  });
  return listings;
}

/**
 * Pipeline-Anbindung. Das Foto kommt nicht aus der Analyse, sondern wird pro Anfrage übergeben
 * (z. B. eine verkleinerte Kopie des Hauptfotos aus dem Frontend). Ohne Foto: keine Lens-Suche.
 */
export function createGoogleLensProvider(options: GoogleLensOptions & { image: LensImage | null }): StructuredMarketProvider {
  return {
    sourceKey: 'web_search',
    async fetch() {
      if (!options.image) return [];
      return searchGoogleLens(options.image, options);
    },
  };
}
