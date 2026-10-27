// [CSM-1] DROP DE ESCOLHA — regras puras (portado do CS Manager, recalibrado).
//
// Estoque: 1 drop a cada 20 min, no máximo 3 guardados. O tempo acima do teto
// é perdido (não acumula), igual ao original. Abrir um drop mostra 3 cartas; o
// jogador escolhe 1 em até 30 min. Se a janela expirar, o servidor entrega a
// opção de MENOR valor (regra explícita, mostrada na tela — o original dizia
// "a primeira" no texto e sorteava no código).
//
// Sorteio: o SERVIDOR sorteia a seed (32 bits), grava, e as 3 opções saem
// daqui de forma determinística: mesma (seed, pool, pity) ⇒ mesmas opções.
// Pesos inteiros por milhão (sem float na tabela) por RARIDADE BASE nossa — as
// faixas de OVR do original (1-60, 61-70…) não batem com os nossos tiers.
//
// Calibração (docs/ultimate-online/drops-calibracao.md, números reproduzíveis
// com scripts/test-ultimate-drops.mts): o valor esperado (quick-sell) da
// MELHOR das 3 opções fica bem abaixo do valor esperado de UMA carta do Pacote
// Bronze (o pack mais barato), e o teto diário de drops passivos não passa de
// uma fração pequena do diário — drop é tempero, não torneira.
//
// Pity: depois de DROP_PITY_N drops seguidos sem nenhuma opção Ouro ou melhor,
// o próximo drop garante 1 opção Ouro+ (sorteada pelos pesos Ouro+ abaixo).
//
// Puro: tempo entra por parâmetro, aleatoriedade só via makeRng(seed).
// Imports com .js: este arquivo roda no SERVIDOR (Node ESM sem bundle).
import { makeRng, weightedIndex, type Rng } from '../rng.js';
import { quickSellValue } from './quicksell.js';
import { rarityInfo, type UltRarity } from './rarities.js';

export const DROP_INTERVAL_MS = 20 * 60 * 1000;
export const DROP_MAX_STOCK = 3;
export const DROP_CHOICE_MS = 30 * 60 * 1000;
export const DROP_OPTIONS = 3;
export const DROP_PITY_N = 8;
export const DROP_ENGINE_VERSION = 'ult-drop-v1';

// Pesos por milhão. Ícone (92+) fica fora de propósito: drop passivo não pode
// ser caminho de carta de endgame. Specials curados (tots/promo/totw…) também
// não saem — exceto versões de EVENTO, que ocupam a vaga da carta base (ver
// eventVersions.ts: elas entram no grupo da raridade base que substituem).
export const DROP_WEIGHTS_PPM: readonly (readonly [UltRarity, number])[] = [
  ['bronze', 450_000],
  ['silver', 400_000],
  ['gold', 130_000],
  ['rareGold', 18_000],
  ['elite', 1_900],
  ['legendary', 100],
];
export const DROP_GOLD_TIER = rarityInfo('gold').tier;

// Carta mínima que o drop precisa conhecer (UltCard satisfaz).
export interface DropCardLike {
  key: string;
  playerId: string;
  rarity: UltRarity;
  ovr: number;
  poolRarity?: UltRarity; // versão de evento: grupo de sorteio = raridade base substituída
}

export interface DropStockState {
  available: number;   // drops guardados no último acerto
  refillBase: number;  // ms: âncora do relógio (resto da fração preservado)
}

export interface DropStock { available: number; refillBase: number; nextAt: number | null }

/** Estoque atual em `now`. Com estoque cheio o relógio anda e o excedente se perde. */
export function dropStock(s: DropStockState, now: number): DropStock {
  const base = Number.isFinite(s.refillBase) ? s.refillBase : now;
  const count = Math.floor(Math.max(0, now - base) / DROP_INTERVAL_MS);
  const available = Math.min(DROP_MAX_STOCK, Math.max(0, Math.trunc(s.available)) + count);
  const refillBase = base + count * DROP_INTERVAL_MS;
  return { available, refillBase, nextAt: available >= DROP_MAX_STOCK ? null : refillBase + DROP_INTERVAL_MS };
}

