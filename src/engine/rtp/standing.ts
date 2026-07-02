// RTP v13 — ACCOLADES & WORLD STANDING. Duas camadas de prestígio individual:
//
//  (1) PRÊMIOS por campeonato (MVP/EVP): ao fechar uma etapa, o rating médio do
//      herói no torneio + a colocação + a força do field decidem se ele leva um
//      prêmio individual. MVP = destaque que TAMBÉM venceu; EVP = destaque que
//      não levou o título. Prêmios entram na vitrine, no legado e puxam o ranking.
//
//  (2) RANKING MUNDIAL (estilo HLTV Top 20): um número derivado, de forma pura e
//      determinística, do "score de prestígio" do herói (OVR + tier + títulos +
//      rating de carreira + fama + prêmios). Sem pool de comparação persistido —
//      a curva mapeia score → rank de modo que crescer de fato aperta o ranking.
//
// Módulo quase-puro (dataset real + hash, zero estado): fácil de calibrar/testar.

import { hashStr } from '../../state/hash';
import { playerOvr } from '../ratings';
import { divisionPool } from './world';
import { MACRO_REGION_ORDER } from '../../data/regions';
import type { RoadToProSave, Tier, Accolade } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const TIER_PRESTIGE: Record<Tier, number> = { academy: 0, access: 8, challenger: 18, elite: 30 };

// ── Ranking mundial ──────────────────────────────────────────────────────────
// Score de prestígio: soma ponderada do que define um pro no cenário. Calibrado
// pra que um moleque de academia fique lá pra trás (#200+) e um astro de elite
// com títulos e prêmios chegue ao topo (#1).
export function standingScore(save: RoadToProSave): number {
  const h = save.history;
  // ratingSum acumula UMA nota por SÉRIE (applyMatchOutcome) → divide por partidas,
  // não por mapas (dividir por mapas deflacionava a média pra ~0.45 e pregava o
  // termo de rating no piso pra sempre).
  const avgRating = h.matchesPlayed > 0 ? h.ratingSum / h.matchesPlayed : 1.0;
  // Peso por amostra: poucas séries → o rating quase não mexe (o ranking segue OVR/
  // tier/títulos). Evita que 3 séries ruins de estreia derrubem o herói 100 posições.
  const ratingWeight = Math.min(1, h.matchesPlayed / 8);
  const accolades = h.accolades ?? [];
  const mvpCount = accolades.filter((a) => a.kind === 'mvp').length;
  const evpCount = accolades.filter((a) => a.kind === 'evp').length;
  return (
    save.player.ovr
    + TIER_PRESTIGE[save.team.tier]
    + Math.min(24, h.trophies.length * 2)
    + clamp((avgRating - 1.0) * 45, -7, 18) * ratingWeight
    + Math.min(8, save.life.fame * 0.1)
    + Math.min(22, mvpCount * 4 + evpCount * 2)
  );
}

// Mapa score → posição no ranking. Curva exponencial decrescente: score alto =
// rank baixo (melhor). Ancoras: rookie academy (~67) → ~#200; pro de acesso
// (~96) → ~#50; challenger sólido (~123) → ~#13; lenda de elite (170+) → #1.
export function rankFromScore(score: number): number {
  return Math.round(clamp(380 * Math.exp(-(score - 55) / 20), 1, 500));
}

export function computeWorldRank(save: RoadToProSave): number {
  return rankFromScore(standingScore(save));
}

// Rótulo curto do patamar do ranking (a fantasia HLTV). <=20 é ouro.
export function rankTier(rank: number): 'top20' | 'top30' | 'ranked' | 'unranked' {
  if (rank <= 20) return 'top20';
  if (rank <= 30) return 'top30';
  if (rank <= 200) return 'ranked';
  return 'unranked';
}

