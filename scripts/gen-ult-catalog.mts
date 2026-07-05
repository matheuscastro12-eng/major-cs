// Gera server/ultimate-catalog.snapshot.ts — o catálogo do Ultimate MATERIALIZADO
// pro servidor (Vercel compila api/ sem bundle e a cadeia completa do engine
// [cards → data/regions → bo3.json] não carrega no Node ESM em runtime; o
// snapshot é um módulo TS puro, sem nenhum import de runtime, que carrega sempre).
//
// Rode com: npm run gen:ult-catalog   (tsx roda a cadeia do engine numa boa)
// O teste server/ultimate-catalog-snapshot.test.ts FALHA se o snapshot divergir
// do engine (mudou odds/dataset/promos → regenerar e commitar junto).
import { writeFileSync } from 'node:fs';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { estimateCardValue } from '../src/engine/ultimate/cards.ts';
import { buildFullCatalog } from '../src/engine/ultimate/catalog.ts';
import { isSpecial } from '../src/engine/ultimate/rarities.ts';

// Faixa de meses cobertos (monthIndex = year*12 + month0). O catálogo varia por
// mês (promos rotativas acumuladas) — cobrimos jul/2026..dez/2027; quando o
// teste de cobertura avisar que o mês corrente está fora, regenerar com a faixa
// estendida.
const FIRST = 2026 * 12 + 6; // jul/2026
const LAST = 2027 * 12 + 11; // dez/2027

const months: Record<number, unknown[]> = {};
for (let mi = FIRST; mi <= LAST; mi++) {
  const { catalog } = buildFullCatalog(CS2_REAL_2026, mi);
  months[mi] = catalog.map((c) => ({
    ...c,
    value: estimateCardValue(c.ovr, c.rarity),
    special: isSpecial(c.rarity),
  }));
}

const header = `// ARQUIVO GERADO por scripts/gen-ult-catalog.mts — NÃO EDITAR À MÃO.
// Regenerar: npm run gen:ult-catalog (e commitar junto com a mudança de engine).
// Catálogo materializado por monthIndex (${FIRST}..${LAST}) com value
// (estimateCardValue) e special (isSpecial) pré-calculados — o servidor não
// importa a cadeia do engine em runtime (ver server/ultimate-pack.ts).
import type { UltCard } from '../src/engine/ultimate/cards.js';

export type SnapCard = UltCard & { value: number; special: boolean };

export const ULT_SNAPSHOT_FIRST_MONTH = ${FIRST};
export const ULT_SNAPSHOT_LAST_MONTH = ${LAST};

export const ULT_CATALOG_MONTHS: Record<number, SnapCard[]> = `;

writeFileSync(
  new URL('../server/ultimate-catalog.snapshot.ts', import.meta.url),
  `${header}${JSON.stringify(months)} as unknown as Record<number, SnapCard[]>;\n`,
);
const sample = months[FIRST]!;
console.log(`snapshot gerado: ${LAST - FIRST + 1} meses, ${sample.length} cartas no mês ${FIRST}`);
