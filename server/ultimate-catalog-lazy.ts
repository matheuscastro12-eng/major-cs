// Carregador LAZY da cadeia do engine (catálogo/roll de pack) pro servidor.
//
// POR QUÊ: na Vercel os arquivos de src/engine|src/data são compilados SEM
// bundle e os imports relativos SEM extensão deles (ex.: cards.ts →
// '../../data/regions') não resolvem no Node ESM em runtime
// (ERR_MODULE_NOT_FOUND /var/task/src/data/regions). Um import top-level dessa
// cadeia derruba a função inteira no load — foi o que tirou o Mercado do ar em
// 2026-07-05. Com dynamic import dentro de try/catch, a rota SEMPRE sobe:
// mercado (browse/buy/cancel/mine), state e tx funcionam; só packOpen e
// listagem nova degradam (503 catalog_unavailable) enquanto a cadeia não
// carrega — o cliente do 3b cai pro roll local e a UI de venda mostra offline.
//
// O fix ESTRUTURAL (fazer a cadeia carregar no servidor — sufixos .js ou
// snapshot gerado) é trabalho separado; quando ele chegar, estes loaders
// simplesmente passam a resolver e tudo reativa sozinho, sem mudar a rota.

import type { MktCardInfo, MktCardLookup } from './ultimate-market.js';
import type { UltQuicksellValuer } from './ultimate-economy.js';

type PackModule = typeof import('./ultimate-pack.js');

let packModP: Promise<PackModule | null> | null = null;

// módulo do roll de pack (openPack etc.) — null se a cadeia não carregar.
export function loadPackModule(): Promise<PackModule | null> {
  if (!packModP) {
    packModP = import('./ultimate-pack.js').catch(() => null);
  }
  return packModP;
}

// lookup de carta pro anchor de preço do mercado (ovr/raridade/valor/special)
// — null se a cadeia não carregar. Recriado por chamada porque o catálogo é
// mensal (serverCatalogIndex já cacheia por mês internamente).
export async function loadMktCardLookup(now: Date): Promise<MktCardLookup | null> {
  try {
    // value/special vêm PRÉ-CALCULADOS do snapshot (gen-ult-catalog) — nenhuma
    // parte da cadeia pesada do engine é tocada em runtime.
    const pack = await import('./ultimate-pack.js');
    const idx = pack.serverCatalogIndex(now);
    return (cardKey: string): MktCardInfo | null => {
      const c = idx.get(cardKey);
      if (!c) return null;
      return { ovr: c.ovr, rarity: c.rarity, value: c.value, special: c.special };
    };
  } catch {
    return null;
  }
}

// [O0-02] valor de quick-sell pelo catálogo do servidor (snapshot do mês):
// raridade/OVR do snapshot + a MESMA regra do cliente (quicksell.ts, cadeia
// runtime-safe). null se a cadeia não carregar — a rota responde 503 e a
// fila-sombra do cliente re-tenta com o mesmo op_id.
export async function loadQuicksellValuer(now: Date): Promise<UltQuicksellValuer | null> {
  try {
    const [pack, qs] = await Promise.all([import('./ultimate-pack.js'), import('../src/engine/ultimate/quicksell.js')]);
    const idx = pack.serverCatalogIndex(now);
    return (cardKey: string, isDuplicate: boolean): number | null => {
      const c = idx.get(cardKey);
      return c ? qs.quickSellValue(c.rarity, c.ovr, isDuplicate) : null;
    };
  } catch {
    return null;
  }
}
