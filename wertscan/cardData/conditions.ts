/**
 * Zentrale Zustands-Taxonomie für Sammelkarten. ALLE Teile von WertScan verwenden nur diese
 * Begriffe und nur diese Normalisierung.
 *
 * Jeder Begriff bleibt eigenständig. Es gibt KEINE Umwandlung zwischen Begriffen
 * (Mint ≠ Near Mint, Excellent ≠ Light Played). Ein Text wird nur zugeordnet, wenn er genau
 * einen festen Begriff enthält; alles andere ergibt null.
 */

export const CARD_CONDITIONS = ['MINT', 'NM', 'EX', 'LP', 'MP', 'HP', 'DM'] as const;
export type CardCondition = (typeof CARD_CONDITIONS)[number];

export const CARD_CONDITION_LABELS: Record<CardCondition, string> = {
  MINT: 'Mint',
  NM: 'Near Mint',
  EX: 'Excellent',
  LP: 'Light Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DM: 'Damaged',
};

/** Raw-Zustände, die Scrydex laut Doku führt. Andere Begriffe haben dort keine Kategorie. */
export const SCRYDEX_RAW_CONDITIONS: readonly CardCondition[] = ['NM', 'LP', 'MP', 'HP', 'DM'];

// Reihenfolge wichtig: längere Begriffe zuerst, damit "Near Mint" nicht zusätzlich als "Mint" zählt.
const PHRASES: [string, CardCondition][] = [
  ['near mint', 'NM'],
  ['nearmint', 'NM'],
  ['nm', 'NM'],
  ['mint', 'MINT'],
  ['mt', 'MINT'],
  ['excellent', 'EX'],
  ['ex', 'EX'],
  ['light played', 'LP'],
  ['lightly played', 'LP'],
  ['lp', 'LP'],
  ['moderately played', 'MP'],
  ['mp', 'MP'],
  ['heavily played', 'HP'],
  ['heavy played', 'HP'],
  ['hp', 'HP'],
  ['damaged', 'DM'],
  ['dmg', 'DM'],
  ['dm', 'DM'],
];

const normalizeText = (value: string | null | undefined) =>
  ' ' +
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() +
  ' ';

/**
 * Text → genau ein fester Zustandsbegriff, sonst null.
 * Hinweis: "EX" ist zugleich eine Pokémon-Kartenbezeichnung ("Charizard ex"). Deshalb diese
 * Funktion nur auf Zustandsfelder anwenden, nie auf Kartentitel.
 */
export function normalizeCardCondition(value: string | null | undefined): CardCondition | null {
  let text = normalizeText(value);
  if (!text.trim()) return null;
  const found = new Set<CardCondition>();
  PHRASES.forEach(([phrase, condition]) => {
    const needle = ' ' + phrase + ' ';
    if (text.includes(needle)) {
      found.add(condition);
      text = text.split(needle).join(' ');
    }
  });
  return found.size === 1 ? [...found][0] : null;
}

/** Zustand des Exemplars in der Taxonomie eines Anbieters – ohne Umwandlung, sonst null. */
export function toProviderCondition(condition: CardCondition | null, supported: readonly CardCondition[]): CardCondition | null {
  return condition && supported.includes(condition) ? condition : null;
}
