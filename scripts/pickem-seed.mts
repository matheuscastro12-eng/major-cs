// Gera scripts/migrations/2026-10-26-pickem-seed.sql a partir do JSON do Major.
// Uso: npx tsx scripts/pickem-seed.mts   (refazer depois da lista oficial de 02/11)
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSeedSql } from '../src/engine/pickemSeed';
const D = JSON.parse(readFileSync(new URL('../src/data/major-singapore-2026.json', import.meta.url), 'utf8'));
writeFileSync(new URL('./migrations/2026-10-26-pickem-seed.sql', import.meta.url), buildSeedSql(D));
console.log('ok');
