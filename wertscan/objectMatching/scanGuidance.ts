import { decideIdentity } from './engine';
import { objectIdentityFromAnalysis, WertScanAnalysisLike } from './analysisAdapter';
import { FleaMarketCategory, IdentityDecision, IdentityField, ObjectIdentityInput } from './types';

export type ScanViewId =
  | 'front'
  | 'back'
  | 'bottom'
  | 'top'
  | 'side'
  | 'label'
  | 'model_plate'
  | 'barcode'
  | 'serial_area'
  | 'marking'
  | 'signature'
  | 'grading_label'
  | 'card_number'
  | 'packaging'
  | 'full_object'
  | 'detail'
  | 'size_reference'
  | 'movement';

export type ScanView = {
  id: ScanViewId;
  title: string;
  reason: string;
  targetFields: IdentityField[];
  priority: 1 | 2 | 3;
};

export type ScanGuidance = {
  category: FleaMarketCategory;
  identityMode: IdentityDecision['mode'];
  canSearchNow: boolean;
  canShowExactMarketValue: boolean;
  missingExactFields: IdentityField[];
  nextViews: ScanView[];
  message: string;
};

type ViewTemplate = Omit<ScanView, 'priority'>;

const COMMON: Record<string, ViewTemplate> = {
  front: {
    id: 'front',
    title: 'Vorderseite komplett',
    reason: 'Zeigt Bauform, Marke, Modellbezeichnung und sichtbare Variantenmerkmale.',
    targetFields: ['brand', 'manufacturer', 'model', 'name', 'shape', 'color'],
  },
  back: {
    id: 'back',
    title: 'Rückseite komplett',
    reason: 'Auf der Rückseite stehen oft Hersteller, Produktionsdaten und weitere Kennzeichnungen.',
    targetFields: ['manufacturer', 'modelNumber', 'marking', 'year', 'country'],
  },
  label: {
    id: 'label',
    title: 'Etikett oder Typenschild nah',
    reason: 'Modellnummer, Artikelnummer, Material, Hersteller und Produktionsdaten sind für die genaue Zuordnung besonders wertvoll.',
    targetFields: ['brand', 'manufacturer', 'model', 'modelNumber', 'sku', 'gtin', 'material', 'year'],
  },
  barcode: {
    id: 'barcode',
    title: 'Barcode oder EAN nah',
    reason: 'Eine lesbare EAN oder GTIN kann ein standardisiertes Produkt eindeutig identifizieren.',
    targetFields: ['gtin', 'sku'],
  },
  marking: {
    id: 'marking',
    title: 'Beschriftungen und Prägungen nah',
    reason: 'Prägungen, Bodenmarken, Punzen und sichtbare Texte helfen bei alten oder seltenen Gegenständen.',
    targetFields: ['marking', 'hallmark', 'manufacturer', 'year', 'country'],
  },
  full: {
    id: 'full_object',
    title: 'Gegenstand komplett',
    reason: 'Eine vollständige Ansicht belegt Form, Größe, Farbe und Bauart.',
    targetFields: ['name', 'shape', 'size', 'color', 'style'],
  },
  size: {
    id: 'size_reference',
    title: 'Größe oder Maße zeigen',
    reason: 'Maße trennen ähnliche Modelle und verbessern Vergleichstreffer.',
    targetFields: ['size'],
  },
};

