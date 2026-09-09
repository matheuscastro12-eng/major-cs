// CICATRIZES (W4) — traits ADQUIRIDOS do técnico. Puro, sem React.
//
// As decisões da Carreira deixavam efeito imediato (moral, confiança, caixa) e
// depois sumiam. Aqui elas deixam MARCA: uma cicatriz é um trait com origem
// (o evento que a gerou), split de início, prazo (ou permanente) e efeitos
// numéricos pequenos e explícitos que o resto do jogo cita de volta —
// propostas de emprego, vínculo inicial de quem chega, química, olheiro.
//
// Regras:
//   - `evaluateScars` roda no FECHAMENTO do split e é determinística: mesmo
//     contexto → mesma lista. Nunca duplica um trait ATIVO; um trait expirado
//     fica no histórico e pode ser re-ganho (nova entrada, novo `since`).
//   - Pares positivo/negativo: palavra de ferro ↔ palavra quebrada, fiel ao
//     grupo ↔ porta giratória, formador ↔ mão de ferro, caçador de títulos ↔
//     traidor de projeto.
//   - Nenhum efeito é aplicado aqui: este módulo só DIZ o que vale; quem aplica
//     é o call site (jobHunt, mercado, watchlist).

export type ScarId =
  | 'palavra-quebrada'
  | 'palavra-de-ferro'
  | 'formador'
  | 'mao-de-ferro'
  | 'fiel-ao-grupo'
  | 'porta-giratoria'
  | 'cacador-de-titulos'
  | 'traidor-de-projeto';

export type ScarTone = 'good' | 'bad';

// Efeitos possíveis. Todo número é DELTA (soma) sobre o valor base do sistema.
export interface ScarEffects {
  /** vínculo (coachBond) inicial de quem CHEGA ao elenco */
  bondNewSigning?: number;
  /** química (pairChem) inicial dos pares formados por quem chega */
  chemNewSigning?: number;
  /** chance de contratação no job hunt, por tier do clube (1 = elite) */
  jobChanceByTier?: Partial<Record<1 | 2 | 3, number>>;
  /** watchlist revela conhecimento TODO fechamento (como se houvesse olheiro) */
  scoutEveryClose?: boolean;
}

export interface CoachScar {
  id: ScarId;
  name: string;          // PT-BR pronto pra UI
  description: string;   // o que o trait significa (uma frase)
  origin: string;        // o evento que gerou (com dados reais)
  tone: ScarTone;
  since: number;         // split em que foi ganho
  expires?: number;      // último split em que vale (inclusive). undefined = permanente
  effects: ScarEffects;
}

// Evento pontual que o fechamento não consegue reconstruir sozinho (o jogador
// já saiu do save). Registrado onde acontece; lido no evaluateScars.
export interface ScarEvent {
  kind: 'dismissedUnhappyStar';
  split: number;
  nick: string;
  ovr: number;
  morale: number;
}
const EVENTS_CAP = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo (nome, descrição, tom, prazo padrão, efeitos)

interface ScarDef {
  name: string;
  description: string;
  tone: ScarTone;
  duration?: number;     // splits de validade (undefined = permanente)
  effects: ScarEffects;
}

export const SCAR_DEFS: Record<ScarId, ScarDef> = {
  'palavra-quebrada': {
    name: 'Palavra quebrada',
    description: 'Prometeu a uma estrela e não cumpriu. Quem chega, chega desconfiado.',
    tone: 'bad',
    duration: 4,
    effects: { bondNewSigning: -8, jobChanceByTier: { 1: -0.06, 2: -0.06, 3: -0.06 } },
  },
  'palavra-de-ferro': {
    name: 'Palavra de ferro',
    description: 'Cumpre o que promete ao vestiário. Reforço chega confiando.',
    tone: 'good',
    duration: 6,
    effects: { bondNewSigning: 6, jobChanceByTier: { 1: 0.04, 2: 0.04, 3: 0.04 } },
  },
  'formador': {
    name: 'Formador',
    description: 'Revela jovens. Projetos de base te procuram e o olheiro rende mais.',
    tone: 'good',
    effects: { scoutEveryClose: true, jobChanceByTier: { 3: 0.10, 2: 0.04 } },
  },
  'mao-de-ferro': {
    name: 'Mão de ferro',
    description: 'Corta estrela infeliz sem dó. Grandes gostam; projetos longos temem.',
    tone: 'bad',
    duration: 6,
    effects: { bondNewSigning: -4, jobChanceByTier: { 1: 0.03, 3: -0.05 } },
  },
  'fiel-ao-grupo': {
    name: 'Fiel ao grupo',
    description: 'Mesmo núcleo há temporadas. Quem chega entra num time entrosado.',
    tone: 'good',
    duration: 4,
    effects: { chemNewSigning: 5, jobChanceByTier: { 3: 0.04, 2: 0.02 } },
  },
  'porta-giratoria': {
    name: 'Porta giratória',
    description: 'Troca o elenco toda hora. Ninguém entrosa; elite desconfia do método.',
    tone: 'bad',
    duration: 3,
    effects: { chemNewSigning: -5, jobChanceByTier: { 1: -0.04, 2: -0.02 } },
  },
  'cacador-de-titulos': {
    name: 'Caçador de títulos',
    description: 'Taça atrás de taça. As grandes orgs te querem.',
    tone: 'good',
    duration: 6,
    effects: { jobChanceByTier: { 1: 0.10, 2: 0.05 } },
  },
  'traidor-de-projeto': {
    name: 'Traidor de projeto',
    description: 'Promete à diretoria e não entrega. Clubes de projeto longo desconfiam.',
    tone: 'bad',
    duration: 6,
    effects: { jobChanceByTier: { 3: -0.10, 2: -0.05 } },
  },
};

