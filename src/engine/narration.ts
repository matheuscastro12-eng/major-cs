// Narração de momentos-chave da partida. Reconstrói o que rolou no round a partir
// do killFeed (ordem dos abates, arma, headshot) e monta uma frase com cara de
// caster. Detecta jogada (clutch 1vX, ace, multi-kill) e contexto (pistol, eco/
// force, map/match point, virada, embalo). Flair é determinístico (via hashStr),
// então a narração não muda a cada re-render. Idioma vem de getLang().
import type { KillEvent, SeriesResult, TTeam } from '../types';
import type { BuyTier } from './match';
import { getLang, type Lang } from '../state/i18n';
import { hashStr } from '../state/hash';

export type NarrationKind = 'clutch' | 'ace' | 'multi' | 'eco' | 'mappoint' | 'matchpoint' | 'comeback' | 'pistol';

export interface RoundNarration {
  kind: NarrationKind;
  text: string;
  teamIdx: 0 | 1; // time do protagonista (pra colorir como "seu" ou "adversário")
  big: boolean; // destaque maior (clutch/ace/map point/eco)
}

export interface NarrationCtx {
  round: number;
  score: [number, number]; // placar APÓS o round
  roundLog: (0 | 1)[]; // log completo do mapa até aqui (inclui este round)
  buys?: [BuyTier, BuyTier]; // compra do round (capturada antes do step)
  mapWon: boolean; // este round fechou o mapa
  seriesPoint?: boolean; // fechar o mapa fecha a série
}

// fragmentos sempre montados como "... com/with/con {flair}", então cada um é um
// sintagma nominal (sem preposição embutida)
const FLAIR: Record<Lang, Record<string, string[]>> = {
  pt: {
    awp: ['uma AWP limpa', 'um tiro de AWP', 'uma noscope'],
    hs: ['um hs seco', 'um tiro na cabeça', 'um hs de respeito'],
    deagle: ['uma Deagle', 'um tiro de pistola'],
    deagleHs: ['um 1-tap de Deagle', 'um tiro só de Deagle'],
    pistol: ['a pistola na raça', 'uma pistola'],
    spray: ['um spray transado', 'uma troca rápida', 'uma rajada certeira'],
    knife: ['uma facada', 'uma humilhação de faca'],
    style: ['um 360 absurdo', 'um tiro pelas costas', 'um tiro no escuro', 'um flick insano'],
    exclamClutch: ['QUE CLUTCH!', 'INACREDITÁVEL!', 'GUARDOU O ROUND SOZINHO!', 'que frieza!'],
    exclamAce: ['ACE!', 'PEGOU OS CINCO!', 'MASSACRE!'],
    exclamMulti: ['que round!', 'abriu tudo!', 'dominou o round!'],
  },
  en: {
    awp: ['a clean AWP', 'an AWP shot', 'a noscope'],
    hs: ['a crisp hs', 'a headshot', 'a clean one-tap'],
    deagle: ['a Deagle', 'a pistol shot'],
    deagleHs: ['a Deagle one-tap', 'a single Deagle shot'],
    pistol: ['the pistol', 'a pistol'],
    spray: ['a clean spray', 'a quick trade', 'a tight burst'],
    knife: ['a knife', 'a knife humiliation'],
    style: ['an insane 360', 'a backstab', 'a shot in the dark', 'a crazy flick'],
    exclamClutch: ['WHAT A CLUTCH!', 'UNREAL!', 'WON IT ALL ALONE!', 'ice cold!'],
    exclamAce: ['ACE!', 'GOT ALL FIVE!', 'A MASSACRE!'],
    exclamMulti: ['what a round!', 'opened it up!', 'took over the round!'],
  },
  es: {
    awp: ['una AWP limpia', 'un tiro de AWP', 'una noscope'],
    hs: ['un hs seco', 'un tiro a la cabeza', 'un one-tap limpio'],
    deagle: ['una Deagle', 'un tiro de pistola'],
    deagleHs: ['un one-tap de Deagle', 'un solo tiro de Deagle'],
    pistol: ['la pistola', 'una pistola'],
    spray: ['un spray limpio', 'un intercambio rápido', 'una ráfaga certera'],
    knife: ['un cuchillazo', 'una humillación a cuchillo'],
    style: ['un 360 absurdo', 'un tiro por la espalda', 'un tiro a oscuras', 'un flick increíble'],
    exclamClutch: ['¡QUÉ CLUTCH!', '¡INCREÍBLE!', '¡GUARDÓ LA RONDA SOLO!', '¡qué frialdad!'],
    exclamAce: ['¡ACE!', '¡SE LLEVÓ A LOS CINCO!', '¡MASACRE!'],
    exclamMulti: ['¡qué ronda!', '¡lo abrió todo!', '¡dominó la ronda!'],
  },
};

