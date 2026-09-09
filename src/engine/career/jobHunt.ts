// Job hunt pós-demissão (#19 do gap Brasval): ser demitido deixa de ser
// game-over. O coach demitido vê clubes com vaga aberta, se candidata, pode
// ser RECUSADO (chance honesta mostrada antes) e recomeça — normalmente um
// degrau abaixo — PRESERVANDO todo o histórico (save.history, coachStints,
// títulos). Puro e determinístico: candidatura ao mesmo clube no mesmo split
// dá sempre o mesmo resultado (sem savescumming).

import type { TeamSeason } from '../../types';
import { hashStr } from '../../state/hash';
import { summarizeCoach, type CoachStint } from '../coachCareer';
import { scarEffects, scarCitedForTier, type CoachScar } from './scars';

export interface JobOffer {
  teamId: string;
  name: string;
  tag: string;
  colors: [string, string];
  logoUrl?: string;
  tier: number;        // 1-3 (tier do clube)
  chance: number;      // 0-1, chance HONESTA de contratação (já com a cicatriz)
  dream: boolean;      // clube acima do seu nível (aposta longa)
  // [W4] a cicatriz do técnico que este clube cita na conversa (a que mais pesa
  // pro tier dele) e quanto ela moveu a chance. undefined = ninguém citou nada.
  citedScar?: { id: CoachScar['id']; name: string; tone: CoachScar['tone']; delta: number; origin: string };
}

const MAX_OFFERS = 5;

/** Chance de contratação: reputação do coach vs ambição do clube contratante. */
export function jobChance(reputation: number, clubTier: number, firedTier: number): number {
  // base: clube do MESMO tier de onde saiu = 45%; um tier abaixo = 70%;
  // um tier ACIMA (dream shot) = 12%. Reputação move até ±20pp.
  const gap = firedTier - clubTier; // positivo = clube mais forte que seu último
  const base = gap >= 1 ? 0.12 : gap === 0 ? 0.45 : 0.7;
  const repMod = ((reputation - 50) / 50) * 0.2;
  return Math.max(0.05, Math.min(0.92, base + repMod));
}

/**
 * Monta a lista de clubes com interesse. Determinística por split: os clubes
 * "com vaga" são sorteados por hash. Sempre inclui ≥2 opções viáveis (tier ≤
 * seu último) e no máximo 1 dream shot (tier acima).
 */
export function listJobOffers(
  world: { t: TeamSeason; tier: number }[],
  firedFromName: string,
  firedTier: number,
  stints: CoachStint[],
  split: number,
  scars?: CoachScar[],
): JobOffer[] {
  const rep = summarizeCoach(stints ?? []).reputation;
  // [W4] cicatrizes ativas movem a chance por tier e entram no texto da proposta
  const fx = scarEffects(scars, split);
  const candidates = world
    .filter(({ t }) => t.team !== firedFromName && t.players.length >= 5)
    .map(({ t, tier }) => ({
      t,
      tier,
      roll: hashStr(`job:${split}:${t.id}`) % 1000,
    }))
    // "clube com vaga aberta" = sorteio do hash (~35% dos clubes por split)
    .filter((x) => x.roll < 350)
    .sort((a, b) => a.roll - b.roll);

  const viable = candidates.filter((x) => x.tier >= firedTier).slice(0, MAX_OFFERS - 1);
  const dream = candidates.find((x) => x.tier < firedTier);
  // fail-safe: sorteio azarado nunca deixa o coach sem opção — completa com os
  // primeiros clubes do tier de acesso fora do filtro de vaga.
  if (viable.length < 2) {
    for (const w of world) {
      if (viable.length >= 2) break;
      if (w.t.team === firedFromName || w.tier < firedTier || w.t.players.length < 5) continue;
      if (viable.some((v) => v.t.id === w.t.id)) continue;
      viable.push({ t: w.t, tier: w.tier, roll: 999 });
    }
  }

  const toOffer = (x: { t: TeamSeason; tier: number }, isDream: boolean): JobOffer => {
    const tierKey = Math.max(1, Math.min(3, x.tier)) as 1 | 2 | 3;
    const cited = scarCitedForTier(scars, split, x.tier);
    return {
      teamId: x.t.id,
      name: x.t.team,
      tag: x.t.tag,
      colors: x.t.colors,
      logoUrl: x.t.logoUrl,
      tier: x.tier,
      chance: Math.max(0.05, Math.min(0.92, jobChance(rep, x.tier, firedTier) + fx.jobChanceByTier[tierKey])),
      dream: isDream,
      ...(cited ? { citedScar: { id: cited.scar.id, name: cited.scar.name, tone: cited.scar.tone, delta: cited.delta, origin: cited.scar.origin } } : {}),
    };
  };
  return [...(dream ? [toOffer(dream, true)] : []), ...viable.map((v) => toOffer(v, false))];
}

/** Resultado determinístico da candidatura (mesmo clube+split → mesmo veredito). */
export function applyForJob(offer: JobOffer, split: number): boolean {
  const roll = (hashStr(`apply:${split}:${offer.teamId}`) % 1000) / 1000;
  return roll < offer.chance;
}

/** Texto de recusa (varia por clube, determinístico). */
export function rejectionReason(offer: JobOffer): string {
  // [W4] cicatriz negativa citada pelo clube: a recusa nomeia o episódio
  if (offer.citedScar && offer.citedScar.delta < 0) {
    const c = offer.citedScar;
    const variants = [
      `não engoliram "${c.name}" — ${c.origin.toLowerCase()}.`,
      `citaram "${c.name}" na reunião e recuaram.`,
      `o histórico pesou: "${c.name}" (${c.origin.toLowerCase()}).`,
    ];
    return variants[hashStr(`rej:${offer.teamId}:${c.id}`) % variants.length];
  }
  const variants = offer.dream
    ? [
        'buscam um nome com mais peso internacional agora.',
        'optaram por um técnico com títulos recentes no currículo.',
        'acharam a aposta arriscada depois da sua demissão.',
      ]
    : [
        'seguiram com outro candidato da casa.',
        'querem alguém com estilo diferente pro elenco atual.',
        'congelaram a vaga por ora — timing ruim.',
      ];
  return variants[hashStr(`rej:${offer.teamId}`) % variants.length];
}

/** [W4] Texto da PROPOSTA quando o clube cita uma cicatriz (positiva ou negativa). */
export function offerPitch(offer: JobOffer): string | null {
  const c = offer.citedScar;
  if (!c) return null;
  const pp = `${c.delta > 0 ? '+' : ''}${Math.round(c.delta * 100)}pp`;
  if (c.delta > 0) {
    const variants = [
      `Querem exatamente isso: "${c.name}" (${pp} na chance).`,
      `"${c.name}" abriu a porta — ${c.origin.toLowerCase()} (${pp}).`,
    ];
    return variants[hashStr(`pitch:${offer.teamId}:${c.id}`) % variants.length];
  }
  const variants = [
    `Desconfiam por "${c.name}" (${pp} na chance).`,
    `"${c.name}" está na pauta deles — ${c.origin.toLowerCase()} (${pp}).`,
  ];
  return variants[hashStr(`pitch:${offer.teamId}:${c.id}`) % variants.length];
}
