/**
 * Test-Provider ohne Netzwerk und ohne Scrydex-Key. Verhält sich wie ein echter Anbieter
 * (Kandidatenliste + Belege) und kann Fehler simulieren.
 */
import { CardCandidate, CardDataProvider, CardQuery, EvidenceRequest, FxRate, FxRateProvider, PriceEvidence } from './types';
import { cardNumberKey, normText } from './cardIdentity';
import { CardCondition, SCRYDEX_RAW_CONDITIONS } from './conditions';

export type InMemoryProviderOptions = {
  id?: string;
  cards: CardCandidate[];
  evidence: Record<string, PriceEvidence[]>;
  supportedLanguages?: string[] | null;
  supportedRawConditions?: readonly CardCondition[] | null;
  failFind?: boolean;
  failEvidence?: boolean;
};

export class InMemoryCardDataProvider implements CardDataProvider {
  readonly id: string;
  readonly displayName = 'Test-Provider';
  readonly supportedLanguages: string[] | null;
  readonly supportedRawConditions: readonly CardCondition[] | null;
  readonly calls: { findCards: CardQuery[]; getPriceEvidence: EvidenceRequest[] } = { findCards: [], getPriceEvidence: [] };

  constructor(private readonly options: InMemoryProviderOptions) {
    this.id = options.id || 'test';
    this.supportedLanguages = options.supportedLanguages === undefined ? ['en', 'ja'] : options.supportedLanguages;
    this.supportedRawConditions = options.supportedRawConditions === undefined ? SCRYDEX_RAW_CONDITIONS : options.supportedRawConditions;
  }

  /** Breite Suche wie ein echter Anbieter: gleiche Kartennummer (Hauptteil) – die exakte Prüfung macht WertScan. */
  async findCards(query: CardQuery): Promise<CardCandidate[]> {
    this.calls.findCards.push(query);
    if (this.options.failFind) throw new Error('simulierter Anbieterfehler');
    const lead = cardNumberKey(query.number).lead;
    return this.options.cards.filter(card => {
      const numbers = [card.number, card.printedNumber].filter(Boolean).map(value => cardNumberKey(value).lead);
      const numberHit = numbers.includes(lead);
      const languageHit = !query.language || normText(card.languageCode) === normText(query.language);
      return numberHit && languageHit;
    });
  }

  async getPriceEvidence(request: EvidenceRequest): Promise<PriceEvidence[]> {
    this.calls.getPriceEvidence.push(request);
    if (this.options.failEvidence) throw new Error('simulierter Anbieterfehler');
    return this.options.evidence[request.candidate.cardId] || [];
  }
}

/** Fester Kurs für Tests. In Produktion: echte Kursquelle (z. B. EZB-Referenzkurse) anbinden. */
export class StaticFxRateProvider implements FxRateProvider {
  constructor(private readonly rates: Record<string, number>, private readonly source: string, private readonly asOf: string) {}
  async getRate(fromCurrency: string): Promise<FxRate | null> {
    const rate = this.rates[fromCurrency];
    return rate ? { from: fromCurrency, to: 'EUR', rate, source: this.source, asOf: this.asOf } : null;
  }
}
