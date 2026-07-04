// RTP v9 — MÍDIA & RIVALIDADES: a camada de narrativa entre partidas.
//
// Um RIVAL persistente é adotado de um adversário marcante (você perde pra um
// favorito, ou vence um gigante) — a org + o astro dela. Reencontros atualizam o
// head-to-head e esquentam a rivalidade; bater o rival dá moral/fama extra, perder
// dói mais. A imprensa gera MANCHETES reativas à sua fase, e sua AUDIÊNCIA
// (seguidores) cresce com fama, vitórias e viral.
//
// Tudo PURO e determinístico (RNG semeado). Sem import de matchSim (o contexto da
// partida chega via MediaMatchCtx). Atualiza-se em UM único lugar (applyMatchOutcome)
// pra nunca duplicar W/L.

import { makeRng, type Rng } from '../rng';
import { hashStr } from '../../state/hash';
import type { TTeam, Role } from '../../types';
import type { MediaState, Rival, Headline, HeadlineTone, RoadToProSave } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function defaultMedia(fame = 0): MediaState {
  return { followers: Math.max(0, Math.round(fame * 120)), headlines: [], rival: null };
}

// Contexto da partida montado pelo applyMatchOutcome (evita ciclo de import).
export interface MediaMatchCtx {
  won: boolean;
  rating: number;
  mvp: boolean;
  streak: number;
  oppTeam: TTeam;      // mr.oppTeam — id/name/tag/colors/logoUrl/players/strength
  heroNick: string;
  ovr: number;
  season: number;
  week: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rival

// Provocação NEUTRA — rivalidade equilibrada, ninguém domina o head-to-head.
const TAUNTS = [
  'Cadê o hype? No servidor você some.',
  'Bom no Twitter, mediano na LAN.',
  'De novo a gente, de novo o mesmo resultado.',
  'Anota aí: esse mapa é nosso.',
  'Você é bom, mas eu sou o problema.',
  'Chegou a promessa… vamos ver se aguenta a pressão.',
  'O clipe foi bonito. E o troféu, cadê?',
  'Sua torcida grita alto — até a gente calar.',
  'No veto eu já sei o que você vai banir. Previsível.',
  'Estudei sua demo inteira: prefire em todo canto que você joga.',
  'Clutch de sorte não repete. E a gente joga cinco mapas.',
  'Você abre o round, eu te refrago. Sempre foi assim.',
  'Pode trocar de org, de coach, de país. O placar contra mim não muda.',
  'Fala menos no Twitter e treina mais o spray. Conselho de graça.',
];
// Provocação com RESPEITO — você venceu o suficiente pra virar pesadelo do rival.
const RESPECT_TAUNTS = [
  'Confesso: você tá difícil de bater.',
  'Respeito. Mas ainda não acabou.',
  'Tá virando pesadelo meu, admito.',
  'Todo mundo tem um freguês. Detesto admitir que virei o seu.',
  'Da próxima eu levo no overtime. Anota.',
  'Você subiu a régua. Agora sou eu que corro atrás dela.',
  'Sem climão dessa vez: jogada limpa, mão melhor. Foi merecido.',
  'Ainda vou te pegar num Bo5. Mas hoje o dia foi seu.',
];
// Provocação DOMINANTE — o rival abriu vantagem no head-to-head e não perdoa.
const DOMINANT_TAUNTS = [
  'Quantas vezes mais você quer perder pra mim? Já perdi a conta.',
  'Freguês oficial. Podia vir de graça jogar pro nosso lado.',
  'Marca mais um mapa, marca dez. O resultado tá decorado.',
  'Treina a semana toda pra tomar 16 a 6 de novo?',
  'Nem preciso abrir sua demo. Já sei seu jogo de cor.',
  'A torcida já sabe o final — só vem ver o placar confirmar.',
  'Eco ou full buy, tanto faz: contra mim você não vira o round.',
  'Devolve o hype pra prateleira. Esse duelo nunca foi seu.',
];

type RivalMood = 'neutral' | 'respect' | 'dominant';

// Humor da provocação a partir do head-to-head (perspectiva do HERÓI): abriu 3+ de
// frente → o rival te respeita; levou 3+ na cara → o rival provoca dominando.
function rivalMood(heroW: number, heroL: number): RivalMood {
  const diff = heroW - heroL;
  if (diff >= 3) return 'respect';
  if (diff <= -3) return 'dominant';
  return 'neutral';
}

function pickTaunt(rng: Rng, mood: RivalMood): string {
  const pool = mood === 'respect' ? RESPECT_TAUNTS : mood === 'dominant' ? DOMINANT_TAUNTS : TAUNTS;
  return pool[Math.floor(rng() * pool.length)] ?? pool[0];
}

function starOf(opp: TTeam): { nick: string; role: Role; ovr: number } {
  const s = [...opp.players].sort((a, b) => b.ovr - a.ovr)[0];
  return s ? { nick: s.nick, role: s.role, ovr: s.ovr } : { nick: opp.tag, role: 'Rifler', ovr: opp.strength };
}

function makeRival(opp: TTeam, season: number, rng: Rng): Rival {
  const star = starOf(opp);
  return {
    orgId: opp.id, orgName: opp.name, tag: opp.tag, colors: opp.colors, logoUrl: opp.logoUrl,
    playerNick: star.nick, playerRole: star.role, playerOvr: star.ovr,
    intensity: 55, h2h: { w: 0, l: 0 }, originSeason: season, lastSeason: season,
    taunt: pickTaunt(rng, 'neutral'),
  };
}

// Você está enfrentando seu rival nesta partida?
export function isFacingRival(save: RoadToProSave, oppId: string): boolean {
  return !!save.media?.rival && save.media.rival.orgId === oppId;
}

// Ajuste de moral/fama pelo peso do duelo contra o rival (aplicado no applyMatchOutcome).
export function rivalStakeDelta(save: RoadToProSave, oppId: string, won: boolean): { morale: number; fame: number } {
  if (!isFacingRival(save, oppId)) return { morale: 0, fame: 0 };
  return won ? { morale: 5, fame: 3 } : { morale: -5, fame: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manchetes

function makeHeadline(text: string, tone: HeadlineTone, ctx: MediaMatchCtx, salt: string): Headline {
  return { id: `hl-${ctx.season}-${ctx.week}-${hashStr(`${salt}:${text}`) % 99991}`, text, tone, season: ctx.season, week: ctx.week };
}

function headlineForMatch(ctx: MediaMatchCtx, facedRival: boolean): Headline {
  const opp = ctx.oppTeam.name;
  const s = ctx.streak;
  if (facedRival && ctx.won) return makeHeadline(`${ctx.heroNick} silencia o rival e vence ${opp} no clássico`, 'hype', ctx, 'rv');
  if (facedRival && !ctx.won) return makeHeadline(`Rival leva a melhor: ${opp} atropela ${ctx.heroNick}`, 'bad', ctx, 'rv');
  if (ctx.mvp && ctx.won) return makeHeadline(`Show de ${ctx.heroNick}: MVP na vitória sobre ${opp}`, 'hype', ctx, 'mv');
  if (ctx.won && s >= 3) return makeHeadline(`${ctx.heroNick} embala: ${s}ª vitória seguida, agora sobre ${opp}`, 'hype', ctx, 'st');
  if (ctx.won && ctx.oppTeam.strength >= ctx.ovr + 5) return makeHeadline(`Zebra! ${ctx.heroNick} derruba o favorito ${opp}`, 'hype', ctx, 'up');
  if (ctx.won) return makeHeadline(`${ctx.heroNick} vence ${opp} e mantém a caminhada`, 'good', ctx, 'w');
  if (!ctx.won && s <= -3) return makeHeadline(`Fase ruim: ${ctx.heroNick} perde de novo, agora pra ${opp}`, 'bad', ctx, 'ls');
  if (ctx.rating >= 1.2) return makeHeadline(`${ctx.heroNick} joga muito, mas ${opp} vence assim mesmo`, 'neutral', ctx, 'lp');
  return makeHeadline(`${opp} supera ${ctx.heroNick} em duelo direto`, 'bad', ctx, 'l');
}

// Manchete avulsa (ex.: fim de temporada, título) — helper reaproveitável.
export function pushHeadline(media: MediaState, text: string, tone: HeadlineTone, season: number, week: number): MediaState {
  const hl: Headline = { id: `hl-${season}-${week}-${hashStr(`ext:${text}`) % 99991}`, text, tone, season, week };
  return { ...media, headlines: [hl, ...media.headlines].slice(0, 10) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Atualização pós-partida (UM único lugar: applyMatchOutcome)

export function updateMediaAfterMatch(save: RoadToProSave, ctx: MediaMatchCtx): MediaState {
  const media = save.media ?? defaultMedia(0);
  const rng = makeRngFor(ctx);

  // 1) seguidores — crescem com fama/vitória/rating/streak/rival
  const facedRival = !!media.rival && media.rival.orgId === ctx.oppTeam.id;
  const followersDelta = Math.round(
    (ctx.won ? 260 : 60)
    + ctx.rating * 180
    + (ctx.mvp ? 240 : 0)
    + Math.max(0, ctx.streak) * 70
    + (facedRival && ctx.won ? 500 : 0),
  );
  const followers = Math.max(0, media.followers + followersDelta);

  // 2) rival
  let rival: Rival | null = media.rival;
  if (rival && facedRival) {
    const h2h = { w: rival.h2h.w + (ctx.won ? 1 : 0), l: rival.h2h.l + (ctx.won ? 0 : 1) };
    rival = {
      ...rival, h2h,
      intensity: clamp(rival.intensity + (ctx.won ? 8 : 14), 0, 100),
      lastSeason: ctx.season,
      taunt: pickTaunt(rng, rivalMood(h2h.w, h2h.l)),
      playerOvr: starOf(ctx.oppTeam).ovr,
    };
  } else {
    // esfria devagar quando você não cruza com o rival
    if (rival) rival = { ...rival, intensity: Math.max(0, rival.intensity - 1) };
    // adota um rival novo num confronto MARCANTE, se não houver um rival quente
    const notable = (!ctx.won && ctx.oppTeam.strength >= ctx.ovr)
      || (ctx.won && ctx.oppTeam.strength >= ctx.ovr + 6);
    const slotFree = !rival || rival.intensity <= 18;
    if (notable && slotFree && ctx.oppTeam.players.length >= 3) {
      // a partida que ORIGINA a rivalidade já conta no head-to-head.
      rival = { ...makeRival(ctx.oppTeam, ctx.season, rng), h2h: { w: ctx.won ? 1 : 0, l: ctx.won ? 0 : 1 } };
    }
  }

  // 3) manchete
  const headlines = [headlineForMatch(ctx, facedRival), ...media.headlines].slice(0, 10);

  return { followers, headlines, rival };
}

// RNG determinístico por partida (seed do save + season/week/opp).
function makeRngFor(ctx: MediaMatchCtx): Rng {
  const seed = (hashStr(`media:${ctx.season}:${ctx.week}:${ctx.oppTeam.id}`) ^ (ctx.won ? 0x1 : 0x2)) >>> 0;
  return makeRng(seed);
}
