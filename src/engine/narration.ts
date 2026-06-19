// Narração de momentos-chave da partida. Reconstrói o round a partir do killFeed
// (ordem, arma, headshot) e monta uma fala de caster: jogada (clutch 1vX, ace,
// multi), contexto (pistol, eco/force, map/match point, virada, embalo, flawless),
// callouts de mapa e, nos momentos grandes, BEATS pra UI revelar em etapas (a
// "parada da tensão"). Flair determinístico (hashStr). Idioma via getLang().
import type { KillEvent, MapId, SeriesResult, TTeam } from '../types';
import type { BuyTier } from './match';
import { getLang, type Lang } from '../state/i18n';
import { hashStr } from '../state/hash';

export type NarrationKind = 'clutch' | 'ace' | 'multi' | 'eco' | 'mappoint' | 'matchpoint' | 'comeback' | 'pistol';

export interface RoundNarration {
  kind: NarrationKind;
  text: string; // fala completa (replay/news, sem animação)
  beats?: string[]; // pedaços pra revelar em etapas (suspense); ausente = uma fala só
  teamIdx: 0 | 1;
  big: boolean;
}

export interface NarrationCtx {
  round: number;
  score: [number, number];
  roundLog: (0 | 1)[];
  buys?: [BuyTier, BuyTier];
  map?: MapId;
  mapWon: boolean;
  seriesPoint?: boolean;
}

const FLAIR: Record<Lang, Record<string, string[]>> = {
  pt: {
    awp: ['uma AWP limpa', 'um tiro de AWP', 'uma noscope'], hs: ['um hs seco', 'um tiro na cabeça', 'um hs de respeito'],
    deagle: ['uma Deagle', 'um tiro de pistola'], deagleHs: ['um 1-tap de Deagle', 'um tiro só de Deagle'],
    pistol: ['a pistola na raça', 'uma pistola'], spray: ['um spray transado', 'uma troca rápida', 'uma rajada certeira'],
    knife: ['uma facada', 'uma humilhação de faca'], style: ['um 360 absurdo', 'um tiro pelas costas', 'um tiro no escuro', 'um flick insano'],
    exclamClutch: ['QUE CLUTCH!', 'INACREDITÁVEL!', 'GUARDOU O ROUND SOZINHO!', 'que frieza!'], exclamAce: ['ACE!', 'PEGOU OS CINCO!', 'MASSACRE!'], exclamMulti: ['que round!', 'abriu tudo!', 'dominou o round!'],
  },
  en: {
    awp: ['a clean AWP', 'an AWP shot', 'a noscope'], hs: ['a crisp hs', 'a headshot', 'a clean one-tap'],
    deagle: ['a Deagle', 'a pistol shot'], deagleHs: ['a Deagle one-tap', 'a single Deagle shot'],
    pistol: ['the pistol', 'a pistol'], spray: ['a clean spray', 'a quick trade', 'a tight burst'],
    knife: ['a knife', 'a knife humiliation'], style: ['an insane 360', 'a backstab', 'a shot in the dark', 'a crazy flick'],
    exclamClutch: ['WHAT A CLUTCH!', 'UNREAL!', 'WON IT ALL ALONE!', 'ice cold!'], exclamAce: ['ACE!', 'GOT ALL FIVE!', 'A MASSACRE!'], exclamMulti: ['what a round!', 'opened it up!', 'took over the round!'],
  },
  es: {
    awp: ['una AWP limpia', 'un tiro de AWP', 'una noscope'], hs: ['un hs seco', 'un tiro a la cabeza', 'un one-tap limpio'],
    deagle: ['una Deagle', 'un tiro de pistola'], deagleHs: ['un one-tap de Deagle', 'un solo tiro de Deagle'],
    pistol: ['la pistola', 'una pistola'], spray: ['un spray limpio', 'un intercambio rápido', 'una ráfaga certera'],
    knife: ['un cuchillazo', 'una humillación a cuchillo'], style: ['un 360 absurdo', 'un tiro por la espalda', 'un tiro a oscuras', 'un flick increíble'],
    exclamClutch: ['¡QUÉ CLUTCH!', '¡INCREÍBLE!', '¡GUARDÓ LA RONDA SOLO!', '¡qué frialdad!'], exclamAce: ['¡ACE!', '¡SE LLEVÓ A LOS CINCO!', '¡MASACRE!'], exclamMulti: ['¡qué ronda!', '¡lo abrió todo!', '¡dominó la ronda!'],
  },
};

