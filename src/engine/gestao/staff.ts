// [fase 2 · frente STAFF] Comissão técnica estilo Football Manager.
//
// Cargos (StaffRole) com atributos 1–20 (StaffAttrKey). Cada efeito da comissão
// (StaffEffects) sai dos ATRIBUTOS CERTOS de quem ocupa os cargos certos:
//   - treino de mira ← aimCoaching do técnico e dos auxiliares;
//   - familiaridade tática ← tactics/mapKnowledge do técnico, auxiliares e analistas;
//   - leitura de anti-strat ← analysis/mapKnowledge dos analistas;
//   - precisão do olheiro ← judgingAbility/judgingPotential dos olheiros (estreita a faixa de CA/PA);
//   - recuperação de moral ← motivating/manManagement/mentalCoaching (psicólogo e técnico);
//   - risco/recuperação de lesão ← fitness do preparador físico;
//   - evolução dos jovens ← youthDevelopment dos auxiliares e do técnico.
//
// Régua: atributo 10 é a comissão MEDIANA e dá exatamente 1.0 (as frações
// antiStratRead/scoutAccuracy dão ~0,43). Comissão ruim fica abaixo de 1; elite
// chega a ~1,25. Cargo vago conta como um "quebra-galho" (atributo 7): o clube
// perde um pouco, mas não trava. SEM COMISSÃO NENHUMA (null ou lista vazia) o
// resultado é NEUTRO — exatamente o jogo de antes (contrato da fase 2).
//
// Este módulo é puro e NÃO importa a base de jogadores (bo3-2026.json): ele entra
// na migração do save (bundle inicial). O que depende da base (aposentados como
// candidatos, comissão da IA por time real) fica em `staffData.ts`.
import type { StaffState, StaffEffects, TrainingSession, StaffMember, StaffRole, StaffAttrKey } from './model';
import type { Coach, CoachStyle, Role } from '../../types';
import type { AttrKey } from '../attributes';
import type { MacroRegion } from '../../data/regions';
import { hashStr } from '../../state/hash';
import { SPLITS_PER_YEAR } from '../clock';

// ─── Catálogo ───────────────────────────────────────────────────────────────
export const STAFF_ATTRS: StaffAttrKey[] = [
  'tactics', 'mapKnowledge', 'aimCoaching', 'mentalCoaching', 'fitness', 'analysis',
  'judgingAbility', 'judgingPotential', 'motivating', 'discipline', 'manManagement', 'youthDevelopment',
];
export const STAFF_ROLES: StaffRole[] = ['headCoach', 'assistant', 'analyst', 'psychologist', 'performance', 'scout'];
/** Vagas por cargo. */
export const STAFF_ROLE_MAX: Record<StaffRole, number> = { headCoach: 1, assistant: 2, analyst: 2, psychologist: 1, performance: 1, scout: 2 };

/** Peso de cada atributo na NOTA do cargo (a "estrela" do FM para a função). */
export const ROLE_WEIGHTS: Record<StaffRole, Partial<Record<StaffAttrKey, number>>> = {
  headCoach: { tactics: 3, mapKnowledge: 2, motivating: 2, manManagement: 2, discipline: 1, aimCoaching: 1, mentalCoaching: 1 },
  assistant: { aimCoaching: 3, tactics: 2, mapKnowledge: 2, youthDevelopment: 1, discipline: 1 },
  analyst: { analysis: 3, mapKnowledge: 2, tactics: 1 },
  psychologist: { mentalCoaching: 3, motivating: 2, manManagement: 2 },
  performance: { fitness: 3, discipline: 1 },
  scout: { judgingAbility: 2, judgingPotential: 2 },
};

export const MEDIAN_ATTR = 10;
/** Cargo vago: alguém do clube cobre no improviso. */
export const VACANT_ATTR = 7;

const SESSIONS: TrainingSession[] = ['aim', 'utility', 'tactics', 'vod', 'scrim', 'physical', 'mental', 'rest'];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clampAttr = (v: number | undefined) => clamp(Math.round(typeof v === 'number' && Number.isFinite(v) ? v : MEDIAN_ATTR), 1, 20);
const unit = (seed: string) => (hashStr(seed) % 10_000) / 10_000;
const noise = (seed: string, amp: number) => (unit(seed) * 2 - 1) * amp;
const r4 = (v: number) => Math.round(v * 10_000) / 10_000;

/** Nota do membro no cargo (1–20, uma casa): média ponderada dos atributos do cargo. */
export function staffRoleRating(attrs: Record<StaffAttrKey, number>, role: StaffRole): number {
  const w = ROLE_WEIGHTS[role];
  let s = 0, n = 0;
  for (const [k, wt] of Object.entries(w) as [StaffAttrKey, number][]) { s += clampAttr(attrs[k]) * wt; n += wt; }
  return Math.round((s / n) * 10) / 10;
}

