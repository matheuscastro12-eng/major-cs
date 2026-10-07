// [MÍDIA VIVA] Feed social da cena (estilo X/HLTV) DERIVADO: nada daqui vai
// para o save. Sai do bloco da mídia (suas séries, coletivas, rumores) e do
// mundo (resultados em segundo plano da fase 4, transferências da IA), com
// templates e variação por seed do save — mesma carreira, mesmo feed.
import { hashStr } from '../../state/hash';
import type { MidiaLang, MidiaState, PressLog, Rumor, SeriesEvt } from './model';
import { narrativesOf, type Narrative } from './midia';
import { ANSWER, F, NARR, QUESTION, STAGE_NAME, TOPIC_NAME, fill, tr, type Tri } from './texto';

export type AuthorKind = 'journo' | 'insider' | 'stats' | 'fan' | 'rival' | 'player' | 'club';
export interface Author { name: string; handle: string; kind: AuthorKind; verified?: boolean; tag?: string }
export type FeedScope = 'you' | 'world' | 'market';
export interface FeedPost {
  id: string;
  a: Author;
  text: string;
  split: number;
  ord: number;
  likes: number;
  rts: number;
  reps: number;
  tags: string[];
  scope: FeedScope;
  tone?: 'good' | 'bad' | 'info';
  card?: { home: string; away: string; sc: string; lbl: string; won: boolean };
  quote?: { q: string; a: string };
  rumor?: { st?: 'ok' | 'no'; cred: number };
  thread?: FeedPost[];
}
export interface Trend { tag: string; posts: number; heat: number }

/** Jornalistas fictícios (credibilidade = chance histórica de acertar). */
export const JOURNALISTS: (Author & { cred: number })[] = [
  { name: 'Rafa Lacerda', handle: 'rafalacerda', kind: 'journo', verified: true, cred: 70 },
  { name: 'Mikkel Strand', handle: 'strand_cs', kind: 'journo', verified: true, cred: 82 },
  { name: 'Lucía Ferrer', handle: 'luciaferrer_gg', kind: 'journo', verified: true, cred: 75 },
  { name: 'Tom Hale', handle: 'halesources', kind: 'insider', verified: true, cred: 64 },
  { name: 'Dmitri Volkov', handle: 'volkov_insider', kind: 'insider', verified: true, cred: 88 },
  { name: 'Ana Ribeiro', handle: 'anaribeiro_cs', kind: 'journo', verified: true, cred: 59 },
];
const STATS: Author = { name: 'Scene Numbers', handle: 'scenenumbers', kind: 'stats', verified: true };
const FAN_HANDLES = ['clutchmaster', 'ecoround', 'awpdaily', 'smokecriminal', 'nadeking', 'flashbangz', 'headsonly', 'rushbnoob', 'defusekit', 'tradekill', 'midcontrol', 'savefor3'];

export interface WorldResultLite {
  eventId: string;
  split: number;
  name?: string;
  tier?: number;
  kind?: string;
  placements: { teamId: string; place: number }[];
}
export interface FeedInput {
  lang: MidiaLang;
  seed: string;
  split: number;
  org: { name: string; tag: string };
  m: MidiaState;
  rivalries?: Record<string, number>;
  results: WorldResultLite[];
  tagOf: (teamId: string) => string;
  /** um jogador (nick) do time — para o post do campeão */
  playerOf?: (teamId: string, salt: string) => string | undefined;
  lastMoves: { nick: string; from: string; to: string }[];
  limit?: number;
}

