// Factory do save do RTP: gera o jogador inicial (16-18 anos, atributos baixos
// com headroom) e o time de academia com 4 colegas no formato runtime do engine.
//
// Determinístico por seed: mesmo input → mesmo save (replays/testes estáveis).

import {
  ALL_ATTRS, MECHANICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, type AttrKey,
} from '../attributes';
import { makeRng, randomSeed, type Rng } from '../rng';
import { hashStr } from '../../state/hash';
import { derivePlaystyle, type Role, type Playstyle } from '../../types';
import type { PlayerPersonality } from '../career/personality';
import type {
  ArchetypeDef, ArchetypeKind, ProPlayer, RoadToProSave, TeamContext,
} from './types';
import { coreStatsFromAttrs, proOvr } from './coreStats';
import { buildCircuit, computeObjective } from './circuit';
import { computeWorldRank } from './standing';
import { startTeam, startTeamForTier, joinTeam } from './world';
import { STARTER_SETUP } from './setup';
import { defaultProgression } from './perks';
import { defaultMedia } from './media';
import { defaultRecords } from './records';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de início (academia)

export const RTP_SAVE_VERSION = 15;
const START_MONEY = 2_000;       // moleque de academia: bolso curto
const START_WAGE = 800;          // R$/semana
const CONTRACT_WEEKS = 52;
const START_BUYOUT = 50_000;
export const CREATE_BUDGET = 12;  // pontos distribuíveis na criação (por categoria)
export const ACTIONS_PER_WEEK = 3; // ações por semana (RTP2)
export const WEEKS_PER_SEASON = 12; // semanas por temporada (= 1 ano de idade)

// ─────────────────────────────────────────────────────────────────────────────
// Arquétipos — viesam o seed inicial dos 28 atributos

export const ARCHETYPES: ArchetypeDef[] = [
  {
    kind: 'aimstar', label: 'Fenômeno da mira', icon: 'crosshair',
    desc: 'Talento mecânico bruto. Mira e reflexo acima da média; leitura ainda crua.',
    bias: { mechanical: 5, mental: 0, physical: 2 },
  },
  {
    kind: 'tactician', label: 'Cérebro tático', icon: 'brain',
    desc: 'Lê o jogo como ninguém. Game sense e comunicação fortes; mira a lapidar.',
    bias: { mechanical: 0, mental: 5, physical: 1 },
  },
  {
    kind: 'clutchgod', label: 'Sangue-frio', icon: 'snow',
    desc: 'Brilha na pressão. Frieza e clutch natos; consistência rodada a rodada oscila.',
    bias: { mechanical: 2, mental: 3, physical: 1 },
  },
  {
    kind: 'allrounder', label: 'Completo', icon: 'balance',
    desc: 'Sem buracos óbvios. Equilibrado nas três frentes — versátil em qualquer função.',
    bias: { mechanical: 2, mental: 2, physical: 2 },
  },
];

export function archetypeDef(kind: ArchetypeKind): ArchetypeDef {
  return ARCHETYPES.find((a) => a.kind === kind) ?? ARCHETYPES[3];
}

// Atributos-chave por função: recebem um bônus no seed (a identidade da role) e
// concentram o ganho de treino (RTP2).
export const ROLE_FOCUS: Record<Role, AttrKey[]> = {
  Entry: ['aim', 'aimMovement', 'reflexes', 'reaction'],
  AWP: ['awp', 'crosshair', 'preAim', 'positioning'],
  Rifler: ['aim', 'spray', 'tap', 'consistency'],
  Support: ['teamwork', 'communication', 'discipline', 'positioning'],
  Lurker: ['anticipation', 'gameSense', 'offAngles', 'clutch'],
  IGL: ['leadership', 'communication', 'gameSense', 'decisions'],
};

