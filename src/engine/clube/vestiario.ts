// [fase 3 · frente VESTIÁRIO] Esqueleto do contrato — a frente de vestiário implementa.
import type { DressingRoomState } from './model';

export function defaultDressingRoom(_save?: Record<string, unknown>): DressingRoomState {
  return { v: 1, status: {}, lineup: null, playTime: {}, meetings: [], conflicts: [] };
}
