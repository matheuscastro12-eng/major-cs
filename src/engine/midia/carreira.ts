// [MÍDIA VIVA] Ponte com a Carreira: o CareerScreen chama UMA função no fim de
// cada série sua (`midiaAfterSeries`) e UMA ao responder a coletiva
// (`answerPress`). Tudo o mais (feed, trending, narrativas) é derivado na tela.
import { applyBoardDelta, type BoardLogEntry } from '../career/boardApproval';
import { hashStr } from '../../state/hash';
import { defaultMidia, MIDIA_REP_DEFAULT, type MidiaLang, type MidiaState, type PressConf, type PressFx, type PressTone } from './model';
import {
  applyMoraleFx, commitPress, matchupNarrative, openRumorOnSquad, pressEffects, recordSeries, refreshRumors, SKIP_FX, CURSE_MIN, FREG_MIN,
  type SquadForm,
} from './midia';
import { narrativeHeadline } from './feed';
import { KIND_TITLE, NARR, STAGE_NAME, fill, one, tr } from './texto';

export interface MidiaNews { id: string; icon: string; tone: 'good' | 'bad' | 'info'; cat: 'scene' | 'board' | 'social'; title: string; body: string }

export interface WorldTeamLite { id: string; tag: string; players: { id: string; nick: string; ovr: number }[] }

export interface MidiaSeriesArgs {
  lang: MidiaLang;
  seed: string;
  split: number;
  tag: string;
  opp: { id: string; tag: string; nicks: string[] };
  label: string;
  shortLabel: string;
  won: boolean;
  sc: string;
  upset: boolean;
  mvp?: string;
  rivalScore: number;
  squad: SquadForm[];
  board: number;
  offers: { pid: string; nick: string; toId: string; to: string }[];
  world: () => WorldTeamLite[];
  teamOf: (pid: string) => string | null;
}

const N_PRESS = one('Coletiva marcada', 'Press conference scheduled', 'Rueda de prensa convocada');
const N_PRESS_BODY = one(
  'A imprensa quer ouvir você. Responda na Sala de imprensa (Mídia): o tom mexe com o vestiário, a diretoria e a sua imagem.',
  'The press wants to hear from you. Answer in the Press room (Media): your tone moves the locker room, the board and your image.',
  'La prensa quiere escucharte. Responde en la Sala de prensa (Medios): el tono mueve el vestuario, la directiva y tu imagen.',
);
const N_NARR_BODY = one('A cena já fala disso. Veja as narrativas na aba Mídia.', 'The scene is talking about it. See the storylines in the Media tab.', 'La escena ya habla de ello. Mira las narrativas en Medios.');