const ORD: Record<Lang, string[]> = {
  pt: ['o primeiro', 'o segundo', 'o terceiro', 'o quarto', 'o quinto'],
  en: ['the first', 'the second', 'the third', 'the fourth', 'the fifth'],
  es: ['el primero', 'el segundo', 'el tercero', 'el cuarto', 'el quinto'],
};

// callouts: PT já com preposição/gênero; EN/ES usam nomes em inglês + prep (at/en)
const SPOTS_PT: Partial<Record<MapId, string[]>> = {
  mirage: ['no meio', 'no conector', 'na rampa', 'no apê', 'no quadrado', 'na janela', 'no fundo do A'],
  inferno: ['na banana', 'no apê', 'na biblioteca', 'no arco', 'na varanda', 'no fundo do B'],
  nuke: ['no ramp', 'no lobby', 'no outside', 'no heaven', 'no vestiário'],
  ancient: ['no meio', 'na caverna', 'no donut', 'no fundo do A', 'na rampa do B'],
  anubis: ['no meio', 'na água', 'no canal', 'no palácio', 'na ponte'],
  dust2: ['no meio', 'no túnel', 'no longo', 'na escada', 'no catwalk'],
  train: ['no fundo', 'no ramp', 'no heaven', 'no main', 'no z'],
};
const SPOTS_INTL: Partial<Record<MapId, string[]>> = {
  mirage: ['mid', 'connector', 'ramp', 'palace', 'jungle', 'window', 'A site'],
  inferno: ['banana', 'apps', 'library', 'arch', 'balcony', 'B site'],
  nuke: ['ramp', 'lobby', 'outside', 'heaven', 'secret'],
  ancient: ['mid', 'cave', 'donut', 'A site', 'B ramp'],
  anubis: ['mid', 'water', 'canal', 'palace', 'bridge'],
  dust2: ['mid', 'tunnels', 'long', 'stairs', 'catwalk'],
  train: ['back', 'ramp', 'heaven', 'main', 'z connector'],
};
const DEF_SPOTS_PT = ['no A', 'no B', 'no meio'];
const DEF_SPOTS_INTL = ['A site', 'B site', 'mid'];

function spotFor(map: MapId | undefined, lang: Lang, seed: number): string {
  if (!map) return '';
  if (lang === 'pt') {
    const list = SPOTS_PT[map] ?? DEF_SPOTS_PT;
    return list[seed % list.length];
  }
  const list = SPOTS_INTL[map] ?? DEF_SPOTS_INTL;
  return (lang === 'en' ? 'at ' : 'en ') + list[seed % list.length];
}

const T = {
  pt: { clutch: (n: string, s: number) => `${n} no 1v${s} e FECHOU`, verb: 'mata', con: 'com', and: 'e', close: 'fecha com', aceLead: (n: string) => `${n} PASSOU POR TODO MUNDO`, multiLead: (n: string, k: number) => `${n} fez ${k} no round` },
  en: { clutch: (n: string, s: number) => `${n} in the 1v${s} and CLOSED IT`, verb: 'takes', con: 'with', and: 'and', close: 'closes with', aceLead: (n: string) => `${n} WENT THROUGH EVERYONE`, multiLead: (n: string, k: number) => `${n} got ${k} in the round` },
  es: { clutch: (n: string, s: number) => `${n} en el 1v${s} y la CERRÓ`, verb: 'mata', con: 'con', and: 'y', close: 'cierra con', aceLead: (n: string) => `${n} PASÓ POR ENCIMA DE TODOS`, multiLead: (n: string, k: number) => `${n} hizo ${k} en la ronda` },
} as const;

