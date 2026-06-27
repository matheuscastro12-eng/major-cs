// Engine de patrocinadores — T3.5 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// FEATURES NOVAS sobre o sistema legacy do CareerScreen:
//   1) OFERTA DINÂMICA: a cada split o engine tenta gerar uma oferta de
//      patrocínio (chance modulada por VRS/tier/slots livres). User aceita
//      ou recusa via modal. Antes o sistema só permitia escolher manualmente.
//   2) COOLDOWN pós-recusa: sponsor recusado não re-oferta logo (2 splits).
//   3) BÔNUS POR PLACEMENT: ao ganhar Major/título/top4/top8, sponsors ativos
//      pagam bônus extra (derivado do perSplit base).
//   4) LIMPEZA DE EXPIRADOS: contratos cujo `sponsorUntil < split atual` saem
//      automaticamente da lista ativa.
//
// O sistema legacy CONTINUA funcionando (income por split via effSponsorIncome
// no CareerScreen). Este engine só ADICIONA features — não substitui.

import type { Rng } from './rng';
import {
  SPONSORS,
  SPONSOR_SLOTS,
  sponsorById,
  sponsorPlacementBonus,
  eligibleSponsors,
  type Sponsor,
  type PlacementKind,
} from '../data/sponsors';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos compartilhados com o save (CareerSave fica em CareerScreen até T1.4)

export interface SponsorOffer {
  id: string;          // unique id da oferta (não confundir com sponsor.id)
  sponsorId: string;   // referência ao catálogo
  splitOffered: number; // split em que veio (expira na virada de split)
}

export interface SponsorState {
  /** Ids ATIVOS — mesmo array que o legacy usa. */
  sponsors: string[];
  /** sponsor.id → split em que o contrato termina (inclusive). */
  sponsorUntil: Record<string, number>;
  /** Oferta pendente (1 por vez). null se nenhuma. */
  pendingSponsorOffer?: SponsorOffer | null;
  /** sponsor.id → split a partir do qual pode tentar oferecer de novo */
  sponsorCooldown?: Record<string, number>;
}