// ─── Efeitos ────────────────────────────────────────────────────────────────
type Src = [StaffRole, StaffAttrKey, number];

// Quem pesa em cada sessão de treino (cargo, atributo, peso).
export const TRAINING_SRC: Record<TrainingSession, Src[]> = {
  aim: [['headCoach', 'aimCoaching', 0.35], ['assistant', 'aimCoaching', 0.65]],
  utility: [['headCoach', 'tactics', 0.3], ['assistant', 'mapKnowledge', 0.4], ['assistant', 'tactics', 0.3]],
  tactics: [['headCoach', 'tactics', 0.5], ['assistant', 'tactics', 0.3], ['analyst', 'mapKnowledge', 0.2]],
  vod: [['analyst', 'analysis', 0.7], ['headCoach', 'mapKnowledge', 0.3]],
  scrim: [['headCoach', 'tactics', 0.45], ['headCoach', 'mapKnowledge', 0.25], ['assistant', 'tactics', 0.3]],
  physical: [['performance', 'fitness', 0.8], ['headCoach', 'discipline', 0.2]],
  mental: [['psychologist', 'mentalCoaching', 0.75], ['headCoach', 'mentalCoaching', 0.25]],
  rest: [['performance', 'fitness', 0.6], ['psychologist', 'mentalCoaching', 0.4]],
};
export const FAMILIARITY_SRC: Src[] = [['headCoach', 'tactics', 0.35], ['headCoach', 'mapKnowledge', 0.2], ['assistant', 'tactics', 0.2], ['analyst', 'mapKnowledge', 0.25]];
export const MORALE_SRC: Src[] = [['psychologist', 'motivating', 0.25], ['psychologist', 'manManagement', 0.2], ['psychologist', 'mentalCoaching', 0.25], ['headCoach', 'motivating', 0.2], ['headCoach', 'manManagement', 0.1]];
export const INJURY_RISK_SRC: Src[] = [['performance', 'fitness', 0.75], ['headCoach', 'discipline', 0.25]];
export const INJURY_REC_SRC: Src[] = [['performance', 'fitness', 0.8], ['psychologist', 'mentalCoaching', 0.2]];
export const YOUTH_SRC: Src[] = [['assistant', 'youthDevelopment', 0.6], ['headCoach', 'youthDevelopment', 0.4]];
export const ANALYST_SRC: Src[] = [['analyst', 'analysis', 0.75], ['analyst', 'mapKnowledge', 0.25]];

/** Amplitude de cada multiplicador: atributo 20 → 1 + span, atributo 1 → 1 − 0,9·span. */
export const EFFECT_SPAN = { training: 0.25, familiarityGain: 0.3, moraleRecovery: 0.3, injuryRisk: 0.3, injuryRecovery: 0.3, youthGrowth: 0.3 } as const;

/** Atributo efetivo do cargo: o melhor do cargo manda; o segundo soma um pouco se for acima da mediana. */
function roleAttr(members: StaffMember[], role: StaffRole, key: StaffAttrKey): number {
  const vals = members.filter((m) => m.role === role).map((m) => clampAttr(m.attrs?.[key])).sort((a, b) => b - a);
  if (!vals.length) return VACANT_ATTR;
  return Math.min(20, vals[0] + (vals.length > 1 ? 0.2 * Math.max(0, vals[1] - MEDIAN_ATTR) : 0));
}
function blend(members: StaffMember[], srcs: Src[]): number {
  let s = 0, n = 0;
  for (const [role, key, w] of srcs) { s += roleAttr(members, role, key) * w; n += w; }
  return s / n;
}
const mult = (a: number, span: number) => 1 + span * (a - MEDIAN_ATTR) / MEDIAN_ATTR;
/** Fração 0–0,95 (anti-strat/olheiro): atributo 10 ≈ 0,43; 20 = 0,9. */
const frac = (a: number) => clamp(((a - 1) / 19) * 0.9, 0, 0.95);

export function neutralStaffEffects(): StaffEffects {
  return {
    training: Object.fromEntries(SESSIONS.map((s) => [s, 1])) as StaffEffects['training'],
    familiarityGain: 1, antiStratRead: 0, scoutAccuracy: 0, moraleRecovery: 1, injuryRisk: 1, injuryRecovery: 1, youthGrowth: 1,
  };
}

