#!/usr/bin/env bash
# Prüft den EZB-Wechselkursanbieter (cardData/fx.ts) gegen die ECHTE EZB-Quelle.
# Keine Zugangsdaten nötig. Aufruf: bash wertscan/scripts/verify-ecb.sh
#
# Geprüft wird:
#   1. ob die EZB-Quelle erreichbar ist und sich parsen lässt
#   2. ob USD → EUR funktioniert
#   3. ob JPY → EUR funktioniert
#   4. welches Kursdatum verwendet wird (und wie alt es ist)
#   5. ob veraltete Kurse abgelehnt werden (gleicher Kurssatz, simuliertes späteres Datum)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
npx -y -p typescript@5 tsc --target es2022 --module commonjs --strict --skipLibCheck --lib es2022,dom --outDir "$OUT" cardData/fx.ts cardData/types.ts cardData/conditions.ts
node - "$OUT" <<'JS'
const out = process.argv[2];
const { EcbFxRateProvider, ECB_DAILY_URL, parseEcbDailyXml } = require(out + '/fx.js');
const results = [];
const add = (check, ok, detail) => results.push({ check, ergebnis: ok === null ? 'INFO' : ok ? 'OK' : 'FEHLER', detail });

(async () => {
  let xml = '';
  try {
    const response = await fetch(ECB_DAILY_URL);
    xml = response.ok ? await response.text() : '';
    add('EZB-Quelle erreichbar', response.ok, { url: ECB_DAILY_URL, status: response.status });
  } catch (error) {
    add('EZB-Quelle erreichbar', false, { url: ECB_DAILY_URL, fehler: String(error) });
  }
  const parsed = xml ? parseEcbDailyXml(xml) : null;
  add('EZB-Datei lesbar', Boolean(parsed), parsed ? { waehrungen: Object.keys(parsed.perEur).length } : 'nicht parsebar');

  const now = new Date();
  const provider = new EcbFxRateProvider({ now: () => now });
  const usd = await provider.getRate('USD');
  const jpy = await provider.getRate('JPY');
  add('USD → EUR', Boolean(usd && usd.rate > 0), usd);
  add('JPY → EUR', Boolean(jpy && jpy.rate > 0), jpy);
  if (usd) add('Beispiel 100 USD', null, (Math.round(100 * usd.rate * 100) / 100) + ' EUR (Anzeigewert)');
  if (jpy) add('Beispiel 2.500 JPY', null, (Math.round(2500 * jpy.rate * 100) / 100) + ' EUR (Anzeigewert)');

  if (parsed) {
    const ageDays = (now.getTime() - new Date(parsed.asOf + 'T16:00:00Z').getTime()) / 86400000;
    add('Kursdatum', ageDays <= 5, { stichtag: parsed.asOf, alterTage: Math.round(ageDays * 10) / 10, maxAlterTage: 5 });

    // Gleicher Kurssatz, aber "heute" 10 Tage nach dem Stichtag → muss abgelehnt werden.
    const later = new Date(new Date(parsed.asOf + 'T16:00:00Z').getTime() + 10 * 86400000);
    const stale = new EcbFxRateProvider({ now: () => later, fetch: async () => ({ ok: true, status: 200, text: async () => xml }) });
    const staleUsd = await stale.getRate('USD');
    add('Veralteter Kurs wird abgelehnt', staleUsd === null, { simuliertesDatum: later.toISOString().slice(0, 10), ergebnis: staleUsd });
  }

  const unknown = await provider.getRate('XXX');
  add('Unbekannte Währung → kein Kurs', unknown === null, unknown);

  console.log(JSON.stringify({ geprueftAm: now.toISOString(), ergebnisse: results }, null, 2));
  process.exit(results.some(r => r.ergebnis === 'FEHLER') ? 1 : 0);
})();
JS
