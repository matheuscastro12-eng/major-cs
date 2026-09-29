// [fase 4 · frente CIRCUITO] Mundo em segundo plano: os eventos que você NÃO
// joga são simulados por um MODELO DE FORÇA CALIBRADO contra o motor de partida
// (não pelo motor inteiro — o avanço de semana tem que ser instantâneo).
//
// Calibração (scripts/test-circuito-mundo.mts): vitória de MAPA entre times reais
// da base × diferença de força (TTeam.strength) no motor v2 ≈ logística com
// k = 0,15 por ponto de força (medido: Δ0 50%, Δ+4 64%, Δ+8 78%, Δ+12 86%). A
// série sai mapa a mapa desse p; cada time ainda tem uma forma do EVENTO (±σ),
// que dá as campanhas de azarão e os tropeços da elite.
//
// Formatos (os mesmos da Carreira): GSL de 16 (4 grupos, dupla eliminação,
// abertura MD1) → playoffs de 8 (MD3, final MD5); suíço de 16 (3 vitórias
// classificam, 3 derrotas eliminam; MD1 até a 2ª rodada, MD3 depois); playoffs
// do Major (8, MD3, final MD5).

import { makeRng, type Rng } from '../rng';
import { hashStr } from '../../state/hash';
import {
  RMR_REGIONS, RMR_SLOTS, type RmrRegion,
} from './circuito';

export const QUICK_MAP_K = 0.15;
export const EVENT_FORM_SIGMA = 1.0;

export const pMapWin = (dStrength: number): number => 1 / (1 + Math.exp(-QUICK_MAP_K * dStrength));
/** Probabilidade de vencer uma série MD `bo` com p de mapa (fechada, sem simular). */
export function pSeriesWin(dStrength: number, bo: 1 | 3 | 5): number {
  const p = pMapWin(dStrength);
  if (bo === 1) return p;
  if (bo === 3) return p * p * (3 - 2 * p);
  const q = 1 - p; // MD5: vence 3 antes de perder 3
  return p ** 3 * (1 + 3 * q + 6 * q * q);
}

function gauss(rng: Rng): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export const seedRng = (key: string): Rng => makeRng(hashStr(key) || 1);

export interface QTeam { id: string; s: number }
export interface QSeries { a: string; b: string; winner: string; score: [number, number]; bo: 1 | 3 | 5 }

/** Uma série pelo modelo calibrado (mapa a mapa). */
export function quickSeries(rng: Rng, a: QTeam, b: QTeam, bo: 1 | 3 | 5): QSeries {
  const need = Math.ceil(bo / 2);
  const p = pMapWin(a.s - b.s);
  let wa = 0, wb = 0;
  while (wa < need && wb < need) { if (rng() < p) wa++; else wb++; }
  return { a: a.id, b: b.id, winner: wa > wb ? a.id : b.id, score: [wa, wb], bo };
}

/** Forma do evento: cada time chega num dia bom ou ruim (±σ na força). */
export function withEventForm(rng: Rng, teams: QTeam[], sigma = EVENT_FORM_SIGMA): QTeam[] {
  return teams.map((t) => ({ id: t.id, s: t.s + gauss(rng) * sigma }));
}

export interface QPlacement { teamId: string; place: number }
export interface QEventResult { placements: QPlacement[]; series: QSeries[] }

/** Playoffs de 8 (seeds em ordem 1..8): 1×8, 4×5 | 2×7, 3×6; MD3, final MD5. */
export function quickPlayoffs8(rng: Rng, seeds: QTeam[], pairing: [number, number][] = [[0, 7], [3, 4], [1, 6], [2, 5]]): QEventResult {
  const series: QSeries[] = [];
  const play = (a: QTeam, b: QTeam, bo: 1 | 3 | 5) => { const s = quickSeries(rng, a, b, bo); series.push(s); return s.winner === a.id ? [a, b] : [b, a]; };
  const qf = pairing.map(([i, j]) => play(seeds[i], seeds[j], 3));
  const sf = [play(qf[0][0], qf[1][0], 3), play(qf[2][0], qf[3][0], 3)];
  const fin = play(sf[0][0], sf[1][0], 5);
  const placements: QPlacement[] = [
    { teamId: fin[0].id, place: 1 }, { teamId: fin[1].id, place: 2 },
    { teamId: sf[0][1].id, place: 3 }, { teamId: sf[1][1].id, place: 3 },
    ...qf.map((m) => ({ teamId: m[1].id, place: 5 })),
  ];
  return { placements, series };
}

/**
 * GSL de 16 → playoffs de 8 (o formato do circuito da Carreira). Grupos por
 * semeadura em serpentina (o mais forte em cada grupo). Colocações: 1, 2, 3-4,
 * 5-8 (quartas), 9-12 (3º do grupo), 13-16 (4º do grupo).
 */
