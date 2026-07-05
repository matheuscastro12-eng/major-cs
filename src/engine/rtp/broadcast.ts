// RTP iter43 — DIA DE JOGO: o pacote de transmissão do pré-jogo.
//
// A bancada dos analistas antes da série: manchete do dia (stakes reais da
// atmosphere), mesa redonda com 2 takes (um tático, derivado do analystReport;
// um hot take de ex-pro), palpite da bancada (% de sensação derivado dos
// números REAIS que o prep já tem: edge de força, condição do dia e confiança)
// e reações de caster a cada passo do veto.
//
// Camada 100% de APRESENTAÇÃO: nenhum número daqui alimenta odds, veto ou
// resultado — só reembala dados que a tela já mostra. Tudo determinístico
// pelo matchSeed (hashStr); NUNCA consome RNG do jogo. Zero cliques novos.

import { hashStr } from '../../state/hash';
import { MAP_LABELS, type MapId, type TTeam } from '../../types';
import { generateAnalystReport, deskTacticalLine } from '../analystReport';
import { matchStakes } from './atmosphere';
import { heroMapComfort } from './meta';
import type { MatchPrep } from './matchSim';
import type { RoadToProSave } from './types';

const pickBy = <T,>(pool: readonly T[], key: string): T => pool[hashStr(key) % pool.length];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── Mesa redonda + palpite da bancada ────────────────────────────────────────

export interface DeskPalpite {
  favYou: boolean;   // a bancada aposta em você?
  favLabel: string;  // tag do favorito (exibida com a %)
  pct: number;       // 50..88 — % de sensação do favorito
  line: string;      // a frase da bancada sobre o palpite
}

export interface BroadcastDesk {
  headline: string;  // MANCHETE DO DIA (ticker) — stakes reais ou fallback
  tactical: string;  // take 1 — leitura tática (material do analystReport)
  hot: string;       // take 2 — hot take do ex-pro
  palpite: DeskPalpite;
}

// % de sensação do palpite: curva elo-like sobre o edge REAL do scout
// (força do adversário − seu OVR), com nudge da condição do dia e da
// confiança — os três números que o prep já calcula pro jogo de verdade.
function deskWinFeel(save: RoadToProSave, prep: MatchPrep): number {
  const edge = prep.scout?.edge ?? Math.round(prep.opp.strength - save.player.ovr);
  let pYou = 1 / (1 + Math.pow(10, edge / 24));       // edge 0 → 50%; +12 → ~24%
  pYou += (prep.conditionMod - 1) * 0.5;              // condição do dia (±~5pp)
  pYou += (prep.confidence ?? 0) * 0.04;              // momento/moral (±4pp)
  return clamp(pYou, 0.12, 0.88);
}

function buildPalpite(save: RoadToProSave, prep: MatchPrep, seed: string): DeskPalpite {
  const pctYou = Math.round(deskWinFeel(save, prep) * 100);
  const favYou = pctYou >= 50;
  const pct = favYou ? pctYou : 100 - pctYou;
  const fav = favYou ? save.team.tag : prep.opp.tag;
  const dog = favYou ? prep.opp.tag : save.team.tag;
  const line = pct >= 65
    ? pickBy([
        `A bancada é unânime: ${fav} favorito com folga — ${pct}% na sensação da mesa. Zebra aqui vira manchete.`,
        `Ninguém na mesa hesita: ${fav} ${pct}%–${100 - pct}%. O ${dog} precisa de um dia perfeito.`,
        `${pct}% pro ${fav} na sensação da mesa — no papel, só dá um. Mas série não se joga no papel…`,
      ] as const, `${seed}:pline`)
    : pct >= 55
      ? pickBy([
          `A mesa pende pro ${fav} (${pct}%), mas ninguém assina embaixo — série com cara de decider.`,
          `Favoritismo leve do ${fav}: ${pct}%–${100 - pct}%. Um mapa de conforto e isso vira.`,
          `${fav} sai na frente na sensação da mesa (${pct}%), mas todo mundo aqui já viu série assim virar.`,
        ] as const, `${seed}:pline`)
      : pickBy([
          `Bancada RACHADA: ${pct}%–${100 - pct}% é margem de erro. Quem ganhar o veto ganha meio caminho.`,
          `Cara ou coroa pra mesa (${pct}%–${100 - pct}%) — série que se decide no detalhe.`,
          `${pct}%–${100 - pct}%: a mesa não crava nem sob tortura. Série de um round.`,
        ] as const, `${seed}:pline`);
  return { favYou, favLabel: fav, pct, line };
}

