// [MÍDIA VIVA] Núcleo puro: registra as SUAS séries (confronto direto,
// mata-mata, sequência), detecta as narrativas (clássico, freguês, maldição,
// sequências), monta coletivas contextuais e calcula a repercussão real das
// respostas (moral do elenco e do citado, confiança da diretoria, relação com a
// imprensa). Determinístico: nada de Math.random/Date.
import { hashStr } from '../../state/hash';
import {
  defaultMidia, pruneMidia, MIDIA_REP_DEFAULT,
  type H2H, type KoStage, type MidiaState, type PressConf, type PressFx, type PressKind, type PressQ, type PressTone, type PressTopic, type Rumor, type SeriesEvt,
} from './model';

// ── degraus do mata-mata pelo rótulo da série ──────────────────────────────
export function koStageOf(label: string): KoStage | undefined {
  const l = label.toLowerCase();
  if (/semi|\bsf\d?\b/.test(l)) return 'sf';
  if (/quartas|quarter|cuartos|\bqf\d?\b/.test(l)) return 'qf';
  if (/grande final|grand final|\bgf\b|\bfinal\b/.test(l)) return 'f';
  return undefined;
}
export const isMajorLabel = (label: string): boolean => /major|rmr/i.test(label);

// ── narrativas ─────────────────────────────────────────────────────────────
export type NarrKind = 'fregUs' | 'fregThem' | 'rival' | 'curse' | 'streakW' | 'streakL';
export interface Narrative {
  kind: NarrKind;
  oid?: string;
  o?: string;
  x: number;        // intensidade (sequência, quedas…)
  w?: number;
  l?: number;
  k?: KoStage;
  weight: number;   // ordenação (maior = mais forte)
}
export const CONF_GAP = 3;   // séries entre coletivas
export const FREG_MIN = 3;    // 3 seguidas = freguês
export const CURSE_MIN = 2;   // 2 quedas seguidas no mesmo degrau = maldição
export const RIVAL_MIN = 4;   // escala de rivalries.ts

/** Narrativa do confronto contra UM adversário (a mais forte). */
export function matchupNarrative(m: MidiaState, oid: string, o: string, rivalScore = 0): (Narrative & { kind: 'fregUs' | 'fregThem' | 'rival' }) | null {
  const h = m.h2h?.[oid];
  if (h && h.s >= FREG_MIN) return { kind: 'fregUs', oid, o, x: h.s, w: h.w, l: h.l, weight: 10 + h.s };
  if (h && h.s <= -FREG_MIN) return { kind: 'fregThem', oid, o, x: -h.s, w: h.w, l: h.l, weight: 10 - h.s };
  if (rivalScore >= RIVAL_MIN) return { kind: 'rival', oid, o, x: rivalScore, w: h?.w ?? 0, l: h?.l ?? 0, weight: 6 + rivalScore };
  return null;
}

/** Todas as narrativas vivas da carreira (para a tela e as manchetes). */
export function narrativesOf(m: MidiaState, rivalries: Record<string, number> | undefined, tagOf: (id: string) => string): Narrative[] {
  const out: Narrative[] = [];
  const ids = new Set([...Object.keys(m.h2h ?? {}), ...Object.keys(rivalries ?? {})]);
  for (const id of ids) {
    const n = matchupNarrative(m, id, tagOf(id), rivalries?.[id] ?? 0);
    if (n) out.push(n);
  }
  for (const k of ['qf', 'sf', 'f'] as KoStage[]) {
    const r = m.ko?.[k];
    if (r && r.s <= -CURSE_MIN) out.push({ kind: 'curse', k, x: -r.s, w: r.w, l: r.l, weight: 12 - r.s });
  }
  const st = m.streak ?? 0;
  if (st >= 4) out.push({ kind: 'streakW', x: st, weight: 5 + st });
  if (st <= -3) out.push({ kind: 'streakL', x: -st, weight: 6 - st });
  return out.sort((a, b) => b.weight - a.weight);
}

