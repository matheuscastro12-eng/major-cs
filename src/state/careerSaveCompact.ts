// [fase 4 · integração] SAVE ENXUTO: o que estourava a cota do localStorage.
//
// Cada mapa simulado carrega o `killFeed` inteiro (todas as baixas do mapa, com
// arma/headshot/abertura/trade) — ~19 KB por mapa, ~75% do peso de um
// MapResult. Na Carreira ele só é lido AO VIVO (MatchScreen: feed e narração;
// `bestSeriesMoment` roda na série recém-jogada, antes de gravar). O que as
// telas de depois leem fica: placar, lados, `roundLog` (round a round) e as
// `stats` por jogador (Scoreboard com filtro de lado, MVP, stats do torneio,
// Hall da Fama). Com a chave do Major (`majorHistory` acumula todos os stages)
// um save de Carreira com Major jogado passava de 5 MB.
//
// Idempotente, puro (não muta o save de entrada) e sem subir SAVE_VERSION:
// roda no caminho de gravação e ao abrir saves existentes.
import type { MapResult, SeriesResult } from '../types';

const isMapResult = (x: unknown): x is MapResult =>
  !!x && typeof x === 'object' && Array.isArray((x as MapResult).killFeed) && Array.isArray((x as MapResult).roundLog);

/** Mapa sem o feed de baixas (idempotente: devolve o MESMO objeto se já está enxuto). */
export function compactMap(m: MapResult): MapResult {
  return m.killFeed.length ? { ...m, killFeed: [] } : m;
}
export function compactSeries<T extends SeriesResult | undefined | null>(s: T): T {
  if (!s || !Array.isArray(s.maps) || !s.maps.some((m) => isMapResult(m) && m.killFeed.length)) return s;
  return { ...s, maps: s.maps.map((m) => (isMapResult(m) ? compactMap(m) : m)) } as T;
}

// percorre só as estruturas de torneio (liga, playoff, Major e histórico) e
// troca apenas o que mudou — o resto do save segue com as mesmas referências
function walk(node: unknown, depth: number): unknown {
  if (depth > 8 || !node || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    let changed = false;
    const out = node.map((x) => { const y = walk(x, depth + 1); if (y !== x) changed = true; return y; });
    return changed ? out : node;
  }
  const o = node as Record<string, unknown>;
  // SeriesResult: tem `maps` com MapResult
  if (Array.isArray(o.maps) && o.maps.some(isMapResult)) return compactSeries(o as unknown as SeriesResult);
  let out: Record<string, unknown> | null = null;
  for (const k of Object.keys(o)) {
    if (k === 'players' || k === 'teams' || k === 'stats') continue; // elenco/estatística: nada de feed aqui
    const v = o[k];
    if (!v || typeof v !== 'object') continue;
    const w = walk(v, depth + 1);
    if (w !== v) { out ??= { ...o }; out[k] = w; }
  }
  return out ?? o;
}

/** Campos da Carreira que guardam séries (e portanto mapas com feed). */
export const SERIES_FIELDS = ['league', 'playoff', 'majorT', 'majorHistory', 'majorResult', 'academyPlayoff'] as const;

export function compactCareerSave<T extends Record<string, unknown>>(save: T): T {
  let out: T | null = null;
  // Major encerrado: o histórico inteiro vive no resultado (majorResult.tournament);
  // majorT e majorHistory eram cópias (save antigo aberto na tela de resultado)
  const mr = save.majorResult as { tournament?: { history?: unknown[] } } | null | undefined;
  const mt = save.majorT as { history?: unknown[] } | null | undefined;
  if (mr?.tournament?.history?.length && ((mt?.history?.length ?? 0) > 0 || ((save.majorHistory as unknown[] | undefined)?.length ?? 0) > 0)) {
    out = { ...save, ...(mt ? { majorT: { ...mt, history: [] } } : {}), majorHistory: [] };
  }
  for (const k of SERIES_FIELDS) {
    const v = (out ?? save)[k];
    if (!v || typeof v !== 'object') continue;
    const w = walk(v, 0);
    if (w !== v) { out ??= { ...save }; (out as Record<string, unknown>)[k] = w; }
  }
  return out ?? save;
}
