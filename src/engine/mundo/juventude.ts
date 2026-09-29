// [fase 4 · frente JUVENTUDE] Esqueleto do contrato — a frente de juventude implementa.
import type { Player } from '../../types';
import type { YouthIntakeLog } from './model';

export function defaultNewgens(_save?: Record<string, unknown>): Record<string, Player> { return {}; }
export function defaultIntake(_save?: Record<string, unknown>): YouthIntakeLog[] { return []; }