// Linha de base: sem comissão técnica, nada muda em relação ao jogo atual.
export function staffEffects(staff: StaffState | null | undefined): StaffEffects {
  const members = (staff?.members ?? []).filter((m) => m && m.attrs && STAFF_ROLES.includes(m.role));
  if (!members.length) return neutralStaffEffects();
  const training = Object.fromEntries(
    SESSIONS.map((s) => [s, r4(mult(blend(members, TRAINING_SRC[s]), EFFECT_SPAN.training))]),
  ) as StaffEffects['training'];
  const hasAnalyst = members.some((m) => m.role === 'analyst');
  const hcRead = frac(roleAttr(members, 'headCoach', 'analysis'));
  const antiStratRead = hasAnalyst ? 0.8 * frac(blend(members, ANALYST_SRC)) + 0.2 * hcRead : 0.2 * hcRead;
  const scouts = members.filter((m) => m.role === 'scout')
    .map((m) => (clampAttr(m.attrs.judgingAbility) + clampAttr(m.attrs.judgingPotential)) / 2)
    .sort((a, b) => b - a);
  const scoutA = scouts.length ? Math.min(20, scouts[0] + (scouts.length > 1 ? 0.2 * Math.max(0, scouts[1] - MEDIAN_ATTR) : 0)) : 0;
  return {
    training,
    familiarityGain: r4(mult(blend(members, FAMILIARITY_SRC), EFFECT_SPAN.familiarityGain)),
    antiStratRead: r4(antiStratRead),
    scoutAccuracy: scouts.length ? r4(frac(scoutA)) : 0,
    moraleRecovery: r4(mult(blend(members, MORALE_SRC), EFFECT_SPAN.moraleRecovery)),
    injuryRisk: r4(clamp(2 - mult(blend(members, INJURY_RISK_SRC), EFFECT_SPAN.injuryRisk), 0.6, 1.4)),
    injuryRecovery: r4(mult(blend(members, INJURY_REC_SRC), EFFECT_SPAN.injuryRecovery)),
    youthGrowth: r4(mult(blend(members, YOUTH_SRC), EFFECT_SPAN.youthGrowth)),
  };
}

/**
 * Passo inteiro escalado por um multiplicador (ex.: +2 de evolução × 1,15),
 * com o resto sorteado de forma determinística — multiplicador 1 devolve o
 * mesmo passo (linha de base intacta).
 */
export function scaleStep(step: number, m: number, seed: string): number {
  if (m === 1 || step <= 0) return step;
  const x = step * m;
  const base = Math.floor(x);
  return base + (unit(seed) < x - base ? 1 : 0);
}

// ─── Salário, teto e contratos ──────────────────────────────────────────────
const ROLE_WAGE: Record<StaffRole, number> = { headCoach: 24_000, assistant: 15_000, analyst: 15_000, psychologist: 12_000, performance: 12_000, scout: 12_000 };

/** Salário por split pedido pelo membro: cresce com o quadrado da nota do cargo. */
export function staffWage(role: StaffRole, attrs: Record<StaffAttrKey, number>): number {
  const r = staffRoleRating(attrs, role);
  return Math.max(4_000, Math.round((ROLE_WAGE[role] * (r / MEDIAN_ATTR) ** 2) / 1000) * 1000);
}

export function staffPayroll(staff: StaffState | null | undefined): number {
  return (staff?.members ?? []).reduce((a, m) => a + (m.wage || 0), 0);
}

const TIER_STAFF_BASE: Record<number, number> = { 1: 220_000, 2: 150_000, 3: 100_000 };
/**
 * Teto da folha da comissão por split, dado pela diretoria: base do tier +
 * 15% do patrocínio, escalado pela confiança (0,8× com diretoria no chão até
 * 1,2× com confiança total). Arredondado em 5k.
 */
export function staffWageCap(ctx: { tier?: number; board?: number; sponsorIncome?: number }): number {
  const base = TIER_STAFF_BASE[clamp(Math.round(ctx.tier ?? 3), 1, 3)];
  const conf = 0.8 + 0.4 * clamp(ctx.board ?? 60, 0, 100) / 100;
  return Math.round(((base + 0.15 * Math.max(0, ctx.sponsorIncome ?? 0)) * conf) / 5000) * 5000;
}

/** Splits de contrato restantes, contando o atual (1 = último split). */
export function staffContractLeft(m: StaffMember, split: number): number {
  return m.contractUntil - split + 1;
}
/** Multa de rescisão: metade dos salários que faltam (mínimo metade de um). */
export function staffSeverance(m: StaffMember, split: number): number {
  return Math.round((m.wage * Math.max(1, staffContractLeft(m, split)) * 0.5) / 1000) * 1000;
}
/** Idade exibida: envelhece 1 ano a cada 3 splits no clube (a mesma régua dos jogadores). */
export function staffAge(m: StaffMember, split: number): number {
  return m.age + Math.max(0, Math.floor((split - (m.since ?? split)) / SPLITS_PER_YEAR));
}

export type StaffOp = { ok: true; staff: StaffState; cost: number; replaced?: StaffMember } | { ok: false; reason: string };

/**
 * Contrata um candidato: paga luvas (1 salário) e, se a vaga estiver cheia,
 * rescinde quem ele substitui (multa). O técnico principal é sempre trocado.
 * Recusa se a folha passar do teto da diretoria ou se faltar caixa.
 */