// ── registro de série ──────────────────────────────────────────────────────
export interface SquadForm { id: string; nick: string; avg?: number }
export interface SeriesInput {
  split: number;
  oid: string;
  o: string;
  label: string;          // rótulo completo (detecta mata-mata/Major)
  shortLabel: string;     // nome do evento
  won: boolean;
  sc: string;             // "2-1" do seu ponto de vista
  upset?: boolean;        // zebra (a favor se won, contra se não)
  mvp?: string;
  onick?: string;
  rivalScore: number;     // rivalries.ts depois da série
  squad: SquadForm[];     // elenco com a média recente de rating
  board: number;
  rumorOnSquad?: { pid: string; nick: string; to: string } | null;
  style?: string;         // [estilo de jogo] rótulo do estilo atual quando não é o padrão
}

export interface SeriesOutput { midia: MidiaState; conf: PressConf | null; breaker?: number }

export function recordSeries(prev: MidiaState | null | undefined, ev: SeriesInput): SeriesOutput {
  const m0 = prev && prev.v === 1 ? prev : defaultMidia();
  const h0: H2H = m0.h2h?.[ev.oid] ?? { w: 0, l: 0, s: 0, last: ev.split };
  const breaker = ev.won && h0.s <= -FREG_MIN ? -h0.s : undefined;
  const h: H2H = {
    w: h0.w + (ev.won ? 1 : 0),
    l: h0.l + (ev.won ? 0 : 1),
    s: ev.won ? Math.max(0, h0.s) + 1 : Math.min(0, h0.s) - 1,
    last: ev.split,
  };
  const k = koStageOf(ev.label);
  const ko = { ...(m0.ko ?? {}) };
  if (k) {
    const r = ko[k] ?? { w: 0, l: 0, s: 0 };
    ko[k] = { w: r.w + (ev.won ? 1 : 0), l: r.l + (ev.won ? 0 : 1), s: ev.won ? Math.max(0, r.s) + 1 : Math.min(0, r.s) - 1 };
  }
  const st0 = m0.streak ?? 0;
  const streak = ev.won ? Math.max(0, st0) + 1 : Math.min(0, st0) - 1;
  const n = (m0.n ?? 0) + 1;
  const evt: SeriesEvt = { split: ev.split, n, oid: ev.oid, o: ev.o, sc: ev.sc, w: ev.won, lbl: ev.shortLabel.slice(0, 40) };
  if (k) evt.k = k;
  if (ev.upset) evt.up = true;
  if (ev.mvp) evt.mvp = ev.mvp;
  if (ev.onick) evt.onick = ev.onick;
  let m: MidiaState = { ...m0, n, h2h: { ...(m0.h2h ?? {}), [ev.oid]: h }, ko, streak, tl: [evt, ...(m0.tl ?? [])] };

  // coletiva: glória (título), crise (3+ derrotas) ou pós-jogo grande
  let conf: PressConf | null = null;
  const big = !!k || isMajorLabel(ev.label) || ev.rivalScore >= RIVAL_MIN || !!ev.upset || Math.abs(h.s) >= FREG_MIN || !!breaker;
  // ritmo: no máximo uma coletiva a cada CONF_GAP séries (a de título sempre sai)
  const rested = n - (m0.cn ?? -99) >= CONF_GAP;
  const kind: PressKind | null = ev.won && k === 'f' ? 'glory' : !rested ? null : streak <= -3 ? 'crisis' : big ? 'post' : null;
  if (kind) {
    conf = buildConference(kind, m, {
      split: ev.split, oid: ev.oid, o: ev.o, label: ev.shortLabel, won: ev.won, sc: ev.sc, k,
      rivalScore: ev.rivalScore, squad: ev.squad, board: ev.board, rumor: ev.rumorOnSquad ?? null, style: ev.style, key: `${kind}:${ev.split}:${n}`,
    });
    // uma coletiva pendente por vez: a nova substitui a antiga (a antiga "passou")
    if (conf) m = { ...m, pend: conf, cn: n };
  }
  return { midia: pruneMidia(m), conf, breaker };
}