// ── Prêmio de campeonato (MVP/EVP) ───────────────────────────────────────────
// place: 1=campeão, 2=vice, 3=semi, 5=3º grupo, 7=4º grupo.
// stronger: quantos times do field eram mais fortes que o herói (0 = favorito).
// avgRating: rating médio do herói NO campeonato (não o de carreira).
export function deriveEventAward(place: number, avgRating: number, stronger: number): 'mvp' | 'evp' | null {
  // Dominar um field forte é mais impressionante → limiar cede um pouco.
  const ease = Math.min(0.06, stronger * 0.02);
  const mvpThr = 1.10 - ease;
  const evpThr = 1.14 - ease;
  if (place === 1 && avgRating >= mvpThr) return 'mvp';
  // EVP: destaque individual que não levou o título (ou levou com rating mediano).
  if (place <= 2 && avgRating >= evpThr) return 'evp';
  if (place <= 3 && avgRating >= evpThr + 0.05) return 'evp';
  return null;
}

export function makeAccolade(
  kind: 'mvp' | 'evp', eventName: string, season: number, rating: number, tier: Tier, tick: number,
): Accolade {
  return { id: `acc-${kind}-${season}-${tick}`, kind, eventName, season, rating: Math.round(rating * 100) / 100, tier };
}

export const AWARD_LABEL: Record<'mvp' | 'evp', string> = { mvp: 'MVP', evp: 'EVP' };

// ── Ladder mundial (RTP v14) — vizinhos NOMEADOS ao redor do herói ───────────
// A fantasia HLTV precisa de gente: astros REAIS do dataset recebem um score na
// MESMA régua do herói (OVR + prestígio do tier + salt por temporada), o herói é
// encaixado pelo próprio standingScore, e a janela mostra quem está logo acima
// e logo abaixo — subir uma posição vira ultrapassar ALGUÉM.
export interface LadderRow { rank: number; nick: string; teamTag: string; country: string; isHero?: boolean; }

export function worldLadder(save: RoadToProSave, span = 3): { top: LadderRow[]; window: LadderRow[] } {
  const season = save.world.season;
  type Cand = { score: number; nick: string; teamTag: string; country: string };
  const cands: Cand[] = [];
  const seen = new Set<string>();
  for (const region of MACRO_REGION_ORDER) {
    for (const tier of ['elite', 'challenger', 'access'] as Tier[]) {
      for (const team of divisionPool(region, tier, season, 10)) {
        if (team.id === save.team.realTeamId) continue;   // o herói representa o próprio time
        // 2 astros por time bastam pra povoar o ladder sem pesar.
        const stars = [...(team.players ?? [])].sort((a, b) => playerOvr(b) - playerOvr(a)).slice(0, 2);
        for (const p of stars) {
          if (seen.has(p.nick)) continue;
          seen.add(p.nick);
          const salt = hashStr(`ladder:${p.nick}:${season}`) % 9;   // forma da temporada
          cands.push({ score: playerOvr(p) + TIER_PRESTIGE[tier] + salt, nick: p.nick, teamTag: team.tag, country: p.country, });
        }
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);

  const heroRank = save.world.worldRank ?? computeWorldRank(save);
  const heroScore = standingScore(save);
  // posição do herói na lista ordenada (quem tem score maior fica acima)
  let idx = cands.findIndex((c) => c.score <= heroScore);
  if (idx < 0) idx = cands.length;

  const row = (c: Cand, rank: number): LadderRow => ({ rank, nick: c.nick, teamTag: c.teamTag, country: c.country });
  const windowRows: LadderRow[] = [];
  for (let k = span; k >= 1; k--) {
    const c = cands[idx - k];
    if (c && heroRank - k >= 1) windowRows.push(row(c, heroRank - k));
  }
  windowRows.push({ rank: heroRank, nick: save.player.nick, teamTag: save.team.tag, country: save.player.country, isHero: true });
  for (let k = 0; k < span; k++) {
    const c = cands[idx + k];
    if (c) windowRows.push(row(c, heroRank + k + 1));
  }
  // pódio (só quando o herói ainda está longe dele — senão a janela já cobre)
  const top = heroRank > span + 3 ? cands.slice(0, 3).map((c, i) => row(c, i + 1)) : [];
  return { top, window: windowRows };
}
