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
import bo3Ages from '../../data/bo3-ages.json';
import { FREE_TEAM_ID } from './transferAI';
import { parseRegenPlayerId } from './signings';
import { ageFromCareerStart } from './playerAge';

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

// idades REAIS do bo3 (196/240) por nick; quem falta recebe uma idade plausível
// determinística. A idade efetiva sobe ~1 ano a cada 3 splits de carreira.
export const REAL_AGES = bo3Ages as Record<string, { age: number; born: string }>;
export function baseAge(p: Pick<Player, 'id' | 'nick' | 'age'>, youthAge?: Record<string, number>): number {
  // prospecto promovido da academia: idade-base guardada na promoção. Vem ANTES do
  // lookup por nick (um prospecto pode ter um nick que colide com um pro real).
  const y = youthAge?.[p.id];
  if (y != null) return y;
  // idade editada no CRM (override global): tem prioridade sobre a tabela por nick.
  if (p.age != null && p.age >= 15 && p.age <= 45) return p.age;
  const real = REAL_AGES[p.nick]?.age;
  if (real && real >= 15 && real <= 45) return real;
  // sem dado: assume AUGE (25-29), não juventude. Um pro de elenco real não pode
  // virar ct('jovem em ascensão') só por falta de idade na tabela (bug do coldzera/fer).
  // Jovens de verdade vêm da academia, que grava a idade na promoção (youthAge).
  return 25 + (hashStr(`age:${p.id}`) % 5);
}

// fase de carreira pela IDADE: jovem sobe, auge oscila, veterano cai.
export function playerPhase(_pid: string, age: number): PlayerPhase {
  if (age <= 21) return 'rising';
  if (age <= 27) return 'prime';
  return 'declining';
}
// delta da janela: por idade. Rising sobe rumo ao potencial e estabiliza ao
// atingir o teto; declínio cai mais forte com a idade. Determinístico por split.
export function evoDelta(pid: string, split: number, age: number, atCeiling: boolean): number {
  const phase = playerPhase(pid, age);
  const r = hashStr(`evo:${pid}:${split}`) % 100;
  if (phase === 'rising') {
    if (atCeiling) return r < 70 ? 0 : 1; // já chegou no potencial: quase parado
    return r < 40 ? 3 : r < 80 ? 2 : 1; // +1..+3
  }
  if (phase === 'prime') return r < 22 ? 1 : r < 82 ? 0 : -1; // -1..+1
  // DECLÍNIO (28+): NÃO é universal. A longevidade (determinística por jogador)
  // define quem segura o nível na casa dos 30 (lendas tipo s1mple/karrigan) e
  // quem cai cedo. O declínio também é mais suave que antes (acabou o -3 fixo).
  const longevity = hashStr(`long:${pid}`) % 100;        // 0-99 (maior = envelhece melhor)
  const declineFrom = 31 + Math.floor(longevity / 20);   // 31..35: idade em que o declínio realmente começa
  if (age < declineFrom) return r < 82 ? 0 : -1;         // "prime estendido": quase sempre estável, raríssimo -1
  const over = age - declineFrom;                        // anos desde o início do declínio
  if (over === 0) return r < 50 ? 0 : -1;               // 1º ano de declínio: metade segura
  if (over <= 2) return r < 55 ? -1 : 0;               // declínio brando
  return r < 55 ? -2 : -1;                              // declínio tardio, mais firme (mas nunca -3)
}

// idade em que um jogador da IA se aposenta (determinístico, mesmo eixo de
// longevidade do evoDelta): a maioria sai por volta de 35-38.
export function aiRetireAge(pid: string): number {
  return 35 + Math.floor((hashStr(`long:${pid}`) % 100) / 25); // 35..38
}