export function hireStaff(
  staff: StaffState,
  cand: StaffMember,
  ctx: { split: number; budget: number; cap: number; term?: number; replaceId?: string },
): StaffOp {
  const members = staff.members;
  if (members.some((m) => m.id === cand.id)) return { ok: false, reason: 'Já está na sua comissão.' };
  const same = members.filter((m) => m.role === cand.role);
  let replaced: StaffMember | undefined;
  if (cand.role === 'headCoach') replaced = same[0];
  else if (same.length >= STAFF_ROLE_MAX[cand.role]) {
    replaced = same.find((m) => m.id === ctx.replaceId);
    if (!replaced) return { ok: false, reason: 'Vaga cheia: escolha quem ele substitui.' };
  }
  const payroll = staffPayroll(staff) - (replaced?.wage ?? 0) + cand.wage;
  if (payroll > ctx.cap) return { ok: false, reason: 'Passa do teto de folha da comissão definido pela diretoria.' };
  const cost = cand.wage + (replaced ? staffSeverance(replaced, ctx.split) : 0);
  if (ctx.budget < cost) return { ok: false, reason: 'Caixa insuficiente para as luvas.' };
  const term = clamp(Math.round(ctx.term ?? 2), 1, 4);
  const hired: StaffMember = { ...cand, contractUntil: ctx.split + term - 1, since: ctx.split };
  return {
    ok: true,
    staff: { ...staff, members: [...members.filter((m) => m.id !== replaced?.id), hired] },
    cost,
    replaced,
  };
}

/** Demite pagando a multa. O técnico principal só sai quando outro é contratado no lugar. */
export function fireStaff(staff: StaffState, id: string, split: number): StaffOp {
  const m = staff.members.find((x) => x.id === id);
  if (!m) return { ok: false, reason: 'Membro não encontrado.' };
  if (m.role === 'headCoach') return { ok: false, reason: 'Para trocar o técnico principal, contrate outro: ele assume o lugar.' };
  return { ok: true, staff: { ...staff, members: staff.members.filter((x) => x.id !== id) }, cost: staffSeverance(m, split), replaced: m };
}

/** Renova no último split de contrato: +term splits, salário revisto (+5%), luvas de 1 salário. */
export function renewStaff(staff: StaffState, id: string, ctx: { split: number; budget: number; cap: number; term?: number }): StaffOp {
  const m = staff.members.find((x) => x.id === id);
  if (!m) return { ok: false, reason: 'Membro não encontrado.' };
  if (staffContractLeft(m, ctx.split) > 1) return { ok: false, reason: 'Só dá para renovar no último split de contrato.' };
  const wage = Math.round((Math.max(m.wage, staffWage(m.role, m.attrs)) * 1.05) / 1000) * 1000;
  const payroll = staffPayroll(staff) - m.wage + wage;
  if (payroll > ctx.cap && wage > m.wage) return { ok: false, reason: 'O aumento passa do teto de folha da comissão.' };
  if (ctx.budget < wage) return { ok: false, reason: 'Caixa insuficiente para as luvas.' };
  const term = clamp(Math.round(ctx.term ?? 2), 1, 4);
  const next = { ...m, wage, contractUntil: Math.max(m.contractUntil, ctx.split - 1) + term };
  return { ok: true, staff: { ...staff, members: staff.members.map((x) => (x.id === id ? next : x)) }, cost: wage };
}

/**
 * Virada de split: paga a folha do split que fecha e resolve contratos. Quem
 * venceu sai de graça; o técnico principal renova sozinho (+2 splits, +5%) —
 * o time nunca fica sem técnico.
 */
export function staffSplitTick(staff: StaffState | null | undefined, closingSplit: number): {
  staff: StaffState; payroll: number; left: StaffMember[]; renewed: StaffMember[];
} {
  const cur: StaffState = staff ?? { v: 1, members: [] };
  const payroll = staffPayroll(cur);
  const next = closingSplit + 1;
  const left: StaffMember[] = [];
  const renewed: StaffMember[] = [];
  const members: StaffMember[] = [];
  for (const m of cur.members) {
    if (m.contractUntil >= next) { members.push(m); continue; }
    if (m.role === 'headCoach') {
      const r = { ...m, contractUntil: next + 1, wage: Math.round((m.wage * 1.05) / 1000) * 1000 };
      renewed.push(r); members.push(r);
    } else left.push(m);
  }
  return { staff: { ...cur, members }, payroll, left, renewed };
}

// ─── Técnico principal ⇄ Coach da base ─────────────────────────────────────
export const ROOKIE_COACH_ID = '__rookie__';
export const CUSTOM_COACH_ID = '__custom__';
const ROOKIE: Coach = { nick: 'rook1e', name: 'Técnico Iniciante', country: 'br', rating: 66, style: 'tactical' };