// limiares (explícitos pra teste e pra UI)
export const SCAR_STAR_OVR = 80;          // "estrela" pra palavra quebrada / mão de ferro
export const SCAR_UNHAPPY_MORALE = 40;    // "infeliz" pra mão de ferro
export const SCAR_CORE_SPLITS = 4;        // splits juntos pra "fiel ao grupo"
export const SCAR_CORE_MIN = 4;           // jogadores do núcleo
export const SCAR_TITLES_WINDOW = 3;      // janela do caçador de títulos
export const SCAR_TITLES_MIN = 2;
export const SCAR_BOARD_BROKEN_WINDOW = 6; // janela do traidor de projeto
export const SCAR_BOARD_BROKEN_MIN = 2;
export const SCAR_KEPT_MIN = 3;           // promessas cumpridas pra palavra de ferro
export const SCAR_FORMADOR_MIN = 3;       // jovens promovidos/furos de teto
export const SCAR_IRON_HAND_MIN = 2;      // dispensas de estrela infeliz

// ─────────────────────────────────────────────────────────────────────────────
// Contexto do fechamento

export interface ScarCtx {
  split: number;                                   // split que está FECHANDO
  /** histórico da org, INCLUINDO o split atual (campeão de circuito / Major) */
  history: { split: number; champion: boolean; majorChampion?: boolean }[];
  /** promessas à DIRETORIA já julgadas, INCLUINDO a deste split */
  boardPromises: { split: number; met: boolean; text?: string }[];
  /** cobranças de promessas a JOGADORES julgadas NESTE fechamento */
  promiseHitsNow: { nick: string; ovr: number; kept: boolean }[];
  /** total de promessas a jogadores cumpridas/quebradas na carreira */
  promiseTally: { kept: number; broken: number };
  /** elenco atual (ids estáveis) e splits em que cada um jogou pela org */
  squadIds: string[];
  splitsPlayed: (playerId: string) => number[];
  /** jovens promovidos da academia (total) e furos de teto (total) */
  youthPromoted: number;
  breakthroughs: number;
  /** eventos pontuais registrados onde aconteceram */
  events: ScarEvent[];
}

export function isScarActive(s: CoachScar, split: number): boolean {
  return s.expires == null || s.expires >= split;
}
export function activeScars(list: CoachScar[] | undefined, split: number): CoachScar[] {
  return (list ?? []).filter((s) => isScarActive(s, split));
}

function make(id: ScarId, since: number, origin: string): CoachScar {
  const d = SCAR_DEFS[id];
  return {
    id, name: d.name, description: d.description, origin, tone: d.tone, since,
    ...(d.duration != null ? { expires: since + d.duration } : {}),
    effects: d.effects,
  };
}

// núcleo: quantos do elenco atual jogaram TODOS os últimos N splits pela org
export function coreSize(ctx: Pick<ScarCtx, 'split' | 'squadIds' | 'splitsPlayed'>, splits: number): number {
  const need: number[] = [];
  for (let s = ctx.split - splits + 1; s <= ctx.split; s++) need.push(s);
  if (need[0] < 1) return 0;
  return ctx.squadIds.filter((pid) => {
    const played = new Set(ctx.splitsPlayed(pid));
    return need.every((s) => played.has(s));
  }).length;
}

