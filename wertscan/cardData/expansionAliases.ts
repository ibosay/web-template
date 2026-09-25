/**
 * Kontrolliert gepflegte Set-Zuordnungen (z. B. deutsche Setnamen → Setname beim Anbieter).
 *
 * Regeln:
 *  - Nur bekannte, bestätigte Zuordnungen eintragen (confirmedBy + confirmedAt Pflicht).
 *  - Keine automatische Übersetzung, kein Fuzzy-Matching: verglichen wird nur exakt
 *    (Groß/Klein und Satzzeichen ignoriert).
 *  - Fehlt ein Alias und passt der Setname nicht exakt, meldet WertScan "nicht eindeutig".
 *
 * Neue Einträge: unten anfügen, Quelle der Bestätigung angeben, Tests laufen lassen.
 */

export type ExpansionAlias = {
  game: string;
  /** Sprache des Alias (z. B. 'de' für deutsche Setnamen). */
  language: string;
  /** Setname, wie die Bilderkennung ihn liefert. */
  alias: string;
  /** Setname beim Anbieter (exakt), optional zusätzlich dessen expansion.id. */
  expansionName: string;
  expansionId?: string;
  confirmedBy: string;
  confirmedAt: string;
};

export const EXPANSION_ALIASES: ExpansionAlias[] = [
  {
    game: 'pokemon',
    language: 'de',
    alias: 'Obsidianflammen',
    expansionName: 'Obsidian Flames',
    confirmedBy: 'WertScan-Team (Vorgabe im Chat)',
    confirmedAt: '2026-09-25',
  },
  {
    game: 'pokemon',
    language: 'de',
    alias: '151',
    expansionName: '151',
    confirmedBy: 'WertScan-Team (Vorgabe im Chat)',
    confirmedAt: '2026-09-25',
  },
  {
    game: 'pokemon',
    language: 'de',
    alias: 'Karmesin und Purpur',
    expansionName: 'Scarlet & Violet',
    confirmedBy: 'WertScan-Team (Vorgabe im Chat)',
    confirmedAt: '2026-09-25',
  },
];