/** Rating do Coach (50–99) → atributo-base 1–20: 55 ≈ 6, 66 = 10 (mediana), 75 = 13, 88 ≈ 17, 90 = 18. */
export function coachBaseAttr(rating: number): number {
  return clamp(3 + (rating - 45) / 3, 3, 19);
}
const STYLE_TILT: Record<CoachStyle, Partial<Record<StaffAttrKey, number>>> = {
  tactical: { tactics: 3, mapKnowledge: 2, analysis: 2, aimCoaching: -1, motivating: -1, fitness: -1 },
  aggressive: { aimCoaching: 3, motivating: 2, mentalCoaching: 1, tactics: -1, analysis: -1, discipline: -1 },
  discipline: { discipline: 3, manManagement: 2, mentalCoaching: 2, fitness: 1, tactics: -1, aimCoaching: -1 },
};
// o que não é ofício de técnico (avaliar talento, físico, base) fica abaixo
const HC_OFF: Partial<Record<StaffAttrKey, number>> = { judgingAbility: -2, judgingPotential: -2, fitness: -2, youthDevelopment: -1 };

/** Técnico do time (Coach: rating + estilo) vira o headCoach da comissão. Determinístico. */
export function headCoachFromCoach(coach: Coach, key: string, split = 1): StaffMember {
  const base = coachBaseAttr(coach.rating);
  const tilt = STYLE_TILT[coach.style] ?? {};
  const attrs = Object.fromEntries(STAFF_ATTRS.map((k) => [
    k, clampAttr(base + (tilt[k] ?? 0) + (HC_OFF[k] ?? 0) + noise(`hc:${coach.nick}:${k}`, 1)),
  ])) as Record<StaffAttrKey, number>;
  return {
    id: `hc:${key}:${coach.nick}`,
    name: coach.name, nick: coach.nick, country: coach.country,
    age: 31 + (hashStr(`hcage:${coach.nick}`) % 15),
    role: 'headCoach', attrs,
    wage: staffWage('headCoach', attrs),
    contractUntil: split + 2,
    sourceCoachId: key, since: split, style: coach.style,
  };
}

/** Estilo dominante de um técnico pelos atributos (para quem veio do mercado). */
export function styleFromAttrs(a: Record<StaffAttrKey, number>): CoachStyle {
  const t = a.tactics + a.mapKnowledge + a.analysis;
  const g = a.aimCoaching + a.motivating + a.mentalCoaching;
  const d = a.discipline + a.manManagement + a.mentalCoaching;
  return t >= g && t >= d ? 'tactical' : g >= d ? 'aggressive' : 'discipline';
}
/** headCoach → Coach que o motor e o resto da Carreira leem (rating 50–95 + estilo). */
export function coachFromStaff(m: StaffMember): Coach {
  const r = staffRoleRating(m.attrs, 'headCoach');
  return {
    nick: m.nick ?? m.name.split(' ')[0], name: m.name, country: m.country,
    rating: clamp(Math.round(45 + (r - 3) * 3), 50, 95),
    style: m.style ?? styleFromAttrs(m.attrs),
  };
}

/**
 * Técnico principal em dia com o técnico do save (`coachFromId`). Devolve a
 * comissão nova, ou null se já está sincronizada. Trocar de técnico no mercado
 * da Carreira troca o headCoach; o resto da comissão fica.
 */
export function syncHeadCoach(staff: StaffState, coach: Coach, key: string, split: number): StaffState | null {
  const hc = staff.members.find((m) => m.role === 'headCoach');
  if (hc && hc.sourceCoachId === key && (key !== CUSTOM_COACH_ID || hc.nick === coach.nick)) return null;
  return { ...staff, members: [headCoachFromCoach(coach, key, split), ...staff.members.filter((m) => m.role !== 'headCoach')] };
}

type SaveLike = {
  coachFromId?: string | null;
  customCoach?: Coach | null;
  split?: number;
  region?: string;
  org?: { name?: string } | null;
};

/**
 * Comissão inicial da Carreira (migração v28 e carreira nova): o técnico do
 * save vira o headCoach e o clube tem um auxiliar "da casa" (nota ~9, barato).
 * Sem técnico no save (antes do mercado) a comissão nasce vazia = neutra.
 * `coach` resolvido pelo chamador (técnico de time real da base); sem ele, só
 * o técnico iniciante e o personalizado se resolvem aqui — o CareerScreen
 * sincroniza o técnico de time real ao abrir (syncHeadCoach).
 */
export function defaultStaff(save?: SaveLike | null, coach?: Coach | null): StaffState {
  const id = typeof save?.coachFromId === 'string' ? save.coachFromId : null;
  if (!save || !id) return { v: 1, members: [] };
  const split = typeof save.split === 'number' && save.split > 0 ? Math.floor(save.split) : 1;
  const resolved = coach ?? (id === CUSTOM_COACH_ID ? save.customCoach ?? null : id === ROOKIE_COACH_ID ? ROOKIE : null);
  const members: StaffMember[] = [];
  if (resolved) members.push(headCoachFromCoach(resolved, id, split));
  const region: MacroRegion = isMacroRegion(save.region) ? save.region : 'europe';
  const orgName = save.org?.name ?? 'org';
  const house = staffCandidate(`house:${orgName}`, 'assistant', 9, region, split, 0.6);
  members.push({ ...house, id: `house:asst:${hashStr(orgName)}`, contractUntil: split + 1, since: split });
  return { v: 1, members };
}

