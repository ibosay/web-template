/**
 * Anzeigemodell für das Frontend: drei strikt getrennte Bereiche.
 *
 *   1. Marktwert          – nur aus echten Belegen (MarketData.headline) oder ausdrücklich "keine Bewertung"
 *   2. Vergleichsverkäufe – tatsächlich verkaufte Artikel; aktive Angebote getrennt gekennzeichnet
 *   3. Preisführer        – Richtwerte (Cardmarket, Scrydex market …), NIE als Verkauf dargestellt
 *
 * Das Frontend rendert nur dieses Modell. Jeder Eintrag hat einen festen `variant`, der die
 * Optik bestimmt: 'sold' | 'offer' | 'guide'. Ein Preisführer kann dadurch nicht wie ein
 * verkaufter Artikel aussehen.
 */
import { MarketData, MarketListing } from './marketPricePipeline';

export type DisplayMoney = {
  /** Formatierter EUR-Anzeigewert oder null, wenn kein Kurs vorhanden ist. */
  eur: string | null;
  /** Originalbetrag der Quelle, wenn nicht EUR (z. B. "2.600 JPY"). */
  original: string | null;
  /** Pflichthinweis bei umgerechneten Beträgen (Kurs, Quelle, Stand). */
  fxNote: string | null;
};

export type MarketValueSection = {
  title: 'Marktwert';
  state: 'value' | 'no_value';
  value: DisplayMoney | null;
  range: { from: DisplayMoney; to: DisplayMoney } | null;
  basis: string;
  notes: string[];
  /** Immer anzeigen, wenn state = 'no_value' – nie durch einen Preis ersetzen. */
  noValueReason: string | null;
};

export type ComparableItem = {
  variant: 'sold' | 'offer';
  badge: 'Verkauft' | 'Aktives Angebot';
  title: string;
  price: DisplayMoney;
  source: string;
  observedAt: string | null;
  fetchedAt: string | null;
  url: string | null;
  grading: string | null;
};

export type GuideItem = {
  variant: 'guide';
  badge: 'Preisführer';
  label: string;
  source: string;
  price: DisplayMoney;
  matchesTarget: boolean;
  observedAt: string | null;
  fetchedAt: string;
  expiresAt: string;
};

export type MarketDisplay = {
  status: MarketData['status'];
  marketValue: MarketValueSection;
  comparableSales: { title: 'Vergleichsverkäufe'; sold: ComparableItem[]; offers: ComparableItem[]; emptyText: string | null };
  priceGuides: { title: 'Preisführer'; disclaimer: string; items: GuideItem[] };
};

const eur = (value: number) =>
  value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const money = (value: number, currency: string) =>
  value.toLocaleString('de-DE', { minimumFractionDigits: currency === 'JPY' ? 0 : 2, maximumFractionDigits: currency === 'JPY' ? 0 : 2 }) + ' ' + currency;

function listingMoney(row: MarketListing): DisplayMoney {
  return {
    eur: eur(row.price),
    original: row.originalCurrency && row.originalPrice != null ? money(row.originalPrice, row.originalCurrency) : null,
    fxNote: row.eurConversion ? row.eurConversion.note : null,
  };
}

function comparable(row: MarketListing): ComparableItem {
  const sold = row.type === 'sold';
  return {
    variant: sold ? 'sold' : 'offer',
    badge: sold ? 'Verkauft' : 'Aktives Angebot',
    title: row.title,
    price: listingMoney(row),
    source: row.source,
    observedAt: row.observedAt ?? (row.date || null),
    fetchedAt: row.fetchedAt || null,
    url: row.url || null,
    grading: row.grading && row.grading !== 'raw' ? row.grading.toUpperCase() : null,
  };
}

export function buildMarketDisplay(market: MarketData): MarketDisplay {
  const h = market.headline;
  const hasValue = h.kind !== 'none' && h.kind !== 'reference' && (h.price != null || h.original != null);
  const fxNote = h.fxNote || null;
  const value: DisplayMoney | null = hasValue
    ? { eur: h.price != null ? eur(h.price) : null, original: h.original ? money(h.original.price, h.original.currency) : null, fxNote }
    : null;
  const range =
    hasValue && (h.from != null || h.original)
      ? {
          from: { eur: h.from != null ? eur(h.from) : null, original: h.original ? money(h.original.from, h.original.currency) : null, fxNote },
          to: { eur: h.to != null ? eur(h.to) : null, original: h.original ? money(h.original.to, h.original.currency) : null, fxNote },
        }
      : null;

  const notes = [h.note].filter(Boolean);
  const sold = [...market.soldComparables].filter(row => row.kind !== 'guide').map(comparable);
  const offers = [...market.currentOffers].filter(row => row.kind !== 'guide').map(comparable);

  return {
    status: market.status,
    marketValue: {
      title: 'Marktwert',
      state: hasValue ? 'value' : 'no_value',
      value,
      range,
      basis: hasValue ? h.basis : '',
      notes,
      noValueReason: hasValue ? null : market.message || 'Keine zuverlässige Bewertung möglich.',
    },
    comparableSales: {
      title: 'Vergleichsverkäufe',
      sold,
      offers,
      emptyText: sold.length || offers.length ? null : 'Keine passenden Vergleichsverkäufe gefunden.',
    },
    priceGuides: {
      title: 'Preisführer',
      disclaimer: 'Preisführer sind Richtwerte der jeweiligen Plattform, keine tatsächlich verkauften Artikel, und fließen nicht in den Marktwert ein.',
      items: market.priceGuides.map(entry => ({
        variant: 'guide' as const,
        badge: 'Preisführer' as const,
        label: entry.label,
        source: entry.source,
        price: {
          eur: entry.currency === 'EUR' ? eur(entry.price) : entry.eur ? eur(entry.eur.amount) : null,
          original: entry.currency === 'EUR' ? null : money(entry.price, entry.currency),
          fxNote: entry.eur ? entry.eur.note : null,
        },
        matchesTarget: entry.matchesTarget,
        observedAt: entry.observedAt,
        fetchedAt: entry.fetchedAt,
        expiresAt: entry.expiresAt,
      })),
    },
  };
}
