import type { TTeam } from '../../types';
import { hashStr } from '../../state/hash';

export type FacilityKey = 'training' | 'analyst' | 'psychologist';
export type Facilities = Record<FacilityKey, number>;

export const FACILITY_MAX_LEVEL = 3;
export const EMPTY_FACILITIES: Facilities = { training: 0, analyst: 0, psychologist: 0 };

const BASE_COST: Record<FacilityKey, number> = { training: 360_000, analyst: 300_000, psychologist: 260_000 };
const UPKEEP: Record<FacilityKey, number> = { training: 75_000, analyst: 62_000, psychologist: 52_000 };

export function normalizeFacilities(value: Record<string, number> | undefined): Facilities {
  return {
    training: Math.max(0, Math.min(FACILITY_MAX_LEVEL, Math.floor(value?.training ?? 0))),
    analyst: Math.max(0, Math.min(FACILITY_MAX_LEVEL, Math.floor(value?.analyst ?? 0))),
    psychologist: Math.max(0, Math.min(FACILITY_MAX_LEVEL, Math.floor(value?.psychologist ?? 0))),
  };
}

export function facilityUpgradeCost(key: FacilityKey, currentLevel: number): number {
  return currentLevel >= FACILITY_MAX_LEVEL ? 0 : BASE_COST[key] * (currentLevel + 1);
}

export function facilityUpkeep(value: Record<string, number> | undefined): number {
  const levels = normalizeFacilities(value);
  return (Object.keys(levels) as FacilityKey[]).reduce((total, key) => total + levels[key] * UPKEEP[key], 0);
}

export function developmentBonus(playerId: string, split: number, trainingLevel: number): number {
  if (trainingLevel <= 0) return 0;
  return hashStr(`facility:training:${playerId}:${split}`) % FACILITY_MAX_LEVEL < trainingLevel ? 1 : 0;
}

export function applyAnalystPrep(team: TTeam, analystLevel: number): TTeam {
  if (!team.isUser || analystLevel <= 0) return team;
  const strongest = Object.entries(team.mapPrefs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([map]) => map);
  const mapPrefs = { ...team.mapPrefs };
  for (const map of strongest) mapPrefs[map] = (mapPrefs[map] ?? 0) + analystLevel * 0.45;
  return { ...team, mapPrefs };
}

export function stabilizeMorale(morale: Record<string, number>, psychologistLevel: number): Record<string, number> {
  if (psychologistLevel <= 0) return morale;
  return Object.fromEntries(Object.entries(morale).map(([id, value]) => {
    const correction = (70 - value) * psychologistLevel * 0.08;
    return [id, Math.max(0, Math.min(100, Math.round(value + correction)))];
  }));
}
