/**
 * Servano – Testlauf ohne Framework und ohne Abhängigkeiten.
 *
 *   node ibo/tests/run-tests.js
 *
 * Geprüft wird die Logik, die sich ohne Browser testen lässt: Normalisierung,
 * UID-Prüfziffer, Öffnungszeiten, Maskierung und die Suche samt Filtern.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* --- Minimale Browser-Attrappe ------------------------------------- */

const documentStub = {
  readyState: 'complete',
  addEventListener() {},
  getElementById() {
    return null;
  },
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  createElement() {
    return { style: {}, setAttribute() {}, appendChild() {}, remove() {} };
  },
  head: { appendChild() {} },
  body: { insertBefore() {}, appendChild() {}, firstChild: null, getAttribute: () => '' },
};

const sandbox = {
  console,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  document: documentStub,
  localStorage: undefined, // erzwingt den Speicher-Fallback in util.js
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.location = { hash: '' };

vm.createContext(sandbox);

['icons.js', 'util.js', 'data.js', 'app.js'].forEach((file) => {
  const full = path.join(__dirname, '..', 'assets', 'js', file);
  vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full });
});

const IBO = sandbox.IBO;

/* --- Winziges Test-Gerüst ------------------------------------------ */

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push({ name, message: error.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Bedingung nicht erfüllt');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message ? message + ' – ' : '') + `erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`);
  }
}

/* --- Normalisierung ------------------------------------------------ */

test('normalize schreibt Umlaute aus', () => {
  assertEqual(IBO.normalize('Müller Sanitär'), 'mueller sanitaer');
  assertEqual(IBO.normalize('Straße'), 'strasse');
});

test('normalize entfernt Satzzeichen und Akzente', () => {
  assertEqual(IBO.normalize('Café-Bar, 1010!'), 'cafe bar 1010');
});

test('tokenize liefert bei leerer Eingabe keine Begriffe', () => {
  assertEqual(IBO.tokenize('   ').length, 0);
});

/* --- Maskierung ---------------------------------------------------- */

