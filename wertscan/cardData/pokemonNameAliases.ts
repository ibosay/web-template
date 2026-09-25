/**
 * Kontrolliert gepflegte Pokémon-Namensaliase (offizielle Namen in anderen Sprachen).
 *
 * Zweck: Ein Marktplatztitel nennt die Karte oft im Namen einer anderen Sprache
 * (Glurak, Dracaufeu, リザードン, Freezer …). Der Name ist bei Karten nur eine zusätzliche
 * Bestätigung neben der exakten Kartennummer. Dafür dürfen ausschließlich diese
 * bestätigten Aliase verwendet werden – keine automatische Übersetzung, kein Fuzzy-Matching.
 *
 * Neue Einträge: nur offizielle Namen, Tests laufen lassen. Mehrdeutige Allerweltswörter
 * (z. B. die japanischen Umschriften "Thunder" oder "Fire") werden bewusst nicht aufgenommen.
 */

export const POKEMON_NAME_ALIASES: Record<string, string[]> = {
  articuno: ['Arktos', 'Artikodin', 'Freezer', 'フリーザー'],
  zapdos: ['Électhor', 'サンダー'],
  moltres: ['Lavados', 'Sulfura', 'ファイヤー'],
  charizard: ['Glurak', 'Dracaufeu', 'Lizardon', 'リザードン'],
  blastoise: ['Turtok', 'Tortank', 'Kamex', 'カメックス'],
  venusaur: ['Bisaflor', 'Florizarre', 'Fushigibana', 'フシギバナ'],
  pikachu: ['ピカチュウ'],
  mewtwo: ['Mewtu', 'ミュウツー'],
  mew: ['ミュウ'],
  gengar: ['Ectoplasma', 'ゲンガー'],
  umbreon: ['Nachtara', 'Noctali', 'Blacky', 'ブラッキー'],
  darkrai: ['ダークライ'],
  lugia: ['ルギア'],
  rayquaza: ['レックウザ'],
};

const fold = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Alle bestätigten Namensformen einer Karte (inkl. des erkannten Namens selbst). */
export function pokemonNameForms(cardName: string): string[] {
  const folded = fold(cardName).replace(/[^a-z0-9]+/g, ' ').trim();
  const forms = new Set<string>([cardName]);
  Object.entries(POKEMON_NAME_ALIASES).forEach(([english, aliases]) => {
    const group = [english, ...aliases];
    const hit = group.some(name => {
      const key = fold(name).replace(/[^a-z0-9]+/g, ' ').trim();
      // Nur ganze Wörter vergleichen ("Mew" darf nicht in "Mewtwo" treffen).
      return key ? (' ' + folded + ' ').includes(' ' + key + ' ') : cardName.includes(name);
    });
    if (hit) group.forEach(name => forms.add(name));
  });
  return Array.from(forms).filter(Boolean);
}

/** Nennt der Titel eine der Namensformen als ganzes Wort (lateinisch) bzw. wörtlich (andere Schriften)? */
export function titleMentionsName(title: string, forms: string[]): boolean {
  const foldedTitle = ' ' + fold(title).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  return forms.some(form => {
    const key = fold(form).replace(/[^a-z0-9]+/g, ' ').trim();
    if (key) return foldedTitle.includes(' ' + key + ' ');
    return form.trim().length > 0 && includesAsWord(String(title || ''), form.trim());
  });
}

/** Japanische Namen: Treffer nur, wenn davor/danach keine weitere Kana steht (ミュウ ≠ ミュウツー). */
const KANA = /[\u3040-\u30ff\uff66-\uff9f]/;

function includesAsWord(text: string, word: string): boolean {
  for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
    const before = text[at - 1] || '';
    const after = text[at + word.length] || '';
    if (!KANA.test(before) && !KANA.test(after)) return true;
  }
  return false;
}
