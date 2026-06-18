// Narração de momentos-chave da partida (clutch 1vX, ace, multi-kill). Reconstrói
// o que rolou no round a partir do killFeed (ordem dos abates, arma, headshot) e
// monta uma frase com cara de caster. Flair é determinístico (via hashStr), então
// a mesma narração não muda a cada re-render. Idioma vem de getLang().
import type { KillEvent, TTeam } from '../types';
import { getLang, type Lang } from '../state/i18n';
import { hashStr } from '../state/hash';

export interface RoundNarration {
  kind: 'clutch' | 'ace' | 'multi';
  text: string;
  teamIdx: 0 | 1; // time do protagonista (pra colorir como "seu" ou "adversário")
  big: boolean; // clutch/ace = destaque maior
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

// narra a sequência de abates de um protagonista (ex.: o clutcher):
// "mata o primeiro com um hs seco, o segundo com uma AWP e fecha com um 1-tap"
function narrateKills(ks: KillEvent[], round: number, lang: Lang): string {
  const t = T[lang];
  const ord = ORD[lang];
  const shown = ks.slice(0, 4); // até 4 pra não virar parágrafo
  if (shown.length === 0) return '';
  const frag = (k: KillEvent, i: number): string =>
    `${ord[Math.min(i, ord.length - 1)]} ${t.con} ${flairFor(k, hashStr(`${k.killerId}:${round}:${i}`), lang)}`;
  if (shown.length === 1) return `${t.verb} ${frag(shown[0], 0)}`;
  const mids = shown.slice(0, -1).map(frag);
  const last = shown[shown.length - 1];
  const closer = `${t.close} ${flairFor(last, hashStr(`${last.killerId}:${round}:${shown.length - 1}`), lang)}`;
  return `${t.verb} ${mids.join(', ')} ${t.and} ${closer}`;
}

export function narrateRound(
  kills: KillEvent[],
  winner: 0 | 1,
  teams: [TTeam, TTeam],
  ctx: { round: number; score: [number, number] },
): RoundNarration | null {
  if (kills.length === 0) return null;
  const lang = getLang();
  const nickOf = (id: string): string =>
    teams[0].players.find((p) => p.id === id)?.nick ?? teams[1].players.find((p) => p.id === id)?.nick ?? '?';

  // abates por autor (na ordem que aconteceram)
  const byKiller = new Map<string, KillEvent[]>();
  for (const k of kills) {
    if (!byKiller.has(k.killerId)) byKiller.set(k.killerId, []);
    byKiller.get(k.killerId)!.push(k);
  }

  // simula quem está vivo pra detectar clutch (winner caiu pra 1 e ganhou)
  const aliveW = new Set(teams[winner].players.map((p) => p.id));
  const aliveL = new Set(teams[1 - winner].players.map((p) => p.id));
  let survivor: string | null = null;
  let clutchSize = 0;
  for (const k of kills) {
    if (k.victimTeam === winner) aliveW.delete(k.victimId);
    else aliveL.delete(k.victimId);
    if (survivor === null && aliveW.size === 1) {
      survivor = [...aliveW][0];
      clutchSize = aliveL.size; // inimigos vivos no momento em que ficou sozinho
    }
  }

  // placar ANTES do round (tensão): tira 1 do vencedor
  const before: [number, number] = [...ctx.score];
  before[winner] = Math.max(0, before[winner] - 1);
  const scorePrefix = `${before[0]}-${before[1]}`;

  // 1) CLUTCH 1v2+ guardado pelo sobrevivente
  if (survivor && clutchSize >= 2) {
    const ks = byKiller.get(survivor) ?? [];
    const nick = nickOf(survivor);
    const lead = T[lang].clutch(nick, clutchSize);
    const tail = ks.length ? `. ${narrateKills(ks, ctx.round, lang)}` : '';
    const ex = FLAIR[lang].exclamClutch[hashStr(`${survivor}:${ctx.round}:ex`) % FLAIR[lang].exclamClutch.length];
    return { kind: 'clutch', text: `${scorePrefix}: ${lead}${tail}. ${ex}`, teamIdx: winner, big: true };
  }

  // 2) ACE (5 abates de um jogador do time vencedor)
  let topId: string | null = null;
  let topN = 0;
  for (const [id, ks] of byKiller) {
    const onWinner = teams[winner].players.some((p) => p.id === id);
    if (onWinner && ks.length > topN) { topN = ks.length; topId = id; }
  }
  if (topId && topN >= 5) {
    const nick = nickOf(topId);
    const ex = FLAIR[lang].exclamAce[hashStr(`${topId}:${ctx.round}`) % FLAIR[lang].exclamAce.length];
    return { kind: 'ace', text: `${scorePrefix}: ${T[lang].aceLead(nick)}. ${narrateKills(byKiller.get(topId)!, ctx.round, lang)}. ${ex}`, teamIdx: winner, big: true };
  }

  // 3) MULTI-KILL (3-4 abates)
  if (topId && topN >= 3) {
    const nick = nickOf(topId);
    const ex = FLAIR[lang].exclamMulti[hashStr(`${topId}:${ctx.round}`) % FLAIR[lang].exclamMulti.length];
    return { kind: 'multi', text: `${scorePrefix}: ${T[lang].multiLead(nick, topN)}. ${narrateKills(byKiller.get(topId)!.slice(0, 3), ctx.round, lang)}. ${ex}`, teamIdx: winner, big: false };
  }

  return null; // round comum: silêncio (mantém os momentos especiais)
}
