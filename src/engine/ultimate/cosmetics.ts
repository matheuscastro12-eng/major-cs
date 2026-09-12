// [U10] IDENTIDADE DO CLUBE + COLEÇÕES TEMÁTICAS — puro.
//
// Cosméticos NUNCA alteram força: moldura de carta e escudo/nome do clube são
// campos opcionais do perfil (save antigo abre sem eles), fora do espelho
// econômico (o ledger só vê credits/cartas). Coleções reaproveitam o padrão de
// objetivos: progresso por POSSE ATUAL de cartas (playerId distinto), prêmio
// idempotente pela chave `col:<id>` em objectivesClaimed (mesmo precedente do
// card LEGADO). Prêmios seguem a régua dos objetivos existentes (6k–15k).
import type { LogoConfig } from '../../lib/logoBuilder';
import type { UltCard } from './cards';

// ── Molduras equipáveis ─────────────────────────────────────────────────────
export interface FrameDef {
  id: string;
  name: string;
  desc: string;
  border: string;        // cor da borda externa
  inner: string;         // borda interna
  badge?: string;        // faixa curta no topo (opcional)
  badgeBg?: string;
  how: string;           // como se obtém (texto honesto)
}
export const FRAMES: FrameDef[] = [
  { id: 'rookie', name: 'Rookie', desc: 'A primeira moldura de todo clube.', border: '#8b8577', inner: 'rgba(255,255,255,.35)', how: 'Grátis: recebeu o time inicial' },
  { id: 'verde-amarelo', name: 'Verde-amarelo', desc: 'Cinco brasileiros no clube.', border: '#16a34a', inner: 'rgba(250,204,21,.8)', badge: 'BR', badgeBg: '#facc15', how: 'Coleção "Seleção Brasileira"' },
  { id: 'lenda-de-era', name: 'Lenda de era', desc: 'Uma era do CS completa no clube.', border: '#f3cf6b', inner: 'rgba(243,207,107,.7)', badge: 'ERA', badgeBg: '#f3cf6b', how: 'Coleção "Panteão de uma era"' },
  { id: 'sniper-elite', name: 'Sniper elite', desc: 'Trio de AWPs 85+.', border: '#6fc3df', inner: 'rgba(111,195,223,.7)', badge: 'AWP', badgeBg: '#6fc3df', how: 'Coleção "Trio de AWPs"' },
  { id: 'pass-premium', name: 'Premium', desc: 'Moldura do Passe Premium — liberada na hora da compra, fica pra sempre.', border: '#7c3aed', inner: 'rgba(236,199,95,.8)', badge: 'PASSE', badgeBg: '#ecc75f', how: 'Comprar o Passe Premium (benefício imediato)' },
  { id: 'founder-s1', name: 'Fundador S1', desc: 'Identidade da 1ª temporada.', border: '#c792ea', inner: 'rgba(199,146,234,.8)', badge: 'S1', badgeBg: '#c792ea', how: 'Oferta inicial (ainda não ativa)' },
];
export function frameById(id: string | null | undefined): FrameDef | null { return FRAMES.find((f) => f.id === id) ?? null; }
export function mergeFrames(owned: string[] | undefined, add: string[]): string[] {
  const set = new Set([...(owned ?? []), ...add.filter((a) => FRAMES.some((f) => f.id === a))]);
  return FRAMES.filter((f) => set.has(f.id)).map((f) => f.id);
}

// ── Clube ───────────────────────────────────────────────────────────────────
export interface ClubIdentity { name: string; logo: LogoConfig | null }
export const CLUB_NAME_MAX = 24;
export function normalizeClub(v: unknown): ClubIdentity | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<ClubIdentity>;
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, CLUB_NAME_MAX) : '';
  const logo = o.logo && typeof o.logo === 'object' && typeof (o.logo as LogoConfig).shape === 'string' ? (o.logo as LogoConfig) : null;
  if (!name && !logo) return null;
  return { name, logo };
}

// ── Coleções temáticas ──────────────────────────────────────────────────────
export interface CollectionDef {
  id: string;
  name: string;
  desc: string;
  need: number;                              // playerIds DISTINTOS que casam
  match: (c: UltCard) => boolean;
  reward: { credits?: number; frame?: string; title?: string };
}
export const COLLECTIONS: CollectionDef[] = [
  { id: 'br-five', name: 'Seleção Brasileira', desc: '5 jogadores brasileiros no clube.', need: 5, match: (c) => c.country === 'br', reward: { credits: 8000, frame: 'verde-amarelo' } },
  { id: 'awp-trio', name: 'Trio de AWPs', desc: '3 AWPs com 85+ de OVR.', need: 3, match: (c) => c.role === 'AWP' && c.ovr >= 85, reward: { credits: 6000, frame: 'sniper-elite' } },
  { id: 'igl-council', name: 'Conselho de IGLs', desc: '3 capitães (IGL) no clube.', need: 3, match: (c) => c.role === 'IGL', reward: { credits: 6000 } },
  { id: 'eu-core', name: 'Núcleo europeu', desc: '5 jogadores da Europa.', need: 5, match: (c) => c.region === 'europe', reward: { credits: 8000 } },
  { id: 'gold-standard', name: 'Padrão Ouro', desc: '11 cartas Ouro Raro ou melhor, distintas.', need: 11, match: (c) => ['rareGold', 'elite', 'legendary', 'icon'].includes(c.rarity), reward: { credits: 12000 } },
];
export const collectionKey = (id: string) => `col:${id}`;

export interface CollectionProgress { def: CollectionDef; have: number; done: boolean; claimed: boolean }
/** Progresso por posse ATUAL (playerId distinto) — vender/listar reduz o progresso; o prêmio
 *  já resgatado fica (objectivesClaimed é permanente). */
export function evaluateCollections(ownedCards: UltCard[], claimedIds: string[]): CollectionProgress[] {
  return COLLECTIONS.map((def) => {
    const ids = new Set(ownedCards.filter(def.match).map((c) => c.playerId));
    const have = Math.min(ids.size, def.need);
    return { def, have, done: ids.size >= def.need, claimed: claimedIds.includes(collectionKey(def.id)) };
  });
}
