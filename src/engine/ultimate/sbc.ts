// Ultimate Squad — SBC (Squad Building Challenges): "monte um time que satisfaça X
// → ganhe recompensa". Consome cartas do inventário (sink de duplicatas com
// propósito). Validação PURA. Ver docs-but-map.md §4.

import type { Role } from '../../types';
import type { UltCard } from './cards';
import { rarityInfo, type UltRarity } from './rarities';

export interface SbcReq {
  count: number;         // nº exato de cartas a submeter
  minOvrAvg?: number;    // OVR médio mínimo do conjunto
  sameCountry?: boolean; // todas do mesmo país
  sameRegion?: boolean;  // todas da mesma região
  sameOrg?: boolean;     // todas da mesma org
  minTier?: number;      // raridade (tier) mínima de TODAS as cartas
  roles?: Role[];        // multiset de funções que precisa conter
}

export interface SbcReward { credits?: number; card?: UltRarity }

export interface SbcDef { id: string; name: string; desc: string; req: SbcReq; reward: SbcReward }

export const SBCS: SbcDef[] = [
  { id: 'one-org', name: 'Uma Só Camisa', desc: '3 cartas da mesma organização.', req: { count: 3, sameOrg: true }, reward: { credits: 6000 } },
  { id: 'br-pride', name: 'Orgulho Nacional', desc: '5 cartas do mesmo país, OVR médio ≥ 78.', req: { count: 5, sameCountry: true, minOvrAvg: 78 }, reward: { credits: 8000, card: 'rareGold' } },
  { id: 'regional', name: 'Bloco Regional', desc: '5 cartas da mesma região, OVR médio ≥ 80.', req: { count: 5, sameRegion: true, minOvrAvg: 80 }, reward: { credits: 12000, card: 'elite' } },
  { id: 'elite-five', name: 'Time de Elite', desc: '5 cartas de raridade Elite ou melhor.', req: { count: 5, minTier: 5 }, reward: { card: 'legendary' } },
];

export function sbcById(id: string): SbcDef | undefined {
  return SBCS.find((s) => s.id === id);
}

export interface SbcCheckItem { label: string; ok: boolean }
export interface SbcCheck { ok: boolean; items: SbcCheckItem[] }

function multisetContains(haveRoles: Role[], needRoles: Role[]): boolean {
  const pool = [...haveRoles];
  for (const r of needRoles) {
    const i = pool.indexOf(r);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

// jogadores DISTINTOS: 3 cópias da mesma carta satisfaziam 'sameOrg' trivialmente
// e viravam faucet de credits combinadas com o bazar barato.
export function distinctPlayers(cards: UltCard[]): boolean {
  return new Set(cards.map((c) => c.playerId)).size === cards.length;
}

// valida um conjunto submetido contra os requisitos. Devolve checklist pra UI.
export function checkSbc(cards: UltCard[], req: SbcReq): SbcCheck {
  const items: SbcCheckItem[] = [];
  items.push({ label: `${req.count} cartas`, ok: cards.length === req.count });
  items.push({ label: 'jogadores diferentes', ok: distinctPlayers(cards) });
  const first = cards[0];
  if (req.minOvrAvg != null) {
    const avg = cards.length ? cards.reduce((a, c) => a + c.ovr, 0) / cards.length : 0;
    items.push({ label: `OVR médio ≥ ${req.minOvrAvg}`, ok: avg >= req.minOvrAvg });
  }
  if (req.sameCountry) items.push({ label: 'mesmo país', ok: !!first && cards.every((c) => c.country === first.country) });
  if (req.sameRegion) items.push({ label: 'mesma região', ok: !!first && cards.every((c) => c.region === first.region) });
  if (req.sameOrg) items.push({ label: 'mesma organização', ok: !!first && cards.every((c) => c.teamOrigin === first.teamOrigin) });
  if (req.minTier != null) items.push({ label: `raridade ≥ tier ${req.minTier}`, ok: cards.length > 0 && cards.every((c) => rarityInfo(c.rarity).tier >= req.minTier!) });
  if (req.roles && req.roles.length) items.push({ label: `funções: ${req.roles.join(', ')}`, ok: multisetContains(cards.map((c) => c.role), req.roles) });
  const ok = cards.length === req.count && items.every((i) => i.ok);
  return { ok, items };
}
