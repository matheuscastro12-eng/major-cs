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
  maxTier?: number;      // raridade (tier) MÁXIMA de TODAS as cartas — com minTier
                         // igual vira "tier exato". Protege o jogador de queimar
                         // carta acima do necessário (ex.: um Ícone no legend-trio,
                         // que premia... um Ícone) e barra specials (tier 8-9).
  roles?: Role[];        // multiset de funções que precisa conter
}

export interface SbcReward { credits?: number; card?: UltRarity }

export interface SbcDef { id: string; name: string; desc: string; req: SbcReq; reward: SbcReward }

export const SBCS: SbcDef[] = [
  // SBCs são REPETÍVEIS (submitSbc não trava sbcDone) → a recompensa TEM de ficar
  // abaixo do custo de aquisição dos insumos, senão vira faucet de credits. Antes:
  // {count:3, sameOrg} sem piso de qualidade + 6000cr = milho de bronze (3 bronzes
  // valem ~1200 no bazar / ~75 no quick-sell → 6000cr repetível, ~2000/carta, o
  // melhor mill do modo). Piso Prata+ (minTier 2) sobe o custo de insumo pra ~11k
  // no bazar e 3000cr (1000/carta) deixa a mais FÁCIL das SBCs com o menor prêmio
  // por carta — curva dificuldade→prêmio volta a ser monotônica.
  { id: 'one-org', name: 'Uma Só Camisa', desc: '3 cartas Prata+ da mesma organização.', req: { count: 3, sameOrg: true, minTier: 2 }, reward: { credits: 3000 } },
  { id: 'br-pride', name: 'Orgulho Nacional', desc: '5 cartas do mesmo país, OVR médio ≥ 78.', req: { count: 5, sameCountry: true, minOvrAvg: 78 }, reward: { credits: 8000, card: 'rareGold' } },
  { id: 'regional', name: 'Bloco Regional', desc: '5 cartas da mesma região, OVR médio ≥ 80.', req: { count: 5, sameRegion: true, minOvrAvg: 80 }, reward: { credits: 12000, card: 'elite' } },
  { id: 'elite-five', name: 'Time de Elite', desc: '5 cartas de raridade Elite ou melhor.', req: { count: 5, minTier: 5 }, reward: { card: 'legendary' } },
  // degrau de ENTRADA da escada de raridades (rebalance iter47): 5 Ouro Raro
  // (~300k de insumo no mercado) viram 1 Elite (~200k) — sink de cartas com
  // propósito, mesma economia do elite-five. Tier EXATO (min=max=4): Elite+
  // vale mais que o prêmio, submeter seria prejuízo — a trava protege o jogador.
  { id: 'rare-five', name: 'Garimpo Dourado', desc: '5 cartas Ouro Raro (exatamente essa raridade).', req: { count: 5, minTier: 4, maxTier: 4 }, reward: { card: 'elite' } },
  // topo da escada (rebalance iter47): o PRIMEIRO caminho determinístico até um
  // Ícone — 3 Lendários (~1,4M de insumo) viram 1 Ícone (~1,5M). Valor justo,
  // sink gigante. Tier EXATO (min=max=6): sem a trava, um Ícone (tier 7) ou uma
  // special (tots/major, tier 8-9) contariam como insumo — queimar um Ícone pra
  // ganhar um Ícone é armadilha, não desafio.
  { id: 'legend-trio', name: 'Consagração', desc: '3 cartas Lendárias (exatamente essa raridade).', req: { count: 3, minTier: 6, maxTier: 6 }, reward: { card: 'icon' } },
  // endgame: consome o topo de uma coleção madura (6 Lendários+ distintos) em
  // troca da special mais rara do catálogo — o outro caminho é a ladder Elite.
  { id: 'road-legend', name: 'Rumo à Lenda', desc: '6 cartas Lendário ou melhor, OVR médio ≥ 90.', req: { count: 6, minTier: 6, minOvrAvg: 90 }, reward: { card: 'major' } },
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
  if (req.maxTier != null) items.push({ label: `raridade ≤ tier ${req.maxTier}`, ok: cards.length > 0 && cards.every((c) => rarityInfo(c.rarity).tier <= req.maxTier!) });
  if (req.roles && req.roles.length) items.push({ label: `funções: ${req.roles.join(', ')}`, ok: multisetContains(cards.map((c) => c.role), req.roles) });
  const ok = cards.length === req.count && items.every((i) => i.ok);
  return { ok, items };
}