const ORD: Record<Lang, string[]> = {
  pt: ['o primeiro', 'o segundo', 'o terceiro', 'o quarto', 'o quinto'],
  en: ['the first', 'the second', 'the third', 'the fourth', 'the fifth'],
  es: ['el primero', 'el segundo', 'el tercero', 'el cuarto', 'el quinto'],
};

const T = {
  pt: { clutch: (n: string, s: number) => `${n} no 1v${s} e FECHOU`, verb: 'mata', con: 'com', and: 'e', close: 'fecha com', aceLead: (n: string) => `${n} PASSOU POR TODO MUNDO`, multiLead: (n: string, k: number) => `${n} fez ${k} no round` },
  en: { clutch: (n: string, s: number) => `${n} in the 1v${s} and CLOSED IT`, verb: 'takes', con: 'with', and: 'and', close: 'closes with', aceLead: (n: string) => `${n} WENT THROUGH EVERYONE`, multiLead: (n: string, k: number) => `${n} got ${k} in the round` },
  es: { clutch: (n: string, s: number) => `${n} en el 1v${s} y la CERRÓ`, verb: 'mata', con: 'con', and: 'y', close: 'cierra con', aceLead: (n: string) => `${n} PASÓ POR ENCIMA DE TODOS`, multiLead: (n: string, k: number) => `${n} hizo ${k} en la ronda` },
} as const;

// rótulos de contexto (prefixos) e linhas "só contexto" (quando não houve jogada)
const CTX_STR = {
  pt: {
    matchPoint: '🏆 MATCH POINT!', mapPoint: '🏁 MAP POINT!', pistol: '🔫 PISTOL!', eco: '💰 ECO!', force: '💸 FORCE!', comeback: '↩️ VIRADA!',
    streak: (n: number) => `🔥 ${n} seguidos!`,
    ecoLine: (t: string) => `${t} ROUBA o round no eco`, forceLine: (t: string) => `${t} segura no force`,
    pistolLine: (t: string) => `${t} leva o pistol`, mapLine: (t: string) => `${t} FECHA o mapa`, seriesLine: (t: string) => `${t} FECHA a série`, comebackLine: (t: string) => `${t} virou o jogo`,
  },
  en: {
    matchPoint: '🏆 MATCH POINT!', mapPoint: '🏁 MAP POINT!', pistol: '🔫 PISTOL!', eco: '💰 ECO!', force: '💸 FORCE!', comeback: '↩️ COMEBACK!',
    streak: (n: number) => `🔥 ${n} in a row!`,
    ecoLine: (t: string) => `${t} STEALS the round on eco`, forceLine: (t: string) => `${t} holds it on force`,
    pistolLine: (t: string) => `${t} takes the pistol`, mapLine: (t: string) => `${t} CLOSES the map`, seriesLine: (t: string) => `${t} CLOSES the series`, comebackLine: (t: string) => `${t} turned it around`,
  },
  es: {
    matchPoint: '🏆 MATCH POINT!', mapPoint: '🏁 MAP POINT!', pistol: '🔫 PISTOL!', eco: '💰 ECO!', force: '💸 FORCE!', comeback: '↩️ REMONTADA!',
    streak: (n: number) => `🔥 ${n} seguidos!`,
    ecoLine: (t: string) => `${t} ROBA la ronda en eco`, forceLine: (t: string) => `${t} la aguanta en force`,
    pistolLine: (t: string) => `${t} se lleva el pistol`, mapLine: (t: string) => `${t} CIERRA el mapa`, seriesLine: (t: string) => `${t} CIERRA la serie`, comebackLine: (t: string) => `${t} dio la vuelta`,
  },
} as const;

const NEWS = {
  pt: { clutch: (n: string, s: number) => `${n} guardou um clutch 1v${s}`, ace: (n: string) => `${n} cravou um ACE`, multi: (n: string, k: number) => `${n} fez um ${k}K decisivo` },
  en: { clutch: (n: string, s: number) => `${n} pulled off a 1v${s} clutch`, ace: (n: string) => `${n} landed an ACE`, multi: (n: string, k: number) => `${n} got a clutch ${k}K` },
  es: { clutch: (n: string, s: number) => `${n} sacó un clutch 1v${s}`, ace: (n: string) => `${n} clavó un ACE`, multi: (n: string, k: number) => `${n} hizo un ${k}K decisivo` },
} as const;

