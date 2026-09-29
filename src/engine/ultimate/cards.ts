// Ultimate Squad — catálogo de cartas derivado do dataset REAL de CS2 2026.
// Puro/determinístico. Substitui o `but_cards` (MySQL) do Brasval por uma função
// que gera cartas a partir de TeamSeason[] (CS2_REAL_2026). Ver docs-but-map.md §4.

import type { Player, Role, TeamSeason } from '../../types';
import { regionOf, type RegionKey } from '../../data/regions';
import { playerOvr } from '../ratings';
import { attrsOf, legacyOf, refitAttrs, registeredAttrs, legacyFromAttrs, withAttrs, type PlayerAttrs } from '../attrs/model';
import { rarityFromOvr, rarityInfo, type UltRarity } from './rarities';
import { CardIndex } from './cardIndex';

// 6 substats faciais estilo FUT (0-99), derivadas dos atributos do nosso Player.
export interface CardStats {
  tiro: number;    // fragging bruto
  mira: number;    // precisão/consistência de mira
  reflexo: number; // entrada/movimento
  visao: number;   // leitura de jogo (IGL/consistency)
  clutch: number;  // sangue-frio
  util: number;    // utilitário/suporte
}

export interface UltCard {
  key: string;            // chave estável do catálogo: `${playerId}:${rarity}`
  playerId: string;
  nick: string;
  country: string;
  region: RegionKey | 'global';
  role: Role;
  teamOrigin: string;     // id do time (org) — eixo mais forte da química
  teamOriginName: string;
  rarity: UltRarity;
  ovr: number;
  stats: CardStats;
}

const clampStat = (n: number): number => Math.max(1, Math.min(99, Math.round(n)));

// deriva as 6 substats do nosso modelo (aim/clutch/consistency/awp/igl + role).
// AWP puxa `tiro` pra cima; Entry ganha `reflexo`; IGL/Support ganham `visao`/`util`.
// [realismo FM] os 5 números vêm dos atributos (legacyOf) quando o jogador os tem.
export function deriveStats(src: Pick<Player, 'aim' | 'clutch' | 'consistency' | 'awp' | 'igl' | 'role' | 'role2' | 'attrs'>): CardStats {
  const p = { ...legacyOf(src), role: src.role, role2: src.role2 };
  const isAwp = p.role === 'AWP' || p.role2 === 'AWP';
  const isEntry = p.role === 'Entry' || p.role2 === 'Entry';
  const isIgl = p.role === 'IGL' || p.role2 === 'IGL';
  const isSup = p.role === 'Support' || p.role2 === 'Support';
  return {
    tiro: clampStat(isAwp ? Math.max(p.aim, p.awp) : p.aim),
    mira: clampStat(p.aim * 0.6 + p.consistency * 0.4),
    reflexo: clampStat(p.aim * 0.7 + p.clutch * 0.3 + (isEntry ? 5 : isAwp ? -3 : 0)),
    visao: clampStat(p.igl * 0.55 + p.consistency * 0.45 + (isIgl ? 4 : 0)),
    clutch: clampStat(p.clutch),
    util: clampStat(p.igl * 0.5 + p.consistency * 0.5 + (isSup ? 4 : 0)),
  };
}

function cardFrom(p: Player, team: TeamSeason, rarity: UltRarity, ovr: number): UltCard {
  return {
    key: `${p.id}:${rarity}`,
    playerId: p.id,
    nick: p.nick,
    country: p.country,
    region: regionOf(p.country) ?? 'global',
    role: p.role,
    teamOrigin: team.id,
    teamOriginName: team.team,
    rarity,
    ovr: Math.max(1, Math.min(99, Math.round(ovr))),
    stats: deriveStats(p),
  };
}

// [realismo FM] atributos de uma carta: os do jogador na base (registrados pela
// fonte de dados); carta especial (OVR acima do base) leva o mesmo perfil com os
// 5 números subidos pelo boost. Fora da base (ícones, legado do RtP), deriva de
// uma aproximação dos números a partir da face da carta.
export function cardAttrs(card: Pick<UltCard, 'playerId' | 'role' | 'ovr' | 'stats'>): PlayerAttrs {
  const base = registeredAttrs(card.playerId);
  if (base) {
    const l = legacyFromAttrs(base);
    const boost = card.ovr - playerOvr(l);
    if (boost <= 0) return base;
    const up = (v: number) => Math.min(99, v + boost);
    return refitAttrs(base, { aim: up(l.aim), awp: up(l.awp), igl: up(l.igl), clutch: up(l.clutch), consistency: up(l.consistency) });
  }
  const st = card.stats;
  return attrsOf({
    id: card.playerId, role: card.role,
    aim: st.tiro, clutch: st.clutch, consistency: Math.round((st.mira + st.util) / 2),
    awp: card.role === 'AWP' ? st.tiro : Math.max(30, st.tiro - 30), igl: st.visao,
  });
}

