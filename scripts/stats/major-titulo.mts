// Monte Carlo de título do PGL Major Singapore 2026 — UM comando.
//
//   npm run stats:major-titulo                       # lista atual do repo, 10.000 sims
//   npm run stats:major-titulo -- --lista oficial.json   # 02/11: troca a lista e roda
//
// Opções: --lista <json>  troca src/data/major-singapore-2026.json por esse arquivo (valida antes; backup em <out>/backup-lista-*.json)
//         --sims 10000 --seed 20261124 --workers <nCPU-1>  --out-dir /workspace/major-cs/stats
//         --status PROVISORIO|OFICIAL   (padrão: deduzido de listStatus do JSON; "oficial" → OFICIAL)
// Gera <out>/major-titulo-<STATUS>-<sims>sims.json e .csv (título, playoffs, passar de cada Stage).
// Reprodutível: mesma lista + sims + seed + workers → mesmo resultado (cada worker usa seed+i*7919).
// NÃO escreve em banco, NÃO faz push/deploy. Só altera o JSON da lista quando --lista é passado.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const LISTA = join(REPO, 'src/data/major-singapore-2026.json');
const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };

// ---------- worker: roda um pedaço das simulações e imprime JSON ----------
if (arg('shard') !== undefined) {
  const { monteCarlo } = await import('../../src/engine/majorSingapore/index.ts');
  const { MAJOR_SG_CONFIG, MAJOR_SG_DATASET } = await import('../../src/engine/majorSingapore/data.ts');
  const p = monteCarlo(MAJOR_SG_CONFIG, MAJOR_SG_DATASET, Number(arg('sims')), Number(arg('seed')));
  writeFileSync(arg('shard-out')!, JSON.stringify(p));
  process.exit(0);
}

// ---------- orquestrador ----------
const sims = Number(arg('sims', '10000'));
const seed = Number(arg('seed', '20261124'));
const workers = Math.max(1, Math.min(sims, Number(arg('workers', String(Math.max(1, cpus().length - 1))))));
const outDir = resolve(arg('out-dir', '/workspace/major-cs/stats')!);
mkdirSync(outDir, { recursive: true });

