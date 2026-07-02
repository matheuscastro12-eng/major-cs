// RTP6 — mercado / transferências. Na janela (fim de temporada), TIMES REAIS
// fazem propostas conforme sua desejabilidade (OVR + forma + fama + colocação).
// Você compara, negocia e decide trocar de time. Os times e elencos são reais
// (dataset da carreira) — ao aceitar, você assume a vaga e seus colegas passam a
// ser os jogadores reais daquele time.

import { type Rng } from '../rng';
import { hashStr } from '../../state/hash';
import { TIER_BASE, tierUp, TIER_NAME } from './league';
import { buildCircuit, computeObjective } from './circuit';
import { divisionPool, worldTeamById, joinTeam } from './world';
import type { RoadToProSave, TransferOffer, Tier, SquadRole, TeamContext, LoanReturn } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Salário-base semanal por tier (R$). Escala com força/desejabilidade.
const TIER_WAGE: Record<Tier, number> = { academy: 1000, access: 3000, challenger: 9000, elite: 26000 };

// Desejabilidade do jogador no mercado. O RATING DE CARREIRA manda: org nenhuma
// paga por um jogador que performa mal, por mais OVR/fama que tenha no papel.
function careerRating(save: RoadToProSave): number | null {
  const h = save.history;
  return h.matchesPlayed >= 3 ? h.ratingSum / h.matchesPlayed : null;   // amostra mínima
}
function desirability(save: RoadToProSave, placement: number): number {
  const placeBonus = placement <= 2 ? 7 : placement <= 4 ? 3 : placement >= 7 ? -3 : 0;
  const r = careerRating(save);
  // rating 1.00 = neutro; 0.85 ≈ −9; 1.15 ≈ +9. Sem amostra = neutro.
  const ratingTerm = r == null ? 0 : Math.max(-12, Math.min(12, (r - 1.0) * 60));
  return save.player.ovr + save.player.form * 8 + save.life.fame * 0.15 + placeBonus + ratingTerm;
}

function squadRoleForTier(ovr: number, tier: Tier): SquadRole {
  const base = TIER_BASE[tier];
  if (ovr >= base + 3) return 'star';
  if (ovr >= base - 2) return 'starter';
  if (ovr >= base - 7) return 'rotation';
  return 'bench';
}

