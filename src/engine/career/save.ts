import { normalizeFacilities } from './facilities';
import type { CoachScar, ScarEvent } from './scars';
import { normalizeIdentity, type TeamIdentity } from './teamIdentity';

export interface CareerDepthState {
  rivalries: Record<string, number>;
  fatigue: Record<string, number>;
  restingPlayers: string[];
  facilities: Record<string, number>;
  // [W5] identidade tática emergente do time do usuário (histograma decaído das
  // chamadas). OPCIONAL: save antigo abre sem ela e o time "ainda não tem cara".
  identity?: TeamIdentity;
}

function numericRecord(value: unknown, max: number): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const number = Number(raw);
    if (Number.isFinite(number)) out[key] = Math.max(0, Math.min(max, Math.round(number)));
  }
  return out;
}

export function hydrateCareerDepth(value: Record<string, unknown> | undefined): CareerDepthState {
  return {
    rivalries: numericRecord(value?.rivalries, 12),
    fatigue: numericRecord(value?.fatigue, 100),
    restingPlayers: Array.isArray(value?.restingPlayers)
      ? value.restingPlayers.filter((id): id is string => typeof id === 'string').slice(0, 2)
      : [],
    facilities: normalizeFacilities(value?.facilities && typeof value.facilities === 'object' ? value.facilities as Record<string, number> : undefined),
    identity: normalizeIdentity(value?.identity), // [W5] ausente/lixo → undefined
  };
}

// [W4] leitores tolerantes dos campos opcionais de cicatrizes: save antigo (sem
// os campos) abre com lista vazia, sem migração.
export function hydrateScars(value: unknown): CoachScar[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is CoachScar => !!s && typeof s === 'object' && typeof (s as CoachScar).id === 'string' && typeof (s as CoachScar).since === 'number');
}
export function hydrateScarEvents(value: unknown): ScarEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter((e): e is ScarEvent => !!e && typeof e === 'object' && typeof (e as ScarEvent).split === 'number');
}