// drift de OVR entre o split de estreia e o atual, pelo relógio de idade próprio
// do jogador (serve tanto pro titular original quanto pro jovem da base).
export function driftFrom(pid: string, baseOvr: number, a0: number, debut: number, split: number, potCap?: number): number {
  if (split <= debut) return 0;
  const room = a0 <= 18 ? 9 : a0 <= 20 ? 7 : a0 <= 22 ? 4 : a0 <= 24 ? 2 : a0 <= 26 ? 1 : 0;
  const talent = room > 0 ? hashStr(`pot:${pid}`) % 4 : 0;
  const pot = Math.min(99, potCap ?? 99, baseOvr + room + talent);
  let cur = baseOvr;
  for (let s = debut; s < split; s++) {
    const age = a0 + Math.floor((s - debut) / 3);
    cur = Math.max(40, Math.min(99, cur + evoDelta(pid, s, age, cur >= pot)));
  }
  return Math.round(Math.max(-12, Math.min(12, cur - baseOvr)));
}

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
  // herda o PERFIL do titular que saiu (mesma função/estilo) e entra um pouco abaixo:
  // quanto mais forte a vaga, menor o gap — o time mantém a firepower ao renovar.
  const anchor = playerOvr(orig);
  const gap = (anchor >= 90 ? 4 : anchor >= 86 ? 5 : anchor >= 82 ? 6 : 8) + (h % 2);
  const at = (v: number) => Math.max(40, Math.min(95, v - gap));
  return {
    id: `${team.id}~rg${slot}.${gen}.${debut}.${a0}`,
    nick: ident.nick, name: ident.name, country: ident.country, role: orig.role,
    aim: at(orig.aim), consistency: at(orig.consistency), clutch: at(orig.clutch), awp: at(orig.awp), igl: at(orig.igl),
  };
}

// resolve o jogador ATUAL de uma vaga da IA no split dado: o titular original
// envelhece até se aposentar; aí um jovem da base (academia) assume e evolui no
// lugar dele — e assim por diante. Mantém os elencos da IA vivos e renovados.
export function aiSlotPlayer(orig: Player, team: TeamSeason, slot: number, split: number, skip: Set<string>): Player {
  const clamp = (v: number) => Math.max(40, Math.min(99, v));
  const anchor = playerOvr(orig); // nível da vaga: a base entra perto disso
  let curPlayer = orig, curId = orig.id, curBaseOvr = anchor, curA0 = baseAge(orig), debut = 1, gen = 0, isYouth = false;
  for (let guard = 0; guard < 8; guard++) {
    const need = aiRetireAge(curId) - curA0;
    const retireSplit = need <= 0 ? debut + 1 : debut + 3 * need;
    if (split < retireSplit) break; // titular atual ainda em atividade
    gen++; debut = retireSplit;
    const a0 = 17 + (hashStr(`yage:${team.id}:${slot}:${gen}:${debut}`) % 3); // estreia 17-19
    curPlayer = regenYouth(team, slot, gen, debut, a0, orig);
    curId = curPlayer.id; curBaseOvr = playerOvr(curPlayer); curA0 = a0; isYouth = true;
  }
  if (skip.has(curId)) return curPlayer; // se o usuário contratou esse jovem, ele evolui pelo save.evo
  // jovem da base pode crescer até um pouco acima do titular que saiu (não vira monstro)
  const d = driftFrom(curId, curBaseOvr, curA0, debut, split, isYouth ? anchor + 2 : undefined);
  if (!d) return isYouth ? curPlayer : orig;
  const p = curPlayer;
  return { ...p, aim: clamp(p.aim + d), consistency: clamp(p.consistency + d), clutch: clamp(p.clutch + d), awp: clamp(p.awp + d), igl: clamp(p.igl + d) };
}

export function applyAiAging(teams: TeamSeason[], split: number, skip: Set<string>): TeamSeason[] {
  if (split <= 1) return teams;
  return teams.map((t) => ({ ...t, players: t.players.map((p, i) => (skip.has(p.id) ? p : aiSlotPlayer(p, t, i, split, skip))) }));
}

