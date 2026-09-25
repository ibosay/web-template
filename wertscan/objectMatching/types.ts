/**
 * WertScan Objektidentität für Flohmarktware.
 *
 * Ziel: Nicht jedes Objekt wie einen Barcodeartikel behandeln.
 * Die Engine unterscheidet exakte Produkte, exakte Sammlerobjekte und nur vergleichbare Objekte.
 */

export type IdentityMode = 'exact_product' | 'exact_collectible' | 'comparable_object';

export type MatchQuality =
  | 'exact'
  | 'strong_comparable'
  | 'similar_only'
  | 'insufficient';

export type FleaMarketCategory =
  | 'electronics'
  | 'watches'
  | 'trading_cards'
  | 'toys'
  | 'model_cars'
  | 'rugs'
  | 'porcelain_glass'
  | 'books_media'
  | 'jewelry_coins'
  | 'tools'
  | 'household_appliances'
  | 'art_antiques'
  | 'furniture_home'
  | 'fashion_accessories'
  | 'music_instruments'
  | 'sports_outdoor'
  | 'generic';

export type IdentityField =
  | 'brand'
  | 'manufacturer'
  | 'model'
  | 'modelNumber'
  | 'sku'
  | 'gtin'
  | 'isbn'
  | 'serial'
  | 'name'
  | 'number'
  | 'set'
  | 'language'
  | 'variant'
  | 'gradingCompany'
  | 'grade'
  | 'casting'
  | 'toyNumber'
  | 'baseCode'
  | 'scale'
  | 'vehicleBrand'
  | 'vehicleModel'
  | 'material'
  | 'shape'
  | 'color'
  | 'size'
  | 'marking'
  | 'hallmark'
  | 'year'
  | 'edition'
  | 'pattern'
  | 'movement'
  | 'country'
  | 'style'
  | 'condition'
  | 'custom';

export type FactSource =
  | 'visible_text'
  | 'visible_feature'
  | 'user_input'
  | 'catalog'
  | 'derived';

export type IdentityFact = {
  field: IdentityField;
  value: string;
  confidence: number;
  source: FactSource;
  /** true bedeutet: direkt auf Foto oder vom Nutzer belegt, nicht nur aus Datenbankwissen ergänzt. */
  observed: boolean;
};

export type ObjectIdentityInput = {
  category: FleaMarketCategory;
  objectType: string;
  title?: string | null;
  facts: IdentityFact[];
  /** Produktfamilie, z. B. "Pokemon TCG", "Hot Wheels", "Armbanduhr". */
  family?: string | null;
  /** Spezialisierung innerhalb einer Kategorie, z. B. "pokemon_tcg", "pokemon_zukan", "hot_wheels". */
  subtype?: string | null;
};

export type IdentityRequirement = {
  field: IdentityField;
  weight: number;
  observedRequired?: boolean;
};

export type IdentityGroup = {
  /** Mindestens min dieser Felder müssen vorhanden sein. */
  fields: IdentityField[];
  min: number;
  observedRequired?: boolean;
};

export type CategoryProfile = {
  id: FleaMarketCategory;
  exactMode: Exclude<IdentityMode, 'comparable_object'>;
  exactAll?: IdentityRequirement[];
  exactAnyGroups?: IdentityGroup[];
  /** any = mindestens eine Gruppe genügt, all = jede Gruppe muss erfüllt sein. */
  exactGroupMode?: 'any' | 'all';
  comparableAll?: IdentityRequirement[];
  comparableAnyGroups?: IdentityGroup[];
  /** Vergleichsprofile brauchen meist mehrere Merkmalsgruppen gleichzeitig. */
  comparableGroupMode?: 'any' | 'all';
  strongFields: IdentityField[];
  supportingFields: IdentityField[];
  neverUseAsIdentity?: IdentityField[];
  exactMinScore: number;
  comparableMinScore: number;
  notes: string[];
};

export type IdentityDecision = {
  mode: IdentityMode;
  quality: MatchQuality;
  category: FleaMarketCategory;
  score: number;
  matchedFields: IdentityField[];
  missingExactFields: IdentityField[];
  searchTerms: string[];
  requiredSearchTerms: string[];
  optionalSearchTerms: string[];
  explanation: string[];
  valuationPolicy: {
    marketValueAllowed: boolean;
    comparisonRangeAllowed: boolean;
    minimumComparableCount: number;
    label: 'Exakt identifiziert' | 'Sehr gut vergleichbar' | 'Nur ähnliche Marktobjekte';
  };
};

export type CandidateEvidence = {
  title: string;
  fields: Partial<Record<IdentityField, string | string[]>>;
};

export type CandidateDecision = {
  accepted: boolean;
  quality: MatchQuality;
  score: number;
  matchedFields: IdentityField[];
  conflicts: IdentityField[];
  missingRequired: IdentityField[];
  explanation: string[];
};
