import { router, json, error } from '@appdeploy/sdk';

const source = 'https://servano-wien-v17-vorschau.ibosay.chatgpt.site';
const allowed = new Set(['query', 'category', 'district', 'open', 'apprentices', 'sort', 'offset', 'limit', 'favorites']);

async function upstream(path: string, query?: Record<string, string>) {
  const url = new URL(path, source);
  for (const [key, value] of Object.entries(query || {})) {
    if (allowed.has(key)) url.searchParams.set(key, value.slice(0, key === 'favorites' ? 1500 : 120));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) return error('Die Servano Vorschau ist gerade nicht erreichbar.', 502);
    const data = await response.json();
    return json(data);
  } catch {
    return error('Die Servano Vorschau ist gerade nicht erreichbar.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

export const handler = router({
  'GET /api/directory': [async ({ query }) => upstream('/api/directory', query)],
  'GET /api/business-detail': [async ({ query }) => {
    const id = query.id || '';
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return error('Ungültiger Betrieb.', 400);
    return upstream(`/api/business-detail?id=${encodeURIComponent(id)}`);
  }],
});
