// [fase 4 · frente CIRCUITO] VRS real (Valve Regional Standings), unificado.
//
// UM ranking só, a mesma fórmula pra IA e pro usuário, a partir dos resultados
// do mundo (mundo.results — os eventos que você joga E os que rodam em segundo
// plano). Três fatores, cada um normalizado pelo 5º melhor do mundo (como o
// Valve faz), sobre os 10 melhores resultados da janela:
//
//   PREMIAÇÃO (bounty collected) — dinheiro REAL ganho (prize pool × fatia da
//     colocação). Ganhar o Major vale mais que ganhar um tier 3.
//   REDE DE ADVERSÁRIOS (opponent network) — soma do "valor" (fator premiação)
//     dos times que você deixou pra trás no evento. Bater a elite vale muito;
//     atropelar o acesso, quase nada.
//   LAN — fração do field superada em eventos LAN.
//
// Decaimento pela IDADE do resultado (em etapas ≈ meses): peso cheio até 1
// etapa, depois cai em linha reta até zerar em VRS_WINDOW (6 etapas = 2 splits).
// Ficar parado te derruba: os outros somam e o seu resultado envelhece.
//
// Normalização: cada fator bruto dividido pelo do líder do mundo; premiação e
// rede passam por raiz quadrada (o bounty é de cauda pesada — um Major vale
// 500 mil — e sem a raiz o ranking virava "quem ganhou o Major e o resto").
// Pontos = PTS_SCALE × nota. A escala e a curva foram calibradas pra
// distribuição por posição ficar na régua de antes (patrocínios e prestígio
// leem os mesmos números; ver scripts/measure-circuito.mts).

import type { VrsEntry, WorldEventResult } from './model';

export const VRS_WINDOW = 6;       // etapas até o resultado zerar
export const VRS_FULL = 1;         // até esta idade o resultado pesa inteiro
export const VRS_TOP_N = 10;       // melhores resultados que contam por fator
export const VRS_REF_RANK = 1;     // normalização: o líder do mundo = 1.0
export const VRS_WEIGHTS = { prize: 0.45, network: 0.35, lan: 0.2 } as const;
export const PTS_SCALE = 2150;

export function ageWeight(age: number): number {
  if (age <= VRS_FULL) return 1;
  return Math.max(0, 1 - (age - VRS_FULL) / (VRS_WINDOW - VRS_FULL));
}

/** Fatia do prize pool por colocação (mesma tabela do calendário). */
export function shareOf(place: number, field: number): number {
  if (field >= 32) {
    if (place <= 1) return 0.4;
    if (place === 2) return 0.18;
    if (place <= 4) return 0.08;
    if (place <= 8) return 0.035;
    if (place <= 16) return 0.012;
    if (place <= 24) return 0.006;
    return 0.004;
  }
  if (place <= 1) return 0.4;
  if (place === 2) return 0.18;
  if (place <= 4) return 0.09;
  if (place <= 8) return 0.035;
  if (place <= 12) return 0.012;
  return 0.006;
}

/** Uma linha do VRS: um resultado de um time, já com peso e fatores brutos. */
export interface VrsRow {
  eventId: string;
  name: string;
  split: number;
  t: number;
  place: number;
  field: number;
  lan: boolean;
  weight: number;       // decaimento pela idade (0–1)
  prizeWon: number;     // USD
  beaten: string[];     // times que ficaram atrás
  network: number;      // Σ valor dos batidos (preenchido no 2º passo)
  lanShare: number;     // fração do field superada em LAN
}
export interface VrsBreakdown extends VrsEntry {
  rows: (VrsRow & { contribution: number })[];
  raw: { prize: number; network: number; lan: number };
}
export interface VrsTable {
  now: number;
  entries: Record<string, VrsBreakdown>;
  order: string[];      // teamIds do #1 ao último ranqueado
  refs: { prize: number; network: number; lan: number };
}

const sumTop = (xs: number[], n = VRS_TOP_N) => xs.sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0);
const refOf = (vals: number[]) => {
  const s = vals.filter((v) => v > 0).sort((a, b) => b - a);
  if (!s.length) return 1;
  return s[Math.min(VRS_REF_RANK, s.length) - 1] || s[0] || 1;
};
export const pointsFromScore = (score: number): number => (score <= 0 ? 0 : Math.max(1, Math.round(PTS_SCALE * Math.min(1, score))));
const norm = (raw: number, ref: number, pow: number) => Math.pow(Math.min(1, Math.max(0, raw / ref)), pow);
/** Concavidade da premiação e da rede (0,5 = raiz): quanto menor, mais o acesso encosta na elite. */
export const VRS_CURVE = 0.5;

/**
 * O ranking no instante `now` (tempo absoluto em etapas). Resultados sem `t` ou
 * `prizePool` são ignorados (não dá pra envelhecer nem valorar). Puro.
 */
