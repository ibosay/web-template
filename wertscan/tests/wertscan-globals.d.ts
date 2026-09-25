/**
 * NUR für Tests: Typdeklarationen der bestehenden WertScan-Helfer, die marketPricePipeline.ts
 * als vorhanden voraussetzt (normalize, ai, Analysis …). In WertScan selbst kommen sie aus dem
 * bestehenden Code; diese Datei wird dort nicht gebraucht.
 */
type Analysis = {
  category: string; objectType: string; brand: string; model: string; title: string; condition: string;
  confidence: number; categoryConfidence: number;
  cardDetails?: { franchise: string; cardName: string; cardNumber: string; setName: string; rarity: string; finish: string; gradingCompany: string; grade: string };
  universalDetails?: { manufacturer: string; modelName: string; modelNumber: string; skuOrPartNumber: string; barcodeOrEan: string; productFamily: string; generation: string; editionOrVariant: string; capacityOrStorage: string };
  casioDetails?: any; hotWheelsDetails?: any; modelCarDetails?: any;
};
type Valuation = { market: number; from: number; to: number; quick: number; privateSale: number; dealer: number; dataQuality: 'niedrig'|'mittel'|'hoch'; professionalReview: boolean; basis: string; matchConfidence: number };
declare function normalize(v: string): string;
declare function isUnknown(v: string): boolean;
declare function clamp01(v: number, f: number): number;
declare function median(v: number[]): number;
declare function quantile(v: number[], q: number): number;
declare function iqrFilter(v: number[]): number[];
declare function isValidGtin(v: string): boolean;
declare function isValidIsbn(v: string): boolean;
declare function digitsOnly(v: string): string;
declare function categorySignals(a: Analysis): string;
declare function isCasioWatch(a: Analysis): boolean;
declare function isHotWheelsAnalysis(a: Analysis): boolean;
declare function marketQuery(a: Analysis): string;
declare function cardmarketGamePath(a: Analysis): string;
declare function productAliasQueries(a: Analysis): string[];
declare const ai: { scrape(o: { url: string }): Promise<{ status: number; text: string }>; extract(o: any): Promise<{ data: unknown }> };
