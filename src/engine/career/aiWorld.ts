// MUNDO DA IA — funções puras extraídas do CareerScreen (fase 3 · frente
// MERCADO) para que o motor de mercado (engine/clube/mercado.ts) e a medição de
// equilíbrio (scripts/measure-mercado-equilibrio.mts) montem o MESMO mundo que a
// Carreira mostra: idade-base, envelhecimento/aposentadoria da IA com jovens da
// base (regen), reposição de elencos curtos e aplicação de save.moves.
// Movimento puro de código: nenhuma regra mudou.
import type { Player, TeamSeason } from '../../types';
import { playerOvr } from '../ratings';
import { hashStr } from '../../state/hash';
import { macroRegionOf, type MacroRegion } from '../../data/regions';
import { CS2_REAL_2026 } from '../../data/bo3';
import { FREE_TEAM_ID } from './transferAI';
import { REAL_AGES, baseAge, effectiveAge, type YouthDebut } from './playerAge';
import { isNewgenId } from '../mundo/juventude';
import { RETIRED_TEAM_ID } from '../mundo/editor';
import { SPLITS_PER_YEAR } from '../clock';
import { replayPlayer, type EvoClock, type WorldEvoEntry, type WorldEvoMap } from './worldEvo';

export type PlayerPhase = 'rising' | 'prime' | 'declining';

export const FILL_ROLES = ['Rifler', 'Entry', 'Support', 'AWP', 'IGL'] as const;

// ----- geração de jovens (prospectos): nicks/nomes/países por região -----
// handles genéricos de jogador (estilo cena), pra reposição e academia
export const PROSPECT_NICKS = [
  'zen', 'kyro', 'naxz', 'volt', 'riku', 'jaxx', 'pyro', 'nova', 'frost', 'dashy',
  'exo', 'blaze', 'swiftz', 'aze', 'kibo', 'luca', 'vexx', 'm1ko', 'sond', 'ture',
  'kez', 'byte', 'sied', 'raze', 'quad', 'lynx', 'orbz', 'myth', 'zeno', 'kova',
  'tenz', 'flick', 'spark', 'nyx', 'rvn', 'clo', 'dize', 'wisp', 'koa', 'snax',
  'arix', 'bld', 'ghoul', 'jin', 'maru', 'penny', 'qz', 'sero', 'twix', 'yel',
];
export const PROSPECT_NAMES: Record<MacroRegion, string[]> = {
  americas: ['Lucas Almeida', 'Gabriel Souza', 'Mateo Pérez', 'Thiago Lima', 'Diego Castro', 'Bryan Mendoza', 'Caio Rocha', 'Nicolás Díaz', 'Pedro Vieira', 'Joaquín Ramírez'],
  europe: ['Lukas Novák', 'Mateusz Kowalski', 'Emil Johansson', 'Théo Laurent', 'Niklas Müller', 'Joonas Virtanen', 'Marco Rossi', 'Pedro Santos', 'Lars Andersen', 'Tomáš Horák'],
  cis: ['Artem Volkov', 'Danil Sokolov', 'Nikita Orlov', 'Timur Aliyev', 'Ruslan Petrov', 'Yegor Smirnov', 'Bohdan Kovalenko', 'Maksim Ivanov', 'Vlad Romanov', 'Alikhan Bekov'],
  asia: ['Wei Chen', 'Haoran Li', 'Jihoon Park', 'Kenta Sato', 'Arif Rahman', 'Minjun Kim', 'Zhang Yong', 'Rizki Putra', 'Hiroshi Tanaka', 'Faisal Noor'],
  oceania: ['Jack Wilson', 'Liam Taylor', 'Ethan Brown', 'Noah Smith', 'Cooper Jones', 'Jayden Lee', 'Mason Clark', 'Riley Evans', 'Lachlan Hall', 'Hayden Ross'],
  africa: ['Thabo Nkosi', 'Youssef Haddad', 'Karim Saidi', 'Sipho Dlamini', 'Omar Farouk', 'Tunde Adeyemi', 'Ayoub Benali', 'Liam van der Merwe', 'Kwame Mensah', 'Hassan Toure'],
};
export const REGION_CC: Record<MacroRegion, string[]> = {
  americas: ['br', 'us', 'ar', 'cl', 'mx', 'ca', 'pe', 'uy'],
  europe: ['se', 'dk', 'fr', 'de', 'pl', 'fi', 'pt', 'es', 'nl', 'cz'],
  cis: ['ru', 'ua', 'kz', 'by'],
  asia: ['cn', 'kr', 'jp', 'id', 'sa', 'mn'],
  oceania: ['au', 'nz'],
  africa: ['za', 'ma', 'eg', 'ng'],
};
// identidade determinística de um jovem (nick/nome/país) a partir de um seed
// sufixos pra compor nicks: 50 bases x ~13 variações = centenas de nicks únicos,
// evitando o "monte de jogador repetido" (com a renovação, muitos jovens nascem).
export const PROSPECT_NICK_SUFFIX = ['', '', 'zy', 'ko', 'ix', 'er', '1x', 'zin', 'oo', 'qt', 'on', 'sk', 'y0'];
export function prospectIdentity(seed: string, region: MacroRegion, homeCountry?: string): { nick: string; name: string; country: string } {
  const h = hashStr(seed);
  const names = PROSPECT_NAMES[region] ?? PROSPECT_NAMES.europe;
  const ccs = REGION_CC[region] ?? REGION_CC.europe;
  // IMPORTANTE: usar shift SEM sinal (>>>). hashStr retorna 0..2^32-1, e `h >> k`
  // (com sinal) vira NEGATIVO p/ h >= 2^31, gerando índice negativo => undefined.
  const base = PROSPECT_NICKS[(h >>> 4) % PROSPECT_NICKS.length];
  const suffix = PROSPECT_NICK_SUFFIX[(h >>> 11) % PROSPECT_NICK_SUFFIX.length];
  // NACIONALIDADE: uma base forma TALENTO LOCAL. Com homeCountry, ~78% dos jovens
  // saem com a nacionalidade da casa e ~22% são "imports" da mesma macro-região
  // (existem, mas são minoria) — assim um time BR não revela/regenera um polonês.
  // Sem homeCountry, distribui pela macro-região como antes.
  const country = homeCountry && (h % 100) < 78 ? homeCountry : ccs[h % ccs.length];
  return {
    nick: base + suffix,
    name: names[(h >>> 7) % names.length],
    country,
  };
}

