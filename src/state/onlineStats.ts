// Perfil do modo Online (Ranked 1v1 vs IA, Ranked Major, Gauntlet) — pontos,
// divisões e histórico da sessão. Espelha o padrão de rtpSaves.ts/ultimate.ts:
// localStorage sempre (grátis inclusive) + cloud sync last-write-wins no slot
// 'online' quando a conta é vitalícia, com backup `.bak` local.
//
// O QUE MORA AQUI vs NO SERVIDOR: o MMR da ranqueada REAL (salas via api/lobby,
// tela OnlineScreen) é AUTORITATIVO NO SERVIDOR (ladder rtm_ranking — myRank/
// ladder vêm de lá) e NÃO entra neste slot, senão viraria fonte dupla de
// verdade. Aqui persiste só o perfil CLIENTE sem casa no servidor: o MMR/W-L
// do 1v1 vs IA, pontos de Major e melhor sequência do Gauntlet.
//
// Ressalva multi-aparelho: last-write-wins por updatedAt — jogar offline num
// aparelho antigo e depois salvar num mais novo descarta os incrementos do
// antigo. É o modelo da casa (carreira/RtP/Ultimate); aceitável pro perfil.

import { cloudEnabled, cloudOnLocalSave, markSavedAt, syncSlot } from './cloud';
import { captureError } from './errlog';

export interface OnlineStats { mmr: number; w: number; l: number; majorPts: number; bestStreak: number; gamesMajor: number; }

// mesma chave do onlineData antigo — saves existentes continuam válidos.
const KEY = 'rtm-online-stats-v1';
const CLOUD_SLOT = 'online';

export const DEFAULT_STATS: OnlineStats = { mmr: 1000, w: 0, l: 0, majorPts: 0, bestStreak: 0, gamesMajor: 0 };

// merge sobre o default = "migração" barata: campo novo ganha valor default
// em save antigo sem registry de versões (o shape é raso e aditivo).
function migrateStats(raw: unknown): OnlineStats {
  return { ...DEFAULT_STATS, ...(raw as Partial<OnlineStats>) };
}

export function loadStats(): OnlineStats {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return { ...DEFAULT_STATS }; }
  if (!raw) return { ...DEFAULT_STATS };
  try {
    return migrateStats(JSON.parse(raw));
  } catch (e) {
    // principal ilegível: preserva pra diagnóstico e tenta o backup de um passo
    // (mesma política do rtpSaves/ultimate — MMR e pontos não podem evaporar).
    captureError(e, 'online-stats-load');
    try { localStorage.setItem(KEY + '.corrupt', raw); } catch { /* sem espaço pro diagnóstico */ }
    try {
      const bak = localStorage.getItem(KEY + '.bak');
      if (bak) return migrateStats(JSON.parse(bak));
    } catch { /* backup também ilegível */ }
    return { ...DEFAULT_STATS };
  }
}

export function saveStats(s: OnlineStats): void {
  const json = JSON.stringify(s);
  let prev: string | null = null;
  try { prev = localStorage.getItem(KEY); } catch { /* segue */ }
  try {
    localStorage.setItem(KEY, json);
  } catch (e) {
    /* storage cheio/indisponível — modo é opcional, não trava o app */
    captureError(e, 'online-stats-persist');
    return;
  }
  // backup de um passo: se o save novo ficar ilegível, dá pra voltar pro anterior
  if (prev && prev !== json) {
    try { localStorage.setItem(KEY + '.bak', prev); } catch { /* best-effort */ }
  }
  // timestamp local + push debounced pra nuvem (no-op se deslogado/grátis).
  markSavedAt(KEY);
  cloudOnLocalSave(CLOUD_SLOT, KEY, () => json);
}

// True quando o perfil local ainda é "virgem" (nunca jogou nada): é o estado
// default que um aparelho novo persiste antes de a conta carregar. Nesse caso
// o timestamp local não vale nada — a nuvem, se tiver perfil, vence.
function isPristine(s: OnlineStats): boolean {
  return s.w + s.l === 0 && s.gamesMajor === 0 && s.majorPts === 0 && s.bestStreak === 0 && s.mmr === DEFAULT_STATS.mmr;
}

// Reconcilia o perfil online com a nuvem no boot (após a conta carregar).
// 'restored'/'deleted' pedem que o consumidor recarregue via loadStats().
export async function syncOnlineStatsFromCloud(): Promise<'restored' | 'pushed' | 'none' | 'deleted'> {
  if (!cloudEnabled()) return 'none';
  // Perfil virgem persistido no boot NÃO pode vencer o perfil real da nuvem
  // por timestamp (zeraria MMR/pontos do jogador num aparelho novo).
  if (isPristine(loadStats())) markSavedAt(KEY, 0);
  return syncSlot(CLOUD_SLOT, KEY);
}