export function quickGslEvent(rng: Rng, teams0: QTeam[]): QEventResult {
  const teams = [...teams0].sort((a, b) => b.s - a.s);
  // grupos de ATÉ 4 (ceil): com floor, 15 times viravam 3 grupos de 5 e o 5º de
  // cada grupo (e 2 segundos colocados) saíam do evento sem colocação — todo
  // evento em segundo plano tem 15 (a 16ª vaga é a do usuário)
  const nGroups = Math.max(2, Math.ceil(teams.length / 4));
  const groups: QTeam[][] = Array.from({ length: nGroups }, () => []);
  teams.forEach((t, i) => {
    const row = Math.floor(i / nGroups);
    const col = row % 2 === 0 ? i % nGroups : nGroups - 1 - (i % nGroups);
    groups[col].push(t);
  });
  const series: QSeries[] = [];
  const play = (a: QTeam, b: QTeam, bo: 1 | 3 | 5) => { const s = quickSeries(rng, a, b, bo); series.push(s); return s.winner === a.id ? [a, b] : [b, a]; };
  const firsts: QTeam[] = [], seconds: QTeam[] = [];
  const placements: QPlacement[] = [];
  for (const g of groups) {
    if (g.length < 4) { // grupo incompleto (field curto): passa quem tem
      g.forEach((t, i) => (i === 0 ? firsts : i === 1 ? seconds : null)?.push(t));
      g.slice(2).forEach((t) => placements.push({ teamId: t.id, place: 9 }));
      continue;
    }
    const o1 = play(g[0], g[3], 1);
    const o2 = play(g[1], g[2], 1);
    const win = play(o1[0], o2[0], 3);
    const elim = play(o1[1], o2[1], 3);
    const dec = play(win[1], elim[0], 3);
    firsts.push(win[0]);
    seconds.push(dec[0]);
    placements.push({ teamId: dec[1].id, place: 9 }, { teamId: elim[1].id, place: 13 });
  }
  // cross-seed da Carreira: 1A×2B, 1C×2D | 1B×2A, 1D×2C
  const s = [...firsts, ...seconds];
  if (s.length >= 8) {
    const po = quickPlayoffs8(rng, s.slice(0, 8), [[0, 5], [2, 7], [1, 4], [3, 6]]);
    // mais de 4 grupos (field > 16): classificado sem vaga nos playoffs fecha em 9º
    const extra = s.slice(8).map((t) => ({ teamId: t.id, place: 9 }));
    return { placements: [...po.placements, ...extra, ...placements], series: [...series, ...po.series] };
  }
  // menos de 8 classificados (field curto): semis diretas entre os 4 primeiros;
  // quem se classificou além deles fecha em 5º (ninguém sai sem colocação)
  const sf = [play(s[0], s[3] ?? s[1], 3), play(s[1], s[2] ?? s[0], 3)];
  const fin = play(sf[0][0], sf[1][0], 5);
  const top = [{ teamId: fin[0].id, place: 1 }, { teamId: fin[1].id, place: 2 }, { teamId: sf[0][1].id, place: 3 }, { teamId: sf[1][1].id, place: 3 }];
  const inTop = new Set(top.map((p) => p.teamId));
  return {
    placements: [...top, ...s.slice(4).filter((t) => !inTop.has(t.id)).map((t) => ({ teamId: t.id, place: 5 })), ...placements],
    series,
  };
}

/**
 * Suíço de 16 (stage do Major / RMR): 3 vitórias classificam, 3 derrotas
 * eliminam; MD1 nas duas primeiras rodadas, MD3 depois. Devolve a ORDEM final
 * (classificados por menos derrotas, depois eliminados por mais vitórias).
 */
export function quickSwiss(rng: Rng, teams0: QTeam[]): { order: string[]; record: Record<string, [number, number]>; series: QSeries[] } {
  const teams = [...teams0].sort((a, b) => b.s - a.s);
  const seed = new Map(teams.map((t, i) => [t.id, i]));
  const rec = new Map<string, [number, number]>(teams.map((t) => [t.id, [0, 0]]));
  const met = new Set<string>();
  const series: QSeries[] = [];
  const byId = new Map(teams.map((t) => [t.id, t]));
  for (let round = 1; round <= 5; round++) {
    const alive = teams.filter((t) => rec.get(t.id)![0] < 3 && rec.get(t.id)![1] < 3);
    if (alive.length < 2) break;
    const buckets = new Map<string, QTeam[]>();
    for (const t of alive) { const [w, l] = rec.get(t.id)!; const k = `${w}-${l}`; buckets.set(k, [...(buckets.get(k) ?? []), t]); }
    const bo: 1 | 3 = round <= 2 ? 1 : 3;
    for (const [, b0] of [...buckets.entries()].sort()) {
      const b = [...b0].sort((x, y) => seed.get(x.id)! - seed.get(y.id)!);
      while (b.length >= 2) {
        const a = b.shift()!;
        // o mais baixo do balde que ainda não enfrentou
        let j = b.length - 1;
        while (j > 0 && met.has(`${a.id}|${b[j].id}`)) j--;
        const o = b.splice(j, 1)[0];
        met.add(`${a.id}|${o.id}`); met.add(`${o.id}|${a.id}`);
        const s = quickSeries(rng, byId.get(a.id)!, byId.get(o.id)!, bo);
        series.push(s);
        const w = s.winner, l = w === a.id ? o.id : a.id;
        rec.get(w)![0]++; rec.get(l)![1]++;
      }
      // sobrou um no balde: folga (conta vitória, como o bye)
      if (b.length === 1) rec.get(b[0].id)![0]++;
    }
  }
  const order = teams.map((t) => t.id).sort((a, b) => {
    const [wa, la] = rec.get(a)!, [wb, lb] = rec.get(b)!;
    const qa = wa >= 3 ? 1 : 0, qb = wb >= 3 ? 1 : 0;
    if (qa !== qb) return qb - qa;
    if (qa) return la - lb || seed.get(a)! - seed.get(b)!;
    return wb - wa || seed.get(a)! - seed.get(b)!;
  });
  return { order, record: Object.fromEntries(rec), series };
}

