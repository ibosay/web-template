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
  bookDetails?: Details | null;
  coinDetails?: Details | null;
  jewelryDetails?: Details | null;
  porcelainDetails?: Details | null;
  artDetails?: Details | null;
  toolDetails?: Details | null;
  applianceDetails?: Details | null;
  furnitureDetails?: Details | null;
  fashionDetails?: Details | null;
  instrumentDetails?: Details | null;
  sportsDetails?: Details | null;
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
  if (/mobel|möbel|stuhl|sessel|sofa|tisch|kommode|schrank|regal|lampe|leuchte|spiegel/.test(value)) return 'furniture_home';
  if (/fahrrad|ski|snowboard|tennisschlager|tennisschläger|golfschlager|golfschläger|fitnessgerat|fitnessgerät|camping|zelt|wanderrucksack|trekkingrucksack|rucksack outdoor|outdoor rucksack|sportgerat|sportgerät/.test(value)) return 'sports_outdoor';
  if (/tasche|handtasche|rucksack|schuh|sneaker|jacke|mantel|kleid|mode|kleidung|gurtel|gürtel|brille|sonnenbrille/.test(value)) return 'fashion_accessories';
  if (/gitarre|bass|klavier|keyboard|synthesizer|saxophon|trompete|violine|geige|musikinstrument|verstarker|verstärker/.test(value)) return 'music_instruments';
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
  const book = analysis.bookDetails;
  const coin = analysis.coinDetails;
  const jewelry = analysis.jewelryDetails;
  const porcelain = analysis.porcelainDetails;
  const art = analysis.artDetails;
  const tool = analysis.toolDetails;
  const appliance = analysis.applianceDetails;
  const furniture = analysis.furnitureDetails;
  const fashion = analysis.fashionDetails;
  const instrument = analysis.instrumentDetails;
  const sports = analysis.sportsDetails;

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
  if (modelNumber) pushFact(facts, 'modelNumber', modelNumber, 0.97, supportedByVisible(modelNumber, pool), 'visible_text');

  const sku = valueOf(u, 'skuOrPartNumber');
  if (sku) pushFact(facts, 'sku', sku, 0.96, supportedByVisible(sku, pool), 'visible_text');

  const barcode = valueOf(u, 'barcodeOrEan') || valueOf(book, 'ean', 'barcode');
  if (barcode) pushFact(facts, 'gtin', barcode, 0.98, supportedByVisible(barcode, pool), 'visible_text');

  const isbn = valueOf(book, 'isbn', 'isbn13', 'isbn10') || (/^(978|979)\d{10}$/.test(barcode.replace(/[^\d]/g, '')) ? barcode : '');
  if (isbn) pushFact(facts, 'isbn', isbn, 0.99, supportedByVisible(isbn, pool), 'visible_text');

  const serial = valueOf(u, 'serialOrProductionCode');
  if (serial) pushFact(facts, 'serial', serial, 0.95, supportedByVisible(serial, pool), 'visible_text');

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
    if (toyNumber) pushFact(facts, 'toyNumber', toyNumber, 0.97, supportedByVisible(toyNumber, pool), 'visible_text');
    if (baseCode) pushFact(facts, 'baseCode', baseCode, 0.96, supportedByVisible(baseCode, pool), 'visible_text');
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

  const material =
    text(analysis.material) ||
    valueOf(u, 'material') ||
    valueOf(rug, 'material') ||
    valueOf(jewelry, 'material', 'metal') ||
    valueOf(art, 'material') ||
    valueOf(porcelain, 'material') ||
    valueOf(furniture, 'material') ||
    valueOf(fashion, 'material') ||
    valueOf(instrument, 'material') ||
    valueOf(sports, 'material');
  if (material) pushFact(facts, 'material', material, 0.86, true, 'visible_feature');

  const shape =
    valueOf(u, 'shape', 'form', 'formFactor') ||
    valueOf(rug, 'shape') ||
    valueOf(porcelain, 'shape', 'form') ||
    valueOf(art, 'shape', 'form') ||
    valueOf(furniture, 'shape', 'form') ||
    valueOf(fashion, 'shape', 'form');
  if (shape) pushFact(facts, 'shape', shape, 0.86, true, 'visible_feature');

  const movement =
    valueOf(u, 'movement', 'movementOrCaliber', 'caliber') ||
    valueOf(analysis.casioDetails, 'movement', 'module');
  if (movement) pushFact(facts, 'movement', movement, 0.9, true, 'visible_text');

  const color =
    valueOf(u, 'primaryColor') ||
    valueOf(rug, 'colors') ||
    valueOf(mc, 'color') ||
    valueOf(furniture, 'color') ||
    valueOf(fashion, 'color') ||
    valueOf(instrument, 'color') ||
    valueOf(sports, 'color');
  if (color) pushFact(facts, 'color', color, 0.86, true, 'visible_feature');

  const size =
    valueOf(u, 'dimensionsOrSize') ||
    valueOf(rug, 'dimensions', 'size') ||
    valueOf(furniture, 'dimensions', 'size') ||
    valueOf(fashion, 'size') ||
    valueOf(instrument, 'size') ||
    valueOf(sports, 'size');
  if (size) pushFact(facts, 'size', size, 0.92, true, 'visible_feature');

  const marking =
    valueOf(u, 'visibleMarks') ||
    valueOf(rug, 'label', 'marking') ||
    valueOf(analysis.toyDetails, 'manufacturerMark') ||
    valueOf(porcelain, 'backstamp', 'marking', 'bottomMark') ||
    valueOf(coin, 'inscription', 'marking') ||
    valueOf(art, 'signature', 'marking') ||
    valueOf(furniture, 'label', 'marking') ||
    valueOf(fashion, 'label', 'marking', 'logo') ||
    valueOf(instrument, 'label', 'marking') ||
    valueOf(sports, 'label', 'marking');
  if (marking) pushFact(facts, 'marking', marking, 0.94, true, 'visible_text');

  const hallmark = valueOf(jewelry, 'hallmark', 'purityMark', 'punze') || valueOf(u, 'hallmark');
  if (hallmark) pushFact(facts, 'hallmark', hallmark, 0.98, true, 'visible_text');

  const year =
    valueOf(u, 'productionYear', 'releaseYear') ||
    valueOf(hw, 'releaseYear') ||
    valueOf(mc, 'year') ||
    valueOf(book, 'publicationYear', 'year') ||
    valueOf(coin, 'year') ||
    valueOf(art, 'year', 'date') ||
    valueOf(furniture, 'year', 'period') ||
    valueOf(instrument, 'year') ||
    valueOf(sports, 'year');
  if (year) pushFact(facts, 'year', year, 0.88, true, 'visible_text');

  const country =
    valueOf(u, 'countryOfOrigin') ||
    valueOf(rug, 'origin', 'originStyle', 'country') ||
    valueOf(coin, 'country') ||
    valueOf(porcelain, 'country');
  if (country) pushFact(facts, 'country', country, 0.82, supportedByVisible(country, pool), 'visible_feature');

  const edition =
    valueOf(u, 'editionOrVariant') ||
    valueOf(fashion, 'edition', 'collection') ||
    valueOf(sports, 'edition', 'series');
  if (edition) pushFact(facts, 'edition', edition, 0.84, true, 'visible_text');

  const style =
    valueOf(furniture, 'style', 'period') ||
    valueOf(fashion, 'style') ||
    valueOf(art, 'style', 'period');
  if (style) pushFact(facts, 'style', style, 0.82, true, 'visible_feature');

  if (category === 'rugs') {
    const pattern = valueOf(rug, 'pattern');
    if (pattern) pushFact(facts, 'pattern', pattern, 0.86, true, 'visible_feature');
  }

  if (category === 'porcelain_glass') {
    const pattern =
      valueOf(porcelain, 'pattern', 'decor', 'series') ||
      valueOf(u, 'editionOrVariant') ||
      valueOf(analysis.toyDetails, 'series');
    if (pattern) pushFact(facts, 'pattern', pattern, 0.82, true, 'visible_text');
  }

  if (category === 'books_media') {
    const name = valueOf(book, 'title') || text(analysis.title);
    const edition = valueOf(book, 'edition', 'format') || valueOf(u, 'editionOrVariant');
    const language = valueOf(book, 'language');
    if (name) pushFact(facts, 'name', name, 0.95, supportedByVisible(name, pool) || Boolean(isbn), 'visible_text');
    if (edition) pushFact(facts, 'edition', edition, 0.86, true, 'visible_text');
    if (language) pushFact(facts, 'language', language, 0.8, true, 'visible_text');
  }

  if (category === 'jewelry_coins') {
    const name = valueOf(coin, 'denomination', 'name') || valueOf(jewelry, 'name', 'type');
    if (name) pushFact(facts, 'name', name, 0.94, true, 'visible_text');
  }

  if (category === 'tools') {
    const toolModel = valueOf(tool, 'modelNumber', 'typeNumber');
    if (toolModel) pushFact(facts, 'modelNumber', toolModel, 0.98, supportedByVisible(toolModel, pool), 'visible_text');
  }

  if (category === 'household_appliances') {
    const applianceModel = valueOf(appliance, 'modelNumber', 'eNumber', 'productCode');
    if (applianceModel) pushFact(facts, 'modelNumber', applianceModel, 0.98, supportedByVisible(applianceModel, pool), 'visible_text');
  }


  if (category === 'furniture_home') {
    const maker = valueOf(furniture, 'manufacturer', 'maker', 'brand');
    const modelNumber = valueOf(furniture, 'modelNumber', 'itemNumber', 'productCode');
    const name = valueOf(furniture, 'name', 'type') || valueOf(u, 'productFamily');
    if (maker) pushFact(facts, 'manufacturer', maker, 0.94, supportedByVisible(maker, pool), 'visible_text');
    if (modelNumber) pushFact(facts, 'modelNumber', modelNumber, 0.97, supportedByVisible(modelNumber, pool), 'visible_text');
    if (name) pushFact(facts, 'name', name, 0.88, true, 'visible_feature');
  }

  if (category === 'fashion_accessories') {
    const name = valueOf(fashion, 'name', 'productType') || valueOf(u, 'productFamily');
    const styleCode = valueOf(fashion, 'styleCode', 'modelNumber', 'productCode');
    if (name) pushFact(facts, 'name', name, 0.9, true, 'visible_feature');
    if (styleCode) pushFact(facts, 'modelNumber', styleCode, 0.98, supportedByVisible(styleCode, pool), 'visible_text');
  }

  if (category === 'music_instruments') {
    const name = valueOf(instrument, 'name', 'instrumentType') || valueOf(u, 'productFamily');
    const model = valueOf(instrument, 'model');
    const modelNumber = valueOf(instrument, 'modelNumber', 'productCode');
    if (name) pushFact(facts, 'name', name, 0.9, true, 'visible_feature');
    if (model) pushFact(facts, 'model', model, 0.94, supportedByVisible(model, pool), 'visible_text');
    if (modelNumber) pushFact(facts, 'modelNumber', modelNumber, 0.98, supportedByVisible(modelNumber, pool), 'visible_text');
  }

  if (category === 'sports_outdoor') {
    const name = valueOf(sports, 'name', 'productType') || valueOf(u, 'productFamily');
    const model = valueOf(sports, 'model');
    const modelNumber = valueOf(sports, 'modelNumber', 'productCode');
    if (name) pushFact(facts, 'name', name, 0.9, true, 'visible_feature');
    if (model) pushFact(facts, 'model', model, 0.94, supportedByVisible(model, pool), 'visible_text');
    if (modelNumber) pushFact(facts, 'modelNumber', modelNumber, 0.98, supportedByVisible(modelNumber, pool), 'visible_text');
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
