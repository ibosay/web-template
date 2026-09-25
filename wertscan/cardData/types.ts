/**
 * WertScan – allgemeine Schnittstelle für Sammelkarten-Datenanbieter.
 *
 * Alles, was ein Anbieter (Scrydex, später andere) liefert, wird in diese Typen übersetzt.
 * Die Entscheidung, ob eine Karte EXAKT passt und welche Preise zählen, trifft ausschließlich
 * WertScan (cardMatching.ts, cardValuation.ts) – nie der Anbieter-Adapter.
 */

import { CardCondition } from './conditions';

export type Grading = { company: string; grade: string };

/** Aus der Bilderkennung übernommene Identität. Unbekannte Felder sind null – nie geraten. */
export type CardQuery = {
  game: string;
  name: string | null;
  /** Wie erkannt, z. B. "143/S-P" oder "223/197". */
  number: string | null;
  setName: string | null;
  setId: string | null;
  /** ISO-Code ('en', 'ja', 'de' …) – nur wenn sicher erkannt. */
  language: string | null;
  /** Variantenname (z. B. "Reverse Holo") – nur wenn sicher erkannt. */
  variant: string | null;
};

export type CardCandidate = {
  providerId: string;
  cardId: string;
  game: string;
  name: string;
  number: string | null;
  printedNumber: string | null;
  expansionId: string | null;
  expansionName: string | null;
  language: string | null;
  languageCode: string | null;
  variants: { name: string }[];
};

/**
 * sold    = tatsächlich verkauft (hat Vorrang)
 * listing = aktives Angebot
 * guide   = Preisführer/Marktindikator (z. B. Scrydex market, Cardmarket trend) – NIE Teil des Marktwerts
 */
export type EvidenceKind = 'sold' | 'listing' | 'guide';

export type PriceEvidence = {
  kind: EvidenceKind;
  providerId: string;
  /** Ursprüngliche Quelle, z. B. "ebay" bei Scrydex-Listings oder "scrydex" bei Preisführern. */
  source: string;
  cardId: string;
  /** ID des Belegs beim Anbieter (z. B. Scrydex-Listing-id), für Duplikaterkennung. */
  externalId?: string | null;
  variant: string | null;
  title: string | null;
  /** null = ungegradet (raw). */
  grading: Grading | null;
  /** Zustand in der zentralen Taxonomie (conditions.ts); null = unbekannt. */
  condition: CardCondition | null;
  /**
   * Herkunft des Zustands:
   *  - 'provider_field'  : Feld im einzelnen Beleg der Anbieterantwort
   *  - 'provider_filter' : nur durch einen Anfragefilter bestätigt – zählt nur, wenn der Filter
   *                        nachweislich verifiziert ist (siehe ValuationInput.trustedConditionFilters)
   *  - null              : kein Zustand
   * Zustände aus Verkaufstiteln werden nie übernommen.
   */
  conditionSource: 'provider_field' | 'provider_filter' | null;
  /** Bei guide: 'market' | 'low' | 'mid' | 'high' …; sonst null. */
  priceType: string | null;
  /** Originalbetrag in Originalwährung der Quelle. */
  price: number;
  currency: string;
  url: string | null;
  /** Zeitpunkt laut Quelle (sold_at, Preisstand). null, wenn die Quelle keinen liefert. */
  observedAt: string | null;
  /** WertScan-Metadatum: Abrufzeitpunkt. */
  fetchedAt: string;
  /** WertScan-Metadatum: ab hier gilt der Beleg als veraltet (Cache-Ablauf). */
  expiresAt: string;
};

export type EvidenceRequest = {
  /** Kandidat, den WertScan als exakt passend bestätigt hat. */
  candidate: CardCandidate;
  /** Bestätigte Variante oder null, wenn die Karte keine Varianten führt. */
  variant: string | null;
  soldWithinDays: number;
};

export interface CardDataProvider {
  readonly id: string;
  readonly displayName: string;
  /** Sprachcodes, die der Anbieter führt; null = unbekannt. */
  readonly supportedLanguages: string[] | null;
  /** Raw-Zustände, die der Anbieter führt (zentrale Taxonomie); null = unbekannt. */
  readonly supportedRawConditions: readonly CardCondition[] | null;
  findCards(query: CardQuery): Promise<CardCandidate[]>;
  getPriceEvidence(request: EvidenceRequest): Promise<PriceEvidence[]>;
}

export type FxRate = { from: string; to: 'EUR'; rate: number; source: string; asOf: string };

/** Liefert echte Kurse (z. B. EZB-Referenzkurs). null = kein Kurs verfügbar → keine Umrechnung. */
export interface FxRateProvider {
  getRate(fromCurrency: string): Promise<FxRate | null>;
}

/** In EUR umgerechneter ANZEIGEWERT – ausdrücklich kein Marktpreis der Quelle. */
export type EurConversion = {
  amount: number;
  rate: number;
  rateSource: string;
  rateAsOf: string;
  note: string;
};

export type PriceGuideEntry = {
  providerId: string;
  source: string;
  label: string;
  segment: 'raw' | 'graded';
  condition: CardCondition | null;
  grading: Grading | null;
  priceType: string | null;
  price: number;
  currency: string;
  eur: EurConversion | null;
  /** Passt der Eintrag exakt zu Zustand bzw. Grading des gescannten Exemplars? */
  matchesTarget: boolean;
  url: string | null;
  observedAt: string | null;
  fetchedAt: string;
  expiresAt: string;
};