// reconstrói os elencos aplicando as transferências acumuladas (playerId -> teamId).
// Como cada transferência é um swap balanceado, todo time se mantém com 5.
export function applyMoves(teams: TeamSeason[], moves: Record<string, string> | undefined): TeamSeason[] {
  if (!moves || Object.keys(moves).length === 0) return teams;
  const all: { p: Player; orig: string }[] = [];
  for (const t of teams) for (const p of t.players) all.push({ p, orig: t.id });
  // time extinto (defunct) não recebe ninguém: o jogador volta ao time da base
  const valid = new Set(teams.filter((t) => !t.defunct).map((t) => t.id));
  const teamOf = (pid: string, orig: string) => {
    const m = moves[pid];
    return m && valid.has(m) ? m : orig;
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

export function buildAiWorld(a: AiWorldArgs): TeamSeason[] {
  const moved = orderArrivals(applyMoves(a.base, a.moves), a.moves, a.arrivals);
  return applyAiAging(moved, a.split, a.skip)
    .filter((t) => t.id !== FREE_TEAM_ID && (!t.defunct || t.id === a.takeoverId))
    .map((t) => (t.players.length >= 5 ? t : { ...t, players: [...t.players, ...backfillPlayers(t, 5 - t.players.length)] }))
    .map((t) => {
      const extras = a.extraOnTeam?.[t.id];
      if (!extras || extras.length === 0) return t;
      const have = new Set(t.players.map((p) => p.id));
      const fresh = extras.filter((e) => !have.has(e.player.id)).map((e) => e.player);
      return fresh.length === 0 ? t : { ...t, players: [...t.players, ...fresh] };
    })
    .map((t) => {
      const d = a.aiDrift?.[t.id];
      if (!d || t.id === a.takeoverId) return t;
      const tw = Math.max(40, Math.min(95, t.teamwork + d));
      return tw === t.teamwork ? t : { ...t, teamwork: tw };
    });
}

// free agents ATUAIS, envelhecidos como o resto do mundo (quem passou da idade
// se aposenta e vira um jovem sem id da base — fora do mercado)
export function agedFreeAgents(base: TeamSeason[], moves: Record<string, string> | undefined, split: number, skip: Set<string>): Player[] {
  const free = applyMoves(base, moves).find((t) => t.id === FREE_TEAM_ID);
  if (!free) return [];
  return applyAiAging([free], split, skip)[0].players;
}

// MERCADO VIVO — drift de força do fechamento de split: cada time da IA move o
// teamwork conforme a forma REAL de clube + ruído determinístico por split (sem
// o ruído, forma deriva de drift*4 e o roll viraria moto-perpétuo). Forma alta
// empurra +1 (até +6), baixa −1 (até −6), neutra decai rumo a 0.
export function nextAiDrift(teamIds: string[], forms: Record<string, number>, split: number, prev: Record<string, number> | undefined): Record<string, number> {
  const aiDrift = { ...(prev ?? {}) };
  for (const id of teamIds) {
    const noise = (hashStr(`drift:${id}:${split}`) % 31) - 15; // -15..+15
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

// idade de um jogador do mundo da IA no split (regen tem relógio próprio no id)
export function aiAgeOf(p: Pick<Player, 'id' | 'nick' | 'age'>, split: number): number {
  const rg = parseRegenPlayerId(p.id);
  if (rg) return rg.ageAtDebut + Math.floor(Math.max(0, split - rg.debut) / 3);
  return ageFromCareerStart(baseAge(p), split);
}

// OVR de BASE (dataset) de um jogador real — referência pra "está em queda"
const BASE_OVR = new Map<string, number>(CS2_REAL_2026.flatMap((t) => t.players.map((p) => [p.id, playerOvr(p)] as [string, number])));
export function baseOvrOf(playerId: string): number | undefined {
  return BASE_OVR.get(playerId);
}