// frases dramáticas do clutch (suspense)
const DRAMA = {
  pt: { vs: (n: string, s: number) => `${n} no 1v${s}...`, now: 'agora', timer: (s: number) => `, faltam ${s}s pra bomba explodir...`, hold: 'a pressão toda nele, o relógio correndo...', paaa: 'e PAAA,' },
  en: { vs: (n: string, s: number) => `${n} in the 1v${s}...`, now: 'now', timer: (s: number) => `, ${s}s left on the bomb...`, hold: 'all the pressure on him, clock ticking...', paaa: 'and BOOM,' },
  es: { vs: (n: string, s: number) => `${n} en el 1v${s}...`, now: 'ahora', timer: (s: number) => `, quedan ${s}s de bomba...`, hold: 'toda la presión sobre él, el reloj corriendo...', paaa: 'y PAAA,' },
} as const;

const CTX_STR = {
  pt: { matchPoint: '🏆 MATCH POINT!', mapPoint: '🏁 MAP POINT!', pistol: '🔫 PISTOL!', eco: '💰 ECO!', force: '💸 FORCE!', comeback: '↩️ VIRADA!', flawless: '🧹 FLAWLESS!', streak: (n: number) => `🔥 ${n} seguidos!`, ecoLine: (t: string) => `${t} ROUBA o round no eco`, forceLine: (t: string) => `${t} segura no force`, pistolLine: (t: string) => `${t} leva o pistol`, mapLine: (t: string) => `${t} FECHA o mapa`, seriesLine: (t: string) => `${t} FECHA a série`, comebackLine: (t: string) => `${t} virou o jogo` },
  en: { matchPoint: '🏆 MATCH POINT!', mapPoint: '🏁 MAP POINT!', pistol: '🔫 PISTOL!', eco: '💰 ECO!', force: '💸 FORCE!', comeback: '↩️ COMEBACK!', flawless: '🧹 FLAWLESS!', streak: (n: number) => `🔥 ${n} in a row!`, ecoLine: (t: string) => `${t} STEALS the round on eco`, forceLine: (t: string) => `${t} holds it on force`, pistolLine: (t: string) => `${t} takes the pistol`, mapLine: (t: string) => `${t} CLOSES the map`, seriesLine: (t: string) => `${t} CLOSES the series`, comebackLine: (t: string) => `${t} turned it around` },
  es: { matchPoint: '🏆 MATCH POINT!', mapPoint: '🏁 MAP POINT!', pistol: '🔫 PISTOL!', eco: '💰 ECO!', force: '💸 FORCE!', comeback: '↩️ REMONTADA!', flawless: '🧹 FLAWLESS!', streak: (n: number) => `🔥 ${n} seguidos!`, ecoLine: (t: string) => `${t} ROBA la ronda en eco`, forceLine: (t: string) => `${t} la aguanta en force`, pistolLine: (t: string) => `${t} se lleva el pistol`, mapLine: (t: string) => `${t} CIERRA el mapa`, seriesLine: (t: string) => `${t} CIERRA la serie`, comebackLine: (t: string) => `${t} dio la vuelta` },
} as const;

const NEWS = {
  pt: { clutch: (n: string, s: number) => `${n} guardou um clutch 1v${s}`, ace: (n: string) => `${n} cravou um ACE`, multi: (n: string, k: number) => `${n} fez um ${k}K decisivo` },
  en: { clutch: (n: string, s: number) => `${n} pulled off a 1v${s} clutch`, ace: (n: string) => `${n} landed an ACE`, multi: (n: string, k: number) => `${n} got a clutch ${k}K` },
  es: { clutch: (n: string, s: number) => `${n} sacó un clutch 1v${s}`, ace: (n: string) => `${n} clavó un ACE`, multi: (n: string, k: number) => `${n} hizo un ${k}K decisivo` },
} as const;

function flairFor(k: KillEvent, seed: number, lang: Lang): string {
  const pool = FLAIR[lang];
  const pick = (arr: string[]) => arr[seed % arr.length];
  if (seed % 9 === 0) return pick(pool.style);
  const w = k.weapon.toLowerCase();
  if (w.includes('awp')) return pick(pool.awp);
  if (w === 'deagle') return pick(k.headshot ? pool.deagleHs : pool.deagle);
  if (w === 'knife') return pick(pool.knife);
  if (k.headshot) return pick(pool.hs);
  if (['glock', 'usp', 'p250', 'tec9', 'cz', 'fiveseven', 'pistol'].includes(w)) return pick(pool.pistol);
  return pick(pool.spray);
}