// ── coletivas ──────────────────────────────────────────────────────────────
export interface ConfCtx {
  split: number;
  key: string;
  oid?: string;
  o?: string;
  label?: string;
  won?: boolean;
  sc?: string;
  k?: KoStage;
  rivalScore: number;
  squad: SquadForm[];
  board: number;
  rumor: { pid: string; nick: string; to: string } | null;
  style?: string;
}

const BAD_FORM = 0.95;
const HOT_FORM = 1.15;

function worst(squad: SquadForm[]): SquadForm | null {
  const c = squad.filter((p) => p.avg != null && p.avg < BAD_FORM).sort((a, b) => (a.avg ?? 1) - (b.avg ?? 1));
  return c[0] ?? null;
}
function best(squad: SquadForm[]): SquadForm | null {
  const c = squad.filter((p) => p.avg != null && p.avg >= HOT_FORM).sort((a, b) => (b.avg ?? 1) - (a.avg ?? 1));
  return c[0] ?? null;
}

export function buildConference(kind: PressKind, m: MidiaState, c: ConfCtx): PressConf | null {
  if ((m.done ?? []).includes(c.key)) return null;
  const seed = hashStr(c.key);
  const v = (i: number) => (seed >>> (i * 3)) & 7;
  const qs: PressQ[] = [];
  const push = (q: PressQ) => { if (qs.length < 3 && !qs.some((x) => x.t === q.t && x.p === q.p)) qs.push({ ...q, v: v(qs.length) }); };
  const matchup = c.oid && c.o ? matchupNarrative(m, c.oid, c.o, c.rivalScore) : null;
  const ko = c.k ? m.ko?.[c.k] : undefined;
  const curse = c.k && ko && ko.s <= -CURSE_MIN ? ko : null;
  const w = worst(c.squad), b = best(c.squad);

  if (kind === 'glory') {
    push({ t: 'title', v: 0, o: c.o });
    if (b) push({ t: 'star', v: 0, p: b.id, n: b.nick });
    if (matchup) push({ t: matchup.kind, v: 0, o: c.o, x: matchup.x });
    push({ t: 'form', v: 0 });
  } else if (kind === 'crisis') {
    push({ t: 'streak', v: 0, x: -(m.streak ?? 0) });
    if (c.style) push({ t: 'style', v: 0, n: c.style });
    if (w) push({ t: 'player', v: 0, p: w.id, n: w.nick });
    if (c.board < 45) push({ t: 'board', v: 0 });
    if (c.rumor) push({ t: 'rumor', v: 0, p: c.rumor.pid, n: c.rumor.nick, o: c.rumor.to });
    push({ t: 'form', v: 0 });
  } else {
    if (curse && c.k) push({ t: 'curse', v: 0, k: c.k, x: -curse.s });
    if (matchup) push({ t: matchup.kind, v: 0, o: c.o, x: matchup.x });
    if (w) push({ t: 'player', v: 0, p: w.id, n: w.nick });
    else if (b) push({ t: 'star', v: 0, p: b.id, n: b.nick });
    if (c.rumor) push({ t: 'rumor', v: 0, p: c.rumor.pid, n: c.rumor.nick, o: c.rumor.to });
    if (c.board < 40) push({ t: 'board', v: 0 });
    push({ t: 'form', v: 0 });
  }
  if (!qs.length) return null;
  const conf: PressConf = { key: c.key, kind, split: c.split, qs };
  if (c.oid) conf.oid = c.oid;
  if (c.o) conf.o = c.o;
  if (c.label) conf.label = c.label;
  if (c.sc) conf.score = c.sc;
  if (c.won != null && kind !== 'pre') conf.won = c.won;
  return conf;
}

/**
 * Coletiva PRÉ-JOGO (derivada, não fica no save até ser respondida): só para
 * jogo grande — mata-mata, Major, clássico, freguês/tabu ou maldição em jogo.
 */
export function preMatchConference(m: MidiaState, c: Omit<ConfCtx, 'key'> & { matchKey: string }): PressConf | null {
  if (!c.oid || !c.o) return null;
  const key = `pre:${c.split}:${c.matchKey}`;
  if ((m.done ?? []).includes(key) || m.pend) return null;
  if ((m.n ?? 0) - (m.cn ?? -99) < CONF_GAP) return null;
  const matchup = matchupNarrative(m, c.oid, c.o, c.rivalScore);
  const big = !!c.k || isMajorLabel(c.label ?? '') || !!matchup;
  if (!big) return null;
  return buildConference('pre', m, { ...c, key });
}

