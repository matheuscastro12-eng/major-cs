// O ROUND COMO CADEIA DE DUELOS (motor v2).
//
// Um round é uma cadeia de Markov sobre o estado (vivos do T, vivos do CT,
// bomba plantada?). A cada evento, nesta ordem:
//   1. desistência/tempo: quem está muito atrás pode salvar (save) ou o tempo
//      acaba; com a bomba plantada, ela pode explodir ou o CT desarmar;
//   2. o T pode plantar (sem bomba ainda);
//   3. senão, DUELO: um jogador de cada lado é escolhido pelo peso de
//      engajamento (função, estilo, postura, fase) e o vencedor sai de
//      sigmoid(K·(poder_i − poder_j) + equipamento + lado + time);
//   4. quem morreu pode ser TROCADO na hora por um companheiro (teamwork,
//      comunicação, reação), contra a arma e a mira de quem matou.
// Kills, mortes, aberturas, trocas, clutches, sobreviventes: tudo EMERGE
// desta cadeia — nada é distribuído depois do resultado.
//
// HONESTIDADE (% mostrado = % rolado): a mesma cadeia é resolvida de forma
// EXATA por programação dinâmica sobre os 2×32×32 estados (winProbT). O HUD
// mostra esse número e o sorteio do round É a cadeia — a frequência de vitória
// converge para o número mostrado (teste em test-engine-v2.mts).
//
// Convenção: lado 0 = time que está de T no round, lado 1 = time de CT.
// Slots 0..4 = jogadores do elenco na ordem do time.

import type { Rng } from '../rng';
import { sigmoid } from '../matchShared';

export type WeaponClass = 'pistol' | 'eco' | 'half' | 'smg' | 'rifle' | 'awp';

export const FULL = 31;
const N = 5;
const popcount = (m: number): number => {
  let c = 0;
  for (let x = m; x; x &= x - 1) c++;
  return c;
};
const POP = Array.from({ length: 32 }, (_, m) => popcount(m));

// ─────────────────────────────────────────────────────────────────────────────
// Constantes do duelo (calibradas pelo harness scripts/calibrate-engine.mts)

export const DUEL = {
  K: 0.08,             // logit por ponto de atributo de diferença de poder
  OPEN_T: -0.06,       // duelo de abertura: quem segura o ângulo (CT) leva leve vantagem
  POST_T: 0.26,        // pós-plant: o T segura o C4, o CT precisa ir
  // equipamento (logit relativo ao rifle)
  E_SMG: -0.6,
  E_ECO: -2.2,         // eco seco (pistola, sem colete)
  E_HALF: -1.35,       // meia-compra (colete + pistola melhor) — o eco do 2º round
  E_AWP_HOLD: 0.22,    // AWP segurando ângulo (CT, ou T no pós-plant)
  E_AWP_PEEK: -0.02,   // AWP tendo que ir no duelo
  // troca
  TRADE_BASE: 0.22,
  TRADE_SKILL: 0.05,   // por ponto de trade médio acima de 12
  K_TRADE: 0.06,
  NUM_ADV: 0.2,       // por jogador a mais vivo: crossfire, troca armada, utilitária sobrando
};

// ─────────────────────────────────────────────────────────────────────────────
// Especificação de UM round (tudo que a cadeia precisa, já resolvido)

export interface SideSpec {
  base: Float64Array;       // poder de arma (1–20) por slot — da classe de arma do round
  mod: Float64Array;        // modificadores em pontos de atributo (forma, fadiga, oculto, RtP…)
  phase1: Float64Array;     // T: entry · CT: hold (duelo de abertura)
  sense: Float64Array;      // meio de round
  phase2: Float64Array;     // T: pós-plant · CT: retake
  clutch: Float64Array;     // último vivo
  trade: Float64Array;      // habilidade de troca
  eq: Float64Array;         // logit de equipamento (sem AWP)
  awp: Uint8Array;          // 1 = está de AWP
  wOpen: Float64Array;      // peso de engajamento no duelo de abertura
  wMid: Float64Array;       // meio de round
  wPost: Float64Array;      // pós-plant (T segura, CT retoma)
  tradeTeam: number;        // multiplicador de troca do time (entrosamento)
  saveMult: number;         // propensão a salvar (eco/save call)
}