// reposição da base: quando você TIRA um jogador de um time (contratação), ele
// não pode ficar nos dois lugares. O time perde o titular e promove um jovem da
// base (OVR baixo, determinístico) pra manter 5 — o time fica realmente mais fraco.
// O jovem tem nick/nome reais (não mais "TAG.jr1") pra parecer um prospecto de fato.
export function backfillPlayers(team: TeamSeason, n: number, start = 0): Player[] {
  const region = macroRegionOf(team.country) ?? 'europe';
  const out: Player[] = [];
  for (let i = start; i < start + n; i++) {
    const h = hashStr(`fill:${team.id}:${i}`);
    const base = 64 + (h % 9); // 64-72
    const ident = prospectIdentity(`fill:${team.id}:${i}`, region);
    out.push({
      id: `${team.id}__aca${i}`,
      nick: ident.nick,
      name: ident.name,
      country: team.country, // herda o país do time (jovem da base local)
      role: FILL_ROLES[h % FILL_ROLES.length],
      aim: base + (h % 4), consistency: base - 2, clutch: base - 3, awp: base - 7, igl: base - 5,
    });
  }
  return out;
}

// idade-base (REAL_AGES/baseAge) mora em playerAge.ts, junto do relógio da
// Carreira (effectiveAge); reexportada aqui para os consumidores de sempre.
export { REAL_AGES, baseAge };

// fase de carreira pela IDADE: jovem sobe, auge oscila, veterano cai.
export function playerPhase(_pid: string, age: number): PlayerPhase {
  if (age <= 21) return 'rising';
  if (age <= 27) return 'prime';
  return 'declining';
}