// ── repercussão ────────────────────────────────────────────────────────────
// [moral do elenco, moral do citado, diretoria, imprensa] por tema × tom.
// Calibrado pequeno: o tom "bom para o vestiário" custa imprensa ou diretoria;
// a soma dos 4 tons é ~0 para o elenco (neutralidade: scripts/measure-midia.mts).
type Fx4 = [number, number, number, number];
export const FX: Record<PressTopic, Record<PressTone, Fx4>> = {
  form:     { calm: [0, 0, 0, 1],  confident: [1, 0, 0, -1], aggressive: [1, 0, -1, -2], deflect: [-1, 0, 0, -2] },
  rival:    { calm: [0, 0, 0, 2],  confident: [1, 0, 0, 0],  aggressive: [1, 0, -1, -3], deflect: [-1, 0, 0, -1] },
  fregUs:   { calm: [0, 0, 0, 2],  confident: [1, 0, 0, 0],  aggressive: [1, 0, -1, -3], deflect: [-1, 0, 0, -1] },
  fregThem: { calm: [0, 0, 0, 1],  confident: [1, 0, -1, 0], aggressive: [1, 0, -1, -2], deflect: [-1, 0, 0, -1] },
  curse:    { calm: [0, 0, 0, 2],  confident: [1, 0, -1, 0], aggressive: [1, 0, 0, -3],  deflect: [-1, 0, 0, -1] },
  player:   { calm: [0, 3, 0, 1],  confident: [0, 4, -1, 0], aggressive: [-1, -5, 1, -1], deflect: [0, -1, 0, -1] },
  star:     { calm: [1, 1, 0, 1],  confident: [-1, 3, 0, 0], aggressive: [0, 2, 1, -2],  deflect: [0, -2, 0, -1] },
  rumor:    { calm: [0, 2, 0, 0],  confident: [1, 3, -1, 0], aggressive: [-1, -5, 1, -1], deflect: [0, -2, 0, -1] },
  board:    { calm: [0, 0, 1, 0],  confident: [0, 0, 1, 0],  aggressive: [1, 0, -3, -1], deflect: [-1, 0, -1, -1] },
  streak:   { calm: [1, 0, 0, 1],  confident: [0, 0, 1, 0],  aggressive: [-2, 0, 2, 0],  deflect: [0, 0, -1, -2] },
  style:    { calm: [0, 0, 0, 1],  confident: [1, 0, -1, 0], aggressive: [-1, 0, 1, -1], deflect: [-1, 0, 0, -1] },
  title:    { calm: [1, 0, 1, 2],  confident: [1, 0, 1, 0],  aggressive: [0, 0, -1, -3], deflect: [-1, 0, 0, -1] },
};
export const FX_CAP = { squad: 2, player: 6, board: 3, rep: 6 };
/** Mandar o assessor: imprensa e diretoria torcem o nariz. */
export const SKIP_FX: PressFx = { squad: 0, players: {}, board: -1, rep: -3 };

const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));

/** Repercussão de uma coletiva respondida (puro). */
export function pressEffects(conf: PressConf, picks: PressTone[]): PressFx {
  let squad = 0, board = 0, rep = 0;
  const players: Record<string, number> = {};
  conf.qs.forEach((q, i) => {
    const tone = picks[i] ?? 'calm';
    const [s, p, b, r] = FX[q.t][tone];
    squad += s; board += b; rep += r;
    if (q.p && p) players[q.p] = clamp((players[q.p] ?? 0) + p, FX_CAP.player);
  });
  return { squad: clamp(squad, FX_CAP.squad), players, board: clamp(board, FX_CAP.board), rep: clamp(rep, FX_CAP.rep) };
}