export interface RoundSpec {
  sides: [SideSpec, SideSpec];  // [T, CT]
  bias: number;                 // logit a favor do T em TODO duelo (time, lado do mapa, leitura de site…)
  plantMult: number;            // execução do T (utilitária, IGL, rush, leitura de site)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabelas derivadas (cache por round)

interface Tables {
  pT: (Float64Array | null)[];      // (9 chaves de fase × 9 diferenças de vivos) → P(T slot i vence CT slot j), [i*5+j]
  tr: [Float64Array, Float64Array]; // tr[s][killer*32 + mask] = P(lado s troca o killer com os vivos `mask`)
  ev: Float64Array;                 // probabilidades de evento por (plantado, nT, nC)
}

const tablesOf = new WeakMap<RoundSpec, Tables>();

function tables(spec: RoundSpec): Tables {
  let t = tablesOf.get(spec);
  if (t) return t;
  t = { pT: new Array<Float64Array | null>(81).fill(null), tr: [tradeTable(spec, 0), tradeTable(spec, 1)], ev: eventTable(spec) };
  tablesOf.set(spec, t);
  return t;
}

// chave de fase: 8 = abertura (5v5 sem bomba); senão plantado*4 + T sozinho*2 + CT sozinho
function phaseKey(mT: number, mC: number, pl: number): number {
  if (!pl && mT === FULL && mC === FULL) return 8;
  return pl * 4 + (POP[mT] === 1 ? 2 : 0) + (POP[mC] === 1 ? 1 : 0);
}

function powerOf(s: SideSpec, k: number, key: number, alone: boolean): number {
  const skill = alone ? s.clutch[k] : key === 8 ? s.phase1[k] : key >= 4 ? s.phase2[k] : s.sense[k];
  const wSkill = alone ? 0.4 : key === 8 || key >= 4 ? 0.35 : 0.3;
  return (1 - wSkill) * s.base[k] + wSkill * skill + s.mod[k];
}

// equipamento no duelo: AWP rende segurando (CT antes da bomba, T depois dela)
function eqOf(s: SideSpec, side: 0 | 1, k: number, planted: boolean): number {
  if (!s.awp[k]) return s.eq[k];
  const holding = side === 1 ? !planted : planted;
  return holding ? DUEL.E_AWP_HOLD : DUEL.E_AWP_PEEK;
}

function duelTable(spec: RoundSpec, key: number, diff: number): Float64Array {
  const [T, C] = spec.sides;
  const pl = key !== 8 && key >= 4;
  const tAlone = key !== 8 && (key & 2) !== 0;
  const cAlone = key !== 8 && (key & 1) !== 0;
  const bias = spec.bias + (key === 8 ? DUEL.OPEN_T : 0) + (pl ? DUEL.POST_T : 0) + DUEL.NUM_ADV * diff;
  const out = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    const pi = powerOf(T, i, key, tAlone);
    const ei = eqOf(T, 0, i, pl);
    for (let j = 0; j < N; j++) {
      const pj = powerOf(C, j, key, cAlone);
      const ej = eqOf(C, 1, j, pl);
      out[i * N + j] = sigmoid(DUEL.K * (pi - pj) + ei - ej + bias);
    }
  }
  return out;
}

// diff = vivos do T − vivos do CT (−4..4)
function pTable(t: Tables, spec: RoundSpec, key: number, diff: number): Float64Array {
  const idx = key * 9 + diff + 4;
  return t.pT[idx] ?? (t.pT[idx] = duelTable(spec, key, diff));
}

// Troca: o lado `s` (com os vivos `mask`) derruba o `killer` do outro lado na hora.
function tradeTable(spec: RoundSpec, s: 0 | 1): Float64Array {
  const me = spec.sides[s];
  const other = spec.sides[s === 0 ? 1 : 0];
  const out = new Float64Array(N * 32);
  for (let mask = 1; mask < 32; mask++) {
    const n = POP[mask];
    let tr = 0, fp = 0, eq = 0;
    for (let k = 0; k < N; k++) {
      if (!(mask & (1 << k))) continue;
      tr += me.trade[k];
      fp += me.base[k] + me.mod[k];
      eq += me.eq[k];
    }
    tr /= n; fp /= n; eq /= n;
    const cnt = n === 1 ? 0.55 : n === 2 ? 0.85 : 1;
    const base = DUEL.TRADE_BASE * cnt * me.tradeTeam * Math.max(0.3, 1 + DUEL.TRADE_SKILL * (tr - 12));
    for (let killer = 0; killer < N; killer++) {
      const kp = other.base[killer] + other.mod[killer];
      const t = base * 2 * sigmoid(DUEL.K_TRADE * (fp - kp) + eq - other.eq[killer]);
      out[killer * 32 + mask] = Math.max(0, Math.min(0.65, t));
    }
  }
  return out;
}

// Eventos que não são duelo, por (plantado, nT, nC):
//   sem bomba: [save do T, tempo acabou (CT), plant]
//   com bomba: [save do CT, explodiu (T), desarmou (CT)]
const EV_STRIDE = 3;
const evIdx = (pl: number, nT: number, nC: number) => ((pl * 6 + nT) * 6 + nC) * EV_STRIDE;

