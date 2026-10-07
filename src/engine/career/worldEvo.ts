// [evolução · out/2026] CURVA ÚNICA: o mundo da IA evolui pela MESMA função
// do seu elenco (`evolveAttrs`, atributo a atributo), em contexto neutro —
// titular (12 mapas), sem treino, rating 1.00. Antes havia 4 curvas (seu
// elenco, IA por OVR escalar, newgens congelados, academia +1..+3) e o jogador
// trocava de curva na compra/venda: comprava-se um 86 que chegava 84, vendia-se
// um 84 que voltava 88 ao mercado.
//
// REPLAY DETERMINÍSTICO: os atributos de um jogador da IA no split S são os
// atributos de partida (os da base no split de estreia, ou o estado gravado na
// saída do seu elenco — `save.worldEvo`) evoluídos fechamento a fechamento até
// S − 1. Nada é gravado por jogador da IA: o save só guarda quem SAIU do seu
// elenco ({ variação por atributo sobre a base, split, teto }).
//
// MEMO INCREMENTAL por (jogador, partida): a lista de estados por split cresce
// sob demanda. Avançar 1 split com ~1.300 jogadores custa ~1.300 chamadas de
// `evolveAttrs` (medido em scripts/test-evolucao.mts).
import { ALL_ATTRS } from '../attributes';
import { attrsOf, caFromOvr, withAttrs, type PlayerAttrs } from '../attrs/model';
import { evolveAttrs } from '../attrs/progression';
import type { Player } from '../../types';
import { applyAttrDelta, attrDelta, attrDeltaFromScalarEvo, type AttrDelta } from './attrEvo';
import { playerOvr } from '../ratings';
import type { StintsMap } from './stints';

/** Estado de um jogador que saiu do seu elenco: a IA continua dali. */
export interface WorldEvoEntry {
  /** variação por atributo sobre os atributos da BASE (mesma régua do attrEvo) */
  attrDelta: AttrDelta;
  /** split a partir do qual a IA evolui (o 1º fechamento fora do seu elenco) */
  split: number;
  /** teto (OVR) usado no seu elenco — inclui o potencial furado por desempenho */
  pot?: number;
}
export type WorldEvoMap = Record<string, WorldEvoEntry>;

/** Relógio de evolução de um jogador do mundo. */
export interface EvoClock {
  /** 1º split cujo fechamento evolui o jogador (estreia; 1 = início da Carreira) */
  from: number;
  /** idade no split (a mesma régua do seu elenco: effectiveAge/aiAgeOf) */
  ageAt: (split: number) => number;
  /** teto em OVR */
  pot: number;
  /** variação de partida sobre os atributos da base (worldEvo) */
  start?: AttrDelta;
}

const deltaSig = (d: AttrDelta | undefined) => {
  if (!d) return '';
  let s = '';
  for (const k of ALL_ATTRS) if (d[k]) s += `${k}${d[k]},`;
  return s;
};
const legacySig = (p: Player) => `${p.aim}|${p.awp}|${p.igl}|${p.clutch}|${p.consistency}|${p.role}`;

interface Track { list: PlayerAttrs[] }
const memo = new Map<string, Track>();
const MEMO_MAX = 12_000;
let stepsRun = 0;
/** Chamadas de `evolveAttrs` feitas pelo replay (medição de custo). */
export const replaySteps = () => stepsRun;
export function clearReplayMemo(): void { memo.clear(); }

/**
 * Atributos do jogador no split `split` pela curva única (contexto neutro).
 * `p` = o jogador de PARTIDA (base do dataset, regen recém-criado, cópia da venda).
 */
export function replayAttrs(p: Player, split: number, c: EvoClock): PlayerAttrs {
  const base = attrsOf(p);
  const startAttrs = c.start ? applyAttrDelta(base, c.start) : base;
  const n = Math.max(0, Math.floor(split) - Math.max(1, Math.floor(c.from)));
  if (n === 0) return startAttrs;
  const key = `${p.id}|${c.from}|${c.pot}|${c.ageAt(c.from)}|${legacySig(p)}|${deltaSig(c.start)}`;
  let t = memo.get(key);
  if (!t) {
    if (memo.size >= MEMO_MAX) memo.clear();
    t = { list: [startAttrs] };
    memo.set(key, t);
  }
  const paCa = caFromOvr(c.pot);
  while (t.list.length <= n) {
    const i = t.list.length - 1;
    const cur = t.list[i];
    const s = c.from + i; // fechamento do split s
    stepsRun++;
    const r = evolveAttrs({ ...cur, pa: Math.max(cur.ca, paCa) }, {
      playerId: p.id, split: s, age: c.ageAt(s), role: p.role,
    });
    t.list.push(r.attrs);
  }
  return t.list[n];
}