test('esc maskiert HTML-Sonderzeichen', () => {
  assertEqual(IBO.esc('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('escAttrUrl blockt javascript-URLs', () => {
  assertEqual(IBO.escAttrUrl('javascript:alert(1)'), '#');
  assertEqual(IBO.escAttrUrl('https://example.at'), 'https://example.at');
});

test('highlight maskiert und markiert gleichzeitig', () => {
  const out = IBO.highlight('<b>Müller</b>', ['mueller']);
  assert(out.indexOf('&lt;b&gt;') === 0, 'Markup muss maskiert bleiben: ' + out);
  assert(out.indexOf('<mark>') !== -1, 'Treffer muss markiert werden: ' + out);
});

/* --- UID / ATU ----------------------------------------------------- */

test('validateATU akzeptiert eine gültige Nummer', () => {
  const result = IBO.validateATU('ATU13585627');
  assert(result.valid, result.message);
});

test('validateATU normalisiert Schreibweisen', () => {
  const result = IBO.validateATU(' atu 135 856 27 ');
  assert(result.valid, result.message);
  assertEqual(result.normalized, 'ATU13585627');
});

test('validateATU erkennt eine falsche Prüfziffer', () => {
  const result = IBO.validateATU('ATU13585628');
  assert(!result.valid);
  assertEqual(result.code, 'checksum');
});

test('validateATU weist falsche Formate ab', () => {
  assertEqual(IBO.validateATU('ATU123').code, 'format');
  assertEqual(IBO.validateATU('DE123456789').code, 'format');
  assertEqual(IBO.validateATU('').code, 'empty');
});

test('alle Demo-Betriebe tragen eine gültige UID', () => {
  IBO.companies.forEach((company) => {
    const result = IBO.validateATU(company.uid);
    assert(result.valid, company.name + ': ' + result.message);
  });
});

/* --- weitere Validierung ------------------------------------------- */

test('validateGISA akzeptiert Ziffern und leere Eingabe', () => {
  assert(IBO.validateGISA('').valid);
  assert(IBO.validateGISA('12345678').valid);
  assert(!IBO.validateGISA('12345678901').valid);
});

test('validatePhone erkennt österreichische Nummern', () => {
  assert(IBO.validatePhone('+43 1 234 56 78').valid);
  assert(IBO.validatePhone('0664 1234567').valid);
  assertEqual(IBO.validatePhone('0043 1 2345678').normalized, '+4312345678');
  assert(!IBO.validatePhone('12').valid);
});

test('validateEmail prüft das Grundformat', () => {
  assert(IBO.validateEmail('office@firma.at').valid);
  assert(!IBO.validateEmail('office@firma').valid);
});

test('telHref entfernt Trennzeichen', () => {
  assertEqual(IBO.telHref('+43 1 234 56 78'), 'tel:+4312345678');
  assertEqual(IBO.telHref('0664/123 45 67'), 'tel:06641234567');
});

/* --- Öffnungszeiten ------------------------------------------------ */

const mondayMorning = new Date('2026-01-12T09:00:00'); // Montag
const sundayNoon = new Date('2026-01-11T12:00:00'); // Sonntag

test('isOpenNow erkennt geöffnete und geschlossene Zeiten', () => {
  const company = IBO.companies.find((c) => c.slug === 'alpen-entruempelung');
  assert(IBO.isOpenNow(company, mondayMorning), 'Montag 09:00 muss geöffnet sein');
  assert(!IBO.isOpenNow(company, sundayNoon), 'Sonntag muss geschlossen sein');
});

test('Notdienst ist immer erreichbar', () => {
  const company = IBO.companies.find((c) => c.emergency24);
  assert(IBO.isOpenNow(company, sundayNoon));
});

test('hoursTable fasst gleiche Tage zusammen', () => {
  const company = IBO.companies.find((c) => c.slug === 'alpen-entruempelung');
  const rows = IBO.hoursTable(company);
  assertEqual(rows[0].label, 'Mo–Fr');
  assertEqual(rows[0].text, '08:00–18:00');
});

/* --- Suche --------------------------------------------------------- */

function search(overrides) {
  return IBO.searchCompanies(
    Object.assign(
      { view: 'suche', q: '', bezirk: '', kat: '', offen: false, notdienst: false, geprueft: false, sort: 'relevanz' },
      overrides
    )
  );
}

test('leere Suche liefert alle Betriebe', () => {
  assertEqual(search({}).length, IBO.companies.length);
});

test('Regression: Plural einer Kategorie findet Betriebe', () => {
  // Im ersten Prototyp lieferte der Klick auf "Installateure" null Treffer,
  // weil der Beruf im Datensatz "Installateur" heißt.
  assert(search({ q: 'Installateure' }).length > 0);
});

test('Suche findet über Umlaut-Varianten', () => {
  assert(search({ q: 'mueller' }).length > 0);
  assert(search({ q: 'Müller' }).length > 0);
});

test('Suche findet über Leistungen', () => {
  const results = search({ q: 'thermenwartung' });
  assert(results.length > 0);
  assert(results.every((c) => c.services.join(' ').toLowerCase().includes('therme')));
});

test('mehrere Begriffe müssen alle passen', () => {
  assertEqual(search({ q: 'installateur zauberer' }).length, 0);
  assert(search({ q: 'rohr notdienst' }).length > 0);
});

test('Bezirksfilter grenzt korrekt ein', () => {
  const results = search({ bezirk: '1010' });
  assert(results.length > 0);
  assert(results.every((c) => c.district === '1010'));
});

test('Kategoriefilter grenzt korrekt ein', () => {
  const results = search({ kat: 'installateur' });
  assert(results.length >= 2);
  assert(results.every((c) => c.categories.includes('installateur')));
});

test('Notdienstfilter liefert nur 24h-Betriebe', () => {
  const results = search({ notdienst: true });
  assert(results.length > 0);
  assert(results.every((c) => c.emergency24));
});

test('Filter "nur geprüft" blendet ungeprüfte aus', () => {
  const results = search({ geprueft: true });
  assert(results.every((c) => c.verified));
  assert(results.length < IBO.companies.length, 'Der Datensatz braucht mindestens einen ungeprüften Betrieb');
});

test('Anzeigen werden nicht nach oben sortiert', () => {
  // Das ist das zentrale Versprechen der Plattform: bezahlte Einträge werden
  // gekennzeichnet, aber nicht bevorzugt gereiht.
  const results = search({ sort: 'name' });
  const names = results.map((c) => c.name);
  const sorted = names.slice().sort((a, b) => a.localeCompare(b, 'de'));
  assertEqual(names.join('|'), sorted.join('|'));
});

test('Sortierung nach Namen ist stabil alphabetisch', () => {
  const results = search({ sort: 'name' });
  assertEqual(results[0].name, results.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'de'))[0]);
});

test('Namenstreffer wiegt schwerer als Beschreibungstreffer', () => {
  const results = search({ q: 'holzwerk' });
  assertEqual(results[0].slug, 'holzwerk-tischlerei');
});

/* --- Datensatz ----------------------------------------------------- */

test('Wien hat 23 Bezirke im Datensatz', () => {
  assertEqual(IBO.districts.length, 23);
});

test('Slugs und IDs sind eindeutig', () => {
  const slugs = new Set(IBO.companies.map((c) => c.slug));
  const ids = new Set(IBO.companies.map((c) => c.id));
  assertEqual(slugs.size, IBO.companies.length);
  assertEqual(ids.size, IBO.companies.length);
});

test('jeder Betrieb verweist auf bestehende Kategorien und Bezirke', () => {
  const categoryIds = IBO.categories.map((c) => c.id);
  const districtCodes = IBO.districts.map((d) => d.code);
  IBO.companies.forEach((company) => {
    assert(company.categories.length > 0, company.name + ' hat keine Kategorie');
    company.categories.forEach((id) => assert(categoryIds.includes(id), company.name + ': unbekannte Kategorie ' + id));
    assert(districtCodes.includes(company.district), company.name + ': unbekannter Bezirk ' + company.district);
    assert(IBO.hasIcon(company.logoIcon), company.name + ': unbekanntes Icon ' + company.logoIcon);
  });
});