const CATEGORY_VIEWS: Record<FleaMarketCategory, ViewTemplate[]> = {
  electronics: [
    COMMON.front,
    {
      id: 'model_plate',
      title: 'Modellaufkleber oder Typenschild',
      reason: 'Bei Elektronik entscheidet die genaue Modellnummer über die Marktzuordnung.',
      targetFields: ['brand', 'model', 'modelNumber', 'sku', 'gtin'],
    },
    COMMON.barcode,
    COMMON.back,
  ],
  watches: [
    {
      id: 'front',
      title: 'Zifferblatt gerade und scharf',
      reason: 'Marke, Modellschrift, Zifferblattaufbau und Komplikationen müssen lesbar sein.',
      targetFields: ['brand', 'model', 'name', 'color', 'shape'],
    },
    {
      id: 'back',
      title: 'Gehäuseboden nah',
      reason: 'Referenz, Materialangaben, Prägungen und Herstellerhinweise stehen oft auf dem Boden.',
      targetFields: ['modelNumber', 'marking', 'material', 'manufacturer'],
    },
    {
      id: 'side',
      title: 'Seite und Krone',
      reason: 'Gehäuseform, Krone und Drücker helfen bei der Modellfamilie.',
      targetFields: ['shape', 'marking', 'model'],
    },
    {
      id: 'movement',
      title: 'Werk nur wenn bereits sicher zugänglich',
      reason: 'Kaliber und Werkmarkierungen können alte Uhren genauer zuordnen. Gehäuse nicht extra öffnen.',
      targetFields: ['movement', 'manufacturer', 'marking'],
    },
  ],
  trading_cards: [
    {
      id: 'front',
      title: 'Kartenvorderseite gerade',
      reason: 'Name, Nummer, Set, Sprache und Variante müssen gemeinsam lesbar sein.',
      targetFields: ['name', 'number', 'set', 'language', 'variant'],
    },
    {
      id: 'card_number',
      title: 'Kartennummer und Setbereich nah',
      reason: 'Die vollständige gedruckte Nummer ist einer der stärksten Identitätsbelege.',
      targetFields: ['number', 'set', 'variant'],
    },
    {
      id: 'back',
      title: 'Kartenrückseite',
      reason: 'Rückseite hilft bei Sprache, Produktlinie, Echtheitsmerkmalen und Zustand.',
      targetFields: ['language', 'variant', 'condition'],
    },
    {
      id: 'grading_label',
      title: 'Grading Label komplett',
      reason: 'Firma, Note, Kartennummer und Labeldaten müssen exakt zum Marktsegment passen.',
      targetFields: ['gradingCompany', 'grade', 'name', 'number'],
    },
  ],
  toys: [
    COMMON.front,
    {
      id: 'bottom',
      title: 'Unterseite und Prägungen',
      reason: 'Hersteller, Casting, Base Code, Copyrightjahr und Artikelnummer stehen bei Spielzeug oft unten.',
      targetFields: ['manufacturer', 'casting', 'baseCode', 'toyNumber', 'year', 'marking'],
    },
    {
      id: 'packaging',
      title: 'Verpackung komplett',
      reason: 'Serienname, Artikelnummer, Sondervariante und Barcode können auf der Verpackung stehen.',
      targetFields: ['name', 'toyNumber', 'variant', 'gtin', 'edition'],
    },
    COMMON.marking,
  ],
  model_cars: [
    COMMON.front,
    {
      id: 'bottom',
      title: 'Bodenplatte nah',
      reason: 'Miniaturhersteller, Fahrzeugmodell, Maßstab und Artikelnummer stehen häufig auf der Bodenplatte.',
      targetFields: ['manufacturer', 'vehicleBrand', 'vehicleModel', 'scale', 'modelNumber', 'toyNumber'],
    },
    {
      id: 'packaging',
      title: 'Verpackung und Artikelcode',
      reason: 'Herstellerartikelnummer und Modellbezeichnung sind auf der Box oft eindeutiger als am Modell.',
      targetFields: ['modelNumber', 'toyNumber', 'vehicleModel', 'scale', 'gtin'],
    },
  ],
  rugs: [
    COMMON.full,
    COMMON.size,
    {
      id: 'back',
      title: 'Rückseite und Fransen',
      reason: 'Webart, Knoten, Rücken und Fransen helfen bei Material und Herstellungsart.',
      targetFields: ['material', 'pattern', 'country', 'marking'],
    },
    COMMON.label,
  ],
  porcelain_glass: [
    COMMON.full,
    {
      id: 'bottom',
      title: 'Bodenmarke nah',
      reason: 'Herstellerzeichen, Formnummer und Herkunft stehen häufig am Boden.',
      targetFields: ['manufacturer', 'marking', 'modelNumber', 'country', 'year'],
    },
    {
      id: 'detail',
      title: 'Dekor und Muster nah',
      reason: 'Dekor, Serie und Formdetails unterscheiden ähnliche Stücke.',
      targetFields: ['pattern', 'name', 'shape', 'color'],
    },
  ],
  books_media: [
    {
      id: 'front',
      title: 'Cover oder Vorderseite',
      reason: 'Titel, Ausgabe und Verlag müssen erkennbar sein.',
      targetFields: ['name', 'edition', 'year'],
    },
    {
      id: 'barcode',
      title: 'ISBN oder Barcode nah',
      reason: 'ISBN oder EAN ist bei Büchern und Medien die stärkste Produktkennung.',
      targetFields: ['isbn', 'gtin'],
    },
    {
      id: 'back',
      title: 'Impressum oder Rückseite',
      reason: 'Ausgabe, Erscheinungsjahr, Sprache und Verlag lassen sich dort bestätigen.',
      targetFields: ['edition', 'year', 'language', 'manufacturer'],
    },
  ],
  jewelry_coins: [
    COMMON.front,
    {
      id: 'marking',
      title: 'Punze oder Prägung sehr nah',
      reason: 'Punze, Feingehalt, Hersteller und Prägedaten sind zentrale Identitätsmerkmale.',
      targetFields: ['hallmark', 'marking', 'manufacturer', 'year', 'country'],
    },
    {
      id: 'back',
      title: 'Rückseite',
      reason: 'Bei Münzen und Medaillen müssen beide Seiten verglichen werden.',
      targetFields: ['name', 'year', 'country', 'marking'],
    },
    COMMON.size,
  ],
  tools: [
    COMMON.front,
    {
      id: 'model_plate',
      title: 'Typenschild nah',
      reason: 'Modell, Typnummer, Spannung und Artikelcode trennen sehr ähnliche Werkzeugserien.',
      targetFields: ['brand', 'model', 'modelNumber', 'sku', 'gtin'],
    },
    COMMON.label,
  ],
  household_appliances: [
    COMMON.front,
    {
      id: 'model_plate',
      title: 'E Nummer oder Typenschild nah',
      reason: 'E Nummer, Modellnummer und Produktcode sind für Haushaltsgeräte entscheidend.',
      targetFields: ['brand', 'model', 'modelNumber', 'sku', 'gtin'],
    },
    COMMON.label,
  ],
  art_antiques: [
    COMMON.full,
    {
      id: 'signature',
      title: 'Signatur oder Stempel nah',
      reason: 'Eine echte Signatur, Marke oder Katalogkennung kann die Identität stark verbessern.',
      targetFields: ['manufacturer', 'name', 'marking', 'year'],
    },
    {
      id: 'back',
      title: 'Rückseite und Rahmen',
      reason: 'Etiketten, Galeriestempel, alte Beschriftungen und Materialhinweise stehen oft hinten.',
      targetFields: ['marking', 'year', 'country', 'material'],
    },
    COMMON.size,
  ],
  furniture_home: [
    COMMON.full,
    COMMON.size,
    {
      id: 'bottom',
      title: 'Unterseite oder Rückseite',
      reason: 'Herstelleretiketten, Modellcodes und Produktionsstempel sind bei Möbeln oft verborgen.',
      targetFields: ['manufacturer', 'brand', 'modelNumber', 'marking', 'year'],
    },
    COMMON.label,
  ],
  fashion_accessories: [
    COMMON.front,
    {
      id: 'label',
      title: 'Innenetikett oder Stylecode',
      reason: 'Stylecode, Modellnummer, Material und Herstellungsland trennen ähnliche Varianten.',
      targetFields: ['brand', 'model', 'modelNumber', 'sku', 'material', 'country'],
    },
    {
      id: 'detail',
      title: 'Logo, Hardware und Nähte nah',
      reason: 'Details helfen bei Modellvariante und Plausibilitätsprüfung.',
      targetFields: ['marking', 'variant', 'material', 'color'],
    },
  ],
  music_instruments: [
    COMMON.full,
    {
      id: 'label',
      title: 'Logo, Modellschrift oder Innenetikett',
      reason: 'Marke und Modell müssen direkt am Instrument bestätigt werden.',
      targetFields: ['brand', 'manufacturer', 'model', 'modelNumber', 'marking'],
    },
    {
      id: 'back',
      title: 'Rückseite, Kopfplatte oder Anschlussfeld',
      reason: 'Dort stehen oft Modellcode, Herstellungsland und Produktionshinweise.',
      targetFields: ['modelNumber', 'marking', 'country', 'year'],
    },
  ],
  sports_outdoor: [
    COMMON.full,
    {
      id: 'label',
      title: 'Modell und Größenetikett nah',
      reason: 'Modellcode und Größe unterscheiden nahe verwandte Sport und Outdoor Produkte.',
      targetFields: ['brand', 'model', 'modelNumber', 'sku', 'size'],
    },
    COMMON.marking,
  ],
  generic: [COMMON.full, COMMON.marking, COMMON.label, COMMON.back, COMMON.size],
};

