// RTP2 — loop semanal: treino, ações off-game e virada de semana.
//
// Tudo PURO e determinístico (RNG semeado do save). Cada ação consome 1 das
// `actionsLeft` da semana, devolve um novo save imutável + feedback pra UI.
//
// O coração é o crescimento de atributos: treinar uma categoria distribui XP
// fracionário rumo ao `potential` oculto, modulado por energia, idade, relação
// com o coach e personalidade (prodigy cresce mais cedo).

import {
  MECHANICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, ATTR_LABEL, type AttrKey,
} from '../attributes';
import { makeRng } from '../rng';
import { ROLE_FOCUS, ACTIONS_PER_WEEK, WEEKS_PER_SEASON } from './createSave';
import { proOvr } from './coreStats';
import { setupTrainingMods, setupConditionMods, psychDef } from './setup';
import { aggregatePassives } from './perks';
import type { ProPlayer, RoadToProSave, SetupState } from './types';
import type { RtpIconName } from './icons';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos

export type TrainFocus = 'mechanical' | 'mental' | 'physical';
export type ActionKind =
  | 'train:mechanical' | 'train:mental' | 'train:physical'
  | 'rest' | 'gym' | 'stream' | 'social' | 'demos';

export interface AttrGain { attr: AttrKey; from: number; to: number; }

export interface ActionFeedback {
  title: string;
  lines: string[];                 // deltas legíveis (ex.: "Energia −22")
  gains: AttrGain[];               // atributos que subiram de ponto
}

export interface ActionResult {
  save: RoadToProSave;
  ok: boolean;
  reason?: string;                 // motivo quando ok=false (ex.: sem ações)
  feedback?: ActionFeedback;
}

