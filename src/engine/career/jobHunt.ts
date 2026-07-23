// Job hunt pós-demissão (#19 do gap Brasval): ser demitido deixa de ser
// game-over. O coach demitido vê clubes com vaga aberta, se candidata, pode
// ser RECUSADO (chance honesta mostrada antes) e recomeça — normalmente um
// degrau abaixo — PRESERVANDO todo o histórico (save.history, coachStints,
// títulos). Puro e determinístico: candidatura ao mesmo clube no mesmo split
// dá sempre o mesmo resultado (sem savescumming).

import type { TeamSeason } from '../../types';
import { hashStr } from '../../state/hash';
import { summarizeCoach, type CoachStint } from '../coachCareer';

export interface JobOffer {
  teamId: string;
  name: string;
  tag: string;
  colors: [string, string];
  logoUrl?: string;
  tier: number;        // 1-3 (tier do clube)
  chance: number;      // 0-1, chance HONESTA de contratação
  dream: boolean;      // clube acima do seu nível (aposta longa)
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
): JobOffer[] {
  const rep = summarizeCoach(stints ?? []).reputation;
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

  const toOffer = (x: { t: TeamSeason; tier: number }, isDream: boolean): JobOffer => ({
    teamId: x.t.id,
    name: x.t.team,
    tag: x.t.tag,
    colors: x.t.colors,
    logoUrl: x.t.logoUrl,
    tier: x.tier,
    chance: jobChance(rep, x.tier, firedTier),
    dream: isDream,
  });
  return [...(dream ? [toOffer(dream, true)] : []), ...viable.map((v) => toOffer(v, false))];
}

/** Resultado determinístico da candidatura (mesmo clube+split → mesmo veredito). */
export function applyForJob(offer: JobOffer, split: number): boolean {
  const roll = (hashStr(`apply:${split}:${offer.teamId}`) % 1000) / 1000;
  return roll < offer.chance;
}

/** Texto de recusa (varia por clube, determinístico). */
export function rejectionReason(offer: JobOffer): string {
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
