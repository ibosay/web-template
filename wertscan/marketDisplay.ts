/**
 * Anzeigevertrag für das Frontend (MARKET_DISPLAY_CONTRACT_VERSION = 1).
 *
 * Das Frontend rendert ausschließlich das Ergebnis von buildMarketDisplay() in drei Bereichen:
 *
 *   marketValue     – Hauptwert oder ausdrücklich "keine Bewertung" (noValueReason)
 *   soldComparables – tatsächlich verkaufte Artikel (sold); aktive Angebote getrennt (offers)
 *   priceGuides     – Preisführer/Marktindikatoren, eigene Optik, nie als Verkauf
 *
 * Das Frontend darf NICHT: Mediane oder Spannen berechnen, Preise zusammenführen, Preisführer
 * in den Marktwert übernehmen, Währungen umrechnen, Zustände ableiten oder bei state
 * 'no_value' einen Preis aus den anderen Bereichen anzeigen. Alle Beträge kommen fertig
 * formatiert; Rohbeträge liegen nur zur Barrierefreiheit/Sortierung bei.
 *
 * Optik wird ausschließlich über `variant` gesteuert: 'sold' | 'offer' | 'guide'.
 */
import { MarketData, MarketListing } from './marketPricePipeline';

export const MARKET_DISPLAY_CONTRACT_VERSION = 1;

export type DisplayMoney = {
  /** Formatierter EUR-Anzeigewert oder null (kein Kurs vorhanden). */
  eur: string | null;
  /** Originalbetrag der Quelle, wenn nicht EUR (z. B. "2.600 JPY"). */
  original: string | null;
  /** Pflichthinweis bei umgerechneten Beträgen (Kurs, Quelle, Stand). Immer anzeigen, wenn gesetzt. */
  fxNote: string | null;
};

/**
 * Grobe Kategorie des Status für Frontend-Logik und Logs:
 *  value            – Marktwert vorhanden
 *  insufficient     – Karte/Produkt erkannt, zu wenige Marktbelege
 *  ambiguous        – Karte nicht eindeutig zuordenbar
 *  incomplete       – Anbietersuche unvollständig (nie positive Zuordnung)
 *  not_found        – exakte Karte/Produkt nicht gefunden
 *  technical_error  – Quelle oder Anbieter technisch nicht erreichbar
 *  not_identified   – Gegenstand zu unsicher identifiziert
 */
export type StatusCategory = 'value' | 'comparable' | 'insufficient' | 'ambiguous' | 'incomplete' | 'not_found' | 'technical_error' | 'not_identified';

export type MarketValueSection = {
  state: 'value' | 'no_value';
  value: DisplayMoney | null;
  range: { from: DisplayMoney; to: DisplayMoney } | null;
  /** Woraus der Wert stammt (z. B. "Median aus … (tatsächlich verkauft)"). */
  basis: string;
  /** Zusätzliche Pflichthinweise (z. B. PCA-Basiswert-Satz). Alle anzeigen. */
  notes: string[];
  /** true = nur ein Teil der Verkäufe geladen → Hinweis "eingeschränkte Datenbasis" anzeigen. */
  limitedData: boolean;
  /** Bei state 'no_value' immer anzeigen – nie durch einen Preis ersetzen. */
  noValueReason: string | null;
};

export type ComparableItem = {
  variant: 'sold' | 'offer';
  badge: 'Verkauft' | 'Aktives Angebot';
  title: string;
  price: DisplayMoney;
  /** Rohbetrag in EUR nur für Sortierung/Screenreader – nicht für Berechnungen. */
  sortValueEur: number;
  source: string;
  observedAt: string | null;
  fetchedAt: string | null;
  url: string | null;
  grading: string | null;
  /** Transparenz für Flohmarktvergleiche: warum wurde dieser Treffer akzeptiert? */
  matchQuality: 'exact' | 'strong_comparable' | 'similar_only' | 'insufficient' | null;
  matchScore: number | null;
  matchedFields: string[];
  identityEvidence: string | null;
};

export type GuideItem = {
  variant: 'guide';
  badge: 'Preisführer';
  label: string;
  source: string;
  price: DisplayMoney;
  /** Passt zu Zustand/Grading des Exemplars (optisch hervorhebbar, bleibt Preisführer). */
  matchesTarget: boolean;
  observedAt: string | null;
  fetchedAt: string;
  expiresAt: string;
};

export type ComparisonRangeSection = {
  state: 'range' | 'none';
  label: 'Sehr gut vergleichbar' | 'Nur ähnliche Marktobjekte' | null;
  from: DisplayMoney | null;
  to: DisplayMoney | null;
  sampleCount: number;
  basis: string;
  note: string | null;
};