// ─── CURVA DA IA = CURVA DO SEU ELENCO (evolução · out/2026) ────────────────
// A IA não tem mais curva própria em OVR (evoDelta/driftFrom): cada jogador do
// mundo evolui atributo a atributo pela MESMA `evolveAttrs` do seu elenco, em
// contexto neutro, por replay determinístico (engine/career/worldEvo.ts). Quem
// saiu do seu elenco continua do estado gravado em `save.worldEvo`.

// idade em que um jogador da IA se aposenta (determinístico): longevidade,
// NÍVEL (quem está em queda num tier baixo para mais cedo; estrela segue) e
// MOTIVAÇÃO (a vontade de competir varia). Faixa 29–37, a maioria 31–34.
export function aiRetireAge(pid: string, ovr?: number): number {
  const long = Math.floor((hashStr(`long:${pid}`) % 100) / 25); // 0..3 (mesmo eixo da longevidade)
  const level = ovr == null ? 1 : ovr >= 86 ? 3 : ovr >= 82 ? 2 : ovr >= 76 ? 1 : 0;
  const drive = (hashStr(`drive:${pid}`) % 3) - 1; // −1..+1
  return 30 + long + level + drive;
}

// TETO de OVR de um jogador da IA pela idade de estreia. O espaço de
// crescimento da idade (a mesma régua de `potentialRoom`) é COMPRIMIDO no topo
// da escala: um jovem de 70 ainda tem os +9 inteiros, um de 88 quase não sobe —
// o topo da cena é relativo (senão o top 20 inteiro "amadurece" e infla).
export function aiPotentialOvr(pid: string, baseOvr: number, a0: number): number {
  const room = a0 <= 18 ? 9 : a0 <= 20 ? 7 : a0 <= 22 ? 4 : a0 <= 24 ? 2 : a0 <= 26 ? 1 : 0;
  const talent = room > 0 ? hashStr(`pot:${pid}`) % 4 : 0;
  const squeeze = Math.max(0.2, Math.min(1, (AI_POT_TOP - baseOvr) / AI_POT_SPAN));
  return Math.min(99, baseOvr + Math.round((room + talent) * squeeze));
}
// [evolução · out/2026] 88 → 90: com a curva única (crescimento espalhado e
// desacelerando nos últimos ~9 de OVR) os jovens da IA paravam 3+ abaixo do teto
export const AI_POT_TOP = 90;
export const AI_POT_SPAN = 18;

/** Teto do jovem da base (regen): o nível da vaga que herdou (titular original + 2, −0..2). */
export function regenPotOvr(pid: string, anchorOvr: number): number {
  return Math.min(99, anchorOvr + 2 - (hashStr(`rgpot:${pid}`) % 3));
}

/** Relógio de evolução de um jogador do mundo que estreou em `debut` com `a0` anos. */
export function aiClock(debut: number, a0: number, pot: number, evo?: WorldEvoEntry): EvoClock {
  const d = Math.max(1, Math.floor(debut));
  const ageAt = (s: number) => Math.max(15, Math.round(a0)) + Math.floor(Math.max(0, s - d) / SPLITS_PER_YEAR);
  // saiu do seu elenco: a IA continua do estado da saída (com o teto que ele tinha)
  if (evo && evo.split >= d) return { from: evo.split, ageAt, pot: evo.pot ?? pot, start: evo.attrDelta };
  return { from: d, ageAt, pot };
}

/**
 * O jogador da IA no split pela curva única: o titular original (debut 1, teto
 * da idade) ou o jovem da base que herdou a vaga (debut/idade no id, teto da vaga).
 * É a MESMA conta que a Carreira usa para resolver o contratado (findSigning).
 */
export function aiEvolvedPlayer(p: Player, split: number, debut: number, a0: number, pot: number, evo?: WorldEvoEntry): Player {
  return replayPlayer(p, split, aiClock(debut, a0, pot, evo));
}

/** Faixa do OVR de estreia do jovem que assume uma vaga (ele cresce depois, pelo
 *  relógio da vaga): teto 80; piso 66, o nível do jovem de reposição da base. */
