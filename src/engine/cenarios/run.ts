// Ciclo de vida do Cenário: largada, registro dos fechamentos (etapa/split/
// Major) e a avaliação dos objetivos. Puro: a UI chama, o servidor recalcula.
import { normalizeMods, multiplierOf, MODIFIER_IDS } from './modifiers.js';
import type { CenarioDef, CenarioResult, CenarioRun, CenLogEntry, Grade, Medal, ModifierId, ObjectiveDef, ObjectiveStatus } from './types.js';

export function createRun(def: CenarioDef, a: { startSplit: number; startTier: number; mods: ModifierId[]; weekly?: string; seed?: string }): CenarioRun {
  return {
    v: 1, defId: def.id, startSplit: Math.max(1, Math.floor(a.startSplit)), startTier: clampTier(a.startTier),
    mods: normalizeMods(a.mods), ...(a.weekly ? { weekly: a.weekly } : {}), ...(a.seed ? { seed: a.seed } : {}), log: [],
  };
}

const clampTier = (t: number) => Math.max(1, Math.min(3, Math.round(Number(t) || 3)));
export const endSplitOf = (def: CenarioDef, run: Pick<CenarioRun, 'startSplit'>) => run.startSplit + def.deadline - 1;

export interface CenEventCtx {
  phase: 'e' | 's' | 'm';
  split: number;
  isChampion?: boolean;
  finalPos?: number;
  qualified?: boolean;
  wonMajor?: boolean;
  tier: number;
  budget: number;
  broken?: ModifierId[];
}

/** Acrescenta um fechamento ao log. Fora do prazo (ou run já encerrado) não muda nada. */
export function recordEvent(def: CenarioDef, run: CenarioRun, ctx: CenEventCtx): CenarioRun {
  if (ctx.split < run.startSplit || ctx.split > endSplitOf(def, run)) return run;
  if (evaluateRun(def, run, ctx.split).allDone) return run; // já cumpriu tudo: congela
  const e: CenLogEntry = { s: Math.floor(ctx.split), p: ctx.phase, t: clampTier(ctx.tier), b: Math.round((Number(ctx.budget) || 0) / 1000) };
  if (ctx.isChampion) e.c = 1;
  if (ctx.finalPos != null && ctx.phase === 'e') e.pos = Math.max(1, Math.min(64, Math.round(ctx.finalPos)));
  if (ctx.qualified) e.q = 1;
  if (ctx.wonMajor) e.w = 1;
  const x = (ctx.broken ?? []).filter((m) => run.mods.includes(m));
  if (x.length) e.x = x;
  return { ...run, log: [...run.log, e] };
}

// ─── avaliação ───────────────────────────────────────────────────────────────

function objectiveDoneAt(o: ObjectiveDef, run: CenarioRun, endSplit: number, currentSplit: number): { doneAt: number | null; failed: boolean } {
  const log = run.log;
  const closes = log.filter((e) => e.p === 's');
  switch (o.kind) {
    case 'reachTier': {
      const hit = closes.find((e) => e.t <= (o.param ?? 1));
      return { doneAt: hit?.s ?? null, failed: false };
    }
    case 'qualifyMajor': {
      const hit = log.find((e) => e.q);
      return { doneAt: hit?.s ?? null, failed: false };
    }
    case 'winMajor': {
      const hit = log.find((e) => e.p === 'm' && e.w);
      return { doneAt: hit?.s ?? null, failed: false };
    }
    case 'winTitles': case 'top4s': {
      const need = Math.max(1, o.param ?? 1);
      let n = 0;
      for (const e of log) {
        if (e.p !== 'e') continue;
        if (o.kind === 'winTitles' ? e.c : (e.pos ?? 99) <= 4) n += 1;
        if (n >= need) return { doneAt: e.s, failed: false };
      }
      return { doneAt: null, failed: false };
    }
    case 'cashAtLeast': {
      const hit = closes.find((e) => e.b * 1000 >= (o.param ?? 0));
      return { doneAt: hit?.s ?? null, failed: false };
    }
    case 'stayTier1': case 'neverDrop': {
      const limit = o.kind === 'stayTier1' ? 1 : run.startTier;
      const bad = closes.some((e) => e.t > limit);
      if (bad) return { doneAt: null, failed: true };
      // só se cumpre quando o PRAZO fecha com todos os splits registrados
      const lastClose = closes.length ? closes[closes.length - 1].s : 0;
      return { doneAt: currentSplit > endSplit && lastClose >= endSplit ? endSplit : null, failed: false };
    }
    default: return { doneAt: null, failed: false };
  }
}