function categoryOf(k: AttrKey): 'mechanical' | 'mental' | 'physical' {
  if (MECHANICAL_KEYS.includes(k)) return 'mechanical';
  if (MENTAL_KEYS.includes(k)) return 'mental';
  return 'physical';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─────────────────────────────────────────────────────────────────────────────
// Seed dos 28 atributos

export interface CreateRtpInput {
  nick: string;
  name?: string;
  country: string;
  role: Role;
  role2?: Role;
  playstyle?: Playstyle;
  personality: PlayerPersonality;
  archetype: ArchetypeKind;
  age: number;
  // pontos distribuídos pelo usuário (somam até CREATE_BUDGET)
  categoryPoints: { mechanical: number; mental: number; physical: number };
  seed?: number;
  // Peneira (RTP): tier alvo de contratação + se foi bem (topo do pool). Sem isso,
  // cai no comportamento antigo (startTeam → tier mais baixo da região).
  startTier?: import('./types').Tier;
  tryoutStrong?: boolean;
}

// Constrói os 28 atributos iniciais. Base baixa (moleque cru) + bônus de role +
// arquétipo + pontos do usuário + ruído determinístico. Deixa headroom (teto 16)
// pra que o crescimento (RTP2) faça sentido.
export function seedAttributes(input: CreateRtpInput, rng: Rng): Record<AttrKey, number> {
  const arch = archetypeDef(input.archetype);
  const focus = new Set(ROLE_FOCUS[input.role]);
  const out = {} as Record<AttrKey, number>;

  // pontos do usuário diluídos entre os atributos de cada categoria
  const perCat = {
    mechanical: input.categoryPoints.mechanical / MECHANICAL_KEYS.length,
    mental: input.categoryPoints.mental / MENTAL_KEYS.length,
    physical: input.categoryPoints.physical / PHYSICAL_KEYS.length,
  };

  for (const k of ALL_ATTRS) {
    const cat = categoryOf(k);
    let v = 6;                       // base crua de prospecto
    v += arch.bias[cat] * 0.6;       // viés do arquétipo
    v += perCat[cat] * 1.4;          // investimento do usuário
    if (focus.has(k)) v += 3;        // identidade da função
    v += rng() * 3 - 1;             // ruído -1..+2
    out[k] = clamp(Math.round(v), 3, 16);
  }
  return out;
}

// Potencial oculto por atributo: teto que o treino pode alcançar. Mais jovem →
// mais headroom. Atributos-chave da role/arquétipo ganham teto extra (a build tem
// uma identidade clara). Um "talento global" (roll único) eleva tudo um pouco.
export function seedPotential(
  input: CreateRtpInput,
  attrs: Record<AttrKey, number>,
  rng: Rng,
): Record<AttrKey, number> {
  const focus = new Set(ROLE_FOCUS[input.role]);
  const arch = archetypeDef(input.archetype);
  const youth = clamp(20 - input.age, 0, 6);       // 16 anos → +4..+6
  const talent = 3 + Math.floor(rng() * 6);        // 3..8 headroom global
  const out = {} as Record<AttrKey, number>;
  for (const k of ALL_ATTRS) {
    const cat = categoryOf(k);
    let head = talent + youth * 0.5;
    head += arch.bias[cat] * 0.3;
    if (focus.has(k)) head += 3;                    // teto alto nos atributos-chave
    head += rng() * 3;                              // ruído 0..3
    out[k] = clamp(Math.round(attrs[k] + head), attrs[k], 20);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Save completo

export function createRtpSave(input: CreateRtpInput): RoadToProSave {
  const seed = input.seed ?? randomSeed();
  const rng = makeRng(seed);

  const attrs = seedAttributes(input, rng);
  const potential = seedPotential(input, attrs, rng);
  const ovr = proOvr(attrs, input.role);
  const playstyle = input.playstyle ?? derivePlaystyle(input.role);
  const id = `rtp-hero-${hashStr(`${input.nick}:${seed}`)}`;

  const player: ProPlayer = {
    id,
    nick: input.nick.trim() || 'rookie',
    name: input.name?.trim() || input.nick.trim() || 'Rookie',
    country: input.country,
    role: input.role,
    role2: input.role2,
    playstyle,
    personality: input.personality,
    archetype: input.archetype,
    age: input.age,
    attrs,
    trainingXp: Object.fromEntries(ALL_ATTRS.map((k) => [k, 0])) as Record<AttrKey, number>,
    potential,
    potentialRevealed: 15,    // coach dá um vislumbre inicial
    form: 1,
    ovr,
    progression: defaultProgression(),   // RTP v8 — nível 1, sem perks/traits ainda
  };

  // Entra num time REAL da sua região. Com a peneira, no TIER definido pelo
  // desempenho (elite/challenger/access/academy). Sem peneira (legado), no tier
  // mais baixo. Seus 4 colegas são os jogadores REAIS daquele time.
  const start = input.startTier
    ? startTeamForTier(input.country, seed, input.startTier, input.tryoutStrong ?? false)
    : startTeam(input.country, seed);
  const teammates = joinTeam(start.team, input.role);
  const team: TeamContext = {
    teamId: 'rtp-user',
    realTeamId: start.team.id,
    teamName: start.team.name,
    tag: start.team.tag,
    colors: start.team.colors,
    logo: start.team.logoUrl,
    tier: start.tier,
    squadRole: 'rotation',          // você é o novato chegando
    contract: { wage: START_WAGE, weeksLeft: CONTRACT_WEEKS, buyout: START_BUYOUT },
    teammates,
    chem: Object.fromEntries(teammates.map((m) => [m.sourcePlayerId, 30])),
  };

  const save: RoadToProSave = {
    _v: RTP_SAVE_VERSION,
    createdAt: 0,             // estampado ao persistir (Date.now fora do engine)
    player,
    life: {
      energy: 90,
      fitness: 85,
      morale: 70,
      focus: 75,
      fame: 8,
      money: START_MONEY,
      rel: { team: 50, coach: 50, fans: 10, family: 70, partner: 0 },
      flags: {},
    },
    team,
    setup: STARTER_SETUP(),   // RTP v6 — começa todo sucateado
    media: defaultMedia(8),   // RTP v9 — audiência inicial ~fama; sem rival ainda
    ui: { tab: 'overview', attrsOpen: false },
    world: {
      season: 1,
      week: 1,
      seasonEvent: 1,         // RTP v11 — etapa 1 de EVENTS_PER_SEASON
      actionsLeft: ACTIONS_PER_WEEK,
      region: start.region,
      division: `${start.tier}-${start.region}`,
      schedule: [],           // legado — substituído por world.league
      transferWindowOpen: false,
      eventRatingSum: 0, eventSeries: 0,   // RTP v13 — acumulador de rating do campeonato
    },
    inbox: [],
    history: {
      matchesPlayed: 0, mapsPlayed: 0, kills: 0, deaths: 0,
      ratingSum: 0, mvps: 0, trophies: [], awards: [], accolades: [], timeline: [], records: defaultRecords(), peakOvr: ovr,
    },
    sponsors: [],
    rng: { seed, tick: 0 },
  };
  // RTP4 — divisão do TIER de contratação (você + rivais, turno-returno). Antes era
  // sempre 'academy'; agora acompanha o tier definido pela peneira.
  save.world.league = buildCircuit(save, start.tier, (seed ^ 0x5eed1) >>> 0);
  save.world.objective = computeObjective(save.world.league);   // RTP v12 — meta da diretoria
  save.world.boardConfidence = 55;
  // RTP v13 — ranking mundial inicial (rookie de academia nasce lá no fim da fila).
  save.world.worldRank = computeWorldRank(save);
  save.world.peakRank = save.world.worldRank;
  return save;
}

// Reconstrói time/mundo/liga a partir do país do jogador, com dados REAIS.
// Usado pela migration v4→v5 (saves antigos tinham mundo procedural): entra num
// time real da região, reinicia a temporada e mantém player/vida/histórico.
export function rebuildRealWorld(save: RoadToProSave): RoadToProSave {
  const country = save.player?.country ?? 'br';
  const seed = (save.rng?.seed ?? 1) >>> 0;
  const start = startTeam(country, seed);
  const teammates = joinTeam(start.team, save.player.role);
  const team: TeamContext = {
    teamId: 'rtp-user', realTeamId: start.team.id,
    teamName: start.team.name, tag: start.team.tag, colors: start.team.colors, logo: start.team.logoUrl,
    tier: start.tier, squadRole: 'rotation',
    contract: save.team?.contract ?? { wage: START_WAGE, weeksLeft: CONTRACT_WEEKS, buyout: START_BUYOUT },
    teammates, chem: Object.fromEntries(teammates.map((m) => [m.sourcePlayerId, 30])),
  };
  const s: RoadToProSave = {
    ...save,
    team,
    setup: save.setup ?? STARTER_SETUP(),
    ui: save.ui ?? { tab: 'overview', attrsOpen: false },
    world: {
      ...save.world, season: 1, week: 1, seasonEvent: 1, actionsLeft: ACTIONS_PER_WEEK,
      region: start.region, division: `${start.tier}-${start.region}`, pendingOffers: [],
    },
  };
  s.world.league = buildCircuit(s, start.tier, (seed ^ 0x5eed1) >>> 0);
  s.world.objective = computeObjective(s.world.league);
  s.world.boardConfidence = s.world.boardConfidence ?? 55;
  s.world.worldRank = s.world.worldRank ?? computeWorldRank(s);
  s.world.peakRank = s.world.peakRank ?? s.world.worldRank;
  return s;
}

// Recalcula o OVR cacheado após mudança de atributos (treino, aging). Pure.
export function refreshOvr(save: RoadToProSave): RoadToProSave {
  const ovr = proOvr(save.player.attrs, save.player.role);
  return {
    ...save,
    player: { ...save.player, ovr },
    history: { ...save.history, peakOvr: Math.max(save.history.peakOvr, ovr) },
  };
}

// Stats core derivados (pra UI mostrar os 5 legados, e o engine no RTP3).
export { coreStatsFromAttrs };
// Factory do setup inicial (RTP v6) — reexport pro registry de migrations.
export { STARTER_SETUP };