test('jede Kategorie hat ein vorhandenes Icon', () => {
  IBO.categories.forEach((cat) => assert(IBO.hasIcon(cat.icon), cat.name + ': Icon ' + cat.icon + ' fehlt'));
});

/* --- Verdrahtung zwischen HTML und JavaScript ---------------------- */

const siteDir = path.join(__dirname, '..');
const htmlFiles = fs.readdirSync(siteDir).filter((f) => f.endsWith('.html'));

function readSite(file) {
  return fs.readFileSync(path.join(siteDir, file), 'utf8');
}

function readScript(file) {
  return fs.readFileSync(path.join(siteDir, 'assets', 'js', file), 'utf8');
}

function idsIn(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

function elCallsIn(js) {
  return [...js.matchAll(/\bel\('([^']+)'\)/g)].map((m) => m[1]);
}

test('signup.js spricht nur vorhandene Elemente an', () => {
  const ids = idsIn(readSite('signup.html'));
  // Nachträglich per JavaScript erzeugte Elemente ausnehmen.
  const generated = new Set(['signup-card']);
  elCallsIn(readScript('signup.js')).forEach((id) => {
    assert(ids.has(id) || generated.has(id), 'signup.html fehlt das Element #' + id);
  });
});

test('admin.js spricht nur vorhandene Elemente an', () => {
  const html = readSite('verwaltung.html');
  const ids = idsIn(html);
  const generated = new Set(['admin-filter']);
  elCallsIn(readScript('admin.js')).forEach((id) => {
    assert(ids.has(id) || generated.has(id), 'verwaltung.html fehlt das Element #' + id);
  });
});

test('jede Fehlermeldung ist einem Feld zugeordnet', () => {
  htmlFiles.forEach((file) => {
    const html = readSite(file);
    const ids = idsIn(html);
    [...html.matchAll(/data-error-for="([^"]+)"/g)].forEach((m) => {
      assert(ids.has(m[1]), file + ': data-error-for="' + m[1] + '" hat kein passendes Feld');
    });
  });
});

test('alle internen Links zeigen auf vorhandene Seiten', () => {
  htmlFiles.forEach((file) => {
    const html = readSite(file);
    [...html.matchAll(/href="([^"#?:]+\.html)[^"]*"/g)].forEach((m) => {
      assert(fs.existsSync(path.join(siteDir, m[1])), file + ' verlinkt auf fehlende Seite ' + m[1]);
    });
  });

  // Auch die Navigation und die Fußzeile aus layout.js prüfen.
  const layout = readScript('layout.js');
  [...layout.matchAll(/'([a-z0-9-]+\.html)(?:#[^']*)?'/g)].forEach((m) => {
    assert(fs.existsSync(path.join(siteDir, m[1])), 'layout.js verlinkt auf fehlende Seite ' + m[1]);
  });
});

test('jede Seite bindet CSS, Icons und die Hilfsfunktionen ein', () => {
  htmlFiles.forEach((file) => {
    const html = readSite(file);
    assert(html.includes('assets/css/style.css'), file + ': Stylesheet fehlt');
    assert(html.includes('assets/js/icons.js'), file + ': icons.js fehlt');
    assert(html.includes('assets/js/util.js'), file + ': util.js fehlt');
    assert(html.includes('assets/js/layout.js'), file + ': layout.js fehlt');
    assert(html.includes('data-header'), file + ': Kopfzeilen-Platzhalter fehlt');
    assert(html.includes('data-footer'), file + ': Fußzeilen-Platzhalter fehlt');
    assert(/<html lang="de">/.test(html), file + ': lang-Attribut fehlt');
    assert(/name="viewport"/.test(html), file + ': viewport-Angabe fehlt');
    assert(/<title>/.test(html), file + ': Titel fehlt');
  });
});

test('alle im HTML verwendeten Icons existieren', () => {
  htmlFiles.forEach((file) => {
    [...readSite(file).matchAll(/href="#i-([a-zA-Z]+)"/g)].forEach((m) => {
      assert(IBO.hasIcon(m[1]), file + ': unbekanntes Icon ' + m[1]);
    });
  });
});

test('keine Einbindung externer Server (DSGVO)', () => {
  htmlFiles.forEach((file) => {
    const html = readSite(file);
    const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    // Reine Textlinks in Rechtstexten sind in Ordnung, Ressourcen nicht.
    const resources = external.filter((url) => /\.(js|css|woff2?|ttf|png|jpe?g|svg)(\?|$)/i.test(url));
    assertEqual(resources.length, 0, file + ' lädt externe Ressourcen: ' + resources.join(', '));
  });
});

/* --- Ergebnis ------------------------------------------------------ */

console.log('');
if (failures.length) {
  failures.forEach((f) => console.error('  ✗ ' + f.name + '\n      ' + f.message));
  console.error('\n' + passed + ' bestanden, ' + failures.length + ' fehlgeschlagen\n');
  process.exit(1);
}
console.log('  ✓ ' + passed + ' Tests bestanden\n');
