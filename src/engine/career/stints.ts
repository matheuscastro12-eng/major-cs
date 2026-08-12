// PASSAGENS (#40 do gap Brasval) — a biografia do jogador NA SUA ORG. Puro.
//
// Versão enxuta e honesta do careerHistory do Brasval: registramos as
// passagens pelo SEU clube (entrada na janela/fundação, saída por venda,
// troca, fim de contrato ou aposentadoria), com OVR de chegada e de saída.
// Passagens por clubes de IA não são rastreadas (a IA não tem elenco
// persistido por split — inventar seria mentir pro jogador).

export interface CareerStint {
  team: string;          // nome da org na época
  from: number;          // split de chegada
  to: number | null;     // split de saída (null = passagem ATIVA)
  startOvr: number;      // OVR na chegada (0 = desconhecido/backfill)
  endOvr?: number;       // OVR na saída
}

export type StintsMap = Record<string, CareerStint[]>;

// abre uma passagem (no-op se já existe uma ativa — idempotente na janela).
export function openStint(stints: StintsMap | undefined, playerId: string, team: string, split: number, startOvr: number): StintsMap {
  const cur = stints ?? {};
  const arr = cur[playerId] ?? [];
  if (arr.length && arr[arr.length - 1].to == null) return cur;
  return { ...cur, [playerId]: [...arr, { team, from: split, to: null, startOvr }] };
}

// fecha a passagem ativa (no-op se não há ativa).
export function closeStint(stints: StintsMap | undefined, playerId: string, split: number, endOvr?: number): StintsMap {
  const cur = stints ?? {};
  const arr = cur[playerId] ?? [];
  const last = arr[arr.length - 1];
  if (!last || last.to != null) return cur;
  const closed: CareerStint = { ...last, to: Math.max(split, last.from), ...(endOvr != null ? { endOvr } : {}) };
  return { ...cur, [playerId]: [...arr.slice(0, -1), closed] };
}

export function stintsOf(stints: StintsMap | undefined, playerId: string): CareerStint[] {
  return stints?.[playerId] ?? [];
}