function factExists(input: ObjectIdentityInput, field: IdentityField) {
  return input.facts.some(fact => fact.field === field && fact.observed && fact.confidence >= 0.55 && fact.value.trim());
}

function uniqueViews(views: ScanView[]) {
  const seen = new Set<ScanViewId>();
  return views.filter(view => {
    if (seen.has(view.id)) return false;
    seen.add(view.id);
    return true;
  });
}

export function buildScanGuidance(
  input: ObjectIdentityInput,
  decision: IdentityDecision = decideIdentity(input),
): ScanGuidance {
  const missing = decision.missingExactFields;
  const templates = CATEGORY_VIEWS[input.category] || CATEGORY_VIEWS.generic;

  const ranked = templates
    .map(template => {
      const missingHits = template.targetFields.filter(field => missing.includes(field)).length;
      const absentHits = template.targetFields.filter(field => !factExists(input, field)).length;
      const priority: 1 | 2 | 3 = missingHits > 0 ? 1 : absentHits >= 2 ? 2 : 3;
      return { ...template, priority };
    })
    .sort((a, b) => a.priority - b.priority);

  const nextViews = uniqueViews(ranked)
    .filter(view => view.priority <= 2)
    .slice(0, 3);

  const canSearchNow = decision.requiredSearchTerms.length >= 2 || decision.mode !== 'comparable_object';
  const canShowExactMarketValue = decision.valuationPolicy.marketValueAllowed;

  let message = 'Genug sichtbare Merkmale für eine vorsichtige Marktsuche vorhanden.';
  if (!canSearchNow) {
    message = 'Noch zu wenig belastbare Merkmale. Weitere Fotos sind sinnvoll, bevor Marktpreise gesucht werden.';
  } else if (!canShowExactMarketValue) {
    message = 'Vergleichssuche ist möglich, aber für einen exakten Marktwert fehlt noch eine sichere Produktidentität.';
  }

  return {
    category: input.category,
    identityMode: decision.mode,
    canSearchNow,
    canShowExactMarketValue,
    missingExactFields: missing,
    nextViews,
    message,
  };
}

export function buildScanGuidanceFromAnalysis(analysis: WertScanAnalysisLike): ScanGuidance {
  const input = objectIdentityFromAnalysis(analysis);
  return buildScanGuidance(input);
}