export const REGEN_DEBUT_CAP = 80;
export const REGEN_DEBUT_FLOOR = 66;
const NO_SKIP: Set<string> = new Set();
// jovem da base que assume a vaga de um titular aposentado. OVR de estreia abaixo
// do nível do time (cru, com espaço pra crescer). Determinístico por time/vaga/geração.
export function regenYouth(team: TeamSeason, slot: number, gen: number, debut: number, a0: number, orig: Player): Player {
  const seed = `regen:${team.id}:${slot}:${gen}`;
  const region = macroRegionOf(team.country) ?? 'europe';
  // o substituto herda a nacionalidade do titular que saiu (a base do time forma
  // talento local) — um AWPer BR aposentado abre vaga pra um jovem BR, não um
  // polonês aleatório. orig.country > país do time (cobre imports do elenco).
  const ident = prospectIdentity(seed, region, orig.country || team.country);
  const h = hashStr(seed);
  // herda o PERFIL do titular original da vaga (mesma função/estilo), mas o NÍVEL
  // de estreia sai de quem está SAINDO agora — o veterano já em declínio (ou o
  // regen anterior), não o OVR do dataset — e tem teto de estreia: a vaga de uma
  // estrela não gera outra estrela pronta aos 17 (antes o substituto do ZywOo
  // estreava com ~89 e devolvia o time ao topo). Determinístico: quem sai é
  // refeito pelo mesmo relógio da vaga (aiSlotPlayer um split antes da estreia).
  const anchor = playerOvr(orig);
  const leaving = debut > 1 ? playerOvr(aiSlotPlayer(orig, team, slot, debut - 1, NO_SKIP)) : anchor;
  const gap = (leaving >= 90 ? 4 : leaving >= 86 ? 5 : leaving >= 82 ? 6 : 8) + (h % 2);
  const target = Math.max(REGEN_DEBUT_FLOOR, Math.min(REGEN_DEBUT_CAP, leaving - gap));
  const shift = anchor - target;
  const at = (v: number) => Math.max(40, Math.min(95, v - shift));
  return {
    id: `${team.id}~rg${slot}.${gen}.${debut}.${a0}`,
    nick: ident.nick, name: ident.name, country: ident.country, role: orig.role,
    aim: at(orig.aim), consistency: at(orig.consistency), clutch: at(orig.clutch), awp: at(orig.awp), igl: at(orig.igl),
  };
}

// resolve o jogador ATUAL de uma vaga da IA no split dado: o titular original
// envelhece até se aposentar; aí um jovem da base (academia) assume e evolui no
// lugar dele — e assim por diante. Mantém os elencos da IA vivos e renovados.
export function aiSlotPlayer(orig: Player, team: TeamSeason, slot: number, split: number, skip: Set<string>, worldEvo?: WorldEvoMap): Player {
  const anchor = playerOvr(orig); // nível da vaga: a base entra perto disso
  let curPlayer = orig, curId = orig.id, curBaseOvr = anchor, curA0 = baseAge(orig), debut = 1, gen = 0, isYouth = false;
  for (let guard = 0; guard < 8; guard++) {
    // [fase 4] veterano que já passou da idade de parar quando a Carreira começa
    // joga mais 2–4 anos (a despedida se espalha; nada de onda no split 2)
    const grace = gen === 0 ? 2 + (hashStr(`grace:${curId}`) % 3) : 0;
    const need = Math.max(aiRetireAge(curId, curBaseOvr) - curA0, grace);
    const retireSplit = need <= 0 ? debut + 1 : debut + SPLITS_PER_YEAR * need;
    if (split < retireSplit) break; // titular atual ainda em atividade
    gen++; debut = retireSplit;
    const a0 = 17 + (hashStr(`yage:${team.id}:${slot}:${gen}:${debut}`) % 3); // estreia 17-19
    curPlayer = regenYouth(team, slot, gen, debut, a0, orig);
    curId = curPlayer.id; curBaseOvr = playerOvr(curPlayer); curA0 = a0; isYouth = true;
  }
  if (skip.has(curId)) return curPlayer; // no seu elenco: evolui pelo save (attrEvo)
  // jovem da base pode crescer até um pouco acima do titular que saiu (não vira monstro)
  const pot = isYouth ? regenPotOvr(curId, anchor) : aiPotentialOvr(curId, curBaseOvr, curA0);
  return aiEvolvedPlayer(curPlayer, split, debut, curA0, pot, worldEvo?.[curId]);
}

