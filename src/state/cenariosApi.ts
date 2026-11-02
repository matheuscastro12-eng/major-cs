// Cliente do Desafio da Semana (api/cenarios.ts). O servidor recalcula a
// pontuação a partir do log do run; aqui só transporta.
import { getToken } from './account';
import type { CenarioRun } from '../engine/cenarios';

export interface CenBoardRow { rank: number; nick: string; score: number; grade: string; mods: string[] }
export interface CenBoard { weekId: string; total: number; board: CenBoardRow[] }
export interface CenMe { best: number | null; grade: string | null; rank: number | null; attempts: number }
export type CenSubmit = { ok: true; score: number; grade: string; best: number; improved: boolean; rank: number } | { ok: false; error: string };

const post = async (body: Record<string, unknown>): Promise<Response | null> => {
  const token = getToken();
  if (!token) return null;
  try {
    return await fetch('/api/cenarios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, token }), signal: AbortSignal.timeout(9000) });
  } catch { return null; }
};

export const hasAccount = (): boolean => !!getToken();

export async function fetchCenBoard(weekId: string): Promise<CenBoard | null> {
  try {
    const r = await fetch(`/api/cenarios?action=board&week=${encodeURIComponent(weekId)}`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    const j = await r.json() as Partial<CenBoard>;
    if (!Array.isArray(j.board)) return null;
    return { weekId: String(j.weekId ?? weekId), total: Number(j.total) || 0, board: j.board.slice(0, 50) };
  } catch { return null; }
}

export async function fetchCenMe(weekId: string): Promise<CenMe | null> {
  const r = await post({ action: 'me', week: weekId });
  if (!r?.ok) return null;
  try { return await r.json() as CenMe; } catch { return null; }
}

/** Marca a largada no servidor (tempo mínimo real). Falha silenciosa: o envio depois responde 'not_started'. */
export async function postCenStart(weekId: string): Promise<boolean> {
  const r = await post({ action: 'start', week: weekId });
  return !!r?.ok;
}

export async function postCenSubmit(weekId: string, run: CenarioRun): Promise<CenSubmit> {
  const r = await post({ action: 'submit', week: weekId, run });
  if (!r) return { ok: false, error: getToken() ? 'network' : 'no_account' };
  try { return await r.json() as CenSubmit; } catch { return { ok: false, error: 'network' }; }
}