export function midiaAfterSeries(prev: MidiaState | null | undefined, a: MidiaSeriesArgs): { midia: MidiaState; news: MidiaNews[] } {
  let m0 = prev && prev.v === 1 ? prev : defaultMidia();
  // rumores do split (na primeira série): resolve os antigos, lança os novos
  if (m0.rumS !== a.split) {
    const world = a.world();
    const stars = world
      .flatMap((t) => t.players.map((p) => ({ pid: p.id, nick: p.nick, teamId: t.id, tag: t.tag, ovr: p.ovr })))
      .sort((x, y) => y.ovr - x.ovr)
      .slice(0, 30);
    const buyers = world.slice(0, 24).map((t) => ({ id: t.id, tag: t.tag }));
    m0 = refreshRumors(m0, { split: a.split, seed: a.seed, offers: a.offers, stars, buyers, teamOf: a.teamOf, userTag: a.tag });
  }
  const rumor = openRumorOnSquad(m0, a.squad.map((s) => s.id));
  const onick = a.opp.nicks.length ? a.opp.nicks[hashStr(`${a.seed}:${a.split}:${a.opp.id}:${m0.n ?? 0}`) % a.opp.nicks.length] : undefined;
  const before = m0;
  const out = recordSeries(m0, {
    split: a.split, oid: a.opp.id, o: a.opp.tag, label: a.label, shortLabel: a.shortLabel, won: a.won, sc: a.sc, upset: a.upset,
    mvp: a.mvp, onick, rivalScore: a.rivalScore, squad: a.squad, board: a.board, rumorOnSquad: rumor,
  });
  const news: MidiaNews[] = [];
  const L = a.lang;
  const nid = (k: string) => `${a.split}:midia:${k}:${out.midia.n}`;
  // narrativas que NASCEM nesta série viram manchete
  const hb = before.h2h?.[a.opp.id]?.s ?? 0, ha = out.midia.h2h?.[a.opp.id]?.s ?? 0;
  if (Math.abs(ha) === FREG_MIN && Math.abs(hb) < FREG_MIN) {
    const n = matchupNarrative(out.midia, a.opp.id, a.opp.tag, 0);
    if (n) news.push({ id: nid('freg'), icon: ha > 0 ? '🧾' : '🪨', tone: ha > 0 ? 'good' : 'bad', cat: 'scene', title: narrativeHeadline(L, n, a.tag), body: tr(L, N_NARR_BODY) });
  }
  if (out.breaker) news.push({ id: nid('breaker'), icon: '🔓', tone: 'good', cat: 'scene', title: fill(L, NARR.breaker, 0, { tag: a.tag, o: a.opp.tag, x: out.breaker }), body: tr(L, N_NARR_BODY) });
  for (const k of ['qf', 'sf', 'f'] as const) {
    const sb = before.ko?.[k]?.s ?? 0, sa = out.midia.ko?.[k]?.s ?? 0;
    if (sa === -CURSE_MIN && sb > -CURSE_MIN) news.push({ id: nid(`curse${k}`), icon: '🕯️', tone: 'bad', cat: 'scene', title: fill(L, NARR.curse, 0, { x: -sa, stage: tr(L, STAGE_NAME[k]) }), body: tr(L, N_NARR_BODY) });
  }
  const st = out.midia.streak ?? 0;
  if (st === 4) news.push({ id: nid('sw'), icon: '📈', tone: 'good', cat: 'scene', title: fill(L, NARR.streakW, 0, { tag: a.tag, x: st }), body: tr(L, N_NARR_BODY) });
  if (st === -3) news.push({ id: nid('sl'), icon: '📉', tone: 'bad', cat: 'scene', title: fill(L, NARR.streakL, 0, { tag: a.tag, x: -st }), body: tr(L, N_NARR_BODY) });
  if (out.conf) news.push({ id: nid('press'), icon: '🎙️', tone: 'info', cat: 'board', title: `${tr(L, N_PRESS)}: ${tr(L, KIND_TITLE[out.conf.kind])}`, body: tr(L, N_PRESS_BODY) });
  return { midia: out.midia, news };
}

export interface PressSaveSlice {
  midia?: MidiaState | null;
  morale?: Record<string, number>;
  board: number;
  boardLog?: BoardLogEntry[];
  split: number;
}

/** Responde (picks) ou dispensa (null) a coletiva: devolve o patch do save. */
export function answerPress(
  s: PressSaveSlice,
  conf: PressConf,
  picks: PressTone[] | null,
  squadIds: string[],
  reason: string,
  moraleDefault = 70,
): { patch: { midia: MidiaState; morale: Record<string, number>; board: number; boardLog: BoardLogEntry[] }; fx: PressFx } {
  const m = s.midia && s.midia.v === 1 ? s.midia : defaultMidia();
  const fx = picks ? pressEffects(conf, picks) : SKIP_FX;
  // relação ruim com a imprensa pesa um pouco mais na diretoria
  const repNow = m.rep ?? MIDIA_REP_DEFAULT;
  const boardDelta = fx.board + (picks && repNow + fx.rep <= 20 ? -1 : 0);
  const bd = boardDelta ? applyBoardDelta(s.board, s.boardLog, s.split, boardDelta, reason) : { board: s.board, boardLog: s.boardLog ?? [] };
  return {
    patch: {
      midia: commitPress(m, conf, picks, { ...fx, board: boardDelta }),
      morale: applyMoraleFx(s.morale, squadIds, fx, moraleDefault),
      board: bd.board,
      boardLog: bd.boardLog,
    },
    fx: { ...fx, board: boardDelta },
  };
}