/** Grava a coletiva respondida (ou dispensada) no bloco da mídia. */
export function commitPress(m: MidiaState, conf: PressConf, picks: PressTone[] | null, fx: PressFx): MidiaState {
  const rep = Math.max(0, Math.min(100, (m.rep ?? MIDIA_REP_DEFAULT) + fx.rep));
  const log = picks ? [{ key: conf.key, kind: conf.kind, split: conf.split, o: conf.o, qs: conf.qs, picks, fx }, ...(m.log ?? [])] : (m.log ?? []);
  return pruneMidia({
    ...m,
    rep,
    log,
    done: [...(m.done ?? []), conf.key],
    cn: Math.max(m.cn ?? -99, m.n ?? 0),
    pend: m.pend?.key === conf.key ? null : m.pend ?? null,
  });
}

/** Acima disto, coletiva não sobe mais a moral (o vestiário já está no alto). */
export const MORALE_SAT = 76;

/** Aplica a moral (elenco + citados) num mapa de moral 0–100. */
export function applyMoraleFx(morale: Record<string, number> | undefined, squadIds: string[], fx: PressFx, def = 70): Record<string, number> {
  const out = { ...(morale ?? {}) };
  for (const id of squadIds) {
    const cur = out[id] ?? def;
    let d = fx.squad + (fx.players[id] ?? 0);
    // retorno decrescente: elogio em coletiva não empilha moral sem fim
    if (d > 0) d = Math.round(d * Math.max(0, Math.min(1, (MORALE_SAT - cur) / 10)));
    if (d) out[id] = Math.max(0, Math.min(100, cur + d));
  }
  return out;
}

// ── rumores ────────────────────────────────────────────────────────────────
export interface RumorCtx {
  split: number;
  seed: string;
  /** propostas reais pelos SEUS jogadores (clube.market.incoming abertas) */
  offers: { pid: string; nick: string; toId: string; to: string }[];
  /** estrelas da cena (jogador + clube) e clubes compradores possíveis */
  stars: { pid: string; nick: string; teamId: string; tag: string }[];
  buyers: { id: string; tag: string }[];
  /** onde cada jogador está agora (resolve os rumores do split passado) */
  teamOf: (pid: string) => string | null;
  userTag: string;
}

/** Na primeira série do split: resolve os rumores antigos e lança os novos. */
export function refreshRumors(m: MidiaState, c: RumorCtx): MidiaState {
  if (m.rumS === c.split) return m;
  const old = (m.rum ?? []).map((r): Rumor => (r.st ? r : { ...r, st: c.teamOf(r.pid) === r.toId ? 'ok' : 'no' }));
  const fresh: Rumor[] = [];
  const h = (s: string) => hashStr(`${c.seed}:rum:${c.split}:${s}`);
  for (const o of c.offers.slice(0, 2)) {
    fresh.push({ id: `r${c.split}u${o.pid}`, pid: o.pid, nick: o.nick, fromId: 'user', from: c.userTag, toId: o.toId, to: o.to, split: c.split, src: h(o.pid) % 6 });
  }
  const want = 3 - Math.min(1, fresh.length);
  const pool = c.stars.slice();
  for (let i = 0; i < want && pool.length && c.buyers.length; i++) {
    const s = pool.splice(h(`s${i}`) % pool.length, 1)[0];
    const buyers = c.buyers.filter((b) => b.id !== s.teamId);
    if (!buyers.length) continue;
    const b = buyers[h(`b${i}`) % buyers.length];
    fresh.push({ id: `r${c.split}a${s.pid}`, pid: s.pid, nick: s.nick, fromId: s.teamId, from: s.tag, toId: b.id, to: b.tag, split: c.split, src: h(`j${i}`) % 6 });
  }
  return { ...m, rumS: c.split, rum: [...fresh, ...old].slice(0, 10) };
}

/** Rumor em aberto sobre um jogador SEU (vira pergunta na coletiva). */
export function openRumorOnSquad(m: MidiaState, squadIds: string[]): { pid: string; nick: string; to: string } | null {
  const r = (m.rum ?? []).find((x) => !x.st && squadIds.includes(x.pid));
  return r ? { pid: r.pid, nick: r.nick, to: r.to } : null;
}
