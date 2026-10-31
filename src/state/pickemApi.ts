// Cliente do Pick'em do Major Singapore (api/pickem.ts). A trava e a pontuação
// valem no servidor; aqui só transporta.
import { getToken } from './account';
import type { PickemStageId, StagePick, StageResult } from '../engine/majorPickem';

export interface PickemStage { stage: PickemStageId; teams: string[]; locksAt: string | null; result: StageResult | null; resultSource: string | null }
export interface PickemState { serverNow: string; stages: PickemStage[] }
export interface PickemBoardRow { rank: number; nick: string; points: number; exact: number; champion: boolean; byStage: Partial<Record<PickemStageId, number>> }
export type PickemMine = Partial<Record<PickemStageId, { pick: StagePick; savedAt: string }>>;
export type PickemSave = { ok: true; savedAt: string } | { ok: false; error: string; locked?: boolean };

const T = 9000;
export const hasPickemAccount = (): boolean => !!getToken();

export async function fetchPickemState(): Promise<PickemState | null> {
  try {
    const r = await fetch('/api/pickem?action=state', { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const j = await r.json() as Partial<PickemState>;
    if ((j as { soon?: boolean }).soon) return { serverNow: String(j.serverNow ?? new Date().toISOString()), stages: [] };
    return Array.isArray(j.stages) ? { serverNow: String(j.serverNow ?? new Date().toISOString()), stages: j.stages } : null;
  } catch { return null; }
}

export async function fetchPickemBoard(fresh = false): Promise<{ total: number; soon: boolean; board: PickemBoardRow[] } | null> {
  try {
    const r = await fetch(`/api/pickem?action=board${fresh ? `&fresh=${Date.now()}` : ''}`, { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const j = await r.json() as { total?: number; soon?: boolean; board?: PickemBoardRow[] };
    return Array.isArray(j.board) ? { total: Number(j.total) || 0, soon: !!j.soon, board: j.board.slice(0, 50) } : null;
  } catch { return null; }
}

const post = async (body: Record<string, unknown>): Promise<Response | null> => {
  const token = getToken();
  if (!token) return null;
  try {
    return await fetch('/api/pickem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, token }), signal: AbortSignal.timeout(T) });
  } catch { return null; }
};

export async function fetchMyPicks(): Promise<PickemMine | null> {
  const r = await post({ action: 'me' });
  if (!r?.ok) return null;
  try { return ((await r.json()) as { picks?: PickemMine }).picks ?? {}; } catch { return null; }
}

export async function savePickemPick(stage: PickemStageId, pick: StagePick): Promise<PickemSave> {
  const r = await post({ action: 'save', stage, pick });
  if (!r) return { ok: false, error: 'Sem conexão ou sem conta.' };
  let j: { savedAt?: string; error?: string } = {};
  try { j = await r.json(); } catch { /* corpo vazio */ }
  if (r.ok && j.savedAt) return { ok: true, savedAt: j.savedAt };
  return { ok: false, error: j.error ?? 'Não deu pra salvar.', locked: r.status === 423 };
}

/** avisa o placar que um palpite foi salvo (ele recarrega sem o cache do CDN) */
export const PICKEM_SAVED_EVENT = 'rtm:pickem-saved';
