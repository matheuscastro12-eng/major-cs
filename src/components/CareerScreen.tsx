// MODO CARREIRA REALISTA (v0, NÃO LISTADO: só abre via #carreira).
// Fundar sua organização nos tempos atuais (só elencos CS2), contratar dentro
// do orçamento e disputar o CIRCUIT X (liga BR de pontos corridos). Vitórias
// rendem dinheiro e pontos de VRS - o caminho até o Major virá nas próximas
// fases. Textos em PT por enquanto (modo em refino, não lançado).
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney, playerValue, playerWage, buildUserTeam, playerOvr, resyncUserRoles } from '../engine/ratings';
import { leagueDone, leagueTable, leagueTeam, resolveLeagueRound, userLeagueMatch, type League, type LeagueMatch } from '../engine/league';
import { createGSLStage, resolveGSLRound, gslDone, gslQualifiers, gslGroupView, GSL_ROUND_LABELS } from '../engine/gsl';
import { teamSeasonToTTeam } from '../engine/ratings';
import { simulateSeries } from '../engine/match';
import { autoVeto } from '../engine/veto';
import { createSwissStage, createPlayoffStage, stageAdvancers, placementCode, resolveRound, userPairing as tournamentUserPairing, getTeam, type PlacementCode } from '../engine/swiss';
import { Hub } from './Hub';
import { makeRng, randomSeed, type Rng } from '../engine/rng';
import type { Coach, MapId, Player, Playbook, Role, SeriesResult, TeamSeason, Tournament, TTeam } from '../types';
import { MAP_LABELS, MAP_POOL, PLAYBOOK_DESC, PLAYBOOK_LABELS } from '../types';
import { MatchScreen } from './MatchScreen';
import { VetoScreen } from './VetoScreen';
import { Scoreboard } from './Scoreboard';
import { AttrBar, Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';
import { OrgFlag } from './flags';
import { logoForTeam } from '../data/media';
import { hashStr } from '../state/hash';
import { macroRegionOf, macroRegionPlurality, MACRO_REGION_LABELS, MACRO_REGION_ORDER, type MacroRegion } from '../data/regions';
import { CS2_REAL_2026 } from '../data/bo3';
import { applyBo3Edits, fetchBo3Edits, loadBo3Edits, mergeBo3Edits, saveBo3Edits, type Bo3Edits } from '../state/bo3-edits';
import { isAdminUnlocked } from './AdminGate';
import bo3Ages from '../data/bo3-ages.json';

const SAVE_KEY = 'rtm-career-v1';
const STARTING_BUDGET = 3_800_000; // começo mais magro: forca um elenco humilde no inicio
const CIRCUIT_AI_BOOST = 1.5; // leve vantagem do circuito (mantem forcas perto do Major)
// premiação mais enxuta: montar o time dos sonhos leva várias temporadas (antes
// dava pra ter o melhor elenco com grana sobrando já no split 3)
const PRIZE_BY_POS = [1_250_000, 750_000, 450_000, 280_000, 170_000, 110_000, 70_000, 40_000];
const VRS_BY_POS = [150, 105, 75, 52, 36, 26, 18, 11];
// VRS é ROLANTE (como o Valve ranking real): a cada split os pontos antigos
// decaem, então não acumulam pra sempre (acabou o usuário com 3000 e a IA com
// 1200). No equilíbrio o VRS ganho ~ ganho/(1-decay), comparável ao field.
const VRS_DECAY = 0.6;
// PLANO DE JOGO: a decisão pré-partida do usuário. Cada plano dá um buff REAL na
// simulação (some você do "modo espectador": sua escolha muda a partida).
type GamePlan = 'disciplined' | 'antistrat' | 'mapfocus' | 'aggressive';
const GAME_PLANS: { id: GamePlan; icon: string; label: string; desc: string }[] = [
  { id: 'disciplined', icon: '🧠', label: 'Disciplinado', desc: 'Jogo seguro e constante. Baixa variância, base sólida.' },
  { id: 'antistrat', icon: '🔍', label: 'Anti-strat', desc: 'Estuda o adversário: defesa mais sólida. Bom contra times melhores.' },
  { id: 'mapfocus', icon: '🗺️', label: 'Foco no mapa forte', desc: 'Puxa o veto pro seu melhor mapa e joga mais forte nele.' },
  { id: 'aggressive', icon: '⚔️', label: 'Agressivo', desc: 'Pressão nas aberturas: teto alto, mais arriscado.' },
];
// aplica o buff do plano no time do usuário antes da partida
function applyGamePlanBuff(t: TTeam, plan: GamePlan): TTeam {
  if (plan === 'aggressive') return { ...t, strength: t.strength + 2.5 };
  if (plan === 'antistrat') return { ...t, strength: t.strength + 2 };
  if (plan === 'mapfocus') {
    const prefs: Record<string, number> = { ...t.mapPrefs };
    const best = Object.entries(prefs).sort((a, b) => b[1] - a[1])[0];
    if (best) prefs[best[0]] = Math.min(5, best[1] + 2); // reforça o melhor mapa (veto + força)
    return { ...t, mapPrefs: prefs, strength: t.strength + 1 };
  }
  return { ...t, strength: t.strength + 1.5 }; // disciplined
}
const LEAGUE_BO: 1 | 3 = 3;
const MAJOR_SPOTS = 2; // top 2 do Circuit X garantem vaga no Major
const MAJOR_VRS_CUT = 32; // os 32 melhores do ranking VRS vão ao Major (3 stages)
// o Major Mundial fecha a TEMPORADA: a cada N campeonatos/splits acontece um Major.
// 4 = a temporada tem 3 campeonatos tier-1 + o Major encerrando o ano.
const MAJOR_EVERY = 4;
const isMajorSplit = (split: number) => split % MAJOR_EVERY === 0;
// premiação e VRS do Major por colocação (bem maior que o circuito)
const MAJOR_PRIZE: Record<PlacementCode, number> = {
  champion: 8_000_000,
  runnerup: 4_000_000,
  semi: 2_400_000,
  quarters: 1_400_000,
  playoffs: 800_000,
  swiss: 400_000,
};
const MAJOR_VRS: Record<PlacementCode, number> = {
  champion: 600,
  runnerup: 400,
  semi: 280,
  quarters: 180,
  playoffs: 120,
  swiss: 70,
};
// nomes reais de Majors (fonte: Liquipedia), rotacionando por split
const MAJOR_NAMES = ['PGL Major Copenhagen', 'BLAST.tv Austin Major', 'IEM Major Rio', 'PGL Major Budapest', 'ESL One Major Cologne'];
const MAJOR_NAME = (split: number) => MAJOR_NAMES[(split - 1) % MAJOR_NAMES.length];
// CALENDÁRIO TIER 1 (Liquipedia/HLTV): cada split é um campeonato real DISTINTO do
// ano, jogado em sequência (datas diferentes). Por serem em datas diferentes, os
// mesmos melhores times disputam todos — sem "jogar dois ao mesmo tempo". O ciclo
// é contínuo entre temporadas, então cada split traz um evento diferente.
const T1_EVENTS = [
  'IEM Katowice', 'ESL Pro League', 'IEM Cologne', 'IEM Dallas',
  'PGL Cluj-Napoca', 'BLAST Premier World Final', 'IEM Chengdu', 'Esports World Cup',
  'BLAST Open Lisboa', 'IEM Melbourne', 'PGL Astana', 'Thunderpick World Championship',
];
const t1EventName = (split: number) => T1_EVENTS[(split - 1) % T1_EVENTS.length];
// Tier 2 mundial: circuitos de segundo escalão reais (sem trava de região).
const T2_EVENTS = [
  'ESL Challenger League', 'CCT Global Finals', 'Elisa Masters Espoo', 'YaLLa Compass',
  'Thunderpick World Champ', 'Pinnacle Cup', 'CCT Season Finals', 'Skyesports Masters',
];
const t2EventName = (split: number) => T2_EVENTS[(split - 1) % T2_EVENTS.length];
// Tier 3: circuitos de acesso/qualificatórias (onde toda org começa).
const T3_EVENTS = [
  'ESEA Advanced Season', 'CCT Open Series', 'Gamers Club Liga Pro', 'European Pro League',
  'Pinnacle Winter Series', 'Elisa Invitational Qual', 'ESL Challenger Open', 'CCT Series',
];
const t3EventName = (split: number) => T3_EVENTS[(split - 1) % T3_EVENTS.length];

interface Signing {
  playerId: string;
  fromId: string;
  fee?: number; // valor negociado da transferência (se ausente, usa o de tabela)
}

// jogador com contrato vencendo: vai pra tela de renovação na janela.
interface Renewal { playerId: string; nick: string; ovr: number; wage: number; country: string; role: Role; }

// acordo de transferência fechado durante a temporada: entra em vigor só na
// janela (próximo split). Pode ser só dinheiro ou dinheiro + troca de jogadores.
interface PendingDeal {
  id: string;
  inPlayerId: string;   // jogador que CHEGA
  inFromId: string;     // clube de origem dele
  inNick: string;       // nick (cache, pra exibir sem resolver)
  fee: number;          // dinheiro que VOCÊ paga (líquido, já descontada a troca)
  outPlayerIds: string[]; // seus jogadores que SAEM na troca (ids)
  outNicks: string[];   // nicks dos que saem (cache)
}

// ---------- negociação de transferência (mercado) ----------
// resistência do clube a vender: estrela e jogador de time forte valem MAIS que o
// preço de tabela — é o ágio pra tirar alguém de um clube que não quer vender.
function sellResistance(player: Player, fromTeamwork: number): number {
  const ovr = playerOvr(player);
  let r = ovr >= 88 ? 1.9 : ovr >= 84 ? 1.55 : ovr >= 80 ? 1.32 : ovr >= 76 ? 1.14 : 1.0;
  r += Math.max(0, (fromTeamwork - 80) / 90); // tirar de um top custa mais
  return r;
}
function askingPrice(player: Player, fromTeamwork: number): number {
  return Math.round(playerValue(player) * sellResistance(player, fromTeamwork));
}
type NegoReply =
  | { kind: 'accept' }
  | { kind: 'counter'; value: number }
  | { kind: 'reject'; firm: boolean; msg: string };
// resposta do clube a uma proposta (offer = dinheiro + valor da troca).
function clubReply(offer: number, asking: number, player: Player, fromTeamwork: number, round: number): NegoReply {
  const ovr = playerOvr(player);
  // estrela de time forte às vezes simplesmente não está à venda
  if (ovr >= 89 && fromTeamwork >= 84 && round === 0 && hashStr(`${player.id}:nfs`) % 100 < 55) {
    return { kind: 'reject', firm: true, msg: `${player.nick} não está à venda. O clube não quer nem ouvir.` };
  }
  // PISO: o menor valor que o clube aceita. Amolece no MÁXIMO ~12% ao longo de
  // poucas rodadas e NUNCA abaixo disso — insistir com a mesma oferta não derruba
  // mais o preço (antes a contraproposta caía sem limite e dava pra pagar 0).
  const soft = Math.round(asking * (1 - 0.04 * Math.min(round, 3)));
  if (offer >= soft) return { kind: 'accept' };
  const ratio = offer / Math.max(1, asking);
  // lowball repetido: o clube cansa e encerra a negociação
  if (ratio < 0.6 && round >= 2) {
    return { kind: 'reject', firm: true, msg: 'O clube cansou da conversa: proposta baixa demais, negociação encerrada.' };
  }
  if (ratio < 0.45) {
    return { kind: 'reject', firm: false, msg: 'Proposta muito abaixo do valor. O clube recusou na hora.' };
  }
  // contraproposta entre a sua oferta e a pedida, SEMPRE >= o piso (nunca abaixo)
  const counter = Math.max(soft, Math.round((offer + asking) / 2));
  return { kind: 'counter', value: counter };
}

// Patrocinadores: marcas reais que pagam por split. Os de maior tier exigem
// prestígio (VRS acumulado) pra liberar o contrato. Até 3 slots ativos.
interface Sponsor {
  id: string;
  name: string;
  perSplit: number;
  minVrs: number;
  color: string;
  term: number; // splits de compromisso ao assinar (não dá pra sair antes)
}
const SPONSORS: Sponsor[] = [
  { id: 'logitech', name: 'Logitech G', perSplit: 200_000, minVrs: 0, color: '#00b8fc', term: 2 },
  { id: 'hyperx', name: 'HyperX', perSplit: 280_000, minVrs: 0, color: '#e21b22', term: 2 },
  { id: 'razer', name: 'Razer', perSplit: 320_000, minVrs: 220, color: '#44d62c', term: 2 },
  { id: 'secretlab', name: 'Secretlab', perSplit: 360_000, minVrs: 320, color: '#d9a441', term: 3 },
  { id: 'monster', name: 'Monster Energy', perSplit: 400_000, minVrs: 460, color: '#7ed957', term: 3 },
  { id: 'intel', name: 'Intel', perSplit: 520_000, minVrs: 700, color: '#0071c5', term: 3 },
  { id: 'redbull', name: 'Red Bull', perSplit: 650_000, minVrs: 1000, color: '#cc0033', term: 4 },
  { id: 'samsung', name: 'Samsung', perSplit: 800_000, minVrs: 1400, color: '#1428a0', term: 4 },
];
const SPONSOR_SLOTS = 3;
const sponsorById = (id: string) => SPONSORS.find((s) => s.id === id);
const sponsorIncome = (ids: string[]) => ids.reduce((a, id) => a + (sponsorById(id)?.perSplit ?? 0), 0);

// ----- prestígio + fãs da org (estilo Brasval) -----
// Derivados de conquistas (sem campo novo no save: não quebram saves e sobem ao
// longo da carreira). Prestígio 5-99; fãs crescem junto.
function careerPrestige(save: CareerSave): number {
  const h = aggregateHistory(save.history);
  const v = 22 + save.titles * 7 + h.majorApps * 4 + h.circuitTitles * 3 + (3 - (save.tier ?? 3)) * 6 + (save.vrs ?? 0) / 40;
  return Math.max(5, Math.min(99, Math.round(v)));
}
function careerFans(save: CareerSave): number {
  const p = careerPrestige(save);
  return Math.round(Math.pow(p, 1.6) * 1100 + aggregateHistory(save.history).totalPrize / 120);
}
// patrocínio efetivo: prestígio atrai marcas melhores (até +33% no topo).
function effSponsorIncome(save: CareerSave): number {
  return Math.round(sponsorIncome(save.sponsors) * (1 + careerPrestige(save) / 300));
}
function formatFans(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

// leitura do olheiro: força por mapa de um time. Usa o mapPrefs real (se houver)
// + uma assinatura determinística por time, pra SEMPRE existir um mapa perigoso
// e um fraco plausíveis (a base do bo3 vem com mapPrefs vazio na maioria).
function scoutMaps(team: { id: string; mapPrefs?: Partial<Record<MapId, number>> }) {
  return MAP_POOL
    .map((m) => {
      const pref = team.mapPrefs?.[m] ?? 0;
      const sig = ((hashStr(`map:${team.id}:${m}`) % 100) - 50) / 25; // -2..+2 determinístico
      return { m, v: pref + sig };
    })
    .sort((a, b) => b.v - a.v);
}

// campeonato escolhido para o split (define o chaveamento e a premiação)
interface CircuitChoice {
  id: string;
  name: string;
  spots: number;     // vagas que vão ao Major
  prizeMult: number; // multiplicador de premiação
  vrsWeight: number; // peso de VRS do evento (força média dos adversários, 0.08-1.25)
  tier: number;      // 1 = elite (caminho do Major), 3 = liga de acesso
}

// tiers do cenário (como na vida real do CS): 1 = elite mundial, 3 = acesso.
// o jogador começa no Tier 3 e precisa SUBIR vencendo no seu nível.
const TIER_NAMES: Record<number, string> = { 1: 'Tier 1 · Elite', 2: 'Tier 2 · Challenger', 3: 'Tier 3 · Acesso' };
function teamTier(t: TeamSeason): number {
  // limiares alinhados às faixas do ranking HLTV: T1 = top ~15 (tw>=82),
  // T2 = segundo escalão (tw 77-81), T3 = acesso (abaixo).
  return t.teamwork >= 82 ? 1 : t.teamwork >= 77 ? 2 : 3;
}

// orgs reais SEM line de CS2 (saíram do jogo): o jogador assume a marca e monta
// o elenco do zero, com verba alta. Logos via Liquipedia (proxy Photon).
const PHOTON = (p: string) => `https://i0.wp.com/liquipedia.net${p}?w=240&ssl=1`;
interface EmptyOrg { id: string; name: string; tag: string; colors: [string, string]; logoUrl: string; blurb: string; budget: number }
const EMPTY_ORGS: EmptyOrg[] = [
  { id: 'org_cloud9', name: 'Cloud9', tag: 'C9', colors: ['#0a1a2f', '#00aeef'], logoUrl: PHOTON('/commons/images/b/bb/Cloud9_2023_allmode.png'), blurb: 'Gigante norte-americana fora do CS2. Marca enorme e caixa cheio pra reconstruir do zero.', budget: 4_200_000 },
  { id: 'org_eg', name: 'Evil Geniuses', tag: 'EG', colors: ['#101014', '#5b2be0'], logoUrl: PHOTON('/commons/images/1/14/Evil_Geniuses_2023_lightmode.png'), blurb: 'Org lendária sem elenco ativo. Verba boa pra recolocar o nome no topo.', budget: 3_600_000 },
  { id: 'org_dignitas', name: 'Dignitas', tag: 'DIG', colors: ['#0b0b0b', '#e7b53b'], logoUrl: PHOTON('/commons/images/5/56/Dignitas_2021_allmode.png'), blurb: 'Tradicional, sem line desde 2022. Orçamento mediano: monte com inteligência.', budget: 2_900_000 },
];

const FILL_ROLES = ['Rifler', 'Entry', 'Support', 'AWP', 'IGL'] as const;

// ----- geração de jovens (prospectos): nicks/nomes/países por região -----
// handles genéricos de jogador (estilo cena), pra reposição e academia
const PROSPECT_NICKS = [
  'zen', 'kyro', 'naxz', 'volt', 'riku', 'jaxx', 'pyro', 'nova', 'frost', 'dashy',
  'exo', 'blaze', 'swiftz', 'aze', 'kibo', 'luca', 'vexx', 'm1ko', 'sond', 'ture',
  'kez', 'byte', 'sied', 'raze', 'quad', 'lynx', 'orbz', 'myth', 'zeno', 'kova',
  'tenz', 'flick', 'spark', 'nyx', 'rvn', 'clo', 'dize', 'wisp', 'koa', 'snax',
  'arix', 'bld', 'ghoul', 'jin', 'maru', 'penny', 'qz', 'sero', 'twix', 'yel',
];
const PROSPECT_NAMES: Record<MacroRegion, string[]> = {
  americas: ['Lucas Almeida', 'Gabriel Souza', 'Mateo Pérez', 'Thiago Lima', 'Diego Castro', 'Bryan Mendoza', 'Caio Rocha', 'Nicolás Díaz', 'Pedro Vieira', 'Joaquín Ramírez'],
  europe: ['Lukas Novák', 'Mateusz Kowalski', 'Emil Johansson', 'Théo Laurent', 'Niklas Müller', 'Joonas Virtanen', 'Marco Rossi', 'Pedro Santos', 'Lars Andersen', 'Tomáš Horák'],
  cis: ['Artem Volkov', 'Danil Sokolov', 'Nikita Orlov', 'Timur Aliyev', 'Ruslan Petrov', 'Yegor Smirnov', 'Bohdan Kovalenko', 'Maksim Ivanov', 'Vlad Romanov', 'Alikhan Bekov'],
  asia: ['Wei Chen', 'Haoran Li', 'Jihoon Park', 'Kenta Sato', 'Arif Rahman', 'Minjun Kim', 'Zhang Yong', 'Rizki Putra', 'Hiroshi Tanaka', 'Faisal Noor'],
  oceania: ['Jack Wilson', 'Liam Taylor', 'Ethan Brown', 'Noah Smith', 'Cooper Jones', 'Jayden Lee', 'Mason Clark', 'Riley Evans', 'Lachlan Hall', 'Hayden Ross'],
  africa: ['Thabo Nkosi', 'Youssef Haddad', 'Karim Saidi', 'Sipho Dlamini', 'Omar Farouk', 'Tunde Adeyemi', 'Ayoub Benali', 'Liam van der Merwe', 'Kwame Mensah', 'Hassan Toure'],
};
const REGION_CC: Record<MacroRegion, string[]> = {
  americas: ['br', 'us', 'ar', 'cl', 'mx', 'ca', 'pe', 'uy'],
  europe: ['se', 'dk', 'fr', 'de', 'pl', 'fi', 'pt', 'es', 'nl', 'cz'],
  cis: ['ru', 'ua', 'kz', 'by'],
  asia: ['cn', 'kr', 'jp', 'id', 'sa', 'mn'],
  oceania: ['au', 'nz'],
  africa: ['za', 'ma', 'eg', 'ng'],
};
// identidade determinística de um jovem (nick/nome/país) a partir de um seed
function prospectIdentity(seed: string, region: MacroRegion): { nick: string; name: string; country: string } {
  const h = hashStr(seed);
  const names = PROSPECT_NAMES[region] ?? PROSPECT_NAMES.europe;
  const ccs = REGION_CC[region] ?? REGION_CC.europe;
  // IMPORTANTE: usar shift SEM sinal (>>>). hashStr retorna 0..2^32-1, e `h >> k`
  // (com sinal) vira NEGATIVO p/ h >= 2^31, gerando índice negativo => undefined.
  return {
    nick: PROSPECT_NICKS[(h >>> 4) % PROSPECT_NICKS.length],
    name: names[(h >>> 7) % names.length],
    country: ccs[h % ccs.length],
  };
}

// ----- ACADEMIA: prospectos que você forma e promove quando quiser -----
const ACADEMY_MAX = 6;       // teto de prospectos na academia
const ACADEMY_SCOUT_COST = 250_000; // custo de revelar um prospecto
interface AcademyEntry {
  id: string;
  nick: string;
  name: string;
  country: string;
  role: Role;
  aim: number; consistency: number; clutch: number; awp: number; igl: number;
  age: number;        // idade do prospecto (cresce ~1 a cada 3 splits)
  joinedSplit: number;
  potential: number;  // OVR teto que pode atingir treinando
}
// gera um prospecto jovem (determinístico pelo seed) com potencial de evolução
function makeProspect(seed: string, region: MacroRegion, split: number): AcademyEntry {
  const h = hashStr(seed);
  const ident = prospectIdentity(seed, region);
  const role: Role = FILL_ROLES[(h >>> 2) % FILL_ROLES.length]; // >>> (sem sinal): evita índice negativo
  const base = 58 + (h % 9); // 58-66 (jovem cru)
  const e: AcademyEntry = {
    id: `prospect__${seed.replace(/[^a-z0-9]/gi, '')}`,
    nick: ident.nick, name: ident.name, country: ident.country, role,
    aim: base + (h % 4),
    consistency: base - 1,
    clutch: base - 2,
    awp: role === 'AWP' ? base + 2 : base - 6,
    igl: role === 'IGL' ? base + 2 : base - 5,
    age: 16 + (h % 4), // 16-19
    joinedSplit: split,
    potential: 0,
  };
  const ovr = playerOvr(e);
  // gema rara: a maioria vira bom (+11..+16); poucos viram craques (+26)
  const gem = hashStr(`gem:${seed}`) % 100;
  const room = gem < 10 ? 26 : gem < 45 ? 16 : 11;
  e.potential = Math.min(93, ovr + room);
  return e;
}

// reposição da base: quando você TIRA um jogador de um time (contratação), ele
// não pode ficar nos dois lugares. O time perde o titular e promove um jovem da
// base (OVR baixo, determinístico) pra manter 5 — o time fica realmente mais fraco.
// O jovem tem nick/nome reais (não mais "TAG.jr1") pra parecer um prospecto de fato.
function backfillPlayers(team: TeamSeason, n: number): Player[] {
  const region = macroRegionOf(team.country) ?? 'europe';
  const out: Player[] = [];
  for (let i = 0; i < n; i++) {
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

// o que a escolha de org devolve pra carreira (assumir existente OU do zero)
interface OrgStart {
  org: NonNullable<CareerSave['org']>;
  squad: Signing[];
  coachFromId: string | null;
  budget: number;
  tier: number;
  takeoverId: string | null;
  region?: MacroRegion;
  board?: number;
  scenario?: NonNullable<CareerSave['scenario']>;
}
// verba de quem ASSUME uma org com elenco: tier mais alto (time melhor) = menos
// caixa; tier baixo = mais caixa. É a troca "elenco bom x dinheiro" que o user pediu.
const takeoverBudget = (tier: number) => (tier === 1 ? 600_000 : tier === 2 ? 1_300_000 : 2_300_000);

// ----- CENÁRIOS DE DESAFIO: assuma uma org real (atual / BR / PT / lenda) com
// contexto e metas, no espírito do modo Draft (cada time tem seu "porquê"). -----
type ScenarioCat = 'atual' | 'br' | 'pt';
type ScenarioGoalType = 'winCircuit' | 'winTier2' | 'reachTier1' | 'stayTier1' | 'top4' | 'qualifyMajor' | 'winMajor';
interface ScenarioGoalDef { type: ScenarioGoalType; text: string }
interface CareerScenario {
  id: string;
  cat: ScenarioCat;
  teamId?: string;   // id em CS2_REAL_2026/BASE_TEAMS (lendas usam o id do teams.json)
  teamName?: string; // alternativa estável p/ times atuais (casado pelo nome)
  title: string;
  context: string;   // blurb de contexto (estilo Draft)
  budget?: number;   // override do caixa inicial
  board?: number;    // confiança inicial da diretoria (default 60)
  goals: ScenarioGoalDef[];
}
const SCENARIO_CAT_LABELS: Record<ScenarioCat, string> = {
  atual: '🌍 Cenário atual (2026)', br: '🇧🇷 Brasil', pt: '🇵🇹 Portugal',
};
const SCENARIO_CAT_ORDER: ScenarioCat[] = ['atual', 'br', 'pt'];
const CAREER_SCENARIOS: CareerScenario[] = [
  // ATUAIS
  { id: 'faze_rebuild', cat: 'atual', teamName: 'FaZe', title: 'FaZe: a reconstrução', board: 55,
    context: 'A FaZe despencou pro #22 do mundo no pós-karrigan. Pegue o projeto americano em obras e devolva a org à elite mundial.',
    goals: [{ type: 'reachTier1', text: 'Subir ao Tier 1' }, { type: 'winCircuit', text: 'Vencer um campeonato' }] },
  { id: 'nip_revival', cat: 'atual', teamName: 'Ninjas in Pyjamas', title: 'NiP: o gigante adormecido', board: 55,
    context: 'Um dos nomes mais tradicionais da Suécia vive longe do topo. Reacenda a lenda dos ninjas.',
    goals: [{ type: 'reachTier1', text: 'Subir ao Tier 1' }, { type: 'top4', text: 'Top 4 num circuito' }] },
  // BRASIL
  { id: 'furia_topo', cat: 'br', teamName: 'FURIA', title: 'FURIA: manter o Brasil no topo',
    context: 'A FURIA é a bandeira do CS brasileiro no mundo. A cobrança é alta: top 4 mundial e presença no Major.',
    goals: [{ type: 'top4', text: 'Terminar top 4 num circuito de elite' }, { type: 'qualifyMajor', text: 'Classificar pro Major' }] },
  { id: 'mibr_orgulho', cat: 'br', teamName: 'MIBR', title: 'MIBR: reerguer a marca',
    context: 'A sigla mais histórica do Brasil quer voltar a brigar lá em cima. Construa do circuito até o Major.',
    goals: [{ type: 'winCircuit', text: 'Vencer um campeonato' }, { type: 'reachTier1', text: 'Chegar ao Tier 1' }] },
  { id: 'legacy_geracao', cat: 'br', teamName: 'Legacy', title: 'Legacy: a nova geração',
    context: 'arT lidera a nova safra do Brasil. Transforme a Legacy numa potência mundial de verdade.',
    goals: [{ type: 'reachTier1', text: 'Chegar ao Tier 1' }, { type: 'qualifyMajor', text: 'Classificar pro Major' }] },
  { id: 'pain_tradicao', cat: 'br', teamName: 'paiN', title: 'paiN Gaming: a tradição',
    context: 'A paiN carrega mais de uma década de torcida brasileira. Devolva os títulos pra casa.',
    goals: [{ type: 'winCircuit', text: 'Vencer um campeonato' }, { type: 'reachTier1', text: 'Chegar ao Tier 1' }] },
  // PORTUGAL
  { id: 'saw_portugal', cat: 'pt', teamName: 'SAW', title: 'SAW: o orgulho de Portugal',
    context: 'A SAW é a esperança lusa, mas começa lá embaixo no ranking. Leve Portugal, do zero, até o Major mundial.',
    goals: [{ type: 'reachTier1', text: 'Levar a SAW ao Tier 1' }, { type: 'winCircuit', text: 'Vencer um campeonato' }, { type: 'qualifyMajor', text: 'Classificar pro Major' }] },
  // MAIS ATUAIS
  { id: 'astralis_dynasty', cat: 'atual', teamName: 'Astralis', title: 'Astralis: reviver a dinastia',
    context: 'A Astralis foi a maior dinastia do CS, mas hoje briga no meio do pelotão. Reconstrua o império dinamarquês.',
    goals: [{ type: 'reachTier1', text: 'Voltar ao Tier 1' }, { type: 'qualifyMajor', text: 'Classificar pro Major' }] },
  { id: 'mouz_nextgen', cat: 'atual', teamName: 'MOUZ', title: 'MOUZ: a nova geração',
    context: 'A MOUZ aposta numa base jovem e promissora. Lapide os talentos e brigue pelo topo mundial.',
    goals: [{ type: 'top4', text: 'Top 4 num circuito de elite' }, { type: 'winCircuit', text: 'Vencer um campeonato' }] },
  { id: 'navi_revival', cat: 'atual', teamName: 'Natus Vincere', title: 'NAVI: o renascimento',
    context: 'A NAVI vive de glórias passadas. Coloque a lenda da CIS de volta na elite mundial.',
    goals: [{ type: 'reachTier1', text: 'Chegar ao Tier 1' }, { type: 'winCircuit', text: 'Vencer um campeonato' }] },
  { id: 'big_hope', cat: 'atual', teamName: 'BIG', title: 'BIG: a esperança alemã',
    context: 'A BIG carrega o CS alemão nas costas, mas precisa voltar à elite. Reerga o projeto.',
    goals: [{ type: 'reachTier1', text: 'Subir ao Tier 1' }, { type: 'top4', text: 'Top 4 num circuito' }] },
  { id: 'flyquest_na', cat: 'atual', teamName: 'FlyQuest', title: 'FlyQuest: o sonho norte-americano',
    context: 'A NA quer voltar a brigar lá em cima. Construa o projeto e dispute o Major mundial.',
    goals: [{ type: 'reachTier1', text: 'Chegar ao Tier 1' }, { type: 'qualifyMajor', text: 'Classificar pro Major' }] },
  // MAIS BRASIL (entram se o time existir no dataset)
  { id: 'imperial_br', cat: 'br', teamName: 'Imperial', title: 'Imperial: a última dança',
    context: 'O projeto brasileiro de veteranos quer um último grande Major. Honre a camisa verde-amarela.',
    goals: [{ type: 'winCircuit', text: 'Vencer um campeonato' }, { type: 'qualifyMajor', text: 'Classificar pro Major' }] },
  { id: 'oddik_br', cat: 'br', teamName: 'ODDIK', title: 'ODDIK: do acesso à elite',
    context: 'Saída da base do CS brasileiro, a ODDIK quer provar que o acesso vira elite. Suba os tiers.',
    goals: [{ type: 'reachTier1', text: 'Chegar ao Tier 1' }, { type: 'winCircuit', text: 'Vencer um campeonato' }] },
];
// resolve o TeamSeason de um cenário (times reais do elenco vigente)
function scenarioTeam(sc: CareerScenario, current: TeamSeason[]): TeamSeason | null {
  if (sc.teamId) return current.find((t) => t.id === sc.teamId) ?? null;
  if (sc.teamName) {
    const n = sc.teamName.toLowerCase();
    return current.find((t) => t.team.toLowerCase() === n) ?? null;
  }
  return null;
}
// avalia uma meta de cenário no fim do split, com os resultados já calculados
type ScenarioCtx = { isChampion: boolean; circuitTier: number; finalPos: number; qualified: boolean; endTier: number; wonMajor: boolean };
function evalScenarioGoal(type: ScenarioGoalType, ctx: ScenarioCtx): boolean {
  switch (type) {
    case 'winCircuit': return ctx.isChampion;
    case 'winTier2': return ctx.isChampion && ctx.circuitTier === 2;
    case 'reachTier1': return ctx.endTier === 1;
    case 'stayTier1': return ctx.circuitTier === 1 && ctx.endTier === 1;
    case 'top4': return ctx.finalPos <= 4;
    case 'qualifyMajor': return ctx.qualified;
    case 'winMajor': return ctx.wonMajor;
    default: return false;
  }
}
// marca como cumpridas as metas do desafio atingidas neste split
function applyScenarioProgress(scenario: CareerSave['scenario'], ctx: ScenarioCtx): CareerSave['scenario'] {
  if (!scenario) return scenario ?? null;
  let changed = false;
  const goals = scenario.goals.map((g) => {
    if (g.done) return g;
    if (evalScenarioGoal(g.type, ctx)) { changed = true; return { ...g, done: true }; }
    return g;
  });
  return changed ? { ...scenario, goals } : scenario;
}

// registro de um split encerrado (história da organização)
interface SplitRecord {
  split: number;
  circuit: string;
  position: number;
  wins: number;
  losses: number;
  roundDiff: number;
  prize: number;
  vrs: number;
  champion: boolean; // venceu o circuito
  major?: { placement: PlacementCode; champion: boolean };
}

// Playoff (mata-mata) do circuito: os 4 melhores da fase de pontos corridos
// disputam um bracket que decide o campeão e as vagas no Major.
interface PlayoffMatch { a: string; b: string; result?: SeriesResult; }
interface Playoff {
  circuit: string;
  seeds: string[];   // classificados (ordem de seed) ao entrar nos playoffs
  qf: [PlayoffMatch, PlayoffMatch, PlayoffMatch, PlayoffMatch] | null; // quartas (8 times) ou null (4 times)
  sf: [PlayoffMatch, PlayoffMatch];
  final: PlayoffMatch | null;
  champion: string | null;
  runnerUp: string | null;
}
const PO_SF_BO: 1 | 3 | 5 = 3;
const PO_FINAL_BO: 1 | 3 | 5 = 5;

interface CareerSave {
  org: { name: string; tag: string; colors: [string, string]; logo?: string } | null;
  budget: number;
  vrs: number;
  split: number;
  titles: number;
  squad: Signing[];
  coachFromId: string | null;
  league: League | null;
  circuit: CircuitChoice | null;
  history: SplitRecord[];
  sponsors: string[];
  playoff: Playoff | null;
  majorT: Tournament | null;
  // Major em 3 stages (Swiss 1->2->3 + playoffs): estado da orquestração
  majorStage?: number;        // stage ao vivo: 1/2/3 (Swiss) ou 4 (Champions/playoffs)
  majorUserStage?: number;    // stage de entrada do usuário (pelo tier VRS)
  majorSeed2?: TTeam[];       // 8 seeds que entram no Stage 2
  majorSeed3?: TTeam[];       // 8 seeds que entram no Stage 3
  majorPre?: { stage: number; advancers: { tag: string; name: string }[] }[]; // stages auto-simulados antes do usuário
  evo: Record<string, number>; // delta acumulado de evolução por jogador (id)
  lastEvo: { nick: string; delta: number; phase: PlayerPhase }[]; // última janela
  sponsorUntil: Record<string, number>; // patrocinador id -> split até onde o contrato vale
  moves: Record<string, string>; // transferências aplicadas: playerId -> teamId atual
  lastMoves: { nick: string; from: string; to: string }[]; // transferências do último split
  tier: number; // tier atual da organização (1 = elite). Começa em 3.
  tierChange?: 'up' | 'down' | null; // resultado da última temporada (promoção/rebaixamento)
  takeoverId?: string | null; // id do time real que o jogador assumiu (excluído dos adversários)
  pendingOffer?: PoachOffer | null; // proposta de uma org maior por um jogador seu
  pendingDeals?: PendingDeal[]; // acordos fechados DURANTE a temporada; entram em vigor na janela (próximo split)
  renewals?: Renewal[]; // contratos vencendo: forçam a tela de renovação na abertura da janela
  pendingSales?: { playerId: string; nick: string; fee: number; toTag: string }[]; // propostas aceitas por jogadores SEUS: o jogador sai (e entra a grana) na janela
  rejectedOffers?: string[]; // ids de jogadores cuja proposta você recusou neste split (some até a virada)
  board: number; // confiança da diretoria (0-100). Cai se você falha os objetivos.
  objective?: BoardObjective | null; // meta da diretoria pro split atual
  lastObjective?: { text: string; met: boolean; delta: number } | null; // resultado do split passado
  fired?: boolean; // demitido pela diretoria (confiança no chão)
  contracts?: Record<string, number>; // playerId -> split em que o contrato termina (inclusive)
  lastReleases?: string[]; // nicks que saíram por fim de contrato no split passado
  roles?: Record<string, Role>; // função escolhida pelo técnico (override do dado da base): playerId -> Role
  careerStats?: Record<string, CareerStatLine>; // stats acumuladas na carreira por id (cresce a cada split)
  careerStatsThru?: number; // último split já contabilizado (evita contar 2x no F5)
  trainingFocus?: string | null; // id do jogador em foco de treino no split atual (acelera a evolução)
  morale?: Record<string, number>; // moral/satisfação por jogador (id original) 0-100
  news?: NewsItem[]; // caixa de entrada (manchetes), mais recente primeiro
  unread?: number; // manchetes não lidas (badge da aba Inbox)
  peakOvr?: Record<string, number>; // maior OVR já alcançado por jogador (perfil)
  region?: MacroRegion; // região de circuito onde a org compete (do core do elenco)
  mapTraining?: Partial<Record<MapId, number>>; // domínio por mapa (treinado), ~ -2.5..+2.5
  mapFocus?: MapId[] | null; // mapas em treino neste split (até 3 sobem; os outros decaem)
  playbook?: Playbook; // esquema tático escolhido
  playbookXp?: number; // entrosamento no esquema (0-100); cai ao trocar de esquema
  playbookMem?: Partial<Record<Playbook, number>>; // entrosamento guardado por esquema (restaura ao voltar)
  gamePlan?: GamePlan; // plano de jogo pré-partida (buff real na simulação)
  academy?: AcademyEntry[]; // prospectos em formação na academia
  academyFocus?: string | null; // id do prospecto em foco de treino (cresce mais rápido)
  youth?: Record<string, Player>; // prospectos já promovidos (resolvidos pelo findSigning)
  youthAge?: Record<string, number>; // idade-base (no split 1) de cada prospecto promovido
  scenario?: { id: string; cat: ScenarioCat; title: string; context: string; goals: { type: ScenarioGoalType; text: string; done: boolean }[] } | null; // desafio de carreira em curso
}

// manchete da caixa de entrada (imprensa/diretoria) — dá vida à carreira
type NewsCat = 'result' | 'transfer' | 'board' | 'scene' | 'social' | 'scout';
interface NewsItem { id: string; split: number; icon: string; tone: 'good' | 'bad' | 'info'; title: string; body: string; cat?: NewsCat; handle?: string; }
const NEWS_CATS: { key: NewsCat | 'all'; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'result', label: 'Resultados' },
  { key: 'transfer', label: 'Mercado' },
  { key: 'board', label: 'Diretoria' },
  { key: 'scout', label: 'Olheiros' },
  { key: 'scene', label: 'Cenário' },
  { key: 'social', label: 'Social' },
];

// stats acumuladas de um jogador ao longo de TODA a carreira (somatório bruto;
// rating/ADR/KAST são derivados na hora). É só leitura pro jogador (sobe sozinho
// conforme o jogador evolui e joga); quem edita atributo é o admin no CRM.
interface CareerStatLine { k: number; d: number; a: number; dmg: number; kast: number; rounds: number; maps: number; splits: number; }

const CONTRACT_TERM = 3; // splits de contrato ao assinar/renovar

// funções que o técnico pode atribuir a um jogador (gerenciamento estilo Brasval)
const ROLE_OPTS: Role[] = ['AWP', 'IGL', 'Rifler', 'Entry', 'Support', 'Lurker'];

// proposta de uma org de elite (tier 1) por um jogador do seu elenco
interface PoachOffer { orgId: string; orgName: string; orgTag: string; playerId: string; nick: string; ovr: number; fee: number }

// meta da diretoria por split (FM/Brasval): cumprir sobe a confiança e dá bônus;
// falhar derruba a confiança — no fundo do poço você é demitido.
type ObjectiveType = 'major' | 'win' | 'top4' | 'promote' | 'noRelegation';
interface BoardObjective { type: ObjectiveType; text: string; bonus: number }
function objectiveFor(tier: number, split: number, majorNow: boolean): BoardObjective {
  if (tier === 1) {
    return majorNow
      ? { type: 'major', text: 'Classificar para o Major Mundial', bonus: 700_000 }
      : { type: 'top4', text: 'Terminar no top 4 do circuito de elite', bonus: 300_000 };
  }
  if (tier === 2) {
    // de vez em quando a diretoria cobra acesso direto
    return hashStr(`obj:${split}`) % 3 === 0
      ? { type: 'promote', text: 'Subir para o Tier 1 nesta temporada', bonus: 500_000 }
      : { type: 'top4', text: 'Terminar no top 4 e brigar pelo acesso', bonus: 250_000 };
  }
  return { type: 'noRelegation', text: 'Não ser rebaixado (longe da zona)', bonus: 150_000 };
}

const emptySave = (): CareerSave => ({
  org: null,
  budget: STARTING_BUDGET,
  vrs: 0,
  split: 1,
  titles: 0,
  squad: [],
  coachFromId: null,
  league: null,
  circuit: null,
  history: [],
  sponsors: [],
  playoff: null,
  majorT: null,
  evo: {},
  lastEvo: [],
  sponsorUntil: {},
  moves: {},
  lastMoves: [],
  tier: 3,
  tierChange: null,
  board: 60,
  objective: null,
  lastObjective: null,
  fired: false,
  morale: {},
  news: [],
  unread: 0,
  peakOvr: {},
  mapTraining: {},
  mapFocus: null,
  playbook: 'tactical',
  playbookXp: 40,
  gamePlan: 'disciplined',
  academy: [],
  academyFocus: null,
  youth: {},
  youthAge: {},
  scenario: null,
});

// ----- treino de mapa: domínio por mapa, com TETO (impossível ser bom em tudo) -----
const MAP_TRAIN_MAX = 2.6; // teto de domínio de um mapa
const MAP_TRAIN_MIN = -1.6; // piso (mapa abandonado vira fraqueza leve, não catástrofe)
const MAP_TRAIN_GAIN = 1.3; // ganho no mapa em foco por split
const MAP_TRAIN_DECAY = 0.3; // todo mapa decai por split (o não-treinado escorrega devagar)
const MAP_FOCUS_MAX = 3; // até 3 mapas em treino por split
// nível de domínio de um mapa (0 = neutro se nunca treinado)
const mapLevel = (s: CareerSave, m: MapId) => s.mapTraining?.[m] ?? 0;
// lista de mapas em foco (compat: aceita formato antigo de mapa único)
const mapFocusList = (s: CareerSave): MapId[] =>
  Array.isArray(s.mapFocus) ? s.mapFocus : s.mapFocus ? [s.mapFocus as unknown as MapId] : [];
function applyMapTraining(s: CareerSave): Partial<Record<MapId, number>> {
  const out: Partial<Record<MapId, number>> = {};
  const focus = mapFocusList(s);
  for (const m of MAP_POOL) {
    let v = (s.mapTraining?.[m] ?? 0) - MAP_TRAIN_DECAY; // decai todo split
    if (focus.includes(m)) v += MAP_TRAIN_GAIN + MAP_TRAIN_DECAY; // foco: sobe (anula a decaída + ganha)
    out[m] = Math.max(MAP_TRAIN_MIN, Math.min(MAP_TRAIN_MAX, Math.round(v * 10) / 10));
  }
  return out;
}
// entrosamento do playbook: treinar/manter sobe; trocar de esquema derruba
const PLAYBOOK_FAM_GAIN = 14; // por split mantendo o mesmo esquema
const PLAYBOOK_SWITCH_TO = 25; // entrosamento ao adotar um esquema novo

// ----- moral / satisfação do jogador -----
const MORALE_DEFAULT = 70;
const clampMorale = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
function moraleInfo(v: number): { label: string; cls: 'good' | 'warn' | 'bad'; icon: string } {
  if (v >= 78) return { label: 'Motivado', cls: 'good', icon: '😄' };
  if (v >= 55) return { label: 'Contente', cls: 'good', icon: '🙂' };
  if (v >= 38) return { label: 'Indiferente', cls: 'warn', icon: '😐' };
  if (v >= 22) return { label: 'Insatisfeito', cls: 'bad', icon: '😟' };
  return { label: 'Revoltado', cls: 'bad', icon: '😡' };
}
// forma inicial do split derivada da moral (sutil): 100→+0.07, 40→-0.07
const moraleForm = (m: number) => Math.max(0.93, Math.min(1.07, 1 + (m - MORALE_DEFAULT) / 430));
// nova moral no fim do split: reversão à média + rendimento (forma) + resultado
// coletivo (título/objetivo) + insegurança de contrato vencendo.
function nextMorale(
  prev: Record<string, number>,
  squad: { oid: string; form: number; expiring: boolean }[],
  ctx: { champion: boolean; objMet: boolean },
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of squad) {
    let m = prev[s.oid] ?? MORALE_DEFAULT;
    m += (MORALE_DEFAULT - m) * 0.12;
    m += ((s.form ?? 1) - 1) * 55;
    if (ctx.champion) m += 12; else if (ctx.objMet) m += 4; else m -= 7;
    if (s.expiring) m -= 6;
    out[s.oid] = clampMorale(m);
  }
  return out;
}
// acrescenta manchetes (mais recentes primeiro, teto de 40) e conta as não lidas
function pushNews(save: CareerSave, items: NewsItem[]): Pick<CareerSave, 'news' | 'unread'> {
  if (items.length === 0) return { news: save.news ?? [], unread: save.unread ?? 0 };
  const news = [...items, ...(save.news ?? [])].slice(0, 40);
  return { news, unread: (save.unread ?? 0) + items.length };
}

// manchetes geradas na virada de split (imprensa + diretoria)
function splitNews(ctx: {
  split: number; org: string; champion: boolean; circuit: string;
  objMet: boolean; objText?: string;
  tierChange: 'up' | 'down' | null; tierName?: string;
  releases: string[]; offer: PoachOffer | null;
  risers: string[]; sliders: string[]; unhappy: string[];
  major?: { placement: number | string; champion: boolean } | null;
}): NewsItem[] {
  const s = ctx.split;
  const out: NewsItem[] = [];
  const add = (key: string, icon: string, tone: NewsItem['tone'], cat: NewsCat, title: string, body: string) =>
    out.push({ id: `${s}:${key}`, split: s, icon, tone, cat, title, body });

  if (ctx.major) {
    if (ctx.major.champion) add('major', '🏆', 'good', 'result', `${ctx.org} é CAMPEÃO MUNDIAL!`, `A ${ctx.org} levantou o troféu do Major. O nome entrou para a história do CS.`);
    else add('major', '🌍', 'info', 'result', `${ctx.org} no Major: ${ctx.major.placement}º`, `A campanha mundial terminou em ${ctx.major.placement}º. Aprendizado pra voltar mais forte.`);
  } else if (ctx.champion) {
    add('title', '🏆', 'good', 'result', `${ctx.org} campeã do ${ctx.circuit}`, `Título conquistado! A torcida foi à loucura e a diretoria respira aliviada.`);
  }
  if (ctx.tierChange === 'up') add('tier', '⬆️', 'good', 'result', `${ctx.org} promovida ao ${ctx.tierName}`, `Subir de divisão coloca a org mais perto do Major. Patrocinadores de olho.`);
  else if (ctx.tierChange === 'down') add('tier', '⬇️', 'bad', 'result', `${ctx.org} rebaixada ao ${ctx.tierName}`, `Temporada para esquecer: a queda de divisão pressiona o elenco e o caixa.`);
  if (ctx.objText) add('board', ctx.objMet ? '🏛️' : '⚠️', ctx.objMet ? 'good' : 'bad', 'board',
    ctx.objMet ? 'Diretoria satisfeita' : 'Diretoria cobra resultados',
    `${ctx.objMet ? 'Objetivo cumprido' : 'Objetivo não cumprido'}: "${ctx.objText}". ${ctx.objMet ? 'A confiança subiu.' : 'A confiança caiu — atenção redobrada no próximo split.'}`);
  if (ctx.offer) add('offer', '📞', 'info', 'transfer', `${ctx.offer.orgName} sonda ${ctx.offer.nick}`, `Proposta de ${formatMoney(ctx.offer.fee)} pelo seu ${ctx.offer.nick} (OVR ${ctx.offer.ovr}). Decida na janela de transferências.`);
  if (ctx.releases.length) add('release', '📄', 'bad', 'transfer', `Contrato vencido: ${ctx.releases.join(', ')}`, `${ctx.releases.length === 1 ? 'O jogador saiu' : 'Os jogadores saíram'} de graça por fim de contrato. Reforce o elenco no mercado.`);
  if (ctx.risers.length) add('rise', '📈', 'good', 'board', `Em ascensão: ${ctx.risers.join(', ')}`, `A comissão técnica destaca a evolução de ${ctx.risers.join(', ')} no último split.`);
  if (ctx.sliders.length) add('slide', '📉', 'info', 'board', `Em queda: ${ctx.sliders.join(', ')}`, `${ctx.sliders.join(', ')} ${ctx.sliders.length === 1 ? 'perdeu' : 'perderam'} rendimento. Veteranos cobram mais minutos de treino.`);
  if (ctx.unhappy.length) add('mood', '😟', 'bad', 'board', `Vestiário: ${ctx.unhappy.join(', ')} insatisfeito${ctx.unhappy.length > 1 ? 's' : ''}`, `Moral baixa no elenco. Vitórias, renovação de contrato e títulos levantam o astral.`);
  return out;
}

// posts estilo rede social (cena viva): contas fictícias comentam o split.
// determinístico por split + cena, pra dar o "mundo vivo" sem flood.
function socialNews(teams: TeamSeason[], split: number, org: string, champion: boolean): NewsItem[] {
  const out: NewsItem[] = [];
  const add = (key: string, handle: string, tone: NewsItem['tone'], title: string, body: string) =>
    out.push({ id: `${split}:social:${key}`, split, icon: '💬', tone, cat: 'social', handle, title, body });
  // jogador do split: maior OVR da era (variando levemente por split)
  const pool = teams.flatMap((t) => t.players.map((p) => ({ p, t })));
  if (pool.length) {
    const ranked = pool.slice().sort((a, b) => playerOvr(b.p) - playerOvr(a.p));
    const pick = ranked[hashStr(`star:${split}`) % Math.min(5, ranked.length)];
    add('star', '@cs_headlines', 'info', `${pick.p.nick} dominando o cenário`,
      `${pick.p.nick} (${pick.t.team}) está em outro nível nesse split. Provavelmente o melhor do mundo agora. 🔥`);
  }
  // meme reagindo ao seu time
  add('meme', '@clutchozao', champion ? 'good' : 'info',
    champion ? `${org} CAMPEÃO e a TL surtou` : `e a ${org}...?`,
    champion ? `${org} levantou a taça e o povo foi à loucura. MERECIDO. 🐐🏆` : `mais um split da ${org} sem troféu. calma que ano que vem é nosso 😅🙏`);
  // time em alta no cenário
  if (teams.length) {
    const hot = teams[hashStr(`hot:${split}`) % teams.length];
    add('hot', '@vrs_radar', 'info', `Fica de olho na ${hot.team}`,
      `A ${hot.team} vem subindo no ranking e promete brigar lá em cima. Time pra acompanhar. 📈`);
  }
  return out;
}

// manchetes do que rolou nas OUTRAS regiões (cena viva enquanto você joga a sua)
function worldNews(teams: TeamSeason[], split: number, userRegion: CareerRegion): NewsItem[] {
  return worldScene(teams, split)
    .filter((s) => s.reg !== userRegion)
    .slice(0, 2)
    .map((s) => ({
      id: `${split}:world:${s.reg}`, split, icon: '🌐', tone: 'info' as const, cat: 'scene' as const,
      title: `${s.champ.team} campeão na ${CAREER_REGION_LABELS[s.reg]}`,
      body: `${s.champ.team} venceu o ${s.league}${s.runnerUp ? ` sobre ${s.runnerUp.team}` : ''}. A cena segue fervendo enquanto você disputa a sua região.`,
    }));
}

// ----- evolução de elenco entre temporadas -----
// cada jogador tem uma fase de carreira (estável, derivada do id): em ascensão
// melhora, no auge oscila, em declínio cai. Valor e salário acompanham os
// atributos, então segurar um veterano caro vira decisão estratégica.
export type PlayerPhase = 'rising' | 'prime' | 'declining';
export const PHASE_LABEL: Record<PlayerPhase, string> = {
  rising: 'jovem em ascensão', prime: 'no auge', declining: 'veterano em declínio',
};

// ----- idade e potencial (jogadores vivos, estilo Brasval) -----
// idades REAIS do bo3 (196/240) por nick; quem falta recebe uma idade plausível
// determinística. A idade efetiva sobe ~1 ano a cada 3 splits de carreira.
const REAL_AGES = bo3Ages as Record<string, { age: number; born: string }>;
function baseAge(p: Pick<Player, 'id' | 'nick'>, youthAge?: Record<string, number>): number {
  // prospecto promovido da academia: idade-base guardada na promoção. Vem ANTES do
  // lookup por nick (um prospecto pode ter um nick que colide com um pro real).
  const y = youthAge?.[p.id];
  if (y != null) return y;
  const real = REAL_AGES[p.nick]?.age;
  if (real && real >= 15 && real <= 45) return real;
  // sem dado: assume AUGE (25-29), não juventude. Um pro de elenco real não pode
  // virar "jovem em ascensão" só por falta de idade na tabela (bug do coldzera/fer).
  // Jovens de verdade vêm da academia, que grava a idade na promoção (youthAge).
  return 25 + (hashStr(`age:${p.id}`) % 5);
}
function effectiveAge(p: Pick<Player, 'id' | 'nick'>, split: number, youthAge?: Record<string, number>): number {
  return baseAge(p, youthAge) + Math.floor((split - 1) / 3);
}
// potencial = teto de OVR. Jovem bom tem espaço pra crescer (S/A); veterano já
// está no teto (sem crescimento). Determinístico por jogador.
function playerPotentialOvr(p: Player, age: number): number {
  const base = playerOvr(p);
  const room = age <= 18 ? 9 : age <= 20 ? 7 : age <= 22 ? 4 : age <= 24 ? 2 : age <= 26 ? 1 : 0;
  const talent = room > 0 ? hashStr(`pot:${p.id}`) % 4 : 0; // 0-3 de variação de talento
  return Math.min(99, base + room + talent);
}
export type PotTier = 'S' | 'A' | 'B' | 'C';
function potentialTier(potOvr: number): PotTier {
  return potOvr >= 90 ? 'S' : potOvr >= 86 ? 'A' : potOvr >= 82 ? 'B' : 'C';
}

// fase de carreira pela IDADE: jovem sobe, auge oscila, veterano cai.
export function playerPhase(_pid: string, age: number): PlayerPhase {
  if (age <= 21) return 'rising';
  if (age <= 27) return 'prime';
  return 'declining';
}
// delta da janela: por idade. Rising sobe rumo ao potencial e estabiliza ao
// atingir o teto; declínio cai mais forte com a idade. Determinístico por split.
function evoDelta(pid: string, split: number, age: number, atCeiling: boolean): number {
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

// envelhecimento da IA: aplica a MESMA evolução por idade do seu elenco (evoDelta),
// acumulada até o split atual. Jovem da IA sobe rumo ao potencial, veterano cai e o
// auge oscila — o cenário fica VIVO entre temporadas (o field não congela) e o
// usuário não passa a IA estática só treinando o próprio time.
function aiAttrDrift(p: Player, split: number): number {
  if (split <= 1) return 0;
  const base = playerOvr(p);
  const a0 = baseAge(p);
  const pot = playerPotentialOvr(p, a0);
  let cur = base;
  for (let s = 1; s < split; s++) {
    const age = a0 + Math.floor((s - 1) / 3);
    cur = Math.max(40, Math.min(99, cur + evoDelta(p.id, s, age, cur >= pot)));
  }
  return Math.round(Math.max(-10, Math.min(10, cur - base)));
}
function applyAiAging(teams: TeamSeason[], split: number, skip: Set<string>): TeamSeason[] {
  if (split <= 1) return teams;
  const clamp = (v: number) => Math.max(40, Math.min(99, v));
  return teams.map((t) => ({
    ...t,
    players: t.players.map((p) => {
      if (skip.has(p.id)) return p; // SEUS jogadores evoluem pelo save.evo (não duplica)
      const d = aiAttrDrift(p, split);
      if (!d) return p;
      return { ...p, aim: clamp(p.aim + d), consistency: clamp(p.consistency + d), clutch: clamp(p.clutch + d), awp: clamp(p.awp + d), igl: clamp(p.igl + d) };
    }),
  }));
}

// ----- helpers do playoff (mata-mata do circuito) -----
function buildPlayoff(table: TTeam[], circuit: string): Playoff {
  const ids = table.map((t) => t.id);
  if (ids.length >= 8) {
    const s = ids.slice(0, 8);
    return {
      circuit, seeds: s,
      // quartas cross-seed (1x8, 4x5, 2x7, 3x6): campeões de grupo só se cruzam tarde
      qf: [
        { a: s[0], b: s[7] }, { a: s[3], b: s[4] },
        { a: s[1], b: s[6] }, { a: s[2], b: s[5] },
      ],
      sf: [{ a: '', b: '' }, { a: '', b: '' }], // preenchidas após as quartas
      final: null, champion: null, runnerUp: null,
    };
  }
  const s = ids.slice(0, 4);
  return { circuit, seeds: s, qf: null, sf: [{ a: s[0], b: s[3] }, { a: s[1], b: s[2] }], final: null, champion: null, runnerUp: null };
}
const poWinner = (m: PlayoffMatch | null | undefined): string | null =>
  m?.result ? (m.result.winner === 0 ? m.a : m.b) : null;
function poAdvance(p: Playoff): void {
  // quartas completas -> monta as semis
  if (p.qf && p.qf.every((m) => m.result) && !p.sf[0].a) {
    p.sf = [
      { a: poWinner(p.qf[0])!, b: poWinner(p.qf[1])! },
      { a: poWinner(p.qf[2])!, b: poWinner(p.qf[3])! },
    ];
  }
  if (!p.final && p.sf[0].a && p.sf[1].a && p.sf[0].result && p.sf[1].result) {
    p.final = { a: poWinner(p.sf[0])!, b: poWinner(p.sf[1])! };
  }
  if (p.final?.result && !p.champion) {
    p.champion = poWinner(p.final)!;
    p.runnerUp = p.final.a === p.champion ? p.final.b : p.final.a;
  }
}
const poMatches = (p: Playoff): PlayoffMatch[] =>
  [...(p.qf ?? []), p.sf[0], p.sf[1], p.final].filter((m): m is PlayoffMatch => !!m && !!m.a && !!m.b);
function poUserMatch(p: Playoff): PlayoffMatch | null {
  return poMatches(p).find((m) => !m.result && (m.a === 'user' || m.b === 'user')) ?? null;
}
// resolve em cascata todas as partidas que NÃO envolvem o usuário
function poRunAI(p: Playoff, team: (id: string) => TTeam, rng: Rng): void {
  for (let guard = 0; guard < 16; guard++) {
    poAdvance(p);
    const m = poMatches(p).find((x) => !x.result && x.a !== 'user' && x.b !== 'user');
    if (!m) break;
    const a = team(m.a);
    const b = team(m.b);
    const bo = p.final === m ? PO_FINAL_BO : PO_SF_BO;
    m.result = simulateSeries(rng, a, b, autoVeto([a, b], rng, bo), bo);
  }
  poAdvance(p);
}
// colocação do usuário no playoff (1 campeão, 2 vice, 3 semi, 5 quartas, 99 fora)
function poUserRank(p: Playoff | null): number {
  if (!p) return 99;
  if (p.champion === 'user') return 1;
  if (p.runnerUp === 'user') return 2;
  const lostIn = (m?: PlayoffMatch | null) => !!m?.result && (m.a === 'user' || m.b === 'user') && poWinner(m) !== 'user';
  if (p.sf.some(lostIn)) return 3;
  if (p.qf?.some(lostIn)) return 5;
  if (p.seeds.includes('user')) return p.qf ? 5 : 3; // ainda em jogo: assume entrada
  return 99;
}

// ---------- cenário competitivo: VRS por região e Top 20 HLTV ----------
// VRS determinístico de um time da IA. Curva PROGRESSIVA: o miolo do field
// (entrosamento ~78-82, onde se amontoam quase todos os times) fica ~480-540,
// mas a elite (~85+) dispara via termo quadrático, abrindo distância do bolo.
// Esse buraco entre miolo e topo é DE PROPÓSITO: é maior do que um campeão de
// Tier 2 consegue somar, então vencer o acesso te leva ao top-10, nunca a #1.
// núcleo determinístico do VRS pela qualidade do elenco (entrosamento). É a base
// tanto do VRS da IA quanto da "força dos adversários" (Opponent Network) de um evento.
function vrsCore(tw: number): number {
  const elite = Math.max(0, tw - 82);
  return Math.max(0, tw - 61) * 25 + elite * elite * 10;
}
function aiTeamVrs(t: TeamSeason): number {
  return Math.round(vrsCore(t.teamwork) + (hashStr(t.id) % 55));
}
// "Opponent Network" do VRS real (Valve): o peso de um evento vem da FORÇA MÉDIA
// dos adversários. Campo fraco (Tier 3) ~0.2; elite (Tier 1/Major) ~1.2. É isso
// que faz ganhar um campeonato fraco render quase nada no ranking mundial.
function opponentMult(fieldAvgCore: number): number {
  return Math.max(0.08, Math.min(1.25, (fieldAvgCore - 250) / 450));
}
// embaralhamento determinístico (Fisher-Yates com semente) — mesmo seed, mesma
// ordem. Usado pra variar o field dos torneios por split sem perder estabilidade.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = hashStr(`${seed}:${i}`) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// VRS-BASE do usuário: um PISO modesto pela qualidade do elenco (um time forte
// não começa em último), mas pequeno o bastante pra que o RANKING seja movido
// pelos RESULTADOS (save.vrs, que decai). O ranking = base + pontos ganhos.
// Com isso: time bom recém-montado entra no meio-baixo da tabela; temporada
// ruim faz o save.vrs decair e o time DESPENCA pro piso; só chega a #1 quem
// vence de verdade (Tier 1 + Major), não quem ganhou um campeonato de acesso.
function userBaseVrsFor(teamwork: number): number {
  return Math.round(Math.max(0, teamwork - 60) * 14);
}
// Região de circuito no modo carreira (Américas N/S/Central = uma só). Tipos e
// helpers ficam em data/regions.ts (compartilhados com as bandeiras).
type CareerRegion = MacroRegion;
const CAREER_REGION_LABELS = MACRO_REGION_LABELS;
const CAREER_REGION_ORDER = MACRO_REGION_ORDER;
// região do time = onde está a MAIORIA dos jogadores (não o país do header da
// base, que vinha errado — ex.: Falcons marcado como 'sa'/Ásia sendo um time EU).
function teamRegion(t: TeamSeason): CareerRegion {
  const countries = t.players.map((p) => p.country);
  if (countries.some((c) => macroRegionOf(c))) return macroRegionPlurality(countries);
  const d = macroRegionOf(t.country); // fallback: país do header, senão Europa
  return d ?? 'europe';
}
// nome da liga regional de cada macro-região (mesma da escolha de circuito)
const REGION_LEAGUE: Record<CareerRegion, string> = {
  americas: 'Gamers Club Masters', europe: 'ESL Challenger League EU', cis: 'CCT Europe Series',
  asia: 'ESL Challenger League Asia', oceania: 'ESL Challenger League Oceania', africa: 'CCT Africa',
};
// "cena mundial": o que rola nas OUTRAS regiões enquanto você joga a sua. Campeão
// determinístico por split (estável no F5) sorteado entre os 4 melhores da região.
interface RegionScene { reg: CareerRegion; league: string; champ: TeamSeason; runnerUp: TeamSeason | null; top: TeamSeason[]; }
function worldScene(teams: TeamSeason[], split: number): RegionScene[] {
  const byRegion = new Map<CareerRegion, TeamSeason[]>();
  for (const t of teams) {
    const r = teamRegion(t);
    const arr = byRegion.get(r) ?? [];
    arr.push(t);
    byRegion.set(r, arr);
  }
  const out: RegionScene[] = [];
  for (const reg of CAREER_REGION_ORDER) {
    const pool = (byRegion.get(reg) ?? []).slice().sort((a, b) => b.teamwork - a.teamwork);
    if (pool.length < 2) continue;
    // campeão sorteado entre os 4 melhores, com seed por ID (estável por split
    // mesmo que a ordem/contenders mudem após transferências)
    const contenders = pool.slice(0, 4);
    const champ = contenders.slice().sort((a, b) => (hashStr(`world:${split}:${reg}:${b.id}`) % 1000) - (hashStr(`world:${split}:${reg}:${a.id}`) % 1000))[0];
    const runnerUp = contenders.find((t) => t.id !== champ.id) ?? null;
    out.push({ reg, league: REGION_LEAGUE[reg], champ, runnerUp, top: pool.slice(0, 6) });
  }
  return out;
}

// rating "do ano" de um jogador (estilo HLTV), determinístico por temporada
function playerSeasonRating(p: Player, split: number): number {
  const ovr = playerOvr(p);
  const form = ((hashStr(`${p.id}:r${split}`) % 160) - 60) / 1000; // -0.06..+0.10
  // escala estilo HLTV: ~0.95 (mediano) até ~1.40 (melhor do mundo)
  return Math.max(0.85, 0.95 + (ovr - 70) / 55 + form);
}
// uma "temporada" (ano competitivo) = MAJOR_EVERY campeonatos/splits, fechando no
// split de Major. A premiação do Top 20 HLTV é um prêmio de FIM DE ANO: não sai
// depois de um único campeonato, e sim no encerramento da temporada.
const seasonOf = (split: number) => Math.ceil(split / MAJOR_EVERY); // temporada a que o split pertence (1, 2, ...)
// splits que compõem a temporada que termina no split de Major informado
function seasonSplitRange(endSplit: number): number[] {
  const out: number[] = [];
  for (let s = Math.max(1, endSplit - (MAJOR_EVERY - 1)); s <= endSplit; s++) out.push(s);
  return out;
}
// rating "do ano" agregado: média do rating do jogador em cada split da temporada
function playerYearRating(p: Player, endSplit: number): number {
  const splits = seasonSplitRange(endSplit);
  return splits.reduce((acc, s) => acc + playerSeasonRating(p, s), 0) / splits.length;
}
// ---------- estatísticas estilo HLTV (determinísticas) + currículo do Top 20 ----------
// Tudo derivado dos atributos + função + semente da temporada. Só leitura.
interface HltvStat { rating: number; kast: number; adr: number; entry: number; awpKills: number; impact: number; }
function hltvStatline(p: Player, role: Role, split: number): HltvStat {
  const rating = playerSeasonRating(p, split);
  const u = (k: string) => (hashStr(`${p.id}:${k}:s${split}`) % 1000) / 1000; // 0..1 determinístico
  const aim = p.aim ?? 70, awp = p.awp ?? 40, cons = p.consistency ?? 70, clutch = p.clutch ?? 70;
  // entries ganhas por mapa: entry/rifler com bom aim sobem; awp/igl bem menos
  const roleEntry = role === 'Entry' ? 1 : role === 'Rifler' ? 0.66 : role === 'IGL' ? 0.32 : 0.28;
  const entry = Math.round((3 + roleEntry * (aim - 55) / 7 + u('e') * 1.4) * 10) / 10;
  // abates de AWP por mapa: só o AWPer de verdade pontua alto
  const awpKills = Math.round((role === 'AWP' ? (8 + (awp - 60) / 3.5 + u('a') * 3) : (1 + u('a') * 1.5)) * 10) / 10;
  // impacto/swing: clutch + consistência + rating (multikills e rounds decisivos)
  const impact = Math.round((0.9 + (clutch - 70) / 85 + (rating - 1.05) * 0.7 + u('i') * 0.12) * 100) / 100;
  const kast = Math.round(66 + (cons - 70) / 2.8 + u('k') * 6);
  const adr = Math.round(68 + (aim - 70) / 1.5 + (rating - 1.05) * 32 + u('d') * 8);
  return { rating, kast, adr, entry, awpKills, impact };
}
// proxy de TÍTULOS / runs fundas: times fortes ganham mais troféus (entra no currículo).
function teamTitlePower(team: TeamSeason): number {
  return Math.max(0, Math.min(1, (team.teamwork - 70) / 20));
}
// pontos do "currículo" num split: o rating é a base, mas IMPACTO, FUNÇÃO (entry/AWP)
// e TÍTULOS (sucesso do time) pesam — Top 20 não é só rating cru.
function hltvPointsAt(p: Player, team: TeamSeason, role: Role, split: number): number {
  const sl = hltvStatline(p, role, split);
  // AWPer pontua pelos abates de AWP; os demais pela presença de entry — balanceado
  // pra função não dominar (o Top 20 tem rifler, entry, lurker, IGL e AWP).
  const frag = role === 'AWP' ? sl.awpKills * 0.75 : sl.entry * 1.5;
  // forma do split (sobe e desce): mexe no ranking de UM split, mas se dilui na
  // média do ano — o currículo anual fica estável.
  const swing = (hashStr(`${p.id}:f:s${split}`) % 240) - 110;
  return sl.rating * 1000 + sl.impact * 60 + frag * 6 + sl.kast * 1.1 + teamTitlePower(team) * 130 + swing;
}
// MVP de um torneio: melhor participante pelos pontos do split (rating+impacto+função).
interface MvpResult { p: Player; team: TeamSeason; statline: HltvStat; points: number; }
function tournamentMvp(participants: TeamSeason[], split: number, exclude?: Set<string>): MvpResult | null {
  let best: MvpResult | null = null;
  for (const t of participants) for (const p of t.players) {
    if (exclude?.has(p.id)) continue;
    const points = hltvPointsAt(p, t, p.role as Role, split);
    if (!best || points > best.points) best = { p, team: t, statline: hltvStatline(p, p.role as Role, split), points };
  }
  return best;
}
// MVPs do ano: cada split (evento) premia o melhor que AINDA não foi MVP na
// temporada — eventos diferentes têm donos diferentes, então o prêmio se espalha
// pelos craques do ano em vez de um só levar tudo.
function seasonMvpCounts(pool: TeamSeason[], endSplit: number): Map<string, number> {
  const counts = new Map<string, number>();
  const won = new Set<string>();
  for (const s of seasonSplitRange(endSplit)) {
    const mvp = tournamentMvp(pool, s, won);
    if (mvp) { won.add(mvp.p.id); counts.set(mvp.p.id, 1); }
  }
  return counts;
}
interface Top20Entry { p: Player; team: TeamSeason; role: Role; rating: number; mvps: number; sl: HltvStat; points: number; }
// melhores N jogadores da TEMPORADA inteira: currículo composto (média dos pontos
// por split do ano + bônus por MVP), não só a média de rating.
function seasonTopPlayersYear(pool: TeamSeason[], endSplit: number, n: number): Top20Entry[] {
  const splits = seasonSplitRange(endSplit);
  const mvps = seasonMvpCounts(pool, endSplit);
  return pool
    .flatMap((t) => t.players.map((p) => {
      const m = mvps.get(p.id) ?? 0;
      const yearAvg = splits.reduce((a, s) => a + hltvPointsAt(p, t, p.role as Role, s), 0) / splits.length;
      return { p, team: t, role: p.role as Role, rating: playerYearRating(p, endSplit), mvps: m, sl: hltvStatline(p, p.role as Role, endSplit), points: yearAvg + m * 85 };
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, n);
}

// janela de transferências: feed determinístico de movimentações por split
interface TransferItem { nick: string; cc: string; from: string; to: string; fee: number; }
// Feed determinístico de transferências REALISTAS: um jogador só troca por um
// time de tier parecido (teamwork +-8), evitando movimentos absurdos como um
// jogador de time fraco indo direto pra um top mundial.
// ranking mundial real do time (vem no honors dos times importados do bo3)
const worldRank = (t: TeamSeason): number => {
  const m = /#(\d+)/.exec(t.honors ?? '');
  return m ? Number(m[1]) : 999;
};

// Transferências da janela: cada movimento é um SWAP (o jogador vai pro novo
// time e o reserva mais fraco do destino volta), pra os times manterem 5. É
// determinístico por split, então o mercado mostrado é o que de fato se aplica.
function computeTransfers(split: number, teams: TeamSeason[]): { feed: TransferItem[]; swaps: { pid: string; toId: string }[] } {
  const pool = teams.filter((t) => t.id !== 'user' && t.players.length >= 5);
  const feed: TransferItem[] = [];
  const swaps: { pid: string; toId: string }[] = [];
  const seen = new Set<string>(); // playerIds já envolvidos nesta janela
  for (let i = 0; feed.length < 9 && i < 400; i++) {
    const h = hashStr(`tf${split}:${i}`);
    const src = pool[h % pool.length];
    const pl = src.players[(h >>> 3) % src.players.length];
    if (!pl || seen.has(pl.id)) continue;
    const ovr = playerOvr(pl);
    if (ovr >= 88 && h % 8 !== 0) continue; // estrelas quase não se movem
    const sr = worldRank(src);
    const cands = pool.filter((t) => {
      if (t.id === src.id) return false;
      const dr = worldRank(t);
      if (ovr >= 88) return dr <= 8; // estrela só vai pra elite (sem ZywOo na FOKUS)
      const maxFall = ovr >= 82 ? 6 : 15;
      return dr <= sr + maxFall && dr >= sr - 12 && t.teamwork >= ovr - 12;
    });
    if (cands.length === 0) continue;
    const dest = cands[(h >>> 7) % cands.length];
    // contrapartida: o reserva mais fraco do destino (ainda não movido) vai pro src
    const back = [...dest.players].filter((p) => !seen.has(p.id)).sort((a, b) => playerOvr(a) - playerOvr(b))[0];
    if (!back || back.id === pl.id) continue;
    seen.add(pl.id);
    seen.add(back.id);
    swaps.push({ pid: pl.id, toId: dest.id }, { pid: back.id, toId: src.id });
    feed.push({ nick: pl.nick, cc: pl.country, from: src.tag, to: dest.tag, fee: playerValue(pl) });
  }
  return { feed, swaps };
}
function transferFeed(split: number, teams: TeamSeason[]): TransferItem[] {
  return computeTransfers(split, teams).feed;
}

// reconstrói os elencos aplicando as transferências acumuladas (playerId -> teamId).
// Como cada transferência é um swap balanceado, todo time se mantém com 5.
function applyMoves(teams: TeamSeason[], moves: Record<string, string> | undefined): TeamSeason[] {
  if (!moves || Object.keys(moves).length === 0) return teams;
  const all: { p: Player; orig: string }[] = [];
  for (const t of teams) for (const p of t.players) all.push({ p, orig: t.id });
  const valid = new Set(teams.map((t) => t.id));
  const teamOf = (pid: string, orig: string) => {
    const m = moves[pid];
    return m && valid.has(m) ? m : orig;
  };
  return teams.map((t) => ({ ...t, players: all.filter((ap) => teamOf(ap.p.id, ap.orig) === t.id).map((ap) => ap.p) }));
}

// MIGRAÇÃO: prospectos/jovens gerados antes do fix do shift (>>) podiam ser
// salvos SEM nick/name/role (só o country sobrevivia). Regenera de forma
// determinística pelo id, mantendo o que já existe.
function healProspect(a: AcademyEntry): AcademyEntry {
  if (a.nick && a.name && a.role) return a;
  const region = macroRegionOf(a.country ?? '') ?? 'europe';
  const ident = prospectIdentity(a.id, region);
  const role = a.role ?? FILL_ROLES[(hashStr(a.id) >>> 2) % FILL_ROLES.length];
  return { ...a, nick: a.nick || ident.nick, name: a.name || ident.name, role };
}
function healYouthPlayer(p: Player): Player {
  if (p.nick && p.name && p.role) return p;
  const region = macroRegionOf(p.country ?? '') ?? 'europe';
  const ident = prospectIdentity(p.id, region);
  const role = p.role ?? FILL_ROLES[(hashStr(p.id) >>> 2) % FILL_ROLES.length];
  return { ...p, nick: p.nick || ident.nick, name: p.name || ident.name, role };
}

// saves antigos gravaram o nome do time com a era colada ("Vitality 2026") na
// liga/playoff/major persistidos. Remove o sufixo de ano dos campos de nome.
const ERA_SUFFIX = / 20\d\d$/;
function stripEraDeep(node: unknown, depth = 0): void {
  if (depth > 8 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const v of node) stripEraDeep(v, depth + 1);
    return;
  }
  const o = node as Record<string, unknown>;
  for (const k in o) {
    const v = o[k];
    if ((k === 'name' || k === 'fromTeam') && typeof v === 'string') o[k] = v.replace(ERA_SUFFIX, '');
    else stripEraDeep(v, depth + 1);
  }
}

function loadSave(): CareerSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return emptySave();
    const s = JSON.parse(raw) as CareerSave;
    const merged = { ...emptySave(), ...s };
    stripEraDeep(merged.league);
    stripEraDeep(merged.playoff);
    stripEraDeep(merged.majorT);
    stripEraDeep(merged.majorSeed2);
    merged.academy = (merged.academy ?? []).map(healProspect);
    if (merged.youth) {
      const y: Record<string, Player> = {};
      for (const [k, v] of Object.entries(merged.youth)) y[k] = healYouthPlayer(v);
      merged.youth = y;
    }
    return merged;
  } catch {
    return emptySave();
  }
}

function persist(s: CareerSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* sem storage */
  }
}

// preço do técnico: curva acelerada (não linear). Iniciante é barato, mas técnico
// de elite custa MILHÕES — contratar um top tem que doer no caixa.
// rating 66 ~80k · 72 ~380k · 80 ~1.4M · 85 ~2.6M · 88 ~3.5M
const coachFee = (c: Coach): number => Math.round(60_000 + Math.pow(Math.max(0, c.rating - 62), 2.5) * 1000);

// opção de entrada: técnico iniciante barato para clubes recém-fundados
const ROOKIE_COACH: Coach = { nick: 'rook1e', name: 'Técnico Iniciante', country: 'br', rating: 66, style: 'tactical' };
const ROOKIE_ID = '__rookie__';

type Stage = 'found' | 'market' | 'circuit' | 'hub' | 'veto' | 'match' | 'playoffHub' | 'seasonEnd' | 'majorHub' | 'major';
type HubTab = 'overview' | 'major' | 'market' | 'finance' | 'results' | 'standings' | 'bracket' | 'squad' | 'academy' | 'vrs' | 'top20' | 'history' | 'inbox' | 'world' | 'calendar';

// time sintético "Academia" usado como origem de um prospecto promovido ao elenco
const ACADEMY_FROM: TeamSeason = {
  id: '__youth__', team: 'Academia', tag: 'ACA', era: 'Base', game: 'CS2',
  country: 'br', teamwork: 70, honors: '', colors: ['#2a2f45', '#5ba0d0'],
  mapPrefs: {}, coach: ROOKIE_COACH, players: [],
};

// ----- FREE AGENTS: profissionais reais e conhecidos atualmente sem time, à
// disposição no mercado por um preço camarada (não estão em nenhum elenco) -----
const FREE_AGENT_PLAYERS: Player[] = [
  { id: 'fa__coldzera', nick: 'coldzera', name: 'Marcelo David', country: 'br', role: 'Rifler', aim: 85, consistency: 82, clutch: 81, awp: 60, igl: 58 },
  { id: 'fa__chelo', nick: 'chelo', name: 'Marcelo Cespedes', country: 'br', role: 'Rifler', aim: 82, consistency: 79, clutch: 77, awp: 60, igl: 56 },
  { id: 'fa__felps', nick: 'felps', name: 'João Vasconcellos', country: 'br', role: 'Entry', aim: 80, consistency: 77, clutch: 76, awp: 58, igl: 55 },
  { id: 'fa__exit', nick: 'exit', name: 'Lucas Nogueira', country: 'br', role: 'Entry', aim: 78, consistency: 74, clutch: 72, awp: 55, igl: 52 },
  { id: 'fa__taco', nick: 'TACO', name: 'Epitácio de Melo', country: 'br', role: 'Support', aim: 72, consistency: 77, clutch: 71, awp: 50, igl: 71 },
  { id: 'fa__junior', nick: 'JOTA', name: 'João Pedro', country: 'br', role: 'AWP', aim: 77, consistency: 75, clutch: 73, awp: 81, igl: 47 },
  { id: 'fa__shox', nick: 'shox', name: 'Richard Papillon', country: 'fr', role: 'Rifler', aim: 81, consistency: 76, clutch: 80, awp: 70, igl: 62 },
  { id: 'fa__amanek', nick: 'AmaNEk', name: 'Ali Saouli', country: 'fr', role: 'Rifler', aim: 77, consistency: 77, clutch: 74, awp: 60, igl: 74 },
  { id: 'fa__kioshima', nick: 'kioShiMa', name: 'Fabien Fiey', country: 'fr', role: 'Support', aim: 75, consistency: 76, clutch: 74, awp: 58, igl: 58 },
  { id: 'fa__bodyy', nick: 'bodyy', name: 'Alexandre Pianaro', country: 'fr', role: 'Support', aim: 74, consistency: 75, clutch: 70, awp: 55, igl: 60 },
  { id: 'fa__smooya', nick: 'smooya', name: 'Owen Butterfield', country: 'gb', role: 'AWP', aim: 80, consistency: 74, clutch: 77, awp: 85, igl: 45 },
  { id: 'fa__nawwk', nick: 'nawwk', name: 'Tim Jonasson', country: 'se', role: 'AWP', aim: 78, consistency: 77, clutch: 75, awp: 82, igl: 48 },
  { id: 'fa__maden', nick: 'Maden', name: 'Mathias Madsen', country: 'se', role: 'Rifler', aim: 79, consistency: 76, clutch: 74, awp: 58, igl: 52 },
  { id: 'fa__hobbit', nick: 'HObbit', name: 'Abay Khassenov', country: 'kz', role: 'Rifler', aim: 80, consistency: 79, clutch: 78, awp: 60, igl: 62 },
  { id: 'fa__osee', nick: 'oSee', name: 'Josh Ohm', country: 'us', role: 'AWP', aim: 79, consistency: 78, clutch: 76, awp: 83, igl: 46 },
  { id: 'fa__grim', nick: 'Grim', name: 'Michael Wince', country: 'us', role: 'Rifler', aim: 80, consistency: 77, clutch: 75, awp: 58, igl: 55 },
  { id: 'fa__daps', nick: 'daps', name: 'Damian Steele', country: 'ca', role: 'IGL', aim: 68, consistency: 74, clutch: 66, awp: 48, igl: 80 },
  { id: 'fa__mou', nick: 'mou', name: 'Dexter Mou', country: 'au', role: 'AWP', aim: 76, consistency: 74, clutch: 72, awp: 80, igl: 46 },
];
// pseudo-time "sem time" usado como origem de um free agent contratado
const FREE_AGENTS_FROM: TeamSeason = {
  id: '__free__', team: 'Free Agent', tag: 'FA', era: 'sem time', game: 'CS2',
  country: 'xx', teamwork: 50, honors: '', colors: ['#3a3a3a', '#8a8a8a'],
  mapPrefs: {}, coach: ROOKIE_COACH, players: [],
};

interface MajorResult {
  tournament: Tournament;
  placement: PlacementCode;
  prize: number;
  vrs: number;
  champion: boolean;
}

interface Props {
  dataset: TeamSeason[];
  onExit: () => void;
}

export function CareerScreen({ onExit }: Props) {
  const [save, setSave] = useState<CareerSave>(() => loadSave());
  const [orgChoice, setOrgChoice] = useState<'select' | 'fictional' | 'scenario'>('scenario'); // a fundação abre nos DESAFIOS (entrada principal da carreira)
  const [stage, setStage] = useState<Stage>(() => {
    const s = loadSave();
    if (!s.org) return 'found';
    // sem elenco fechado = janela de mercado/transferências
    if (s.squad.length < 5 || !s.coachFromId) return 'market';
    // elenco pronto mas sem liga = escolha do campeonato (qual convite aceitar)
    if (!s.league) return 'circuit';
    if (s.majorT && s.majorT.phase !== 'done') return 'hub'; // Major ao vivo, dentro do hub
    if (leagueDone(s.league)) {
      // fase de pontos corridos encerrada: vai pro mata-mata; só depois do
      // campeão decidido cai no resumo da temporada
      if (s.playoff) return s.playoff.champion ? 'seasonEnd' : 'playoffHub';
      return 'seasonEnd'; // save antigo sem playoff
    }
    return 'hub';
  });
  const [matchCtx, setMatchCtx] = useState<{
    teams: [TTeam, TTeam];
    userIdx: 0 | 1;
    maps?: { map: MapId; pickedBy: 0 | 1 | -1 }[];
    mode: 'league' | 'major' | 'playoff';
    bestOf: 1 | 3 | 5;
    phaseLabel: string;
  } | null>(null);
  const [selSeries, setSelSeries] = useState<{ series: SeriesResult; teams: [TTeam, TTeam] } | null>(null);
  const [majorResult, setMajorResult] = useState<MajorResult | null>(null);
  const [majorTState, setMajorTState] = useState<Tournament | null>(() => loadSave().majorT);
  const majorT = majorTState;
  // persiste o Major junto do save (sobrevive a reload no meio do torneio)
  const setMajorT = (t: Tournament | null) => {
    setMajorTState(t);
    setSave((s) => { const n = { ...s, majorT: t }; persist(n); return n; });
  };
  // persiste o torneio ao vivo + o estado dos stages num único save
  const setMajorState = (t: Tournament | null, patch: Partial<CareerSave> = {}) => {
    setMajorTState(t);
    setSave((s) => { const n = { ...s, majorT: t, ...patch }; persist(n); return n; });
  };
  const [hubTab, setHubTab] = useState<HubTab>(() => (loadSave().majorT ? 'major' : 'overview'));
  // guia "como funciona a temporada" (explica a jornada; some ao dispensar)
  const [guideOpen, setGuideOpen] = useState(() => {
    try { return localStorage.getItem('rtm-career-guide-v1') !== '1'; } catch { return true; }
  });
  const dismissGuide = () => {
    setGuideOpen(false);
    try { localStorage.setItem('rtm-career-guide-v1', '1'); } catch { /* sem storage */ }
  };
  const [selTeam, setSelTeam] = useState<TTeam | null>(null);
  const [showCeremony, setShowCeremony] = useState(false); // cerimônia Top 20 HLTV (fim de temporada)
  const [promoting, setPromoting] = useState<string | null>(null); // prospecto escolhendo quem sai do elenco
  const [profilePlayer, setProfilePlayer] = useState<Player | null>(null); // perfil detalhado do jogador (modal)
  const [t20Mode, setT20Mode] = useState<'season' | 'career'>('season'); // Top 20: temporada ou carreira
  const [newsCat, setNewsCat] = useState<NewsCat | 'all'>('all'); // filtro da Inbox
  const [vrsMode, setVrsMode] = useState<'regiao' | 'geral'>('geral'); // ranking VRS: por região ou geral
  const [quickSim, setQuickSim] = useState<{ series: SeriesResult; teams: [TTeam, TTeam]; userIdx: 0 | 1; label: string; onDone: () => void } | null>(null);
  const rngRef = useRef(makeRng(randomSeed()));
  // registro parcial do split, finalizado após o Major (se houver)
  const pendingSplit = useRef<SplitRecord | null>(null);

  const update = (patch: Partial<CareerSave>) => {
    setSave((s) => {
      const next = { ...s, ...patch };
      persist(next);
      return next;
    });
  };

  // aplica a função escolhida no Elenco ao time do usuário na hora de montar a
  // partida (o snapshot da liga/major não sabe das trocas feitas no meio do
  // split). Times da IA passam direto.
  const roleOf = (oid: string): Role | undefined => save.roles?.[oid];
  const syncUser = (team: TTeam): TTeam => {
    if (!team.isUser) return team;
    const t = resyncUserRoles(team, roleOf);
    // aplica também o domínio de mapa e o playbook atuais (valem se mudarem no
    // meio do split — o snapshot da liga não saberia sozinho)
    const synced: TTeam = {
      ...t,
      mapPrefs: { ...t.mapPrefs, ...(save.mapTraining ?? {}) },
      playbook: save.playbook,
      playbookFam: Math.max(0, Math.min(1, (save.playbookXp ?? 0) / 100)),
    };
    // PLANO DE JOGO da partida: buff real escolhido pelo usuário antes de jogar
    return applyGamePlanBuff(synced, save.gamePlan ?? 'disciplined');
  };

  // SÓ tempos atuais: usa EXCLUSIVAMENTE os elencos REAIS de CS2 (2026) do
  // bo3.gg, exclusivos do modo carreira (não aparecem no draft/online). Os
  // times CS2 antigos feitos à mão não entram aqui (evita duplicatas e OVRs
  // desatualizados).
  // edições do dataset: o SERVIDOR é a fonte da verdade (valem pra todos). Começa
  // do cache local pra render instantâneo, mas a busca global sobrescreve o cache
  // (nada de cache local sobrepondo o que o admin editou pra todo mundo).
  const [bo3Edits, setBo3Edits] = useState<Bo3Edits>(() => loadBo3Edits());
  useEffect(() => {
    let alive = true;
    fetchBo3Edits().then((srv) => {
      if (!alive || !srv) return;
      // jogador comum recebe o SERVIDOR CRU (fonte da verdade global): assim as
      // edições do admin chegam a todos, e o cache velho não "volta pro que era".
      // só o ADMIN mantém suas edições locais por cima (pra não perder trabalho).
      const next = isAdminUnlocked() ? mergeBo3Edits(srv, loadBo3Edits()) : srv;
      setBo3Edits(next); saveBo3Edits(next);
    });
    return () => { alive = false; };
  }, []);
  const currentEra = useMemo(
    // aplica as transferências já realizadas (save.moves) por cima da base, e o
    // ENVELHECIMENTO da IA por split (pulando seus jogadores, que evoluem pelo evo).
    () => {
      const skip = new Set(save.squad.map((s) => s.playerId));
      return applyAiAging(applyMoves(applyBo3Edits(CS2_REAL_2026, bo3Edits), save.moves), save.split, skip)
        .filter((t) => t.players.length >= 5);
    },
    [save.moves, bo3Edits, save.split, save.squad],
  );
  // pool de ADVERSÁRIOS: tira o time que você assumiu E remove qualquer jogador
  // que está no SEU elenco do time de origem (sem duplicar ninguém), repondo com
  // jovens da base. Assim contratar alguém enfraquece de verdade o outro time.
  const oppEra = useMemo(() => {
    const squadIds = new Set(save.squad.map((s) => s.playerId));
    return currentEra
      .filter((t) => t.id !== save.takeoverId)
      .map((t) => {
        if (squadIds.size === 0) return t;
        const kept = t.players.filter((p) => !squadIds.has(p.id));
        if (kept.length === t.players.length) return t;
        const fill = backfillPlayers(t, t.players.length - kept.length);
        return { ...t, players: [...kept, ...fill] };
      });
  }, [currentEra, save.takeoverId, save.squad]);

  // Campeonatos disponíveis a cada split: o jogador escolhe qual convite aceitar,
  // já sabendo quais times vai enfrentar em cada um. Cada circuito tem força,
  // premiação e número de vagas pro Major diferentes.
  const circuits = useMemo(() => {
    const pool = oppEra.filter((t) => t.id !== 'user');
    const byStrength = [...pool].sort((a, b) => b.teamwork - a.teamwork);
    // TIERS GLOBAIS (espelham o ranking HLTV), não por região. Cada torneio tem um
    // NÚCLEO (os melhores da faixa, que quase sempre comparecem) + vagas ROTATIVAS
    // de uma janela mais ampla, embaralhadas POR SPLIT. Assim o Tier 1 às vezes
    // recebe um Tier 2, o Tier 2 recebe um Tier 3, e o field muda de split pra
    // split — sem ser sempre os mesmos. Montados em sequência removendo quem já foi
    // sorteado, então os campos ficam disjuntos (ninguém em dois eventos no split).
    const used = new Set<string>();
    const buildField = (coreN: number, windowN: number, n: number, seed: number): TeamSeason[] => {
      const avail = byStrength.filter((t) => !used.has(t.id));
      const core = avail.slice(0, coreN);
      const rot = seededShuffle(avail.slice(coreN, coreN + windowN), seed).slice(0, Math.max(0, n - core.length));
      const field = [...core, ...rot];
      for (const t of field) used.add(t.id);
      return field;
    };
    const t1Teams = buildField(9, 13, 15, save.split * 101 + 1); // top 9 fixos + 6 rotativos (alcança o Tier 2)
    const t2Teams = buildField(9, 13, 15, save.split * 101 + 2); // melhores restantes + rotativos (alcança o Tier 3)
    const t3Teams = buildField(9, 13, 15, save.split * 101 + 3); // o que sobrou + rotativos da base
    const mk = (
      id: string,
      name: string,
      desc: string,
      teams: TeamSeason[],
      spots: number,
      prizeMult: number,
      tier: number,
    ) => {
      const ai = teams.slice(0, 15);
      // peso de VRS do evento = força média dos adversários (Opponent Network):
      // campo forte rende muito, campo fraco rende pouco. Calculado do field real.
      const favg = ai.length ? ai.reduce((a, t) => a + vrsCore(t.teamwork), 0) / ai.length : 400;
      return { id, name, desc, teams: ai, spots, prizeMult, vrsWeight: opponentMult(favg), tier };
    };
    const t1Name = t1EventName(save.split);
    const t2Name = t2EventName(save.split);
    const t3Name = t3EventName(save.split);
    // Cada split é um evento real distinto do calendário (nomes rotativos).
    return [
      mk('t1', t1Name, `Tier 1 mundial · ${t1Name}: fase de grupos (GSL, dupla eliminação) + playoffs com a elite do ranking. Principal caminho de pontos pro Major; paga muito.`, t1Teams, 2, 1.8, 1),
      mk('t2', t2Name, `Tier 2 mundial · ${t2Name}: o segundo escalão do ranking (Astralis, paiN, FaZe, MIBR, TYLOO e cia), grupos GSL + playoffs. Vença pra subir ao Tier 1 e brigar pelo Major.`, t2Teams, 2, 1, 2),
      mk('t3', t3Name, `Tier 3 · ${t3Name}: circuito de acesso, times em ascensão. Grupos + playoffs. Onde toda org começa.`, t3Teams, 1, 0.6, 3),
    ].filter((c) => c.teams.length >= 5);
  }, [oppEra, save.split]);

  // mercado: jogadores reais dos elencos atuais (CS2) + FREE AGENTS (pros sem
  // time), com preço de mercado. Free agents saem 25% mais barato (sem multa).
  const market = useMemo(
    () => {
      const squadIds = new Set(save.squad.map((s) => s.playerId));
      const fromTeams = currentEra.flatMap((t) => t.players.map((p) => ({ player: p, from: t, price: playerValue(p) })));
      const freeAgents = FREE_AGENT_PLAYERS
        .filter((p) => !squadIds.has(p.id)) // some do mercado quando já contratado
        .map((p) => ({ player: p, from: FREE_AGENTS_FROM, price: Math.round(playerValue(p) * 0.75) }));
      return [...fromTeams, ...freeAgents].sort((a, b) => a.price - b.price);
    },
    [currentEra, save.squad],
  );

  const findSigning = (s: Signing): { player: Player; from: TeamSeason } | null => {
    // 1) time de origem. 2) se uma transferência mudou o time dele, procura em
    // QUALQUER time. 3) por fim na base. Um jogador do SEU elenco nunca "some".
    let from = currentEra.find((t) => t.id === s.fromId);
    let player = from?.players.find((p) => p.id === s.playerId);
    if (!player) {
      for (const t of currentEra) {
        const p = t.players.find((pp) => pp.id === s.playerId);
        if (p) { from = t; player = p; break; }
      }
    }
    if (!player) {
      for (const t of CS2_REAL_2026) {
        const p = t.players.find((pp) => pp.id === s.playerId);
        if (p) { from = t; player = p; break; }
      }
    }
    // 4) free agent (pro sem time): resolve da lista de free agents
    if (!player) {
      const fa = FREE_AGENT_PLAYERS.find((p) => p.id === s.playerId);
      if (fa) { from = FREE_AGENTS_FROM; player = fa; }
    }
    // 5) prospecto promovido da academia (não está na base): resolve do save.youth
    if (!player && save.youth?.[s.playerId]) {
      player = save.youth[s.playerId];
      from = ACADEMY_FROM;
    }
    if (!from || !player) return null;
    // função definida pelo técnico (override do dado da base; corrige dados
    // errados e dá controle de tática igual ao gerenciamento do Brasval)
    const ovrRole = save.roles?.[player.id];
    if (ovrRole && ovrRole !== player.role) player = { ...player, role: ovrRole };
    // aplica a evolução acumulada do SEU elenco (atributos sobem/caem entre
    // temporadas; valor e salário acompanham automaticamente)
    const d = save.evo?.[player.id] ?? 0;
    if (!d) return { player, from };
    const clamp = (v: number) => Math.max(40, Math.min(99, v));
    return {
      player: {
        ...player,
        aim: clamp(player.aim + d),
        consistency: clamp(player.consistency + d),
        clutch: clamp(player.clutch + d),
        awp: clamp(player.awp + d),
        igl: clamp(player.igl + d),
      },
      from,
    };
  };

  const buildTeam = (s: CareerSave): TTeam | null => {
    if (!s.org || s.squad.length < 5 || !s.coachFromId) return null;
    const picks = s.squad.map(findSigning).filter(Boolean) as { player: Player; from: TeamSeason }[];
    if (picks.length < 5) return null;
    // '__rookie__' = técnico iniciante barato (opção de entrada da carreira)
    const coach = currentEra.find((t) => t.id === s.coachFromId)?.coach ?? ROOKIE_COACH;
    const team = buildUserTeam(s.org.name, picks.slice(0, 5), coach);
    return {
      ...team, tag: s.org.tag, colors: s.org.colors, logoUrl: s.org.logo,
      mapPrefs: { ...team.mapPrefs, ...(s.mapTraining ?? {}) }, // domínio treinado por mapa
      playbook: s.playbook, playbookFam: Math.max(0, Math.min(1, (s.playbookXp ?? 0) / 100)),
    };
  };

  const startSplit = (s: CareerSave, circuit: (typeof circuits)[number]) => {
    const user = buildTeam(s);
    if (!user) return;
    // jogador entra no split com a forma "puxada" pela moral (motivado começa
    // quente, insatisfeito começa frio); a forma depois oscila durante o torneio
    user.players = user.players.map((p) => {
      const oid = p.id.startsWith('user__') ? p.id.slice('user__'.length) : p.id;
      return { ...p, form: moraleForm(s.morale?.[oid] ?? MORALE_DEFAULT) };
    });
    // a IA ganha uma vantagem MUITO leve por split (so pra nao virar carreira
    // invicta), com teto baixo pra força do circuito ficar igual à do Major, que
    // é a referência correta. Tiers de acesso (3/2) sobem ainda mais devagar.
    const tierScale = s.tier === 3 ? 0.6 : s.tier === 2 ? 0.85 : 1;
    const aiBoost = CIRCUIT_AI_BOOST + Math.min(2.5, (s.split - 1) * 0.35 * tierScale);
    const ai = circuit.teams.filter((t) => t.id !== 'user').slice(0, 15).map((t) => {
      const tt = teamSeasonToTTeam(t);
      tt.strength += aiBoost;
      return tt;
    });
    // formato real do CS: 2 grupos GSL (dupla eliminação, 4 times, top 2
    // avançam) → playoffs mata-mata. Nada de pontos corridos (isso é futebol).
    const league = createGSLStage(`${circuit.name} - Split ${s.split}`, [user, ...ai]);
    const choice: CircuitChoice = {
      id: circuit.id,
      name: circuit.name,
      spots: circuit.spots,
      prizeMult: circuit.prizeMult,
      vrsWeight: circuit.vrsWeight,
      tier: circuit.tier,
    };
    const objective = objectiveFor(circuit.tier, s.split, isMajorSplit(s.split));
    const startItem: NewsItem = {
      id: `${s.split}:start`, split: s.split, icon: '🗓️', tone: 'info', cat: 'board',
      title: `Split ${s.split} começa: ${circuit.name}`,
      body: `Meta da diretoria: "${objective.text}" (bônus ${formatMoney(objective.bonus)}).`,
    };
    // relatório do olheiro: o time a temer no circuito + o mapa forte dele
    const toughest = ai.slice().sort((a, b) => b.strength - a.strength)[0];
    const scoutItem: NewsItem[] = toughest ? [{
      id: `${s.split}:scout`, split: s.split, icon: '🔍', tone: 'info', cat: 'scout',
      title: `Olheiros: ${toughest.name} é o time a temer`,
      body: `O favorito do ${circuit.name} é a ${toughest.name} (força ${toughest.strength.toFixed(1)}), perigosa em ${MAP_LABELS[scoutMaps(toughest)[0].m]}. Pré-jogo: confira o relatório do adversário na Visão geral antes de cada partida.`,
    }] : [];
    const next = {
      ...s, league, circuit: choice, tierChange: null, objective,
      ...pushNews(s, [startItem, ...scoutItem]),
    };
    persist(next);
    setSave(next);
    setHubTab('overview'); // a Visão geral já mostra a chave inline + os botões JOGAR/Simular
    setStage('hub');
  };

  // folha salarial do split (soma dos salários do elenco contratado)
  const payroll = useMemo(() => {
    const picks = save.squad.map(findSigning).filter(Boolean) as { player: Player }[];
    return picks.reduce((acc, p) => acc + playerWage(p.player), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.squad, save.evo]);

  // evolução da janela: cada jogador do elenco sobe/cai conforme a fase da
  // carreira (em ascensão / no auge / em declínio). Roda ao fechar o split.
  const evolveSquad = (s: CareerSave): Pick<CareerSave, 'evo' | 'lastEvo'> => {
    // só jogadores do elenco ATUAL carregam evolução: quem foi vendido volta
    // aos atributos base (evita recomprar barato um jogador ainda evoluído)
    const evo: Record<string, number> = {};
    const lastEvo: CareerSave['lastEvo'] = [];
    for (const sig of s.squad) {
      const f = findSigning(sig);
      if (!f) continue;
      const prev = s.evo?.[sig.playerId] ?? 0;
      const ovr = playerOvr(f.player);
      const age = effectiveAge(f.player, s.split, s.youthAge);
      const pot = playerPotentialOvr(f.player, age);
      const atCeiling = ovr >= pot;
      let d = evoDelta(sig.playerId, s.split, age, atCeiling);
      // foco de treino: o jogador escolhido desenvolve mais rápido. Jovem/auge
      // ganha +1 (não ultrapassa o potencial); veterano treina pra perder menos.
      const focused = s.trainingFocus === sig.playerId;
      if (focused) {
        if (!atCeiling) d += 1;
        else if (d < 0) d += 1; // mitiga o declínio do veterano
      }
      const total = prev + d;
      if (total !== 0) evo[sig.playerId] = total;
      lastEvo.push({ nick: f.player.nick, delta: d, phase: playerPhase(sig.playerId, age) });
    }
    return { evo, lastEvo };
  };

  // evolui os prospectos da academia ao virar o split: jovens sobem rumo ao
  // potencial; o que está em foco 🎯 desenvolve mais rápido. Cresce nos atributos
  // base guardados (eles não vêm do dataset, então a evolução fica neles mesmos).
  const evolveAcademy = (s: CareerSave): AcademyEntry[] =>
    (s.academy ?? []).map((a) => {
      const aged = a.age + ((s.split + 1) % 3 === 0 ? 1 : 0); // envelhece ~1 a cada 3 splits
      const ovr = playerOvr(a);
      if (ovr >= a.potential) return { ...a, age: aged }; // teto atingido: só envelhece
      const r = hashStr(`acaevo:${a.id}:${s.split}`) % 100;
      let d = r < 35 ? 3 : r < 75 ? 2 : 1;
      if (s.academyFocus === a.id) d += 1; // treino focado acelera
      d = Math.min(d, a.potential - ovr); // não ultrapassa o potencial
      const clamp = (v: number) => Math.max(40, Math.min(99, v));
      return {
        ...a, age: aged,
        aim: clamp(a.aim + d), consistency: clamp(a.consistency + d), clutch: clamp(a.clutch + d),
        awp: clamp(a.awp + d), igl: clamp(a.igl + d),
      };
    });

  // promove um prospecto da academia ao elenco principal. Se o elenco estiver
  // cheio (5), troca pelo jogador escolhido (replaceOid). O prospecto vira um
  // Signing resolvido pelo save.youth e passa a evoluir/envelhecer como qualquer um.
  const promoteProspect = (prospectId: string, replaceOid?: string) => {
    const a = (save.academy ?? []).find((x) => x.id === prospectId);
    if (!a) return;
    if (save.squad.length >= 5 && !replaceOid) { setPromoting(prospectId); return; }
    const player: Player = {
      id: a.id, nick: a.nick, name: a.name, country: a.country, role: a.role,
      aim: a.aim, consistency: a.consistency, clutch: a.clutch, awp: a.awp, igl: a.igl,
    };
    const youth = { ...(save.youth ?? {}), [a.id]: player };
    // guarda a idade-base (equivalente ao split 1) pra ele continuar JOVEM e evoluindo
    // após a promoção, em vez de o findSigning re-derivar 20-25 (ou colidir por nick)
    const youthAge = { ...(save.youthAge ?? {}), [a.id]: a.age - Math.floor((save.split - 1) / 3) };
    const academy = (save.academy ?? []).filter((x) => x.id !== prospectId);
    let squad = save.squad;
    if (squad.length >= 5 && replaceOid) squad = squad.filter((sg) => sg.playerId !== replaceOid);
    squad = [...squad, { playerId: a.id, fromId: '__youth__' }];
    const contracts = { ...(save.contracts ?? {}), [a.id]: save.split + CONTRACT_TERM - 1 };
    const academyFocus = save.academyFocus === prospectId ? null : save.academyFocus;
    const next = { ...save, academy, youth, youthAge, squad, contracts, academyFocus };
    persist(next);
    setSave(next);
    setPromoting(null);
  };

  // contabiliza as stats do split na carreira UMA vez só. Idempotente: se o
  // split já foi contado (careerStatsThru >= split), não conta de novo — protege
  // contra F5 na tela de fim de temporada / resultado do Major (evita dobrar).
  const bankStats = (s: CareerSave): Pick<CareerSave, 'careerStats' | 'careerStatsThru'> => {
    if (!s.league || (s.careerStatsThru ?? 0) >= s.split) {
      return { careerStats: s.careerStats ?? {}, careerStatsThru: s.careerStatsThru ?? 0 };
    }
    return { careerStats: accumulateCareerStats(s.careerStats, s.league), careerStatsThru: s.split };
  };

  // aplica a janela de transferências do split que está fechando: os swaps viram
  // movimentos persistentes (save.moves) e o resumo vai pra lastMoves (exibido
  // no próximo split). Não move jogadores do elenco do usuário.
  const applyTransferWindow = (s: CareerSave): Pick<CareerSave, 'moves' | 'lastMoves'> => {
    // o SEU org não participa do mercado da IA (não perde nem ganha jogador
    // por transferência) — evita seu elenco ser bagunçado entre splits.
    const pool = currentEra.filter((t) => t.id !== s.takeoverId);
    const tr = computeTransfers(s.split, pool);
    const squadIds = new Set(s.squad.map((x) => x.playerId));
    const moves = { ...(s.moves ?? {}) };
    for (const sw of tr.swaps) {
      if (squadIds.has(sw.pid)) continue; // nunca move um jogador SEU
      if (s.takeoverId && sw.toId === s.takeoverId) continue; // nunca empurra ninguém pro seu org
      moves[sw.pid] = sw.toId;
    }
    const lastMoves = tr.feed.slice(0, 8).map((f) => ({ nick: f.nick, from: f.from, to: f.to }));
    return { moves, lastMoves };
  };

  // janela aberta: consuma os acordos fechados durante a temporada (pendingDeals).
  // Roda sobre o save JÁ montado da virada (split novo, contratos vencidos, etc.).
  // Tira os jogadores da troca, traz o alvo e desconta o dinheiro. Se não houver
  // caixa pro acordo no momento da janela, o acordo simplesmente cai (sem dívida).
  const consummateDeals = (s: CareerSave): CareerSave => {
    const deals = s.pendingDeals ?? [];
    const sales = s.pendingSales ?? [];
    const dirty = deals.length || sales.length || s.pendingDeals || s.pendingSales || s.rejectedOffers;
    if (!dirty) return s;
    let squad = [...s.squad];
    let budget = s.budget;
    const contracts = { ...(s.contracts ?? {}) };
    const morale = { ...(s.morale ?? {}) };
    const peakOvr = { ...(s.peakOvr ?? {}) };
    const evo = { ...(s.evo ?? {}) };
    const arrivals: string[] = [];
    const departures: string[] = [];
    // VENDAS: jogador seu sai (proposta aceita na temporada) e entra a grana
    for (const sale of sales) {
      if (!squad.some((x) => x.playerId === sale.playerId)) continue; // já não está
      squad = squad.filter((x) => x.playerId !== sale.playerId);
      delete contracts[sale.playerId]; delete morale[sale.playerId]; delete peakOvr[sale.playerId]; delete evo[sale.playerId];
      budget += sale.fee;
      departures.push(`${sale.nick} (${sale.toTag})`);
    }
    // ACORDOS DE COMPRA: tira a troca, traz o alvo e desconta o dinheiro
    for (const d of deals) {
      if (budget < d.fee) continue; // sem caixa agora: acordo cai
      if (squad.some((x) => x.playerId === d.inPlayerId)) continue; // já está no elenco
      for (const out of d.outPlayerIds) {
        squad = squad.filter((x) => x.playerId !== out);
        delete contracts[out]; delete morale[out]; delete peakOvr[out]; delete evo[out];
      }
      squad.push({ playerId: d.inPlayerId, fromId: d.inFromId, fee: d.fee });
      contracts[d.inPlayerId] = s.split + CONTRACT_TERM - 1;
      budget -= d.fee;
      arrivals.push(d.inNick);
    }
    let next: CareerSave = { ...s, squad, budget, contracts, morale, peakOvr, evo, pendingDeals: [], pendingSales: [], rejectedOffers: [] };
    const news: NewsItem[] = [];
    if (arrivals.length) news.push({ id: `${s.split}:deals`, split: s.split, icon: '🤝', tone: 'good', cat: 'board', title: 'Reforços confirmados na janela', body: `Acordos fechados na temporada passada entraram em vigor: ${arrivals.join(', ')}.` });
    if (departures.length) news.push({ id: `${s.split}:sales`, split: s.split, icon: '💸', tone: 'info', cat: 'transfer', title: 'Vendas confirmadas na janela', body: `Saíram por proposta aceita: ${departures.join(', ')}.` });
    if (news.length) next = { ...next, ...pushNews(next, news) };
    return next;
  };

  // contratos vencidos: o jogador cujo contrato acaba SAI de graça no próximo
  // split (a não ser que tenha sido renovado nas Finanças). Devolve o elenco
  // sem eles + os nicks que saíram (pra avisar no resumo do split).
  // contratos vencendo no novo split: NÃO solta ninguém automaticamente. Devolve
  // a lista pra FORÇAR a tela de renovação na janela (o usuário decide quem fica).
  // Ignora quem já está saindo numa troca (pendingDeals) pra não listar duplicado.
  const dueRenewals = (s: CareerSave, newSplit: number): Renewal[] => {
    const inDeal = new Set([
      ...(s.pendingDeals ?? []).flatMap((d) => d.outPlayerIds),
      ...(s.pendingSales ?? []).map((sale) => sale.playerId),
    ]);
    const out: Renewal[] = [];
    for (const sig of s.squad) {
      if (inDeal.has(sig.playerId)) continue;
      const until = s.contracts?.[sig.playerId];
      if (until !== undefined && until < newSplit) {
        const f = findSigning(sig);
        if (f) out.push({ playerId: sig.playerId, nick: f.player.nick, ovr: playerOvr(f.player), wage: playerWage(f.player), country: f.player.country, role: f.player.role });
      }
    }
    return out;
  };

  // assédio do topo: uma org de ELITE (tier 1) pode fazer proposta pelo seu
  // melhor jogador entre temporadas. Só acontece se você ainda não é tier 1
  // (do contrário você JÁ é o topo). Determinístico por split+jogador.
  const makeOffer = (s: CareerSave, newTier: number): PoachOffer | null => {
    if (newTier <= 1) return null;
    const picks = s.squad.map(findSigning).filter(Boolean) as { player: Player }[];
    const best = picks.map((p) => p.player).sort((a, b) => playerOvr(b) - playerOvr(a))[0];
    if (!best || playerOvr(best) < 78) return null; // ninguém assedia jogador mediano
    const h = hashStr(`offer:${s.split}:${best.id}`);
    if (h % 100 >= 50) return null; // ~50% de chance por split
    const elite = oppEra.filter((t) => teamTier(t) === 1 && t.id !== s.takeoverId);
    if (elite.length === 0) return null;
    const org = elite[h % elite.length];
    const fee = Math.round(playerValue(best) * (1.4 + (h % 35) / 100)); // 1.4x a 1.75x
    return { orgId: org.id, orgName: org.team, orgTag: org.tag, playerId: best.id, nick: best.nick, ovr: playerOvr(best), fee };
  };

  // forma do clube no split (resultados das partidas do usuário já jogadas)
  const clubForm = (l: League): ('W' | 'L')[] => {
    const out: ('W' | 'L')[] = [];
    for (let r = 0; r < l.current; r++) {
      const m = l.rounds[r]?.find((x) => x.a === 'user' || x.b === 'user');
      if (m?.result) {
        const userWon = (m.result.winner === 0 ? m.a : m.b) === 'user';
        out.push(userWon ? 'W' : 'L');
      }
    }
    return out;
  };

  const userPosition = (l: League): number => leagueTable(l).findIndex((t) => t.id === 'user') + 1;

  // resolve a rodada atual após a partida do usuário (jogada ou simulada)
  const finishUserRound = (l: League, series?: SeriesResult) => {
    if (series) {
      const m = userLeagueMatch(l);
      if (m) m.result = series;
    }
    setMatchCtx(null);
    if (l.gsl) {
      resolveGSLRound(l, rngRef.current);
      // auto-resolve as rodadas seguintes que não têm o usuário (ele já passou
      // como 1º, ou caiu) até aparecer um jogo seu ou a fase acabar
      let guard = 0;
      while (!gslDone(l) && !userLeagueMatch(l) && guard++ < 6) resolveGSLRound(l, rngRef.current);
      if (gslDone(l)) { enterPlayoffs(l); return; }
    } else {
      resolveLeagueRound(l, rngRef.current, LEAGUE_BO);
      if (leagueDone(l)) { enterPlayoffs(l); return; }
    }
    const next = { ...save, league: { ...l } };
    persist(next);
    setSave(next);
    if (l.gsl) setHubTab('bracket'); // mostra a chave após cada partida (com o botão de jogar a próxima ali mesmo)
    setStage('hub');
  };

  // entra no mata-mata: GSL = 4 classificados com cross-seed (1A x 2B, 1B x 2A);
  // round-robin antigo = top 4 da tabela. SF + final pelo título e vagas.
  const enterPlayoffs = (l: League) => {
    let seedTable: TTeam[];
    if (l.gsl) {
      seedTable = gslQualifiers(l).map((id) => leagueTeam(l, id)); // 8 classificados (4 grupos)
    } else {
      seedTable = leagueTable(l);
    }
    const p = buildPlayoff(seedTable, save.circuit?.name ?? l.name);
    poRunAI(p, (id) => leagueTeam(l, id), rngRef.current); // sima o que não envolve o usuário
    const next = { ...save, league: { ...l }, playoff: p };
    persist(next);
    setSave(next);
    setStage('playoffHub');
  };

  // abre o veto/partida da rodada do usuário no playoff
  const playPlayoffMine = () => {
    const p = save.playoff;
    if (!p || !save.league) return;
    const m = poUserMatch(p);
    if (!m) return;
    rngRef.current = makeRng(randomSeed());
    const a = syncUser(leagueTeam(save.league, m.a));
    const b = syncUser(leagueTeam(save.league, m.b));
    const isFinal = p.final === m;
    setMatchCtx({
      teams: [a, b],
      userIdx: m.a === 'user' ? 0 : 1,
      mode: 'playoff',
      bestOf: isFinal ? PO_FINAL_BO : PO_SF_BO,
      phaseLabel: `${p.circuit} · ${isFinal ? 'GRANDE FINAL' : 'Semifinal'}`,
    });
    setStage('veto');
  };

  const finishPlayoffRound = (series?: SeriesResult) => {
    const p = save.playoff;
    if (!p || !save.league) return;
    const clone: Playoff = structuredClone(p);
    const m = poUserMatch(clone);
    if (series && m) m.result = series;
    poRunAI(clone, (id) => leagueTeam(save.league!, id), rngRef.current);
    const next = { ...save, playoff: clone };
    persist(next);
    setSave(next);
    setMatchCtx(null);
    setStage(clone.champion ? 'seasonEnd' : 'playoffHub');
  };

  const applyPlayoff = (clone: Playoff) => {
    poRunAI(clone, (id) => leagueTeam(save.league!, id), rngRef.current);
    const next = { ...save, playoff: clone };
    persist(next);
    setSave(next);
    setStage(clone.champion ? 'seasonEnd' : 'playoffHub');
  };
  const simPlayoffMine = () => {
    const p = save.playoff;
    if (!p || !save.league) return;
    const live = poUserMatch(p);
    if (!live) { applyPlayoff(structuredClone(p)); return; }
    rngRef.current = makeRng(randomSeed());
    const a = syncUser(leagueTeam(save.league, live.a));
    const b = syncUser(leagueTeam(save.league, live.b));
    const isFinal = p.final === live;
    const bo = isFinal ? PO_FINAL_BO : PO_SF_BO;
    const series = simulateSeries(rngRef.current, a, b, autoVeto([a, b], rngRef.current, bo), bo);
    setQuickSim({
      series, teams: [a, b], userIdx: live.a === 'user' ? 0 : 1,
      label: `${p.circuit} · ${isFinal ? 'Final' : 'Semifinal'}`,
      onDone: () => {
        setQuickSim(null);
        const clone: Playoff = structuredClone(p);
        const m = poUserMatch(clone);
        if (m) m.result = series;
        applyPlayoff(clone);
      },
    });
  };

  // SIM MATCH: simula a partida do usuário com animação rápida (mini partida)
  const simMine = (l: League) => {
    const m = userLeagueMatch(l);
    if (!m) return;
    rngRef.current = makeRng(randomSeed());
    const a = syncUser(leagueTeam(l, m.a));
    const b = syncUser(leagueTeam(l, m.b));
    const bo = m.bo ?? LEAGUE_BO; // GSL: abertura Bo1, resto Bo3
    const series = simulateSeries(rngRef.current, a, b, autoVeto([a, b], rngRef.current, bo), bo);
    setQuickSim({
      series, teams: [a, b], userIdx: m.a === 'user' ? 0 : 1,
      label: `${l.name} · ${l.gsl ? GSL_ROUND_LABELS[l.current] : `Rodada ${l.current + 1}`}`,
      onDone: () => { setQuickSim(null); finishUserRound(l, series); },
    });
  };

  // SIM SPLIT: resolve TODAS as rodadas restantes do turno de uma vez (sem
  // animação) e para no mata-mata — corta a repetição de clicar rodada a rodada
  // (pedido de quem joga no celular) sem pular a parte decisiva (playoffs).
  const simWholeSplit = (l: League) => {
    rngRef.current = makeRng(randomSeed());
    let guard = 0;
    if (l.gsl) {
      while (!gslDone(l) && guard++ < 12) {
        const m = userLeagueMatch(l);
        if (m && !m.result) {
          const a = syncUser(leagueTeam(l, m.a));
          const b = syncUser(leagueTeam(l, m.b));
          const bo = m.bo ?? 3;
          m.result = simulateSeries(rngRef.current, a, b, autoVeto([a, b], rngRef.current, bo), bo);
        }
        resolveGSLRound(l, rngRef.current);
      }
      enterPlayoffs(l);
      return;
    }
    while (!leagueDone(l) && guard++ < 80) {
      const m = userLeagueMatch(l);
      if (m && !m.result) {
        const a = syncUser(leagueTeam(l, m.a));
        const b = syncUser(leagueTeam(l, m.b));
        m.result = simulateSeries(rngRef.current, a, b, autoVeto([a, b], rngRef.current, LEAGUE_BO), LEAGUE_BO);
      }
      resolveLeagueRound(l, rngRef.current, LEAGUE_BO);
    }
    enterPlayoffs(l);
  };

  // Major: o time vai pro Major mundial (16 times) e disputa Suíça + playoffs
  // AO VIVO, com bracket de verdade (mesmo motor/UI do modo draft).
  const playMajor = (s: CareerSave) => {
    const user = buildTeam(s);
    if (!user) return;
    rngRef.current = makeRng(randomSeed());
    const rng = rngRef.current;
    // Major real (32 times, 3 stages de Swiss + playoffs). O field é ordenado por
    // VRS; o usuário entra no STAGE do seu tier: top 8 = Stage 3, 9-16 = Stage 2,
    // 17-32 = Stage 1. Os stages antes do seu são AUTO-SIMULADOS.
    const aiSorted = oppEra
      .filter((t) => t.id !== 'user' && t.id !== s.takeoverId)
      .map((t) => ({ tt: teamSeasonToTTeam(t), vrs: aiTeamVrs(t) }))
      .sort((a, b) => b.vrs - a.vrs);
    const userVrs = userBaseVrsFor(user.teamwork) + s.vrs;
    const userRank = aiSorted.filter((x) => x.vrs > userVrs).length + 1; // posição mundial
    const userStage = userRank <= 8 ? 3 : userRank <= 16 ? 2 : 1;
    const field: TTeam[] = aiSorted.map((x) => x.tt).slice(0, 31);
    field.splice(Math.min(userRank - 1, field.length), 0, user); // insere o usuário pela posição VRS
    const fieldT = field.slice(0, 32);
    const s3band = fieldT.slice(0, 8);
    const s2band = fieldT.slice(8, 16);
    const s1band = fieldT.slice(16, 32);
    const pre: NonNullable<CareerSave['majorPre']> = [];
    const runAuto = (teams: TTeam[], label: string): TTeam[] => {
      const st = createSwissStage(teams, rng, label);
      let g = 0;
      while (st.phase !== 'done' && g++ < 12) resolveRound(st, rng);
      return stageAdvancers(st);
    };
    let carry: TTeam[] = [];
    if (userStage >= 2) {
      carry = runAuto(s1band, 'Stage 1');
      pre.push({ stage: 1, advancers: carry.map((t) => ({ tag: t.tag, name: t.name })) });
    }
    if (userStage === 3) {
      carry = runAuto([...carry, ...s2band], 'Stage 2');
      pre.push({ stage: 2, advancers: carry.map((t) => ({ tag: t.tag, name: t.name })) });
    }
    const liveTeams = userStage === 1 ? s1band : userStage === 2 ? [...carry, ...s2band] : [...carry, ...s3band];
    const live = createSwissStage(liveTeams, rng, `${MAJOR_NAME(s.split)} · Stage ${userStage}`);
    setHubTab('major');
    setStage('hub');
    setMajorState(live, {
      majorStage: userStage, majorUserStage: userStage,
      majorSeed2: userStage <= 1 ? s2band : [],
      majorSeed3: userStage <= 2 ? s3band : [],
      majorPre: pre,
    });
  };

  // encerra o Major do usuário: colocação, prêmio e VRS
  const concludeMajor = (t: Tournament, placement: PlacementCode) => {
    setMajorResult({
      tournament: t,
      placement,
      prize: MAJOR_PRIZE[placement],
      vrs: MAJOR_VRS[placement],
      champion: placement === 'champion',
    });
    setStage('major');
  };

  // avança o Major em STAGES: transiciona stage->stage->playoffs e encerra quando
  // o usuário é eliminado ou vence o Champions Stage.
  const progressMajor = (clone: Tournament) => {
    const u = getTeam(clone, 'user');
    const stageNow = save.majorStage ?? 1;
    if (u && u.status === 'eliminated') {
      // eliminado: encerra na colocação alcançada (passar do Stage 3 = playoffs)
      const placement: PlacementCode = clone.stageOnly ? (stageNow >= 3 ? 'playoffs' : 'swiss') : placementCode(clone, 'user');
      concludeMajor(clone, placement);
      return;
    }
    if (clone.phase !== 'done') { setMajorState(clone); setHubTab('major'); setStage('hub'); return; }
    if (clone.stageOnly) {
      // stage encerrado e usuário classificado: monta o próximo stage (ou playoffs)
      const advancers = stageAdvancers(clone);
      if (stageNow < 3) {
        const seeds = stageNow === 1 ? (save.majorSeed2 ?? []) : (save.majorSeed3 ?? []);
        const next = createSwissStage([...advancers, ...seeds], rngRef.current, `${MAJOR_NAME(save.split)} · Stage ${stageNow + 1}`);
        setMajorState(next, { majorStage: stageNow + 1 });
      } else {
        const po = createPlayoffStage(advancers, `${MAJOR_NAME(save.split)} · Champions Stage`);
        setMajorState(po, { majorStage: 4 });
      }
      setHubTab('major');
      setStage('hub');
    } else {
      // Champions Stage encerrado com o usuário vivo => campeão
      concludeMajor(clone, placementCode(clone, 'user'));
    }
  };

  // abre o veto/partida da rodada do usuário no Major
  const playMajorMine = () => {
    if (!majorT) return;
    const up = tournamentUserPairing(majorT);
    if (!up) return;
    const a = syncUser(getTeam(majorT, up.a));
    const b = syncUser(getTeam(majorT, up.b));
    setMatchCtx({
      teams: [a, b],
      userIdx: up.a === 'user' ? 0 : 1,
      mode: 'major',
      bestOf: up.bestOf ?? 3,
      phaseLabel: `${majorT.name} · ${up.label}`,
    });
    setStage('veto');
  };

  // resolve a rodada do Major após a partida do usuário
  const finishMajorRound = (series?: SeriesResult) => {
    if (!majorT) return;
    const clone: Tournament = structuredClone(majorT);
    if (series) {
      const p = clone.pairings.find((x) => x.a === 'user' || x.b === 'user');
      if (p) p.result = series;
    }
    resolveRound(clone, rngRef.current);
    setMatchCtx(null);
    progressMajor(clone);
  };

  const advanceMajor = (clone: Tournament) => {
    progressMajor(clone);
  };
  // simula a rodada do Major; anima a partida do usuário quando ele tem jogo
  const simMajorRound = () => {
    if (!majorT) return;
    const up = tournamentUserPairing(majorT);
    if (!up) {
      const clone: Tournament = structuredClone(majorT);
      resolveRound(clone, rngRef.current);
      advanceMajor(clone);
      return;
    }
    const a = syncUser(getTeam(majorT, up.a));
    const b = syncUser(getTeam(majorT, up.b));
    const bo = up.bestOf ?? 3;
    rngRef.current = makeRng(randomSeed());
    const series = simulateSeries(rngRef.current, a, b, autoVeto([a, b], rngRef.current, bo), bo);
    setQuickSim({
      series, teams: [a, b], userIdx: up.a === 'user' ? 0 : 1,
      label: `${majorT.name} · ${up.label}`,
      onDone: () => {
        setQuickSim(null);
        const clone: Tournament = structuredClone(majorT);
        const p = clone.pairings.find((x) => x.a === 'user' || x.b === 'user');
        if (p) p.result = series;
        resolveRound(clone, rngRef.current);
        advanceMajor(clone);
      },
    });
  };

  // ---------- caches dos painéis (hooks precisam vir antes dos early-returns) ----------
  // stats da temporada, rankings e feed de transferências são caros de calcular;
  // memoizados aqui pra não recomputar a cada render do hub
  const seasonStatsMemo = useMemo(() => (save.league ? seasonPlayerStats(save.league) : []), [save.league]);
  const top20Memo = useMemo(
    () => {
      const mvps = seasonMvpCounts(currentEra, save.split);
      return currentEra
        .flatMap((t) => t.players.map((p): Top20Entry => ({
          p, team: t, role: p.role as Role,
          rating: playerSeasonRating(p, save.split),
          mvps: mvps.get(p.id) ?? 0,
          sl: hltvStatline(p, p.role as Role, save.split),
          points: hltvPointsAt(p, t, p.role as Role, save.split),
        })))
        .sort((a, b) => b.points - a.points)
        .slice(0, 20);
    },
    [currentEra, save.split],
  );
  // ranking de CARREIRA: maiores ratings acumulados (estatísticas que sobem com
  // a evolução). Inclui você e quem você enfrentou pelos circuitos.
  const careerTop20Memo = useMemo(() => {
    const cs = save.careerStats ?? {};
    const byId = new Map<string, Player>();
    for (const t of CS2_REAL_2026) for (const p of t.players) byId.set(p.id, p);
    for (const t of currentEra) for (const p of t.players) byId.set(p.id, p); // inclui transferidos/custom
    const teamById = new Map<string, TeamSeason>();
    for (const t of currentEra) for (const p of t.players) teamById.set(p.id, t);
    const rows: { rid: string; nick: string; country: string; role: Role; isMine: boolean; teamTag: string; rating: number; kd: number; adr: number; maps: number }[] = [];
    for (const [rid, line] of Object.entries(cs)) {
      const c = deriveCareer(line);
      if (!c || c.maps < 6) continue; // mínimo de mapas pra entrar no ranking
      const oid = rid.replace(/^user__/, '');
      const isMine = rid.startsWith('user__');
      const pl = byId.get(oid);
      if (!pl) continue;
      const team = teamById.get(oid);
      rows.push({
        rid, nick: pl.nick, country: pl.country, role: (save.roles?.[oid] ?? pl.role) as Role, isMine,
        teamTag: isMine ? (save.org?.tag ?? 'VC') : (team?.tag ?? '?'),
        rating: c.rating, kd: c.kd, adr: c.adr, maps: c.maps,
      });
    }
    return rows.sort((a, b) => b.rating - a.rating).slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.careerStats, save.roles, save.org, currentEra]);
  const feedMemo = useMemo(() => transferFeed(save.split, currentEra), [save.split, currentEra]);
  // propostas que CHEGAM pelos seus jogadores: clubes assediam seus melhores nomes.
  // Determinístico por split; some quem você já vendeu ou recusou.
  const incomingOffers = useMemo(() => {
    const sold = new Set([
      ...(save.pendingSales ?? []).map((x) => x.playerId),
      ...(save.rejectedOffers ?? []),
      ...(save.pendingDeals ?? []).flatMap((d) => d.outPlayerIds),
    ]);
    const buyers = currentEra.filter((t) => t.id !== save.takeoverId).sort((a, b) => b.teamwork - a.teamwork);
    if (!buyers.length) return [];
    const out: { playerId: string; nick: string; ovr: number; country: string; fee: number; toTag: string; toName: string }[] = [];
    for (const sig of save.squad) {
      if (sold.has(sig.playerId)) continue;
      const p = findSigning(sig)?.player;
      if (!p) continue;
      const ovr = playerOvr(p);
      if (ovr < 75) continue; // só os bons atraem proposta
      const h = hashStr(`offer:${save.split}:${p.id}`);
      // chance de proposta sobe com o OVR (estrela é mais assediada)
      const chance = Math.min(70, 18 + (ovr - 75) * 4);
      if (h % 100 >= chance) continue;
      const buyer = buyers[h % Math.min(14, buyers.length)];
      const fee = Math.round(playerValue(p) * (1.05 + (h % 35) / 100)); // 1.05x..1.39x do valor
      out.push({ playerId: p.id, nick: p.nick, ovr, country: p.country, fee, toTag: buyer.tag, toName: buyer.team });
    }
    return out;
  }, [save.squad, save.split, save.pendingSales, save.rejectedOffers, save.pendingDeals, currentEra, save.takeoverId]);
  const vrsByRegionMemo = useMemo(() => {
    // bandeira E região de cada time saem do CORE do elenco (o país do header da
    // base é furado). A org usa a região que escolheu competir (save.region).
    type Row = { id: string; name: string; tag: string; colors: [string, string]; logoUrl?: string; players: { country: string }[]; region: CareerRegion; vrs: number; isUser: boolean };
    const rows: Row[] = oppEra.map((t) => ({
      id: t.id, name: `${t.team}`, tag: t.tag, colors: t.colors, logoUrl: t.logoUrl ?? logoForTeam(t),
      players: t.players, region: teamRegion(t), vrs: aiTeamVrs(t), isUser: false,
    }));
    const ut = buildTeam(save);
    const orgPlayers = ut?.players ?? [];
    if (orgPlayers.length && save.org) {
      const reg = save.region ?? macroRegionPlurality(orgPlayers.map((p) => p.country));
      rows.push({ id: 'user', name: save.org.name, tag: save.org.tag, colors: save.org.colors, logoUrl: save.org.logo, players: orgPlayers, region: reg, vrs: userBaseVrsFor(ut?.teamwork ?? 78) + save.vrs, isUser: true });
    }
    const groups = new Map<CareerRegion, Row[]>();
    for (const r of rows) {
      if (!groups.has(r.region)) groups.set(r.region, []);
      groups.get(r.region)!.push(r);
    }
    return CAREER_REGION_ORDER.filter((k) => groups.has(k)).map((k) => ({
      key: k,
      label: CAREER_REGION_LABELS[k],
      // empate de VRS: desempata o usuário pra FRENTE, igual ao critério do
      // fim de temporada (worldRank conta só quem tem VRS estritamente maior).
      teams: groups.get(k)!.sort((a, b) => b.vrs - a.vrs || (a.isUser ? -1 : b.isUser ? 1 : 0)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, currentEra]);

  // ranking VRS GERAL (todos os times do mundo num ranking só)
  const vrsAllMemo = useMemo(
    () => vrsByRegionMemo.flatMap((g) => g.teams).sort((a, b) => b.vrs - a.vrs),
    [vrsByRegionMemo],
  );

  // overlay de simulação rápida (mini partida acelerada), sobrepõe qualquer tela
  if (quickSim) {
    return (
      <QuickSimOverlay
        series={quickSim.series}
        teams={quickSim.teams}
        userIdx={quickSim.userIdx}
        label={quickSim.label}
        onDone={quickSim.onDone}
      />
    );
  }

  // ---------- demitido pela diretoria ----------
  if (save.fired) {
    return (
      <div className="fade-in">
        <div className="panel" style={{ maxWidth: 520, margin: '40px auto' }}>
          <div className="panel-head">Fim de ciclo</div>
          <div className="panel-body center">
            <div className="trophy" style={{ fontSize: 44 }}>📉</div>
            <h2>A diretoria da {save.org?.name} te demitiu</h2>
            <p className="muted" style={{ maxWidth: 420, margin: '10px auto 16px' }}>
              Os resultados ficaram abaixo do esperado e a confiança da diretoria
              chegou ao fundo. Sua passagem termina aqui — mas toda lenda recomeça.
            </p>
            <button className="btn gold big" onClick={() => {
              const fresh = emptySave();
              persist(fresh);
              setSave(fresh);
              setOrgChoice('select');
              setStage('found');
            }}>Começar uma nova carreira</button>
            <div style={{ marginTop: 10 }}>
              <button className="btn ghost" onClick={onExit}>← Voltar ao início</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- fundação ----------
  if (stage === 'found') {
    const startFromOrg = (s: OrgStart) => {
      update({
        org: s.org, squad: s.squad, coachFromId: s.coachFromId, budget: s.budget,
        tier: s.tier, takeoverId: s.takeoverId, region: s.region,
        board: s.board ?? 60, scenario: s.scenario ?? null,
      });
      setStage('market');
    };
    if (orgChoice === 'fictional') {
      return <FoundOrg onExit={() => setOrgChoice('select')} onFound={(org) => {
        update({ org, takeoverId: null, scenario: null });
        setStage('market');
      }} />;
    }
    if (orgChoice === 'scenario') {
      return <ScenarioPicker current={currentEra} onBack={() => setOrgChoice('select')} onStart={startFromOrg} />;
    }
    return (
      <OrgSelect
        teams={currentEra}
        onExit={onExit}
        onFictional={() => setOrgChoice('fictional')}
        onScenarios={() => setOrgChoice('scenario')}
        onStart={startFromOrg}
      />
    );
  }

  // ---------- mercado ----------
  if (stage === 'market') {
    // contratos vencendo: FORÇA a tela de renovação antes do mercado, pra você
    // nunca perder jogador "do nada" — decide quem renova e quem libera.
    if (save.renewals && save.renewals.length > 0) {
      return (
        <RenewalScreen
          renewals={save.renewals}
          budget={save.budget}
          onConfirm={(renewIds) => {
            const keep = new Set(renewIds);
            let squad = [...save.squad];
            const contracts = { ...(save.contracts ?? {}) };
            const morale = { ...(save.morale ?? {}) };
            const peakOvr = { ...(save.peakOvr ?? {}) };
            const evo = { ...(save.evo ?? {}) };
            let budget = save.budget;
            const released: string[] = [];
            for (const r of save.renewals ?? []) {
              if (keep.has(r.playerId)) {
                contracts[r.playerId] = save.split + CONTRACT_TERM - 1; // renova: estende e paga 1 salário
                budget = Math.max(0, budget - r.wage);
              } else {
                squad = squad.filter((x) => x.playerId !== r.playerId); // libera de graça
                delete contracts[r.playerId]; delete morale[r.playerId]; delete peakOvr[r.playerId]; delete evo[r.playerId];
                released.push(r.nick);
              }
            }
            let next: CareerSave = { ...save, squad, contracts, morale, peakOvr, evo, budget, renewals: [] };
            if (released.length) {
              next = { ...next, ...pushNews(next, [{
                id: `${save.split}:rel`, split: save.split, icon: '👋', tone: 'info', cat: 'transfer',
                title: 'Saídas por fim de contrato',
                body: `Sem renovação, saíram do elenco: ${released.join(', ')}.`,
              }]) };
            }
            persist(next);
            setSave(next);
          }}
        />
      );
    }
    // proposta de uma org grande pendente: resolve ANTES do mercado (assim o
    // mercado já abre com o elenco certo e você repõe quem saiu)
    if (save.pendingOffer) {
      const off = save.pendingOffer;
      return (
        <OfferScreen
          offer={off}
          orgName={save.org?.name ?? 'sua org'}
          onAccept={() => {
            // vende: sai do elenco e entra a grana. Você fica com 4 e repõe no
            // mercado (a org compradora leva o jogador "de cena"; não forçamos
            // ele num 6º slot do roster dela pra não quebrar o time).
            const morale = { ...(save.morale ?? {}) };
            delete morale[off.playerId];
            const peakOvr = { ...(save.peakOvr ?? {}) };
            delete peakOvr[off.playerId];
            // zera a evolução acumulada: se voltar a contratá-lo, ele entra no OVR
            // de mercado (base), não com o declínio antigo grudado
            const evo = { ...(save.evo ?? {}) };
            delete evo[off.playerId];
            const next: CareerSave = {
              ...save,
              squad: save.squad.filter((s) => s.playerId !== off.playerId),
              budget: save.budget + off.fee,
              pendingOffer: null,
              morale,
              peakOvr,
              evo,
            };
            persist(next);
            setSave(next);
          }}
          onRefuse={() => {
            const next = { ...save, pendingOffer: null };
            persist(next);
            setSave(next);
          }}
        />
      );
    }
    return (
      <MarketScreen
        save={save}
        market={market}
        coaches={currentEra}
        findSigning={findSigning}
        onExit={onExit}
        onConfirm={(squad, coachFromId, budget, sponsors, sponsorUntil) => {
          // todo jogador do elenco fechado tem contrato; novos ganham CONTRACT_TERM
          const contracts = { ...(save.contracts ?? {}) };
          const ids = new Set(squad.map((x) => x.playerId));
          for (const sig of squad) {
            if (!(sig.playerId in contracts) || contracts[sig.playerId] < save.split) {
              contracts[sig.playerId] = save.split + CONTRACT_TERM - 1;
            }
          }
          for (const k of Object.keys(contracts)) if (!ids.has(k)) delete contracts[k];
          // poda chaves de quem saiu do elenco (não crescem pra sempre no save;
          // se voltar a contratar, começa com moral padrão de novo)
          const morale = { ...(save.morale ?? {}) };
          for (const k of Object.keys(morale)) if (!ids.has(k)) delete morale[k];
          const peakOvr = { ...(save.peakOvr ?? {}) };
          for (const k of Object.keys(peakOvr)) if (!ids.has(k)) delete peakOvr[k];
          // zera a evolução de quem saiu do elenco: ao recontratar, ele volta no
          // OVR de mercado (base), sem o declínio/ganho antigo grudado (KSCERATO).
          // Quem é dispensado e recontratado na MESMA janela (sem transação) é
          // mantido — continua sendo seu, então preserva a evolução.
          const evo = { ...(save.evo ?? {}) };
          for (const k of Object.keys(evo)) if (!ids.has(k)) delete evo[k];
          // org do zero (sem região ainda): define a região pelo core do 1º elenco
          const region = save.region ?? macroRegionPlurality(squad.map((s) => findSigning(s)?.player.country ?? '').filter(Boolean));
          const next = { ...save, squad, coachFromId, budget, sponsors, sponsorUntil, contracts, morale, peakOvr, evo, region };
          persist(next);
          setSave(next);
          setStage('circuit');
        }}
      />
    );
  }

  // ---------- escolha do campeonato (qual convite aceitar) ----------
  if (stage === 'circuit') {
    // core do elenco mudou de região? oferece realocar a org (muda bandeira/região)
    const orgPlayers = buildTeam(save)?.players ?? [];
    const coreReg = orgPlayers.length ? macroRegionPlurality(orgPlayers.map((p) => p.country)) : undefined;
    const relocate = save.region && coreReg && coreReg !== save.region ? { from: save.region, to: coreReg } : null;
    return (
      <CircuitPicker
        circuits={circuits}
        split={save.split}
        playerTier={save.tier}
        relocate={relocate}
        onRelocate={() => coreReg && update({ region: coreReg })}
        onBack={() => setStage('market')}
        onPick={(c) => startSplit(save, c)}
      />
    );
  }

  const league = save.league;

  // ---------- resultado do Major ----------
  if (stage === 'major' && majorResult) {
    const mr = majorResult;
    // o Major fecha a temporada (sempre cai num split de Major): entrega aqui a
    // premiação do Top 20 HLTV do ano
    const seasonNo = seasonOf(save.split);
    const mySquadOidsM = new Set(save.squad.map((s) => s.playerId));
    const seasonTop3 = seasonTopPlayersYear(currentEra, save.split, 3);
    const seasonTop20 = seasonTopPlayersYear(currentEra, save.split, 20);
    const PLACE_PT: Record<PlacementCode, string> = {
      champion: 'CAMPEÃO DO MAJOR',
      runnerup: 'VICE-CAMPEÃO',
      semi: 'SEMIFINAL',
      quarters: 'QUARTAS DE FINAL',
      playoffs: 'FASE DE PLAYOFFS',
      swiss: 'FASE SUÍÇA',
    };
    return (
      <div className="fade-in">
        <div className="panel" style={{ maxWidth: 720, margin: '24px auto' }}>
          <div className="panel-head">Major Mundial - resultado</div>
          <div className="panel-body center">
            <div className="trophy">{mr.champion ? '🏆' : mr.placement === 'runnerup' ? '🥈' : '★'}</div>
            <h2>{save.org?.name}: {PLACE_PT[mr.placement]}</h2>
            <div className="prize-banner">
              Premiação: <b>+{formatMoney(mr.prize)}</b> · VRS: <b>+{mr.vrs} pts</b>
              {mr.champion ? ' · +1 título!' : ''}
            </div>
            <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
              {mr.champion
                ? 'Sua organização é CAMPEÃ MUNDIAL! O nome entrou para a história do CS.'
                : 'Sua org representou o circuito no Major mundial. Volte mais forte no próximo split.'}
            </p>

            {/* o Major encerra a temporada: aqui sai a premiação do Top 20 HLTV do ano */}
            <div className="se-awards">
              <div className="se-award">
                <div className="se-award-title">Top 3 HLTV da temporada</div>
                <div className="se-top3">
                  {seasonTop3.map((e, i) => {
                    const tag = mySquadOidsM.has(e.p.id) ? (save.org?.tag ?? 'VOCÊ') : e.team.tag;
                    return (
                      <div key={e.p.id} className="se-top3-row">
                        <span className="t20-rank">{i + 1}</span>
                        <span className="bp-nick"><Flag cc={e.p.country} /> {e.p.nick} <span className="muted small">{tag}</span></span>
                        <span className="t20-rating">{e.rating.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <button className="btn gold big ceremony-cta" onClick={() => setShowCeremony(true)}>
              🏆 Cerimônia do Top 20 HLTV — Temporada {seasonNo}
            </button>

            <button
              className="btn gold big"
              onClick={() => {
                const rec = pendingSplit.current;
                const finished: SplitRecord = rec
                  ? { ...rec, major: { placement: mr.placement, champion: mr.champion } }
                  : {
                      split: save.split, circuit: save.circuit?.name ?? 'Major', position: 0,
                      wins: 0, losses: 0, roundDiff: 0, prize: 0, vrs: 0, champion: false,
                      major: { placement: mr.placement, champion: mr.champion },
                    };
                pendingSplit.current = null;
                setMajorT(null);
                // chegar ao Major já cumpriu o objetivo da diretoria do split;
                // ganhar o Major dá um respeito extra
                const majObj = save.objective;
                const majBonus = majObj ? majObj.bonus + (mr.champion ? 400_000 : 0) : 0;
                const majBoard = Math.min(100, save.board + (mr.champion ? 18 : 12));
                const renewals = dueRenewals(save, save.split + 1);
                // evolui só quem FICOU (pós-fim de contrato): quem saiu não carrega
                // a evolução/declínio acumulado pra uma futura recontratação
                const evo = evolveSquad(save);
                // moral: usa a forma do time no Major (atualizada série a série)
                const uTeam = save.majorT ? getTeam(save.majorT, 'user') : null;
                const nickByOid: Record<string, string> = {};
                for (const p of uTeam?.players ?? []) nickByOid[p.id.startsWith('user__') ? p.id.slice('user__'.length) : p.id] = p.nick;
                const squadInfo = save.squad.map((sg) => {
                  const rp = uTeam?.players.find((p) => p.id === `user__${sg.playerId}`);
                  const until = save.contracts?.[sg.playerId];
                  return { oid: sg.playerId, form: rp?.form ?? 1, expiring: until != null && until - save.split <= 1 };
                });
                const morale = nextMorale(save.morale ?? {}, squadInfo, { champion: mr.champion, objMet: true });
                const peakOvr = { ...(save.peakOvr ?? {}) };
                for (const sg of save.squad) { const f = findSigning(sg); if (f) peakOvr[sg.playerId] = Math.max(peakOvr[sg.playerId] ?? 0, playerOvr(f.player)); }
                const items = splitNews({
                  split: save.split, org: save.org?.name ?? 'Sua org', champion: false,
                  circuit: save.circuit?.name ?? 'circuito', objMet: true, objText: majObj?.text,
                  tierChange: null, releases: [], offer: null,
                  risers: (evo.lastEvo ?? []).filter((e) => e.delta >= 2).map((e) => e.nick),
                  sliders: (evo.lastEvo ?? []).filter((e) => e.delta <= -2).map((e) => e.nick),
                  unhappy: squadInfo.filter((si) => (morale[si.oid] ?? MORALE_DEFAULT) < 32).map((si) => nickByOid[si.oid] ?? si.oid),
                  major: { placement: mr.placement, champion: mr.champion },
                });
                const next = {
                  ...save,
                  budget: Math.max(0, save.budget + mr.prize - payroll + effSponsorIncome(save) + majBonus),
                  vrs: Math.round(save.vrs * VRS_DECAY) + mr.vrs, // VRS rolante (decai e soma o do Major)
                  titles: save.titles + (mr.champion ? 1 : 0),
                  split: save.split + 1,
                  majorT: null, // o Major acabou: não persiste o bracket finalizado
                  majorStage: undefined, majorUserStage: undefined,
                  majorSeed2: undefined, majorSeed3: undefined, majorPre: undefined,
                  league: null,
                  circuit: null,
                  playoff: null,
                  history: [...save.history, finished],
                  academy: evolveAcademy(save),
                  scenario: applyScenarioProgress(save.scenario, {
                    // resultado real do circuito deste split vem do pendingSplit (rec),
                    // pra creditar winCircuit/top4 mesmo num split que vai pro Major
                    isChampion: rec?.champion ?? false,
                    circuitTier: save.circuit?.tier ?? save.tier,
                    finalPos: rec?.position ?? 99,
                    qualified: true, endTier: save.tier, wonMajor: mr.champion,
                  }),
                  ...evo,
                  ...applyTransferWindow(save),
                  pendingOffer: null, // vindo do Major (tier 1): ninguém te assedia "pra cima"
                  board: majBoard,
                  lastObjective: majObj ? { text: majObj.text, met: true, delta: majBoard - save.board } : null,
                  objective: null,
                  renewals,
                  morale,
                  peakOvr,
                  mapTraining: applyMapTraining(save),
                  playbookXp: Math.min(100, (save.playbookXp ?? 0) + PLAYBOOK_FAM_GAIN),
                  ...pushNews(save, [...items, ...worldNews(oppEra, save.split, save.region ?? 'americas'), ...socialNews(oppEra, save.split, save.org?.name ?? 'Sua org', mr.champion)]),
                };
                const fin = consummateDeals(next);
                persist(fin);
                setSave(fin);
                setMajorResult(null);
                setStage('market');
              }}
            >
              Pagar folha ({formatMoney(payroll)}) e ir pro Split {save.split + 1}
            </button>
          </div>
        </div>
        {showCeremony && (
          <Top20Ceremony entries={seasonTop20} mine={mySquadOidsM} orgTag={save.org?.tag ?? 'VOCÊ'} split={save.split} circuit={save.circuit?.name ?? 'Temporada'} onClose={() => setShowCeremony(false)} />
        )}
      </div>
    );
  }

  // ---------- fim de temporada (split) ----------
  if (stage === 'seasonEnd' && league) {
    const table = leagueTable(league);
    const me = leagueTeam(league, 'user');
    // posição final do usuário: no GSL vem da colocação no grupo (3º grupo ≈ 5º
    // geral, 4º ≈ 7º) ou do resultado do playoff se classificou (top 2 do grupo);
    // no formato antigo (pontos corridos) é a posição na tabela.
    const pos = league.gsl
      ? (() => {
          const gp = league.gsl.place['user'] ?? 4;
          if (gp <= 2) { const pr = poUserRank(save.playoff); return pr === 99 ? 4 : pr; }
          return gp === 3 ? 5 : 7;
        })()
      : table.findIndex((t) => t.id === 'user') + 1;
    // premiações e destaques da temporada
    const seStats = seasonPlayerStats(league);
    const circuitMvp = seStats[0];
    const mySquadIdsSE = new Set((buildTeam(save)?.players ?? []).map((p) => p.id));
    const myStar = seStats.find((s) => mySquadIdsSE.has(s.id));
    const seasonEndsNow = isMajorSplit(save.split); // a temporada (ano) só fecha no split de Major
    const seasonNo = seasonOf(save.split);
    const seasonTop3 = seasonTopPlayersYear(currentEra, save.split, 3);
    const seasonTop20 = seasonTopPlayersYear(currentEra, save.split, 20);
    const mySquadOids = new Set(save.squad.map((s) => s.playerId)); // ids do seu elenco (relabel HLTV)
    const nextFeed = feedMemo;
    // o título e as vagas no Major saem do PLAYOFF (mata-mata), não da fase de pontos
    const poRank = poUserRank(save.playoff);
    const isChampion = save.playoff?.champion === 'user';
    // bônus de mata-mata: campeão +60%, vice +25%
    const poMult = isChampion ? 1.6 : poRank === 2 ? 1.25 : 1;
    const prize = Math.round((PRIZE_BY_POS[pos - 1] ?? 50_000) * (save.circuit?.prizeMult ?? 1) * poMult);
    // ganho de VRS ponderado pelo Opponent Network do evento: ir longe num campo
    // forte vale muito; ganhar um campeonato fraco rende quase nada no mundial.
    const vrsGain = Math.round((VRS_BY_POS[pos - 1] ?? 10) * (save.circuit?.vrsWeight ?? 0.4) * poMult);
    // CLASSIFICAÇÃO AO MAJOR = TOP 16 DO RANKING VRS MUNDIAL (como na vida real).
    // Some VRS vencendo partidas e indo longe; sua posição é base do elenco + ganhos.
    // Projeta o VRS já com o ganho DESTE split pra decidir a vaga no fim da temporada.
    const userProjVrs = userBaseVrsFor(buildTeam(save)?.teamwork ?? 78) + save.vrs + vrsGain;
    const worldRank = oppEra.filter((t) => aiTeamVrs(t) > userProjVrs).length + 1; // posição mundial projetada
    const rankQualified = worldRank <= MAJOR_VRS_CUT;
    const majorNow = isMajorSplit(save.split);
    const qualified = rankQualified && majorNow;
    const nextMajorSplit = save.split + (MAJOR_EVERY - (save.split % MAJOR_EVERY));

    // promoção/rebaixamento: só conta se você jogou no SEU tier (não farmando abaixo).
    // CHEGAR NA FINAL (campeão OU vice) promove — não precisa mais SÓ vencer; bater
    // final em todo campeonato e perder pra um top não pode te travar. Fundo da tabela cai.
    const finalPos = save.playoff ? Math.min(pos, poRank) : pos;
    const reachedFinal = finalPos <= 2;
    const circuitTier = save.circuit?.tier ?? save.tier;
    const fieldSize = league.teams.length;
    const tierResult: { tier: number; tierChange: 'up' | 'down' | null } = (() => {
      if (circuitTier !== save.tier) return { tier: save.tier, tierChange: null };
      if (reachedFinal) return { tier: Math.max(1, save.tier - 1), tierChange: save.tier > 1 ? 'up' : null };
      if (finalPos >= fieldSize - 1) return { tier: Math.min(3, save.tier + 1), tierChange: save.tier < 3 ? 'down' : null };
      return { tier: save.tier, tierChange: null };
    })();

    // avaliação do objetivo da diretoria deste split
    const obj = save.objective ?? null;
    const objMet = !obj ? true
      : obj.type === 'major' ? qualified
      : obj.type === 'win' ? isChampion
      : obj.type === 'top4' ? finalPos <= 4
      : obj.type === 'promote' ? tierResult.tierChange === 'up'
      : tierResult.tierChange !== 'down'; // noRelegation
    const boardDelta = obj ? (objMet ? 12 : -18) : 0;
    // deriva leve rumo ao neutro (só quando há objetivo avaliado), espelhando a
    // reversão à média da moral: falhar ainda dói (-18), mas um técnico em apuros
    // consegue subir de volta com um acerto em vez de ficar grudado na demissão.
    const drifted = obj ? save.board + (50 - save.board) * 0.1 : save.board;
    const newBoard = Math.max(0, Math.min(100, drifted + boardDelta));
    const objBonus = obj && objMet ? obj.bonus : 0;
    const fired = !!obj && newBoard <= 12; // confiança no chão -> demitido
    const boardPatch = {
      board: newBoard,
      lastObjective: obj ? { text: obj.text, met: objMet, delta: boardDelta } : null,
      objective: null,
      fired,
    };

    const baseRecord = (): SplitRecord => ({
      split: save.split,
      circuit: save.circuit?.name ?? league.name,
      position: save.playoff ? Math.min(pos, poRank) : pos,
      wins: me.wins,
      losses: me.losses,
      roundDiff: me.roundDiff,
      prize,
      vrs: vrsGain,
      champion: isChampion,
    });
    return (
      <div className="fade-in">
        <div className="panel" style={{ maxWidth: 760, margin: '24px auto' }}>
          <div className="panel-head">
            {league.name} - split encerrado
            <span className="spacer" />
            <button className="btn" onClick={onExit}>← Sair</button>
          </div>
          <div className="panel-body center">
            <div className="trophy">{isChampion ? '🏆' : poRank === 2 ? '🥈' : poRank === 3 ? '🥉' : pos <= 3 ? '🥉' : '★'}</div>
            <h2>
              {isChampion
                ? `${save.org?.name} é CAMPEÃO do ${save.circuit?.name ?? 'circuito'}!`
                : poRank === 2
                  ? `${save.org?.name}: vice-campeão (perdeu a final)`
                  : poRank === 3
                    ? `${save.org?.name} caiu na semifinal`
                    : `${save.org?.name} terminou em ${pos}º na fase de pontos`}
            </h2>
            <div className="prize-banner">
              Premiação: <b>+{formatMoney(prize)}</b> · VRS: <b>+{vrsGain} pts</b> · Folha:{' '}
              <b className="neg">-{formatMoney(payroll)}</b>
            </div>
            {obj && (
              <div className={`tier-banner ${objMet ? 'up' : 'down'}`}>
                {objMet ? '✅' : '❌'} Objetivo da diretoria ({obj.text}): <b>{objMet ? 'CUMPRIDO' : 'falhou'}</b>
                {' · '}confiança {boardDelta >= 0 ? '+' : ''}{boardDelta}% → {Math.round(newBoard)}%
                {objMet && objBonus > 0 ? ` · bônus +${formatMoney(objBonus)}` : ''}
                {fired ? ' · VOCÊ FOI DEMITIDO' : ''}
              </div>
            )}
            {tierResult.tierChange === 'up' && (
              <div className="tier-banner up">⬆ PROMOVIDO ao {TIER_NAMES[tierResult.tier]}! Você venceu no seu nível e subiu de tier.</div>
            )}
            {tierResult.tierChange === 'down' && (
              <div className="tier-banner down">⬇ Rebaixado ao {TIER_NAMES[tierResult.tier]}. Terminou no fundo da tabela; recupere o nível no próximo split.</div>
            )}
            {qualified ? (
              <div className="qualify-banner">
                <b>CLASSIFICADO PRO MAJOR MUNDIAL!</b> Você está em <b>#{worldRank}</b> no ranking VRS mundial
                {' '}(top {MAJOR_VRS_CUT} garantem vaga). Hora de enfrentar os melhores do mundo.
              </div>
            ) : rankQualified && !majorNow ? (
              <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
                Você está <b>dentro do top {MAJOR_VRS_CUT} do VRS mundial</b> (#{worldRank}) — vaga no Major encaminhada!
                O Major acontece a cada <b>{MAJOR_EVERY} splits</b>; o próximo é no fim do <b>Split {nextMajorSplit}</b>. Mantenha o nível.
              </p>
            ) : (
              <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
                A vaga no Major é dos <b>top {MAJOR_VRS_CUT} do ranking VRS mundial</b> (você está em <b>#{worldRank}</b>).
                Ganhe VRS <b>vencendo partidas, indo longe e levando campeonatos</b> pra subir no ranking. Major a cada {MAJOR_EVERY} splits (próximo: Split {majorNow ? save.split : nextMajorSplit}).
              </p>
            )}
            {save.playoff && <PlayoffBracket p={save.playoff} teamOf={(id) => leagueTeam(league, id)} onOpen={(s, ts) => setSelSeries({ series: s, teams: ts })} />}

            {/* premiações e destaques da temporada */}
            <div className="se-awards">
              {circuitMvp && (
                <div className="se-award">
                  <div className="se-award-title">MVP do circuito</div>
                  <PlayerAvatar nick={circuitMvp.nick} size={40} />
                  <div className="se-award-name"><Flag cc={circuitMvp.country} /> {circuitMvp.nick}</div>
                  <div className="muted small">{circuitMvp.teamTag} · rating {circuitMvp.rating.toFixed(2)}</div>
                </div>
              )}
              {myStar && (
                <div className="se-award">
                  <div className="se-award-title">Destaque do seu time</div>
                  <PlayerAvatar nick={myStar.nick} size={40} />
                  <div className="se-award-name"><Flag cc={myStar.country} /> {myStar.nick}</div>
                  <div className="muted small">rating {myStar.rating.toFixed(2)} · {myStar.kd.toFixed(2)} K/D</div>
                </div>
              )}
              {seasonEndsNow && (
                <div className="se-award">
                  <div className="se-award-title">Top 3 HLTV da temporada</div>
                  <div className="se-top3">
                    {seasonTop3.map((e, i) => {
                      const tag = mySquadOids.has(e.p.id) ? (save.org?.tag ?? 'VOCÊ') : e.team.tag;
                      return (
                        <div key={e.p.id} className="se-top3-row">
                          <span className="t20-rank">{i + 1}</span>
                          <span className="bp-nick"><Flag cc={e.p.country} /> {e.p.nick} <span className="muted small">{tag}</span></span>
                          <span className="t20-rating">{e.rating.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* premiação HLTV: prêmio de FIM DE TEMPORADA (a cada MAJOR_EVERY campeonatos),
                não depois de um único campeonato */}
            {seasonEndsNow ? (
              <button className="btn gold big ceremony-cta" onClick={() => setShowCeremony(true)}>
                🏆 Cerimônia do Top 20 HLTV — Temporada {seasonNo}
              </button>
            ) : (
              <div className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
                🏆 A <b>Premiação do Top 20 HLTV</b> fecha a temporada (a cada {MAJOR_EVERY} campeonatos) —
                a próxima é no <b>Split {nextMajorSplit}</b>. Ainda não acabou a temporada.
              </div>
            )}

            {/* prévia da próxima janela de transferências */}
            <div className="muted small section-label">Rumores para a próxima janela</div>
            <TransferFeed items={nextFeed} compact />

            <CareerTable table={table} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
              {qualified && (
                <button
                  className="btn gold big"
                  onClick={() => {
                    // aplica prêmio+VRS do split antes de ir pro Major;
                    // o registro do split é finalizado após o resultado do Major
                    pendingSplit.current = baseRecord();
                    const next = {
                      ...save,
                      budget: save.budget + prize,
                      vrs: save.vrs + vrsGain,
                      titles: save.titles + (isChampion ? 1 : 0),
                      // acumula as stats da liga já aqui (o split do Major fecha
                      // depois, mas a liga regular terminou); evita perder o split
                      ...bankStats(save),
                    };
                    persist(next);
                    setSave(next);
                    playMajor(next);
                  }}
                >
                  Disputar o Major Mundial
                </button>
              )}
              <button
                className={qualified ? 'btn ghost big' : 'btn gold big'}
                onClick={() => {
                  const renewals = dueRenewals(save, save.split + 1);
                  // evolui só quem FICOU (pós-fim de contrato): quem saiu não carrega
                  // a evolução/declínio acumulado pra uma futura recontratação
                  const evo = evolveSquad(save);
                  const offer = makeOffer(save, tierResult.tier);
                  // moral por jogador (forma no fim do split + resultado coletivo)
                  const nickByOid: Record<string, string> = {};
                  for (const p of me.players) nickByOid[p.id.startsWith('user__') ? p.id.slice('user__'.length) : p.id] = p.nick;
                  const squadInfo = save.squad.map((sg) => {
                    const rp = me.players.find((p) => p.id === `user__${sg.playerId}`);
                    const until = save.contracts?.[sg.playerId];
                    return { oid: sg.playerId, form: rp?.form ?? 1, expiring: until != null && until - save.split <= 1 };
                  });
                  const morale = nextMorale(save.morale ?? {}, squadInfo, { champion: isChampion, objMet });
                  const peakOvr = { ...(save.peakOvr ?? {}) };
                  for (const sg of save.squad) { const f = findSigning(sg); if (f) peakOvr[sg.playerId] = Math.max(peakOvr[sg.playerId] ?? 0, playerOvr(f.player)); }
                  const items = splitNews({
                    split: save.split, org: save.org?.name ?? 'Sua org', champion: isChampion,
                    circuit: save.circuit?.name ?? 'circuito', objMet, objText: obj?.text,
                    tierChange: tierResult.tierChange, tierName: TIER_NAMES[tierResult.tier],
                    releases: [], offer,
                    risers: (evo.lastEvo ?? []).filter((e) => e.delta >= 2).map((e) => e.nick),
                    sliders: (evo.lastEvo ?? []).filter((e) => e.delta <= -2).map((e) => e.nick),
                    unhappy: squadInfo.filter((si) => (morale[si.oid] ?? MORALE_DEFAULT) < 32).map((si) => nickByOid[si.oid] ?? si.oid),
                  });
                  const next = {
                    ...save,
                    // piso em 0: estourar a folha esvazia o caixa, mas nunca trava
                    // a carreira com saldo negativo (impossível montar 5)
                    budget: Math.max(0, save.budget + prize - payroll + effSponsorIncome(save) + objBonus),
                    vrs: Math.round(save.vrs * VRS_DECAY) + vrsGain, // VRS rolante (decai e soma o ganho do split)
                    titles: save.titles + (isChampion ? 1 : 0),
                    split: save.split + 1,
                    league: null,
                    circuit: null,
                    playoff: null,
                    history: [...save.history, baseRecord()],
                    academy: evolveAcademy(save),
                    scenario: applyScenarioProgress(save.scenario, {
                      isChampion, circuitTier, finalPos, qualified, endTier: tierResult.tier, wonMajor: false,
                    }),
                    ...bankStats(save),
                    ...evo,
                    ...applyTransferWindow(save),
                    ...boardPatch,
                    tier: tierResult.tier,
                    tierChange: tierResult.tierChange,
                    pendingOffer: offer,
                    renewals,
                    morale,
                    peakOvr,
                    mapTraining: applyMapTraining(save),
                    playbookXp: Math.min(100, (save.playbookXp ?? 0) + PLAYBOOK_FAM_GAIN),
                    ...pushNews(save, [...items, ...worldNews(oppEra, save.split, save.region ?? 'americas'), ...socialNews(oppEra, save.split, save.org?.name ?? 'Sua org', isChampion)]),
                  };
                  const fin = consummateDeals(next);
                  persist(fin);
                  setSave(fin);
                  setStage('market'); // se foi demitido, o render mostra a tela de demissão
                }}
              >
                Pagar folha e ir pro Split {save.split + 1}
              </button>
            </div>
          </div>
        </div>
        {selSeries && (
          <div className="modal-backdrop" onClick={() => setSelSeries(null)}>
            <div className="modal scoreboard-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-x" onClick={() => setSelSeries(null)}>✕</button>
              <Scoreboard series={selSeries.series} teams={selSeries.teams} />
            </div>
          </div>
        )}
        {showCeremony && (
          <Top20Ceremony entries={seasonTop20} mine={new Set(save.squad.map((s) => s.playerId))} orgTag={save.org?.tag ?? 'VOCÊ'} split={save.split} circuit={save.circuit?.name ?? 'temporada'} onClose={() => setShowCeremony(false)} />
        )}
      </div>
    );
  }

  // ---------- veto / partida (liga OU Major, ao vivo) ----------
  if ((stage === 'veto' || stage === 'match') && matchCtx) {
    const finish = (series: SeriesResult) =>
      matchCtx.mode === 'major'
        ? finishMajorRound(series)
        : matchCtx.mode === 'playoff'
          ? finishPlayoffRound(series)
          : league && finishUserRound(league, series);
    if (stage === 'veto') {
      return (
        <VetoScreen
          teams={matchCtx.teams}
          userIdx={matchCtx.userIdx}
          rng={() => rngRef.current()}
          phaseLabel={matchCtx.phaseLabel}
          bestOf={matchCtx.bestOf}
          onDone={(maps) => {
            setMatchCtx({ ...matchCtx, maps });
            setStage('match');
          }}
        />
      );
    }
    return (
      <MatchScreen
        teams={matchCtx.teams}
        maps={matchCtx.maps!}
        userIdx={matchCtx.userIdx}
        rng={() => rngRef.current()}
        phaseLabel={matchCtx.phaseLabel}
        bestOf={matchCtx.bestOf}
        onFinish={finish}
      />
    );
  }

  // ---------- playoffs do circuito (mata-mata com bracket) ----------
  if (stage === 'playoffHub' && save.playoff && league) {
    const p = save.playoff;
    const teamOf = (id: string) => leagueTeam(league, id);
    const userMatch = poUserMatch(p);
    const userRoundLabel = !userMatch ? '' : p.final === userMatch ? 'a final' : (p.qf?.includes(userMatch) ? 'minha quarta' : 'minha semi');
    return (
      <div className="career-major-live">
        <div className="major-live-bar">
          <b>PLAYOFFS</b> · {p.circuit} · Split {save.split}
          <span className="spacer" />
          {userMatch ? (
            <>
              <button className="btn ghost" onClick={simPlayoffMine}>⏩ Simular</button>
              <button className="btn gold" onClick={playPlayoffMine}>▶ Jogar {userRoundLabel}</button>
            </>
          ) : p.champion ? (
            <button className="btn gold" onClick={() => setStage('seasonEnd')}>Ver resultado do split →</button>
          ) : null}
        </div>
        <PlayoffBracket p={p} teamOf={teamOf} onOpen={(s, ts) => setSelSeries({ series: s, teams: ts })} />
        {selSeries && (
          <div className="modal-backdrop" onClick={() => setSelSeries(null)}>
            <div className="modal scoreboard-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-x" onClick={() => setSelSeries(null)}>✕</button>
              <Scoreboard series={selSeries.series} teams={selSeries.teams} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- hub da liga ----------
  // sem liga ativa o stage inicial já cai em 'market' (janela de
  // transferências entre splits); esta guarda evita render sem liga
  if (!league) return null;
  const table = leagueTable(league);
  const myMatch = userLeagueMatch(league);
  const playMine = () => {
    if (!myMatch) return;
    rngRef.current = makeRng(randomSeed());
    const a = syncUser(leagueTeam(league, myMatch.a));
    const b = syncUser(leagueTeam(league, myMatch.b));
    setMatchCtx({
      teams: [a, b],
      userIdx: myMatch.a === 'user' ? 0 : 1,
      mode: 'league',
      bestOf: myMatch.bo ?? LEAGUE_BO, // GSL: abertura Bo1, resto Bo3
      phaseLabel: `${league.name} · ${league.gsl ? GSL_ROUND_LABELS[league.current] : `Rodada ${league.current + 1}`}`,
    });
    setStage('veto');
  };

  const myPos = userPosition(league);
  const spots = save.circuit?.spots ?? MAJOR_SPOTS;
  const form = clubForm(league);
  const opp = myMatch ? leagueTeam(league, myMatch.a === 'user' ? myMatch.b : myMatch.a) : null;
  const oppPos = opp ? table.findIndex((t) => t.id === opp.id) + 1 : 0;
  const me = syncUser(leagueTeam(league, 'user'));
  const seasonStats = seasonStatsMemo;
  const mySquadIds = new Set((buildTeam(save)?.players ?? []).map((p) => p.id));
  const mySquadOids = new Set(save.squad.map((s) => s.playerId)); // ids ORIGINAIS (relabel HLTV pra sua org)
  const org = aggregateHistory(save.history);

  const majorActive = !!majorT && majorT.phase !== 'done';
  // contratos vencendo (≤1 split p/ acabar): no mobile a aba Finanças some no
  // overflow horizontal e o usuário perdia jogadores de graça sem ver. Calculado
  // aqui pra chamar atenção no overview (aba inicial) e badge na aba Finanças.
  const expiringContracts = save.squad
    .map((s) => ({ sig: s, f: findSigning(s) }))
    .filter((x) => x.f)
    .map((x) => ({
      nick: (x.f as { player: Player }).player.nick,
      left: save.contracts?.[x.sig.playerId] != null ? save.contracts![x.sig.playerId] - save.split + 1 : 0,
    }))
    .filter((w) => w.left <= 1);
  const expiringCount = expiringContracts.length;

  const unread = save.unread ?? 0;
  // navegação em 2 níveis: grupos no topo + sub-abas do grupo ativo. Reduz a
  // confusão de 15 abas planas pra ~5 grupos com 1-5 itens cada.
  const TAB_LABEL: Record<HubTab, string> = {
    overview: 'Visão geral', major: '★ Major', calendar: 'Calendário', results: 'Resultados',
    standings: 'Classificação', bracket: 'Chave', squad: 'Elenco', academy: 'Academia',
    market: 'Negociações', finance: 'Finanças', vrs: 'Ranking VRS', top20: 'Top 20 HLTV',
    world: 'Cena mundial', inbox: 'Inbox', history: 'História da org',
  };
  const HUB_GROUPS: { id: string; label: string; tabs: HubTab[] }[] = [
    { id: 'inicio', label: '🏠 Início', tabs: ['overview'] },
    { id: 'comp', label: '🏆 Competição', tabs: [...(majorActive ? ['major' as HubTab] : []), 'calendar', 'bracket', 'results', 'standings'] },
    { id: 'time', label: '👥 Meu time', tabs: ['squad', 'academy', 'market', 'finance'] },
    { id: 'mundo', label: '🌐 Mundo', tabs: ['vrs', 'top20', 'world'] },
    { id: 'org', label: '📨 Organização', tabs: ['inbox', 'history'] },
  ];
  const tabAlert = (id: HubTab) => (id === 'finance' && expiringCount > 0) || (id === 'inbox' && unread > 0);
  const tabLabelFull = (id: HubTab) =>
    id === 'inbox' && unread > 0 ? `Inbox (${unread})`
    : id === 'finance' && expiringCount > 0 ? `Finanças ⚠️${expiringCount}`
    : TAB_LABEL[id];
  const activeGroup = HUB_GROUPS.find((g) => g.tabs.includes(hubTab)) ?? HUB_GROUPS[0];

  const vrsByRegion = vrsByRegionMemo;
  const vrsAll = vrsAllMemo;
  const myVrsRank = vrsAll.findIndex((t) => t.isUser) + 1; // posição global (0 = sem time)

  const top20 = top20Memo;
  const careerTop20 = careerTop20Memo;

  return (
    <div className="fade-in career-hub">
      {/* barra do clube (estilo hub do FIFA) */}
      <div className="career-topbar">
        <TeamBadge tag={save.org?.tag ?? ''} colors={save.org?.colors ?? ['#101820', '#61a8dd']} size={46} logoUrl={save.org?.logo} />
        <div className="ct-id">
          <div className="ct-name">
            {(buildTeam(save)?.players?.length ?? 0) > 0 && <OrgFlag players={buildTeam(save)!.players} title="Nacionalidade do core" />}
            {save.org?.name}
            <span className={`tier-badge t${save.tier}`}>TIER {save.tier}</span>
          </div>
          <div className="ct-sub">{save.circuit?.name ?? 'CIRCUIT X'} · Split {save.split}{save.region ? ` · ${MACRO_REGION_LABELS[save.region]}` : ''}</div>
          {save.sponsors.length > 0 && (
            <div className="ct-sponsors">
              {save.sponsors.map((id) => {
                const sp = sponsorById(id);
                return sp ? <span key={id} className="ct-sp" style={{ background: sp.color }} title={`${sp.name} · +${formatMoney(sp.perSplit)}/split`}>{sp.name}</span> : null;
              })}
            </div>
          )}
        </div>
        <div className="ct-standing">
          <span className="muted small">POSIÇÃO</span>
          <b className={myPos <= spots ? 'pos' : ''}>{myPos}º</b>
        </div>
        <div className="ct-form">
          <span className="muted small">FORMA</span>
          <span className="form-chips">
            {form.length ? form.slice(-5).map((f, i) => <i key={i} className={`fchip ${f === 'W' ? 'w' : 'l'}`}>{f}</i>) : <i className="muted small">-</i>}
          </span>
        </div>
        <span className="spacer" />
        <div className="ct-stats">
          <span title="Caixa do clube"><i className="muted small">CAIXA</i> {formatMoney(save.budget)}</span>
          <span title="Folha salarial por split"><i className="muted small">FOLHA</i> {formatMoney(payroll)}</span>
          <span title="Pontos de ranking (VRS)"><i className="muted small">VRS</i> {save.vrs}</span>
          <span title="Títulos"><i className="muted small">TÍTULOS</i> {save.titles}</span>
          <span title="Prestígio da org: cresce com títulos, Major, tier e VRS; atrai mais patrocínio"><i className="muted small">PRESTÍGIO</i> ★{careerPrestige(save)}</span>
          <span title="Torcida da organização"><i className="muted small">FÃS</i> {formatFans(careerFans(save))}</span>
        </div>
        <div className="ct-actions">
          <button className="btn ghost" title="Apagar tudo e recomeçar do zero" onClick={() => {
            if (!confirm('Resetar a carreira e começar do ZERO? Isso apaga todo o seu progresso (org, elenco, títulos, dinheiro). Não dá pra desfazer.')) return;
            const fresh = emptySave();
            persist(fresh);
            setSave(fresh);
            setOrgChoice('select');
            setStage('found');
          }}>↺ Resetar</button>
          <button className="btn" onClick={onExit}>← Sair</button>
        </div>
      </div>

      <div className="career-nav">
        <div className="career-groups">
          {HUB_GROUPS.map((g) => {
            const hasAlert = g.tabs.some(tabAlert);
            return (
              <button key={g.id} className={`career-group${activeGroup.id === g.id ? ' on' : ''}${hasAlert ? ' finance-alert' : ''}`}
                onClick={() => { setHubTab(g.tabs[0]); setSelSeries(null); }}>
                {g.label}
              </button>
            );
          })}
        </div>
        {activeGroup.tabs.length > 1 && (
          <div className="career-subtabs">
            {activeGroup.tabs.map((id) => (
              <button key={id} className={`career-subtab${hubTab === id ? ' on' : ''}${tabAlert(id) ? ' finance-alert' : ''}`}
                onClick={(e) => { setHubTab(id); setSelSeries(null); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); if (id === 'inbox' && (save.unread ?? 0) > 0) update({ unread: 0 }); }}>
                {tabLabelFull(id)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* conteúdo da aba com transição (key força remount → reanima na troca) */}
      <div className="tab-fade" key={hubTab}>
      {/* ===== INBOX (manchetes da imprensa + diretoria) ===== */}
      {hubTab === 'inbox' && (() => {
        const all = save.news ?? [];
        const shown = newsCat === 'all' ? all : all.filter((n) => (n.cat ?? 'scene') === newsCat);
        return (
        <div className="career-grid">
          <div className="career-main">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Caixa de entrada</div>
            {all.length === 0 ? (
              <p className="muted small">Sem novidades por enquanto. As manchetes aparecem ao longo da carreira (resultados, diretoria, mercado, cenário e social).</p>
            ) : (
              <>
                <div className="news-cats">
                  {NEWS_CATS.map((c) => {
                    const n = c.key === 'all' ? all.length : all.filter((x) => (x.cat ?? 'scene') === c.key).length;
                    if (c.key !== 'all' && n === 0) return null;
                    return (
                      <button key={c.key} className={`nc-chip${newsCat === c.key ? ' on' : ''}`} onClick={() => setNewsCat(c.key)}>
                        {c.label} <span className="nc-n">{n}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="news-list">
                  {shown.map((n) => (
                    n.cat === 'social' ? (
                      <div key={n.id} className="news-item social">
                        <span className="news-ic">💬</span>
                        <div className="news-body">
                          <div className="news-title"><span className="news-handle">{n.handle}</span> <span className="news-split">Split {n.split}</span></div>
                          <div className="news-text">{n.body}</div>
                        </div>
                      </div>
                    ) : (
                      <div key={n.id} className={`news-item ${n.tone}`}>
                        <span className="news-ic">{n.icon}</span>
                        <div className="news-body">
                          <div className="news-title">{n.title} <span className="news-split">Split {n.split}</span></div>
                          <div className="news-text muted small">{n.body}</div>
                        </div>
                      </div>
                    )
                  ))}
                  {shown.length === 0 && <p className="muted small">Nada nessa categoria ainda.</p>}
                </div>
              </>
            )}
          </div>
        </div>
        );
      })()}

      {/* ===== VISÃO GERAL ===== */}
      {hubTab === 'overview' && (() => {
        const prizeNow = Math.round((PRIZE_BY_POS[Math.max(0, myPos - 1)] ?? 0) * (save.circuit?.prizeMult ?? 1));
        // vaga no Major = top 16 do ranking VRS mundial (posição atual da org)
        const qualifying = myVrsRank > 0 && myVrsRank <= MAJOR_VRS_CUT;
        const net = effSponsorIncome(save) - payroll;
        const myStars = seasonStats.filter((s) => mySquadIds.has(s.id)).slice(0, 5);
        const prestige = careerPrestige(save);
        const fans = careerFans(save);
        return (
        <div className="career-grid">
          <div className="career-main">
            {/* DESAFIO: metas do cenário assumido (se houver) */}
            {save.scenario && (() => {
              const sc = save.scenario;
              const doneN = sc.goals.filter((g) => g.done).length;
              const allDone = doneN === sc.goals.length;
              return (
                <div className={`scenario-banner${allDone ? ' done' : ''}`}>
                  <div className="scenario-banner-head">
                    🎯 Desafio: <b>{sc.title}</b>
                    <span className="spacer" />
                    <span className="muted small">{doneN}/{sc.goals.length} metas{allDone ? ' · concluído! 🏆' : ''}</span>
                  </div>
                  <div className="scenario-banner-goals">
                    {sc.goals.map((g, i) => (
                      <span key={i} className={`scenario-banner-goal${g.done ? ' done' : ''}`}>{g.done ? '✅' : '◻️'} {g.text}</span>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* HERO: central de comando do split */}
            <div className="dash-hero" style={{ background: `linear-gradient(120deg, ${save.org?.colors[0] ?? '#101820'}cc, var(--panel-3) 65%)` }}>
              <div className="dh-id">
                <TeamBadge tag={save.org?.tag ?? ''} colors={save.org?.colors ?? ['#101820', '#61a8dd']} size={44} logoUrl={save.org?.logo} />
                <div>
                  <div className="dh-circuit">{save.circuit?.name ?? 'Circuito'}</div>
                  <div className="dh-sub">
                    <span className="dh-tier">TIER {save.tier}</span>
                    <span>Split {save.split}</span>
                    {save.region && <span>{MACRO_REGION_LABELS[save.region]}</span>}
                    <span title="Prestígio da org (cresce com títulos, Major, tier e VRS; atrai patrocínio)">★ Prestígio {prestige}</span>
                    <span title="Torcida da organização">👥 {formatFans(fans)} fãs</span>
                  </div>
                </div>
              </div>
              <div className="dh-chips">
                <div className="dh-chip"><b>{myPos}º<span className="dh-of"> / {league.teams.length}</span></b><span>Posição</span></div>
                <div className="dh-chip">
                  <b className="dh-form">{form.length ? form.slice(-5).map((r, i) => <i key={i} className={`fchip ${r === 'W' ? 'w' : 'l'}`}>{r}</i>) : <span className="muted">-</span>}</b>
                  <span>Forma</span>
                </div>
                <div className={`dh-chip ${qualifying ? 'q-ok' : 'q-no'}`}>
                  <b>{qualifying ? `✓ #${myVrsRank} VRS` : `#${myVrsRank} VRS`}</b>
                  <span>{qualifying ? `na zona do Major (top ${MAJOR_VRS_CUT})` : `fora do top ${MAJOR_VRS_CUT} do VRS`}</span>
                </div>
                <div className="dh-chip"><b>{formatMoney(prizeNow)}</b><span>prêmio na {myPos}ª</span></div>
              </div>
            </div>
            {expiringCount > 0 && (
              <button className="contract-alert" onClick={() => setHubTab('finance')}>
                📄 <b>{expiringCount === 1 ? '1 contrato vence' : `${expiringCount} contratos vencem`}</b> neste split
                {' '}({expiringContracts.map((w) => w.nick).join(', ')}).
                {' '}Renove em <b>Finanças</b> ou o jogador sai <b>de graça</b> no próximo split. <span className="ca-go">Abrir Finanças →</span>
              </button>
            )}
            {/* diretoria: objetivo do split + confiança (estilo manager) */}
            <div className="board-card">
              <div className="board-top">
                <span className="board-label">🏛️ Diretoria</span>
                <span className={`board-conf ${save.board >= 55 ? 'ok' : save.board >= 30 ? 'warn' : 'bad'}`}>
                  Confiança {Math.round(save.board)}%
                </span>
              </div>
              <div className="board-bar"><i style={{ width: `${Math.max(3, save.board)}%` }} className={save.board >= 55 ? 'ok' : save.board >= 30 ? 'warn' : 'bad'} /></div>
              {save.objective ? (
                <div className="board-obj">🎯 Objetivo do split: <b>{save.objective.text}</b> <span className="muted small">(bônus {formatMoney(save.objective.bonus)})</span></div>
              ) : (
                <div className="muted small">Defina o elenco e o circuito para receber o objetivo da diretoria.</div>
              )}
              {save.lastObjective && (
                <div className={`board-last ${save.lastObjective.met ? 'met' : 'miss'}`}>
                  {save.lastObjective.met ? '✅ Objetivo anterior cumprido' : '❌ Objetivo anterior falhou'} ({save.lastObjective.delta >= 0 ? '+' : ''}{save.lastObjective.delta}% confiança)
                </div>
              )}
              {save.board < 30 && <div className="board-warn-msg">⚠️ A diretoria está perdendo a paciência. Falhar de novo pode custar seu emprego.</div>}
            </div>
            {/* guia da jornada: explica as regras da temporada (dispensável) */}
            {guideOpen && (
              <div className="career-guide">
                <div className="cg-head">
                  📖 Como funciona a temporada
                  <span className="spacer" />
                  <button className="btn ghost small" onClick={dismissGuide}>Entendi ✕</button>
                </div>
                <ul>
                  <li><b>Fase de grupos GSL</b> (2 grupos de 4, dupla eliminação: abertura → vencedores/eliminação → decisão; abertura é MD1, o resto MD3) → os <b>2 melhores de cada grupo</b> vão pro <b>mata-mata</b> (semis MD3 + final MD5). É o formato real do CS (IEM/BLAST/Major), não liga de pontos.</li>
                  <li><b>Major Mundial a cada {MAJOR_EVERY} splits</b>: vão os <b>top {MAJOR_VRS_CUT} do ranking VRS mundial</b>. Ganhe VRS vencendo partidas, indo longe e levando campeonatos (próximo Major: Split {isMajorSplit(save.split) ? save.split : save.split + (MAJOR_EVERY - (save.split % MAJOR_EVERY))}).</li>
                  <li><b>Janela de transferências só entre temporadas</b>: durante o split é com o elenco que você tem.</li>
                  <li><b>Seu elenco evolui entre temporadas</b>: jogador em ascensão melhora, veterano em declínio cai; valor e salário acompanham. Olhe a fase de carreira antes de contratar.</li>
                  <li><b>Patrocinadores</b> pagam por split, e marcas maiores exigem mais VRS (seu ranking).</li>
                </ul>
              </div>
            )}
            {opp && myMatch ? (
              <div className="play-match-card" style={{ background: `linear-gradient(110deg, ${save.org?.colors[0] ?? '#101820'}cc, var(--header) 70%)` }}>
                <div className="pm-info">
                  <div className="pm-label">PRÓXIMA PARTIDA · {(myMatch.bo ?? 3) === 1 ? 'MD1' : (myMatch.bo ?? 3) === 5 ? 'MD5' : 'MD3'} · {league.gsl ? `Grupos · ${GSL_ROUND_LABELS[league.current]}` : `Rodada ${league.current + 1}/${league.rounds.length}`}</div>
                  <div className="pm-teams">
                    <span className="pm-side">
                      <TeamBadge tag={save.org?.tag ?? ''} colors={save.org?.colors ?? ['#101820', '#61a8dd']} size={40} logoUrl={save.org?.logo} />
                      <b>{save.org?.tag}</b>
                    </span>
                    <span className="pm-vs">VS</span>
                    <span className="pm-side">
                      <TeamBadge tag={opp.tag} colors={opp.colors} size={40} logoUrl={opp.logoUrl} />
                      <b>{opp.name}</b>
                    </span>
                  </div>
                  <div className="pm-opp muted small">
                    <Flag cc={opp.country} /> {league.gsl ? `Grupo ${league.gsl.groups[0].includes(opp.id) ? 'A' : 'B'}` : `${oppPos}º na tabela`} · força {opp.strength.toFixed(1)}
                  </div>
                </div>
                <GamePlanPicker plan={save.gamePlan ?? 'disciplined'} onPick={(p) => update({ gamePlan: p })} />
                <div className="pm-actions">
                  <button className="btn gold big" onClick={playMine}>▶ JOGAR</button>
                  <button className="btn ghost" onClick={() => simMine(league)}>⏩ Simular</button>
                  <button className="btn ghost" onClick={() => simWholeSplit(league)} title="Resolve todas as rodadas restantes de uma vez e vai pro mata-mata">⏩⏩ Split inteiro</button>
                </div>
              </div>
            ) : (
              <div className="career-banner">Rodada concluída. Avançando…</div>
            )}

            {/* relatório do olheiro: leitura do próximo adversário (pré-jogo) */}
            {opp && myMatch && (() => {
              const sc = scoutMaps(opp);
              const danger = sc[0].m, weak = sc[sc.length - 1].m;
              const diff = me.strength - opp.strength;
              const verdict = diff >= 4 ? { t: 'Você é o favorito', c: 'pos' } : diff <= -4 ? { t: 'Eles são favoritos', c: 'neg' } : { t: 'Confronto equilibrado', c: 'warn' };
              return (
                <div className="scout-card">
                  <div className="scout-head">🔍 Relatório do olheiro <span className="muted small">· {opp.name}</span></div>
                  <div className={`scout-verdict ${verdict.c}`}>{verdict.t} · força {opp.strength.toFixed(1)} <span className="muted">(você {me.strength.toFixed(1)})</span></div>
                  <div className="scout-maps">
                    <div className="sc-map ban"><span className="sc-tag">⛔ BANIR</span><b>{MAP_LABELS[danger]}</b><span className="muted small">o mapa mais forte deles</span></div>
                    <div className="sc-map pick"><span className="sc-tag">✅ PICAR</span><b>{MAP_LABELS[weak]}</b><span className="muted small">onde têm dificuldade</span></div>
                  </div>
                </div>
              );
            })()}

            {/* resumo da temporada atual + pulso financeiro */}
            <div className="career-statgrid">
              <div className="cstat"><b>{me.wins}-{me.losses}</b><span>Campanha</span></div>
              <div className="cstat"><b className={me.roundDiff >= 0 ? 'pos' : 'neg'}>{me.roundDiff >= 0 ? '+' : ''}{me.roundDiff}</b><span>Saldo de rounds</span></div>
              <div className="cstat"><b>{league.current}/{league.rounds.length}</b><span>Rodadas jogadas</span></div>
              <div className="cstat"><b>{formatMoney(save.budget)}</b><span>Caixa</span></div>
              <div className="cstat"><b className={net >= 0 ? 'pos' : 'neg'}>{net >= 0 ? '+' : ''}{formatMoney(net)}</b><span>Saldo / split</span></div>
              <div className="cstat"><b>{save.vrs}</b><span>VRS</span></div>
            </div>

            <div className="muted small section-label">Rodada {league.current + 1} - confrontos</div>
            <div className="panel-body tight" style={{ padding: 0 }}>
              {league.rounds[league.current]?.map((m, i) => (
                <MatchLine key={i} league={league} m={m} onOpen={setSelSeries} />
              ))}
            </div>
          </div>

          <div className="career-side">
            <div className="side-card">
              <div className="side-card-head">
                <span className="muted small section-label" style={{ margin: 0 }}>Chave da fase de grupos (GSL)</span>
                {league.gsl && <button className="btn ghost small" onClick={() => setHubTab('bracket')}>Abrir →</button>}
              </div>
              {league.gsl
                ? <GSLBracket league={league} onOpen={setSelSeries} />
                : <CareerTable table={table} highlightTop={spots} onPick={setSelTeam} />}
            </div>
            <div className="side-card">
              <div className="vrs-snap-head">
                <span className="muted small section-label" style={{ margin: 0 }}>🌍 Ranking VRS mundial</span>
                <button className="btn ghost small" onClick={() => setHubTab('vrs')}>Ver tudo →</button>
              </div>
              {myVrsRank > 0 && <div className="vrs-snap-me">Você: <b>#{myVrsRank}</b> no mundo · {save.vrs} VRS</div>}
              <div className="vrs-snap-list">
                {(() => {
                  const top = vrsAll.slice(0, 5);
                  const meRow = myVrsRank > 5 ? vrsAll[myVrsRank - 1] : null;
                  const rows = meRow ? [...top.map((t, i) => ({ t, r: i + 1 })), { t: meRow, r: myVrsRank }] : top.map((t, i) => ({ t, r: i + 1 }));
                  return rows.map(({ t, r }) => (
                    <div key={t.id} className={`vrs-snap-row${t.isUser ? ' me' : ''}`}>
                      <span className="vsr-rank">{r}</span>
                      <TeamBadge tag={t.tag} colors={t.colors} size={18} logoUrl={t.logoUrl} />
                      <span className="vsr-name">{t.name}</span>
                      <span className="vsr-vrs">{t.vrs}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
            {myStars.length > 0 && (
              <div className="side-card">
                <div className="muted small section-label" style={{ marginTop: 0 }}>⭐ Seus destaques no split</div>
                <BestPlayers stats={myStars} mine={mySquadIds} ranked />
              </div>
            )}
            <div className="side-card">
              <div className="muted small section-label" style={{ marginTop: 0 }}>Destaques da temporada</div>
              <BestPlayers stats={seasonStats.slice(0, 5)} mine={mySquadIds} ranked />
            </div>
          </div>
        </div>
        );
      })()}

      {/* ===== MAJOR AO VIVO (dentro do hub) ===== */}
      {hubTab === 'major' && majorT && (() => {
        const st = save.majorStage ?? 1;
        const entered = save.majorUserStage ?? 1;
        const stLabel = st >= 4 ? '🏆 Champions Stage (playoffs)' : `Stage ${st} de 3 · fase Suíça`;
        const enterTop = entered === 3 ? 8 : entered === 2 ? 16 : 32;
        return (
          <>
            <div className="cal-major-banner now" style={{ marginBottom: 12 }}>
              <b>🌍 {majorT.name.split(' · ')[0]}</b> · <b>{stLabel}</b>. Você entrou no <b>Stage {entered}</b> (top {enterTop} do ranking VRS). {st < 4 ? 'Top 8 avançam ao próximo stage.' : 'Mata-mata MD3 (final MD5).'}
              {(save.majorPre?.length ?? 0) > 0 && (
                <div className="muted small" style={{ marginTop: 6 }}>
                  {save.majorPre!.map((p) => (
                    <div key={p.stage}>Stage {p.stage} (auto-simulado): avançaram {p.advancers.slice(0, 6).map((a) => a.tag).join(', ')}{p.advancers.length > 6 ? '…' : ''}</div>
                  ))}
                </div>
              )}
            </div>
            <Hub
              t={majorT}
              career={{ season: save.split, titles: save.titles, budget: save.budget }}
              pickem={{ picks: {}, score: 0, total: 0 }}
              onPick={() => {}}
              onPlay={playMajorMine}
              onSimRound={simMajorRound}
              onStats={() => {}}
              onOpenSeries={(p) => p.result && setSelSeries({ series: p.result, teams: [getTeam(majorT, p.a), getTeam(majorT, p.b)] })}
            />
          </>
        );
      })()}

      {/* ===== MERCADO: janela FECHADA durante a temporada ===== */}
      {hubTab === 'market' && (
        <SeasonNegotiations
          market={market}
          squadPlayers={save.squad.map((s) => findSigning(s)?.player).filter(Boolean) as Player[]}
          budget={save.budget}
          pendingDeals={save.pendingDeals ?? []}
          pendingSales={save.pendingSales ?? []}
          offers={incomingOffers}
          feed={feedMemo}
          onAddDeal={(d) => update({ pendingDeals: [...(save.pendingDeals ?? []), d] })}
          onCancelDeal={(id) => update({ pendingDeals: (save.pendingDeals ?? []).filter((x) => x.id !== id) })}
          onAcceptOffer={(o) => update({ pendingSales: [...(save.pendingSales ?? []), o] })}
          onRejectOffer={(pid) => update({ rejectedOffers: [...(save.rejectedOffers ?? []), pid] })}
          onCancelSale={(pid) => update({ pendingSales: (save.pendingSales ?? []).filter((x) => x.playerId !== pid) })}
        />
      )}

      {/* ===== RESULTADOS (todas as rodadas) ===== */}
      {hubTab === 'results' && (
        <div className="panel">
          <div className="panel-body">
            {league.rounds.map((round, r) => (
              <div key={r} className="results-round">
                <div className="muted small section-label" style={{ marginTop: r === 0 ? 0 : 14 }}>
                  Rodada {r + 1}{r === league.current && ' (atual)'}
                </div>
                {round.map((m, i) => <MatchLine key={i} league={league} m={m} onOpen={setSelSeries} />)}
              </div>
            ))}
            <p className="muted small" style={{ marginTop: 12 }}>Clique em qualquer partida finalizada para ver o placar mapa a mapa.</p>
          </div>
        </div>
      )}

      {/* ===== CLASSIFICAÇÃO (detalhada) ===== */}
      {hubTab === 'standings' && (
        <div className="panel">
          <div className="panel-body">
            <div className="muted small section-label" style={{ marginTop: 0 }}>{save.circuit?.name ?? 'Circuito'} · fase de grupos (GSL) · top 2 de cada grupo vão ao mata-mata</div>
            {league.gsl
              ? <GSLGroups league={league} onOpen={setSelSeries} />
              : <CareerTable table={table} highlightTop={spots} onPick={setSelTeam} detailed />}
            <p className="muted small" style={{ marginTop: 10 }}>{league.gsl ? 'Clique num jogo concluído pra ver o placar.' : 'Clique em um time para ver elenco, técnico e força.'}</p>
          </div>
        </div>
      )}

      {/* ===== CHAVE (BRACKET DEDICADO) ===== */}
      {hubTab === 'bracket' && (
        <div className="panel">
          <div className="panel-body">
            <div className="muted small section-label" style={{ marginTop: 0 }}>
              {save.circuit?.name ?? 'Circuito'} · chave da fase de grupos (GSL · dupla eliminação) — top 2 de cada grupo vão ao mata-mata
            </div>
            {opp && myMatch && (
              <div className="bracket-play">
                <span className="muted small">Sua próxima partida: <b>{opp.name}</b> · {(myMatch.bo ?? 3) === 1 ? 'MD1' : (myMatch.bo ?? 3) === 5 ? 'MD5' : 'MD3'}</span>
                <GamePlanPicker plan={save.gamePlan ?? 'disciplined'} onPick={(p) => update({ gamePlan: p })} />
                <span className="spacer" />
                <button className="btn gold" onClick={playMine}>▶ JOGAR</button>
                <button className="btn ghost small" onClick={() => simMine(league)}>⏩ Simular</button>
              </div>
            )}
            {league.gsl
              ? <GSLBracket league={league} onOpen={setSelSeries} />
              : <p className="muted small">Este circuito não usa fase de grupos GSL.</p>}
            {save.playoff && (
              <div style={{ marginTop: 18 }}>
                <PlayoffBracket p={save.playoff} teamOf={(id) => leagueTeam(league, id)} onOpen={(s, ts) => setSelSeries({ series: s, teams: ts })} />
              </div>
            )}
            <p className="muted small" style={{ marginTop: 10 }}>Clique num confronto concluído pra ver o placar completo da série.</p>
          </div>
        </div>
      )}

      {/* ===== ACADEMIA (prospectos: revelar, treinar, promover) ===== */}
      {hubTab === 'academy' && (() => {
        const aca = save.academy ?? [];
        const full = aca.length >= ACADEMY_MAX;
        const squadFull = save.squad.length >= 5;
        return (
          <div className="panel">
            <div className="panel-body">
              <div className="aca-head">
                <div>
                  <div className="muted small section-label" style={{ marginTop: 0 }}>Academia · {aca.length}/{ACADEMY_MAX} prospectos</div>
                  <p className="muted small" style={{ maxWidth: 600 }}>
                    Revele jovens talentos, deixe um em <b>foco 🎯</b> (cresce mais rápido a cada split rumo ao seu <b>potencial</b>) e <b>promova ao elenco</b> quando quiser. É a próxima geração da sua org.
                  </p>
                </div>
                <button className="btn gold" disabled={full || save.budget < ACADEMY_SCOUT_COST}
                  title={full ? 'Academia cheia' : save.budget < ACADEMY_SCOUT_COST ? 'Caixa insuficiente' : ''}
                  onClick={() => {
                    const region = save.region ?? 'europe';
                    const seed = `aca:${save.org?.tag ?? 'org'}:${save.split}:${aca.length}:${save.budget}`;
                    const p = makeProspect(seed, region, save.split);
                    update({ academy: [...aca, p], budget: save.budget - ACADEMY_SCOUT_COST });
                  }}>
                  🔍 Revelar prospecto ({formatMoney(ACADEMY_SCOUT_COST)})
                </button>
              </div>
              {aca.length === 0 ? (
                <p className="muted small" style={{ padding: '14px 0' }}>
                  Sua academia está vazia. Revele um prospecto pra começar a formar a próxima geração — eles começam crus (OVR baixo) mas evoluem treinando.
                </p>
              ) : (
                <div className="aca-grid">
                  {aca.map((p) => {
                    const ovr = playerOvr(p);
                    const focused = save.academyFocus === p.id;
                    const potPct = Math.max(6, Math.min(100, ((p.potential - 60) / 33) * 100));
                    return (
                      <div key={p.id} className={`aca-card${focused ? ' focused' : ''}`}>
                        <div className="aca-top">
                          <PlayerAvatar nick={p.nick} size={46} />
                          <OvrBadge ovr={ovr} />
                        </div>
                        <div className="aca-nick"><Flag cc={p.country} /> {p.nick}</div>
                        <div className="muted small aca-name">{p.name}</div>
                        <div className="aca-meta">
                          <span className={`role-pill ${p.role}`}>{p.role}</span>
                          <span className="muted small">{p.age} anos</span>
                        </div>
                        <div className="aca-pot">
                          <span className="muted small">Potencial</span>
                          <div className="aca-potbar"><div style={{ width: `${potPct}%` }} /></div>
                          <span className="aca-potval">{p.potential}</span>
                        </div>
                        <div className="aca-actions">
                          <button className={`btn small${focused ? ' gold' : ' ghost'}`}
                            onClick={() => update({ academyFocus: focused ? null : p.id })}>
                            {focused ? '🎯 Em foco' : 'Treinar'}
                          </button>
                          <button className="btn small gold"
                            onClick={() => (squadFull ? setPromoting(promoting === p.id ? null : p.id) : promoteProspect(p.id))}>
                            ⬆ Promover
                          </button>
                          <button className="btn small ghost" title="Dispensar o prospecto da academia"
                            onClick={() => {
                              if (!confirm(`Dispensar ${p.nick} da academia? Não dá pra desfazer.`)) return;
                              update({
                                academy: aca.filter((x) => x.id !== p.id),
                                academyFocus: save.academyFocus === p.id ? null : save.academyFocus,
                              });
                              if (promoting === p.id) setPromoting(null);
                            }}>
                            🗑
                          </button>
                        </div>
                        {promoting === p.id && squadFull && (
                          <div className="aca-replace">
                            <div className="muted small">Elenco cheio — sai do time:</div>
                            <div className="aca-replace-list">
                              {save.squad.map((sg) => {
                                const f = findSigning(sg);
                                return (
                                  <button key={sg.playerId} className="btn small ghost"
                                    onClick={() => promoteProspect(p.id, sg.playerId)}>
                                    {f?.player.nick ?? sg.playerId}
                                  </button>
                                );
                              })}
                              <button className="btn small" onClick={() => setPromoting(null)}>cancelar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ===== ELENCO + RANKING DE JOGADORES ===== */}
      {hubTab === 'finance' && (() => {
        const picks = save.squad.map((s) => ({ sig: s, f: findSigning(s) })).filter((x) => x.f) as { sig: Signing; f: { player: Player } }[];
        const wages = picks.map((x) => ({ ...x, wage: playerWage(x.f.player), until: save.contracts?.[x.sig.playerId] }));
        const folha = wages.reduce((a, w) => a + w.wage, 0);
        const sponsorInc = effSponsorIncome(save);
        const net = sponsorInc - folha;
        return (
          <div className="career-grid">
            <div className="career-main">
              <div className="muted small section-label" style={{ marginTop: 0 }}>Finanças da {save.org?.name}</div>
              <div className="fin-cards">
                <div className="fin-card"><span className="fin-k">Caixa</span><b>{formatMoney(save.budget)}</b></div>
                <div className="fin-card"><span className="fin-k">Patrocínio / split</span><b className="pos">+{formatMoney(sponsorInc)}</b></div>
                <div className="fin-card"><span className="fin-k">Folha / split</span><b className="neg">-{formatMoney(folha)}</b></div>
                <div className="fin-card"><span className="fin-k">Saldo fixo / split</span><b className={net >= 0 ? 'pos' : 'neg'}>{net >= 0 ? '+' : ''}{formatMoney(net)}</b></div>
              </div>
              <p className="muted small">A premiação entra conforme sua colocação. O "saldo fixo" é patrocínio − folha (antes do prêmio); se ficar negativo, você queima caixa todo split.</p>
              <div className="muted small section-label">Contratos do elenco</div>
              <div className="fin-table-wrap">
              <table className="stats fin-contracts">
                <thead><tr><th style={{ textAlign: 'left' }}>Jogador</th><th>Idade</th><th>OVR</th><th>POT</th><th>Salário/split</th><th>Contrato</th><th></th></tr></thead>
                <tbody>
                  {wages.map((w) => {
                    const left = w.until != null ? w.until - save.split + 1 : 0;
                    const expiring = left <= 1;
                    const age = effectiveAge(w.f.player, save.split, save.youthAge);
                    const pot = potentialTier(playerPotentialOvr(w.f.player, age));
                    return (
                      <tr key={w.sig.playerId} className={expiring ? 'fin-expiring' : ''}>
                        <td style={{ textAlign: 'left' }}><Flag cc={w.f.player.country} /> {w.f.player.nick}</td>
                        <td>{age}</td>
                        <td>{playerOvr(w.f.player)}</td>
                        <td><span className={`pot-badge pot-${pot}`}>{pot}</span></td>
                        <td className="neg">{formatMoney(w.wage)}</td>
                        <td>{left <= 0 ? 'vencido' : `${left} split${left > 1 ? 's' : ''}`}{expiring && left > 0 ? ' ⚠️' : ''}</td>
                        <td>{expiring && (
                          <button className="btn small" disabled={save.budget < w.wage}
                            onClick={() => update({ budget: save.budget - w.wage, contracts: { ...(save.contracts ?? {}), [w.sig.playerId]: save.split + CONTRACT_TERM - 1 } })}>
                            🔁 Renovar
                          </button>
                        )}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              <p className="muted small">Contratos vencem no fim do prazo: <b>renove (custa 1 salário)</b> ou o jogador sai <b>de graça</b> no próximo split.</p>
            </div>
          </div>
        );
      })()}

      {hubTab === 'squad' && (() => {
        // itera as contratações (findSigning resolve o jogador pelo id ORIGINAL,
        // já com evolução e função aplicadas). rid = id de runtime nas partidas.
        const rows = save.squad.map((sig) => findSigning(sig)?.player).filter(Boolean) as Player[];
        const hasAwp = rows.some((p) => p.role === 'AWP');
        const hasIgl = rows.some((p) => p.role === 'IGL');
        const setRole = (pid: string, role: Role) =>
          update({ roles: { ...(save.roles ?? {}), [pid]: role } });
        const setFocus = (pid: string) =>
          update({ trainingFocus: save.trainingFocus === pid ? null : pid });
        const setMapFocus = (m: MapId) => {
          const cur = mapFocusList(save);
          if (cur.includes(m)) {
            update({ mapFocus: cur.filter((x) => x !== m) });
          } else if (cur.length < MAP_FOCUS_MAX) {
            update({ mapFocus: [...cur, m] });
          }
        };
        const setPlaybook = (pb: Playbook) => {
          if (pb === save.playbook) return;
          // guarda o entrosamento do esquema atual e restaura o do esquema alvo
          // (voltar a um esquema já treinado não zera tudo de novo)
          const mem = { ...(save.playbookMem ?? {}) };
          if (save.playbook) mem[save.playbook] = save.playbookXp ?? 0;
          const restored = mem[pb] ?? PLAYBOOK_SWITCH_TO;
          update({ playbook: pb, playbookXp: restored, playbookMem: mem });
        };
        const fam = save.playbookXp ?? 0;
        return (
        <div className="career-grid">
          <div className="career-main">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Seu elenco</div>
            {(!hasAwp || !hasIgl) && (
              <div className="role-warn">
                ⚠️ Seu time está sem {!hasAwp && !hasIgl ? 'AWP e IGL' : !hasAwp ? 'AWPer' : 'IGL'}.
                Ajuste a função de um jogador abaixo para cobrir.
              </div>
            )}
            <div className="career-squad big">
              {rows.map((p) => {
                const rid = `user__${p.id}`;
                const st = seasonStats.find((s) => s.id === rid);
                const focused = save.trainingFocus === p.id;
                const grew = save.evo?.[p.id] ?? 0;
                const mor = save.morale?.[p.id] ?? MORALE_DEFAULT;
                const mi = moraleInfo(mor);
                return (
                  <div key={p.id} className={`cs-row${focused ? ' cs-focused' : ''}`}>
                    <button className="cs-open" onClick={() => setProfilePlayer(p)} title="Ver perfil do jogador">
                      <PlayerAvatar nick={p.nick} size={32} />
                      <span className="cs-nick"><Flag cc={p.country} /> {p.nick}
                        {grew > 0 && <span className="cs-grew" title={`+${grew} de evolução na carreira`}> ▲{grew}</span>}
                      </span>
                    </button>
                    <span className={`cs-morale ${mi.cls}`} title={`Moral: ${mi.label} (${mor}/100)`}>{mi.icon} {mor}</span>
                    <select className={`role-select ${p.role}`} value={p.role}
                      onChange={(e) => setRole(p.id, e.target.value as Role)}
                      title="Definir a função deste jogador">
                      {ROLE_OPTS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button className={`cs-train${focused ? ' on' : ''}`} onClick={() => setFocus(p.id)}
                      title={focused ? 'Em foco de treino neste split' : 'Pôr em foco de treino (desenvolve mais rápido)'}>
                      🎯
                    </button>
                    <span className="cs-stat">{st ? `rat ${st.rating.toFixed(2)}` : '-'}</span>
                    <span className="cs-ovr">{playerOvr(p)}</span>
                  </div>
                );
              })}
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              Clique no jogador pra ver o <b>perfil completo</b>. Defina a <b>função</b> (no CS são flexíveis: tenha 1 AWP e 1 IGL) e o
              <b> 🎯 foco de treino</b> do split (esse jogador evolui mais rápido). Você não edita os atributos: eles
              <b> sobem sozinhos</b> conforme o jogador se desenvolve e joga.
            </p>
          </div>
          <div className="career-side">
            {/* PLAYBOOK: esquema tático treinado. Trocar derruba o entrosamento. */}
            <div className="side-card">
              <div className="muted small section-label" style={{ marginTop: 0 }}>📋 Playbook tático</div>
              <div className="pb-fam">
                <span className="muted small">Entrosamento</span>
                <span className="pb-bar"><i className={fam >= 70 ? 'good' : fam >= 40 ? 'warn' : 'bad'} style={{ width: `${fam}%` }} /></span>
                <b className="small">{fam}%</b>
              </div>
              <div className="pb-list">
                {(Object.keys(PLAYBOOK_LABELS) as Playbook[]).map((pb) => (
                  <button key={pb} className={`pb-opt${save.playbook === pb ? ' on' : ''}`} onClick={() => setPlaybook(pb)}>
                    <span className="pb-name">{PLAYBOOK_LABELS[pb]}{save.playbook === pb ? ' ✓' : ''}</span>
                    <span className="pb-desc muted small">{PLAYBOOK_DESC[pb]}</span>
                  </button>
                ))}
              </div>
              <p className="muted small" style={{ margin: '8px 0 0' }}>O entrosamento sobe a cada split mantendo o esquema; <b>trocar volta pra {PLAYBOOK_SWITCH_TO}%</b>. Quanto maior, mais o esquema pesa na partida — pro bem e pro mal, conforme o contexto.</p>
            </div>

            {/* TREINO DE MAPA: foca até 3 mapas por split; os outros decaem (não dá pra ser bom em todos) */}
            <div className="side-card">
              <div className="muted small section-label" style={{ marginTop: 0 }}>🗺️ Treino de mapa <span className="muted small" style={{ fontWeight: 400 }}>({mapFocusList(save).length}/{MAP_FOCUS_MAX} em foco)</span></div>
              <div className="map-train">
                {MAP_POOL.map((m) => {
                  const lvl = mapLevel(save, m);
                  const pct = Math.round(((lvl - MAP_TRAIN_MIN) / (MAP_TRAIN_MAX - MAP_TRAIN_MIN)) * 100);
                  const foc = mapFocusList(save).includes(m);
                  const full = !foc && mapFocusList(save).length >= MAP_FOCUS_MAX;
                  const cls = lvl >= 1 ? 'good' : lvl <= -1 ? 'bad' : 'warn';
                  return (
                    <button key={m} className={`mt-row${foc ? ' on' : ''}`} onClick={() => setMapFocus(m)} disabled={full} title={foc ? 'Em treino neste split (clique pra tirar)' : full ? `Máximo de ${MAP_FOCUS_MAX} mapas em treino` : 'Treinar este mapa neste split'}>
                      <span className="mt-name">{foc ? '🎯 ' : ''}{MAP_LABELS[m]}</span>
                      <span className="mt-bar"><i className={cls} style={{ width: `${pct}%` }} /></span>
                      <span className={`mt-lvl ${cls}`}>{lvl > 0 ? '+' : ''}{lvl.toFixed(1)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="muted small" style={{ margin: '8px 0 0' }}>Treine até <b>{MAP_FOCUS_MAX} mapas</b> por split; os outros decaem um pouco. É de propósito: ninguém é forte em todos, mas dá pra montar um pool sólido.</p>
            </div>

            <div className="side-card">
              <div className="muted small section-label" style={{ marginTop: 0 }}>Melhores jogadores do {save.circuit?.name ?? 'circuito'}</div>
              <BestPlayers stats={seasonStats.slice(0, 8)} mine={mySquadIds} ranked />
            </div>
          </div>
        </div>
        );
      })()}

      {/* ===== CENA MUNDIAL: o que rola nas outras regiões ===== */}
      {hubTab === 'world' && (() => {
        const scene = worldScene(oppEra, save.split);
        return (
          <div className="panel">
            <div className="panel-body">
              <div className="muted small section-label" style={{ marginTop: 0 }}>Cena mundial · Split {save.split} — campeonatos regionais acontecendo em paralelo</div>
              <div className="world-grid">
                {scene.map((s) => (
                  <div key={s.reg} className={`world-card${s.reg === save.region ? ' mine' : ''}`}>
                    <div className="world-head">
                      <OrgFlag players={s.champ.players} />
                      <span className="world-region">{CAREER_REGION_LABELS[s.reg]}</span>
                      {s.reg === save.region && <span className="world-you">você joga aqui</span>}
                    </div>
                    <div className="world-league muted small">{s.league}</div>
                    <div className="world-champ">
                      <span className="wc-tag">🏆 Campeão</span>
                      <TeamBadge tag={s.champ.tag} colors={s.champ.colors} size={22} logoUrl={s.champ.logoUrl ?? logoForTeam(s.champ)} />
                      <span className="wc-name">{s.champ.team}</span>
                    </div>
                    {s.runnerUp && <div className="world-runner muted small">vice: {s.runnerUp.team}</div>}
                    <div className="world-top">
                      {s.top.map((t, i) => (
                        <button key={t.id} className="world-row" onClick={() => setSelTeam(teamSeasonToTTeam(t))}>
                          <span className="wr-rank">{i + 1}</span>
                          <TeamBadge tag={t.tag} colors={t.colors} size={16} logoUrl={t.logoUrl ?? logoForTeam(t)} />
                          <span className="wr-name">{t.team}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="muted small" style={{ marginTop: 10 }}>O cenário evolui a cada split — os campeões e a ordem mudam. Clique num time pra ver elenco e mapas. Você sobe de região mudando o core do elenco (nas Finanças/Mercado).</p>
            </div>
          </div>
        );
      })()}

      {/* ===== RANKING VRS POR REGIÃO ===== */}
      {hubTab === 'vrs' && (
        <div className="panel">
          <div className="panel-body">
            <div className="t20-head">
              <div className="muted small section-label" style={{ marginTop: 0 }}>
                {vrsMode === 'geral' ? 'Ranking mundial de VRS · geral' : 'Ranking mundial de VRS · por região'}
                {myVrsRank > 0 && <span className="muted small"> · você é <b style={{ color: 'var(--blue-bright)' }}>#{myVrsRank}</b> no mundo</span>}
              </div>
              <div className="t20-toggle">
                <button className={`btn small${vrsMode === 'geral' ? ' gold' : ' ghost'}`} onClick={() => setVrsMode('geral')}>Geral</button>
                <button className={`btn small${vrsMode === 'regiao' ? ' gold' : ' ghost'}`} onClick={() => setVrsMode('regiao')}>Por região</button>
              </div>
            </div>
            {vrsMode === 'geral' ? (
              <table className="stats vrs-geral">
                <tbody>
                  {vrsAll.map((t, i) => (
                    <tr key={t.id} className={t.isUser ? 'human-row' : ''}>
                      <td style={{ width: 30, textAlign: 'left', fontWeight: 800, color: i < 3 ? 'var(--gold)' : undefined }}>{i + 1}</td>
                      <td style={{ textAlign: 'left' }}>
                        <span className="pcell">
                          <TeamBadge tag={t.tag} colors={t.colors} size={20} logoUrl={t.logoUrl} />
                          <OrgFlag players={t.players} />
                          <span style={{ fontWeight: t.isUser ? 700 : 500, color: t.isUser ? 'var(--blue-bright)' : undefined }}>{t.name}</span>
                          <span className="muted small vrs-reg">{CAREER_REGION_LABELS[t.region]}</span>
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{t.vrs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
            <div className="vrs-regions">
              {vrsByRegion.map((g) => (
                <div key={g.key} className="vrs-region">
                  <div className="vrs-region-head">{g.label} <span className="muted small">({g.teams.length})</span></div>
                  <table className="stats">
                    <tbody>
                      {g.teams.map((t, i) => (
                        <tr key={t.id} className={t.isUser ? 'human-row' : ''}>
                          <td style={{ width: 24, textAlign: 'left' }}>{i + 1}</td>
                          <td style={{ textAlign: 'left' }}>
                            <span className="pcell">
                              <TeamBadge tag={t.tag} colors={t.colors} size={20} logoUrl={t.logoUrl} />
                              <OrgFlag players={t.players} />
                              <span style={{ fontWeight: t.isUser ? 700 : 500, color: t.isUser ? 'var(--blue-bright)' : undefined }}>{t.name}</span>
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{t.vrs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      )}

      {/* ===== TOP 20 HLTV DA TEMPORADA ===== */}
      {hubTab === 'top20' && (
        <div className="panel">
          <div className="panel-body">
            <div className="t20-head">
              <div className="muted small section-label" style={{ marginTop: 0 }}>
                {t20Mode === 'season'
                  ? `Top 20 HLTV · melhores da temporada ${save.split}`
                  : 'Ranking de carreira · maiores ratings acumulados'}
              </div>
              <div className="t20-toggle">
                <button className={`btn small${t20Mode === 'season' ? ' gold' : ' ghost'}`} onClick={() => setT20Mode('season')}>Temporada</button>
                <button className={`btn small${t20Mode === 'career' ? ' gold' : ' ghost'}`} onClick={() => setT20Mode('career')}>Carreira</button>
              </div>
            </div>
            {t20Mode === 'season' ? (
              <div className="top20-list">
                {top20.map((e, i) => {
                  // jogador do SEU elenco aparece pela SUA org, não pelo clube de origem
                  const isMine = mySquadOids.has(e.p.id);
                  const tag = isMine ? (save.org?.tag ?? 'VOCÊ') : e.team.tag;
                  const colors = isMine ? (save.org?.colors ?? e.team.colors) : e.team.colors;
                  const logo = isMine ? save.org?.logo : (e.team.logoUrl ?? logoForTeam(e.team));
                  return (
                  <div key={e.p.id} className={`t20-row${i === 0 ? ' first' : ''}`}>
                    <span className="t20-rank">{i + 1}</span>
                    <PlayerAvatar nick={e.p.nick} size={32} />
                    <span className="t20-nick"><Flag cc={e.p.country} /> {e.p.nick}</span>
                    <span className="muted small t20-team">
                      <TeamBadge tag={tag} colors={colors} size={16} logoUrl={logo} /> {tag}
                    </span>
                    <span className={`role-pill ${e.p.role}`}>{e.p.role}</span>
                    <span className="muted small t20-extra">
                      {e.mvps > 0 && <b className="t20-mvp">{e.mvps}× MVP</b>}
                      {e.sl.kast} KAST · {e.role === 'AWP' ? `${e.sl.awpKills} AWP/m` : `${e.sl.entry} entry/m`} · {e.sl.impact.toFixed(2)} imp
                    </span>
                    <span className="t20-rating">{e.rating.toFixed(2)}</span>
                  </div>
                  );
                })}
              </div>
            ) : careerTop20.length === 0 ? (
              <p className="muted small">As estatísticas de carreira aparecem aqui depois de jogar o primeiro split. Elas sobem conforme os jogadores evoluem.</p>
            ) : (
              <div className="top20-list">
                {careerTop20.map((e, i) => (
                  <div key={e.rid} className={`t20-row${i === 0 ? ' first' : ''}${e.isMine ? ' human-row' : ''}`}>
                    <span className="t20-rank">{i + 1}</span>
                    <PlayerAvatar nick={e.nick} size={32} />
                    <span className="t20-nick"><Flag cc={e.country} /> {e.nick}{e.isMine ? ' ★' : ''}</span>
                    <span className="muted small t20-team">{e.teamTag}</span>
                    <span className={`role-pill ${e.role}`}>{e.role}</span>
                    <span className="muted small t20-extra">{e.kd.toFixed(2)} K/D · {e.adr.toFixed(0)} ADR · {e.maps}m</span>
                    <span className="t20-rating">{e.rating.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== HISTÓRIA DA ORGANIZAÇÃO ===== */}
      {hubTab === 'calendar' && (() => {
        const groupDone = league.current >= league.rounds.length;
        const nextMajor = isMajorSplit(save.split) ? save.split : save.split + (MAJOR_EVERY - (save.split % MAJOR_EVERY));
        const splitsToMajor = nextMajor - save.split;
        const majorSplitNow = isMajorSplit(save.split);
        type StStatus = 'done' | 'live' | 'locked' | 'na';
        const stages: { ic: string; name: string; status: StStatus; detail: string }[] = [
          { ic: '🎯', name: `Fase de grupos · ${save.circuit?.name ?? 'Circuito'}`, status: groupDone ? 'done' : 'live', detail: groupDone ? 'Concluída' : `Rodada ${league.current + 1} de ${league.rounds.length} · você em ${myPos}º` },
          { ic: '🏆', name: 'Mata-mata do circuito', status: save.playoff ? (save.playoff.champion ? 'done' : 'live') : 'locked', detail: save.playoff ? (save.playoff.champion ? 'Encerrado' : 'Semis (MD3) + final (MD5)') : 'Os 4 melhores do grupo avançam' },
          { ic: '🌍', name: 'Major Mundial', status: majorSplitNow ? (save.majorT ? 'live' : 'locked') : 'na', detail: majorSplitNow ? `Top ${MAJOR_VRS_CUT} do ranking VRS mundial garantem a vaga` : `Só em split de Major · próximo no Split ${nextMajor}` },
        ];
        const STLABEL: Record<StStatus, string> = { done: 'concluído', live: 'em andamento', locked: 'a seguir', na: 'fora deste split' };
        // próximos splits (mini-calendário do cadenciamento dos Majors)
        const upcoming = Array.from({ length: 6 }, (_, i) => save.split + i).map((sp) => ({ sp, major: isMajorSplit(sp) }));
        return (
        <div className="panel">
          <div className="panel-body">
            <div className={`cal-major-banner ${splitsToMajor === 0 ? 'now' : ''}`}>
              {splitsToMajor === 0
                ? <>🌍 <b>É split de Major!</b> Os <b>top {MAJOR_VRS_CUT} do ranking VRS mundial</b> garantem a vaga. Você está em <b>#{myVrsRank}</b>.</>
                : <>🌍 <b>Major Mundial no Split {nextMajor}</b> · {splitsToMajor === 1 ? 'falta 1 split' : `faltam ${splitsToMajor} splits`}. Suba no <b>ranking VRS</b> (você está em #{myVrsRank}) vencendo partidas e campeonatos — os top {MAJOR_VRS_CUT} vão ao Major.</>}
            </div>

            <div className="muted small section-label">Temporada atual · Split {save.split}</div>
            <div className="cal-stages">
              {stages.map((st, i) => (
                <div key={i} className={`cal-stage ${st.status}`}>
                  <span className="cal-ic">{st.ic}</span>
                  <div className="cal-st-body">
                    <div className="cal-st-name">{st.name} <span className={`cal-st-pill ${st.status}`}>{STLABEL[st.status]}</span></div>
                    <div className="cal-st-detail muted small">{st.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="muted small section-label">Próximos splits</div>
            <div className="cal-upcoming">
              {upcoming.map(({ sp, major }) => (
                <div key={sp} className={`cal-up${sp === save.split ? ' current' : ''}${major ? ' major' : ''}`}>
                  <div className="cal-up-n">Split {sp}</div>
                  <div className="cal-up-t">{major ? '🌍 Major' : '🎯 Circuito'}</div>
                </div>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 10 }}>
              Cada split tem um <b>circuito</b> (fase de grupos + mata-mata) que vale prêmio e <b>VRS</b>. A cada {MAJOR_EVERY} splits acontece o <b>Major Mundial</b>: o clímax da temporada, com a maior premiação. Seu VRS e seu tier definem se você chega lá.
            </p>
          </div>
        </div>
        );
      })()}

      {hubTab === 'history' && (
        <div className="panel">
          <div className="panel-body">
            <div className="career-statgrid">
              <div className="cstat"><b>{save.split - 1}</b><span>Splits disputados</span></div>
              <div className="cstat"><b className="pos">{org.circuitTitles}</b><span>Títulos de circuito</span></div>
              <div className="cstat"><b className="gold-text">{save.titles}</b><span>Majors vencidos</span></div>
              <div className="cstat"><b>{org.majorApps}</b><span>Majors disputados</span></div>
              <div className="cstat"><b>{formatMoney(org.totalPrize)}</b><span>Prêmios na história</span></div>
              <div className="cstat"><b>{org.bestPlacement}</b><span>Melhor campanha</span></div>
            </div>
            <div className="muted small section-label">Linha do tempo</div>
            {save.history.length === 0 ? (
              <p className="muted small">Sua organização ainda não encerrou nenhum split. A história começa agora.</p>
            ) : (
              <table className="stats">
                <thead>
                  <tr><th style={{ textAlign: 'left' }}>Split</th><th style={{ textAlign: 'left' }}>Campeonato</th><th>Pos</th><th>V-D</th><th>Major</th><th>Prêmio</th></tr>
                </thead>
                <tbody>
                  {[...save.history].reverse().map((h, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: 'left' }}>{h.split}</td>
                      <td style={{ textAlign: 'left' }}>{h.circuit}{h.champion && ' 🏆'}</td>
                      <td>{h.position || '-'}º</td>
                      <td>{h.wins}-{h.losses}</td>
                      <td>{h.major ? PLACE_SHORT[h.major.placement] : '-'}</td>
                      <td>{formatMoney(h.prize)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      </div>

      {selSeries && (
        <div className="modal-backdrop" onClick={() => setSelSeries(null)}>
          <div className="modal scoreboard-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={() => setSelSeries(null)}>✕</button>
            <Scoreboard series={selSeries.series} teams={selSeries.teams} />
          </div>
        </div>
      )}
      {selTeam && <TeamDetail team={selTeam} league={league} onClose={() => setSelTeam(null)} />}
      {profilePlayer && (() => {
        const p = profilePlayer;
        const rid = `user__${p.id}`;
        return (
          <PlayerProfile
            player={p}
            split={save.split}
            career={deriveCareer(save.careerStats?.[rid])}
            cur={seasonStatsMemo.find((s) => s.id === rid)}
            contractUntil={save.contracts?.[p.id]}
            evoTotal={save.evo?.[p.id] ?? 0}
            morale={save.morale?.[p.id] ?? MORALE_DEFAULT}
            peakOvr={Math.max(save.peakOvr?.[p.id] ?? 0, playerOvr(p))}
            focused={save.trainingFocus === p.id}
            onToggleFocus={() => update({ trainingFocus: save.trainingFocus === p.id ? null : p.id })}
            onClose={() => setProfilePlayer(null)}
            youthAge={save.youthAge}
          />
        );
      })()}
    </div>
  );
}

// radar de atributos (pentágono, escala 40-99) — leitura de "shape" do jogador
function AttrRadar({ attrs }: { attrs: { label: string; value: number }[] }) {
  const n = attrs.length;
  const cx = 110, cy = 96, R = 66;
  const norm = (v: number) => Math.max(0.05, Math.min(1, (v - 40) / 59));
  const pt = (i: number, r: number): [number, number] => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; // começa no topo
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const grid = [0.25, 0.5, 0.75, 1].map((f) => attrs.map((_, i) => pt(i, R * f).join(',')).join(' '));
  const shape = attrs.map((d, i) => pt(i, R * norm(d.value)).join(',')).join(' ');
  return (
    <svg viewBox="0 0 220 188" className="attr-radar" role="img" aria-label="radar de atributos">
      <g stroke="rgba(255,255,255,0.1)" fill="none" strokeWidth="0.8">
        {grid.map((g, i) => <polygon key={i} points={g} />)}
        {attrs.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} />; })}
      </g>
      <polygon points={shape} fill="rgba(91,160,208,0.28)" stroke="var(--blue-bright)" strokeWidth="1.6" />
      {attrs.map((d, i) => { const [x, y] = pt(i, R * norm(d.value)); return <circle key={i} cx={x} cy={y} r="2.2" fill="var(--blue-bright)" />; })}
      {attrs.map((d, i) => {
        const [lx, ly] = pt(i, R + 13);
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="ar-label">
            {d.label} <tspan className="ar-val">{d.value}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

// perfil completo do jogador (modal, só leitura). Atributos em barras + idade,
// potencial, fase, valor/salário/contrato e as STATS DE CARREIRA acumuladas
// (rating/K-D/ADR/KAST/mapas). O jogador da carreira não edita nada aqui — os
// atributos sobem sozinhos com a evolução; quem edita é o admin no CRM.
// abreviação curta da função pro cartão
const ROLE_ABBR: Record<Role, string> = { AWP: 'AWP', IGL: 'IGL', Rifler: 'RIF', Entry: 'ENT', Support: 'SUP', Lurker: 'LUR' };
// raridade do cartão pelo OVR (estilo FUT): ícone > ouro > prata > bronze
function cardTier(ovr: number): 'icon' | 'gold' | 'silver' | 'bronze' {
  return ovr >= 90 ? 'icon' : ovr >= 86 ? 'gold' : ovr >= 80 ? 'silver' : 'bronze';
}

// cartão de jogador estilo FIFA Ultimate Team (o "rosto" do jogador)
function PlayerCard({ player, ovr }: { player: Player; ovr: number }) {
  const tier = cardTier(ovr);
  const stats: [string, number][] = [
    ['MIR', player.aim], ['AWP', player.awp], ['IGL', player.igl], ['CLT', player.clutch],
  ];
  return (
    <div className={`fut-card fut-${tier}`}>
      <div className="fut-top">
        <div className="fut-rating">
          <span className="fut-ovr">{ovr}</span>
          <span className="fut-role">{ROLE_ABBR[player.role]}</span>
          <Flag cc={player.country} />
        </div>
        <PlayerAvatar nick={player.nick} size={62} />
      </div>
      <div className="fut-name">{player.nick}</div>
      <div className="fut-stats">
        {stats.map(([k, v]) => (
          <div key={k} className="fut-stat"><b>{v}</b><span>{k}</span></div>
        ))}
      </div>
    </div>
  );
}

function PlayerProfile({ player, split, career, cur, contractUntil, evoTotal, morale, peakOvr, focused, onToggleFocus, onClose, youthAge }: {
  player: Player;
  split: number;
  career: ReturnType<typeof deriveCareer>;
  cur?: SeasonStat;
  contractUntil?: number;
  evoTotal: number;
  morale: number;
  peakOvr: number;
  focused: boolean;
  onToggleFocus: () => void;
  onClose: () => void;
  youthAge?: Record<string, number>;
}) {
  const mi = moraleInfo(morale);
  const age = effectiveAge(player, split, youthAge);
  const pot = playerPotentialOvr(player, age);
  const tier = potentialTier(pot);
  const phase = playerPhase(player.id, age);
  const ovr = playerOvr(player);
  const left = contractUntil != null ? contractUntil - split + 1 : null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal player-profile" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}>✕</button>
        <div className="pp-head">
          <PlayerCard player={player} ovr={ovr} />
          <div className="pp-id">
            <div className="pp-nick"><Flag cc={player.country} /> {player.nick}
              <span className={`role-pill ${player.role}`} style={{ marginLeft: 8 }}>{player.role}</span>
            </div>
            <div className="muted small">{player.name}</div>
            <div className="pp-tags">
              <span className="pp-tag">{age} anos</span>
              <span className={`pp-tag pot-${tier}`}>POT {tier} ({pot})</span>
              <span className="pp-tag" title="Maior OVR já alcançado">★ Pico {peakOvr}</span>
              <span className="pp-tag">{PHASE_LABEL[phase]}</span>
              <span className={`pp-tag mood-${mi.cls}`} title={`Moral: ${mi.label} (${morale}/100)`}>{mi.icon} {mi.label}</span>
              {focused && <span className="pp-tag focus">🎯 em treino</span>}
            </div>
          </div>
        </div>

        <div className="pp-grid">
          <div className="pp-col">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Atributos
              {evoTotal > 0 && <span className="cs-grew"> ▲{evoTotal} na carreira</span>}
            </div>
            <AttrRadar attrs={[
              { label: 'Mira', value: player.aim },
              { label: 'AWP', value: player.awp },
              { label: 'IGL', value: player.igl },
              { label: 'Clutch', value: player.clutch },
              { label: 'Consist.', value: player.consistency },
            ]} />
            <div className="attr-bars">
              <AttrBar label="Mira" value={player.aim} />
              <AttrBar label="Consist." value={player.consistency} />
              <AttrBar label="Clutch" value={player.clutch} />
              <AttrBar label="AWP" value={player.awp} />
              <AttrBar label="IGL" value={player.igl} />
            </div>
            <div className="pp-fin">
              <div><span className="muted small">Valor</span><b>{formatMoney(playerValue({ ...player, ovr }))}</b></div>
              <div><span className="muted small">Salário/split</span><b className="neg">{formatMoney(playerWage(player))}</b></div>
              <div><span className="muted small">Contrato</span><b>{left == null ? '-' : left <= 0 ? 'vencido' : `${left} split${left > 1 ? 's' : ''}`}</b></div>
            </div>
          </div>
          <div className="pp-col">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Estatísticas de carreira</div>
            {career ? (
              <div className="pp-stats">
                <div className="pp-stat"><b>{career.rating.toFixed(2)}</b><span>Rating 2.0</span></div>
                <div className="pp-stat"><b>{career.kd.toFixed(2)}</b><span>K/D</span></div>
                <div className="pp-stat"><b>{career.adr.toFixed(0)}</b><span>ADR</span></div>
                <div className="pp-stat"><b>{career.kastPct.toFixed(0)}%</b><span>KAST</span></div>
                <div className="pp-stat"><b>{career.kills}</b><span>Abates</span></div>
                <div className="pp-stat"><b>{career.maps}</b><span>Mapas</span></div>
              </div>
            ) : (
              <p className="muted small">Sem partidas registradas ainda. As stats aparecem (e sobem) conforme ele joga e evolui.</p>
            )}
            {cur && (
              <>
                <div className="muted small section-label">Neste split</div>
                <div className="pp-cur">
                  <span>rating <b>{cur.rating.toFixed(2)}</b></span>
                  <span>K/D <b>{cur.kd.toFixed(2)}</b></span>
                  <span>ADR <b>{cur.adr.toFixed(0)}</b></span>
                </div>
              </>
            )}
            <button className={`btn small${focused ? ' gold' : ''}`} style={{ marginTop: 12 }} onClick={onToggleFocus}>
              {focused ? '🎯 Tirar do foco de treino' : '🎯 Pôr em foco de treino'}
            </button>
            <p className="muted small" style={{ marginTop: 8 }}>
              Os atributos não são editáveis aqui: sobem sozinhos com a evolução. O foco de treino acelera o desenvolvimento neste split.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// seletor do plano de jogo pré-partida (decisão do usuário, com buff real)
function GamePlanPicker({ plan, onPick }: { plan: GamePlan; onPick: (p: GamePlan) => void }) {
  return (
    <div className="gameplan-picker">
      <span className="muted small gp-title">🎯 Plano de jogo</span>
      <div className="gp-chips">
        {GAME_PLANS.map((g) => (
          <button key={g.id} className={`gp-chip${plan === g.id ? ' on' : ''}`} title={g.desc} onClick={() => onPick(g.id)}>
            {g.icon} {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// linha de confronto reaproveitada (overview e resultados)
function MatchLine({ league, m, onOpen }: {
  league: League;
  m: { a: string; b: string; result?: SeriesResult };
  onOpen: (s: { series: SeriesResult; teams: [TTeam, TTeam] }) => void;
}) {
  const a = leagueTeam(league, m.a);
  const b = leagueTeam(league, m.b);
  const mine = m.a === 'user' || m.b === 'user';
  return (
    <div className={`matchline${m.result ? ' clickable' : ''}`}
      onClick={() => m.result && onOpen({ series: m.result, teams: [a, b] })}>
      <span className={`side${mine && m.a === 'user' ? ' human' : ''}`}>
        <TeamBadge tag={a.tag} colors={a.colors} size={18} logoUrl={a.logoUrl} />
        <span className="tname">{a.name}</span>
      </span>
      {m.result ? (
        <span className="score">
          <span className={m.result.winner === 0 ? 'w' : 'l'}>{m.result.mapScore[0]}</span>
          {' : '}
          <span className={m.result.winner === 1 ? 'w' : 'l'}>{m.result.mapScore[1]}</span>
        </span>
      ) : (
        <span className="score muted">vs</span>
      )}
      <span className={`side right${mine && m.b === 'user' ? ' human' : ''}`}>
        <span className="tname">{b.name}</span>
        <TeamBadge tag={b.tag} colors={b.colors} size={18} logoUrl={b.logoUrl} />
      </span>
    </div>
  );
}

const PLACE_SHORT: Record<PlacementCode, string> = {
  champion: 'Campeão', runnerup: 'Vice', semi: 'Semi', quarters: 'Quartas', playoffs: 'Playoffs', swiss: 'Suíça',
};

// fase de grupos GSL: 2 grupos com classificação (1-4) e os jogos por estágio.
// compact = só a classificação (cabe no card lateral). full = + jogos clicáveis.
function GSLGroups({ league, onOpen, compact }: {
  league: League;
  onOpen: (s: { series: SeriesResult; teams: [TTeam, TTeam] }) => void;
  compact?: boolean;
}) {
  const groups = gslGroupView(league);
  return (
    <div className={`gsl-groups${compact ? ' compact' : ''}`}>
      {groups.map((g) => (
        <div key={g.key} className="gsl-group">
          <div className="gsl-group-head">Grupo {g.key} <span className="muted small">· top 2 avançam</span></div>
          <div className="gsl-standings">
            {[...g.teams].sort((x, y) => (g.place[x] || 9) - (g.place[y] || 9)).map((id) => {
              const t = leagueTeam(league, id);
              const pl = g.place[id];
              return (
                <div key={id} className={`gsl-st-row${pl && pl <= 2 ? ' adv' : pl ? ' out' : ''}${id === 'user' ? ' me' : ''}`}>
                  <span className="gsl-pl">{pl || '–'}</span>
                  <TeamBadge tag={t.tag} colors={t.colors} size={16} logoUrl={t.logoUrl} />
                  <span className="gsl-st-name">{t.name}</span>
                  {pl && pl <= 2 ? <span className="gsl-q" title="Classificado">✓</span> : null}
                </div>
              );
            })}
          </div>
          {!compact && (
            <>
              <div className="gsl-stage-label">Abertura · MD1</div>
              {g.opening.map((m, i) => <MatchLine key={`o${i}`} league={league} m={m} onOpen={onOpen} />)}
              {g.winners && (
                <>
                  <div className="gsl-stage-label">Vencedores · Eliminação · MD3</div>
                  <MatchLine league={league} m={g.winners} onOpen={onOpen} />
                  {g.elim && <MatchLine league={league} m={g.elim} onOpen={onOpen} />}
                </>
              )}
              {g.decider && (
                <>
                  <div className="gsl-stage-label">Decisão · MD3</div>
                  <MatchLine league={league} m={g.decider} onOpen={onOpen} />
                </>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// célula de confronto no estilo do bracket do Major (duas linhas + placar)
function GslBrCell({ league, m, onOpen }: {
  league: League;
  m?: LeagueMatch;
  onOpen: (s: { series: SeriesResult; teams: [TTeam, TTeam] }) => void;
}) {
  if (!m) {
    return <div className="hb-match empty"><div className="hb-row ghost">?</div><div className="hb-row ghost">?</div></div>;
  }
  const a = leagueTeam(league, m.a);
  const b = leagueTeam(league, m.b);
  const r = m.result;
  const row = (t: TTeam, sc: number | undefined, loser: boolean) => (
    <div className={`hb-row${loser ? ' loser' : ''}${t.id === 'user' ? ' is-user' : ''}`}>
      <TeamBadge tag={t.tag} colors={t.colors} size={18} logoUrl={t.logoUrl} />
      <span className="hb-tag">{t.tag}</span>
      <span className="hb-score">{sc ?? '–'}</span>
    </div>
  );
  return (
    <div className={`hb-match${r ? ' clickable' : ''}`}
      onClick={r ? () => onOpen({ series: r, teams: [a, b] }) : undefined}
      title={r ? 'Ver estatísticas da série' : undefined}>
      {row(a, r?.mapScore[0], !!r && r.winner === 1)}
      {row(b, r?.mapScore[1], !!r && r.winner === 0)}
    </div>
  );
}

// CHAVE DEDICADA do GSL (dupla eliminação por grupo), no mesmo visual do Major:
// Abertura (MD1) → Vencedores/Eliminação (MD3) → Decisão (MD3) → Classificados.
function GSLBracket({ league, onOpen }: {
  league: League;
  onOpen: (s: { series: SeriesResult; teams: [TTeam, TTeam] }) => void;
}) {
  const groups = gslGroupView(league);
  const token = (id: string, tone: 'adv' | 'elim', place: number) => {
    const t = leagueTeam(league, id);
    return (
      <div key={id} className={`hb-token ${tone}${id === 'user' ? ' is-user' : ''}`}>
        <TeamBadge tag={t.tag} colors={t.colors} size={18} logoUrl={t.logoUrl} />
        <span>{t.tag}</span>
        <span className="gsl-br-seed">{place}º</span>
      </div>
    );
  };
  return (
    <div className="gsl-bracket">
      {groups.map((g) => {
        const ordered = [...g.teams].sort((x, y) => (g.place[x] || 9) - (g.place[y] || 9));
        const adv = ordered.filter((id) => (g.place[id] ?? 9) <= 2);
        const out = ordered.filter((id) => (g.place[id] ?? 9) >= 3);
        return (
          <div key={g.key} className="gsl-br-group">
            <div className="gsl-br-title">Grupo {g.key} <span className="muted small">· dupla eliminação · top 2 avançam</span></div>
            <div className="hb-scroll">
              <div className="hb-col">
                <div className="hb-reclabel">Abertura · MD1</div>
                <div className="hb-group">
                  {g.opening.map((m, i) => <GslBrCell key={i} league={league} m={m} onOpen={onOpen} />)}
                </div>
              </div>
              <div className="hb-col">
                <div className="hb-reclabel">Vencedores / Eliminação · MD3</div>
                <div className="hb-group">
                  <div className="gsl-br-sub adv">⬆ Vencedores (1º)</div>
                  <GslBrCell league={league} m={g.winners} onOpen={onOpen} />
                  <div className="gsl-br-sub elim">⬇ Eliminação (4º)</div>
                  <GslBrCell league={league} m={g.elim} onOpen={onOpen} />
                </div>
              </div>
              <div className="hb-col">
                <div className="hb-reclabel">Decisão · MD3</div>
                <div className="hb-group">
                  <div className="gsl-br-sub">Vaga final (2º/3º)</div>
                  <GslBrCell league={league} m={g.decider} onOpen={onOpen} />
                </div>
              </div>
              <div className="hb-col">
                <div className="hb-reclabel">Resultado</div>
                <div className="hb-resultbox adv">
                  <div className="hb-resultbox-title">✓ Classificados</div>
                  {adv.length ? adv.map((id) => token(id, 'adv', g.place[id])) : <div className="hb-row ghost">?</div>}
                </div>
                <div className="hb-resultbox elim">
                  <div className="hb-resultbox-title">✕ Eliminados</div>
                  {out.length ? out.map((id) => token(id, 'elim', g.place[id])) : <div className="hb-row ghost">?</div>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ranking de jogadores (destaques da temporada)
function BestPlayers({ stats, mine, ranked }: { stats: SeasonStat[]; mine: Set<string>; ranked?: boolean }) {
  if (stats.length === 0) return <p className="muted small">Os destaques aparecem após as primeiras partidas.</p>;
  return (
    <div className="best-players">
      {stats.map((s, i) => (
        <div key={s.id} className={`bp-row${mine.has(s.id) ? ' mine' : ''}`}>
          {ranked && <span className="bp-rank">{i + 1}</span>}
          <PlayerAvatar nick={s.nick} size={26} />
          <span className="bp-nick"><Flag cc={s.country} /> {s.nick} <span className="muted small">{s.teamTag}</span></span>
          <span className="bp-rating">{s.rating.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

// painel de detalhe de um time da tabela (elenco, técnico, força)
// Cerimônia do Top 20 HLTV ao fim de cada temporada — revelação dos 20 melhores
// jogadores do ano, com o #1 em destaque e os seus jogadores realçados.
function Top20Ceremony({ entries, mine, orgTag, split, circuit, onClose }: {
  entries: { p: Player; team: TeamSeason; rating: number; mvps?: number; sl?: HltvStat; role?: Role }[];
  mine: Set<string>;
  orgTag: string;
  split: number;
  circuit: string;
  onClose: () => void;
}) {
  const top1 = entries[0];
  const rest = entries.slice(1, 20);
  // jogador do SEU elenco mostra a SUA org, não o clube de origem (bug do m0NESY)
  const tagOf = (e: { p: Player; team: TeamSeason }) => (mine.has(e.p.id) ? orgTag : e.team.tag);
  return (
    <div className="modal-backdrop ceremony-backdrop" onClick={onClose}>
      <div className="ceremony" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}>✕</button>
        <div className="cer-head">
          <div className="cer-kicker">Premiação de fim de temporada · Temporada {seasonOf(split)} · {circuit}</div>
          <h2>🏆 Ranking HLTV — Top 20 do ano</h2>
        </div>
        {top1 && (
          <div className={`cer-one${mine.has(top1.p.id) ? ' mine' : ''}`}>
            <span className="cer-1-badge">HLTV #1</span>
            <PlayerAvatar nick={top1.p.nick} size={62} />
            <div className="cer-1-id">
              <div className="cer-1-nick"><Flag cc={top1.p.country} /> {top1.p.nick}</div>
              <div className="muted small">{tagOf(top1)} · {top1.p.name}</div>
              {!!top1.mvps && <div className="t20-mvp" style={{ marginTop: 4 }}>🏆 {top1.mvps}× MVP de torneio no ano</div>}
            </div>
            <div className="cer-1-rating">{top1.rating.toFixed(2)}<span>rating</span></div>
          </div>
        )}
        <div className="cer-list">
          {rest.map((e, i) => (
            <div key={e.p.id} className={`cer-row${mine.has(e.p.id) ? ' mine' : ''}`} style={{ animationDelay: `${0.1 + i * 0.045}s` }}>
              <span className="cer-rank">{i + 2}</span>
              <PlayerAvatar nick={e.p.nick} size={24} />
              <span className="cer-nick"><Flag cc={e.p.country} /> {e.p.nick} <span className="muted small">{tagOf(e)}</span>{!!e.mvps && <span className="t20-mvp" style={{ marginLeft: 6 }}>{e.mvps}× MVP</span>}</span>
              <span className="cer-rating">{e.rating.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="center" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function TeamDetail({ team, league, onClose }: { team: TTeam; league?: League | null; onClose: () => void }) {
  // histórico por mapa do time nesta temporada (séries já jogadas na liga)
  const mapStats = useMemo(() => {
    const rec: Record<string, { w: number; l: number; rf: number; ra: number }> = {};
    if (league) {
      for (const round of league.rounds) for (const m of round) {
        if (!m.result || (m.a !== team.id && m.b !== team.id)) continue;
        const side = m.a === team.id ? 0 : 1;
        for (const mp of m.result.maps) {
          const r = (rec[mp.map] ??= { w: 0, l: 0, rf: 0, ra: 0 });
          if (mp.winner === side) r.w++; else r.l++;
          r.rf += mp.score[side]; r.ra += mp.score[side === 0 ? 1 : 0];
        }
      }
    }
    return Object.entries(rec).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l) || b[1].w - a[1].w);
  }, [league, team.id]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card team-detail" onClick={(e) => e.stopPropagation()}>
        <div className="td-head">
          <TeamBadge tag={team.tag} colors={team.colors} size={42} logoUrl={team.logoUrl} />
          <div>
            <div className="td-name"><Flag cc={team.country} /> {team.name}</div>
            <div className="muted small">{team.wins}-{team.losses} · saldo {team.roundDiff >= 0 ? '+' : ''}{team.roundDiff} · força {team.strength.toFixed(1)}</div>
          </div>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="td-body">
          {team.players.map((p) => (
            <div key={p.id} className="cs-row">
              <PlayerAvatar nick={p.nick} size={28} />
              <span className="cs-nick"><Flag cc={p.country} /> {p.nick}</span>
              <span className={`role-pill ${p.role}`}>{p.role}</span>
              <span className="cs-ovr">{p.ovr}</span>
            </div>
          ))}
          {team.coach && <div className="td-coach muted small">Técnico: <b>{team.coach.nick}</b> ({team.coach.rating})</div>}
          <div className="muted small section-label">Mapas na temporada</div>
          {mapStats.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>Sem partidas jogadas ainda nesta temporada.</p>
          ) : (
            <table className="stats td-maps">
              <thead><tr><th style={{ textAlign: 'left' }}>Mapa</th><th>V-D</th><th>Rounds</th><th>Aprov.</th></tr></thead>
              <tbody>
                {mapStats.map(([mp, r]) => {
                  const tot = r.w + r.l;
                  const pct = Math.round((r.w / tot) * 100);
                  return (
                    <tr key={mp}>
                      <td style={{ textAlign: 'left' }}>{MAP_LABELS[mp as MapId] ?? mp}</td>
                      <td><b className={r.w >= r.l ? 'pos' : 'neg'}>{r.w}-{r.l}</b></td>
                      <td className="muted">{r.rf}:{r.ra}</td>
                      <td className={pct >= 50 ? 'pos' : 'neg'}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ----- agregações para a aba de história / destaques -----
interface SeasonStat { id: string; nick: string; teamTag: string; country: string; role: string; rating: number; kd: number; adr: number; maps: number; }

function seasonPlayerStats(l: League): SeasonStat[] {
  const meta = new Map<string, { nick: string; teamTag: string; country: string; role: string }>();
  for (const t of l.teams) for (const p of t.players) meta.set(p.id, { nick: p.nick, teamTag: t.tag, country: p.country, role: p.role });
  const agg = new Map<string, { k: number; d: number; a: number; dmg: number; kast: number; r: number }>();
  for (const round of l.rounds) {
    for (const m of round) {
      if (!m.result) continue;
      for (const map of m.result.maps) {
        for (const [id, st] of Object.entries(map.stats)) {
          const cur = agg.get(id) ?? { k: 0, d: 0, a: 0, dmg: 0, kast: 0, r: 0 };
          cur.k += st.both.kills; cur.d += st.both.deaths; cur.a += st.both.assists;
          cur.dmg += st.both.dmg; cur.kast += st.both.kastRounds; cur.r += st.both.rounds;
          agg.set(id, cur);
        }
      }
    }
  }
  const out: SeasonStat[] = [];
  for (const [id, s] of agg) {
    if (s.r < 1) continue;
    const kpr = s.k / s.r, dpr = s.d / s.r, apr = s.a / s.r, kast = s.kast / s.r, adr = s.dmg / s.r;
    const impact = Math.max(0, 2.13 * kpr + 0.42 * apr - 0.41);
    // rating estilo HLTV 2.0 (média ~1.0)
    const rating = Math.max(0, 0.0073 * kast * 100 + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587);
    const md = meta.get(id);
    if (!md) continue;
    out.push({ id, nick: md.nick, teamTag: md.teamTag, country: md.country, role: md.role, rating, kd: s.d ? s.k / s.d : s.k, adr, maps: 0 });
  }
  return out.sort((a, b) => b.rating - a.rating);
}

// soma as stats brutas do split (todas as partidas da liga) na carreira de cada
// jogador. Roda ao fechar o split. As stats sobem sozinhas conforme o jogador
// evolui (atributos melhores => melhor desempenho nas partidas => rating maior).
function accumulateCareerStats(prev: Record<string, CareerStatLine> | undefined, l: League): Record<string, CareerStatLine> {
  const out: Record<string, CareerStatLine> = { ...(prev ?? {}) };
  const seenThisSplit = new Set<string>();
  for (const round of l.rounds) {
    for (const m of round) {
      if (!m.result) continue;
      for (const map of m.result.maps) {
        for (const [id, st] of Object.entries(map.stats)) {
          const cur = out[id] ?? { k: 0, d: 0, a: 0, dmg: 0, kast: 0, rounds: 0, maps: 0, splits: 0 };
          cur.k += st.both.kills; cur.d += st.both.deaths; cur.a += st.both.assists;
          cur.dmg += st.both.dmg; cur.kast += st.both.kastRounds; cur.rounds += st.both.rounds;
          cur.maps += 1;
          if (!seenThisSplit.has(id)) { cur.splits += 1; seenThisSplit.add(id); }
          out[id] = cur;
        }
      }
    }
  }
  return out;
}

// deriva rating (HLTV 2.0), K/D, ADR e KAST% de uma linha de carreira acumulada
function deriveCareer(s: CareerStatLine | undefined) {
  if (!s || s.rounds < 1) return null;
  const kpr = s.k / s.rounds, dpr = s.d / s.rounds, apr = s.a / s.rounds;
  const kast = s.kast / s.rounds, adr = s.dmg / s.rounds;
  const impact = Math.max(0, 2.13 * kpr + 0.42 * apr - 0.41);
  const rating = Math.max(0, 0.0073 * kast * 100 + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587);
  return { rating, kd: s.d ? s.k / s.d : s.k, adr, kastPct: kast * 100, maps: s.maps, kills: s.k, splits: s.splits };
}

function aggregateHistory(h: SplitRecord[]) {
  let circuitTitles = 0, majorApps = 0, totalPrize = 0, bestPos = 99;
  for (const r of h) {
    if (r.champion) circuitTitles++;
    if (r.major) majorApps++;
    totalPrize += r.prize;
    if (r.position && r.position < bestPos) bestPos = r.position;
  }
  return {
    circuitTitles, majorApps, totalPrize,
    bestPlacement: bestPos === 99 ? '-' : `${bestPos}º`,
  };
}

function CareerTable({ table, highlightTop = 0, onPick, detailed }: {
  table: TTeam[];
  highlightTop?: number;
  onPick?: (t: TTeam) => void;
  detailed?: boolean;
}) {
  return (
    <table className="stats">
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>#</th>
          <th style={{ textAlign: 'left' }}>Time</th>
          <th>V</th>
          <th>D</th>
          <th>Saldo</th>
          {detailed && <th>Força</th>}
        </tr>
      </thead>
      <tbody>
        {table.map((t, i) => (
          <tr
            key={t.id}
            className={`${t.id === 'user' ? 'human-row' : ''}${highlightTop && i < highlightTop ? ' qualify-row' : ''}${onPick ? ' clickable' : ''}`}
            onClick={() => onPick?.(t)}
          >
            <td style={{ textAlign: 'left' }}>{i + 1}</td>
            <td style={{ textAlign: 'left', fontWeight: t.id === 'user' ? 700 : 400 }}>
              <span className="ct-team">
                <TeamBadge tag={t.tag} colors={t.colors} size={18} logoUrl={t.logoUrl} />
                {t.name}
              </span>
            </td>
            <td className="pos">{t.wins}</td>
            <td className="neg">{t.losses}</td>
            <td>{t.roundDiff > 0 ? `+${t.roundDiff}` : t.roundDiff}</td>
            {detailed && <td>{t.strength.toFixed(1)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- overlay de simulação rápida (mini partida acelerada) ----------
function QuickSimOverlay({ series, teams, userIdx, label, onDone }: {
  series: SeriesResult;
  teams: [TTeam, TTeam];
  userIdx: 0 | 1;
  label: string;
  onDone: () => void;
}) {
  const [mapIdx, setMapIdx] = useState(0);
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(false);
  const [showStats, setShowStats] = useState(false); // scoreboard completo da série

  // avança 1 round por vez, bem rápido (muito mais que o normal, mas visível)
  useEffect(() => {
    if (done) return;
    const map = series.maps[mapIdx];
    if (!map) { setDone(true); return; }
    if (round >= map.roundLog.length) {
      if (mapIdx + 1 >= series.maps.length) { setDone(true); return; }
      const t = setTimeout(() => { setMapIdx(mapIdx + 1); setRound(0); }, 380);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRound((r) => r + 1), 28);
    return () => clearTimeout(t);
  }, [mapIdx, round, done, series]);

  const map = series.maps[mapIdx];
  const log = map ? map.roundLog.slice(0, round) : [];
  const sa = log.filter((w) => w === 0).length;
  const sb = log.filter((w) => w === 1).length;
  // mapas já decididos (placar de mapas)
  const mapsWonA = series.maps.slice(0, mapIdx).filter((m) => m.winner === 0).length;
  const mapsWonB = series.maps.slice(0, mapIdx).filter((m) => m.winner === 1).length;

  const Side = ({ t, sc, idx }: { t: TTeam; sc: number; idx: 0 | 1 }) => (
    <div className={`qs-side${idx === userIdx ? ' mine' : ''}`}>
      <TeamBadge tag={t.tag} colors={t.colors} size={48} logoUrl={t.logoUrl} />
      <div className="qs-name">{t.name}</div>
      <div className="qs-score">{sc}</div>
    </div>
  );

  return (
    <div className="modal-backdrop" style={{ alignItems: 'center' }}>
      <div className="qs-card">
        <div className="qs-label">{label} · simulação rápida</div>
        <div className="qs-board">
          <Side t={teams[0]} sc={sa} idx={0} />
          <div className="qs-mid">
            <div className="qs-map">{map ? map.map.toUpperCase() : 'FIM'}</div>
            <div className="qs-vs">vs</div>
            <div className="qs-mapscore">{mapsWonA} - {mapsWonB} <span className="muted small">mapas</span></div>
          </div>
          <Side t={teams[1]} sc={sb} idx={1} />
        </div>
        <div className="qs-foot">
          {done ? (
            <>
              <span className="qs-final">
                {series.winner === userIdx ? 'Vitória!' : 'Derrota'} · {series.mapScore[0]}-{series.mapScore[1]}
              </span>
              <button className="btn ghost small" onClick={() => setShowStats(true)}>📊 Ver stats</button>
              <button className="btn small" onClick={onDone}>Continuar →</button>
            </>
          ) : (
            <button className="btn ghost small" onClick={() => setDone(true)}>Pular ⏭</button>
          )}
        </div>
      </div>
      {showStats && (
        <div className="modal-backdrop" onClick={() => setShowStats(false)}>
          <div className="modal scoreboard-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={() => setShowStats(false)}>✕</button>
            <Scoreboard series={series} teams={teams} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- feed da janela de transferências ----------
function TransferFeed({ items, compact }: { items: TransferItem[]; compact?: boolean }) {
  const list = compact ? items.slice(0, 6) : items;
  if (list.length === 0) return <p className="muted small">Mercado parado por enquanto.</p>;
  return (
    <div className="transfer-feed">
      {list.map((tr, i) => (
        <div key={i} className="tf-row">
          <Flag cc={tr.cc} />
          <span className="tf-nick">{tr.nick}</span>
          <span className="tf-move"><b>{tr.from}</b> <span className="muted">→</span> <b className="pos">{tr.to}</b></span>
          <span className="tf-fee muted small">{formatMoney(tr.fee)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- bracket do playoff do circuito ----------
function PlayoffBracket({ p, teamOf, onOpen }: {
  p: Playoff;
  teamOf: (id: string) => TTeam;
  onOpen: (s: SeriesResult, ts: [TTeam, TTeam]) => void;
}) {
  // mesma linguagem visual do bracket do Major (hb-*): colunas lado a lado com
  // conector tracejado e a coluna do campeão (caixa de troféu) no fim.
  const row = (id?: string, score?: number, loser?: boolean, seed?: number) => {
    if (!id) return <div className="hb-row ghost">?</div>;
    const t = teamOf(id);
    return (
      <div className={`hb-row po-hb-row${loser ? ' loser' : ''}${id === 'user' ? ' is-user' : ''}`}>
        {seed != null && <span className="po-seed">{seed}</span>}
        <TeamBadge tag={t.tag} colors={t.colors} size={18} logoUrl={t.logoUrl} />
        <span className="hb-tag po-hb-name"><Flag cc={t.country} /> {t.name}</span>
        <span className="hb-score">{score ?? '–'}</span>
      </div>
    );
  };
  const cell = (m: PlayoffMatch | null, seeds?: [number, number]) => {
    if (!m || !m.a) return (
      <div className="hb-match po-hb-match empty"><div className="hb-row ghost">?</div><div className="hb-row ghost">?</div></div>
    );
    const w = poWinner(m);
    const r = m.result;
    return (
      <div className={`hb-match po-hb-match${r ? ' clickable' : ''}`}
        onClick={() => r && onOpen(r, [teamOf(m.a), teamOf(m.b)])}
        title={r ? 'Ver estatísticas da série' : undefined}>
        {row(m.a, r?.mapScore[0], !!w && w !== m.a, seeds?.[0])}
        {row(m.b, r?.mapScore[1], !!w && w !== m.b, seeds?.[1])}
      </div>
    );
  };
  const champ = p.champion ? teamOf(p.champion) : null;
  return (
    <div className="panel">
      <div className="panel-head">{p.circuit} · Playoffs (mata-mata)</div>
      <div className="panel-body">
        <div className="hb-scroll playoff">
          {p.qf && (
            <div className="hb-col">
              <div className="hb-reclabel">Quartas · MD3</div>
              <div className="hb-group playoff-group">
                {cell(p.qf[0], [1, 8])}
                {cell(p.qf[1], [4, 5])}
                {cell(p.qf[2], [2, 7])}
                {cell(p.qf[3], [3, 6])}
              </div>
            </div>
          )}
          <div className="hb-col">
            <div className="hb-reclabel">Semifinal · MD3</div>
            <div className="hb-group playoff-group">
              {cell(p.sf[0].a ? p.sf[0] : null, p.qf ? undefined : [1, 4])}
              {cell(p.sf[1].a ? p.sf[1] : null, p.qf ? undefined : [2, 3])}
            </div>
          </div>
          <div className="hb-col">
            <div className="hb-reclabel">Grande final · MD5</div>
            <div className="hb-group playoff-group">
              {cell(p.final)}
            </div>
          </div>
          <div className="hb-col">
            <div className="hb-reclabel">Campeão</div>
            <div className="hb-resultbox adv" style={{ minWidth: 150 }}>
              <div className="hb-resultbox-title">🏆 Troféu</div>
              {champ ? (
                <div className={`hb-token adv${champ.isUser ? ' is-user' : ''}`} style={{ fontSize: 13 }}>
                  <TeamBadge tag={champ.tag} colors={champ.colors} size={24} logoUrl={champ.logoUrl} />
                  <span><Flag cc={champ.country} /> {champ.name}</span>
                </div>
              ) : (
                <div className="hb-row ghost">a definir</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- escolha do campeonato ----------
interface CircuitOption {
  id: string;
  name: string;
  desc: string;
  teams: TeamSeason[];
  spots: number;
  prizeMult: number;
  vrsWeight: number;
  tier: number;
}
function CircuitPicker({ circuits, split, playerTier, relocate, onRelocate, onPick, onBack }: {
  circuits: CircuitOption[];
  split: number;
  playerTier: number;
  relocate: { from: MacroRegion; to: MacroRegion } | null;
  onRelocate: () => void;
  onPick: (c: CircuitOption) => void;
  onBack: () => void;
}) {
  // você só entra em circuitos do SEU tier ou mais fáceis (tier maior). Subir de
  // tier libera os circuitos de cima (o Tier 1 / BLAST é o caminho do Major).
  const canEnter = (opt: CircuitOption) => opt.tier >= playerTier;
  const firstOk = Math.max(0, circuits.findIndex((o) => canEnter(o)));
  const [sel, setSel] = useState(firstOk);
  // os circuitos mudam ao realocar de região: reposiciona a seleção num válido
  useEffect(() => { setSel(Math.max(0, circuits.findIndex((o) => canEnter(o)))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [circuits]);
  const c = circuits[sel];
  const cOk = c && canEnter(c);
  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 900, margin: '24px auto' }}>
        <div className="panel-head">
          Divisões · Split {split} · você está no {TIER_NAMES[playerTier]}
          <span className="spacer" />
          <button className="btn" onClick={onBack}>← Mercado</button>
        </div>
        <div className="panel-body">
          {relocate && (
            <div className="relocate-banner">
              🌍 Seu <b>core</b> mudou: agora é da <b>{MACRO_REGION_LABELS[relocate.to]}</b>, mas você compete na <b>{MACRO_REGION_LABELS[relocate.from]}</b>.
              {' '}Quer <b>realocar a org para a {MACRO_REGION_LABELS[relocate.to]}</b>? A bandeira do time passa a ser a dessa região.
              <button className="btn small" onClick={onRelocate}>Mudar para {MACRO_REGION_LABELS[relocate.to]}</button>
            </div>
          )}
          <p className="muted small">Cada circuito é um <b>tier</b>. Você joga no seu tier ou abaixo; vencer o seu circuito te <b>promove</b>, terminar no fundo te <b>rebaixa</b>. Só o <b>Tier 1</b> dá vaga no Major.</p>
          <div className="circuit-cards">
            {circuits.map((opt, i) => {
              const locked = !canEnter(opt);
              return (
                <button key={opt.id} className={`circuit-card${sel === i ? ' on' : ''}${locked ? ' locked' : ''}`} onClick={() => setSel(i)}>
                  <div className="cc-name">
                    <span className={`tier-badge t${opt.tier}`}>TIER {opt.tier}</span> {opt.name}
                  </div>
                  <div className="cc-desc muted small">{opt.desc}</div>
                  <div className="cc-meta">
                    <span>{opt.spots} {opt.spots === 1 ? 'vaga' : 'vagas'} ao Major</span>
                    <span>prêmio ×{opt.prizeMult}</span>
                    <span>VRS ×{opt.vrsWeight.toFixed(2)}</span>
                  </div>
                  {locked && <div className="cc-lock muted small">🔒 Suba ao {TIER_NAMES[opt.tier]} para disputar</div>}
                </button>
              );
            })}
          </div>
          {c && (
            <>
              <div className="muted small section-label">Times confirmados no {c.name}</div>
              <div className="circuit-teams">
                {c.teams.map((t) => (
                  <div key={t.id} className="cteam">
                    <TeamBadge tag={t.tag} colors={t.colors} size={28} logoUrl={t.logoUrl ?? logoForTeam(t)} />
                    <span className="ct-tname"><Flag cc={t.country} /> {t.team}</span>
                    <span className={`tier-badge t${teamTier(t)}`}>T{teamTier(t)}</span>
                  </div>
                ))}
              </div>
              <div className="center" style={{ marginTop: 16 }}>
                {cOk ? (
                  <button className="btn gold big" onClick={() => onPick(c)}>Disputar o {c.name}</button>
                ) : (
                  <div className="muted">🔒 Você precisa estar no {TIER_NAMES[c.tier]} para disputar este circuito. Suba vencendo o seu tier atual.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// emblemas do construtor de logo (SVG inline gerado a partir das cores + tag)
type EmblemId = 'shield' | 'circle' | 'hexagon' | 'bolt' | 'star' | 'diamond';
const EMBLEMS: { id: EmblemId; label: string }[] = [
  { id: 'shield', label: 'Escudo' },
  { id: 'circle', label: 'Círculo' },
  { id: 'hexagon', label: 'Hexágono' },
  { id: 'bolt', label: 'Raio' },
  { id: 'star', label: 'Estrela' },
  { id: 'diamond', label: 'Losango' },
];

function emblemShape(id: EmblemId, fill: string): string {
  switch (id) {
    case 'shield': return `<path d="M50 6 L90 20 V52 C90 76 72 90 50 96 C28 90 10 76 10 52 V20 Z" fill="${fill}"/>`;
    case 'circle': return `<circle cx="50" cy="50" r="44" fill="${fill}"/>`;
    case 'hexagon': return `<path d="M50 6 L88 28 V72 L50 94 L12 72 V28 Z" fill="${fill}"/>`;
    case 'bolt': return `<path d="M50 4 L18 54 H44 L38 96 L84 40 H56 Z" fill="${fill}"/>`;
    case 'star': return `<path d="M50 6 L61 38 H95 L67 58 L78 92 L50 71 L22 92 L33 58 L5 38 H39 Z" fill="${fill}"/>`;
    case 'diamond': return `<path d="M50 4 L92 50 L50 96 L8 50 Z" fill="${fill}"/>`;
  }
}

// constrói um data URL SVG com emblema + iniciais (até 3 letras)
function buildLogoDataUrl(emblem: EmblemId, c1: string, c2: string, text: string): string {
  const initials = (text || 'ORG').slice(0, 3).toUpperCase();
  const fontSize = initials.length >= 3 ? 30 : initials.length === 2 ? 38 : 50;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    emblemShape(emblem, c1) +
    `<text x="50" y="50" dy="0.36em" text-anchor="middle" font-family="Arial Narrow, Arial, sans-serif" font-weight="800" font-size="${fontSize}" fill="${c2}">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------- fundação da organização ----------
// proposta de uma org de elite por um jogador seu (assédio do topo). Vender dá
// um caixa gordo mas abre um buraco no elenco; recusar mantém a base.
// tela OBRIGATÓRIA de renovação: aparece na janela quando há contratos vencendo.
// O usuário decide quem fica (paga 1 salário) e quem sai. Sem perder jogador "do nada".
function RenewalScreen({ renewals, budget, onConfirm }: {
  renewals: Renewal[];
  budget: number;
  onConfirm: (renewIds: string[]) => void;
}) {
  const [keep, setKeep] = useState<Set<string>>(() => new Set(renewals.map((r) => r.playerId)));
  const cost = renewals.filter((r) => keep.has(r.playerId)).reduce((a, r) => a + r.wage, 0);
  const overBudget = cost > budget;
  const setRenew = (id: string) => setKeep((s) => new Set(s).add(id));
  const setRelease = (id: string) => setKeep((s) => { const n = new Set(s); n.delete(id); return n; });
  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 720, margin: '24px auto' }}>
        <div className="panel-head">📝 Renovação de contratos</div>
        <div className="panel-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            Estes contratos venceram. <b>Renove</b> quem você quer manter (custa 1 salário) ou <b>libere</b> de graça.
            Quem não for renovado deixa o elenco agora.
          </p>
          <div className="renew-list">
            {renewals.map((r) => {
              const on = keep.has(r.playerId);
              return (
                <div key={r.playerId} className={`renew-row${on ? ' keep' : ' drop'}`}>
                  <PlayerAvatar nick={r.nick} size={40} />
                  <div className="renew-id">
                    <div className="renew-nick"><Flag cc={r.country} /> {r.nick} <span className={`role-pill ${r.role}`}>{r.role}</span></div>
                    <div className="muted small">OVR {r.ovr} · salário {formatMoney(r.wage)}</div>
                  </div>
                  <div className="renew-actions">
                    <button className={`btn small${on ? ' gold' : ' ghost'}`} onClick={() => setRenew(r.playerId)}>{on ? '✓ Renovar' : 'Renovar'}</button>
                    <button className={`btn small${!on ? ' armed' : ' ghost'}`} onClick={() => setRelease(r.playerId)}>{!on ? '✓ Liberar' : 'Liberar'}</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="renew-foot">
            <span>Custo das renovações: <b className={overBudget ? 'neg' : ''}>{formatMoney(cost)}</b> · caixa {formatMoney(budget)}</span>
            <button className="btn gold" disabled={overBudget} onClick={() => onConfirm([...keep])}>Confirmar e abrir o mercado</button>
          </div>
          {overBudget && <p className="neg small" style={{ marginTop: 8 }}>Sem caixa pra renovar todos. Libere alguém pra caber no orçamento.</p>}
        </div>
      </div>
    </div>
  );
}

function OfferScreen({ offer, orgName, onAccept, onRefuse }: {
  offer: PoachOffer;
  orgName: string;
  onAccept: () => void;
  onRefuse: () => void;
}) {
  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 540, margin: '40px auto' }}>
        <div className="panel-head">📨 Proposta recebida</div>
        <div className="panel-body center">
          <div className="trophy" style={{ fontSize: 40 }}>💸</div>
          <h2 style={{ marginBottom: 4 }}>
            <span className="tier-badge t1">TIER 1</span> {offer.orgName} quer o seu {offer.nick}
          </h2>
          <p className="muted" style={{ maxWidth: 440, margin: '8px auto 14px' }}>
            A {offer.orgName} (org de elite) ofereceu <b className="pos">{formatMoney(offer.fee)}</b> pelo
            seu <b>{offer.nick}</b> (OVR {offer.ovr}). Vender enche o caixa, mas você fica com 4 e
            precisa repor no mercado. Segurar mantém a {orgName} forte.
          </p>
          <div className="offer-actions">
            <button className="btn gold big" onClick={onAccept}>✔ Vender por {formatMoney(offer.fee)}</button>
            <button className="btn ghost big" onClick={onRefuse}>✕ Recusar e segurar o jogador</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// escolha da org: assumir um time real (com elenco e contexto) ou uma org sem
// line pra montar do zero. Substitui o "inventar do nada" como entrada padrão.
function OrgSelect({ teams, onStart, onFictional, onScenarios, onExit }: {
  teams: TeamSeason[];
  onStart: (s: OrgStart) => void;
  onFictional: () => void;
  onScenarios: () => void;
  onExit: () => void;
}) {
  // candidatos a ASSUMIR: times reais de tier 2/3 (ninguém começa na elite).
  const takeovers = useMemo(
    () =>
      teams
        .filter((t) => t.players.length >= 5 && teamTier(t) >= 2)
        .map((t) => ({ t, tier: teamTier(t), ovr: Math.round(t.players.reduce((a, p) => a + playerOvr(p), 0) / t.players.length) }))
        .sort((a, b) => a.tier - b.tier || b.ovr - a.ovr)
        .slice(0, 9),
    [teams],
  );

  const takeOver = (t: TeamSeason) => {
    const tier = teamTier(t);
    onStart({
      org: { name: t.team, tag: t.tag, colors: t.colors, logo: t.logoUrl ?? logoForTeam(t) },
      squad: t.players.slice(0, 5).map((p) => ({ playerId: p.id, fromId: t.id })),
      coachFromId: t.id, // herda o coach da org
      budget: takeoverBudget(tier),
      tier,
      takeoverId: t.id,
      // região de competição = core do elenco assumido (Astralis → Europa, etc.)
      region: macroRegionPlurality(t.players.slice(0, 5).map((p) => p.country)),
    });
  };
  const startEmpty = (e: EmptyOrg) => {
    onStart({
      org: { name: e.name, tag: e.tag, colors: e.colors, logo: e.logoUrl },
      squad: [],
      coachFromId: null,
      budget: e.budget,
      tier: 3,
      takeoverId: null,
    });
  };

  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 980, margin: '24px auto' }}>
        <div className="panel-head">
          Assuma uma organização (modo carreira)
          <span className="spacer" />
          <button className="btn" onClick={onExit}>← Sair</button>
        </div>
        <div className="panel-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            Escolha uma <b>org real</b> para comandar. Cada uma tem um contexto:
            times melhores costumam ter <b>menos caixa</b> (folha pesada); orgs sem
            elenco te dão <b>mais verba</b> pra montar do zero. Suba de tier até o Major.
          </p>

          <button className="scenario-cta" onClick={onScenarios}>
            <span className="scenario-cta-ic">🎯</span>
            <span className="scenario-cta-txt">
              <b>Desafios de carreira</b>
              <span className="muted small">Assuma uma org com contexto e metas: FaZe em reconstrução, lendas como a MIBR 2006, a SAW de Portugal e mais.</span>
            </span>
            <span className="scenario-cta-arrow">→</span>
          </button>

          <div className="muted small section-label">Assumir org com elenco (tier baixo/médio)</div>
          <div className="org-grid">
            {takeovers.map(({ t, tier, ovr }) => (
              <button key={t.id} className="org-card" onClick={() => takeOver(t)}>
                <TeamBadge tag={t.tag} colors={t.colors} size={40} logoUrl={t.logoUrl ?? logoForTeam(t)} />
                <div className="org-name"><Flag cc={t.country} /> {t.team}</div>
                <div className="org-meta">
                  <span className={`tier-badge t${tier}`}>TIER {tier}</span>
                  <span className="muted small">elenco OVR {ovr}</span>
                </div>
                <div className="org-budget">💰 {formatMoney(takeoverBudget(tier))} de caixa</div>
                <div className="muted small">{tier === 2 ? 'Elenco forte, caixa curto' : 'Elenco mediano, caixa folgado'}</div>
              </button>
            ))}
          </div>

          <div className="muted small section-label">Começar do zero (org sem line ativa)</div>
          <div className="org-grid">
            {EMPTY_ORGS.map((e) => (
              <button key={e.id} className="org-card empty" onClick={() => startEmpty(e)}>
                <TeamBadge tag={e.tag} colors={e.colors} size={40} logoUrl={e.logoUrl} />
                <div className="org-name">{e.name}</div>
                <div className="org-meta"><span className="tier-badge t3">TIER 3</span><span className="muted small">sem elenco</span></div>
                <div className="org-budget">💰 {formatMoney(e.budget)} de caixa</div>
                <div className="muted small">{e.blurb}</div>
              </button>
            ))}
          </div>

          <div className="center" style={{ marginTop: 18 }}>
            <button className="btn ghost" onClick={onFictional}>ou criar uma org fictícia do zero →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- DESAFIOS: assumir uma org real com contexto + metas (estilo Draft) -----
function ScenarioPicker({ current, onBack, onStart }: {
  current: TeamSeason[];
  onBack: () => void;
  onStart: (s: OrgStart) => void;
}) {
  const items = useMemo(
    () => CAREER_SCENARIOS.map((sc) => ({ sc, team: scenarioTeam(sc, current) })).filter((x) => x.team),
    [current],
  );
  const pick = (sc: CareerScenario, t: TeamSeason) => {
    const tier = teamTier(t);
    onStart({
      org: { name: t.team, tag: t.tag, colors: t.colors, logo: t.logoUrl ?? logoForTeam(t) },
      squad: t.players.slice(0, 5).map((p) => ({ playerId: p.id, fromId: t.id })),
      coachFromId: t.id,
      budget: sc.budget ?? takeoverBudget(tier),
      tier,
      takeoverId: t.id,
      region: macroRegionPlurality(t.players.slice(0, 5).map((p) => p.country)),
      board: sc.board ?? 60,
      scenario: { id: sc.id, cat: sc.cat, title: sc.title, context: sc.context, goals: sc.goals.map((g) => ({ ...g, done: false })) },
    });
  };
  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 1000, margin: '24px auto' }}>
        <div className="panel-head">
          🎯 Desafios de carreira
          <span className="spacer" />
          <button className="btn" onClick={onBack}>← Voltar</button>
        </div>
        <div className="panel-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            Assuma uma organização com <b>contexto</b> e <b>metas</b> próprias. O elenco e o técnico já vêm prontos; cumpra os objetivos do desafio ao longo da campanha.
          </p>
          {SCENARIO_CAT_ORDER.map((cat) => {
            const group = items.filter((x) => x.sc.cat === cat);
            if (!group.length) return null;
            return (
              <div key={cat}>
                <div className="muted small section-label">{SCENARIO_CAT_LABELS[cat]}</div>
                <div className="scenario-grid">
                  {group.map(({ sc, team }) => {
                    const t = team!;
                    const tier = teamTier(t);
                    const ovr = Math.round(t.players.reduce((a, p) => a + playerOvr(p), 0) / Math.max(1, t.players.length));
                    return (
                      <button key={sc.id} className="scenario-card" onClick={() => pick(sc, t)}>
                        <div className="scenario-card-head">
                          <TeamBadge tag={t.tag} colors={t.colors} size={38} logoUrl={t.logoUrl ?? logoForTeam(t)} />
                          <div>
                            <div className="scenario-title"><Flag cc={t.country} /> {sc.title}</div>
                            <div className="org-meta">
                              <span className={`tier-badge t${tier}`}>TIER {tier}</span>
                              <span className="muted small">OVR {ovr}</span>
                            </div>
                          </div>
                        </div>
                        <div className="scenario-context muted small">{sc.context}</div>
                        <div className="scenario-goals">
                          {sc.goals.map((g, i) => (
                            <span key={i} className="scenario-goal">🎯 {g.text}</span>
                          ))}
                        </div>
                        <div className="org-budget">💰 {formatMoney(sc.budget ?? takeoverBudget(tier))} de caixa</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FoundOrg({ onFound, onExit }: { onFound: (org: NonNullable<CareerSave['org']>) => void; onExit: () => void }) {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [c1, setC1] = useState('#101820');
  const [c2, setC2] = useState('#61a8dd');
  const [emblem, setEmblem] = useState<EmblemId>('shield');

  // logo = emblema construído (upload de imagem removido por custo/transferência)
  const logo = useMemo(() => buildLogoDataUrl(emblem, c1, c2, tag || name), [emblem, c1, c2, tag, name]);

  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 760, margin: '24px auto' }}>
        <div className="panel-head">
          Fundar organização (modo carreira)
          <span className="spacer" />
          <button className="btn" onClick={onExit}>← Sair</button>
        </div>
        <div className="panel-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            Crie sua org nos <b>tempos atuais</b> (só elencos CS2). Você começa com{' '}
            <b>{formatMoney(STARTING_BUDGET)}</b> para montar 5 jogadores + coach,
            fechar patrocínios e disputar os circuitos rumo ao Major. Sem lendas do
            passado: o desafio é construir do zero.
          </p>

          <div className="found-grid">
            {/* coluna esquerda: identidade */}
            <div className="found-form">
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Nome da organização</label>
                <input value={name} maxLength={24} placeholder="ex: Astro Esports" onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Tag (até 4 letras)</label>
                <input value={tag} maxLength={4} placeholder="ex: ASTR" style={{ textTransform: 'uppercase' }} onChange={(e) => setTag(e.target.value.toUpperCase())} />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Cores (primária / secundária)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={c1} onChange={(e) => setC1(e.target.value)} />
                  <input type="color" value={c2} onChange={(e) => setC2(e.target.value)} />
                  <span className="muted small">a secundária colore o texto/emblema</span>
                </div>
              </div>

              <div className="field">
                <label>Emblema</label>
                <div className="emblem-grid">
                  {EMBLEMS.map((em) => (
                    <button
                      key={em.id}
                      type="button"
                      className={`emblem-opt${emblem === em.id ? ' on' : ''}`}
                      title={em.label}
                      onClick={() => setEmblem(em.id)}
                    >
                      <img src={buildLogoDataUrl(em.id, c1, c2, tag || name)} alt={em.label} width={40} height={40} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* coluna direita: preview do clube */}
            <div className="found-preview">
              <div className="fp-card" style={{ background: `linear-gradient(150deg, ${c1} 0%, #0c0f14 80%)` }}>
                <img className="fp-logo" src={logo} alt="logo" />
                <div className="fp-name" style={{ color: '#fff' }}>{name || 'Sua Organização'}</div>
                <div className="fp-tag" style={{ color: c2 }}>{(tag || 'ORG').toUpperCase()}</div>
              </div>
              <div className="fp-badges">
                <TeamBadge tag={tag || 'ORG'} colors={[c1, c2]} size={40} logoUrl={logo} />
                <TeamBadge tag={tag || 'ORG'} colors={[c1, c2]} size={28} logoUrl={logo} />
                <span className="muted small">como aparece nos campeonatos</span>
              </div>
            </div>
          </div>

          <button
            className="btn gold big"
            style={{ width: '100%', marginTop: 16 }}
            disabled={!name.trim() || !tag.trim()}
            onClick={() => onFound({ name: name.trim(), tag: tag.trim() || 'ORG', colors: [c1, c2], logo })}
          >
            ✔ Fundar e abrir o mercado
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- negociação de transferência (modal) ----------
function NegotiationModal({ player, from, budget, swapPool, onClose, onAgree }: {
  player: Player; from: TeamSeason; budget: number;
  swapPool?: Player[]; // seus jogadores disponíveis pra incluir na troca (habilita swap)
  onClose: () => void; onAgree: (fee: number, outIds: string[]) => void;
}) {
  const ask = askingPrice(player, from.teamwork);
  const mkt = playerValue(player);
  const wage = playerWage(player);
  const [offer, setOffer] = useState(Math.round(ask * 0.85));
  const [round, setRound] = useState(0);
  const [reply, setReply] = useState<NegoReply | null>(null);
  const [swapOut, setSwapOut] = useState<string[]>([]);
  const swapValue = swapOut.reduce((a, id) => {
    const p = swapPool?.find((x) => x.id === id);
    return a + (p ? playerValue(p) : 0);
  }, 0);
  const effectiveOffer = offer + swapValue;
  const overBudget = offer > budget;
  const reset = () => setReply(null);
  const submit = () => {
    if (overBudget) return;
    setReply(clubReply(effectiveOffer, ask, player, from.teamwork, round));
    setRound((r) => r + 1);
  };
  const toggleSwap = (id: string) => {
    setSwapOut((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    reset();
  };
  // ao aceitar a contraproposta (valor TOTAL que o clube quer), o dinheiro que você
  // paga é o total menos o valor dos jogadores da troca (nunca negativo).
  const counterCash = reply?.kind === 'counter' ? Math.max(0, reply.value - swapValue) : 0;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="nego-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}>✕</button>
        <div className="nego-head">
          <PlayerAvatar nick={player.nick} size={48} />
          <div>
            <div className="nego-nick"><Flag cc={player.country} /> {player.nick} <span className={`role-pill ${player.role}`}>{player.role}</span></div>
            <div className="muted small">Negociando com <b>{from.team}</b> · OVR {playerOvr(player)}</div>
          </div>
        </div>
        <div className="nego-figures">
          <div><span className="muted small">Valor de mercado</span><b>{formatMoney(mkt)}</b></div>
          <div><span className="muted small">Pedida do clube</span><b>{formatMoney(ask)}</b></div>
          <div><span className="muted small">Salário / split</span><b>{formatMoney(wage)}</b></div>
        </div>
        {swapPool && swapPool.length > 0 && (
          <div className="nego-swap">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Incluir na troca (abate o valor em dinheiro)</div>
            <div className="nego-swap-list">
              {swapPool.map((p) => (
                <button key={p.id} className={`nego-swap-chip${swapOut.includes(p.id) ? ' on' : ''}`} onClick={() => toggleSwap(p.id)}>
                  <Flag cc={p.country} /> {p.nick} <span className="muted small">{formatMoney(playerValue(p))}</span>
                </button>
              ))}
            </div>
            {swapValue > 0 && <div className="muted small">Valor da troca: <b className="pos">{formatMoney(swapValue)}</b></div>}
          </div>
        )}
        <div className="nego-offer">
          <div className="nego-presets">
            <button className="btn small ghost" onClick={() => { setOffer(Math.max(0, Math.round(ask * 0.7) - swapValue)); reset(); }}>Baixa</button>
            <button className="btn small ghost" onClick={() => { setOffer(Math.max(0, ask - swapValue)); reset(); }}>Justa</button>
            <button className="btn small ghost" onClick={() => { setOffer(Math.max(0, Math.round(ask * 1.1) - swapValue)); reset(); }}>Generosa</button>
          </div>
          <input type="range" min={0} max={Math.round(ask * 1.4)} step={10000}
            value={offer} onChange={(e) => { setOffer(Number(e.target.value)); reset(); }} />
          <div className={`nego-amount${overBudget ? ' neg' : ''}`}>
            Dinheiro: <b>{formatMoney(offer)}</b>
            {swapValue > 0 && <span className="muted small"> + troca {formatMoney(swapValue)} = oferta de {formatMoney(effectiveOffer)}</span>}
            {overBudget && <span className="neg"> · sem caixa</span>}
          </div>
        </div>
        {reply && (
          <div className={`nego-reply ${reply.kind}`}>
            {reply.kind === 'accept' && <span>✅ {from.team} aceitou a oferta de <b>{formatMoney(effectiveOffer)}</b>.</span>}
            {reply.kind === 'counter' && <span>↔️ {from.team} quer <b>{formatMoney(reply.value)}</b> no total{swapValue > 0 ? ` (${formatMoney(counterCash)} em dinheiro + sua troca)` : ''}.</span>}
            {reply.kind === 'reject' && <span>❌ {reply.msg}</span>}
          </div>
        )}
        <div className="nego-actions">
          {reply?.kind === 'accept' ? (
            <button className="btn gold" onClick={() => onAgree(offer, swapOut)}>Fechar acordo</button>
          ) : reply?.kind === 'counter' ? (
            <>
              <button className="btn gold" disabled={counterCash > budget} onClick={() => onAgree(counterCash, swapOut)}>
                Aceitar ({formatMoney(counterCash)})
              </button>
              <button className="btn" disabled={overBudget} onClick={submit}>Insistir</button>
            </>
          ) : reply?.kind === 'reject' && reply.firm ? (
            <button className="btn" onClick={onClose}>Sair</button>
          ) : (
            <button className="btn gold" disabled={overBudget} onClick={submit}>Fazer proposta</button>
          )}
          <button className="btn ghost" onClick={onClose}>Desistir</button>
        </div>
      </div>
    </div>
  );
}

// ---------- negociações durante a temporada (acordos pendentes p/ a janela) ----------
function SeasonNegotiations({ market, squadPlayers, budget, pendingDeals, pendingSales, offers, onAddDeal, onCancelDeal, onAcceptOffer, onRejectOffer, onCancelSale, feed }: {
  market: { player: Player; from: TeamSeason; price: number }[];
  squadPlayers: Player[];
  budget: number;
  pendingDeals: PendingDeal[];
  pendingSales: { playerId: string; nick: string; fee: number; toTag: string }[];
  offers: { playerId: string; nick: string; ovr: number; country: string; fee: number; toTag: string; toName: string }[];
  onAddDeal: (d: PendingDeal) => void;
  onCancelDeal: (id: string) => void;
  onAcceptOffer: (o: { playerId: string; nick: string; fee: number; toTag: string }) => void;
  onRejectOffer: (playerId: string) => void;
  onCancelSale: (playerId: string) => void;
  feed: TransferItem[];
}) {
  const [target, setTarget] = useState<{ player: Player; from: TeamSeason } | null>(null);
  const [q, setQ] = useState('');
  const committedCash = pendingDeals.reduce((a, d) => a + d.fee, 0);
  const dealBudget = budget - committedCash;
  const committedOut = new Set(pendingDeals.flatMap((d) => d.outPlayerIds));
  const targeted = new Set(pendingDeals.map((d) => d.inPlayerId));
  const squadIds = new Set(squadPlayers.map((p) => p.id));
  const swapPool = squadPlayers.filter((p) => !committedOut.has(p.id));
  const list = market
    .filter((m) => m.from.id !== '__free__' && !targeted.has(m.player.id) && !squadIds.has(m.player.id))
    .filter((m) => !q || m.player.nick.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => playerOvr(b.player) - playerOvr(a.player))
    .slice(0, 60);
  return (
    <div className="panel">
      <div className="panel-body">
        <div className="muted small section-label" style={{ marginTop: 0 }}>
          🤝 Negociações · você fecha agora, o jogador entra na <b>próxima janela</b> (fim do split)
        </div>
        <div className="nego-budget">
          Caixa pra acordos: <b className={dealBudget < 0 ? 'neg' : 'pos'}>{formatMoney(dealBudget)}</b>
          {committedCash > 0 && <span className="muted small"> · {formatMoney(committedCash)} já comprometido</span>}
        </div>
        {(offers.length > 0 || pendingSales.length > 0) && (
          <div className="nego-offers">
            <div className="muted small section-label" style={{ marginTop: 0 }}>📨 Propostas pelos seus jogadores</div>
            {pendingSales.map((s) => (
              <div key={s.playerId} className="nego-offer-row sold">
                <span className="nego-offer-who">💸 <b>{s.nick}</b> <span className="muted small">vendido pra {s.toTag}</span></span>
                <span className="nego-offer-fee pos">{formatMoney(s.fee)}</span>
                <button className="btn ghost small" onClick={() => onCancelSale(s.playerId)}>Desfazer</button>
              </div>
            ))}
            {offers.map((o) => (
              <div key={o.playerId} className="nego-offer-row">
                <span className="nego-offer-who"><Flag cc={o.country} /> <b>{o.nick}</b> <span className="muted small">OVR {o.ovr} · {o.toName} quer</span></span>
                <span className="nego-offer-fee">{formatMoney(o.fee)}</span>
                <button className="btn gold small" onClick={() => onAcceptOffer({ playerId: o.playerId, nick: o.nick, fee: o.fee, toTag: o.toTag })}>Vender</button>
                <button className="btn ghost small" onClick={() => onRejectOffer(o.playerId)}>Recusar</button>
              </div>
            ))}
            <p className="muted small" style={{ margin: '6px 0 0' }}>Aceitar vende o jogador na próxima janela (a grana entra no caixa). O jogador continua jogando até lá.</p>
          </div>
        )}
        {pendingDeals.length > 0 && (
          <div className="nego-pending">
            <div className="muted small section-label">Acordos fechados ({pendingDeals.length})</div>
            {pendingDeals.map((d) => (
              <div key={d.id} className="nego-deal-row">
                <span className="nego-deal-in">🤝 <b>{d.inNick}</b></span>
                <span className="muted small">{formatMoney(d.fee)}{d.outNicks.length > 0 ? ` + troca: ${d.outNicks.join(', ')}` : ''}</span>
                <button className="btn ghost small" onClick={() => onCancelDeal(d.id)}>Cancelar</button>
              </div>
            ))}
          </div>
        )}
        <div className="muted small section-label">Mercado · negocie com os clubes</div>
        <input className="nego-search" placeholder="Buscar jogador…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="career-market scroll">
          {list.length === 0 && <div className="muted small" style={{ padding: 12 }}>Nenhum jogador com esse filtro.</div>}
          {list.map((m) => (
            <button key={m.player.id} className="pcard" onClick={() => setTarget({ player: m.player, from: m.from })}>
              <PlayerAvatar nick={m.player.nick} size={48} />
              <OvrBadge ovr={playerOvr(m.player)} />
              <div className="nick">{m.player.nick}</div>
              <div className="meta"><span className={`role-pill ${m.player.role}`}>{m.player.role}</span></div>
              <div className="meta muted small">
                <TeamBadge tag={m.from.tag} colors={m.from.colors} size={16} logoUrl={m.from.logoUrl ?? logoForTeam(m.from)} /> {m.from.team}
              </div>
              <div className="meta small"><span className="muted">pedida</span> {formatMoney(askingPrice(m.player, m.from.teamwork))}</div>
            </button>
          ))}
        </div>
        <div className="muted small section-label">Rumores da janela</div>
        <TransferFeed items={feed} compact />
      </div>
      {target && (
        <NegotiationModal
          player={target.player}
          from={target.from}
          budget={dealBudget}
          swapPool={swapPool}
          onClose={() => setTarget(null)}
          onAgree={(fee, outIds) => {
            onAddDeal({
              id: target.player.id,
              inPlayerId: target.player.id,
              inFromId: target.from.id,
              inNick: target.player.nick,
              fee,
              outPlayerIds: outIds,
              outNicks: outIds.map((id) => squadPlayers.find((p) => p.id === id)?.nick ?? id),
            });
            setTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ---------- mercado de contratações ----------
function MarketScreen({
  save,
  market,
  coaches,
  findSigning,
  onConfirm,
  onExit,
  embedded,
}: {
  save: CareerSave;
  market: { player: Player; from: TeamSeason; price: number }[];
  coaches: TeamSeason[];
  findSigning: (s: Signing) => { player: Player; from: TeamSeason } | null;
  onConfirm: (squad: Signing[], coachFromId: string, budget: number, sponsors: string[], sponsorUntil: Record<string, number>) => void;
  onExit: () => void;
  embedded?: boolean;
}) {
  const [squad, setSquad] = useState<Signing[]>(save.squad);
  const [nego, setNego] = useState<{ player: Player; from: TeamSeason } | null>(null);
  const [coachId, setCoachId] = useState<string | null>(save.coachFromId);
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>(''); // filtro por função
  const [ccFilter, setCcFilter] = useState(''); // filtro por nacionalidade (código ISO)
  const [sponsors, setSponsors] = useState<string[]>(save.sponsors);
  const [sponsorUntil, setSponsorUntil] = useState<Record<string, number>>(save.sponsorUntil ?? {});
  const marketFeed = useMemo(() => transferFeed(save.split, coaches), [save.split, coaches]);

  // contrato ativo = ainda dentro do prazo (não pode rescindir antes do fim)
  const underContract = (id: string) => (sponsorUntil[id] ?? 0) >= save.split;

  const toggleSponsor = (id: string) => {
    const sp = sponsorById(id);
    if (!sp) return;
    if (sponsors.includes(id)) {
      // só sai se o contrato já venceu
      if (underContract(id)) return;
      setSponsors((cur) => cur.filter((x) => x !== id));
      return;
    }
    if (sponsors.length >= SPONSOR_SLOTS) return;
    // assina: compromisso de `term` splits a partir do split atual
    setSponsors((cur) => [...cur, id]);
    setSponsorUntil((cur) => ({ ...cur, [id]: save.split + sp.term - 1 }));
  };

  const signedNicks = new Set(
    squad.map((s) => findSigning(s)?.player.nick.toLowerCase()).filter(Boolean) as string[],
  );
  // jogadores que JÁ eram seus (pagos no split anterior) não custam de novo;
  // dispensar um deles é venda a 85% do valor de mercado
  const owned = new Set(save.squad.map((s) => s.playerId));
  const spentPlayers = squad.reduce((acc, s) => {
    if (owned.has(s.playerId)) return acc;
    const f = findSigning(s);
    // usa o fee NEGOCIADO; se não houver (free agent / save antigo), o de tabela
    return acc + (f ? (s.fee ?? playerValue(f.player)) : 0);
  }, 0);
  const soldPlayers = save.squad
    .filter((s) => !squad.some((x) => x.playerId === s.playerId))
    .reduce((acc, s) => {
      const f = findSigning(s);
      return acc + (f ? Math.round(playerValue(f.player) * 0.85) : 0);
    }, 0);
  const coachTeam = coachId && coachId !== ROOKIE_ID ? coaches.find((t) => t.id === coachId) : null;
  const coachChanged = coachId !== save.coachFromId;
  const spentCoach = !coachChanged ? 0 : coachId === ROOKIE_ID ? coachFee(ROOKIE_COACH) : coachTeam ? coachFee(coachTeam.coach) : 0;
  // melhores técnicos primeiro (rating desc) e sem repetir o mesmo nome — assim
  // dá pra contratar coach de OVR alto, não só os baratos.
  const coachSeen = new Set<string>();
  const coachOptions = [...coaches]
    .sort((a, b) => b.coach.rating - a.coach.rating)
    .filter((t) => {
      if (coachSeen.has(t.coach.nick)) return false;
      coachSeen.add(t.coach.nick);
      return true;
    });
  const budgetLeft = save.budget - spentPlayers - spentCoach + soldPlayers;
  const ready = squad.length === 5 && !!coachId && budgetLeft >= 0;

  // países presentes no mercado (com contagem) pro filtro de nacionalidade
  const countryCounts = market.reduce<Record<string, number>>((acc, m) => {
    const cc = m.player.country || '??';
    acc[cc] = (acc[cc] ?? 0) + 1;
    return acc;
  }, {});
  const countries = Object.keys(countryCounts).sort();

  const visible = market.filter(
    (m) =>
      !squad.some((s) => s.playerId === m.player.id) &&
      (!roleFilter || m.player.role === roleFilter) &&
      (!ccFilter || m.player.country === ccFilter) &&
      (!filter ||
        m.player.nick.toLowerCase().includes(filter.toLowerCase()) ||
        m.from.team.toLowerCase().includes(filter.toLowerCase())),
  );

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          Mercado - Split {save.split} ({save.org?.name})
          <span className="spacer" />
          <span className={budgetLeft >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 800 }}>
            💰 {formatMoney(budgetLeft)}
          </span>
          <button className="btn" onClick={onExit}>{embedded ? '← Voltar ao hub' : '← Sair'}</button>
        </div>
        <div className="panel-body">
          <div className="career-banner muted small">
            Contrate <b>5 jogadores</b> e <b>1 coach</b> dentro do orçamento. Só
            jogadores dos elencos atuais (CS2). Clique num contratado para dispensar:
            contratação desta janela tem reembolso integral; jogador do seu elenco é
            vendido por 85% do valor.
          </div>
          {(save.lastReleases?.length ?? 0) > 0 && (
            <div className="release-banner">
              📄 Contrato vencido: <b>{save.lastReleases!.join(', ')}</b> saiu de graça. Reforce o elenco no mercado.
            </div>
          )}

          {/* evolução do elenco na última janela (explica a mecânica na jornada) */}
          {(save.lastEvo?.length ?? 0) > 0 && (
            <div className="evo-panel">
              <div className="muted small section-label" style={{ marginTop: 0 }}>Evolução do elenco na janela</div>
              <div className="evo-list">
                {save.lastEvo.map((e) => (
                  <span key={e.nick} className={`evo-chip ${e.delta > 0 ? 'up' : e.delta < 0 ? 'down' : 'flat'}`}>
                    {e.delta > 0 ? '▲' : e.delta < 0 ? '▼' : '▬'} {e.nick}
                    <i>{e.delta > 0 ? `+${e.delta}` : e.delta} · {PHASE_LABEL[e.phase]}</i>
                  </span>
                ))}
              </div>
              <p className="muted small" style={{ margin: '8px 0 0' }}>
                Entre temporadas o elenco evolui: jogador <b>em ascensão</b> melhora,
                <b> no auge</b> oscila e <b>veterano em declínio</b> cai. O valor e o
                salário acompanham os atributos: segurar um veterano caro (ou vender
                no pico) é decisão sua.
              </p>
            </div>
          )}

          <div className="muted small section-label">Seu elenco ({squad.length}/5)</div>
          <div className="roster-slots">
            {[0, 1, 2, 3, 4].map((i) => {
              const s = squad[i];
              const f = s ? findSigning(s) : null;
              if (f) {
                return (
                  <button key={i} className="slot filled" style={{ cursor: 'pointer' }}
                    onClick={() => setSquad(squad.filter((x) => x.playerId !== s.playerId))}>
                    <div className="nick">
                      <Flag cc={f.player.country} /> {f.player.nick}{' '}
                      <span className="ovr-inline">{playerOvr(f.player)}</span>
                    </div>
                    <span className={`role-pill ${f.player.role}`}>{f.player.role}</span>
                    <div className="from">{formatMoney(playerValue(f.player))} · clique p/ dispensar</div>
                  </button>
                );
              }
              return <div key={i} className="slot">Contratação {i + 1}</div>;
            })}
          </div>

          <div className="muted small section-label">Coach</div>
          <div className="career-coaches">
            <button className={`call-btn${coachId === ROOKIE_ID ? ' armed' : ''}`}
              title="Opção de entrada: barato, mas com rating baixo"
              onClick={() => setCoachId(coachId === ROOKIE_ID ? null : ROOKIE_ID)}>
              {ROOKIE_COACH.nick} · {ROOKIE_COACH.rating} · {formatMoney(coachFee(ROOKIE_COACH))}
            </button>
            {coachOptions.slice(0, 24).map((t) => (
              <button key={t.id} className={`call-btn${coachId === t.id ? ' armed' : ''}`}
                title={`${t.coach.name} (${t.team})`}
                onClick={() => setCoachId(coachId === t.id ? null : t.id)}>
                {t.coach.nick} · {t.coach.rating} · {formatMoney(coachFee(t.coach))}
              </button>
            ))}
          </div>

          <div className="muted small section-label">Mercado ({visible.length} de {market.length} jogadores)</div>
          <div className="market-filters">
            <input className="mf-search" placeholder="Buscar jogador ou time…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <select className="mf-select" value={ccFilter} onChange={(e) => setCcFilter(e.target.value)} title="Filtrar por nacionalidade">
              <option value="">🌐 País (todos)</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c.toUpperCase()} ({countryCounts[c]})</option>
              ))}
            </select>
            {(roleFilter || ccFilter || filter) && (
              <button className="mf-clear" onClick={() => { setRoleFilter(''); setCcFilter(''); setFilter(''); }} title="Limpar filtros">✕ Limpar</button>
            )}
          </div>
          <div className="market-roles">
            <button className={`mr-chip${!roleFilter ? ' on' : ''}`} onClick={() => setRoleFilter('')}>Todas</button>
            {ROLE_OPTS.map((r) => (
              <button key={r} className={`mr-chip role-${r}${roleFilter === r ? ' on' : ''}`} onClick={() => setRoleFilter(roleFilter === r ? '' : r)}>{r}</button>
            ))}
          </div>
          <div className="career-market scroll">
            {visible.length === 0 && <div className="muted small" style={{ padding: 12 }}>Nenhum jogador com esses filtros.</div>}
            {visible.map((m) => {
              const dup = signedNicks.has(m.player.nick.toLowerCase());
              const isFA = m.from.id === '__free__';
              // free agent entra direto (sem clube pra negociar); jogador de clube
              // abre a NEGOCIAÇÃO (o orçamento é checado lá dentro).
              const canPick = squad.length < 5 && !dup && (isFA ? m.price <= budgetLeft : true);
              return (
                <button key={m.player.id} className={`pcard${!canPick ? ' taken' : ''}`}
                  disabled={!canPick}
                  onClick={() => isFA
                    ? setSquad([...squad, { playerId: m.player.id, fromId: m.from.id, fee: m.price }])
                    : setNego({ player: m.player, from: m.from })}>
                  <PlayerAvatar nick={m.player.nick} size={48} />
                  <OvrBadge ovr={playerOvr(m.player)} />
                  <div className="nick">{m.player.nick}</div>
                  <div className="meta">
                    <span className={`role-pill ${m.player.role}`}>{m.player.role}</span>
                  </div>
                  <div className="meta muted small">
                    <TeamBadge tag={m.from.tag} colors={m.from.colors} size={16} logoUrl={m.from.logoUrl ?? logoForTeam(m.from)} />{' '}
                    {m.from.team}
                  </div>
                  {(() => {
                    const age = effectiveAge(m.player, save.split, save.youthAge);
                    const ph = playerPhase(m.player.id, age);
                    const pot = potentialTier(playerPotentialOvr(m.player, age));
                    return (
                      <>
                        <div className="meta small player-bio">
                          <span title="Idade">🎂 {age}a</span>
                          <span className={`pot-badge pot-${pot}`} title="Potencial (teto de OVR)">POT {pot}</span>
                        </div>
                        <div className={`meta small phase-tag ${ph}`} title="Jovem em ascensão melhora entre temporadas; veterano cai">
                          {ph === 'rising' ? '📈' : ph === 'declining' ? '📉' : '▬'} {PHASE_LABEL[ph]}
                        </div>
                      </>
                    );
                  })()}
                  <div className="price buy">💰 {formatMoney(m.price)}</div>
                  {dup && <div className="meta muted small">já contratado</div>}
                </button>
              );
            })}
          </div>

          {/* patrocinadores: receita fixa por split, marcas reais */}
          <div className="muted small section-label">
            Patrocinadores ({sponsors.length}/{SPONSOR_SLOTS}) · receita por split: <b className="pos">+{formatMoney(sponsorIncome(sponsors))}</b>
          </div>
          <div className="muted small" style={{ margin: '-4px 0 8px' }}>
            Ao assinar você se compromete por X splits (não dá pra rescindir antes). Marcas maiores pedem mais VRS e contratos mais longos.
          </div>
          <div className="sponsor-grid">
            {SPONSORS.map((sp) => {
              const active = sponsors.includes(sp.id);
              const committed = active && underContract(sp.id);
              const reqVrs = !active && sp.minVrs > save.vrs;
              const full = !active && sponsors.length >= SPONSOR_SLOTS;
              const blocked = reqVrs || full;
              return (
                <button
                  key={sp.id}
                  type="button"
                  className={`sponsor-card${active ? ' on' : ''}${blocked ? ' locked' : ''}${committed ? ' committed' : ''}`}
                  disabled={blocked}
                  onClick={() => !blocked && toggleSponsor(sp.id)}
                  title={reqVrs ? `Requer ${sp.minVrs} VRS` : full ? 'Slots cheios' : committed ? `Contrato até o Split ${sponsorUntil[sp.id]}` : active ? 'Contrato encerrado: clique para sair' : `Compromisso de ${sp.term} splits`}
                >
                  <span className="sp-logo" style={{ background: sp.color }}>{sp.name.slice(0, 1)}</span>
                  <span className="sp-name">{sp.name}</span>
                  <span className="sp-pay pos">+{formatMoney(sp.perSplit)}</span>
                  {reqVrs && <span className="sp-lock muted small">{sp.minVrs} VRS</span>}
                  {!active && !reqVrs && <span className="sp-lock muted small">{sp.term} splits</span>}
                  {committed && <span className="sp-lock muted small">🔒 até Split {sponsorUntil[sp.id]}</span>}
                  {active && !committed && <span className="sp-lock muted small">renovável</span>}
                  {active && <span className="sp-check">✔</span>}
                </button>
              );
            })}
          </div>

          {/* transferências que já se concretizaram (jogadores agora nos novos times) */}
          {(save.lastMoves?.length ?? 0) > 0 && (
            <>
              <div className="muted small section-label">✅ Transferências confirmadas (já valem nos elencos)</div>
              <div className="moves-done">
                {save.lastMoves.map((mv, i) => (
                  <span key={i} className="move-chip">
                    <b>{mv.nick}</b> {mv.from} → <b>{mv.to}</b>
                  </span>
                ))}
              </div>
            </>
          )}

          {/* janela de transferências: o que os outros times andam fazendo */}
          <div className="muted small section-label">Rumores da próxima janela</div>
          <TransferFeed items={marketFeed} />

          <div className="center" style={{ marginTop: 16 }}>
            <button className="btn gold big" disabled={!ready}
              onClick={() => coachId && onConfirm(squad, coachId, budgetLeft, sponsors, sponsorUntil)}>
              ✔ {embedded ? 'Salvar elenco' : 'Fechar elenco e escolher o campeonato'}
            </button>
            {!ready && (
              <div className="muted small" style={{ marginTop: 8 }}>
                {squad.length < 5 ? `Faltam ${5 - squad.length} jogador(es). ` : ''}
                {!coachId ? 'Escolha um coach. ' : ''}
                {budgetLeft < 0 ? 'Orçamento estourado.' : ''}
              </div>
            )}
          </div>
        </div>
      </div>
      {nego && (
        <NegotiationModal
          player={nego.player}
          from={nego.from}
          budget={budgetLeft}
          onClose={() => setNego(null)}
          onAgree={(fee) => {
            setSquad([...squad, { playerId: nego.player.id, fromId: nego.from.id, fee }]);
            setNego(null);
          }}
        />
      )}
    </div>
  );
}
