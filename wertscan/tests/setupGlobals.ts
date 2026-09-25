/**
 * NUR für Tests: einfache Nachbildungen der bestehenden WertScan-Helfer, die
 * marketPricePipeline.ts als global vorhanden voraussetzt. Kein Produktivcode.
 */
const g = globalThis as unknown as Record<string, unknown>;

const quantile = (values: number[], q: number) => {
  const s = [...values].sort((a, b) => a - b);
  const p = (s.length - 1) * q;
  const b = Math.floor(p);
  return s[b + 1] !== undefined ? s[b] + (p - b) * (s[b + 1] - s[b]) : s[b];
};

g.normalize = (v: string) =>
  String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
g.isUnknown = (v: string) => !v || /^(unbekannt|unknown|-)$/i.test(String(v).trim());
g.clamp01 = (v: number, f: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : f);
g.quantile = quantile;
g.median = (values: number[]) => quantile(values, 0.5);
g.iqrFilter = (values: number[]) => {
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const i = q3 - q1;
  return values.filter(v => v >= q1 - 1.5 * i && v <= q3 + 1.5 * i);
};
g.isValidGtin = (v: string) => /^\d{8,14}$/.test(v);
g.isValidIsbn = () => false;
g.digitsOnly = (v: string) => v.replace(/\D/g, '');
g.categorySignals = () => '';
g.isCasioWatch = () => false;
g.isHotWheelsAnalysis = () => false;
g.marketQuery = (a: { brand: string; model: string; title: string }) => [a.brand, a.model, a.title].filter(Boolean).join(' ');
g.cardmarketGamePath = () => 'Pokemon';
g.productAliasQueries = () => [];

export type ScrapeHandler = (url: string) => Promise<{ status: number; text: string }>;
export type ExtractHandler = (options: { content: string; prompt: string }) => Promise<{ data: unknown }>;

export const aiCalls = { scrape: [] as string[], extract: 0 };

export function setAi(scrape: ScrapeHandler, extract: ExtractHandler) {
  aiCalls.scrape = [];
  aiCalls.extract = 0;
  g.ai = {
    scrape: async ({ url }: { url: string }) => {
      aiCalls.scrape.push(url);
      return scrape(url);
    },
    extract: async (options: { content: string; prompt: string }) => {
      aiCalls.extract++;
      return extract(options);
    },
  };
}