/**
 * Avalia o fechamento e devolve a lista COMPLETA (existentes + novas). Não
 * duplica trait ativo. Determinística: sem RNG, sem relógio.
 */
export function evaluateScars(ctx: ScarCtx, existing: CoachScar[] | undefined): CoachScar[] {
  const out = [...(existing ?? [])];
  const has = (id: ScarId) => out.some((s) => s.id === id && isScarActive(s, ctx.split));
  const add = (id: ScarId, origin: string) => { if (!has(id)) out.push(make(id, ctx.split, origin)); };
  const S = ctx.split;

  // PALAVRA QUEBRADA — quebrou promessa a jogador com OVR alto neste fechamento
  const brokeStar = ctx.promiseHitsNow.find((h) => !h.kept && h.ovr >= SCAR_STAR_OVR);
  if (brokeStar) add('palavra-quebrada', `Split ${S}: promessa quebrada com ${brokeStar.nick} (OVR ${brokeStar.ovr})`);

  // PALAVRA DE FERRO — ≥3 cumpridas e nenhuma quebrada na carreira (e não está com a quebrada ativa)
  if (ctx.promiseTally.kept >= SCAR_KEPT_MIN && ctx.promiseTally.broken === 0 && !has('palavra-quebrada')) {
    add('palavra-de-ferro', `Split ${S}: ${ctx.promiseTally.kept} promessas cumpridas ao vestiário, nenhuma quebrada`);
  }

  // FORMADOR — jovens promovidos + furos de teto
  const formed = ctx.youthPromoted + ctx.breakthroughs;
  if (formed >= SCAR_FORMADOR_MIN) {
    add('formador', `Split ${S}: ${ctx.youthPromoted} promovidos da academia e ${ctx.breakthroughs} furos de teto`);
  }

  // MÃO DE FERRO — dispensou 2 estrelas infelizes
  const dismissed = ctx.events.filter((e) => e.kind === 'dismissedUnhappyStar');
  if (dismissed.length >= SCAR_IRON_HAND_MIN) {
    const names = dismissed.slice(-SCAR_IRON_HAND_MIN).map((e) => `${e.nick} (S${e.split})`).join(', ');
    add('mao-de-ferro', `Dispensou estrelas infelizes: ${names}`);
  }

  // FIEL AO GRUPO ↔ PORTA GIRATÓRIA (só com histórico suficiente)
  if (S >= SCAR_CORE_SPLITS) {
    const core = coreSize(ctx, SCAR_CORE_SPLITS);
    if (core >= SCAR_CORE_MIN) add('fiel-ao-grupo', `Split ${S}: ${core} jogadores juntos há ${SCAR_CORE_SPLITS} splits`);
  }
  if (S >= 3) {
    const kept2 = coreSize(ctx, 3);
    if (kept2 <= 1 && ctx.squadIds.length >= 5) add('porta-giratoria', `Split ${S}: só ${kept2} do elenco está há 3 splits na org`);
  }

  // CAÇADOR DE TÍTULOS — 2 títulos em 3 splits
  const titles = ctx.history.filter((h) => h.split > S - SCAR_TITLES_WINDOW && h.split <= S && (h.champion || h.majorChampion));
  if (titles.length >= SCAR_TITLES_MIN) {
    add('cacador-de-titulos', `${titles.length} títulos em ${SCAR_TITLES_WINDOW} splits (S${titles.map((t) => t.split).join(', S')})`);
  }

  // TRAIDOR DE PROJETO — 2 promessas à diretoria quebradas em 6 splits
  const broken = ctx.boardPromises.filter((p) => !p.met && p.split > S - SCAR_BOARD_BROKEN_WINDOW && p.split <= S);
  if (broken.length >= SCAR_BOARD_BROKEN_MIN) {
    add('traidor-de-projeto', `Promessas à diretoria quebradas: S${broken.map((b) => b.split).join(', S')}`);
  }

  return out;
}

/** Cicatrizes GANHAS neste split (pra manchete). */
export function scarsEarnedAt(list: CoachScar[], split: number): CoachScar[] {
  return list.filter((s) => s.since === split);
}