const tagify = (s: string): string => `#${s.replace(/[^A-Za-z0-9À-ÿ]/g, '')}`;
const cut = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildFeed(inp: FeedInput): FeedPost[] {
  const { lang, m, org } = inp;
  const tag = org.tag || 'ORG';
  const H = (s: string) => hashStr(`${inp.seed}:feed:${s}`);
  const engage = (s: string, base: number) => {
    const h = H(s);
    const likes = Math.round(base * (0.6 + (h % 1000) / 1000));
    return { likes, rts: Math.round(likes * (0.08 + ((h >>> 10) % 100) / 900)), reps: Math.round(likes * (0.03 + ((h >>> 17) % 100) / 2500)) };
  };
  const fan = (s: string): Author => ({ name: FAN_HANDLES[H(s) % FAN_HANDLES.length], handle: FAN_HANDLES[H(s) % FAN_HANDLES.length] + (H(`${s}n`) % 90 + 10), kind: 'fan' });
  const clubFans: Author = { name: `${tag} Fans`, handle: `${tag.toLowerCase()}_fans`, kind: 'fan', tag };
  const repBoost = 0.7 + (m.rep ?? 50) / 100 * 0.6;
  const posts: FeedPost[] = [];

  // ── suas séries ──
  (m.tl ?? []).forEach((e: SeriesEvt, i) => {
    const ord = e.split * 10000 + (e.n % 1000) * 8;
    const big = e.k === 'f' ? 3 : e.k ? 2 : 1;
    const jIdx = H(`j${e.n}`) % JOURNALISTS.length;
    const j = JOURNALISTS[jIdx];
    const tpl: Tri = e.up ? (e.w ? F.upsetWin : F.upsetLoss) : e.w ? F.win : F.loss;
    const vars = { tag, o: e.o, sc: e.sc, ev: e.lbl, mvp: e.mvp ?? tag };
    const rival = (inp.rivalries?.[e.oid] ?? 0) >= 4 || Math.abs(m.h2h?.[e.oid]?.s ?? 0) >= 3;
    const thread: FeedPost[] = [];
    const nRep = i < 4 ? 3 : 2;
    for (let r = 0; r < nRep; r++) {
      const isRival = rival && r === nRep - 1;
      const a: Author = isRival ? { name: `${e.o} Army`, handle: `${e.o.toLowerCase()}army`, kind: 'rival', tag: e.o } : fan(`f${e.n}:${r}`);
      const t = isRival ? (e.w ? F.rivalFanWin : F.rivalFanLoss) : (e.w ? F.fanWin : F.fanLoss);
      thread.push({ id: `s${e.n}r${r}`, a, text: fill(lang, t, H(`fr${e.n}:${r}`), vars), split: e.split, ord: ord - r - 1, ...engage(`fr${e.n}${r}`, 40 * big), tags: [], scope: 'you' });
    }
    posts.push({
      id: `s${e.n}`, a: j, text: fill(lang, tpl, H(`t${e.n}`), vars), split: e.split, ord,
      ...engage(`s${e.n}`, 900 * big * repBoost), tags: [tagify(`${tag}vs${e.o}`), tagify(e.lbl)], scope: 'you',
      tone: e.w ? 'good' : 'bad', card: { home: tag, away: e.o, sc: e.sc, lbl: e.lbl, won: e.w }, thread,
    });
    if (e.w && e.mvp && i < 6) {
      posts.push({ id: `s${e.n}mvp`, a: { name: e.mvp, handle: e.mvp.toLowerCase().replace(/[^a-z0-9_]/g, ''), kind: 'player', verified: true, tag }, text: fill(lang, F.mvpPost, H(`m${e.n}`)), split: e.split, ord: ord + 3, ...engage(`mvp${e.n}`, 2200 * big), tags: [], scope: 'you', tone: 'good' });
    }
    if (e.w && e.onick && i < 6 && H(`gg${e.n}`) % 2 === 0) {
      posts.push({ id: `s${e.n}gg`, a: { name: e.onick, handle: e.onick.toLowerCase().replace(/[^a-z0-9_]/g, ''), kind: 'player', verified: true, tag: e.o }, text: fill(lang, F.oppGg, H(`g${e.n}`), vars), split: e.split, ord: ord + 2, ...engage(`gg${e.n}`, 1200), tags: [], scope: 'you' });
    }
    if (!e.w && i === 0 && (m.streak ?? 0) <= -2) {
      posts.push({ id: `s${e.n}fan`, a: clubFans, text: fill(lang, F.fanLoss, H(`cf${e.n}`), vars), split: e.split, ord: ord + 1, ...engage(`cf${e.n}`, 500), tags: [tagify(`${tag}Out`)], scope: 'you', tone: 'bad' });
    }
  });

  // ── coletivas respondidas: a frase vira manchete; o citado reage ──
  (m.log ?? []).forEach((l: PressLog, i) => {
    const base = (m.tl ?? []).find((e) => e.split === l.split)?.n ?? 0;
    const ord = l.split * 10000 + (base % 1000) * 8 + 5 - i * 0.01;
    const qi = l.qs.findIndex((q) => q.p) >= 0 ? l.qs.findIndex((q) => q.p) : 0;
    const q = l.qs[qi];
    const tone = l.picks[qi] ?? 'calm';
    const vars = { o: q.o ?? l.o ?? '', n: q.n ?? '', x: q.x ?? '', stage: q.k ? tr(lang, STAGE_NAME[q.k]) : '', ev: l.o ?? '' };
    const answer = fill(lang, ANSWER[q.t][tone], 0, vars);
    const question = fill(lang, QUESTION[q.t], q.v, vars);
    const j = JOURNALISTS[H(`pj${l.key}`) % JOURNALISTS.length];
    const thread: FeedPost[] = [];
    const d = q.p ? l.fx.players[q.p] ?? 0 : 0;
    if (q.p && q.n && d !== 0) {
      thread.push({
        id: `p${l.key}pl`, a: { name: q.n, handle: q.n.toLowerCase().replace(/[^a-z0-9_]/g, ''), kind: 'player', verified: true, tag },
        text: fill(lang, d > 0 ? F.playerHappy : F.playerUpset, H(`pr${l.key}`)), split: l.split, ord: ord - 1, ...engage(`pr${l.key}`, 1500), tags: [], scope: 'you', tone: d > 0 ? 'good' : 'bad',
      });
    }
    thread.push({ id: `p${l.key}f`, a: fan(`pf${l.key}`), text: fill(lang, tone === 'aggressive' ? F.fanWin : tone === 'deflect' ? F.fanLoss : F.fanWin, H(`pff${l.key}`), { tag, mvp: q.n ?? tag }), split: l.split, ord: ord - 2, ...engage(`pf${l.key}`, 60), tags: [], scope: 'you' });
    posts.push({
      id: `p${l.key}`, a: j, text: fill(lang, F.pressQuote, H(`pq${l.key}`), { tag, q: answer, topic: tr(lang, TOPIC_NAME[q.t]) }), split: l.split, ord,
      ...engage(`p${l.key}`, (tone === 'aggressive' ? 2400 : 900) * repBoost), tags: [tagify(`${tag}Coletiva`)], scope: 'you', quote: { q: question, a: answer }, thread,
      tone: tone === 'aggressive' ? 'bad' : 'info',
    });
  });

  // ── reputação com a imprensa ──
  const rep = m.rep ?? 50;
  if ((m.log ?? []).length >= 2 && (rep >= 70 || rep <= 30)) {
    const j = JOURNALISTS[H('rep') % JOURNALISTS.length];
    posts.push({ id: `rep${inp.split}`, a: j, text: tr(lang, rep >= 70 ? F.repHigh : F.repLow, { tag }), split: inp.split, ord: inp.split * 10000 + 4, ...engage('rep', 400), tags: [], scope: 'you', tone: rep >= 70 ? 'good' : 'bad' });
  }

  // ── narrativas (conta de estatísticas) ──
  const narr = narrativesOf(m, inp.rivalries, (id) => m.tl?.find((e) => e.oid === id)?.o ?? inp.tagOf(id)).slice(0, 3);
  narr.forEach((n: Narrative, i) => {
    posts.push({
      id: `n${n.kind}${n.oid ?? n.k ?? ''}`, a: STATS, text: narrativeHeadline(lang, n, tag, H(`nv${i}`)), split: inp.split, ord: inp.split * 10000 + 9900 - i,
      ...engage(`n${n.kind}${n.oid ?? ''}`, 700), tags: n.o ? [tagify(`${tag}vs${n.o}`)] : [], scope: 'you', tone: n.kind === 'fregUs' || n.kind === 'streakW' ? 'good' : n.kind === 'rival' ? 'info' : 'bad',
    });
  });

  // ── mundo em segundo plano: campeões dos eventos (tier 1–2 e Major) ──
  const results = inp.results.filter((r) => r.split >= inp.split - 1 && (r.tier ?? 3) <= 2 && r.placements.length >= 2).slice(-8);
  results.forEach((r, i) => {
    const w = r.placements.find((p) => p.place === 1), ru = r.placements.find((p) => p.place === 2);
    if (!w || !ru) return;
    const wt = w.teamId === 'user' ? tag : inp.tagOf(w.teamId), rt = ru.teamId === 'user' ? tag : inp.tagOf(ru.teamId);
    const ev = r.name ?? r.eventId;
    const major = r.kind === 'major' || /major/i.test(ev);
    const ord = r.split * 10000 + 3000 + i * 40;
    const j = JOURNALISTS[H(`cj${r.eventId}`) % JOURNALISTS.length];
    const thread: FeedPost[] = [];
    const nick = w.teamId !== 'user' ? inp.playerOf?.(w.teamId, r.eventId) : undefined;
    if (nick) thread.push({ id: `c${r.eventId}p`, a: { name: nick, handle: nick.toLowerCase().replace(/[^a-z0-9_]/g, ''), kind: 'player', verified: true, tag: wt }, text: fill(lang, F.champPlayer, H(`cp${r.eventId}`)), split: r.split, ord: ord - 1, ...engage(`cp${r.eventId}`, 4000), tags: [], scope: 'world', tone: 'good' });
    thread.push({ id: `c${r.eventId}f`, a: fan(`cf${r.eventId}`), text: fill(lang, F.fanWin, H(`cff${r.eventId}`), { tag: wt, mvp: nick ?? wt }), split: r.split, ord: ord - 2, ...engage(`cf${r.eventId}`, 90), tags: [], scope: 'world' });
    posts.push({
      id: `c${r.eventId}`, a: j, text: fill(lang, F.champ, H(`c${r.eventId}`), { w: wt, r: rt, ev }), split: r.split, ord,
      ...engage(`c${r.eventId}`, major ? 9000 : 2500), tags: [tagify(cut(ev, 24)), tagify(`${wt}Champions`)], scope: 'world', tone: w.teamId === 'user' ? 'good' : 'info', thread,
    });
  });

  // ── mercado: oficiais da janela + rumores do insider ──
  inp.lastMoves.slice(0, 6).forEach((mv, i) => {
    posts.push({
      id: `t${inp.split}:${mv.nick}`, a: { name: mv.to, handle: mv.to.toLowerCase().replace(/[^a-z0-9_]/g, ''), kind: 'club', verified: true, tag: mv.to },
      text: fill(lang, F.transfer, H(`tr${mv.nick}`), { n: mv.nick, to: mv.to, from: mv.from }), split: inp.split, ord: inp.split * 10000 + 1000 - i,
      ...engage(`tr${mv.nick}`, 1800), tags: [tagify(mv.nick)], scope: 'market', tone: 'info',
    });
  });
  (m.rum ?? []).forEach((r: Rumor, i) => {
    const j = JOURNALISTS[r.src % JOURNALISTS.length];
    const vars = { n: r.nick, to: r.to, from: r.from };
    const ord = r.split * 10000 + 2000 - i;
    const thread: FeedPost[] = [];
    if (r.st) thread.push({ id: `${r.id}u`, a: j, text: fill(lang, r.st === 'ok' ? F.rumorOk : F.rumorNo, H(`ru${r.id}`), vars), split: r.split + 1, ord: ord - 1, ...engage(`ru${r.id}`, 600), tags: [], scope: 'market', tone: r.st === 'ok' ? 'good' : 'info' });
    posts.push({
      id: r.id, a: j, text: fill(lang, F.rumor, H(`r${r.id}`), vars), split: r.split, ord,
      ...engage(r.id, r.fromId === 'user' ? 1600 : 1100), tags: [tagify(r.nick), '#RumorMill'], scope: 'market', rumor: { st: r.st, cred: JOURNALISTS[r.src % JOURNALISTS.length].cred }, thread,
    });
  });

  return posts.sort((a, b) => b.ord - a.ord).slice(0, inp.limit ?? 40);
}

export function narrativeHeadline(lang: MidiaLang, n: Narrative, tag: string, v = 0): string {
  const vars = { tag, o: n.o ?? '', x: n.x, w: n.w ?? 0, l: n.l ?? 0, stage: n.k ? tr(lang, STAGE_NAME[n.k]) : '' };
  return fill(lang, NARR[n.kind], v, vars);
}

/** Trending: hashtags pesadas por curtidas (posts + respostas). */
export function trendingOf(posts: FeedPost[], top = 6): Trend[] {
  const acc = new Map<string, Trend>();
  const add = (p: FeedPost) => {
    for (const t of p.tags) {
      const cur = acc.get(t) ?? { tag: t, posts: 0, heat: 0 };
      cur.posts += 1 + p.reps; cur.heat += p.likes + p.rts * 3;
      acc.set(t, cur);
    }
  };
  for (const p of posts) { add(p); for (const r of p.thread ?? []) add(r); }
  return [...acc.values()].sort((a, b) => b.heat - a.heat).slice(0, top);
}
