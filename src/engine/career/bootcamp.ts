// BOOTCAMP DO TIME (#35 do gap Brasval) — o intensivo pago pré-evento. Puro.
//
// Uma alavanca coletiva e cara: queima caixa pra chegar inteiro no momento
// decisivo (+moral e -fadiga pro elenco todo). Uma vez por split — bootcamp
// não é rotina, é preparação de campanha.

export const BOOTCAMP_COST = 60_000;
export const BOOTCAMP_MORALE = 5;      // +moral pra todos (cap 100)
export const BOOTCAMP_FATIGUE = 30;    // fadiga aliviada de todos (piso 0)

export interface BootcampResult {
  morale: Record<string, number>;
  fatigue: Record<string, number>;
}

export function canBootcamp(budget: number, split: number, lastBootcampSplit: number | undefined): boolean {
  return budget >= BOOTCAMP_COST && lastBootcampSplit !== split;
}

// aplica o intensivo no elenco — imutável.
export function applyBootcamp(
  squadIds: string[],
  morale: Record<string, number> | undefined,
  fatigue: Record<string, number> | undefined,
  moraleDefault: number,
): BootcampResult {
  const m = { ...(morale ?? {}) };
  const f = { ...(fatigue ?? {}) };
  for (const id of squadIds) {
    m[id] = Math.min(100, (m[id] ?? moraleDefault) + BOOTCAMP_MORALE);
    f[id] = Math.max(0, (f[id] ?? 0) - BOOTCAMP_FATIGUE);
  }
  return { morale: m, fatigue: f };
}
