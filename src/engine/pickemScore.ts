// PLACAR DO PICK'EM — pontua o palpite contra o resultado REAL do PGL Major
// Singapore, Stage a Stage, conforme os resultados oficiais entram por PR de
// dados (src/data/major-singapore-2026-results.json, lido em
// src/data/majorResults.ts, onde está o formato do arquivo).
//
// A regra de pontos é a de scorePicks (engine/majorSingapore.ts), pela mesma
// constante PICKEM_POINTS: 1 por classificado certo, 2 por 3-0/0-3 certo, 2 por
// vencedor de quartas/semi, 5 pelo campeão. Somando todas as partes, o total
// bate com scorePicks (conferido em scripts/test-pickem-score.mts).
//
// TS PURO: sem React, sem window, sem relógio (o "agora" entra por parâmetro).

import {
  EXTREME_PICKS, PICKEM_POINTS, picksComplete, stageEntrants,
  type MajorData, type MajorPicks, type MajorResult, type StageNo,
} from './majorSingapore';

// ---------------------------------------------------------------- tipos

/** resultado oficial de um Stage suíço, já validado */
export interface StageOutcome {
  /** os 8 que fecharam 3 vitórias */
  qualified: string[];
  /** os 2 que fecharam 3-0 (estão em qualified) */
  x30: string[];
  /** os 2 que caíram 0-3 (fora de qualified) */
  x03: string[];
  source: string;
  updatedAt: string;
}

/** playoffs, já validados. Rodada sem resultado = lista vazia / ''. */
export interface PlayoffOutcome {
  /** [] ou os 4 vencedores das quartas */
  qf: string[];
  /** [] ou os 2 vencedores das semis */
  sf: string[];
  /** '' ou o campeão */
  champion: string;
  source: string;
  updatedAt: string;
}

export interface MajorOutcomes {
  stages: [StageOutcome | null, StageOutcome | null, StageOutcome | null];
  playoffs: PlayoffOutcome | null;
}

export const NO_OUTCOMES: MajorOutcomes = { stages: [null, null, null], playoffs: null };

// ---------------------------------------------------------------- validação

const STAGE_KEYS = ['qualified', 'x30', 'x03', 'source', 'updatedAt'];
const PLAYOFF_KEYS = ['qf', 'sf', 'champion', 'source', 'updatedAt'];
const TOP_KEYS = ['$comment', 'stage1', 'stage2', 'stage3', 'playoffs'];
const URL_RE = /^https?:\/\/\S+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const blank = (x: unknown) => x == null || x === '';
const ids = (x: unknown): string[] | null => (Array.isArray(x) && x.every((v) => typeof v === 'string') ? (x as string[]) : null);
const dups = (xs: string[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];

function extraKeys(where: string, o: Record<string, unknown>, allowed: string[], warnings: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) warnings.push(`${where}: chave desconhecida "${k}" (ignorada)`);
}

function checkSource(o: Record<string, unknown>, errs: string[]): string {
  if (typeof o.source === 'string' && URL_RE.test(o.source.trim())) return o.source.trim();
  errs.push('sem source (URL da página com o resultado)');
  return '';
}

function checkDate(where: string, o: Record<string, unknown>, warnings: string[]): string {
  if (typeof o.updatedAt === 'string' && DATE_RE.test(o.updatedAt)) return o.updatedAt;
  warnings.push(`${where}: updatedAt devia ser AAAA-MM-DD (veio ${JSON.stringify(o.updatedAt ?? null)})`);
  return '';
}

