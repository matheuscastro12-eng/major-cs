// Divisões da Ranqueada (Ultimate) — camada estrutural sobre o RP (elo). Dá
// profundidade: tiers com sub-divisões, barra de progresso dentro da divisão,
// promoção/rebaixamento ao cruzar as faixas. Puro. STARTING_ELO=1000 = Bronze III.

export type DivTier = 'bronze' | 'prata' | 'ouro' | 'platina' | 'diamante' | 'elite';

export interface DivisionDef {
  idx: number;
  name: string;
  tier: DivTier;
  min: number;
  max: number; // Infinity na última
  // Origem da BARRA de progresso, quando difere de `min`. Bronze III começa em
  // min:0 só como PISO de pertencimento (elo baixo nunca cai fora de todas as
  // faixas → não escorrega pro fallback Elite em divisionFor). Mas o novato nasce
  // em STARTING_ELO=1000, e medir 1000/1050 daria uma barra 95% cheia na estreia
  // (cada vitória = +12 RP = ~1% da faixa de 1050). `floor` mede a barra a partir
  // de onde o jogador de fato começa, alinhando a largura visível às irmãs (~50).
  floor?: number;
}

const RAW: Omit<DivisionDef, 'idx'>[] = [
  { name: 'Bronze III', tier: 'bronze', min: 0, max: 1049, floor: 1000 },
  { name: 'Bronze II', tier: 'bronze', min: 1050, max: 1099 },
  { name: 'Bronze I', tier: 'bronze', min: 1100, max: 1149 },
  { name: 'Prata III', tier: 'prata', min: 1150, max: 1224 },
  { name: 'Prata II', tier: 'prata', min: 1225, max: 1299 },
  { name: 'Prata I', tier: 'prata', min: 1300, max: 1374 },
  { name: 'Ouro III', tier: 'ouro', min: 1375, max: 1449 },
  { name: 'Ouro II', tier: 'ouro', min: 1450, max: 1524 },
  { name: 'Ouro I', tier: 'ouro', min: 1525, max: 1599 },
  { name: 'Platina', tier: 'platina', min: 1600, max: 1749 },
  { name: 'Diamante', tier: 'diamante', min: 1750, max: 1949 },
  { name: 'Elite', tier: 'elite', min: 1950, max: Infinity },
];

export const DIVISIONS: DivisionDef[] = RAW.map((d, idx) => ({ idx, ...d }));

export const DIV_TIER_COLOR: Record<DivTier, string> = {
  bronze: '#cd7f32',
  prata: '#aab4bf',
  ouro: '#e6b84c',
  platina: '#59c3e0',
  diamante: '#b892ff',
  elite: '#ecc75f',
};

// tiers únicos na ordem (p/ a escada visual)
export const DIV_TIERS: DivTier[] = ['bronze', 'prata', 'ouro', 'platina', 'diamante', 'elite'];

export const DIV_TIER_LABEL: Record<DivTier, string> = {
  bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', platina: 'Platina', diamante: 'Diamante', elite: 'Elite',
};

// multiplicador de credits por tier — vencer na Elite paga mais que no Bronze
// (senão subir de divisão é só cosmético). Consumido por computeMatchOutcome.
export const DIV_TIER_MULT: Record<DivTier, number> = {
  bronze: 1.0, prata: 1.15, ouro: 1.3, platina: 1.45, diamante: 1.65, elite: 1.8,
};

export interface DivisionInfo {
  def: DivisionDef;
  idx: number;
  color: string;
  progress: number;              // 0..100 dentro da divisão atual
  next: DivisionDef | null;      // próxima divisão (null se Elite)
  toNext: number;                // RP faltando pra próxima (0 se Elite)
}

export function divisionFor(elo: number): DivisionInfo {
  const e = Math.max(0, Math.round(elo));
  let idx = DIVISIONS.findIndex((d) => e >= d.min && e <= d.max);
  if (idx < 0) idx = DIVISIONS.length - 1;
  const def = DIVISIONS[idx];
  const next = DIVISIONS[idx + 1] ?? null;
  // barra medida a partir de `floor` (origem de exibição) — ver DivisionDef.floor.
  const base = def.floor ?? def.min;
  const span = def.max === Infinity ? 1 : def.max - base + 1;
  const progress = def.max === Infinity ? 100 : Math.min(100, Math.max(0, Math.round(((e - base) / span) * 100)));
  const toNext = next ? Math.max(0, next.min - e) : 0;
  return { def, idx, color: DIV_TIER_COLOR[def.tier], progress, next, toNext };
}

// resultado de uma partida em termos de divisão (p/ feedback de promoção/queda).
export type DivisionChange = 'promoted' | 'relegated' | 'same';
export function divisionChange(eloBefore: number, eloAfter: number): DivisionChange {
  const a = divisionFor(eloBefore).idx;
  const b = divisionFor(eloAfter).idx;
  return b > a ? 'promoted' : b < a ? 'relegated' : 'same';
}