/** O jogador no split pela curva única (o mesmo objeto se nada mudou). */
export function replayPlayer<T extends Player>(p: T, split: number, c: EvoClock): T {
  const x = replayAttrs(p, split, c);
  return x === attrsOf(p) ? p : withAttrs(p, x);
}

/** Entrada do worldEvo para quem sai do seu elenco com os atributos `now`. */
export function worldEvoEntry(base: Player, now: PlayerAttrs, split: number, pot?: number): WorldEvoEntry {
  return { attrDelta: attrDelta(now.a, attrsOf(base).a), split: Math.max(1, Math.floor(split)), ...(pot != null ? { pot } : {}) };
}

/** Saneia o campo vindo do save. */
export function normalizeWorldEvo(raw: unknown): WorldEvoMap {
  const out: WorldEvoMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const e = v as Record<string, unknown>;
    const split = typeof e.split === 'number' && Number.isFinite(e.split) ? Math.max(1, Math.floor(e.split)) : null;
    if (split == null) continue;
    const d: AttrDelta = {};
    const rd = e.attrDelta && typeof e.attrDelta === 'object' ? e.attrDelta as Record<string, unknown> : {};
    for (const k of ALL_ATTRS) {
      const x = rd[k];
      if (typeof x === 'number' && Number.isFinite(x) && x !== 0) d[k] = Math.max(-19, Math.min(19, Math.round(x)));
    }
    const pot = typeof e.pot === 'number' && Number.isFinite(e.pot) ? Math.max(40, Math.min(99, Math.round(e.pot))) : undefined;
    out[id] = { attrDelta: d, split, ...(pot != null ? { pot } : {}) };
  }
  return out;
}

/**
 * Migração idempotente (sem subir o SAVE_VERSION) para quem saiu do seu elenco
 * ANTES do worldEvo existir — voltava ao mundo com os atributos da base:
 *   - passagem encerrada com OVR de saída (stints) de um jogador da base que não
 *     está no elenco nem no worldEvo → o estado da saída (os 5 números da base
 *     deslocados até o OVR de saída) no split da saída;
 *   - declínio guardado no `evo` de quem já saiu (o antigo withDecline do
 *     mercado) → o mesmo, no split atual.
 * Academia/base/regen vendidos já guardam o estado na cópia (extraOnTeam).
 */
export function migrateWorldEvo(
  s: { worldEvo?: unknown; squad?: { playerId: string }[]; stints?: StintsMap; evo?: Record<string, number>; split?: number },
  baseById: ReadonlyMap<string, Player>,
): WorldEvoMap {
  const out: WorldEvoMap = normalizeWorldEvo(s.worldEvo);
  const inSquad = new Set((s.squad ?? []).map((x) => x.playerId));
  for (const [pid, arr] of Object.entries(s.stints ?? {})) {
    if (out[pid] || inSquad.has(pid) || !Array.isArray(arr)) continue;
    const last = arr[arr.length - 1];
    if (!last || last.to == null || typeof last.endOvr !== 'number' || !(last.endOvr > 0)) continue;
    const base = baseById.get(pid);
    if (!base) continue;
    const d = Math.round(last.endOvr) - playerOvr(base);
    if (d) out[pid] = { attrDelta: attrDeltaFromScalarEvo(base, d), split: Math.max(1, Math.floor(last.to)) };
  }
  for (const [pid, d] of Object.entries(s.evo ?? {})) {
    if (out[pid] || inSquad.has(pid) || typeof d !== 'number' || !d) continue;
    const base = baseById.get(pid);
    if (base) out[pid] = { attrDelta: attrDeltaFromScalarEvo(base, d), split: Math.max(1, Math.floor(s.split ?? 1)) };
  }
  return out;
}