function flairFor(k: KillEvent, seed: number, lang: Lang): string {
  const pool = FLAIR[lang];
  const pick = (arr: string[]) => arr[seed % arr.length];
  if (seed % 9 === 0) return pick(pool.style); // toque de estilo, raro
  const w = k.weapon.toLowerCase();
  if (w.includes('awp')) return pick(pool.awp);
  if (w === 'deagle') return pick(k.headshot ? pool.deagleHs : pool.deagle);
  if (w === 'knife') return pick(pool.knife);
  if (k.headshot) return pick(pool.hs);
  if (['glock', 'usp', 'p250', 'tec9', 'cz', 'fiveseven', 'pistol'].includes(w)) return pick(pool.pistol);
  return pick(pool.spray);
}

function narrateKills(ks: KillEvent[], round: number, lang: Lang): string {
  const t = T[lang];
  const ord = ORD[lang];
  const shown = ks.slice(0, 4);
  if (shown.length === 0) return '';
  const frag = (k: KillEvent, i: number): string =>
    `${ord[Math.min(i, ord.length - 1)]} ${t.con} ${flairFor(k, hashStr(`${k.killerId}:${round}:${i}`), lang)}`;
  if (shown.length === 1) return `${t.verb} ${frag(shown[0], 0)}`;
  const mids = shown.slice(0, -1).map(frag);
  const last = shown[shown.length - 1];
  const closer = `${t.close} ${flairFor(last, hashStr(`${last.killerId}:${round}:${shown.length - 1}`), lang)}`;
  return `${t.verb} ${mids.join(', ')} ${t.and} ${closer}`;
}

interface Play { kind: 'clutch' | 'ace' | 'multi'; who: string; size: number; kills: KillEvent[]; }

// detecta a jogada de destaque do round a partir dos abates (sem texto)
function scanPlay(kills: KillEvent[], winner: 0 | 1, teams: [TTeam, TTeam]): Play | null {
  if (kills.length === 0) return null;
  const byKiller = new Map<string, KillEvent[]>();
  for (const k of kills) {
    if (!byKiller.has(k.killerId)) byKiller.set(k.killerId, []);
    byKiller.get(k.killerId)!.push(k);
  }
  // clutch: o time vencedor caiu pra 1 e o sobrevivente fechou
  const aliveW = new Set(teams[winner].players.map((p) => p.id));
  const aliveL = new Set(teams[1 - winner].players.map((p) => p.id));
  let survivor: string | null = null;
  let clutchSize = 0;
  for (const k of kills) {
    if (k.victimTeam === winner) aliveW.delete(k.victimId);
    else aliveL.delete(k.victimId);
    if (survivor === null && aliveW.size === 1) {
      survivor = [...aliveW][0];
      clutchSize = aliveL.size;
    }
  }
  if (survivor && clutchSize >= 2) return { kind: 'clutch', who: survivor, size: clutchSize, kills: byKiller.get(survivor) ?? [] };
  // ace / multi: melhor matador do time vencedor
  let topId: string | null = null;
  let topN = 0;
  for (const [id, ks] of byKiller) {
    if (teams[winner].players.some((p) => p.id === id) && ks.length > topN) { topN = ks.length; topId = id; }
  }
  if (topId && topN >= 5) return { kind: 'ace', who: topId, size: topN, kills: byKiller.get(topId)! };
  if (topId && topN >= 3) return { kind: 'multi', who: topId, size: topN, kills: byKiller.get(topId)! };
  return null;
}

function trailingStreak(log: (0 | 1)[], team: 0 | 1): number {
  let n = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i] === team) n++;
    else break;
  }
  return n;
}

// pior déficit que o time enfrentou no mapa (negativo = esteve atrás)
function worstDeficit(log: (0 | 1)[], team: 0 | 1): number {
  let a = 0;
  let b = 0;
  let worst = 0;
  for (const w of log) {
    if (w === 0) a++; else b++;
    worst = Math.min(worst, team === 0 ? a - b : b - a);
  }
  return worst;
}

