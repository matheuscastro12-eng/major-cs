// Forma recente por jogador (janela deslizante de ratings por série).
//
// O save guarda `recentRatings: Record<playerId, number[]>` — os ratings das
// últimas séries de cada jogador do elenco (cap 6, shift no overflow), gravados
// em recordCareerMatch junto com mapStats. A média da janela vira um status de
// forma em 5 tiers (Em chamas → Péssima fase), exibido no perfil do jogador e
// na gestão do elenco. Puro e determinístico: nada de Date.now/Math.random.

import type { SeriesResult, TPlayer } from '../../types';
import { computeDisplay, mergeLines } from '../match';
import { careerPlayerId } from './fatigue';

// tamanho da janela (Brasval usa 5-6; ficamos no teto: ~2 splits de séries)
export const RECENT_RATINGS_CAP = 6;
// amostra mínima pra declarar um tier — com 1 jogo a "forma" seria só ruído
export const FORM_MIN_SAMPLE = 2;

export type FormTier = 'fire' | 'good' | 'average' | 'bad' | 'awful' | 'none';

export interface FormStatus {
  tier: FormTier;
  label: string; // PT-BR, pronto pra UI
  color: string; // token CSS do projeto (var(--...)) — mesma paleta dos chips
  avg: number | null; // média da janela (null quando amostra insuficiente)
}

// rating da SÉRIE inteira de um jogador (agrega as linhas de todos os mapas
// jogados — mesma fórmula HLTV 2.0 do computeDisplay). null = não jogou.
export function seriesRatingFor(series: SeriesResult, playerId: string): number | null {
  const lines = series.maps
    .map((m) => m.stats[playerId]?.both)
    .filter((l): l is NonNullable<typeof l> => l != null);
  if (!lines.length) return null;
  // 2 casas: suficiente pra forma e mantém o save enxuto
  return Math.round(computeDisplay(mergeLines(lines)).rating * 100) / 100;
}

// empurra um rating na janela, derrubando o mais antigo no overflow (shift)
export function pushRecentRating(window: number[] | undefined, rating: number): number[] {
  const next = [...(window ?? []), rating];
  while (next.length > RECENT_RATINGS_CAP) next.shift();
  return next;
}

// grava o rating da série de CADA jogador do time do usuário na janela.
// Chaveado pelo id estável do save (sem prefixo user__), igual morale/fatigue.
export function recordSeriesRatings(
  prev: Record<string, number[]> | undefined,
  series: SeriesResult,
  players: TPlayer[],
): Record<string, number[]> {
  const out = { ...(prev ?? {}) };
  for (const p of players) {
    const rating = seriesRatingFor(series, p.id);
    if (rating == null) continue; // não entrou em nenhum mapa da série
    const id = careerPlayerId(p.id);
    out[id] = pushRecentRating(out[id], rating);
  }
  return out;
}

// deriva o status de forma da média da janela (5 tiers, padrão Brasval).
// Rating 1.00 = jogador na média; os cortes seguem a leitura HLTV usual.
export function formStatus(ratings: number[] | undefined): FormStatus {
  const window = (ratings ?? []).filter((r) => Number.isFinite(r));
  if (window.length < FORM_MIN_SAMPLE) {
    return { tier: 'none', label: 'Sem jogos recentes', color: 'var(--muted)', avg: null };
  }
  const avg = window.reduce((sum, r) => sum + r, 0) / window.length;
  if (avg >= 1.18) return { tier: 'fire', label: 'Em chamas', color: 'var(--gold-2)', avg };
  if (avg >= 1.04) return { tier: 'good', label: 'Boa fase', color: 'var(--green-bright)', avg };
  if (avg >= 0.9) return { tier: 'average', label: 'Fase média', color: 'var(--muted)', avg };
  if (avg >= 0.76) return { tier: 'bad', label: 'Fase ruim', color: 'var(--red)', avg };
  return { tier: 'awful', label: 'Péssima fase', color: 'var(--red-bright)', avg };
}