// ─── Geração: nomes, candidatos, mercado ───────────────────────────────────
const MACROS: MacroRegion[] = ['americas', 'europe', 'cis', 'asia', 'oceania', 'africa'];
const isMacroRegion = (r: unknown): r is MacroRegion => typeof r === 'string' && (MACROS as string[]).includes(r);

const FIRST: Record<MacroRegion, string[]> = {
  americas: ['Rafael', 'Bruno', 'Felipe', 'Gustavo', 'Rodrigo', 'Marcelo', 'Andrés', 'Santiago', 'Tiago', 'Leandro', 'Jake', 'Tyler', 'Daniel', 'Vinícius', 'Henrique', 'Fernando'],
  europe: ['Anders', 'Mikkel', 'Jonas', 'Pierre', 'Julien', 'Tomasz', 'Piotr', 'Stefan', 'Johan', 'Erik', 'Lukas', 'Mathias', 'Sami', 'Jan', 'Nuno', 'Hugo'],
  cis: ['Sergey', 'Dmitry', 'Andrey', 'Oleg', 'Alexey', 'Igor', 'Kirill', 'Pavel', 'Yuri', 'Denis', 'Roman', 'Aidos'],
  asia: ['Wei', 'Jun', 'Seojun', 'Hyun', 'Takumi', 'Daiki', 'Bayar', 'Budi', 'Ahmad', 'Li', 'Yusuf', 'Kenji'],
  oceania: ['Ben', 'Sam', 'Tom', 'Josh', 'Luke', 'Mitch', 'Nathan', 'Callum'],
  africa: ['Sipho', 'Tariq', 'Mehdi', 'Kofi', 'Aziz', 'Pieter', 'Jabu', 'Nabil'],
};
const LAST: Record<MacroRegion, string[]> = {
  americas: ['Oliveira', 'Santos', 'Pereira', 'Costa', 'Ferreira', 'Gómez', 'Herrera', 'Martins', 'Carvalho', 'Walker', 'Miller', 'Barbosa', 'Moreira', 'Duarte'],
  europe: ['Nielsen', 'Hansen', 'Lindqvist', 'Dubois', 'Moreau', 'Nowak', 'Wiśniewski', 'Schmidt', 'Becker', 'Korhonen', 'de Vries', 'Ferreira', 'Svoboda', 'Berg'],
  cis: ['Kuznetsov', 'Popov', 'Morozov', 'Fedorov', 'Volkov', 'Lebedev', 'Zaitsev', 'Nurlanov', 'Shevchenko', 'Pavlov'],
  asia: ['Wang', 'Liu', 'Kim', 'Lee', 'Choi', 'Suzuki', 'Yamamoto', 'Batbold', 'Santoso', 'Al-Harbi', 'Zhao', 'Ito'],
  oceania: ['Thompson', 'White', 'Harris', 'Martin', 'Young', 'King', 'Wright', 'Scott'],
  africa: ['Mokoena', 'El Amrani', 'Mensah', 'Botha', 'Khumalo', 'Haddad', 'Diallo', 'Okafor'],
};
const CC: Record<MacroRegion, string[]> = {
  americas: ['br', 'br', 'br', 'ar', 'us', 'cl', 'mx', 'ca', 'uy', 'pe'],
  europe: ['dk', 'se', 'fr', 'de', 'pl', 'fi', 'pt', 'es', 'nl', 'no', 'cz'],
  cis: ['ru', 'ru', 'ua', 'kz', 'by'],
  asia: ['cn', 'kr', 'jp', 'mn', 'id', 'sa'],
  oceania: ['au', 'au', 'nz'],
  africa: ['za', 'ma', 'eg', 'ng'],
};
const NICK_BASE = ['kaz', 'robs', 'maze', 'fluxo', 'vini', 'doc', 'zeus', 'kane', 'rush', 'b1g', 'tory', 'mako', 'luzz', 'sparta', 'nyl', 'grim', 'hiko', 'pita', 'bnd', 'krex', 'orca', 'volk', 'tony', 'shark'];
const NICK_SUFFIX = ['', '', '', 'z', 'x', 'y', '1', 'o', 'ie', 'k'];

// Atributos que acompanham a nota do cargo (secundários ficam um pouco abaixo).
const ROLE_SECONDARY: Record<StaffRole, StaffAttrKey[]> = {
  headCoach: ['analysis', 'youthDevelopment'],
  assistant: ['analysis', 'motivating', 'mentalCoaching'],
  analyst: ['judgingAbility', 'aimCoaching'],
  psychologist: ['discipline', 'youthDevelopment'],
  performance: ['mentalCoaching', 'motivating'],
  scout: ['analysis', 'youthDevelopment', 'mapKnowledge'],
};
const AGE_RANGE: Record<StaffRole, [number, number]> = {
  headCoach: [32, 55], assistant: [26, 48], analyst: [23, 44], psychologist: [30, 58], performance: [27, 52], scout: [28, 62],
};

