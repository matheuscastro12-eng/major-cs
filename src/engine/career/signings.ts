export interface RegenPlayerId {
  teamId: string;
  slot: number;
  generation: number;
  debut: number;
  ageAtDebut: number;
}

export function parseRegenPlayerId(id: string): RegenPlayerId | null {
  const match = /^(.*)~rg(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(id);
  if (!match?.[1]) return null;
  return {
    teamId: match[1],
    slot: Number(match[2]),
    generation: Number(match[3]),
    debut: Number(match[4]),
    ageAtDebut: Number(match[5]),
  };
}

export interface AcademyPlayerId {
  teamId: string;
  index: number;
}

export function parseAcademyPlayerId(id: string): AcademyPlayerId | null {
  const match = /^(.*)__aca(\d+)$/.exec(id);
  if (!match?.[1]) return null;
  return { teamId: match[1], index: Number(match[2]) };
}

export function partitionResolvable<T>(items: T[], resolve: (item: T) => unknown): {
  resolved: T[];
  unresolved: T[];
} {
  const resolved: T[] = [];
  const unresolved: T[] = [];
  for (const item of items) (resolve(item) ? resolved : unresolved).push(item);
  return { resolved, unresolved };
}
