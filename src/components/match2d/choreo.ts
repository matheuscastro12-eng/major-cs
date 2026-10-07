// COREOGRAFIA do radar 2D: transforma UM round já jogado pelo motor num roteiro
// de animação (trajetórias dos 10 jogadores, utilitária, plant, abates, fim).
//
// Regra de ouro: a animação ENCENA o resultado já sorteado e nunca o muda. Tudo
// que importa (quem matou quem, em que ordem, troca, headshot, site, plant,
// como o round acabou, quem venceu) vem do motor (killFeed + roundLog +
// lastSite + lastRoundPlay). O que é inventado aqui é só o "onde" e o "quando"
// dentro do round, com um PRNG próprio semeado por (mapa, round) — nunca o rng
// da partida. Mesmo round → mesmo roteiro.

import type { KillEvent, MapId } from '../../types';
import type { BuyTier, RoundPlayInfo } from '../../engine/match';
import { map2dOf, pathBetween, type Map2D, type Pt } from './maps';

export interface Key { t: number; x: number; y: number }

export interface Track {
  id: string;
  team: 0 | 1;
  slot: number;
  side: 't' | 'ct';
  keys: Key[];          // ordenadas por t (0..1)
  deathT: number | null;
}

export type ScriptEvent =
  | { t: number; kind: 'kill'; killer: string; victim: string; killerTeam: 0 | 1; at: Pt; from: Pt; headshot: boolean; weapon: string; opening: boolean; trade: boolean }
  | { t: number; kind: 'smoke'; at: Pt; side: 't' | 'ct' }
  | { t: number; kind: 'flash'; at: Pt; side: 't' | 'ct' }
  | { t: number; kind: 'plant'; at: Pt; by: string | null }
  | { t: number; kind: 'defuse'; at: Pt; by: string | null }
  | { t: number; kind: 'explode'; at: Pt }
  | { t: number; kind: 'end' };

export interface RoundInput {
  map: MapId | string;
  round: number;                        // 0-based
  teamIds: [string[], string[]];        // 5 ids por time, na ordem do elenco do motor
  tTeam: 0 | 1;                         // time que está de T neste round
  kills: KillEvent[];                   // killFeed DESTE round (ordem do motor)
  winner: 0 | 1;
  tSite: 'A' | 'B' | null;              // lastSite().tSite
  play?: RoundPlayInfo | null;          // motor v2; ausente = inferido
  buys?: [BuyTier, BuyTier] | null;
}