function eventTable(spec: RoundSpec): Float64Array {
  const out = new Float64Array(2 * 6 * 6 * EV_STRIDE);
  const [T, C] = spec.sides;
  for (let nT = 1; nT <= 5; nT++) {
    for (let nC = 1; nC <= 5; nC++) {
      // sem bomba: o T precisa agir
      let tSave = 0;
      if (nT === 1) tSave = nC >= 3 ? 0.2 : nC === 2 ? 0.05 : 0;
      else if (nT === 2) tSave = nC >= 4 ? 0.12 : nC === 3 ? 0.02 : 0;
      // o tempo só vence o T que está em desvantagem e sem conseguir entrar
      const time = nT < nC ? 0.025 : nT === nC ? 0.006 : 0.002;
      const plant = Math.max(0.02, Math.min(0.5, (0.09 + 0.07 * (nT - nC)) * spec.plantMult));
      const o0 = evIdx(0, nT, nC);
      out[o0] = Math.min(0.9, tSave * T.saveMult);
      out[o0 + 1] = time;
      out[o0 + 2] = plant;
      // com bomba: o CT precisa ir
      let cSave = 0;
      if (nC === 1) cSave = nT >= 3 ? 0.35 : nT === 2 ? 0.1 : 0;
      else if (nC === 2) cSave = nT >= 4 ? 0.18 : nT === 3 ? 0.04 : 0;
      const defuse = nC > nT ? 0.07 : nC === nT ? 0.03 : 0.008;
      const explode = nT > nC ? 0.03 : 0.015;
      const o1 = evIdx(1, nT, nC);
      out[o1] = Math.min(0.9, cSave * C.saveMult);
      out[o1 + 1] = explode;
      out[o1 + 2] = defuse;
    }
  }
  return out;
}

const weightsOf = (s: SideSpec, key: number): Float64Array => (key === 8 ? s.wOpen : key >= 4 ? s.wPost : s.wMid);

// ─────────────────────────────────────────────────────────────────────────────
// Probabilidade EXATA de o T vencer o round (programação dinâmica)