/**
 * Candidato gerado (determinístico pelo seed): atributos do cargo em torno da
 * `quality` (1–20), secundários um pouco abaixo, o resto baixo e espalhado.
 * `spread` escala o ruído (0 = sem ruído: o candidato "médio" do tier).
 */
export function staffCandidate(seed: string, role: StaffRole, quality: number, region: MacroRegion, split = 1, spread = 1): StaffMember {
  const h = hashStr(`stf:${seed}`);
  const reg: MacroRegion = isMacroRegion(region) ? region : 'europe';
  const keys = ROLE_WEIGHTS[role];
  const sec = ROLE_SECONDARY[role];
  const attrs = Object.fromEntries(STAFF_ATTRS.map((k) => {
    const v = keys[k] != null ? quality + noise(`${seed}:${k}`, 2.2 * spread)
      : sec.includes(k) ? quality - 3 + noise(`${seed}:${k}`, 2.5 * spread)
        : 7 + noise(`${seed}:${k}`, 3.5 * spread);
    return [k, clampAttr(v)];
  })) as Record<StaffAttrKey, number>;
  const first = FIRST[reg][(h >>> 3) % FIRST[reg].length];
  const last = LAST[reg][(h >>> 9) % LAST[reg].length];
  const withNick = role === 'headCoach' || role === 'assistant' || role === 'analyst';
  const nick = withNick ? NICK_BASE[(h >>> 14) % NICK_BASE.length] + NICK_SUFFIX[(h >>> 19) % NICK_SUFFIX.length] : undefined;
  const [a0, a1] = AGE_RANGE[role];
  return {
    id: `stf:${seed}`,
    name: `${first} ${last}`,
    ...(nick ? { nick } : {}),
    country: CC[reg][(h >>> 23) % CC[reg].length],
    age: a0 + (h % (a1 - a0 + 1)),
    role, attrs,
    wage: staffWage(role, attrs),
    contractUntil: split + 1,
    ...(role === 'headCoach' ? { style: styleFromAttrs(attrs) } : {}),
  };
}

/** Ex-jogador aposentado da base (atributos 1–20 de jogador) → candidato a comissão. */
export interface RetiredSource { id: string; nick: string; name?: string; country: string; age?: number; role: Role; a: Record<AttrKey, number> }