// ─── Major completo (RMRs → Stage 1 → 2 → 3 → playoffs) ─────────────────────
/**
 * O que já se sabe do Major (o que o usuário jogou de verdade entra aqui); o
 * resto é completado pelo modelo. Todas as ordens são teamIds.
 */
export interface MajorProgress {
  s3: string[];                 // VRS 1–8 (entram no Stage 3)
  s2: string[];                 // VRS 9–16 (Stage 2)
  s1Invites: string[];          // VRS 17–24 (Stage 1 direto)
  rmr: Partial<Record<RmrRegion, { field: string[]; order?: string[] }>>;
  stages?: Partial<Record<1 | 2 | 3, { field?: string[]; order: string[] }>>; // ordem final de cada stage jogado
  playoffs?: { seeds: string[]; places: Record<string, number> };                  // Champions Stage jogado
}
export interface MajorWorld {
  rmr: Partial<Record<RmrRegion, QPlacement[]>>;
  rmrQualified: Partial<Record<RmrRegion, string[]>>;
  major: QPlacement[];          // 32: 1, 2, 3-4, 5-8, 9-16 (Stage 3), 17-24 (Stage 2), 25-32 (Stage 1)
  stageFields: Record<1 | 2 | 3, string[]>;
  champion: string | null;
}

/** Colocações de um suíço de 16 (ordem → place): classificados 1..8 em ordem, eliminados 9..16. */
export function swissPlacements(order: string[]): QPlacement[] {
  return order.map((id, i) => ({ teamId: id, place: i + 1 }));
}

export function completeMajor(p: MajorProgress, strengthOf: (id: string) => number, seedKey: string): MajorWorld {
  const rng = seedRng(`major:${seedKey}`);
  const q = (ids: string[]) => withEventForm(rng, ids.map((id) => ({ id, s: strengthOf(id) })));
  const rmr: MajorWorld['rmr'] = {};
  const rmrQualified: MajorWorld['rmrQualified'] = {};
  for (const reg of RMR_REGIONS) {
    const r = p.rmr[reg];
    if (!r || r.field.length < 2) continue;
    const order = r.order ?? quickSwiss(rng, q(r.field)).order;
    rmr[reg] = swissPlacements(order);
    rmrQualified[reg] = order.slice(0, RMR_SLOTS[reg]);
  }
  const rmrQ = RMR_REGIONS.flatMap((reg) => rmrQualified[reg] ?? []);
  const stageFields = {} as Record<1 | 2 | 3, string[]>;
  const out: QPlacement[] = [];
  const runStage = (k: 1 | 2 | 3, field: string[]): string[] => {
    stageFields[k] = field;
    const known = p.stages?.[k];
    const order = known?.order ?? quickSwiss(rng, q(field)).order;
    const elimPlace = k === 3 ? 9 : k === 2 ? 17 : 25;
    for (const id of order.slice(8)) out.push({ teamId: id, place: elimPlace });
    return order.slice(0, 8);
  };
  const f1 = p.stages?.[1]?.field ?? [...p.s1Invites, ...rmrQ].slice(0, 16);
  const a1 = f1.length >= 9 ? runStage(1, f1) : f1.slice(0, 8);
  const f2 = p.stages?.[2]?.field ?? [...a1, ...p.s2];
  const a2 = runStage(2, f2);
  const f3 = p.stages?.[3]?.field ?? [...a2, ...p.s3];
  const a3 = runStage(3, f3);
  let champion: string | null = null;
  if (p.playoffs) {
    for (const id of p.playoffs.seeds) {
      const pl = p.playoffs.places[id] ?? 5;
      out.push({ teamId: id, place: pl });
      if (pl === 1) champion = id;
    }
  } else {
    const po = quickPlayoffs8(rng, q(a3));
    out.push(...po.placements);
    champion = po.placements.find((x) => x.place === 1)?.teamId ?? null;
  }
  out.sort((a, b) => a.place - b.place);
  return { rmr, rmrQualified, major: out, stageFields, champion };
}