export function winProbT(spec: RoundSpec): number {
  const t = tables(spec);
  const memo = new Float64Array(2 * 32 * 32).fill(-1);
  const [T, C] = spec.sides;

  const V = (mT: number, mC: number, pl: number): number => {
    if (mT === 0) return 0;
    if (mC === 0) return 1;
    const mi = (pl * 32 + mT) * 32 + mC;
    const hit = memo[mi];
    if (hit >= 0) return hit;
    const nT = POP[mT], nC = POP[mC];
    const e = evIdx(pl, nT, nC);
    const e0 = t.ev[e], e1 = t.ev[e + 1], e2 = t.ev[e + 2];
    const key = phaseKey(mT, mC, pl);
    const d = duelValue(mT, mC, pl, key);
    let v: number;
    if (!pl) {
      // save do T → CT vence; tempo → CT vence; plant → estado plantado
      const planted = V(mT, mC, 1);
      v = (1 - e0) * (1 - e1) * (e2 * planted + (1 - e2) * d);
    } else {
      // save do CT → T vence; explodiu → T vence; desarmou → CT vence
      v = e0 + (1 - e0) * (e1 + (1 - e1) * (1 - e2) * d);
    }
    memo[mi] = v;
    return v;
  };

  const duelValue = (mT: number, mC: number, pl: number, key: number): number => {
    const p = pTable(t, spec, key, POP[mT] - POP[mC]);
    const wT = weightsOf(T, key), wC = weightsOf(C, key);
    let WT = 0, WC = 0;
    for (let i = 0; i < N; i++) if (mT & (1 << i)) WT += wT[i];
    for (let j = 0; j < N; j++) if (mC & (1 << j)) WC += wC[j];
    let sum = 0;
    for (let i = 0; i < N; i++) {
      if (!(mT & (1 << i))) continue;
      const mTi = mT & ~(1 << i);
      for (let j = 0; j < N; j++) {
        if (!(mC & (1 << j))) continue;
        const mCj = mC & ~(1 << j);
        const pij = p[i * N + j];
        const tc = mCj ? t.tr[1][i * 32 + mCj] : 0;   // CT troca o T que matou
        const tt = mTi ? t.tr[0][j * 32 + mTi] : 0;   // T troca o CT que matou
        const both = tc > 0 || tt > 0 ? V(mTi, mCj, pl) : 0;
        const win = (1 - tc) * V(mT, mCj, pl) + tc * both;
        const lose = (1 - tt) * V(mTi, mC, pl) + tt * both;
        sum += wT[i] * wC[j] * (pij * win + (1 - pij) * lose);
      }
    }
    return sum / (WT * WC);
  };

  return V(FULL, FULL, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Amostragem: joga a MESMA cadeia com o rng

export type RoundEnd = 'elim' | 'save' | 'time' | 'explode' | 'defuse';

export interface DuelRec {
  winSide: 0 | 1; win: number;     // quem venceu o duelo (matou)
  loseSide: 0 | 1; lose: number;   // quem morreu
  trader: number;                  // -1 = sem troca; senão slot do lado perdedor que trocou (matou `win`)
  opening: boolean;                // primeiro abate do round
  planted: boolean;                // aconteceu depois do plant
}

export interface ClutchRec { slot: number; vs: number }

export interface RoundPlay {
  winner: 0 | 1;                   // 0 = T venceu, 1 = CT venceu
  end: RoundEnd;
  duels: DuelRec[];
  planted: boolean;
  planter: number;                 // slot do T que plantou (-1)
  alive: [number, number];         // máscaras de vivos no fim
  clutch: [ClutchRec | null, ClutchRec | null]; // 1ª vez que o lado ficou sozinho (1vX)
}

function pickWeighted(rng: Rng, w: Float64Array, mask: number): number {
  let tot = 0;
  for (let k = 0; k < N; k++) if (mask & (1 << k)) tot += w[k];
  let r = rng() * tot;
  let last = -1;
  for (let k = 0; k < N; k++) {
    if (!(mask & (1 << k))) continue;
    last = k;
    r -= w[k];
    if (r < 0) return k;
  }
  return last;
}

export function playRound(spec: RoundSpec, rng: Rng): RoundPlay {
  const t = tables(spec);
  const [T, C] = spec.sides;
  let mT = FULL, mC = FULL, pl = 0, planter = -1;
  const duels: DuelRec[] = [];
  const clutch: [ClutchRec | null, ClutchRec | null] = [null, null];
  const noteClutch = () => {
    if (!clutch[0] && POP[mT] === 1 && mC) clutch[0] = { slot: 31 - Math.clz32(mT), vs: POP[mC] };
    if (!clutch[1] && POP[mC] === 1 && mT) clutch[1] = { slot: 31 - Math.clz32(mC), vs: POP[mT] };
  };
  const done = (winner: 0 | 1, end: RoundEnd): RoundPlay =>
    ({ winner, end, duels, planted: pl === 1, planter, alive: [mT, mC], clutch });

  for (let guard = 0; guard < 64; guard++) {
    if (mT === 0) return done(1, 'elim');
    if (mC === 0) return done(0, 'elim');
    const nT = POP[mT], nC = POP[mC];
    const e = evIdx(pl, nT, nC);
    if (!pl) {
      if (rng() < t.ev[e]) return done(1, 'save');
      if (rng() < t.ev[e + 1]) return done(1, 'time');
      if (rng() < t.ev[e + 2]) { pl = 1; planter = pickWeighted(rng, T.wPost, mT); continue; }
    } else {
      if (rng() < t.ev[e]) return done(0, 'save');
      if (rng() < t.ev[e + 1]) return done(0, 'explode');
      if (rng() < t.ev[e + 2]) return done(1, 'defuse');
    }
    const key = phaseKey(mT, mC, pl);
    const i = pickWeighted(rng, weightsOf(T, key), mT);
    const j = pickWeighted(rng, weightsOf(C, key), mC);
    const opening = duels.length === 0;
    const p = pTable(t, spec, key, nT - nC)[i * N + j];
    if (rng() < p) {
      // T i mata CT j; o CT pode trocar
      mC &= ~(1 << j);
      let trader = -1;
      if (mC && rng() < t.tr[1][i * 32 + mC]) {
        trader = pickWeighted(rng, C.trade, mC);
        mT &= ~(1 << i);
      }
      duels.push({ winSide: 0, win: i, loseSide: 1, lose: j, trader, opening, planted: pl === 1 });
    } else {
      mT &= ~(1 << i);
      let trader = -1;
      if (mT && rng() < t.tr[0][j * 32 + mT]) {
        trader = pickWeighted(rng, T.trade, mT);
        mC &= ~(1 << j);
      }
      duels.push({ winSide: 1, win: j, loseSide: 0, lose: i, trader, opening, planted: pl === 1 });
    }
    noteClutch();
  }
  // guarda (inalcançável na prática): decide por quem tem mais vivos
  return done(POP[mT] >= POP[mC] ? 0 : 1, 'time');
}