export function computeVrs(results: readonly WorldEventResult[], now: number): VrsTable {
  const rowsOf = new Map<string, VrsRow[]>();
  for (const r of results) {
    if (r.t == null || !r.placements.length) continue;
    const age = now - r.t;
    const w = ageWeight(age);
    if (w <= 0 || age < 0) continue;
    const field = r.field ?? r.placements.length;
    const pool = r.prizePool ?? 0;
    // colocação → quem ficou atrás (colocação empatada não "bate" o outro)
    const byPlace = [...r.placements].sort((a, b) => a.place - b.place);
    for (const p of byPlace) {
      const beaten = byPlace.filter((q) => q.place > p.place).map((q) => q.teamId);
      // times podados do registro (fora do top guardado) também foram batidos
      const prunedBehind = Math.max(0, field - byPlace.length);
      const row: VrsRow = {
        eventId: r.eventId, name: r.name ?? r.eventId, split: r.split, t: r.t, place: p.place, field, lan: !!r.lan,
        weight: w, prizeWon: pool * shareOf(p.place, field), beaten, network: 0,
        lanShare: r.lan && field > 1 ? (beaten.length + prunedBehind) / (field - 1) : 0,
      };
      const arr = rowsOf.get(p.teamId) ?? [];
      arr.push(row);
      rowsOf.set(p.teamId, arr);
    }
  }
  // 1º passo: premiação (o "valor" de cada time pro fator rede)
  const prizeRaw = new Map<string, number>();
  for (const [id, rows] of rowsOf) prizeRaw.set(id, sumTop(rows.map((x) => x.prizeWon * x.weight)));
  const refPrize = refOf([...prizeRaw.values()]);
  const bounty = (id: string) => norm(prizeRaw.get(id) ?? 0, refPrize, 1);
  // 2º passo: rede de adversários (valor dos batidos) e LAN
  const netRaw = new Map<string, number>();
  const lanRaw = new Map<string, number>();
  for (const [id, rows] of rowsOf) {
    for (const x of rows) x.network = x.beaten.reduce((a, o) => a + bounty(o), 0);
    netRaw.set(id, sumTop(rows.map((x) => x.network * x.weight)));
    lanRaw.set(id, sumTop(rows.map((x) => x.lanShare * x.weight)));
  }
  const refNet = refOf([...netRaw.values()]);
  const refLan = refOf([...lanRaw.values()]);
  const entries: Record<string, VrsBreakdown> = {};
  for (const [id, rows] of rowsOf) {
    const f = {
      prize: norm(prizeRaw.get(id) ?? 0, refPrize, VRS_CURVE),
      network: norm(netRaw.get(id) ?? 0, refNet, VRS_CURVE),
      lan: norm(lanRaw.get(id) ?? 0, refLan, 1),
    };
    const score = VRS_WEIGHTS.prize * f.prize + VRS_WEIGHTS.network * f.network + VRS_WEIGHTS.lan * f.lan;
    const points = pointsFromScore(score);
    // composição por resultado: a parte de cada um na nota, escalada pros pontos
    const parts = rows.map((x) =>
      VRS_WEIGHTS.prize * (x.prizeWon * x.weight) / refPrize
      + VRS_WEIGHTS.network * (x.network * x.weight) / refNet
      + VRS_WEIGHTS.lan * (x.lanShare * x.weight) / refLan);
    const tot = parts.reduce((a, b) => a + b, 0) || 1;
    const withC = rows.map((x, i) => ({ ...x, contribution: Math.round((points * parts[i]) / tot) }))
      .sort((a, b) => b.contribution - a.contribution);
    entries[id] = {
      teamId: id, points, factors: { prize: +f.prize.toFixed(3), network: +f.network.toFixed(3), lan: +f.lan.toFixed(3) },
      history: withC.slice(0, 2).map((x) => ({ eventId: x.eventId, split: x.split, points: x.contribution })),
      rows: withC,
      raw: { prize: prizeRaw.get(id) ?? 0, network: netRaw.get(id) ?? 0, lan: lanRaw.get(id) ?? 0 },
    };
  }
  const order = Object.keys(entries).sort((a, b) => entries[b].points - entries[a].points || entries[b].raw.prize - entries[a].raw.prize || (a < b ? -1 : 1));
  order.forEach((id, i) => { entries[id].rank = i + 1; });
  return { now, entries, order, refs: { prize: refPrize, network: refNet, lan: refLan } };
}

/** O que vai pro save (`mundo.vrs`): pontos, fatores, posição e as 2 maiores contribuições. */
export function publishVrs(table: VrsTable, prev?: Record<string, VrsEntry> | null): Record<string, VrsEntry> {
  const out: Record<string, VrsEntry> = {};
  for (const id of table.order) {
    const e = table.entries[id];
    out[id] = { teamId: id, points: e.points, history: e.history, factors: e.factors, rank: e.rank, ...(prev?.[id] ? { prev: prev[id].points } : {}) };
  }
  return out;
}

/** Posição de um time num ranking publicado (0 = sem ranking). */
export function rankIn(vrs: Record<string, VrsEntry> | null | undefined, id: string): number {
  return vrs?.[id]?.rank ?? 0;
}
/** Lista ordenada (#1 primeiro) de um ranking publicado. */
export function vrsOrder(vrs: Record<string, VrsEntry> | null | undefined): VrsEntry[] {
  return Object.values(vrs ?? {}).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.points - a.points);
}
