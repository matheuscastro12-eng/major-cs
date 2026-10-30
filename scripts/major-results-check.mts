// Confere o JSON de resultados do PGL Major Singapore ANTES do merge do PR de
// dados (formato no topo de src/data/majorResults.ts) e imprime o placar de um
// palpite, para ver os pontos saindo como esperado.
//
//   npx tsx scripts/major-results-check.mts                     # o arquivo do repo
//   npx tsx scripts/major-results-check.mts caminho/outro.json  # outro arquivo
//   npx tsx scripts/major-results-check.mts --palpite <código>  # o ?p= de um link de palpite
//                                                               # (ou o link inteiro, entre aspas)
//
// Sem --palpite, usa um palpite de exemplo: os melhores seeds de cada Stage.
// Sai com código 1 se houver qualquer aviso (Stage ignorado, id desconhecido,
// sem source…): o PR de dados só entra com "tudo ok".

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import data from '../src/data/major-singapore-2026.json' with { type: 'json' };
import {
  bracketSides, decodePicks, emptyPicks, listVersion, normalizePicks, pickPool, validateMajorData,
  type MajorData, type MajorPicks, type StageNo,
} from '../src/engine/majorSingapore.ts';
import { scoreSoFar, validateMajorResults, type Mark } from '../src/engine/pickemScore.ts';

const D = data as unknown as MajorData;
const DEFAULT = 'src/data/major-singapore-2026-results.json';
const ROOT = new URL('..', import.meta.url).pathname;
const teams = new Map(D.teams.map((t) => [t.id, t]));
const name = (id: string) => teams.get(id)?.name ?? id;

function fail(msg: string): never {
  console.error(`ERRO: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- argumentos
const args = process.argv.slice(2);
let file = DEFAULT;
let code = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--palpite') code = args[++i] ?? fail('--palpite precisa do código (ou do link) do palpite');
  else file = args[i];
}
if (code.includes('p=')) code = new URL(code, 'https://roadtomajor.com.br').searchParams.get('p') ?? '';

// ---------------------------------------------------------------- arquivo
const teamErrs = validateMajorData(D);
if (teamErrs.length) fail(`o JSON dos times tem problema: ${teamErrs.join('; ')}`);
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
} catch (e) {
  fail(`não deu para ler ${file} como JSON (${(e as Error).message})`);
}
const { outcomes, warnings } = validateMajorResults(D, raw);

console.log(`Arquivo: ${file}`);
console.log(`Times: ${D.teams.length} (lista ${D.event.status}, versão ${listVersion(D)})\n`);
const tags = (ids: string[]) => ids.map(name).join(', ') || '—';
outcomes.stages.forEach((s, i) => {
  if (!s) { console.log(`Stage ${i + 1}: sem resultado`); return; }
  console.log(`Stage ${i + 1}: ok · classificados: ${tags(s.qualified)}`);
  console.log(`         3-0: ${tags(s.x30)} · 0-3: ${tags(s.x03)}`);
  console.log(`         fonte: ${s.source} (${s.updatedAt || 'sem data'})`);
});
const po = outcomes.playoffs;
if (!po) console.log('Playoffs: sem resultado');
else {
  console.log(`Playoffs: quartas: ${tags(po.qf)} · semis: ${tags(po.sf)} · campeão: ${po.champion ? name(po.champion) : '—'}`);
  console.log(`          fonte: ${po.source} (${po.updatedAt || 'sem data'})`);
}

// ---------------------------------------------------------------- palpite
/** palpite de exemplo: em cada Stage os 8 melhores seeds; 3-0 = os 2 melhores, 0-3 = os 2 piores; na chave vence o melhor seed */
function seedPicks(): MajorPicks {
  let p = emptyPicks();
  for (const st of [1, 2, 3] as StageNo[]) {
    const pool = pickPool(D, p, st).map((t) => t.id); // já em ordem de seed
    const i = st - 1;
    const x30 = [...p.x30] as MajorPicks['x30'];
    const x03 = [...p.x03] as MajorPicks['x03'];
    x30[i] = pool.slice(0, 2);
    x03[i] = pool.slice(-2);
    p = normalizePicks(D, { ...p, [`s${st}`]: pool.slice(0, 8), x30, x03 });
  }
  const bracket = [...p.bracket];
  for (let g = 0; g < 7; g++) {
    const sides = bracketSides(D, { ...p, bracket })[g];
    bracket[g] = [...sides].sort((a, b) => (teams.get(a)?.seed ?? 99) - (teams.get(b)?.seed ?? 99))[0];
  }
  return normalizePicks(D, { ...p, bracket });
}

const picks = code ? decodePicks(D, code) : seedPicks();
if (!picks) fail('código de palpite inválido (link de outra versão da lista de times?)');
const s = scoreSoFar(picks, outcomes);
const marks = (m: Mark[] | null) => (m == null ? 'aguardando' : m.length ? m.map((x) => `${x.hit ? '✓' : '✗'} ${name(x.id)}`).join(', ') : 'sem palpite');

console.log(`\nPlacar do ${code ? 'palpite do link' : 'palpite de exemplo (melhores seeds)'}:`);
s.stages.forEach((st, i) => {
  if (!st) { console.log(`  Stage ${i + 1}: aguardando`); return; }
  console.log(`  Stage ${i + 1}: ${st.points} de ${st.max} · ${st.hits}/8 classificados`);
  console.log(`    classificados: ${marks(st.qualified)}`);
  console.log(`    3-0: ${marks(st.x30)} · 0-3: ${marks(st.x03)}`);
});
if (!s.playoffs) console.log('  Playoffs: aguardando');
else {
  console.log(`  Playoffs: ${s.playoffs.points} de ${s.playoffs.max}`);
  console.log(`    quartas: ${marks(s.playoffs.qf)} · semis: ${marks(s.playoffs.sf)} · campeão: ${marks(s.playoffs.final)}`);
}
console.log(`  Total: ${s.points} de ${s.max} pontos até agora (o Major inteiro vale ${s.maxTotal})\n`);

if (warnings.length) {
  console.log(`AVISOS (${warnings.length}): corrija antes do merge`);
  for (const w of warnings) console.log(`  - ${w}`);
  process.exit(1);
}
console.log('Resultado: tudo ok');
