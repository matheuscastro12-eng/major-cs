// Previsões do modo Major Singapore 2026 por Monte Carlo (base dos posts no X).
// Uso: npx tsx scripts/major-singapore-predict.mts [--sims 1000] [--seed 20261124] [--out caminho.json]
// Grava o JSON consumido pela tela (src/data/major-singapore-2026-prediction.json)
// e imprime um resumo em texto pronto pra post. Rodar de novo depois de trocar
// src/data/major-singapore-2026.json (lista oficial em 02/11).
import { writeFileSync } from 'node:fs';
import { monteCarlo } from '../src/engine/majorSingapore/index.ts';
import { MAJOR_SG_CONFIG, MAJOR_SG_DATASET } from '../src/engine/majorSingapore/data.ts';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const sims = Number(arg('sims', '1000'));
const seed = Number(arg('seed', '20261124'));
const out = arg('out', 'src/data/major-singapore-2026-prediction.json');

const t0 = Date.now();
const p = monteCarlo(MAJOR_SG_CONFIG, MAJOR_SG_DATASET, sims, seed);
const round = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 10); // em %
const json = { ...p, unit: '%', teams: p.teams.map((t) => ({ ...t, passStage1: round(t.passStage1), passStage2: round(t.passStage2), playoffs: round(t.playoffs), semis: round(t.semis), final: round(t.final), title: round(t.title) })) };
writeFileSync(out, JSON.stringify(json, null, 1) + '\n');

const pct = (x: number | null) => (x == null ? '  —  ' : `${(x * 100).toFixed(1).padStart(5)}%`);
console.log(`${p.event} · ${sims} simulações · seed ${seed} · ${p.generatedFrom} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log('time                 entra  S1     S2     playoffs  título');
for (const t of p.teams) console.log(`${(t.team + (t.provisional ? '*' : '')).padEnd(20)} S${t.entryStage}   ${pct(t.passStage1)} ${pct(t.passStage2)} ${pct(t.playoffs)}  ${pct(t.title)}`);
console.log('* = vaga provisória (placeholder até a lista oficial)');
console.log(`\nTop 5 favoritos ao título:\n${p.teams.slice(0, 5).map((t, i) => `${i + 1}. ${t.team} — ${(t.title * 100).toFixed(1)}%`).join('\n')}`);
console.log(`\nJSON: ${out}`);