export type MarketDisplay = {
  contractVersion: typeof MARKET_DISPLAY_CONTRACT_VERSION;
  status: MarketData['status'];
  statusCategory: StatusCategory;
  message: string;
  /** Exakter Marktwert nur bei ausreichend sicherer Produktidentität. */
  marketValue: MarketValueSection;
  /** Für Flohmarktobjekte ohne sichere Modellreferenz: eigene Vergleichsspanne, nie als Marktwert beschriften. */
  comparisonRange: ComparisonRangeSection;
  identity: MarketData['objectMatch'];
  soldComparables: { sold: ComparableItem[]; offers: ComparableItem[]; emptyText: string | null };
  priceGuides: { disclaimer: string; items: GuideItem[] };
};

const CATEGORY: Record<MarketData['status'], StatusCategory> = {
  loading: 'insufficient',
  found: 'value',
  low_sample: 'insufficient',
  card_identified_no_market_evidence: 'insufficient',
  card_identified_insufficient_evidence: 'insufficient',
  filtered_all: 'insufficient',
  no_exact_matches: 'not_found',
  card_not_found: 'not_found',
  unsupported_language: 'not_found',
  card_not_unique: 'ambiguous',
  provider_search_incomplete: 'incomplete',
  sources_unreachable: 'technical_error',
  extraction_failed: 'technical_error',
  provider_error: 'technical_error',
  insufficient_identity: 'not_identified',
};

const eur = (value: number) => value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

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
    sortValueEur: row.price,
    source: row.source,
    observedAt: row.observedAt ?? (row.date || null),
    fetchedAt: row.fetchedAt || null,
    url: row.url || null,
    grading: row.grading && row.grading !== 'raw' ? row.grading.toUpperCase() : null,
    matchQuality: row.identityMatch?.quality || null,
    matchScore: row.identityMatch?.score ?? null,
    matchedFields: row.identityMatch?.matchedFields || [],
    identityEvidence: row.identityEvidence || null,
  };
}

export function buildMarketDisplay(market: MarketData): MarketDisplay {
  const h = market.headline;
  const exactValueAllowed = market.objectMatch?.marketValueAllowed !== false;
  const hasValue =
    exactValueAllowed &&
    market.status === 'found' &&
    h.kind !== 'none' &&
    h.kind !== 'reference' &&
    (h.price != null || h.original != null);
  const comparisonAllowed =
    market.objectMatch?.comparisonRangeAllowed === true &&
    market.objectMatch.marketValueAllowed === false &&
    h.kind !== 'none' &&
    h.kind !== 'reference' &&
    (h.from != null || h.original != null) &&
    h.sampleCount >= market.objectMatch.minimumComparableCount;
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

  // Preisführer können hier nie auftauchen (kind 'guide' wird ausgeschlossen).
  const sold = market.soldComparables.filter(row => row.kind !== 'guide').map(comparable);
  const offers = market.currentOffers.filter(row => row.kind !== 'guide').map(comparable);

  const comparisonRange: ComparisonRangeSection = comparisonAllowed
    ? {
        state: 'range',
        label:
          market.objectMatch?.label === 'Sehr gut vergleichbar'
            ? 'Sehr gut vergleichbar'
            : 'Nur ähnliche Marktobjekte',
        from: {
          eur: h.from != null ? eur(h.from) : null,
          original: h.original ? money(h.original.from, h.original.currency) : null,
          fxNote,
        },
        to: {
          eur: h.to != null ? eur(h.to) : null,
          original: h.original ? money(h.original.to, h.original.currency) : null,
          fxNote,
        },
        sampleCount: h.sampleCount,
        basis: h.basis,
        note: 'Exakte Modellreferenz unbekannt. Diese Spanne stammt aus vergleichbaren Marktobjekten und ist kein exakter Marktwert.',
      }
    : {
        state: 'none',
        label: null,
        from: null,
        to: null,
        sampleCount: 0,
        basis: '',
        note: null,
      };

  return {
    contractVersion: MARKET_DISPLAY_CONTRACT_VERSION,
    status: market.status,
    statusCategory: comparisonAllowed ? 'comparable' : CATEGORY[market.status],
    message: market.message,
    marketValue: {
      state: hasValue ? 'value' : 'no_value',
      value,
      range,
      basis: hasValue ? h.basis : '',
      notes: hasValue ? [h.note].filter(Boolean) : [],
      limitedData: hasValue && h.limitedData,
      noValueReason: hasValue
        ? null
        : comparisonAllowed
          ? 'Exakte Modellreferenz unbekannt. Deshalb wird kein exakter Marktwert ausgegeben.'
          : market.message || 'Keine zuverlässige Bewertung möglich.',
    },
    comparisonRange,
    identity: market.objectMatch || null,
    soldComparables: {
      sold,
      offers,
      emptyText: sold.length || offers.length ? null : 'Keine passenden Vergleichsverkäufe gefunden.',
    },
    priceGuides: {
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
