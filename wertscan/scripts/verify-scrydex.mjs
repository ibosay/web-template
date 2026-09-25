#!/usr/bin/env node
/**
 * Prüft den Scrydex-Adapter gegen ECHTE API-Antworten. Nur serverseitig/lokal ausführen.
 * Der Key wird nie ausgegeben.
 *
 *   SCRYDEX_API_KEY=… SCRYDEX_TEAM_ID=… node wertscan/scripts/verify-scrydex.mjs \
 *     --name "Charizard" --number 143 --printed "143/S-P" [--expansion <expansionId>]
 *
 * Laut Doku bestätigt (hier nur Plausibilitätsprüfung): Header, Endpunkte, q-Syntax,
 * Kartenfelder, Preisstruktur, Listing-Felder.
 * Offen und hier geprüft: Antwort-Wrapper, Paginierung, Anführungszeichen in q, Suchbarkeit von
 * number/printed_number, tatsächliche Sprach-/Grading-/Währungsabdeckung, condition-Filter.
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
const printed = args.printed || '';
const expansion = args.expansion || '';

const HEADERS = { 'X-Api-Key': apiKey, 'X-Team-ID': teamId };
const CARDS = '/pokemon/v1/cards';
const report = [];
const add = (check, verdict, detail) => report.push({ check, verdict, detail });
const shorten = value => JSON.stringify(value)?.slice(0, 600);
const lucene = value => (/^[A-Za-z0-9._-]+$/.test(value) ? value : '"' + value.replace(/"/g, '') + '"');

async function get(path, params = {}, headers = HEADERS) {
  const query = new URLSearchParams(params).toString();
  try {
    const response = await fetch(base + path + (query ? '?' + query : ''), { headers: { ...headers, Accept: 'application/json' } });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: null, error: String(error) };
  }
}
const listOf = body => (Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []);
const meta = body => (body && typeof body === 'object' && !Array.isArray(body) ? Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'data')) : {});

// 1) Auth (bestätigt – Plausibilität)
const auth = await get(CARDS, { q: 'name:' + lucene(name), page_size: '1' });
const noAuth = await get(CARDS, { q: 'name:' + lucene(name), page_size: '1' }, {});
add('Auth X-Api-Key / X-Team-ID', auth.status === 200 ? 'OK' : 'ABWEICHUNG', { mitHeadern: auth.status, ohneHeader: noAuth.status, fehler: auth.error });

// 2) Wrapper + Paginierung (offen)
add('Antwort-Wrapper { data: [...] }', Array.isArray(auth.body?.data) ? 'OK' : Array.isArray(auth.body) ? 'ABWEICHUNG (Array – Adapter kann das)' : 'ABWEICHUNG', {
  topLevelKeys: auth.body && typeof auth.body === 'object' ? Object.keys(auth.body) : typeof auth.body,
  metadaten: meta(auth.body),
});
const page1 = await get(CARDS, { q: 'name:' + lucene(name), page_size: '5', page: '1' });
const page2 = await get(CARDS, { q: 'name:' + lucene(name), page_size: '5', page: '2' });
const ids1 = listOf(page1.body).map(c => c.id);
const ids2 = listOf(page2.body).map(c => c.id);
add('Paginierung page/page_size', ids1.length === 5 && ids2.length && !ids2.some(id => ids1.includes(id)) ? 'OK' : 'UNKLAR (Metadaten prüfen)', {
  seite1: ids1.length,
  seite2: ids2.length,
  ueberschneidung: ids2.filter(id => ids1.includes(id)).length,
  metadaten: meta(page1.body),
});

// 3) q-Varianten des Adapters (offen: Anführungszeichen, Suchbarkeit von number/printed_number)
const variants = {
  'name + number': 'name:' + lucene(name) + ' number:' + lucene(number),
  '!name + number (exakt)': '!name:' + lucene(name) + ' number:' + lucene(number),
  'nur number': 'number:' + lucene(number),
  ...(printed ? { printed_number: 'printed_number:' + lucene(printed) } : {}),
  ...(expansion ? { 'expansion.id + number': 'expansion.id:' + lucene(expansion) + ' number:' + lucene(number) } : {}),
};
let sample = null;
const allCards = [];
for (const [label, q] of Object.entries(variants)) {
  const result = await get(CARDS, { q, include: 'prices', page_size: '100' });
  const cards = listOf(result.body);
  allCards.push(...cards);
  if (!sample && cards.length) sample = cards[0];
  const numberOk = cards.filter(c => String(c.number) === String(number)).length;
  add('q: ' + label, result.status !== 200 ? 'ABWEICHUNG' : !cards.length ? 'UNKLAR (0 Treffer)' : 'OK', {
    q,
    status: result.status,
    treffer: cards.length,
    mitNumber: numberOk,
    beispiele: cards.slice(0, 5).map(c => [c.id, c.name, c.number, c.printed_number, c.language_code, c.expansion?.id]),
  });
}
if (expansion) {
  const scoped = await get('/pokemon/v1/expansions/' + encodeURIComponent(expansion) + '/cards', { q: 'number:' + lucene(number), page_size: '20' });
  add('Set-Endpunkt /expansions/<id>/cards', scoped.status === 200 ? 'OK' : 'ABWEICHUNG', { status: scoped.status, treffer: listOf(scoped.body).length });
}

// 4) Abdeckung: Sprachen, printed_number, Varianten
const unique = [...new Map(allCards.map(c => [c.id, c])).values()];
add('Abdeckung dieser Suche', unique.length ? 'INFO' : 'UNKLAR', {
  karten: unique.length,
  sprachen: [...new Set(unique.map(c => c.language_code))],
  printedNumbers: [...new Set(unique.map(c => c.printed_number))].slice(0, 20),
  mitPrintedNumber: unique.filter(c => c.printed_number).length,
  varianten: [...new Set(unique.flatMap(c => (c.variants || []).map(v => v.name)))],
});

// 5) Preise: Firmen (PCA?), Zustände, Währungen, trends
if (sample) {
  const prices = unique.flatMap(c => (c.variants || []).flatMap(v => v.prices || []));
  add('Preisobjekte (include=prices)', prices.length ? 'INFO' : 'UNKLAR (keine Preise)', {
    keys: [...new Set(prices.flatMap(p => Object.keys(p)))],
    typen: [...new Set(prices.map(p => p.type))],
    rawZustaende: [...new Set(prices.filter(p => p.type === 'raw').map(p => p.condition))],
    firmen: [...new Set(prices.filter(p => p.type === 'graded').map(p => p.company))],
    pcaVorhanden: prices.some(p => String(p.company).toUpperCase() === 'PCA'),
    waehrungen: [...new Set(prices.map(p => p.currency))],
    beispielTrends: shorten(prices.find(p => p.trends)?.trends),
  });

  // 6) Listings: sold_at, id, Paginierung, condition-Feld
  const listings = await get(CARDS + '/' + encodeURIComponent(sample.id) + '/listings', { days: '90', page_size: '100' });
  const items = listOf(listings.body);
  add('Listings /cards/<id>/listings', listings.status === 200 ? 'OK' : 'ABWEICHUNG', {
    karte: sample.id,
    status: listings.status,
    anzahl: items.length,
    keys: [...new Set(items.flatMap(item => Object.keys(item)))],
    metadaten: meta(listings.body),
    ohneSoldAt: items.filter(item => !item.sold_at).length,
    mitId: items.filter(item => item.id).length,
    mitConditionFeld: items.filter(item => item.condition != null).length,
    quellen: [...new Set(items.map(item => item.source))],
    firmen: [...new Set(items.map(item => item.company).filter(Boolean))],
    waehrungen: [...new Set(items.map(item => item.currency))],
    beispiel: shorten(items[0]),
  });

  // 7) condition-Filter: nur verwendbar, wenn JEDES Listing condition=NM im Beleg trägt
  const filtered = await get(CARDS + '/' + encodeURIComponent(sample.id) + '/listings', { days: '90', page_size: '100', condition: 'NM' });
  const filteredItems = listOf(filtered.body);
  const withField = filteredItems.filter(item => item.condition != null);
  const allNm = filteredItems.length > 0 && withField.length === filteredItems.length && withField.every(item => String(item.condition).toUpperCase() === 'NM');
  add(
    'condition=NM-Filter',
    !filteredItems.length ? 'UNKLAR (keine Belege)' : allNm ? 'BELEGBAR: jedes Listing trägt condition=NM' : 'NICHT VERWENDEN (trustConditionFilter bleibt aus)',
    { status: filtered.status, anzahl: filteredItems.length, mitConditionFeld: withField.length, werte: [...new Set(withField.map(item => item.condition))] }
  );
}

console.log(JSON.stringify({ geprueftAm: new Date().toISOString(), basis: base, suche: { name, number, printed, expansion }, ergebnisse: report }, null, 2));
