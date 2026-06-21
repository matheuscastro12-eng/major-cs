import { normalizeFacilities } from './facilities';

export interface CareerDepthState {
  rivalries: Record<string, number>;
  fatigue: Record<string, number>;
  restingPlayers: string[];
  facilities: Record<string, number>;
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
  };
}