const listaNova = arg('lista');
if (listaNova) {
  const { validateConfig } = await import('../../src/engine/majorSingapore/index.ts');
  const { MAJOR_SG_DATASET } = await import('../../src/engine/majorSingapore/data.ts');
  const novo = JSON.parse(readFileSync(resolve(listaNova), 'utf8'));
  const errs = validateConfig(novo, MAJOR_SG_DATASET);
  if (errs.length) { console.error('Lista inválida, nada foi trocado:\n- ' + errs.join('\n- ')); process.exit(1); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(LISTA, join(outDir, `backup-lista-${stamp}.json`));
  writeFileSync(LISTA, JSON.stringify(novo, null, 1) + '\n');
  console.log(`Lista trocada (${novo.teams.length} times, listStatus=${novo.listStatus}). Backup: backup-lista-${stamp}.json`);
}

const cfg = JSON.parse(readFileSync(LISTA, 'utf8'));
const oficial = /oficial/i.test(String(cfg.listStatus)) && !/provis|n[ãa]o/i.test(String(cfg.listStatus));
const status = (arg('status') ?? (oficial ? 'OFICIAL' : 'PROVISORIO')).toUpperCase().replace('Ó', 'O');
const base = `major-titulo-${status}-${sims}sims`;

console.log(`Rodando ${sims} simulações em ${workers} workers · seed ${seed} · lista ${cfg.updatedAt} (${cfg.listStatus}) → ${status}`);
const t0 = Date.now();
const sizes = Array.from({ length: workers }, (_, i) => Math.floor(sims / workers) + (i < sims % workers ? 1 : 0));
const tmp = sizes.map((_, i) => join(outDir, `.shard-${process.pid}-${i}.json`));
await Promise.all(sizes.map((n, i) => new Promise<void>((ok, bad) => {
  const c = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--shard', String(i), '--sims', String(n), '--seed', String(seed + i * 7919), '--shard-out', tmp[i]], { cwd: REPO, stdio: ['ignore', 'inherit', 'inherit'] });
  c.on('exit', (code) => (code === 0 ? ok() : bad(new Error(`worker ${i} saiu com ${code}`))));
})));

type Odds = { id: string; team: string; tag: string; entryStage: number; provisional: boolean; stageGuess?: boolean; strength: number; passStage1: number | null; passStage2: number | null; playoffs: number; semis: number; final: number; title: number };
const shards = tmp.map((f) => JSON.parse(readFileSync(f, 'utf8')) as { teams: Odds[]; event: string; listStatus: string; generatedFrom: string });
tmp.forEach((f) => rmSync(f));
const keys = ['passStage1', 'passStage2', 'playoffs', 'semis', 'final', 'title'] as const;
const merged: Odds[] = shards[0].teams.map((t) => {
  const o = { ...t } as Odds;
  for (const k of keys) {
    if (t[k] == null) { (o as Record<string, unknown>)[k] = null; continue; }
    let sum = 0;
    shards.forEach((s, i) => { sum += s.teams.find((x) => x.id === t.id)![k]! * sizes[i]; });
    (o as Record<string, unknown>)[k] = sum / sims;
  }
  return o;
}).sort((a, b) => b.title - a.title || b.playoffs - a.playoffs);

const pct1 = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 10);
const ic95 = (p: number) => Math.round(1.96 * Math.sqrt((p * (1 - p)) / sims) * 1000) / 10; // ± pontos percentuais
const teams = merged.map((t, i) => ({
  rank: i + 1, team: t.team, tag: t.tag, id: t.id, entryStage: t.entryStage, provisionalSlot: t.provisional, stageGuess: !!t.stageGuess, strength: t.strength,
  passStage1Pct: pct1(t.passStage1), passStage2Pct: pct1(t.passStage2), passStage3_playoffsPct: pct1(t.playoffs),
  semisPct: pct1(t.semis), finalPct: pct1(t.final), titlePct: pct1(t.title), titleErrPP95: ic95(t.title),
}));
const json = {
  status,
  aviso: oficial ? 'Lista oficial.' : 'PROVISÓRIO: lista provisória (placeholders e Stage de entrada palpite). NÃO publicar estes números.',
  event: shards[0].event, listStatus: cfg.listStatus, listUpdatedAt: cfg.updatedAt, generatedAt: new Date().toISOString(),
  sims, seed, workers, shardSeeds: sizes.map((_, i) => seed + i * 7919), unit: '%',
  nota: 'passStage1 = passa do Stage 1 (só quem entra nele); passStage2 = passa do Stage 2; passStage3_playoffs = passa do Stage 3 (chega ao Champions Stage, 8 times). titleErrPP95 = margem ±pontos percentuais (IC95).',
  teams,
};
writeFileSync(join(outDir, `${base}.json`), JSON.stringify(json, null, 1) + '\n');
const hdr = ['status', 'rank', 'time', 'tag', 'stage_entrada', 'vaga_provisoria', 'stage_palpite', 'forca', 'passa_stage1_pct', 'passa_stage2_pct', 'passa_stage3_playoffs_pct', 'semis_pct', 'final_pct', 'titulo_pct', 'titulo_erro_pp95'];
const csv = [hdr.join(',')].concat(teams.map((t) => [status, t.rank, `"${t.team}"`, t.tag, t.entryStage, t.provisionalSlot, t.stageGuess, t.strength, t.passStage1Pct ?? '', t.passStage2Pct ?? '', t.passStage3_playoffsPct, t.semisPct, t.finalPct, t.titlePct, t.titleErrPP95].join(','))).join('\n') + '\n';
writeFileSync(join(outDir, `${base}.csv`), csv);

console.log(`\n[${status}] ${sims} sims em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log('Top 10 título:');
for (const t of teams.slice(0, 10)) console.log(`${String(t.rank).padStart(2)}. ${t.team.padEnd(18)} título ${String(t.titlePct).padStart(5)}% (±${t.titleErrPP95})  playoffs ${t.passStage3_playoffsPct}%`);
console.log(`\nArquivos:\n${join(outDir, base)}.json\n${join(outDir, base)}.csv`);