// [realismo FM · motor v2] O jogador que ENTRA NA PARTIDA com uma carta: os
// atributos da carta (cardAttrs — o boost de carta especial sobe o perfil; a
// evolução de cópia NÃO, ela já vai no multiplicador de força do time) e os 5
// números reescritos a partir deles. Força do time e duelos contam a mesma
// carta, sem contagem dupla. Fora da base registrada (ícones, legado do RtP) o
// jogador segue com o próprio perfil.
export function cardMatchPlayer<P extends Player>(p: P, card: Pick<UltCard, 'playerId' | 'role' | 'ovr' | 'stats'>): P {
  const base = registeredAttrs(p.id);
  if (!base || card.playerId !== p.id) return p;
  const x = cardAttrs(card);
  return x === base ? p : withAttrs(p, x);
}

// carta BASE de um jogador (raridade pela faixa de OVR).
export function baseCardForPlayer(p: Player, team: TeamSeason): UltCard {
  const ovr = playerOvr(p);
  return cardFrom(p, team, rarityFromOvr(ovr), ovr);
}

// carta ESPECIAL curada (tots/major) com boost de OVR (clampado 1-99).
export function specialCardForPlayer(p: Player, team: TeamSeason, rarity: UltRarity, ovrBoost = 3): UltCard {
  const ovr = playerOvr(p) + ovrBoost;
  return cardFrom(p, team, rarity, ovr);
}

export interface SpecialSpec { playerId: string; rarity: UltRarity; ovrBoost?: number; }

// anexa specials curadas a um catálogo base já montado — mesma saída de
// buildCatalog(dataset, specials), sem pagar a reconstrução da base quando o
// chamador já tem ela em mãos (ex.: ensureCatalog derivou tots/promos da base).
export function appendSpecials(dataset: TeamSeason[], base: UltCard[], specials: SpecialSpec[]): UltCard[] {
  const byPlayer = new Map<string, { p: Player; t: TeamSeason }>();
  for (const t of dataset) {
    for (const p of t.players) byPlayer.set(p.id, { p, t });
  }
  const out = [...base];
  for (const s of specials) {
    const ref = byPlayer.get(s.playerId);
    if (!ref) continue;
    out.push(specialCardForPlayer(ref.p, ref.t, s.rarity, s.ovrBoost));
  }
  return out.sort((a, b) => b.ovr - a.ovr);
}

// monta o catálogo inteiro: 1 carta base por jogador (dedup por nick, como o
// buildPool) + as specials curadas. Determinístico — mesma entrada, mesma saída.
export function buildCatalog(dataset: TeamSeason[], specials: SpecialSpec[] = []): UltCard[] {
  const base: UltCard[] = [];
  const seen = new Set<string>();
  for (const t of dataset) {
    for (const p of t.players) {
      const dedup = p.nick.toLowerCase();
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      base.push(baseCardForPlayer(p, t));
    }
  }
  return appendSpecials(dataset, base, specials);
}

// índice key → carta, pra resolver OwnedCard.cardKey rápido.
// [realismo FM] chave base cuja faixa de OVR mudou resolve para a carta base
// atual do jogador (ver cardIndex.ts) — a coleção não perde cartas.
export function catalogIndex(catalog: UltCard[]): Map<string, UltCard> {
  return new CardIndex(catalog);
}

// valor de mercado estimado (portado do BUT: exponencial no OVR × mult da
// raridade), arredondado pra "buckets bonitos".
export function estimateCardValue(ovr: number, rarity: UltRarity): number {
  const raw = 200 * Math.pow(2, (ovr - 50) / 5.5) * rarityInfo(rarity).valueMult;
  return niceRound(raw);
}

function niceRound(n: number): number {
  if (n < 1000) return Math.round(n / 50) * 50;
  if (n < 10000) return Math.round(n / 250) * 250;
  if (n < 100000) return Math.round(n / 2500) * 2500;
  return Math.round(n / 25000) * 25000;
}

// 5 cartas iniciais (onboarding): uma por função da formação, OVR modesto e
// jogadores distintos. Fallback pra qualquer não-usado se faltar da função.
// O rng é obrigatório (engine puro): quem chama decide a fonte de entropia.
export function pickStarterCards(catalog: UltCard[], roles: Role[], targetOvr: number, rng: () => number): UltCard[] {
  const used = new Set<string>();
  const out: UltCard[] = [];
  const closeness = (c: UltCard) => Math.abs(c.ovr - targetOvr);
  for (const role of roles) {
    const fits = catalog.filter((c) => !used.has(c.playerId) && (c.role === role || role === 'Rifler' || c.role === 'Rifler'));
    const pool = (fits.length ? fits : catalog.filter((c) => !used.has(c.playerId))).slice().sort((a, b) => closeness(a) - closeness(b));
    if (!pool.length) continue;
    // SORTEIA entre os candidatos perto do alvo (mantém o squad ~targetOvr mas
    // varia QUEM cada conta recebe). Antes pegava sempre o [0] mais próximo →
    // toda conta começava com os mesmos 5 jogadores. Banda = OVR dentro de +3 do
    // melhor; se sobrar pouco, cai nos ~14 mais próximos pra garantir variedade.
    const best = closeness(pool[0]);
    const band = pool.filter((c) => closeness(c) <= best + 3);
    const cands = band.length >= 5 ? band : pool.slice(0, Math.min(14, pool.length));
    const cand = cands[Math.floor(rng() * cands.length)];
    if (cand) { used.add(cand.playerId); out.push(cand); }
  }
  return out;
}