const avg = (...xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
export function retiredToStaff(src: RetiredSource, split = 1): StaffMember {
  const a = src.a;
  const n = (k: string) => noise(`ret:${src.id}:${k}`, 1.2);
  const attrs: Record<StaffAttrKey, number> = {
    tactics: clampAttr(avg(a.gameSense, a.decisions, a.leadership) - 1 + n('t')),
    mapKnowledge: clampAttr(avg(a.positioning, a.gameSense, a.vision) - 1 + n('m')),
    aimCoaching: clampAttr(avg(a.aim, a.spray, a.crosshair) - 2 + n('a')),
    mentalCoaching: clampAttr(a.composure - 3 + n('mc')),
    fitness: clampAttr(a.stamina - 5 + n('f')),
    analysis: clampAttr(avg(a.vision, a.anticipation, a.decisions) - 2 + n('an')),
    judgingAbility: clampAttr(a.gameSense - 4 + n('ja')),
    judgingPotential: clampAttr(a.gameSense - 5 + n('jp')),
    motivating: clampAttr(avg(a.leadership, a.communication) - 1 + n('mo')),
    discipline: clampAttr(a.discipline - 1 + n('d')),
    manManagement: clampAttr(a.communication - 3 + n('mm')),
    youthDevelopment: clampAttr(a.teamwork - 4 + n('y')),
  };
  // função no servidor → cargo natural fora dele
  const role: StaffRole = src.role === 'IGL'
    ? (staffRoleRating(attrs, 'headCoach') >= 11 ? 'headCoach' : 'assistant')
    : src.role === 'Support' || src.role === 'Lurker' ? 'analyst' : 'assistant';
  return {
    id: `ret:${src.id}`,
    name: src.name || src.nick, nick: src.nick, country: src.country,
    age: Math.max(24, (src.age ?? 27) + 1),
    role, attrs,
    wage: staffWage(role, attrs),
    contractUntil: split + 1,
    sourcePlayerId: src.id,
    ...(role === 'headCoach' ? { style: styleFromAttrs(attrs) } : {}),
  };
}

// qualidade típica do mercado por tier do clube (clube grande atrai gente melhor)
const MARKET_MEAN: Record<number, number> = { 1: 12, 2: 10.5, 3: 9.5 };
const MARKET_COUNT: Record<StaffRole, number> = { headCoach: 3, assistant: 5, analyst: 4, psychologist: 3, performance: 3, scout: 4 };
const MARKET_OFFSETS = [-5, 3, -1, 6, 1, -3, 4];

/**
 * Mercado de staff do split: pool determinístico (muda a cada split) com
 * candidatos de todas as faixas — do barato fraco ao elite caro — e parte dos
 * ex-jogadores aposentados da base. Sem quem já está na comissão.
 */
export function staffMarket(opts: {
  split: number; region?: string; tier?: number; retired?: RetiredSource[]; exclude?: Iterable<string>;
}): StaffMember[] {
  const split = Math.max(1, Math.floor(opts.split));
  const region: MacroRegion = isMacroRegion(opts.region) ? opts.region : 'europe';
  const mean = MARKET_MEAN[clamp(Math.round(opts.tier ?? 3), 1, 3)];
  const exclude = new Set(opts.exclude ?? []);
  const out: StaffMember[] = [];
  for (const role of STAFF_ROLES) {
    for (let i = 0; i < MARKET_COUNT[role]; i++) {
      const seed = `m${split}:${role}:${i}`;
      // 1 em 4 vem de outra região (o mercado é global, mas a maioria é local)
      const reg = hashStr(`reg:${seed}`) % 4 === 0 ? MACROS[hashStr(`rg:${seed}`) % MACROS.length] : region;
      const q = clamp(mean + MARKET_OFFSETS[i % MARKET_OFFSETS.length] + noise(`q:${seed}`, 1.5), 3, 19);
      out.push(staffCandidate(seed, role, q, reg, split));
    }
  }
  for (const r of opts.retired ?? []) {
    // cada aposentado aparece em ~1/3 dos splits (disponibilidade muda)
    if (hashStr(`retav:${r.id}:${split}`) % 3 !== 0) continue;
    out.push(retiredToStaff(r, split));
  }
  return out.filter((c) => !exclude.has(c.id));
}

// ─── IA: comissão coerente com o tier, efeito pequeno e calibrado ──────────
/** Qualidade média da comissão da IA por tier (orçamento). */
export const AI_TIER_MEAN: Record<1 | 2 | 3, number> = { 1: 13, 2: 10.5, 3: 8 };
const AI_ROLES: StaffRole[] = ['assistant', 'analyst', 'psychologist', 'performance', 'scout'];

/** Comissão de um clube da IA: técnico real da base + staff em torno da média do tier. */
export function generateAiStaff(teamId: string, coach: Coach | null | undefined, tier: 1 | 2 | 3, region: MacroRegion, spread = 1): StaffState {
  const mean = AI_TIER_MEAN[tier] ?? 10;
  const members: StaffMember[] = [];
  if (coach) members.push(headCoachFromCoach(coach, teamId, 1));
  for (const role of AI_ROLES) {
    const q = mean + noise(`aiq:${teamId}:${role}`, 2.5 * spread);
    members.push(staffCandidate(`ai:${teamId}:${role}`, role, q, region, 1, spread));
  }
  return { v: 1, members };
}

// índice agregado do que a comissão entrega (sem o técnico: ele já pesa na
// força pelo coachBaseBonus e pelo estilo no motor — nada de contar em dobro)
function supportIndex(staff: StaffState): number {
  const attrs = Object.fromEntries(STAFF_ATTRS.map((k) => [k, MEDIAN_ATTR])) as Record<StaffAttrKey, number>;
  const neutralHc: StaffMember = { id: 'hc:neutral', name: '-', country: 'xx', age: 40, role: 'headCoach', attrs, wage: 0, contractUntil: 1 };
  const e = staffEffects({ ...staff, members: [neutralHc, ...staff.members.filter((m) => m.role !== 'headCoach')] });
  const tr = SESSIONS.reduce((s, k) => s + e.training[k], 0) / SESSIONS.length;
  return (tr + e.familiarityGain + e.moraleRecovery + (2 - e.injuryRisk) + e.injuryRecovery) / 5;
}
export const AI_EDGE_K = 4;
export const AI_EDGE_CAP = 0.5;
/**
 * Delta de FORÇA (escala do team.strength) de um clube da IA pela comissão,
 * RELATIVO à comissão típica do tier dele: a força da IA já foi calibrada com
 * os dados reais (que embutem a comissão média daquele nível), então a
 * comissão só explica a variação dentro do tier — média ~0, |δ| ≤ 0,5.
 */
export function aiStaffEdge(staff: StaffState, teamId: string, tier: 1 | 2 | 3): number {
  const expected = supportIndex(generateAiStaff(teamId, null, tier, 'europe', 0));
  return Math.round(clamp(AI_EDGE_K * (supportIndex(staff) - expected), -AI_EDGE_CAP, AI_EDGE_CAP) * 1000) / 1000;
}