export function applyAiAging(teams: TeamSeason[], split: number, skip: Set<string>, worldEvo?: WorldEvoMap): TeamSeason[] {
  if (split <= 1) return teams;
  // [fase 4 · juventude] jovem gerado (newgen) já vem no estado atual (evolui
  // atributo a atributo no fechamento do split): não passa pelo relógio da vaga
  return teams.map((t) => ({ ...t, players: t.players.map((p, i) => (skip.has(p.id) || isNewgenId(p.id) ? p : aiSlotPlayer(p, t, i, split, skip, worldEvo))) }));
}

// reconstrói os elencos aplicando as transferências acumuladas (playerId -> teamId).
// Como cada transferência é um swap balanceado, todo time se mantém com 5.
export function applyMoves(teams: TeamSeason[], moves: Record<string, string> | undefined): TeamSeason[] {
  if (!moves || Object.keys(moves).length === 0) return teams;
  const all: { p: Player; orig: string }[] = [];
  for (const t of teams) for (const p of t.players) all.push({ p, orig: t.id });
  // time extinto (defunct) não recebe ninguém. O jogador que tinha ido pra ele
  // (venda sua, movimento da IA) fica SEM CLUBE — o clube acabou, não é motivo
  // pra voltar ao time da base (bug: a base set/2026 extinguiu 21 clubes e as
  // vendas antigas pra eles "voltavam pro time de origem" cobrando taxa). A
  // exceção é o time dos aposentados: move pra lá segue caindo na origem.
  const valid = new Set(teams.filter((t) => !t.defunct).map((t) => t.id));
  const hasFree = valid.has(FREE_TEAM_ID);
  const defunct = new Set(teams.filter((t) => t.defunct && t.id !== RETIRED_TEAM_ID).map((t) => t.id));
  const teamOf = (pid: string, orig: string) => {
    const m = moves[pid];
    if (!m) return orig;
    if (valid.has(m)) return m;
    return hasFree && defunct.has(m) ? FREE_TEAM_ID : orig;
  };
  return teams.map((t) => ({ ...t, players: all.filter((ap) => teamOf(ap.p.id, ap.orig) === t.id).map((ap) => ap.p) }));
}

// pool ATUAL de free agents: o __free__ da base com save.moves aplicado — a IA
// pode ter contratado FAs (saem do pool) e liberado deslocados (entram). Antes
// o pool era o snapshot estático da base, então um FA contratado pela IA ainda
// apareceria de graça no mercado do usuário (duplicado).
export function currentFreeAgents(base: TeamSeason[], moves: Record<string, string> | undefined): Player[] {
  return applyMoves(base, moves).find((t) => t.id === FREE_TEAM_ID)?.players ?? [];
}

// ids endereçáveis por save.moves (jogadores REAIS da base — backfill sintético
// e extraOnTeam ficam fora do mercado da IA porque applyMoves não os move)
export const BASE_PLAYER_IDS: ReadonlySet<string> = new Set(CS2_REAL_2026.flatMap((t) => t.players.map((p) => p.id)));