function validateStage(
  stage: StageNo, raw: unknown, known: Set<string>, field: Set<string>, warnings: string[],
): StageOutcome | null {
  const where = `Stage ${stage}`;
  if (raw == null) return null;
  if (!isObj(raw)) { warnings.push(`${where} ignorado: devia ser um objeto`); return null; }
  extraKeys(where, raw, STAGE_KEYS, warnings);
  const q = ids(raw.qualified ?? []);
  const a = ids(raw.x30 ?? []);
  const z = ids(raw.x03 ?? []);
  if (!q || !a || !z) { warnings.push(`${where} ignorado: qualified, x30 e x03 são listas de ids`); return null; }
  // tudo vazio = o Stage ainda não terminou (não é erro)
  if (!q.length && !a.length && !z.length && blank(raw.source)) return null;

  const errs: string[] = [];
  if (q.length !== 8) errs.push(`incompleto: ${q.length} classificados (precisa de 8)`);
  if (a.length !== EXTREME_PICKS) errs.push(`incompleto: ${a.length} em 3-0 (precisa de ${EXTREME_PICKS})`);
  if (z.length !== EXTREME_PICKS) errs.push(`incompleto: ${z.length} em 0-3 (precisa de ${EXTREME_PICKS})`);
  for (const [name, list] of [['qualified', q], ['x30', a], ['x03', z]] as const) {
    for (const id of dups(list)) errs.push(`id repetido em ${name}: ${id}`);
  }
  for (const id of new Set([...q, ...a, ...z])) {
    if (!known.has(id)) errs.push(`id desconhecido: ${id}`);
    else if (!field.has(id)) errs.push(`${id} não joga o Stage ${stage}`);
  }
  for (const id of a) if (!q.includes(id)) errs.push(`3-0 fora dos classificados: ${id}`);
  for (const id of z) if (q.includes(id)) errs.push(`0-3 entre os classificados: ${id}`);
  const source = checkSource(raw, errs);
  if (errs.length) { warnings.push(`${where} ignorado: ${errs.join('; ')}`); return null; }
  return { qualified: [...q], x30: [...a], x03: [...z], source, updatedAt: checkDate(where, raw, warnings) };
}

function validatePlayoffs(raw: unknown, known: Set<string>, s3: StageOutcome | null, warnings: string[]): PlayoffOutcome | null {
  const where = 'Playoffs';
  if (raw == null) return null;
  if (!isObj(raw)) { warnings.push(`${where} ignorados: devia ser um objeto`); return null; }
  extraKeys(where, raw, PLAYOFF_KEYS, warnings);
  const qf = ids(raw.qf ?? []);
  const sf = ids(raw.sf ?? []);
  const champ = blank(raw.champion) ? '' : raw.champion;
  if (!qf || !sf || typeof champ !== 'string') { warnings.push(`${where} ignorados: qf e sf são listas de ids e champion é um id ou null`); return null; }
  if (!qf.length && !sf.length && !champ && blank(raw.source)) return null;

  const errs: string[] = [];
  if (qf.length !== 0 && qf.length !== 4) errs.push(`quartas incompletas: ${qf.length} vencedores (precisa de 4)`);
  if (sf.length !== 0 && sf.length !== 2) errs.push(`semis incompletas: ${sf.length} vencedores (precisa de 2)`);
  if (!qf.length && !sf.length && !champ) errs.push('nenhum vencedor preenchido');
  if (sf.length && qf.length !== 4) errs.push('semis preenchidas sem as quartas');
  if (champ && sf.length !== 2) errs.push('campeão preenchido sem as semis');
  for (const [name, list] of [['qf', qf], ['sf', sf]] as const) {
    for (const id of dups(list)) errs.push(`id repetido em ${name}: ${id}`);
  }
  for (const id of new Set([...qf, ...sf, ...(champ ? [champ] : [])])) {
    if (!known.has(id)) errs.push(`id desconhecido: ${id}`);
    else if (s3 && !s3.qualified.includes(id)) errs.push(`${id} não está entre os 8 do Stage 3`);
  }
  for (const id of sf) if (qf.length === 4 && !qf.includes(id)) errs.push(`semi vencida por quem não venceu as quartas: ${id}`);
  if (champ && sf.length === 2 && !sf.includes(champ)) errs.push(`campeão não venceu uma semi: ${champ}`);
  const source = checkSource(raw, errs);
  if (errs.length) { warnings.push(`${where} ignorados: ${errs.join('; ')}`); return null; }
  return { qf: [...qf], sf: [...sf], champion: champ, source, updatedAt: checkDate(where, raw, warnings) };
}

/**
 * Valida o JSON de resultados contra a lista de times. O que estiver errado
 * (id desconhecido, Stage incompleto, sem source…) é IGNORADO com um aviso:
 * o placar nunca mostra um Stage pela metade. Avisos que não derrubam o Stage
 * (chave desconhecida, data fora do formato) também entram em `warnings`.
 */