function offerNote(save: RoadToProSave, tier: Tier, placement: number): string {
  if (tier !== save.team.tier) return 'Quer te dar o salto pra um time maior.';
  if (placement <= 2) return 'Viu sua campanha e quer te tirar do rival.';
  if (save.life.fame >= 40) return 'De olho na sua visibilidade e nos fãs.';
  if (save.player.form > 1.05) return 'Impressionados com sua fase recente.';
  return 'Acompanha seu trabalho e quer reforçar o elenco.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Geração de ofertas (janela de transferências, no fim de temporada)

export function generateOffers(save: RoadToProSave, placement: number, rng: Rng): TransferOffer[] {
  const des = desirability(save, placement);
  const offers: TransferOffer[] = [];
  const used = new Set<string>([save.team.realTeamId]);
  const region = save.world.region;

  const curTier = save.team.tier;
  const up = tierUp(curTier);
  // Graduação da academia: as propostas são de times PROFISSIONAIS (access) — é
  // o "ir pro pro". Nos tiers pro: mais do mesmo tier + 1 acima.
  const fromAcademy = curTier === 'academy';
  const candidates: Tier[] = fromAcademy ? [up, up, up] : [curTier, curTier, curTier, up];

  // GATE de desempenho: subir de tier exige ENTREGAR — rating de carreira >= 1.0
  // (>= 0.9 saindo da academia: estreia é aposta em potencial). Jogador performando
  // mal só recebe proposta LATERAL, nunca de clube maior (era o furo do "rating
  // baixo sendo chamado pra time cada vez melhor").
  const r = careerRating(save);
  const upGateOk = r == null || r >= (fromAcademy ? 0.9 : 1.0);

  for (const tier of candidates) {
    if (offers.length >= 3) break;
    if (tier === up && up !== curTier && !upGateOk) continue;
    // Promessa de academia é ACESSÍVEL ao tier de acesso (limiar baixo, escala com
    // a colocação). Nos tiers pro, o salto pra cima exige mais.
    const threshold = fromAcademy
      ? TIER_BASE.access - 4 - (placement <= 2 ? 10 : placement <= 4 ? 6 : placement <= 6 ? 2 : -4)
      : tier === up && up !== curTier ? TIER_BASE[up] + 1 : TIER_BASE[tier] - 5;
    const margin = des - threshold;
    const chance = clamp(0.15 + margin * 0.06, 0.05, 0.9);
    if (rng() > chance) continue;

    // candidatos: times reais da (região, tier) ainda não usados, com elenco completo
    const pool = divisionPool(region, tier, save.world.season, 14).filter((t) => !used.has(t.id) && (t.players?.length ?? 0) >= 5);
    if (pool.length === 0) continue;
    const team = pool[Math.floor(rng() * pool.length)];
    used.add(team.id);

    // EMPRÉSTIMO: um clube acima te leva por uma temporada pra te lapidar (você
    // volta ao fim, ou fica de vez se brilhar). CLÁUSULA: se você é MUITO cobiçado,
    // um grande paga sua multa — proposta premium.
    const isLoan = tier === up && up !== curTier && !fromAcademy && rng() < 0.4;
    const isClause = !isLoan && margin > 8 && rng() < 0.18;

    const wageFactor = 1 + clamp(team.strength - TIER_BASE[tier], -8, 10) * 0.03 + rng() * 0.12;
    let wage = Math.round((TIER_WAGE[tier] * wageFactor) / 100) * 100;
    if (isClause) wage = Math.round((wage * 1.4) / 100) * 100;   // premium
    const signingBonus = Math.round(wage * (isLoan ? 0.6 + rng() : 2 + rng() * 3) * (isClause ? 1.5 : 1));
    offers.push({
      id: `offer-${team.id}-${save.world.season}-${hashStr(`${team.id}:${save.rng.tick}`) % 9973}`,
      orgId: team.id, realTeamId: team.id, orgName: team.name, tag: team.tag, colors: team.colors,
      tier, wage, weeks: isLoan ? 26 : 52, buyout: wage * 40,
      squadRole: squadRoleForTier(save.player.ovr, tier), signingBonus,
      note: isLoan ? 'Empréstimo de uma temporada pra te desenvolver na elite.'
        : isClause ? 'Pagaram sua multa: querem MUITO você. Proposta premium.'
          : offerNote(save, tier, placement),
      kind: isLoan ? 'loan' : 'transfer', clause: isClause,
    });
  }
  return offers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Negociação: contrapropõe +15% no salário. Org topa se você for desejado; senão
// retira a oferta (risco real).

export function negotiateOffer(save: RoadToProSave, offerId: string, rng: Rng): {
  offers: TransferOffer[]; result: 'raised' | 'withdrawn';
} {
  const offers = (save.world.pendingOffers ?? []).map((o) => ({ ...o }));
  const idx = offers.findIndex((o) => o.id === offerId);
  if (idx < 0) return { offers, result: 'withdrawn' };
  // UMA negociação por oferta: sem isso o salário empilhava +15% a cada clique
  // (~85% de sucesso) e ia ao infinito. Já negociada → a org não mexe mais.
  if (offers[idx].negotiated) return { offers, result: 'raised' };
  const pseudoPlacement = save.team.squadRole === 'star' ? 2 : save.team.squadRole === 'starter' ? 4 : 6;
  const des = desirability(save, pseudoPlacement);
  const acceptChance = clamp(0.3 + (des - TIER_BASE[offers[idx].tier]) * 0.05, 0.1, 0.85);
  if (rng() < acceptChance) {
    offers[idx] = { ...offers[idx], wage: Math.round((offers[idx].wage * 1.15) / 100) * 100, signingBonus: Math.round(offers[idx].signingBonus * 1.1), negotiated: true };
    return { offers, result: 'raised' };
  }
  offers.splice(idx, 1);
  return { offers, result: 'withdrawn' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aceitar: assume a vaga no time REAL + regenera a liga no tier da oferta.

export function acceptOffer(save: RoadToProSave, offerId: string): RoadToProSave {
  const offer = (save.world.pendingOffers ?? []).find((o) => o.id === offerId);
  if (!offer) return save;
  const team = worldTeamById(offer.realTeamId, save.world.season);
  if (!team) return save;

  const teammates = joinTeam(team, save.player.role);
  const ctx: TeamContext = {
    teamId: 'rtp-user', realTeamId: team.id, teamName: team.name, tag: team.tag, colors: team.colors, logo: team.logoUrl,
    tier: offer.tier, squadRole: offer.squadRole,
    contract: { wage: offer.wage, weeksLeft: offer.weeks, buyout: offer.buyout },
    teammates,
    chem: Object.fromEntries(teammates.map((m) => [m.sourcePlayerId, 30])),
  };

  // Empréstimo: guarda o clube-mãe pra voltar ao fim da temporada.
  const loanReturn: LoanReturn | undefined = offer.kind === 'loan' ? {
    realTeamId: save.team.realTeamId, teamName: save.team.teamName, tag: save.team.tag,
    colors: save.team.colors, logo: save.team.logo, tier: save.team.tier, contract: save.team.contract,
  } : undefined;

  let s: RoadToProSave = {
    ...save,
    team: ctx,
    life: {
      ...save.life,
      money: save.life.money + offer.signingBonus,
      morale: clamp(save.life.morale + 8, 0, 100),
      fame: clamp(save.life.fame + 4, 0, 100),
    },
    // Renovação pendente era do clube ANTIGO — não faz sentido assinar +52 semanas
    // com um contrato que acabou de deixar de existir.
    inbox: save.inbox.filter((e) => e.templateId !== 'contract-renewal'),
    rng: { seed: save.rng.seed, tick: save.rng.tick + 1 },
  };
  // Preserva a etapa da temporada: transferir NÃO reinicia o ano — você termina a
  // temporada no novo time (o mundo fecha na última etapa, envelhecendo normalmente).
  const seasonEvent = save.world.seasonEvent ?? 1;
  const league = buildCircuit(s, offer.tier, (save.rng.seed ^ hashStr(offer.id)) >>> 0, seasonEvent);
  // Time novo, expectativa nova. A confiança da diretoria começa fresca (a lua de mel).
  s = { ...s, world: { ...s.world, league, week: 1, seasonEvent, objective: computeObjective(league), boardConfidence: 58, division: `${offer.tier}-${team.region}`, pendingOffers: [], loanReturn } };
  return s;
}

export function declineOffers(save: RoadToProSave): RoadToProSave {
  return { ...save, world: { ...save.world, pendingOffers: [] } };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMISSÃO (RTP v12): a confiança da diretoria chegou ao fundo e você foi CORTADO.
// Um clube mais fraco da mesma faixa (projeto de reconstrução) te dá uma última
// chance como rotação. Retorna o novo TeamContext, ou null se não houver clube.

export function weakestClubContext(save: RoadToProSave, tier: Tier, season: number): TeamContext | null {
  const region = save.world.region;
  const pool = divisionPool(region, tier, season, 16)
    .filter((t) => t.id !== save.team.realTeamId && (t.players?.length ?? 0) >= 5);
  if (pool.length === 0) return null;
  const weakest = [...pool].sort((a, b) => a.strength - b.strength)[0];
  const teammates = joinTeam(weakest, save.player.role);
  const wage = Math.round((TIER_WAGE[tier] * 0.85) / 100) * 100;
  return {
    teamId: 'rtp-user', realTeamId: weakest.id, teamName: weakest.name, tag: weakest.tag,
    colors: weakest.colors, logo: weakest.logoUrl, tier, squadRole: 'rotation',
    contract: { wage, weeksLeft: 40, buyout: wage * 30 },
    teammates, chem: Object.fromEntries(teammates.map((m) => [m.sourcePlayerId, 25])),
  };
}

export { TIER_NAME };