export interface RoundScript {
  map: Map2D;
  tracks: Track[];
  events: ScriptEvent[];                // ordenados por t
  site: 'A' | 'B';
  planted: boolean;
  plantT: number | null;
  bombAt: Pt | null;
  end: RoundPlayInfo['end'];
  endT: number;
  winner: 0 | 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRNG local (mulberry32) — só para a encenação

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

/** Posição de um track no instante t (interpolação linear entre keys; parado depois de morrer). */
export function posAt(tr: Track, t: number): Pt {
  const ks = tr.keys;
  const tt = tr.deathT != null ? Math.min(t, tr.deathT) : t;
  if (tt <= ks[0].t) return ks[0];
  for (let i = 1; i < ks.length; i++) {
    if (tt <= ks[i].t) {
      const a = ks[i - 1], b = ks[i];
      const k = b.t > a.t ? (tt - a.t) / (b.t - a.t) : 1;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return ks[ks.length - 1];
}

// adiciona as keys de um percurso pelo grafo entre t0 e t1 (tempo ∝ distância)
function walk(m: Map2D, keys: Key[], from: string, to: string, t0: number, t1: number, off: Pt) {
  const path = pathBetween(m, from, to).map((n) => ({ x: m.nodes[n].x + off.x, y: m.nodes[n].y + off.y }));
  if (path.length < 2) { keys.push({ t: t1, ...path[path.length - 1] }); return; }
  const seg: number[] = [];
  let tot = 0;
  for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); seg.push(d); tot += d; }
  let acc = 0;
  keys.push({ t: t0, ...path[0] });
  for (let i = 1; i < path.length; i++) {
    acc += seg[i - 1];
    keys.push({ t: t0 + (t1 - t0) * (tot ? acc / tot : 1), ...path[i] });
  }
}

function insertKey(keys: Key[], k: Key) {
  // remove keys em [k.t − 0.02, k.t] para o deslocamento até o duelo ficar limpo
  for (let i = keys.length - 1; i >= 0; i--) if (keys[i].t > k.t - 0.02 && keys[i].t <= k.t) keys.splice(i, 1);
  let i = 0;
  while (i < keys.length && keys[i].t < k.t) i++;
  keys.splice(i, 0, k);
}

// ─────────────────────────────────────────────────────────────────────────────

export function buildRoundScript(inp: RoundInput): RoundScript {
  const m = map2dOf(inp.map);
  const rnd = prng(hashStr(`${m.id}:${inp.round}:${inp.kills.length}:${inp.winner}`));
  const tTeam = inp.tTeam;
  const ctTeam: 0 | 1 = tTeam === 0 ? 1 : 0;
  const site: 'A' | 'B' = inp.tSite ?? (rnd() < 0.5 ? 'A' : 'B');
  const other: 'A' | 'B' = site === 'A' ? 'B' : 'A';
  const entry = site === 'A' ? 'aT' : 'bT';
  const otherEntry = other === 'A' ? 'aT' : 'bT';
  const ctEntry = site === 'A' ? 'aCT' : 'bCT';

  // ── como o round acabou (motor v2 diz; v1 é inferido) ──
  const killsT = inp.kills.filter((k) => k.killerTeam === tTeam).length;
  const killsCT = inp.kills.filter((k) => k.killerTeam === ctTeam).length;
  let end: RoundPlayInfo['end'];
  let planted: boolean;
  let kbp: number;
  if (inp.play) {
    end = inp.play.end; planted = inp.play.planted; kbp = clamp(inp.play.killsBeforePlant, 0, inp.kills.length);
  } else {
    const tWon = inp.winner === tTeam;
    if (tWon) { end = killsT >= 5 ? 'elim' : 'explode'; planted = killsT < 5 || rnd() < 0.5; }
    else { end = killsCT >= 5 ? 'elim' : 'time'; planted = false; }
    kbp = planted ? Math.max(0, inp.kills.length - Math.floor(rnd() * 3)) : inp.kills.length;
  }

  // ── tempos-chave do round (0..1) ──
  const SETUP = 0.13;
  const EXEC = 0.34 + rnd() * 0.06;
  const plantT = planted ? clamp(0.52 + rnd() * 0.08, 0.5, 0.62) : null;
  const n = inp.kills.length;
  const killT: number[] = [];
  {
    const pre = plantT != null ? kbp : n;
    const preA = 0.24, preB = plantT != null ? plantT - 0.03 : end === 'time' ? 0.9 : 0.86;
    const postA = plantT != null ? plantT + 0.07 : 0, postB = end === 'defuse' ? 0.86 : 0.93;
    let last = 0;
    for (let i = 0; i < n; i++) {
      const k = inp.kills[i];
      let t: number;
      if (k.trade && i > 0) t = last + 0.012;
      else if (i < pre) t = preA + (preB - preA) * ((i + 0.5 + (rnd() - 0.5) * 0.6) / Math.max(1, pre));
      else t = postA + (postB - postA) * ((i - pre + 0.5 + (rnd() - 0.5) * 0.6) / Math.max(1, n - pre));
      t = Math.max(t, last + 0.008);
      killT.push(t);
      last = t;
    }
  }
  const lastKill = n ? killT[n - 1] : 0;
  const endT = end === 'elim' ? Math.min(1, lastKill + 0.04)
    : end === 'explode' ? 0.98 : end === 'defuse' ? Math.max(0.9, lastKill + 0.06) : end === 'save' ? Math.max(0.9, lastKill + 0.05) : 1;

  // ── trajetórias de base ──
  const tracks: Track[] = [];
  const byId = new Map<string, Track>();
  const lurker = Math.floor(rnd() * 5);
  // CT: 2 no A, 1 no meio, 2 no B (rotação da ordem por round)
  const ctRot = Math.floor(rnd() * 5);
  const ctPost: string[] = [m.holds.A[0], m.holds.A[1], m.holds.mid[0], m.holds.B[0], m.holds.B[1]];
  const contact = n ? killT[0] : EXEC + 0.08;
  for (const team of [0, 1] as const) {
    const side: 't' | 'ct' = team === tTeam ? 't' : 'ct';
    for (let s = 0; s < 5; s++) {
      const id = inp.teamIds[team][s] ?? `${team}-${s}`;
      const off = { x: (rnd() - 0.5) * 4, y: (rnd() - 0.5) * 4 };
      const keys: Key[] = [];
      const spawn = side === 't' ? m.spawns.t : m.spawns.ct;
      const sp = { x: spawn.x + (s - 2) * 2.2 + off.x * 0.4, y: spawn.y + ((s % 2) - 0.5) * 2.4 + off.y * 0.4 };
      keys.push({ t: 0, ...sp });
      const spawnNode = side === 't' ? 'tS' : 'ctS';
      if (side === 't') {
        const stage = m.stage[s % m.stage.length];
        walk(m, keys, spawnNode, stage, 0.03, SETUP + 0.06 + rnd() * 0.05, off);
        if (s === lurker) {
          walk(m, keys, stage, otherEntry, 0.24, EXEC + 0.08, off);
          if (plantT != null) walk(m, keys, otherEntry, site, plantT + 0.02, Math.min(0.95, plantT + 0.3), off);
        } else {
          walk(m, keys, stage, entry, 0.22 + rnd() * 0.04, EXEC + rnd() * 0.04, off);
          walk(m, keys, entry, site, EXEC + 0.05, EXEC + 0.14 + rnd() * 0.05, off);
        }
      } else {
        const hold = ctPost[(s + ctRot) % 5];
        walk(m, keys, spawnNode, hold, 0.02, SETUP + rnd() * 0.04, off);
        // rotação: quem não está no site atacado vai pra lá depois do contato
        const atSite = (site === 'A' ? m.holds.A : m.holds.B).includes(hold);
        if (!atSite) {
          const go = contact + 0.02 + rnd() * 0.05;
          const dest = plantT != null ? ctEntry : site;
          walk(m, keys, hold, dest, go, Math.min(0.9, go + 0.2), off);
          if (plantT != null) walk(m, keys, ctEntry, site, Math.max(plantT + 0.12, go + 0.22), Math.min(0.97, plantT + 0.32), off);
        } else if (plantT != null) {
          walk(m, keys, hold, site, plantT + 0.1, Math.min(0.97, plantT + 0.28), off);
        }
      }
      keys.sort((a, b) => a.t - b.t);
      const tr: Track = { id, team, slot: s, side, keys, deathT: null };
      tracks.push(tr);
      byId.set(id, tr);
    }
  }

  // ── abates: ENCENA a ordem do motor no lugar plausível ──
  const events: ScriptEvent[] = [];
  for (let i = 0; i < n; i++) {
    const k = inp.kills[i];
    const t = killT[i];
    const kt = byId.get(k.killerId);
    const vt = byId.get(k.victimId);
    if (!kt || !vt) continue;
    const kp = posAt(kt, t), vp = posAt(vt, t);
    const d = Math.hypot(kp.x - vp.x, kp.y - vp.y);
    // duelo de perto: os dois se aproximam do ponto do contato (máx. ~10 de distância)
    const reach = 6 + rnd() * 6;
    let from = kp;
    if (d > reach) {
      const dir = { x: (kp.x - vp.x) / d, y: (kp.y - vp.y) / d };
      from = { x: vp.x + dir.x * reach, y: vp.y + dir.y * reach };
      insertKey(kt.keys, { t, ...from });
    }
    insertKey(vt.keys, { t, ...vp });
    vt.deathT = t;
    events.push({ t, kind: 'kill', killer: k.killerId, victim: k.victimId, killerTeam: k.killerTeam, at: vp, from, headshot: k.headshot, weapon: k.weapon, opening: k.opening, trade: k.trade });
  }

  // ── utilitária (estilizada): smokes nas entradas do CT, flashes na entrada ──
  const tBuy = inp.buys ? inp.buys[tTeam] : 'full';
  const ctBuy = inp.buys ? inp.buys[ctTeam] : 'full';
  const siteC = { x: m.sites[site].x, y: m.sites[site].y };
  const nSmoke = tBuy === 'eco' ? 0 : tBuy === 'pistol' || tBuy === 'force' ? 1 : 2;
  for (let i = 0; i < nSmoke; i++) {
    const tgt = i === 0 ? m.nodes[ctEntry] : lerp(siteC, m.nodes[ctEntry], 0.35);
    events.push({ t: EXEC - 0.06 + i * 0.02, kind: 'smoke', at: { x: tgt.x + (rnd() - 0.5) * 3, y: tgt.y + (rnd() - 0.5) * 3 }, side: 't' });
  }
  const nFlash = tBuy === 'eco' ? 1 : 2;
  for (let i = 0; i < nFlash; i++) {
    const tgt = lerp(m.nodes[entry], siteC, 0.45 + i * 0.2);
    events.push({ t: EXEC + 0.01 + i * 0.025, kind: 'flash', at: tgt, side: 't' });
  }
  if (plantT != null && ctBuy !== 'eco') {
    events.push({ t: plantT + 0.12, kind: 'smoke', at: lerp(siteC, m.nodes[entry], 0.4), side: 'ct' });
    events.push({ t: plantT + 0.16, kind: 'flash', at: lerp(siteC, m.nodes[ctEntry], 0.3), side: 'ct' });
  }

  // ── plant, fim ──
  let bombAt: Pt | null = null;
  if (plantT != null) {
    bombAt = { x: siteC.x + (rnd() - 0.5) * 6, y: siteC.y + (rnd() - 0.5) * 5 };
    const tAlive = tracks.filter((tr) => tr.side === 't' && (tr.deathT == null || tr.deathT > plantT));
    const planter = (inp.play?.planterId && byId.get(inp.play.planterId)) || tAlive[0] || tracks.find((tr) => tr.side === 't')!;
    // quem plantou precisa estar na bomba no instante do plant
    if (planter.deathT == null || planter.deathT > plantT) insertKey(planter.keys, { t: plantT, ...bombAt });
    events.push({ t: plantT, kind: 'plant', at: bombAt, by: planter.id });
  }
  if (end === 'defuse' && bombAt) {
    const ctAlive = tracks.filter((tr) => tr.side === 'ct' && tr.deathT == null);
    const by = ctAlive[0] ?? null;
    if (by) insertKey(by.keys, { t: endT - 0.06, ...bombAt });
    events.push({ t: endT, kind: 'defuse', at: bombAt, by: by?.id ?? null });
  } else if (end === 'explode' && bombAt) {
    events.push({ t: endT, kind: 'explode', at: bombAt });
  } else if (end === 'save') {
    // quem perdeu sai do site e volta pro spawn
    const loserSide: 't' | 'ct' = inp.winner === tTeam ? 'ct' : 't';
    for (const tr of tracks) {
      if (tr.side !== loserSide || tr.deathT != null) continue;
      const at = posAt(tr, lastKill + 0.01);
      tr.keys = tr.keys.filter((k) => k.t <= lastKill + 0.01);
      tr.keys.push({ t: lastKill + 0.01, ...at });
      const sp = loserSide === 't' ? m.spawns.t : m.spawns.ct;
      tr.keys.push({ t: endT, x: sp.x + (tr.slot - 2) * 2, y: sp.y });
    }
  }
  events.push({ t: endT, kind: 'end' });
  events.sort((a, b) => a.t - b.t);
  for (const tr of tracks) tr.keys.sort((a, b) => a.t - b.t);

  return { map: m, tracks, events, site, planted: plantT != null, plantT, bombAt, end, endT, winner: inp.winner };
}

/** Relógio do round (s) mostrado no HUD: 1:55 até o plant, 40 s de bomba depois. */
export function clockAt(sc: RoundScript, t: number): { secs: number; bomb: boolean } {
  if (sc.plantT != null && t >= sc.plantT) {
    const span = Math.max(0.05, 0.98 - sc.plantT);
    return { secs: Math.max(0, 40 * (1 - (t - sc.plantT) / span)), bomb: true };
  }
  if (t < 0.12) return { secs: 115, bomb: false };
  return { secs: Math.max(0, 115 * (1 - (t - 0.12) / 0.88)), bomb: false };
}
