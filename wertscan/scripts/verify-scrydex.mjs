#!/usr/bin/env node
/**
 * Prüft die mit "PRÜFEN" markierten Annahmen des Scrydex-Adapters gegen ECHTE API-Antworten.
 * Nur serverseitig/lokal ausführen. Der Key wird nie ausgegeben.
 *
 *   SCRYDEX_API_KEY=… SCRYDEX_TEAM_ID=… node wertscan/scripts/verify-scrydex.mjs \
 *     --name "Charizard" --number 143 --lang ja
 *
 * Ausgabe: ein Bericht je Annahme mit OK / ABWEICHUNG / UNKLAR und den beobachteten Rohdaten
 * (gekürzt). Den Bericht bitte vor dem produktiven Einsatz auswerten und den Adapter anpassen.
 */

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), [])
);
const apiKey = process.env.SCRYDEX_API_KEY;
const teamId = process.env.SCRYDEX_TEAM_ID;
const base = (process.env.SCRYDEX_BASE_URL || 'https://api.scrydex.com').replace(/\/$/, '');
if (!apiKey || !teamId) {
  console.error('SCRYDEX_API_KEY und SCRYDEX_TEAM_ID als Umgebungsvariablen setzen.');
  process.exit(1);
}
const name = args.name || 'Charizard';
const number = args.number || '4';
const lang = args.lang || 'en';

// Annahmen des Adapters (scrydexProvider.ts)
const ASSUMED = { apiKeyHeader: 'X-Api-Key', teamIdHeader: 'X-Team-ID', cardsPath: '/pokemon/v1/cards' };

const report = [];
const add = (check, verdict, detail) => report.push({ check, verdict, detail });
const shorten = value => JSON.stringify(value, null, 0)?.slice(0, 600);

async function get(path, params = {}, headers = { [ASSUMED.apiKeyHeader]: apiKey, [ASSUMED.teamIdHeader]: teamId }) {
  const query = new URLSearchParams(params).toString();
  const url = base + path + (query ? '?' + query : '');
  try {
    const response = await fetch(url, { headers: { ...headers, Accept: 'application/json' } });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body, path: path + (query ? '?' + query : '') };
  } catch (error) {
    return { status: 0, body: null, path, error: String(error) };
  }
}

const listOf = body => (Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null);

// 1) Authentifizierung / Header-Namen
const auth = await get(ASSUMED.cardsPath, { q: `name:"${name}"`, page_size: '1' });
const noAuth = await get(ASSUMED.cardsPath, { q: `name:"${name}"`, page_size: '1' }, {});
add(
  'Auth-Header ' + ASSUMED.apiKeyHeader + ' / ' + ASSUMED.teamIdHeader,
  auth.status === 200 && noAuth.status !== 200 ? 'OK' : auth.status === 200 ? 'UNKLAR (auch ohne Header 200)' : 'ABWEICHUNG',
  { mitHeadern: auth.status, ohneHeader: noAuth.status, fehler: auth.error }
);

// 2) Antwort-Wrapper
add(
  'Antwort-Wrapper { data: [...] }',
  Array.isArray(auth.body?.data) ? 'OK' : Array.isArray(auth.body) ? 'ABWEICHUNG (direktes Array – Adapter kann das)' : 'ABWEICHUNG',
  { topLevelKeys: auth.body && typeof auth.body === 'object' ? Object.keys(auth.body) : typeof auth.body }
);

// 3) q-Syntax
const qExact = await get(ASSUMED.cardsPath, { q: `name:"${name}" number:"${number}"`, include: 'prices', page_size: '50' });
const exactList = listOf(qExact.body) || [];
const numberHits = exactList.filter(card => String(card.number) === String(number) || String(card.printed_number || '').startsWith(String(number)));
add(
  'q-Syntax name:"…" number:"…"',
  qExact.status === 200 && exactList.length && numberHits.length === exactList.length ? 'OK' : qExact.status === 200 ? 'UNKLAR (Treffer prüfen)' : 'ABWEICHUNG',
  { status: qExact.status, treffer: exactList.length, mitPassenderNummer: numberHits.length, beispiele: exactList.slice(0, 3).map(c => [c.id, c.name, c.number, c.printed_number, c.language_code]) }
);