export function validateMajorResults(d: MajorData, raw: unknown): { outcomes: MajorOutcomes; warnings: string[] } {
  const warnings: string[] = [];
  if (!isObj(raw)) return { outcomes: NO_OUTCOMES, warnings: ['arquivo de resultados não é um objeto JSON'] };
  extraKeys('arquivo', raw, TOP_KEYS, warnings);
  const known = new Set(d.teams.map((t) => t.id));
  const stages: MajorOutcomes['stages'] = [null, null, null];
  // quem pode aparecer no Stage N: os que entram nele + os classificados do
  // anterior (ou, sem resultado do anterior, todo mundo que jogou antes)
  let carry = new Set<string>();
  for (const st of [1, 2, 3] as StageNo[]) {
    const field = new Set([...stageEntrants(d, st).map((t) => t.id), ...carry]);
    const out = validateStage(st, raw[`stage${st}`], known, field, warnings);
    stages[st - 1] = out;
    carry = out ? new Set(out.qualified) : field;
  }
  const playoffs = validatePlayoffs(raw.playoffs, known, stages[2], warnings);
  return { outcomes: { stages, playoffs }, warnings };
}

// ---------------------------------------------------------------- pontuação

/** um time do palpite e se ele acertou */
export interface Mark { id: string; hit: boolean }

export interface StageScore {
  stage: StageNo;
  /** os 8 classificados do palpite */
  qualified: Mark[];
  /** os 3-0 do palpite (0..2) */
  x30: Mark[];
  /** os 0-3 do palpite (0..2) */
  x03: Mark[];
  /** classificados certos (0..8) */
  hits: number;
  points: number;
  max: number;
}

export interface PlayoffScore {
  /** null = rodada ainda sem resultado */
  qf: Mark[] | null;
  sf: Mark[] | null;
  /** o campeão do palpite (lista de 0 ou 1) */
  final: Mark[] | null;
  points: number;
  /** máximo só das rodadas que já têm resultado */
  max: number;
}

const P = PICKEM_POINTS;
/** por Stage: 8 classificados + 2 de 3-0 + 2 de 0-3 = 16 */
export const STAGE_MAX = 8 * P.qualified + 2 * EXTREME_PICKS * P.extreme;
export const PLAYOFF_MAX = { qf: 4 * P.playoffWin, sf: 2 * P.playoffWin, final: P.champion } as const;
/** o Major inteiro (65), o mesmo `max` de scorePicks */
export const MAX_TOTAL = 3 * STAGE_MAX + PLAYOFF_MAX.qf + PLAYOFF_MAX.sf + PLAYOFF_MAX.final;

const mark = (mine: string[], real: string[]): Mark[] => mine.filter(Boolean).map((id) => ({ id, hit: real.includes(id) }));
const hitsOf = (m: Mark[] | null) => (m ?? []).filter((x) => x.hit).length;

export function scoreStage(p: MajorPicks, stageNo: StageNo, r: StageOutcome): StageScore {
  const i = stageNo - 1;
  const qualified = mark(p[`s${stageNo}` as 's1' | 's2' | 's3'] ?? [], r.qualified);
  const x30 = mark(p.x30?.[i] ?? [], r.x30);
  const x03 = mark(p.x03?.[i] ?? [], r.x03);
  const hits = hitsOf(qualified);
  const points = hits * P.qualified + (hitsOf(x30) + hitsOf(x03)) * P.extreme;
  return { stage: stageNo, qualified, x30, x03, hits, points, max: STAGE_MAX };
}

/**
 * Como em scorePicks: o vencedor de quartas/semi do palpite conta se o time
 * venceu ALGUM jogo daquela fase (a chave real é semeada pelo suíço, a do
 * palpite pelo seed do evento, então a posição não importa).
 */
export function scorePlayoffs(p: MajorPicks, r: PlayoffOutcome): PlayoffScore {
  const qf = r.qf.length === 4 ? mark(p.bracket.slice(0, 4), r.qf) : null;
  const sf = r.sf.length === 2 ? mark(p.bracket.slice(4, 6), r.sf) : null;
  const final = r.champion ? mark([p.bracket[6] ?? ''], [r.champion]) : null;
  const points = (hitsOf(qf) + hitsOf(sf)) * P.playoffWin + hitsOf(final) * P.champion;
  const max = (qf ? PLAYOFF_MAX.qf : 0) + (sf ? PLAYOFF_MAX.sf : 0) + (final ? PLAYOFF_MAX.final : 0);
  return { qf, sf, final, points, max };
}

