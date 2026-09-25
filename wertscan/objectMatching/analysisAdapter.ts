import { FleaMarketCategory, IdentityFact, IdentityField, ObjectIdentityInput } from './types';

type Details = Record<string, unknown>;

export type WertScanAnalysisLike = {
  category?: string | null;
  objectType?: string | null;
  brand?: string | null;
  model?: string | null;
  title?: string | null;
  material?: string | null;
  condition?: string | null;
  confidence?: number | null;
  categoryConfidence?: number | null;
  brandConfidence?: number | null;
  modelConfidence?: number | null;
  visualText?: string[] | null;
  identifiers?: string[] | null;
  universalDetails?: Details | null;
  cardDetails?: Details | null;
  casioDetails?: Details | null;
  hotWheelsDetails?: Details | null;
  modelCarDetails?: Details | null;
  rugDetails?: Details | null;
  toyDetails?: Details | null;
};

function fold(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
}

function norm(value: unknown) {
  return fold(value).replace(/[^a-z0-9぀-ヿ一-鿿]+/g, ' ').trim();
}

function compact(value: unknown) {
  return norm(value).replace(/ /g, '');
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberConfidence(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function valueOf(details: Details | null | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = text(details?.[key]);
    if (value) return value;
  }
  return '';
}

function visiblePool(analysis: WertScanAnalysisLike) {
  const values = [
    ...(analysis.visualText || []),
    ...(analysis.identifiers || []),
    valueOf(analysis.universalDetails, 'visibleMarks'),
    valueOf(analysis.cardDetails, 'authenticityNotes'),
  ];
  return values.map(text).filter(Boolean);
}

function supportedByVisible(value: string, pool: string[]) {
  const needle = compact(value);
  if (needle.length < 2) return false;
  return pool.some(row => compact(row).includes(needle));
}

function pushFact(
  target: IdentityFact[],
  field: IdentityField,
  value: string,
  confidence: number,
  observed: boolean,
  source: IdentityFact['source'] = 'visible_feature',
) {
  const clean = value.trim();
  if (!clean) return;
  const duplicate = target.some(item => item.field === field && compact(item.value) === compact(clean));
  if (duplicate) return;
  target.push({
    field,
    value: clean,
    confidence: Math.max(0, Math.min(1, confidence)),
    observed,
    source,
  });
}

function categoryOf(analysis: WertScanAnalysisLike): FleaMarketCategory {
  const value = norm([
    analysis.category,
    analysis.objectType,
    analysis.brand,
    analysis.title,
    valueOf(analysis.hotWheelsDetails, 'castingName'),
  ].filter(Boolean).join(' '));

  if (/sammelkarte|trading card|pokemon|pokémon|yugioh|magic the gathering/.test(value)) return 'trading_cards';
  if (/hot wheels/.test(value)) return 'toys';
  if (/modellauto|diecast/.test(value)) return 'model_cars';
  if (/teppich|rug|carpet|kilim/.test(value)) return 'rugs';
  if (/uhr|armbanduhr|watch|smartwatch/.test(value) && !/smartwatch/.test(value)) return 'watches';
  if (/porzellan|keramik|glas|vase|teller|figurine/.test(value)) return 'porcelain_glass';
  if (/buch|comic|magazin|schallplatte|vinyl|cd|dvd|blu ray|videospiel/.test(value)) return 'books_media';
  if (/schmuck|ring|kette|armband|munze|münze|medaille|briefmarke/.test(value)) return 'jewelry_coins';
  if (/werkzeug|bohrmaschine|säge|sage|schrauber|werkzeugkoffer/.test(value)) return 'tools';
  if (/waschmaschine|trockner|geschirrspuler|kühlschrank|kuhlschrank|backofen|kochfeld|kaffeemaschine|haushaltsgerat/.test(value)) return 'household_appliances';
  if (/gemalde|gemälde|druck|antiquitat|antiquität|skulptur|kunst/.test(value)) return 'art_antiques';
  if (/spielzeug|figur|puppe|lego|playmobil|hot wheels|matchbox|plüschtier|pluschtier/.test(value)) return 'toys';
  if (/technik|elektronik|computer|maus|tastatur|konsole|controller|kamera|objektiv|smartphone|smartwatch|smart watch|tablet|laptop|fernseher|kopfhörer|kopfhorer|lautsprecher/.test(value)) return 'electronics';

  return 'generic';
}

function subtypeOf(analysis: WertScanAnalysisLike, category: FleaMarketCategory) {
  const combined = norm([
    analysis.brand,
    analysis.model,
    analysis.title,
    valueOf(analysis.cardDetails, 'franchise'),
    valueOf(analysis.cardDetails, 'setName'),
    valueOf(analysis.hotWheelsDetails, 'castingName'),
  ].filter(Boolean).join(' '));

  if (category === 'trading_cards') {
    if (/zukan|carddass|topsun|topps|lamincard|non tcg|non sport/.test(combined)) return 'pokemon_zukan';
    if (/pokemon|pokémon/.test(combined)) return 'pokemon_tcg';
  }
  if (category === 'toys' && /hot wheels/.test(combined)) return 'hot_wheels';
  if (category === 'jewelry_coins' && /munze|münze|coin|medaille/.test(combined)) return 'coin';
  return null;
}

export function objectIdentityFromAnalysis(analysis: WertScanAnalysisLike): ObjectIdentityInput {
  const category = categoryOf(analysis);
  const pool = visiblePool(analysis);
  const facts: IdentityFact[] = [];
  const u = analysis.universalDetails;
  const c = analysis.cardDetails;
  const hw = analysis.hotWheelsDetails;
  const mc = analysis.modelCarDetails;
  const rug = analysis.rugDetails;

  const brand = text(analysis.brand);
  if (brand) {
    pushFact(
      facts,
      'brand',
      brand,
      numberConfidence(analysis.brandConfidence, 0.72),
      supportedByVisible(brand, pool) || numberConfidence(analysis.brandConfidence, 0) >= 0.9,
      'visible_text',
    );
  }

  const manufacturer = valueOf(u, 'manufacturer') || valueOf(hw, 'manufacturer') || valueOf(mc, 'miniatureMaker');
  if (manufacturer) {
    pushFact(
      facts,
      'manufacturer',
      manufacturer,
      numberConfidence(u?.detailConfidence, 0.75),
      supportedByVisible(manufacturer, pool) || numberConfidence(u?.detailConfidence, 0) >= 0.8,
      'visible_text',
    );
  }

  const model = text(analysis.model);
  if (model && !/nicht erkannt|unbekannt/i.test(model)) {
    pushFact(
      facts,
      'model',
      model,
      numberConfidence(analysis.modelConfidence, 0.65),
      supportedByVisible(model, pool),
      'visible_text',
    );
  }

  const modelNumber =
    valueOf(u, 'modelNumber') ||
    valueOf(analysis.casioDetails, 'referenceNumber') ||
    valueOf(mc, 'itemCode');
  if (modelNumber) pushFact(facts, 'modelNumber', modelNumber, 0.97, true, 'visible_text');

  const sku = valueOf(u, 'skuOrPartNumber');
  if (sku) pushFact(facts, 'sku', sku, 0.96, true, 'visible_text');

  const barcode = valueOf(u, 'barcodeOrEan');
  if (barcode) pushFact(facts, 'gtin', barcode, 0.98, true, 'visible_text');

  const serial = valueOf(u, 'serialOrProductionCode');
  if (serial) pushFact(facts, 'serial', serial, 0.95, true, 'visible_text');

  if (category === 'trading_cards') {
    const name = valueOf(c, 'cardName');
    const number = valueOf(c, 'cardNumber');
    const set = valueOf(c, 'setName', 'setCode');
    const language = valueOf(c, 'language');
    const variant = valueOf(c, 'finish', 'variant', 'edition');
    const gradingCompany = valueOf(c, 'gradingCompany');
    const grade = valueOf(c, 'grade');

    if (name) pushFact(facts, 'name', name, 0.97, true, 'visible_text');
    if (number) pushFact(facts, 'number', number, 0.99, true, 'visible_text');
    if (set) pushFact(facts, 'set', set, 0.9, true, 'visible_text');
    if (language) pushFact(facts, 'language', language, 0.9, true, 'visible_feature');
    if (variant) pushFact(facts, 'variant', variant, 0.88, true, 'visible_feature');
    if (gradingCompany) pushFact(facts, 'gradingCompany', gradingCompany, 0.99, true, 'visible_text');
    if (grade) pushFact(facts, 'grade', grade, 0.99, true, 'visible_text');
  }

  if (category === 'toys') {
    const casting = valueOf(hw, 'castingName') || valueOf(analysis.toyDetails, 'productFamily', 'character');
    const toyNumber = valueOf(hw, 'toyNumber') || valueOf(analysis.toyDetails, 'itemNumber');
    const baseCode = valueOf(hw, 'baseCode');
    const variant = valueOf(hw, 'rarityClass') || valueOf(analysis.toyDetails, 'variant');
    const toyColor = valueOf(hw, 'color') || valueOf(analysis.toyDetails, 'primaryColor');

    if (casting) pushFact(facts, 'casting', casting, 0.92, true, 'visible_feature');
    if (toyNumber) pushFact(facts, 'toyNumber', toyNumber, 0.97, true, 'visible_text');
    if (baseCode) pushFact(facts, 'baseCode', baseCode, 0.96, true, 'visible_text');
    if (variant) pushFact(facts, 'variant', variant, 0.82, true, 'visible_feature');
    if (toyColor) pushFact(facts, 'color', toyColor, 0.9, true, 'visible_feature');
  }

  if (category === 'model_cars') {
    const maker = valueOf(mc, 'miniatureMaker');
    const vehicleBrand = valueOf(mc, 'vehicleBrand');
    const vehicleModel = valueOf(mc, 'vehicleModel');
    const scale = valueOf(mc, 'scale');
    const color = valueOf(mc, 'color');

    if (maker) pushFact(facts, 'manufacturer', maker, 0.96, true, 'visible_text');
    if (vehicleBrand) pushFact(facts, 'vehicleBrand', vehicleBrand, 0.92, true, 'visible_feature');
    if (vehicleModel) pushFact(facts, 'vehicleModel', vehicleModel, 0.95, true, 'visible_feature');
    if (scale) pushFact(facts, 'scale', scale, 0.97, true, 'visible_text');
    if (color) pushFact(facts, 'color', color, 0.9, true, 'visible_feature');
  }

  const material = text(analysis.material) || valueOf(u, 'material') || valueOf(rug, 'material');
  if (material) pushFact(facts, 'material', material, 0.86, true, 'visible_feature');

  const color =
    valueOf(u, 'primaryColor') ||
    valueOf(rug, 'colors') ||
    valueOf(mc, 'color');
  if (color) pushFact(facts, 'color', color, 0.86, true, 'visible_feature');

  const size = valueOf(u, 'dimensionsOrSize') || valueOf(rug, 'dimensions', 'size');
  if (size) pushFact(facts, 'size', size, 0.92, true, 'visible_feature');

  const marking =
    valueOf(u, 'visibleMarks') ||
    valueOf(rug, 'label', 'marking') ||
    valueOf(analysis.toyDetails, 'manufacturerMark');
  if (marking) pushFact(facts, 'marking', marking, 0.94, true, 'visible_text');

  const year = valueOf(u, 'productionYear', 'releaseYear') || valueOf(hw, 'releaseYear') || valueOf(mc, 'year');
  if (year) pushFact(facts, 'year', year, 0.88, true, 'visible_text');

  const edition = valueOf(u, 'editionOrVariant');
  if (edition) pushFact(facts, 'edition', edition, 0.84, true, 'visible_text');

  if (category === 'rugs') {
    const pattern = valueOf(rug, 'pattern');
    const country = valueOf(rug, 'origin', 'originStyle', 'country');
    if (pattern) pushFact(facts, 'pattern', pattern, 0.86, true, 'visible_feature');
    if (country) pushFact(facts, 'country', country, 0.75, supportedByVisible(country, pool), 'visible_feature');
  }

  if (category === 'porcelain_glass') {
    const pattern = valueOf(u, 'editionOrVariant') || valueOf(analysis.toyDetails, 'series');
    if (pattern) pushFact(facts, 'pattern', pattern, 0.82, true, 'visible_text');
  }

  if (analysis.condition) pushFact(facts, 'condition', text(analysis.condition), 0.85, true, 'visible_feature');

  return {
    category,
    objectType: text(analysis.objectType) || text(analysis.category) || 'Gegenstand',
    title: text(analysis.title) || null,
    family: valueOf(u, 'productFamily') || text(analysis.objectType) || null,
    subtype: subtypeOf(analysis, category),
    facts,
  };
}