// 4) Kartenfelder
const sample = exactList[0] || (listOf(auth.body) || [])[0];
if (sample) {
  const fields = {
    id: sample.id !== undefined,
    name: sample.name !== undefined,
    number: sample.number !== undefined,
    printed_number: sample.printed_number !== undefined,
    'expansion.id': sample.expansion?.id !== undefined,
    'expansion.name': sample.expansion?.name !== undefined,
    language: sample.language !== undefined,
    language_code: sample.language_code !== undefined,
    'variants[].name': Array.isArray(sample.variants) && sample.variants.every(v => v?.name !== undefined),
  };
  add('Kartenfelder', Object.values(fields).every(Boolean) ? 'OK' : 'ABWEICHUNG', fields);

  // 5) Preise aus include=prices
  const priceEntries = (sample.variants || []).flatMap(v => (Array.isArray(v.prices) ? v.prices : [])).concat(Array.isArray(sample.prices) ? sample.prices : []);
  add(
    'include=prices → variants[].prices[] mit type/condition/company/grade/low/market/currency',
    priceEntries.length ? 'OK (Struktur prüfen)' : 'UNKLAR (keine Preise in dieser Karte)',
    {
      ort: (sample.variants || []).some(v => Array.isArray(v.prices)) ? 'variants[].prices' : Array.isArray(sample.prices) ? 'prices' : 'keine',
      keys: [...new Set(priceEntries.flatMap(entry => Object.keys(entry)))],
      typen: [...new Set(priceEntries.map(entry => entry.type))],
      zustaende: [...new Set(priceEntries.map(entry => entry.condition).filter(Boolean))],
      waehrungen: [...new Set(priceEntries.map(entry => entry.currency))],
      beispiel: shorten(priceEntries[0]),
    }
  );
} else {
  add('Kartenfelder', 'UNKLAR', 'keine Karte gefunden – andere --name/--number verwenden');
}

// 6) Sprachspezifische Endpunkte
const langPath = await get(`/pokemon/v1/${lang}/cards`, { q: `name:"${name}"`, page_size: '5' });
const langQuery = await get(ASSUMED.cardsPath, { q: `name:"${name}" language_code:${lang}`, page_size: '5' });
add('Sprachspezifischer Endpunkt / Sprachfilter', 'UNKLAR (Ergebnisse vergleichen)', {
  [`/pokemon/v1/${lang}/cards`]: { status: langPath.status, sprachen: [...new Set((listOf(langPath.body) || []).map(c => c.language_code))] },
  'q language_code': { status: langQuery.status, sprachen: [...new Set((listOf(langQuery.body) || []).map(c => c.language_code))] },
  allgemein: { sprachen: [...new Set(exactList.map(c => c.language_code))] },
});

// 7) Listings
if (sample?.id) {
  const listings = await get(`/pokemon/v1/cards/${encodeURIComponent(sample.id)}/listings`, { days: '90', page_size: '100' });
  const items = listOf(listings.body) || [];
  const keys = [...new Set(items.flatMap(item => Object.keys(item)))];
  add('Listings: Felder source/title/variant/company/grade/price/currency/sold_at/url', listings.status === 200 ? 'OK (Felder prüfen)' : 'ABWEICHUNG', {
    status: listings.status,
    anzahl: items.length,
    keys,
    paginierung: listings.body && typeof listings.body === 'object' ? Object.keys(listings.body).filter(k => k !== 'data') : [],
    mitSoldAt: items.filter(item => item.sold_at).length,
    mitConditionFeld: items.filter(item => item.condition !== undefined && item.condition !== null).length,
    beispiel: shorten(items[0]),
  });

  // 8) Zustandsfilter: liefert condition=NM garantiert nur NM, und steht NM im Beleg?
  const filtered = await get(`/pokemon/v1/cards/${encodeURIComponent(sample.id)}/listings`, { days: '90', page_size: '100', condition: 'NM' });
  const filteredItems = listOf(filtered.body) || [];
  const withField = filteredItems.filter(item => item.condition !== undefined && item.condition !== null);
  const allNm = withField.length === filteredItems.length && withField.every(item => String(item.condition).toUpperCase() === 'NM');
  add(
    'Zustandsfilter condition=NM',
    filteredItems.length === 0
      ? 'UNKLAR (keine Belege)'
      : allNm
        ? 'OK: jedes Listing trägt condition=NM im Beleg (Filter wäre belegbar)'
        : 'NICHT VERWENDEN: Zustand nicht in jedem Beleg bestätigt',
    { status: filtered.status, anzahl: filteredItems.length, mitConditionFeld: withField.length, werte: [...new Set(withField.map(item => item.condition))] }
  );
}

console.log(JSON.stringify({ geprueftAm: new Date().toISOString(), basis: base, karte: { name, number, lang }, ergebnisse: report }, null, 2));