// ─── Mundo da IA montado (mesmo pipeline do `currentEra` da Carreira) ──────
// base (CS2_REAL_2026 com as edições do admin) → save.moves → chegadas na
// frente do elenco → envelhecimento/aposentadoria → sem o __free__ e extintos →
// elenco curto completado com a base → vendidos customizados (extraOnTeam) →
// drift de força (aiDrift) sobre o teamwork.
export interface AiWorldArgs {
  base: TeamSeason[];
  moves?: Record<string, string>;
  split: number;
  /** ids do SEU elenco (evoluem pelo save.evo, não pelo envelhecimento da IA) */
  skip: Set<string>;
  takeoverId?: string | null;
  extraOnTeam?: Record<string, { player: Player; arrival: number }[]>;
  aiDrift?: Record<string, number>;
  /** [fase 3 · mercado] playerId → split de chegada: quem chegou pelo mercado
   *  entra na FRENTE do elenco (joga entre os 5), o banco fica no fim. Vazio =
   *  ordem de sempre (saves antigos não mudam). */
  arrivals?: Record<string, number>;
  /** [evolução] quem saiu do seu elenco: a IA continua do estado gravado */
  worldEvo?: WorldEvoMap;
  /** relógio da base promovida (idade dos vendidos da academia no comprador) */
  youthDebut?: Record<string, YouthDebut>;
}

// quem chegou pelo mercado joga: vai pra frente do elenco (mais recente primeiro)
export function orderArrivals(teams: TeamSeason[], moves: Record<string, string> | undefined, arrivals: Record<string, number> | undefined): TeamSeason[] {
  if (!arrivals || !moves) return teams;
  const keys = Object.keys(arrivals);
  if (keys.length === 0) return teams;
  return teams.map((t) => {
    const fresh = t.players.filter((p) => arrivals[p.id] != null && moves[p.id] === t.id);
    if (fresh.length === 0) return t;
    const ids = new Set(fresh.map((p) => p.id));
    fresh.sort((a, b) => (arrivals[b.id] - arrivals[a.id]) || (a.id < b.id ? -1 : 1));
    return { ...t, players: [...fresh, ...t.players.filter((p) => !ids.has(p.id))] };
  });
}

// VENDIDOS pelo usuário (extraOnTeam: academia, base, FA sem id na base) entram
// NA FRENTE do elenco, junto com as chegadas do mercado, pela ordem de chegada
// (mais recente primeiro) — o clube comprou pra jogar. Roda DEPOIS do
// envelhecimento: o índice de vaga que dá identidade aos regens (aiSlotPlayer)
// continua o mesmo de sempre.
export function withExtrasInFront(
  t: TeamSeason,
  extras: { player: Player; arrival: number }[] | undefined,
  moves: Record<string, string> | undefined,
  arrivals: Record<string, number> | undefined,
): TeamSeason {
  if (!extras || extras.length === 0) return t;
  const have = new Set(t.players.map((p) => p.id));
  const fresh = extras.filter((e) => !have.has(e.player.id));
  if (fresh.length === 0) return t;
  const arrivalOf = (p: Player) => (arrivals?.[p.id] != null && moves?.[p.id] === t.id ? arrivals[p.id] : -1);
  const all = [
    ...fresh.map((e) => ({ p: e.player, at: e.arrival })),
    ...t.players.map((p) => ({ p, at: arrivalOf(p) })),
  ];
  // sort estável: empate de split mantém vendido antes e a ordem de sempre do resto
  all.sort((x, y) => y.at - x.at);
  return { ...t, players: all.map((x) => x.p) };
}

// [evolução] vendido sem id na base (academia, base promovida, regen, newgen):
// a cópia da venda é o estado na saída e evolui pela curva única desde a chegada
export function extraClock(e: { player: Player; arrival: number }, worldEvo?: WorldEvoMap, youthDebut?: Record<string, YouthDebut>): EvoClock {
  const p = e.player;
  // a cópia é o estado NA CHEGADA (venda consumada na virada): evolui dali
  const from = Math.max(1, Math.floor(e.arrival));
  const ageAt = (s: number) => aiAgeOf(p, s, youthDebut);
  const ovr = playerOvr(p);
  const pot = worldEvo?.[p.id]?.pot ?? Math.max(ovr, aiPotentialOvr(p.id, ovr, ageAt(from)));
  return { from, ageAt, pot };
}
export function evolvedExtras(
  list: { player: Player; arrival: number }[] | undefined, split: number, worldEvo?: WorldEvoMap, youthDebut?: Record<string, YouthDebut>,
): { player: Player; arrival: number }[] | undefined {
  if (!list || list.length === 0) return list;
  return list.map((e) => {
    const p = replayPlayer(e.player, split, extraClock(e, worldEvo, youthDebut));
    return p === e.player ? e : { ...e, player: p };
  });
}

