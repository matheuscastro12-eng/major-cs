// Cliente HTTP educado para a API pública do bo3.gg (https://api.bo3.gg/api/v1).
//
// - Cache em disco: cada URL vira um arquivo JSON (nome = sha1 da URL) em
//   BO3_CACHE_DIR (padrão: <tmp>/bo3-cache). Com cache quente o pipeline roda
//   sem rede e dá o MESMO resultado (reprodutível).
// - Throttle: no máximo ~2 requisições por segundo (intervalo mínimo 520 ms).
// - Backoff exponencial em 429/5xx/erro de rede, respeitando Retry-After.
// - User-Agent identificado.
// - BO3_OFFLINE=1: só lê o cache (falha se faltar arquivo).
//
// Nada de HLTV: só a API pública do bo3.gg.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const API = 'https://api.bo3.gg/api/v1';
export const USER_AGENT =
  'RoadToMajor-DataPipeline/1.0 (jogo manager de CS; dados públicos com cache local, <=2 req/s; github.com/matheuscastro12-eng)';

const CACHE_DIR = process.env.BO3_CACHE_DIR ?? join(tmpdir(), 'bo3-cache');
const OFFLINE = process.env.BO3_OFFLINE === '1';
const MIN_INTERVAL_MS = Number(process.env.BO3_MIN_INTERVAL_MS) || 520;
const MAX_TRIES = 6;

let lastAt = 0;
let netCount = 0;
let hitCount = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cachePath(url: string): string {
  return join(CACHE_DIR, createHash('sha1').update(url).digest('hex') + '.json');
}

export function stats() {
  return { net: netCount, cache: hitCount, dir: CACHE_DIR };
}

// Monta a query no formato que o próprio front do bo3.gg usa:
// filter[prop][op]=v, filter[prop]=v, page[offset]/page[limit], sort=-campo.
export function url(path: string, q: Record<string, string | number | undefined> = {}): string {
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return `${API}${path}${parts.length ? '?' + parts.join('&') : ''}`;
}

// Quando a URL foi buscada de verdade na API (registro da data da coleta).
export function fetchedAt(u: string): string | null {
  const file = cachePath(u);
  if (!existsSync(file)) return null;
  return (JSON.parse(readFileSync(file, 'utf8')) as { at?: string }).at ?? null;
}

// GET com cache. 404 vira `null` (e também é cacheado).
export async function get<T = unknown>(u: string): Promise<T | null> {
  const file = cachePath(u);
  if (existsSync(file)) {
    hitCount++;
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { url: string; status: number; body: T | null };
    return raw.body;
  }
  if (OFFLINE) throw new Error(`BO3_OFFLINE=1 e sem cache para ${u}`);
  mkdirSync(CACHE_DIR, { recursive: true });
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const wait = lastAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    netCount++;
    let res: Response;
    try {
      res = await fetch(u, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    } catch (e) {
      const back = 1000 * 2 ** attempt;
      console.warn(`[bo3] rede falhou (${(e as Error).message}); tentando de novo em ${back} ms`);
      await sleep(back);
      continue;
    }
    if (res.status === 404) {
      writeFileSync(file, JSON.stringify({ url: u, status: 404, at: new Date().toISOString(), body: null }));
      return null;
    }
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'));
      const back = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500 * 2 ** attempt;
      console.warn(`[bo3] HTTP ${res.status} em ${u}; backoff ${back} ms`);
      await sleep(back);
      continue;
    }
    if (!res.ok) throw new Error(`[bo3] HTTP ${res.status} em ${u}`);
    const body = (await res.json()) as T;
    writeFileSync(file, JSON.stringify({ url: u, status: res.status, at: new Date().toISOString(), body }));
    return body;
  }
  throw new Error(`[bo3] desisti depois de ${MAX_TRIES} tentativas: ${u}`);
}

// Pagina uma listagem no formato { total, results } ou { results } até esvaziar.
export async function getAll<T>(path: string, q: Record<string, string | number | undefined>, limit = 100, maxPages = 400): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const body = await get<{ results: T[]; total?: { count: number } }>(url(path, { ...q, 'page[offset]': page * limit, 'page[limit]': limit }));
    const rows = body?.results ?? [];
    out.push(...rows);
    if (rows.length < limit) break;
    if (body?.total && out.length >= body.total.count) break;
  }
  return out;
}