export interface ScoreSoFar {
  stages: [StageScore | null, StageScore | null, StageScore | null];
  playoffs: PlayoffScore | null;
  points: number;
  /** máximo das partes que já têm resultado */
  max: number;
  /** máximo do Major inteiro (65) */
  maxTotal: number;
}

export function scoreSoFar(p: MajorPicks, o: MajorOutcomes): ScoreSoFar {
  const stages = o.stages.map((r, i) => (r ? scoreStage(p, (i + 1) as StageNo, r) : null)) as ScoreSoFar['stages'];
  const playoffs = o.playoffs ? scorePlayoffs(p, o.playoffs) : null;
  const parts = [...stages, playoffs].filter((x): x is StageScore | PlayoffScore => !!x);
  return {
    stages,
    playoffs,
    points: parts.reduce((s, x) => s + x.points, 0),
    max: parts.reduce((s, x) => s + x.max, 0),
    maxTotal: MAX_TOTAL,
  };
}

// ---------------------------------------------------------------- estado da UI

/** até onde já tem resultado: Stage 1..3, quartas, semis ou final */
export type PlacarThrough = 1 | 2 | 3 | 'qf' | 'sf' | 'final';

export type PlacarView =
  /** palpite incompleto; started = já saiu algum resultado */
  | { kind: 'incomplete'; started: boolean }
  /** palpite incompleto quando os palpites travaram: fora do placar */
  | { kind: 'excluded' }
  /** palpite completo, nenhum resultado ainda; late = o Stage 1 já devia ter terminado */
  | { kind: 'waiting'; late: boolean }
  /** com pontos; next = o Stage seguinte ainda sem resultado (null nos playoffs) */
  | { kind: 'scored'; score: ScoreSoFar; through: PlacarThrough; next: 2 | 3 | 'playoffs' | null; final: boolean };

export function hasOutcomes(o: MajorOutcomes): boolean {
  return o.stages.some(Boolean) || !!o.playoffs;
}

/** qual mensagem o placar mostra (MajorScoreboard.tsx) */
export function placarView(p: MajorPicks, o: MajorOutcomes, nowMs: number, stage1EndsMs: number, lockMs = Infinity): PlacarView {
  const started = hasOutcomes(o);
  if (!picksComplete(p)) return nowMs >= lockMs ? { kind: 'excluded' } : { kind: 'incomplete', started };
  if (!started) return { kind: 'waiting', late: nowMs >= stage1EndsMs };
  const score = scoreSoFar(p, o);
  const po = o.playoffs;
  const last = o.stages[2] ? 3 : o.stages[1] ? 2 : 1;
  const through: PlacarThrough = po ? (po.champion ? 'final' : po.sf.length ? 'sf' : 'qf') : last;
  const next = po ? null : last === 3 ? 'playoffs' : ((last + 1) as 2 | 3);
  return { kind: 'scored', score, through, next, final: through === 'final' };
}

// ---------------------------------------------------------------- simulação → resultado

/**
 * Converte um Major simulado no formato de resultado, até a parte `upTo`
 * (1–3 = até o Stage N; 4 = + quartas; 5 = + semis; 6 = + campeão). Serve aos
 * testes (o placar completo tem de bater com scorePicks) e à prévia de dev
 * (?placar=demoN em `npm run dev`). Nunca é resultado real.
 */
export function outcomesFromSim(r: MajorResult, upTo: 1 | 2 | 3 | 4 | 5 | 6, source: string): MajorOutcomes {
  const rec = (i: number, w: number, l: number) => r.stages[i].records.filter((x) => x.w === w && x.l === l).map((x) => x.id);
  const stage = (i: number): StageOutcome | null => (upTo > i
    ? { qualified: [...r.stages[i].advanced], x30: rec(i, 3, 0), x03: rec(i, 0, 3), source, updatedAt: '' }
    : null);
  const playoffs: PlayoffOutcome | null = upTo >= 4
    ? {
      qf: r.playoffs.qf.map((m) => m.winner),
      sf: upTo >= 5 ? r.playoffs.sf.map((m) => m.winner) : [],
      champion: upTo >= 6 ? r.playoffs.champion : '',
      source,
      updatedAt: '',
    }
    : null;
  return { stages: [stage(0), stage(1), stage(2)], playoffs };
}
