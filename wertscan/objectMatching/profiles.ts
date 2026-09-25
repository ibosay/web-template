import { CategoryProfile, FleaMarketCategory, ObjectIdentityInput } from './types';

const genericComparable: CategoryProfile = {
  id: 'generic',
  exactMode: 'exact_product',
  exactAll: [],
  exactAnyGroups: [{ fields: ['modelNumber', 'sku', 'gtin'], min: 1, observedRequired: true }],
  comparableAll: [],
  comparableAnyGroups: [
    { fields: ['brand', 'manufacturer', 'name', 'model'], min: 1, observedRequired: true },
    { fields: ['material', 'shape', 'color', 'size', 'marking', 'year'], min: 2, observedRequired: true },
  ],
  strongFields: ['brand', 'manufacturer', 'model', 'modelNumber', 'name', 'marking', 'material', 'shape', 'size'],
  supportingFields: ['color', 'year', 'condition', 'country'],
  neverUseAsIdentity: ['serial'],
  exactMinScore: 0.9,
  comparableMinScore: 0.58,
  notes: ['Ohne stabile Produktkennung wird nur mit vergleichbaren Objekten gearbeitet.'],
};

const profiles: Record<FleaMarketCategory, CategoryProfile> = {
  electronics: {
    id: 'electronics',
    exactMode: 'exact_product',
    exactAll: [{ field: 'brand', weight: 2, observedRequired: true }],
    exactAnyGroups: [{ fields: ['modelNumber', 'sku', 'gtin', 'model'], min: 1, observedRequired: true }],
    comparableAnyGroups: [
      { fields: ['brand', 'manufacturer'], min: 1, observedRequired: true },
      { fields: ['name', 'model', 'size', 'edition'], min: 2, observedRequired: true },
    ],
    strongFields: ['brand', 'modelNumber', 'sku', 'gtin', 'model', 'edition', 'size'],
    supportingFields: ['color', 'condition', 'year'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.88,
    comparableMinScore: 0.64,
    notes: ['Typenschild, Modellnummer, SKU oder GTIN haben Vorrang vor Gehäuseähnlichkeit.'],
  },

  watches: {
    id: 'watches',
    exactMode: 'exact_product',
    exactAll: [{ field: 'brand', weight: 2, observedRequired: true }],
    exactAnyGroups: [{ fields: ['modelNumber', 'model'], min: 1, observedRequired: true }],
    comparableAll: [{ field: 'brand', weight: 2, observedRequired: true }],
    comparableAnyGroups: [
      { fields: ['material', 'shape', 'marking', 'movement', 'year', 'color'], min: 2, observedRequired: true },
    ],
    strongFields: ['brand', 'modelNumber', 'model', 'marking', 'material', 'shape', 'movement'],
    supportingFields: ['year', 'color', 'size', 'condition'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.9,
    comparableMinScore: 0.6,
    notes: [
      'Eine Seriennummer ist kein Modell.',
      'Fehlt die Referenz, darf mit Marke plus sichtbaren Gehäuse, Zifferblatt und Werkmerkmalen verglichen werden.',
    ],
  },

  trading_cards: {
    id: 'trading_cards',
    exactMode: 'exact_collectible',
    exactAll: [{ field: 'number', weight: 3, observedRequired: true }],
    exactAnyGroups: [{ fields: ['name', 'set'], min: 1, observedRequired: true }],
    comparableAll: [],
    comparableAnyGroups: [
      { fields: ['name', 'number'], min: 1, observedRequired: true },
      { fields: ['set', 'language', 'variant'], min: 1, observedRequired: true },
    ],
    strongFields: ['number', 'name', 'set', 'language', 'variant', 'gradingCompany', 'grade'],
    supportingFields: ['edition', 'year', 'condition'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.92,
    comparableMinScore: 0.7,
    notes: [
      'Kartenname und vollständige Nummer bilden die primäre Identität.',
      'Bei gegradeten Karten müssen Grading Firma und Note im Marktsegment separat exakt bleiben.',
    ],
  },

  toys: {
    id: 'toys',
    exactMode: 'exact_collectible',
    exactAll: [],
    exactAnyGroups: [
      { fields: ['manufacturer', 'brand'], min: 1, observedRequired: true },
      { fields: ['toyNumber', 'modelNumber', 'baseCode', 'casting', 'name'], min: 1, observedRequired: true },
    ],
    comparableAnyGroups: [
      { fields: ['manufacturer', 'brand', 'name', 'casting'], min: 2, observedRequired: true },
      { fields: ['color', 'marking', 'year', 'edition'], min: 1, observedRequired: true },
    ],
    strongFields: ['manufacturer', 'brand', 'toyNumber', 'modelNumber', 'casting', 'baseCode', 'name', 'edition'],
    supportingFields: ['color', 'marking', 'year', 'condition'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.86,
    comparableMinScore: 0.6,
    notes: ['Farbe allein beweist keine seltene Variante. Herstellerprägung und Artikelnummer sind stärker.'],
  },

  model_cars: {
    id: 'model_cars',
    exactMode: 'exact_collectible',
    exactAll: [{ field: 'manufacturer', weight: 2, observedRequired: true }],
    exactAnyGroups: [
      { fields: ['modelNumber', 'toyNumber'], min: 1, observedRequired: true },
      { fields: ['vehicleModel', 'scale'], min: 2, observedRequired: true },
    ],
    comparableAll: [],
    comparableAnyGroups: [
      { fields: ['manufacturer', 'vehicleBrand', 'vehicleModel'], min: 2, observedRequired: true },
      { fields: ['scale', 'color', 'marking'], min: 1, observedRequired: true },
    ],
    strongFields: ['manufacturer', 'modelNumber', 'vehicleBrand', 'vehicleModel', 'scale', 'toyNumber'],
    supportingFields: ['color', 'year', 'marking', 'condition'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.86,
    comparableMinScore: 0.62,
    notes: ['Fahrzeugmarke und Hersteller des Miniaturmodells werden getrennt behandelt.'],
  },

  rugs: {
    id: 'rugs',
    exactMode: 'exact_product',
    exactAll: [{ field: 'manufacturer', weight: 2, observedRequired: true }],
    exactAnyGroups: [{ fields: ['modelNumber', 'sku'], min: 1, observedRequired: true }],
    comparableAll: [],
    comparableAnyGroups: [
      { fields: ['material', 'pattern', 'size', 'country', 'marking'], min: 3, observedRequired: true },
    ],
    strongFields: ['manufacturer', 'modelNumber', 'material', 'pattern', 'size', 'country', 'marking'],
    supportingFields: ['color', 'year', 'condition'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.9,
    comparableMinScore: 0.58,
    notes: ['Ohne Hersteller und Modellcode wird bei Teppichen fast immer nur vergleichend bewertet.'],
  },

  porcelain_glass: {
    id: 'porcelain_glass',
    exactMode: 'exact_collectible',
    exactAll: [{ field: 'manufacturer', weight: 2, observedRequired: true }],
    exactAnyGroups: [{ fields: ['modelNumber', 'pattern', 'name'], min: 1, observedRequired: true }],
    comparableAll: [],
    comparableAnyGroups: [
      { fields: ['manufacturer', 'marking'], min: 1, observedRequired: true },
      { fields: ['pattern', 'shape', 'color', 'size'], min: 2, observedRequired: true },
    ],
    strongFields: ['manufacturer', 'marking', 'modelNumber', 'pattern', 'name', 'shape'],
    supportingFields: ['color', 'size', 'year', 'condition'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.86,
    comparableMinScore: 0.6,
    notes: ['Bodenmarke und Formnummer wiegen stärker als reine Dekorähnlichkeit.'],
  },

  books_media: {
    id: 'books_media',
    exactMode: 'exact_product',
    exactAll: [],
    exactAnyGroups: [
      { fields: ['isbn', 'gtin'], min: 1, observedRequired: true },
      { fields: ['name', 'edition'], min: 2, observedRequired: true },
    ],
    comparableAnyGroups: [{ fields: ['name', 'year', 'edition'], min: 2, observedRequired: true }],
    strongFields: ['isbn', 'gtin', 'name', 'edition', 'year'],
    supportingFields: ['condition', 'language'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.9,
    comparableMinScore: 0.68,
    notes: ['ISBN oder EAN ist die stärkste Identität, ansonsten Ausgabe und Titel zusammen.'],
  },

  jewelry_coins: {
    id: 'jewelry_coins',
    exactMode: 'exact_collectible',
    exactAll: [],
    exactAnyGroups: [
      { fields: ['modelNumber', 'sku'], min: 1, observedRequired: true },
      { fields: ['name', 'year', 'country'], min: 3, observedRequired: true },
    ],
    comparableAnyGroups: [
      { fields: ['hallmark', 'material', 'marking', 'name'], min: 2, observedRequired: true },
    ],
    strongFields: ['hallmark', 'material', 'modelNumber', 'name', 'year', 'country'],
    supportingFields: ['shape', 'size', 'condition'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.9,
    comparableMinScore: 0.62,
    notes: ['Punze, Material und bei Münzen Jahr, Land und Nominal sind entscheidend.'],
  },

  tools: {
    id: 'tools',
    exactMode: 'exact_product',
    exactAll: [{ field: 'brand', weight: 2, observedRequired: true }],
    exactAnyGroups: [{ fields: ['modelNumber', 'sku', 'gtin', 'model'], min: 1, observedRequired: true }],
    comparableAnyGroups: [
      { fields: ['brand', 'manufacturer'], min: 1, observedRequired: true },
      { fields: ['name', 'model', 'size'], min: 2, observedRequired: true },
    ],
    strongFields: ['brand', 'modelNumber', 'sku', 'gtin', 'model'],
    supportingFields: ['size', 'year', 'condition'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.88,
    comparableMinScore: 0.64,
    notes: ['Modellcode und Typenschild sind wichtiger als Farbe oder Gehäuseform.'],
  },

  household_appliances: {
    id: 'household_appliances',
    exactMode: 'exact_product',
    exactAll: [{ field: 'brand', weight: 2, observedRequired: true }],
    exactAnyGroups: [{ fields: ['modelNumber', 'sku', 'gtin', 'model'], min: 1, observedRequired: true }],
    comparableAnyGroups: [
      { fields: ['brand', 'manufacturer'], min: 1, observedRequired: true },
      { fields: ['name', 'model', 'size'], min: 2, observedRequired: true },
    ],
    strongFields: ['brand', 'modelNumber', 'sku', 'gtin', 'model'],
    supportingFields: ['size', 'year', 'condition'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.88,
    comparableMinScore: 0.64,
    notes: ['E Nr, Produktcode oder Modellnummer sind die primären Suchmerkmale.'],
  },

  art_antiques: {
    id: 'art_antiques',
    exactMode: 'exact_collectible',
    exactAll: [],
    exactAnyGroups: [
      { fields: ['manufacturer', 'modelNumber'], min: 2, observedRequired: true },
      { fields: ['name', 'marking', 'year'], min: 3, observedRequired: true },
    ],
    comparableAnyGroups: [
      { fields: ['material', 'shape', 'marking', 'size', 'year', 'pattern'], min: 3, observedRequired: true },
    ],
    strongFields: ['manufacturer', 'name', 'marking', 'modelNumber', 'material', 'shape', 'year', 'size'],
    supportingFields: ['pattern', 'color', 'condition'],
    neverUseAsIdentity: ['serial'],
    exactMinScore: 0.94,
    comparableMinScore: 0.6,
    notes: ['Bei Antiquitäten und Kunst wird ohne belastbare Signatur oder Katalogreferenz nicht von exakter Identität gesprochen.'],
  },

  generic: genericComparable,
};

export function categoryProfile(input: ObjectIdentityInput): CategoryProfile {
  const base = profiles[input.category] || genericComparable;
  const subtype = String(input.subtype || '').toLowerCase();

  if (input.category === 'trading_cards' && /zukan|carddass|topsun|topps|lamincard|non.?tcg/.test(subtype)) {
    return {
      ...base,
      exactAll: [
        { field: 'name', weight: 3, observedRequired: true },
        { field: 'number', weight: 3, observedRequired: true },
      ],
      exactAnyGroups: [],
      strongFields: ['name', 'number', 'set', 'year', 'gradingCompany', 'grade', 'language', 'variant'],
      notes: [
        'Non TCG Sammelkarten werden nicht gegen einen TCG Katalog erzwungen.',
        'Name und vollständige Nummer müssen für eine exakte Webidentität gemeinsam passen.',
      ],
    };
  }

  if (input.category === 'toys' && /hot.?wheels/.test(subtype)) {
    return {
      ...base,
      exactAnyGroups: [
        { fields: ['manufacturer', 'brand'], min: 1, observedRequired: true },
        { fields: ['toyNumber', 'casting', 'baseCode'], min: 1, observedRequired: true },
      ],
      strongFields: ['manufacturer', 'brand', 'casting', 'toyNumber', 'baseCode', 'variant', 'color', 'marking'],
      notes: [
        'Hot Wheels Varianten werden über Casting, Toy Number, Base Code, Räder, Lack und Kennzeichnungen getrennt.',
        'Farbe allein macht keine seltene Variante.',
      ],
    };
  }

  return base;
}

export function allCategoryProfiles(): CategoryProfile[] {
  return Object.values(profiles);
}