export function buildAiWorld(a: AiWorldArgs): TeamSeason[] {
  const moved = orderArrivals(applyMoves(a.base, a.moves), a.moves, a.arrivals);
  return applyAiAging(moved, a.split, a.skip, a.worldEvo)
    .filter((t) => t.id !== FREE_TEAM_ID && (!t.defunct || t.id === a.takeoverId))
    // vendidos antes do backfill: o jovem sintético da base só completa o que
    // o elenco (com os vendidos) não completa
    .map((t) => withExtrasInFront(t, evolvedExtras(a.extraOnTeam?.[t.id], a.split, a.worldEvo, a.youthDebut), a.moves, a.arrivals))
    .map((t) => (t.players.length >= 5 ? t : { ...t, players: [...t.players, ...backfillPlayers(t, 5 - t.players.length)] }))
    .map((t) => {
      const d = a.aiDrift?.[t.id];
      if (!d || t.id === a.takeoverId) return t;
      const tw = Math.max(40, Math.min(95, t.teamwork + d));
      return tw === t.teamwork ? t : { ...t, teamwork: tw };
    });
}

// free agents ATUAIS, envelhecidos como o resto do mundo (quem passou da idade
// se aposenta e vira um jovem sem id da base — fora do mercado)
export function agedFreeAgents(base: TeamSeason[], moves: Record<string, string> | undefined, split: number, skip: Set<string>, worldEvo?: WorldEvoMap): Player[] {
  const free = applyMoves(base, moves).find((t) => t.id === FREE_TEAM_ID);
  if (!free) return [];
  return applyAiAging([free], split, skip, worldEvo)[0].players;
}

// MERCADO VIVO — drift de força do fechamento de split: cada time da IA move o
// teamwork conforme a forma REAL de clube + ruído determinístico por split (sem
// o ruído, forma deriva de drift*4 e o roll viraria moto-perpétuo). Forma alta
// empurra +1 (até +6), baixa −1 (até −6), neutra decai rumo a 0.
export function nextAiDrift(teamIds: string[], forms: Record<string, number>, split: number, prev: Record<string, number> | undefined, seed?: string): Record<string, number> {
  const aiDrift = { ...(prev ?? {}) };
  for (const id of teamIds) {
    // semente do save (mundo.seed) salga o ruído: cada Carreira tem o seu drift
    const noise = (hashStr(seed ? `${seed}:drift:${id}:${split}` : `drift:${id}:${split}`) % 31) - 15; // -15..+15
    const roll = (forms[id] ?? 50) + noise;
    const was = aiDrift[id] ?? 0;
    let next: number;
    if (roll >= 62) next = Math.min(6, was + 1);
    else if (roll <= 38) next = Math.max(-6, was - 1);
    else next = was > 0 ? was - 1 : was < 0 ? was + 1 : 0;
    if (next === 0) delete aiDrift[id];
    else aiDrift[id] = next;
  }
  return aiDrift;
}

// idade de um jogador do mundo da IA no split (regen/newgen têm relógio próprio
// no id). `youthDebut` (save.youthDebut): a base promovida/criada que foi
// vendida ou emprestada continua no relógio da promoção — sem ele a cópia no
// comprador (extraOnTeam) caía em baseAge(p.age = idade NA PROMOÇÃO) + anos
// desde o split 1 e "envelhecia" 7+ anos de uma vez.
export function aiAgeOf(p: Pick<Player, 'id' | 'nick' | 'age'>, split: number, youthDebut?: Record<string, YouthDebut>): number {
  return effectiveAge(p, split, undefined, youthDebut);
}

// OVR de BASE (dataset) de um jogador real — referência pra "está em queda"
const BASE_OVR = new Map<string, number>(CS2_REAL_2026.flatMap((t) => t.players.map((p) => [p.id, playerOvr(p)] as [string, number])));
export function baseOvrOf(playerId: string): number | undefined {
  return BASE_OVR.get(playerId);
}