export interface WeekSummary {
  wagePaid: number;
  livingCost: number;
  psychRetainer: number;
  newSeason: boolean;
  agedUp: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de balanceamento

const CATEGORY_KEYS: Record<TrainFocus, AttrKey[]> = {
  mechanical: MECHANICAL_KEYS,
  mental: MENTAL_KEYS,
  physical: PHYSICAL_KEYS,
};

// Orçamento base de XP por treino. ANTES 4.0: com o ageFactor jovem (1.3 aos ≤18)
// e energia cheia, um atributo-chave da role (peso 3 de wsum 13) recebia
// 4.0·0,94·1,3·3/13 ≈ 1,13 XP POR SESSÃO — sempre >1,0, virando +1 ponto garantido
// toda sessão. Isso anulava o buffer de XP fracionário (o path "Sem ponto novo"
// nunca disparava nos atributos de foco) e um prospecto maxava seus dois
// atributos-chave numa única temporada (~12 semanas). Baixado pra 3.2 (−20%):
// o mesmo jovem passa a ~0,90 XP/sessão nos atributos-chave, voltando abaixo de
// 1,0 — o acúmulo fracionário volta a gatear e o desenvolvimento estica pra
// ~1,3–1,6 temporadas, sem tocar veteranos (ageFactor já <1) nem builds largas.
const BASE_TRAIN_XP = 3.2;        // orçamento base de XP por treino
export const MIN_TRAIN_ENERGY = 12; // abaixo disso, cansado demais pra treinar
// Custo de vida semanal (R$). ANTES era um flat R$200 — irrelevante assim que
// você sobe de tier (0,8% do salário elite de 26k), virando um no-op: nenhum
// motivo pra administrar dinheiro conforme a carreira cresce, e o gear/psicólogo
// (a progressão gated por grana) deixava de ser uma escolha. Agora escala com o
// salário (inflação de estilo de vida do pro), com PISO no valor antigo pra não
// tocar no início pobre (academia: 10% de 800-1000 < 200 → continua 200).
const LIVING_COST_MIN = 200;
const LIVING_COST_WAGE_FRAC = 0.10;
function livingCostFor(wage: number): number {
  return Math.max(LIVING_COST_MIN, Math.round(wage * LIVING_COST_WAGE_FRAC));
}
const WEEK_ENERGY_RECOVERY = 30;  // energia recuperada ao virar a semana

const CATEGORY_LABEL: Record<TrainFocus, string> = {
  mechanical: 'Mecânica', mental: 'Mental', physical: 'Físico',
};

// ─────────────────────────────────────────────────────────────────────────────
// Modificadores de crescimento

// Curva de idade: jovem cresce rápido, veterano estagna/declina.
function ageFactor(age: number): number {
  if (age <= 18) return 1.3;
  if (age <= 22) return 1.12;
  if (age <= 25) return 1.0;
  if (age <= 28) return 0.82;
  if (age <= 31) return 0.6;
  return 0.4;
}

// Energia no momento do treino: cansado rende menos.
function energyFactor(energy: number): number {
  return 0.4 + 0.6 * clamp(energy / 100, 0, 1); // 0.4 .. 1.0
}

// ─────────────────────────────────────────────────────────────────────────────
// Treino: distribui XP na categoria e materializa pontos ao cruzar 1.0

function applyTraining(
  player: ProPlayer,
  focus: TrainFocus,
  energy: number,
  relCoach: number,
  scale = 1,
  setupMods?: { trainScale: number; catBonus: Record<TrainFocus, number> },
  perkXpMult = 1,
): { attrs: Record<AttrKey, number>; trainingXp: Record<AttrKey, number>; gains: AttrGain[] } {
  const focusKeys = CATEGORY_KEYS[focus];
  const roleFocus = new Set(ROLE_FOCUS[player.role]);
  const coachFactor = 0.85 + (clamp(relCoach, 0, 100) / 100) * 0.3;       // 0.85 .. 1.15
  const persFactor = player.personality === 'prodigy' && player.age <= 23 ? 1.18 : 1.0;
  // Setup (periféricos): trainScale=1 sempre, todo efeito via catBonus (anti double-dip).
  const sm = setupMods ?? { trainScale: 1, catBonus: { mechanical: 0, mental: 0, physical: 0 } };
  const total = BASE_TRAIN_XP * scale * energyFactor(energy) * ageFactor(player.age) * coachFactor * persFactor
    * sm.trainScale * (1 + sm.catBonus[focus]) * perkXpMult;

  // peso por atributo: foco da role pesa 3×, demais 1×, e só conta quem ainda
  // tem headroom (não desperdiça XP em atributo já no teto).
  const weights: number[] = focusKeys.map((k) => (player.potential[k] - player.attrs[k] > 0 ? (roleFocus.has(k) ? 3 : 1) : 0));
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;

  const attrs = { ...player.attrs };
  const xp = { ...player.trainingXp };
  const gains: AttrGain[] = [];

  focusKeys.forEach((k, i) => {
    if (weights[i] <= 0) return;
    xp[k] = (xp[k] ?? 0) + (total * weights[i]) / wsum;
    const before = attrs[k];
    while (xp[k] >= 1 && attrs[k] < player.potential[k]) {
      attrs[k] += 1;
      xp[k] -= 1;
    }
    if (attrs[k] >= player.potential[k]) xp[k] = 0; // no teto: zera o resíduo
    if (attrs[k] > before) gains.push({ attr: k, from: before, to: attrs[k] });
  });

  return { attrs, trainingXp: xp, gains };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de mutação

// RNG determinístico por ação (semente do save + tick corrente).
function actionRng(save: RoadToProSave) {
  const seed = (save.rng.seed ^ (save.rng.tick * 0x9e3779b1)) >>> 0;
  return makeRng(seed);
}

function bumpTick(save: RoadToProSave): RoadToProSave['rng'] {
  return { seed: save.rng.seed, tick: save.rng.tick + 1 };
}

function withPlayerOvr(player: ProPlayer): ProPlayer {
  return { ...player, ovr: proOvr(player.attrs, player.role) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ação principal

// `perf` (0..1) vem do minijogo da ação (default 1.0 = ganho total / paths sem
// jogo). Escala o ORÇAMENTO de XP do treino e os deltas de vida de gym/demos —
// nada além disso (o teto de potencial é o mesmo; jogar bem só enche mais rápido).
export function applyAction(save: RoadToProSave, kind: ActionKind, perf = 1.0): ActionResult {
  if (save.world.actionsLeft <= 0) {
    return { save, ok: false, reason: 'Sem ações nesta semana. Avance a semana.' };
  }
  const p = clamp(perf, 0, 1);
  const life = save.life;
  const rng = actionRng(save);
  const sm = setupTrainingMods(save.setup);
  const perkXpMult = aggregatePassives(save).trainingXpMult;   // perks (ex.: Rato de treino)

  // ---- Treino ----
  if (kind.startsWith('train:')) {
    if (life.energy < MIN_TRAIN_ENERGY) {
      return { save, ok: false, reason: 'Cansado demais pra treinar. Descanse primeiro.' };
    }
    const focus = kind.split(':')[1] as TrainFocus;
    const { attrs, trainingXp, gains } = applyTraining(save.player, focus, life.energy, life.rel.coach, p, sm, perkXpMult);
    const player = withPlayerOvr({ ...save.player, attrs, trainingXp });
    const nextLife = {
      ...life,
      energy: clamp(life.energy - 22, 0, 100),
      focus: clamp(life.focus - 3, 0, 100),
    };
    const lines = [`Energia −22`, `Foco −3`, `Minijogo ${Math.round(p * 100)}%`];
    if (sm.catBonus[focus] > 0) lines.push(`Setup +${Math.round(sm.catBonus[focus] * 100)}% ${CATEGORY_LABEL[focus].toLowerCase()}`);
    if (perkXpMult > 1) lines.push(`Perk +${Math.round((perkXpMult - 1) * 100)}% XP`);
    if (gains.length === 0) lines.push('Sem ponto novo (acúmulo de XP)');
    return {
      ok: true,
      save: commit(save, { player, life: nextLife }),
      feedback: {
        title: `Treino · ${CATEGORY_LABEL[focus]}`,
        lines,
        gains,
      },
    };
  }

  // ---- Ações off-game ----
  switch (kind) {
    case 'rest': {
      const nextLife = {
        ...life,
        energy: clamp(life.energy + 35, 0, 100),
        fitness: clamp(life.fitness + 6, 0, 100),
        morale: clamp(life.morale + 5, 0, 100),
      };
      return {
        ok: true,
        save: commit(save, { life: nextLife }),
        feedback: { title: 'Descanso', lines: ['Energia +35', 'Físico +6', 'Moral +5'], gains: [] },
      };
    }
    case 'gym': {
      const fit = Math.round(9 * (0.55 + 0.45 * p));   // custo de energia fixo; ganho escala
      const nextLife = {
        ...life,
        energy: clamp(life.energy - 16, 0, 100),
        fitness: clamp(life.fitness + fit, 0, 100),
      };
      return {
        ok: true,
        save: commit(save, { life: nextLife }),
        feedback: { title: 'Academia', lines: ['Energia −16', `Físico +${fit}`, `Minijogo ${Math.round(p * 100)}%`], gains: [] },
      };
    }
    case 'stream': {
      // ganho escala com a fama (mais seguidores → mais doações)
      const earn = 250 + Math.round(life.fame * 12) + Math.floor(rng() * 200);
      const nextLife = {
        ...life,
        energy: clamp(life.energy - 18, 0, 100),
        focus: clamp(life.focus - 4, 0, 100),
        fame: clamp(life.fame + 4, 0, 100),
        money: life.money + earn,
      };
      return {
        ok: true,
        save: commit(save, { life: nextLife }),
        feedback: { title: 'Live', lines: [`+R$ ${earn.toLocaleString('pt-BR')}`, 'Fama +4', 'Energia −18', 'Foco −4'], gains: [] },
      };
    }
    case 'social': {
      const nextLife = {
        ...life,
        energy: clamp(life.energy - 14, 0, 100),
        morale: clamp(life.morale + 6, 0, 100),
        rel: {
          ...life.rel,
          team: clamp(life.rel.team + 8, 0, 100),
          family: clamp(life.rel.family + 3, 0, 100),
        },
      };
      return {
        ok: true,
        save: commit(save, { life: nextLife }),
        feedback: { title: 'Vida social', lines: ['Moral +6', 'Entrosamento +8', 'Energia −14'], gains: [] },
      };
    }
    case 'demos': {
      // estudo de demos: foca a cabeça e dá um treino mental leve (multiplica o
      // base 0.4 pelo perf — substituir tornaria o mental-via-demos forte demais).
      const { attrs, trainingXp, gains } = applyTraining(save.player, 'mental', life.energy, life.rel.coach, 0.4 * p, sm, perkXpMult);
      const player = withPlayerOvr({ ...save.player, attrs, trainingXp });
      const foc = Math.round(8 * (0.55 + 0.45 * p));
      const nextLife = {
        ...life,
        energy: clamp(life.energy - 12, 0, 100),
        focus: clamp(life.focus + foc, 0, 100),
      };
      return {
        ok: true,
        save: commit(save, { player, life: nextLife }),
        feedback: { title: 'Revisar demos', lines: [`Foco +${foc}`, 'Energia −12', `Minijogo ${Math.round(p * 100)}%`], gains },
      };
    }
  }

  return { save, ok: false, reason: 'Ação desconhecida.' };
}

// Aplica o patch + consome 1 ação + avança o tick do RNG.
function commit(save: RoadToProSave, patch: Partial<RoadToProSave>): RoadToProSave {
  return {
    ...save,
    ...patch,
    world: { ...save.world, actionsLeft: save.world.actionsLeft - 1 },
    rng: bumpTick(save),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelhecimento: no fim de cada temporada o jogador ganha 1 ano. Depois do pico
// (~27) começa o DECLÍNIO — o físico cai primeiro, a mecânica depois, o mental
// resiste. Determinístico. Idade de aposentadoria natural em RETIRE_AGE.

export const RETIRE_AGE = 36;

const CAT_OF: Record<AttrKey, TrainFocus> = (() => {
  const m = {} as Record<AttrKey, TrainFocus>;
  for (const k of MECHANICAL_KEYS) m[k] = 'mechanical';
  for (const k of MENTAL_KEYS) m[k] = 'mental';
  for (const k of PHYSICAL_KEYS) m[k] = 'physical';
  return m;
})();

// declínio anual por categoria (pontos 1-20/ano) conforme a idade.
function declineForAge(age: number): Record<TrainFocus, number> {
  if (age <= 27) return { mechanical: 0, mental: 0, physical: 0 };
  if (age <= 29) return { mechanical: 0, mental: 0, physical: 0.4 };
  if (age <= 31) return { mechanical: 0.35, mental: 0, physical: 0.8 };
  if (age <= 33) return { mechanical: 0.7, mental: 0.2, physical: 1.1 };
  return { mechanical: 1.1, mental: 0.4, physical: 1.4 };
}

// Sobe 1 ano + aplica declínio (se houver) + recacheia OVR. Puro/determinístico.
export function ageUp(player: ProPlayer): ProPlayer {
  const age = player.age + 1;
  const d = declineForAge(age);
  const attrs = { ...player.attrs };
  const potential = { ...player.potential };
  for (const k of Object.keys(attrs) as AttrKey[]) {
    const dec = d[CAT_OF[k]];
    if (dec > 0) {
      attrs[k] = Math.max(1, Math.round((attrs[k] - dec) * 100) / 100);
      potential[k] = Math.max(attrs[k], potential[k] - dec * 0.5);
    }
  }
  return { ...player, age, attrs, potential, ovr: proOvr(attrs, player.role) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Virada de semana

// Tick de tempo de uma semana: recuperação de energia, deriva de medidores pro
// baseline, decaimento de fama, salário − custos. Puro. Compartilhado pelo
// advanceWeek (fallback) e pelo concludeRound da liga (RTP4).
export function weeklyTick(life: RoadToProSave['life'], wage: number, setup: SetupState): RoadToProSave['life'] {
  // Lesão: decrementa a duração; ao zerar, recupera (cura) e devolve forma.
  const flags = { ...life.flags };
  let fitnessHeal = 0;
  if (flags.injured) {
    const weeksLeft = flags.injured.weeksLeft - 1;
    if (weeksLeft <= 0) { delete flags.injured; fitnessHeal = 10; }
    else flags.injured = { ...flags.injured, weeksLeft };
  }
  // Psicólogo: recuperação mental extra na deriva + mensalidade (retainer).
  const { recoveryBonus } = setupConditionMods(setup);
  const psych = psychDef(setup.psychTier ?? 0);
  return {
    ...life,
    energy: clamp(life.energy + WEEK_ENERGY_RECOVERY, 0, 100),
    fitness: clamp(life.fitness - 2 + fitnessHeal, 0, 100),
    morale: clamp(life.morale + Math.round((60 - life.morale) * 0.2) + recoveryBonus, 0, 100),
    focus: clamp(life.focus + Math.round((65 - life.focus) * 0.2) + recoveryBonus, 0, 100),
    fame: clamp(life.fame - 1, 0, 100),
    // piso 0: mesma invariante do applyLifeChoice — o jogo não modela dívida.
    money: Math.max(0, life.money + wage - livingCostFor(wage) - psych.retainer),
    flags,
  };
}

export function advanceWeek(save: RoadToProSave): { save: RoadToProSave; summary: WeekSummary } {
  // Contrato expirado = sem salário (espelha concludeCircuitRound).
  const wage = save.team.contract.weeksLeft > 0 ? save.team.contract.wage : 0;
  const nextLife = weeklyTick(save.life, wage, save.setup);
  const psychRetainer = psychDef(save.setup.psychTier ?? 0).retainer;

  let { season, week } = save.world;
  let newSeason = false;
  let agedUp = false;
  let player = save.player;
  week += 1;
  if (week > WEEKS_PER_SEASON) {
    week = 1;
    season += 1;
    player = ageUp(player);      // +1 ano + declínio por idade + OVR
    newSeason = true;
    agedUp = true;
  }

  const contract = { ...save.team.contract, weeksLeft: Math.max(0, save.team.contract.weeksLeft - 1) };

  return {
    summary: { wagePaid: wage, livingCost: livingCostFor(wage), psychRetainer, newSeason, agedUp },
    save: {
      ...save,
      player,
      life: nextLife,
      team: { ...save.team, contract },
      world: { ...save.world, season, week, actionsLeft: ACTIONS_PER_WEEK },
      rng: bumpTick(save),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadados das ações pra UI (rótulo, ícone, custo aproximado)

export interface ActionMeta {
  kind: ActionKind;
  label: string;
  icon: RtpIconName;
  hint: string;
}

export const WEEKLY_ACTIONS: ActionMeta[] = [
  { kind: 'train:mechanical', label: 'Treinar mira', icon: 'crosshair', hint: 'Mecânica · aim, spray, reflexo' },
  { kind: 'train:mental', label: 'Treinar tática', icon: 'brain', hint: 'Mental · leitura, decisões' },
  { kind: 'train:physical', label: 'Treinar físico', icon: 'physical', hint: 'Físico · stamina, APM' },
  { kind: 'demos', label: 'Revisar demos', icon: 'demos', hint: '+Foco e um pouco de tática' },
  { kind: 'gym', label: 'Academia', icon: 'gym', hint: '+Físico' },
  { kind: 'rest', label: 'Descansar', icon: 'rest', hint: '+Energia, +Físico, +Moral' },
  { kind: 'stream', label: 'Fazer live', icon: 'stream', hint: '+Dinheiro, +Fama' },
  { kind: 'social', label: 'Vida social', icon: 'social', hint: '+Moral, +Entrosamento' },
];

// Atalho de label do atributo pro toast/feedback (reexport conveniente).
export { ATTR_LABEL };