export function narrateRound(kills: KillEvent[], winner: 0 | 1, teams: [TTeam, TTeam], ctx: NarrationCtx): RoundNarration | null {
  const lang = getLang();
  const c = CTX_STR[lang];
  const nickOf = (id: string): string =>
    teams[0].players.find((p) => p.id === id)?.nick ?? teams[1].players.find((p) => p.id === id)?.nick ?? '?';
  const teamTag = teams[winner].tag;

  // placar ANTES do round (tensão): tira 1 do vencedor
  const before: [number, number] = [...ctx.score];
  before[winner] = Math.max(0, before[winner] - 1);
  const sp = `${before[0]}-${before[1]}`;

  // ---- contexto (prefixos) ----
  const tags: string[] = [];
  if (ctx.mapWon && ctx.seriesPoint) tags.push(c.matchPoint);
  else if (ctx.mapWon) tags.push(c.mapPoint);
  const curDiff = winner === 0 ? ctx.score[0] - ctx.score[1] : ctx.score[1] - ctx.score[0];
  const comeback = worstDeficit(ctx.roundLog, winner) <= -5 && curDiff >= 0;
  const streak = trailingStreak(ctx.roundLog, winner);
  if (comeback) tags.push(c.comeback);
  else if (streak >= 6) tags.push(c.streak(streak));
  const isPistol = ctx.round === 0 || ctx.round === 12;
  if (isPistol) tags.push(c.pistol);
  let ecoKind: 'eco' | 'force' | null = null;
  if (ctx.buys) {
    const wb = ctx.buys[winner];
    const lb = ctx.buys[1 - winner];
    if (lb === 'full' && (wb === 'eco' || wb === 'force')) { ecoKind = wb; tags.push(wb === 'eco' ? c.eco : c.force); }
  }
  const tag = tags.length ? tags[0] + ' ' : ''; // só o contexto de maior prioridade (evita poluir)

  // ---- jogada de destaque ----
  const play = scanPlay(kills, winner, teams);
  if (play) {
    const nick = nickOf(play.who);
    let body: string;
    if (play.kind === 'clutch') {
      const ex = FLAIR[lang].exclamClutch[hashStr(`${play.who}:${ctx.round}:ex`) % FLAIR[lang].exclamClutch.length];
      const tail = play.kills.length ? `. ${narrateKills(play.kills, ctx.round, lang)}` : '';
      body = `${sp}: ${T[lang].clutch(nick, play.size)}${tail}. ${ex}`;
    } else if (play.kind === 'ace') {
      const ex = FLAIR[lang].exclamAce[hashStr(`${play.who}:${ctx.round}`) % FLAIR[lang].exclamAce.length];
      body = `${sp}: ${T[lang].aceLead(nick)}. ${narrateKills(play.kills, ctx.round, lang)}. ${ex}`;
    } else {
      const ex = FLAIR[lang].exclamMulti[hashStr(`${play.who}:${ctx.round}`) % FLAIR[lang].exclamMulti.length];
      body = `${sp}: ${T[lang].multiLead(nick, play.size)}. ${narrateKills(play.kills.slice(0, 3), ctx.round, lang)}. ${ex}`;
    }
    const big = play.kind !== 'multi' || ctx.mapWon || !!ecoKind;
    return { kind: play.kind, text: `${tag}${body}`.trim(), teamIdx: winner, big };
  }

  // ---- sem jogada: narra só se o contexto for forte ----
  if (ecoKind) return { kind: 'eco', text: `${tag}${sp}: ${ecoKind === 'eco' ? c.ecoLine(teamTag) : c.forceLine(teamTag)}`, teamIdx: winner, big: true };
  if (ctx.mapWon) return { kind: ctx.seriesPoint ? 'matchpoint' : 'mappoint', text: `${tag}${ctx.seriesPoint ? c.seriesLine(teamTag) : c.mapLine(teamTag)}`, teamIdx: winner, big: true };
  if (comeback) return { kind: 'comeback', text: `${tag}${sp}: ${c.comebackLine(teamTag)}`, teamIdx: winner, big: true };
  if (isPistol) return { kind: 'pistol', text: `${tag}${c.pistolLine(teamTag)}`, teamIdx: winner, big: false };
  return null;
}

// melhor lance de um jogador DO time do usuário em toda a série (pro feed do carreira)
export function bestSeriesMoment(series: SeriesResult, teams: [TTeam, TTeam], userIdx: 0 | 1): { nick: string; text: string } | null {
  let best: { rank: number; play: Play } | null = null;
  for (const map of series.maps) {
    const byRound = new Map<number, KillEvent[]>();
    for (const k of map.killFeed) {
      if (!byRound.has(k.round)) byRound.set(k.round, []);
      byRound.get(k.round)!.push(k);
    }
    for (const [round, ks] of byRound) {
      const winner = map.roundLog[round];
      if (winner === undefined) continue;
      const p = scanPlay(ks, winner, teams);
      if (!p) continue;
      if (!teams[userIdx].players.some((pl) => pl.id === p.who)) continue;
      const rank = p.kind === 'clutch' ? 100 + p.size : p.kind === 'ace' ? 95 : 80 + p.size;
      if (!best || rank > best.rank) best = { rank, play: p };
    }
  }
  // só vira manchete se for notável de verdade: clutch, ace ou 4k+
  if (!best || (best.play.kind === 'multi' && best.play.size < 4)) return null;
  const lang = getLang();
  const nick = teams[userIdx].players.find((pl) => pl.id === best!.play.who)?.nick ?? '?';
  const n = NEWS[lang];
  const text = best.play.kind === 'clutch' ? n.clutch(nick, best.play.size) : best.play.kind === 'ace' ? n.ace(nick) : n.multi(nick, best.play.size);
  return { nick, text };
}