// "o primeiro na base CT" / "o segundo com um hs seco" / "o terceiro no apê com uma AWP"
function killPhrase(k: KillEvent, i: number, round: number, lang: Lang, map?: MapId): string {
  const ord = ORD[lang][Math.min(i, 4)];
  const seed = hashStr(`${k.killerId}:${round}:${i}`);
  const spot = spotFor(map, lang, seed);
  const wflair = `${T[lang].con} ${flairFor(k, seed, lang)}`;
  const mode = spot ? seed % 3 : 1; // 0 só local, 1 só arma, 2 local+arma
  if (mode === 0) return `${ord} ${spot}`;
  if (mode === 2) return `${ord} ${spot} ${wflair}`;
  return `${ord} ${wflair}`;
}

function narrateKills(ks: KillEvent[], round: number, lang: Lang, map?: MapId): string {
  const t = T[lang];
  const shown = ks.slice(0, 4);
  if (shown.length === 0) return '';
  if (shown.length === 1) return `${t.verb} ${killPhrase(shown[0], 0, round, lang, map)}`;
  const mids = shown.slice(0, -1).map((k, i) => killPhrase(k, i, round, lang, map));
  const last = shown[shown.length - 1];
  const closer = `${t.close} ${flairFor(last, hashStr(`${last.killerId}:${round}:${shown.length - 1}`), lang)}`;
  return `${t.verb} ${mids.join(', ')} ${t.and} ${closer}`;
}

interface Play { kind: 'clutch' | 'ace' | 'multi'; who: string; size: number; kills: KillEvent[]; }

function scanPlay(kills: KillEvent[], winner: 0 | 1, teams: [TTeam, TTeam]): Play | null {
  if (kills.length === 0) return null;
  const byKiller = new Map<string, KillEvent[]>();
  for (const k of kills) {
    if (!byKiller.has(k.killerId)) byKiller.set(k.killerId, []);
    byKiller.get(k.killerId)!.push(k);
  }
  const aliveW = new Set(teams[winner].players.map((p) => p.id));
  const aliveL = new Set(teams[1 - winner].players.map((p) => p.id));
  let survivor: string | null = null;
  let clutchSize = 0;
  for (const k of kills) {
    if (k.victimTeam === winner) aliveW.delete(k.victimId);
    else aliveL.delete(k.victimId);
    if (survivor === null && aliveW.size === 1) { survivor = [...aliveW][0]; clutchSize = aliveL.size; }
  }
  if (survivor && clutchSize >= 2) return { kind: 'clutch', who: survivor, size: clutchSize, kills: byKiller.get(survivor) ?? [] };
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
  for (let i = log.length - 1; i >= 0; i--) { if (log[i] === team) n++; else break; }
  return n;
}
function worstDeficit(log: (0 | 1)[], team: 0 | 1): number {
  let a = 0, b = 0, worst = 0;
  for (const w of log) { if (w === 0) a++; else b++; worst = Math.min(worst, team === 0 ? a - b : b - a); }
  return worst;
}