export interface OfferGenContext {
  /** Split atual */
  split: number;
  /** VRS do clube (usado pra elegibilidade — mesmo critério do legacy) */
  vrs: number;
  /** Tier do clube (1 = elite, 4 = V-League). Modula chance. */
  clubeTier?: number;
  /** Slot máximo (default SPONSOR_SLOTS) */
  maxSlots?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes

const BASE_OFFER_CHANCE = 0.45; // chance por split de gerar uma oferta nova em condições neutras
const REJECT_COOLDOWN_SPLITS = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Geração de oferta

/**
 * Tenta gerar uma oferta nesta virada de split. Devolve a oferta criada (sem
 * mutar o state — quem decide salvar é o consumer) ou null.
 *
 * Regras:
 *   - Se já há `pendingSponsorOffer`, NÃO gera outra
 *   - Slots cheios → NÃO gera
 *   - Pool elegível vazio → NÃO gera
 *   - Chance modulada por tier/slots
 *   - Sponsor escolhido por peso INVERSO ao perSplit (sponsors top são raros)
 */
export function tryGenerateOffer(
  s: SponsorState,
  ctx: OfferGenContext,
  rng: Rng,
): SponsorOffer | null {
  if (s.pendingSponsorOffer) return null;
  const maxSlots = ctx.maxSlots ?? SPONSOR_SLOTS;
  if (s.sponsors.length >= maxSlots) return null;

  // Chance modulada
  const tier = ctx.clubeTier ?? 3;
  const tierBoost = tier <= 1 ? 1.35 : tier === 2 ? 1.1 : 0.85;
  const slotBoost = (maxSlots - s.sponsors.length) / maxSlots;
  const chance = BASE_OFFER_CHANCE * tierBoost * (0.5 + slotBoost * 0.6);
  if (rng() > chance) return null;

  // Pool: VRS-elegível, não-contratado, fora de cooldown
  const cooldown = s.sponsorCooldown ?? {};
  const pool = eligibleSponsors(ctx.vrs).filter((def) => {
    if (s.sponsors.includes(def.id)) return false;
    const cd = cooldown[def.id] ?? -1;
    if (cd >= ctx.split) return false;
    return true;
  });
  if (pool.length === 0) return null;

  // Escolha ponderada — peso inverso ao perSplit. Sponsors top (Samsung,
  // Red Bull) aparecem raramente; tier-baixo (Logitech, HyperX) muito mais
  // frequente. Calibrado pra que offers iniciais quase sempre sejam dos baixos.
  const weights = pool.map((def) => Math.max(1, 900_000 - def.perSplit));
  const totalW = weights.reduce((sum, w) => sum + w, 0);
  let pick = rng() * totalW;
  let chosen: Sponsor = pool[0];
  for (let i = 0; i < pool.length; i++) {
    pick -= weights[i];
    if (pick <= 0) {
      chosen = pool[i];
      break;
    }
  }

  return {
    id: `offer-${chosen.id}-${ctx.split}-${Math.floor(rng() * 1_000_000)}`,
    sponsorId: chosen.id,
    splitOffered: ctx.split,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aceitar/recusar

/** Aceita oferta: adiciona sponsor ao array + estampa sponsorUntil + limpa pending. */
export function acceptOffer(s: SponsorState, offer: SponsorOffer, currentSplit: number): void {
  const def = sponsorById(offer.sponsorId);
  if (!def) {
    s.pendingSponsorOffer = null;
    return;
  }
  if (!s.sponsors.includes(offer.sponsorId)) {
    s.sponsors.push(offer.sponsorId);
  }
  s.sponsorUntil[offer.sponsorId] = currentSplit + def.term - 1;
  s.pendingSponsorOffer = null;
}

/** Recusa oferta: limpa pending + estampa cooldown. */
export function rejectOffer(s: SponsorState, offer: SponsorOffer, currentSplit: number): void {
  s.pendingSponsorOffer = null;
  if (!s.sponsorCooldown) s.sponsorCooldown = {};
  s.sponsorCooldown[offer.sponsorId] = currentSplit + REJECT_COOLDOWN_SPLITS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Limpeza

/** Remove sponsors com contrato expirado. Devolve ids removidos pra UI notificar. */
export function cleanupExpired(s: SponsorState, currentSplit: number): string[] {
  const removed: string[] = [];
  s.sponsors = s.sponsors.filter((id) => {
    const until = s.sponsorUntil[id] ?? -1;
    if (until < currentSplit) {
      removed.push(id);
      delete s.sponsorUntil[id];
      return false;
    }
    return true;
  });
  return removed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bônus por placement

/** Bônus total de placement de TODOS os sponsors ativos. Aplicado UMA VEZ
 *  quando o user termina um torneio. Soma ao prize. */
export function placementBonusTotal(
  s: SponsorState,
  currentSplit: number,
  placement: PlacementKind,
): number {
  let total = 0;
  for (const id of s.sponsors) {
    const until = s.sponsorUntil[id] ?? -1;
    if (until < currentSplit) continue;
    const def = sponsorById(id);
    if (!def) continue;
    total += sponsorPlacementBonus(def, placement);
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de leitura (UI)

export interface ActiveSponsorView {
  def: Sponsor;
  expiresAtSplit: number;
  splitsLeft: number;
}

export function listActiveSponsors(s: SponsorState, currentSplit: number): ActiveSponsorView[] {
  return s.sponsors
    .map((id) => {
      const def = sponsorById(id);
      const until = s.sponsorUntil[id] ?? -1;
      if (!def || until < currentSplit) return null;
      return { def, expiresAtSplit: until, splitsLeft: until - currentSplit + 1 };
    })
    .filter((x): x is ActiveSponsorView => x != null);
}

// Re-export pro consumer não precisar importar de 2 lugares
export { SPONSORS, SPONSOR_SLOTS, sponsorById };
export type { Sponsor, PlacementKind };