export function prematchDesk(save: RoadToProSave, prep: MatchPrep, major: boolean): BroadcastDesk {
  const seed = `desk:${prep.matchSeed}`;
  const oppTag = prep.opp.tag;

  // MANCHETE DO DIA — mesma derivação de stakes da atmosfera (fonte única).
  const headline = matchStakes(save, prep, major)
    ?? `${save.team.tag} encara ${prep.opp.name} — MD${prep.bestOf} em jogo, cobertura ao vivo.`;

  // Take tático — o material do analystReport (iter13) na voz da bancada.
  // Times mínimos: o report só lê tag + mapPrefs + players.
  const report = generateAnalystReport(
    { tag: oppTag, mapPrefs: prep.opp.mapPrefs ?? {}, players: prep.opp.players } as unknown as TTeam,
    { tag: save.team.tag, mapPrefs: heroMapComfort(save), players: [] } as unknown as TTeam,
  );
  const tactical = deskTacticalLine(report, oppTag, `${prep.matchSeed}`);

  const palpite = buildPalpite(save, prep, seed);

  // Hot take do ex-pro — ousado de propósito, mas ancorado nos mesmos dados
  // (favorito da mesa, mapa fraco do scout, seu nick).
  const weak = MAP_LABELS[report.weakMap];
  const hot = palpite.favYou
    ? pickBy([
        `Pra mim nem é jogo: se o ${save.team.tag} não atropelar, alguém dormiu no hotel. Anota aí.`,
        `O ${oppTag} chega assustado, eu vi o aquecimento. ${save.player.nick} resolve isso no talento.`,
        `Todo mundo elogiando o ${oppTag}, mas ninguém pergunta: e quando ${weak} entrar na série? Acabou.`,
      ] as const, `${seed}:hot`)
    : pickBy([
        `Pra mim, o ${prep.opp.name} chega superestimado — o mapa 1 decide a série inteira.`,
        `Vou na contramão da mesa: dia de ${save.player.nick} inspirado ninguém segura. Fecho a zebra.`,
        `O favoritismo do ${oppTag} morre se a série passar por ${weak}. Duvido? Guarda esse take.`,
      ] as const, `${seed}:hot`);

  return { headline, tactical, hot, palpite };
}

// ── Veto como drama: reação de caster a cada ban/pick ────────────────────────

export interface VetoCastCtx {
  matchSeed: number;
  oppTag: string;
  oppStrong?: MapId;                 // mapa forte do adversário (scout)
  oppWeak?: MapId;                   // mapa fraco do adversário (scout)
  comfort: Partial<Record<MapId, number>>; // seu conforto por mapa (−3..+3)
}

// Uma linha por passo do veto, derivada dos MESMOS dados que a tela já mostra
// (mapa forte/fraco do scout + seu conforto). Determinística por seed+índice.
export function vetoReaction(
  ctx: VetoCastCtx, stepIndex: number,
  team: 0 | 1 | -1, action: 'ban' | 'pick' | 'decider', map: MapId,
): string {
  const name = MAP_LABELS[map];
  const c = ctx.comfort[map] ?? 0;
  const key = `vetocast:${ctx.matchSeed}:${stepIndex}`;

  if (action === 'decider') return pickBy([
    `${name} sobrou como decider — se a série esticar, é lá que ela morre.`,
    `Decider definido: ${name}. A bancada já avisa — mapa de decisão não perdoa nervos.`,
    `${name} fecha o pool como decider. Se chegar lá, esquece o papel: vale coragem.`,
  ] as const, key);

  if (action === 'pick') {
    if (team === 0) {
      if (map === ctx.oppStrong) return `PICK CORAJOSO — ${name} é o mapa DELES! Ou é genialidade ou é convite pro desastre.`;
      if (c >= 2) return `Pick de conforto: ${name} é a sua casa. A bancada aprova.`;
      return pickBy([
        `${name} no papel — pick de quem confia no próprio preparo.`,
        `Escolha de ${name}: a mesa queria ver isso. Série ganhando contorno.`,
      ] as const, key);
    }
    if (map === ctx.oppStrong) return `${ctx.oppTag} puxa a série pra casa: ${name}. É o mapa mais perigoso do confronto.`;
    if (c >= 2) return `Ousadia do ${ctx.oppTag}: pickaram um mapa que é SEU. Desrespeito ou dever de casa?`;
    return pickBy([
      `${ctx.oppTag} crava ${name} — a bancada quer ver se a aposta paga.`,
      `${name} é a escolha do ${ctx.oppTag}. Sem sustos, mas sem presente.`,
    ] as const, key);
  }

  // ban
  if (team === 0) {
    if (map === ctx.oppStrong) return `Ban certeiro — tirou o brinquedo favorito do ${ctx.oppTag}!`;
    if (c <= -2) return `Ban óbvio — ${name} nunca foi a sua praia.`;
    return pickBy([
      `${name} fora da série — veto sem sentimentalismo.`,
      `Risco calculado: ${name} sai do caminho.`,
    ] as const, key);
  }
  if (c >= 2) return `O ${ctx.oppTag} fez o dever de casa: baniram um mapa forte SEU.`;
  if (map === ctx.oppWeak) return `Ban óbvio do ${ctx.oppTag} — eles fogem de ${name} faz tempo.`;
  return pickBy([
    `${ctx.oppTag} descarta ${name} sem piscar.`,
    `${name} banido pelo ${ctx.oppTag} — leitura de quem estudou a série.`,
  ] as const, key);
}

// Beat final do veto: o palco está definido.
export function stageDefinedLine(maps: MapId[], matchSeed: number): string {
  const list = maps.map((m) => MAP_LABELS[m]).join(' · ');
  const flourish = pickBy([
    'agora é com os jogadores.',
    'o resto é história pra contar.',
    'que venha a série.',
  ] as const, `stage:${matchSeed}`);
  return `PALCO DEFINIDO: ${list} — ${flourish}`;
}

// Continuidade com a Sala (MAJOR): a cobertura entrega pro walkout do iter41.
export function walkoutCue(matchSeed: number, oppName: string): string {
  return pickBy([
    `As equipes já caminham pro palco — o túnel do Major espera vocês e o ${oppName}…`,
    `A produção encerra a bancada: as equipes caminham pro palco. É agora.`,
  ] as const, `cue:${matchSeed}`);
}