export function gradeOf(objPts: number, objMax: number, base: number): Grade {
  if (objMax <= 0) return 'C';
  const ratio = objPts / objMax;
  if (ratio >= 1 && base >= objMax * 1.35) return 'S';
  if (ratio >= 1) return 'A';
  if (ratio >= 0.5) return 'B';
  return 'C';
}
export const MEDAL_OF: Record<Grade, Medal> = { S: 'diamante', A: 'ouro', B: 'prata', C: 'bronze' };

/** Pontos por desempenho fora dos objetivos (títulos, top 4, Majors). */
export const PERF = { title: 30, top4: 8, majorQ: 40, majorW: 200 } as const;

/**
 * Avalia o run no split corrente. `currentSplit` > fim do prazo = encerrado.
 * Os objetivos de "manter" (stayTier1/neverDrop) só pontuam no fechamento.
 */
export function evaluateRun(def: CenarioDef, run: CenarioRun, currentSplit: number): CenarioResult {
  const endSplit = endSplitOf(def, run);
  const objectives: ObjectiveStatus[] = def.objectives.map((o) => {
    const r = objectiveDoneAt(o, run, endSplit, currentSplit);
    const doneAt = r.doneAt != null && r.doneAt <= endSplit ? r.doneAt : null;
    return { def: o, doneAt, failed: r.failed };
  });
  const objMax = def.objectives.reduce((a, o) => a + o.pts, 0);
  const objPts = objectives.reduce((a, o) => a + (o.doneAt != null ? o.def.pts : 0), 0);
  // velocidade: até +50% do objetivo, proporcional aos splits que sobraram
  const speed = objectives.reduce((a, o) => (o.doneAt == null ? a : a + Math.round(o.def.pts * 0.5 * (endSplit - o.doneAt) / Math.max(1, def.deadline))), 0);
  let titles = 0, top4 = 0, majorQ = 0, majorW = 0;
  const qSplits = new Set<number>();
  for (const e of run.log) {
    if (e.p === 'e') { if (e.c) titles += 1; else if ((e.pos ?? 99) <= 4) top4 += 1; }
    if (e.q && !qSplits.has(e.s)) { qSplits.add(e.s); majorQ += 1; }
    if (e.p === 'm' && e.w) majorW += 1;
  }
  const perf = titles * PERF.title + top4 * PERF.top4 + majorQ * PERF.majorQ + majorW * PERF.majorW;
  const base = objPts + speed + perf;
  const broken = new Set(run.log.flatMap((e) => e.x ?? []));
  const modsKept = normalizeMods(run.mods).filter((m) => !broken.has(m));
  const mult = multiplierOf(modsKept);
  const allDone = objectives.every((o) => o.doneAt != null);
  const finished = currentSplit > endSplit || allDone;
  const grade = gradeOf(objPts, objMax, base);
  return { objectives, objPts, objMax, speed, perf, base, mult, modsKept, score: Math.round(base * mult), grade, medal: MEDAL_OF[grade], endSplit, finished, allDone };
}

/** Lê um run vindo do save (ou do cliente) com tolerância; null se inválido. */
export function parseRun(raw: unknown): CenarioRun | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || typeof o.defId !== 'string' || !Array.isArray(o.log)) return null;
  const log: CenLogEntry[] = [];
  for (const it of o.log.slice(0, 200)) {
    if (!it || typeof it !== 'object') return null;
    const e = it as Record<string, unknown>;
    const p = e.p;
    if (p !== 'e' && p !== 's' && p !== 'm') return null;
    const s = Number(e.s), t = Number(e.t), b = Number(e.b);
    if (!Number.isInteger(s) || !Number.isInteger(t) || !Number.isFinite(b)) return null;
    const out: CenLogEntry = { s, p, t, b: Math.round(b) };
    if (e.c) out.c = 1;
    if (e.q) out.q = 1;
    if (e.w) out.w = 1;
    if (e.pos != null) { const pos = Number(e.pos); if (!Number.isInteger(pos)) return null; out.pos = pos; }
    if (Array.isArray(e.x)) { const x = normalizeMods(e.x); if (x.length) out.x = x; }
    log.push(out);
  }
  const startSplit = Number(o.startSplit), startTier = Number(o.startTier);
  if (!Number.isInteger(startSplit) || startSplit < 1 || !Number.isInteger(startTier)) return null;
  return {
    v: 1, defId: o.defId.slice(0, 40), startSplit, startTier: clampTier(startTier), mods: normalizeMods(o.mods), log,
    ...(typeof o.weekly === 'string' ? { weekly: o.weekly.slice(0, 16) } : {}),
    ...(typeof o.seed === 'string' ? { seed: o.seed.slice(0, 40) } : {}),
    ...(Number.isFinite(Number(o.submitted)) && o.submitted != null ? { submitted: Number(o.submitted) } : {}),
  };
}

export { MODIFIER_IDS };