/** Estado depois de sacar 1 drop (null se não há estoque). */
export function consumeDrop(s: DropStockState, now: number): DropStockState | null {
  const st = dropStock(s, now);
  if (st.available < 1) return null;
  // saindo do teto, o relógio recomeça agora (não "devolve" tempo já perdido)
  const refillBase = st.available >= DROP_MAX_STOCK ? now : st.refillBase;
  return { available: st.available - 1, refillBase };
}

const groupRarity = (c: DropCardLike): UltRarity => c.poolRarity ?? c.rarity;

/** Valor de referência de uma opção (quick-sell da 1ª cópia — o que entra na economia). */
export function dropOptionValue(c: DropCardLike): number {
  return quickSellValue(c.rarity, c.ovr, false);
}

export interface DropRoll<C extends DropCardLike> { offers: C[]; pityUsed: boolean; hasGoldPlus: boolean }

function pickFrom<C>(rng: Rng, arr: C[]): C {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

/**
 * Sorteia as 3 opções. Pool deve vir JÁ filtrado (elegíveis) e é ordenado por
 * key aqui (a ordem de entrada não muda o resultado). Opções distintas por key
 * e por jogador. Até 6 tentativas por vaga; se não fechar 3, devolve o que deu
 * (o chamador recusa sem consumir nada).
 */
export function rollDropOffers<C extends DropCardLike>(seed: number, pool: readonly C[], sinceGold: number): DropRoll<C> {
  const rng = makeRng((seed >>> 0) || 1);
  const sorted = [...pool].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const byRarity = new Map<UltRarity, C[]>();
  for (const c of sorted) {
    const r = groupRarity(c);
    const arr = byRarity.get(r);
    if (arr) arr.push(c); else byRarity.set(r, [c]);
  }
  const bands = DROP_WEIGHTS_PPM.filter(([r]) => (byRarity.get(r)?.length ?? 0) > 0);
  const goldBands = bands.filter(([r]) => rarityInfo(r).tier >= DROP_GOLD_TIER);
  const pityUsed = sinceGold >= DROP_PITY_N - 1 && goldBands.length > 0;
  const offers: C[] = [];
  const keys = new Set<string>();
  const players = new Set<string>();
  for (let slot = 0; slot < DROP_OPTIONS; slot++) {
    const table = pityUsed && slot === 0 ? goldBands : bands;
    if (!table.length) break;
    for (let tries = 0; tries < 6; tries++) {
      const [rarity] = table[weightedIndex(rng, table.map(([, w]) => w))];
      const c = pickFrom(rng, byRarity.get(rarity)!);
      if (keys.has(c.key) || players.has(c.playerId)) continue;
      keys.add(c.key); players.add(c.playerId); offers.push(c);
      break;
    }
  }
  const hasGoldPlus = offers.some((c) => rarityInfo(groupRarity(c)).tier >= DROP_GOLD_TIER);
  return { offers, pityUsed, hasGoldPlus };
}

/** Contador de pity depois deste drop. */
export function nextSinceGold(sinceGold: number, roll: { hasGoldPlus: boolean }): number {
  return roll.hasGoldPlus ? 0 : Math.max(0, Math.trunc(sinceGold)) + 1;
}

/** Índice entregue quando a janela expira: MENOR valor; empate → menor OVR, depois key. */
export function autoPickIndex(offers: readonly DropCardLike[]): number {
  let best = 0;
  for (let i = 1; i < offers.length; i++) {
    const a = offers[i], b = offers[best];
    const va = dropOptionValue(a), vb = dropOptionValue(b);
    if (va < vb || (va === vb && (a.ovr < b.ovr || (a.ovr === b.ovr && a.key < b.key)))) best = i;
  }
  return best;
}

/** Pool padrão do drop: só raridades com peso (base) + versões de evento já aplicadas. */
export function dropPool<C extends DropCardLike>(catalog: readonly C[]): C[] {
  const allowed = new Set(DROP_WEIGHTS_PPM.map(([r]) => r));
  return catalog.filter((c) => allowed.has(groupRarity(c)) && (c.poolRarity != null || c.rarity === groupRarity(c)));
}

export const DROP_EXPIRY_RULE = 'Se o tempo acabar, você recebe a opção de MENOR valor.';