export function narrateRound(kills: KillEvent[], winner: 0 | 1, teams: [TTeam, TTeam], ctx: NarrationCtx): RoundNarration | null {
  const lang = getLang();
  const c = CTX_STR[lang];
  const nickOf = (id: string): string => teams[0].players.find((p) => p.id === id)?.nick ?? teams[1].players.find((p) => p.id === id)?.nick ?? '?';
  const teamTag = teams[winner].tag;
  const before: [number, number] = [...ctx.score];
  before[winner] = Math.max(0, before[winner] - 1);
  const sp = `${before[0]}-${before[1]}`;

  // ---- contexto (1 prefixo, o de maior prioridade) ----
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
    const wb = ctx.buys[winner], lb = ctx.buys[1 - winner];
    if (lb === 'full' && (wb === 'eco' || wb === 'force')) { ecoKind = wb; tags.push(wb === 'eco' ? c.eco : c.force); }
  }
  if (kills.length >= 4 && kills.every((k) => k.victimTeam !== winner)) tags.push(c.flawless);
  const tag = tags.length ? tags[0] + ' ' : '';

  // ---- jogada ----
  const play = scanPlay(kills, winner, teams);
  if (play) {
    const nick = nickOf(play.who);
    if (play.kind === 'clutch') {
      // clutch dramático em beats (suspense): 1vN... abates... 1v1 + bomba... PAAA
      const D = DRAMA[lang];
      const cks = play.kills.slice(-play.size);
      const cleared = play.kills.length >= play.size; // matou todos do 1vN (senão fechou no relógio/bomba)
      const ex = FLAIR[lang].exclamClutch[hashStr(`${play.who}:${ctx.round}:ex`) % FLAIR[lang].exclamClutch.length];
      const beats: string[] = [`${tag}${D.vs(nick, play.size)}`];
      if (cleared) {
        const lead = cks.slice(0, -1);
        const last = cks[cks.length - 1];
        if (lead.length) beats.push(`${T[lang].verb} ${lead.map((k, i) => killPhrase(k, i, ctx.round, lang, ctx.map)).join(', ')}.`);
        const secs = 4 + (hashStr(`${play.who}:${ctx.round}:t`) % 12);
        const showTimer = hashStr(`${play.who}:${ctx.round}:tt`) % 2 === 0;
        beats.push(`1v1 ${D.now}${showTimer ? D.timer(secs) : '...'}`);
        const lastFlair = last ? `${T[lang].close} ${flairFor(last, hashStr(`${last.killerId}:${ctx.round}:L`), lang)}. ` : '';
        beats.push(`${D.paaa} ${lastFlair}${ex}`);
      } else {
        // fechou sem matar todos: segurou no relógio/bomba
        if (cks.length) beats.push(`${T[lang].verb} ${cks.map((k, i) => killPhrase(k, i, ctx.round, lang, ctx.map)).join(', ')}.`);
        beats.push(D.hold);
        beats.push(`${D.paaa} ${ex}`);
      }
      return { kind: 'clutch', text: beats.join(' '), beats, teamIdx: winner, big: true };
    }
    if (play.kind === 'ace') {
      const ex = FLAIR[lang].exclamAce[hashStr(`${play.who}:${ctx.round}`) % FLAIR[lang].exclamAce.length];
      const beats = [`${tag}${sp}: ${T[lang].aceLead(nick)}...`, `${narrateKills(play.kills, ctx.round, lang, ctx.map)}. ${ex}`];
      return { kind: 'ace', text: beats.join(' '), beats, teamIdx: winner, big: true };
    }
    const ex = FLAIR[lang].exclamMulti[hashStr(`${play.who}:${ctx.round}`) % FLAIR[lang].exclamMulti.length];
    const text = `${tag}${sp}: ${T[lang].multiLead(nick, play.size)}. ${narrateKills(play.kills.slice(0, 3), ctx.round, lang, ctx.map)}. ${ex}`;
    return { kind: 'multi', text, teamIdx: winner, big: ctx.mapWon || !!ecoKind };
  }

  // ---- sem jogada: só contexto forte ----
  if (ecoKind) return { kind: 'eco', text: `${tag}${sp}: ${ecoKind === 'eco' ? c.ecoLine(teamTag) : c.forceLine(teamTag)}`, teamIdx: winner, big: true };
  if (ctx.mapWon) return { kind: ctx.seriesPoint ? 'matchpoint' : 'mappoint', text: `${tag}${ctx.seriesPoint ? c.seriesLine(teamTag) : c.mapLine(teamTag)}`, teamIdx: winner, big: true };
  if (comeback) return { kind: 'comeback', text: `${tag}${sp}: ${c.comebackLine(teamTag)}`, teamIdx: winner, big: true };
  if (isPistol) return { kind: 'pistol', text: `${tag}${c.pistolLine(teamTag)}`, teamIdx: winner, big: false };
  return null;
}

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
  if (!best || (best.play.kind === 'multi' && best.play.size < 4)) return null;
  const lang = getLang();
  const nick = teams[userIdx].players.find((pl) => pl.id === best!.play.who)?.nick ?? '?';
  const n = NEWS[lang];
  const text = best.play.kind === 'clutch' ? n.clutch(nick, best.play.size) : best.play.kind === 'ace' ? n.ace(nick) : n.multi(nick, best.play.size);
  return { nick, text };
}
