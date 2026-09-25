/**
 * Wechselkurse als austauschbarer FxRateProvider.
 *
 * EcbFxRateProvider: EZB-Euro-Referenzkurse (täglich, Werktage). Die EZB veröffentlicht
 * "1 EUR = x Fremdwährung"; für die Umrechnung nach EUR wird 1/x verwendet.
 * Kein Kurs verfügbar (Abruf fehlgeschlagen, Währung unbekannt, Kurs zu alt) → null.
 * Dann zeigt WertScan nur den Originalpreis – es wird nie ein Kurs geschätzt.
 *
 * Originalpreis und Originalwährung bleiben in PriceEvidence immer erhalten; die EUR-Werte
 * tragen Kurs, Kursquelle und Stand (EurConversion).
 */
import { FxRate, FxRateProvider } from './types';

export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

type FetchText = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type EcbConfig = {
  fetch?: FetchText;
  url?: string;
  now?: () => Date;
  /** Wie lange ein geladener Kurssatz wiederverwendet wird. Standard 6 h. */
  cacheTtlMs?: number;
  /** Maximales Alter des EZB-Stichtags (Wochenenden/Feiertage berücksichtigt). Standard 5 Tage. */
  maxAgeDays?: number;
};

export type EcbRates = { asOf: string; perEur: Record<string, number> };

/** Parst die EZB-Tagesdatei. Gibt null zurück, wenn Datum oder Kurse fehlen. */
export function parseEcbDailyXml(xml: string): EcbRates | null {
  const time = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/);
  if (!time) return null;
  const perEur: Record<string, number> = {};
  const pattern = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const rate = Number(match[2]);
    if (Number.isFinite(rate) && rate > 0) perEur[match[1]] = rate;
  }
  return Object.keys(perEur).length ? { asOf: time[1], perEur } : null;
}

export class EcbFxRateProvider implements FxRateProvider {
  private cache: { loadedAt: number; rates: EcbRates | null } | null = null;
  private readonly fetchText: FetchText;
  private readonly url: string;
  private readonly now: () => Date;
  private readonly cacheTtlMs: number;
  private readonly maxAgeDays: number;

  constructor(config: EcbConfig = {}) {
    const globalFetch = (globalThis as unknown as { fetch?: FetchText }).fetch;
    const fetchText = config.fetch || globalFetch;
    if (!fetchText) throw new Error('EZB-Kurse: keine fetch-Implementierung verfügbar.');
    this.fetchText = fetchText;
    this.url = config.url || ECB_DAILY_URL;
    this.now = config.now || (() => new Date());
    this.cacheTtlMs = config.cacheTtlMs ?? 6 * 3600 * 1000;
    this.maxAgeDays = config.maxAgeDays ?? 5;
  }

  private async load(): Promise<EcbRates | null> {
    const nowMs = this.now().getTime();
    if (this.cache && nowMs - this.cache.loadedAt < this.cacheTtlMs) return this.cache.rates;
    let rates: EcbRates | null = null;
    try {
      const response = await this.fetchText(this.url);
      rates = response.ok ? parseEcbDailyXml(await response.text()) : null;
    } catch {
      rates = null;
    }
    this.cache = { loadedAt: nowMs, rates };
    return rates;
  }

  async getRate(fromCurrency: string): Promise<FxRate | null> {
    const code = String(fromCurrency || '').toUpperCase();
    if (code === 'EUR') return { from: 'EUR', to: 'EUR', rate: 1, source: 'identisch', asOf: '' };
    const rates = await this.load();
    const perEur = rates?.perEur[code];
    if (!rates || !perEur) return null;
    const ageDays = (this.now().getTime() - new Date(rates.asOf + 'T16:00:00Z').getTime()) / 86400000;
    if (ageDays > this.maxAgeDays) return null; // veralteter Kurs wird nicht verwendet
    return {
      from: code,
      to: 'EUR',
      rate: Math.round((1 / perEur) * 1e6) / 1e6,
      source: 'EZB-Referenzkurs (1 EUR = ' + perEur + ' ' + code + ')',
      asOf: rates.asOf,
    };
  }
}