/** Soma dos efeitos das cicatrizes ativas. */
export function scarEffects(list: CoachScar[] | undefined, split: number): Required<Pick<ScarEffects, 'bondNewSigning' | 'chemNewSigning'>> & { jobChanceByTier: Record<1 | 2 | 3, number>; scoutEveryClose: boolean } {
  const acc = { bondNewSigning: 0, chemNewSigning: 0, jobChanceByTier: { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>, scoutEveryClose: false };
  for (const s of activeScars(list, split)) {
    acc.bondNewSigning += s.effects.bondNewSigning ?? 0;
    acc.chemNewSigning += s.effects.chemNewSigning ?? 0;
    acc.scoutEveryClose = acc.scoutEveryClose || !!s.effects.scoutEveryClose;
    for (const t of [1, 2, 3] as const) acc.jobChanceByTier[t] += s.effects.jobChanceByTier?.[t] ?? 0;
  }
  return acc;
}

/** A cicatriz ativa que mais pesa (em módulo) pra um tier de clube. */
export function scarCitedForTier(list: CoachScar[] | undefined, split: number, tier: number): { scar: CoachScar; delta: number } | null {
  const t = (Math.max(1, Math.min(3, tier)) as 1 | 2 | 3);
  let best: { scar: CoachScar; delta: number } | null = null;
  for (const s of activeScars(list, split)) {
    const d = s.effects.jobChanceByTier?.[t] ?? 0;
    if (d !== 0 && (!best || Math.abs(d) > Math.abs(best.delta))) best = { scar: s, delta: d };
  }
  return best;
}

/** Texto PT-BR dos efeitos (tooltip). */
export function describeScarEffects(s: CoachScar): string[] {
  const out: string[] = [];
  const e = s.effects;
  const pp = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n * 100)}pp`;
  if (e.bondNewSigning) out.push(`${e.bondNewSigning > 0 ? '+' : ''}${e.bondNewSigning} vínculo inicial de quem chega`);
  if (e.chemNewSigning) out.push(`${e.chemNewSigning > 0 ? '+' : ''}${e.chemNewSigning} química inicial de quem chega`);
  if (e.scoutEveryClose) out.push('watchlist revela todo fechamento');
  if (e.jobChanceByTier) {
    const parts = ([1, 2, 3] as const).filter((t) => e.jobChanceByTier?.[t]).map((t) => `tier ${t} ${pp(e.jobChanceByTier![t]!)}`);
    if (parts.length) out.push(`propostas de emprego: ${parts.join(', ')}`);
  }
  return out;
}

/** Prazo em PT-BR. */
export function describeScarTerm(s: CoachScar, split: number): string {
  if (s.expires == null) return 'permanente';
  if (s.expires < split) return `expirou no split ${s.expires}`;
  return `vale até o split ${s.expires}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ganchos de MERCADO (puro): registra dispensas de estrela infeliz e aplica o
// vínculo/química inicial de quem chega. Chamado no confirmar da janela.

export interface MarketScarsInput {
  split: number;
  scars: CoachScar[] | undefined;
  events: ScarEvent[] | undefined;
  /** quem SAIU do elenco na janela (com o estado ANTES de sair) */
  departed: { nick: string; ovr: number; morale: number }[];
  /** ids de quem CHEGOU e ids de quem fica (pra formar os pares) */
  arrivedIds: string[];
  squadIds: string[];
  coachBond: Record<string, number> | undefined;
  pairChem: Record<string, number> | undefined;
  bondDefault: number;
  chemDefault: number;
  pairKey: (a: string, b: string) => string;
}

export function applyScarsOnMarket(i: MarketScarsInput): { scarEvents: ScarEvent[]; coachBond: Record<string, number>; pairChem: Record<string, number> } {
  const events = [...(i.events ?? [])];
  for (const d of i.departed) {
    if (d.ovr >= SCAR_STAR_OVR && d.morale < SCAR_UNHAPPY_MORALE) {
      events.push({ kind: 'dismissedUnhappyStar', split: i.split, nick: d.nick, ovr: d.ovr, morale: d.morale });
    }
  }
  const fx = scarEffects(i.scars, i.split);
  const coachBond = { ...(i.coachBond ?? {}) };
  const pairChem = { ...(i.pairChem ?? {}) };
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  if (fx.bondNewSigning || fx.chemNewSigning) {
    for (const pid of i.arrivedIds) {
      if (fx.bondNewSigning) coachBond[pid] = clamp((coachBond[pid] ?? i.bondDefault) + fx.bondNewSigning);
      if (fx.chemNewSigning) {
        for (const other of i.squadIds) {
          if (other === pid) continue;
          const k = i.pairKey(pid, other);
          pairChem[k] = clamp((pairChem[k] ?? i.chemDefault) + fx.chemNewSigning);
        }
      }
    }
  }
  return { scarEvents: events.slice(-EVENTS_CAP), coachBond, pairChem };
}
