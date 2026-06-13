// MODO CARREIRA REALISTA (v0, NÃO LISTADO: só abre via #carreira).
// Fundar sua organização nos tempos atuais (só elencos CS2), contratar dentro
// do orçamento e disputar o CIRCUIT X (liga BR de pontos corridos). Vitórias
// rendem dinheiro e pontos de VRS - o caminho até o Major virá nas próximas
// fases. Textos em PT por enquanto (modo em refino, não lançado).
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney, playerValue, playerWage, buildUserTeam, playerOvr } from '../engine/ratings';
import { createLeague, leagueDone, leagueTable, leagueTeam, resolveLeagueRound, userLeagueMatch, type League } from '../engine/league';
import { teamSeasonToTTeam } from '../engine/ratings';
import { simulateSeries } from '../engine/match';
import { autoVeto } from '../engine/veto';
import { createTournament, placementCode, resolveRound, userPairing as tournamentUserPairing, getTeam, type PlacementCode } from '../engine/swiss';
import { Hub } from './Hub';
import { makeRng, randomSeed, type Rng } from '../engine/rng';
import type { Coach, MapId, Player, Role, SeriesResult, TeamSeason, Tournament, TTeam } from '../types';
import { MatchScreen } from './MatchScreen';
import { VetoScreen } from './VetoScreen';
import { Scoreboard } from './Scoreboard';
import { AttrBar, Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';
import { logoForTeam } from '../data/media';
import { hashStr } from '../state/hash';
import { regionOf, REGION_LABELS, type RegionKey } from '../data/regions';
import { CS2_REAL_2026 } from '../data/bo3';
import { applyBo3Edits } from '../state/bo3-edits';
import bo3Ages from '../data/bo3-ages.json';

const SAVE_KEY = 'rtm-career-v1';
const STARTING_BUDGET = 3_800_000; // começo mais magro: forca um elenco humilde no inicio
const CIRCUIT_AI_BOOST = 3.5; // adversarios do circuito mais fortes (balanceamento)
// premiação mais enxuta: montar o time dos sonhos leva várias temporadas (antes
// dava pra ter o melhor elenco com grana sobrando já no split 3)
const PRIZE_BY_POS = [1_250_000, 750_000, 450_000, 280_000, 170_000, 110_000, 70_000, 40_000];
const VRS_BY_POS = [150, 105, 75, 52, 36, 26, 18, 11];
const LEAGUE_BO: 1 | 3 = 3;
const MAJOR_SPOTS = 2; // top 2 do Circuit X garantem vaga no Major
// o Major Mundial só acontece a cada N splits: a jornada até ele é mais longa
const MAJOR_EVERY = 2;
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

interface Signing {
  playerId: string;
  fromId: string;
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

// campeonato escolhido para o split (define o chaveamento e a premiação)
interface CircuitChoice {
  id: string;
  name: string;
  spots: number;     // vagas que vão ao Major
  prizeMult: number; // multiplicador de premiação
  vrsMult: number;   // multiplicador de VRS
  tier: number;      // 1 = elite (caminho do Major), 3 = liga de acesso
}

// tiers do cenário (como na vida real do CS): 1 = elite mundial, 3 = acesso.
// o jogador começa no Tier 3 e precisa SUBIR vencendo no seu nível.
const TIER_NAMES: Record<number, string> = { 1: 'Tier 1 · Elite', 2: 'Tier 2 · Challenger', 3: 'Tier 3 · Acesso' };
function teamTier(t: TeamSeason): number {
  return t.teamwork >= 84 ? 1 : t.teamwork >= 80 ? 2 : 3;
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

// reposição da base: quando você TIRA um jogador de um time (contratação), ele
// não pode ficar nos dois lugares. O time perde o titular e promove um jovem da
// base (OVR baixo, determinístico) pra manter 5 — o time fica realmente mais fraco.
const FILL_ROLES = ['Rifler', 'Entry', 'Support', 'AWP', 'IGL'] as const;
function backfillPlayers(team: TeamSeason, n: number): Player[] {
  const out: Player[] = [];
  for (let i = 0; i < n; i++) {
    const h = hashStr(`fill:${team.id}:${i}`);
    const base = 64 + (h % 9); // 64-72
    out.push({
      id: `${team.id}__aca${i}`,
      nick: `${team.tag}.jr${i + 1}`,
      name: 'Jovem da base',
      country: team.country,
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
}
// verba de quem ASSUME uma org com elenco: tier mais alto (time melhor) = menos
// caixa; tier baixo = mais caixa. É a troca "elenco bom x dinheiro" que o user pediu.
const takeoverBudget = (tier: number) => (tier === 1 ? 600_000 : tier === 2 ? 1_300_000 : 2_300_000);

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
  seeds: string[];   // top 4 (ordem de seed) ao entrar nos playoffs
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
  evo: Record<string, number>; // delta acumulado de evolução por jogador (id)
  lastEvo: { nick: string; delta: number; phase: PlayerPhase }[]; // última janela
  sponsorUntil: Record<string, number>; // patrocinador id -> split até onde o contrato vale
  moves: Record<string, string>; // transferências aplicadas: playerId -> teamId atual
  lastMoves: { nick: string; from: string; to: string }[]; // transferências do último split
  tier: number; // tier atual da organização (1 = elite). Começa em 3.
  tierChange?: 'up' | 'down' | null; // resultado da última temporada (promoção/rebaixamento)
  takeoverId?: string | null; // id do time real que o jogador assumiu (excluído dos adversários)
  pendingOffer?: PoachOffer | null; // proposta de uma org maior por um jogador seu
  board: number; // confiança da diretoria (0-100). Cai se você falha os objetivos.
  objective?: BoardObjective | null; // meta da diretoria pro split atual
  lastObjective?: { text: string; met: boolean; delta: number } | null; // resultado do split passado
  fired?: boolean; // demitido pela diretoria (confiança no chão)
  contracts?: Record<string, number>; // playerId -> split em que o contrato termina (inclusive)
  lastReleases?: string[]; // nicks que saíram por fim de contrato no split passado
  roles?: Record<string, Role>; // função escolhida pelo técnico (override do dado da base): playerId -> Role
  careerStats?: Record<string, CareerStatLine>; // stats acumuladas na carreira por id (cresce a cada split)
  trainingFocus?: string | null; // id do jogador em foco de treino no split atual (acelera a evolução)
}

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
});

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
function baseAge(p: Pick<Player, 'id' | 'nick'>): number {
  const real = REAL_AGES[p.nick]?.age;
  if (real && real >= 15 && real <= 45) return real;
  return 20 + (hashStr(`age:${p.id}`) % 6); // 20-25 pros sem dado
}
function effectiveAge(p: Pick<Player, 'id' | 'nick'>, split: number): number {
  return baseAge(p) + Math.floor((split - 1) / 3);
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
  return age >= 31 ? (r < 55 ? -3 : -1) : r < 50 ? -2 : -1; // veterano cai
}

// ----- helpers do playoff (mata-mata do circuito) -----
function buildPlayoff(table: TTeam[], circuit: string): Playoff {
  const s = table.slice(0, 4).map((t) => t.id);
  return {
    circuit,
    seeds: s,
    sf: [
      { a: s[0], b: s[3] }, // 1 x 4
      { a: s[1], b: s[2] }, // 2 x 3
    ],
    final: null,
    champion: null,
    runnerUp: null,
  };
}
const poWinner = (m: PlayoffMatch | null | undefined): string | null =>
  m?.result ? (m.result.winner === 0 ? m.a : m.b) : null;
function poAdvance(p: Playoff): void {
  if (!p.final && p.sf[0].result && p.sf[1].result) {
    p.final = { a: poWinner(p.sf[0])!, b: poWinner(p.sf[1])! };
  }
  if (p.final?.result && !p.champion) {
    p.champion = poWinner(p.final)!;
    p.runnerUp = p.final.a === p.champion ? p.final.b : p.final.a;
  }
}
function poUserMatch(p: Playoff): PlayoffMatch | null {
  const all = [p.sf[0], p.sf[1], p.final].filter(Boolean) as PlayoffMatch[];
  return all.find((m) => !m.result && (m.a === 'user' || m.b === 'user')) ?? null;
}
// resolve em cascata todas as partidas que NÃO envolvem o usuário
function poRunAI(p: Playoff, team: (id: string) => TTeam, rng: Rng): void {
  for (let guard = 0; guard < 8; guard++) {
    poAdvance(p);
    const all = [p.sf[0], p.sf[1], p.final].filter(Boolean) as PlayoffMatch[];
    const m = all.find((x) => !x.result && x.a !== 'user' && x.b !== 'user');
    if (!m) break;
    const a = team(m.a);
    const b = team(m.b);
    const bo = p.final === m ? PO_FINAL_BO : PO_SF_BO;
    m.result = simulateSeries(rng, a, b, autoVeto([a, b], rng, bo), bo);
  }
  poAdvance(p);
}
// colocação do usuário no playoff (1 campeão, 2 vice, 3 semifinalista, 99 fora)
function poUserRank(p: Playoff | null): number {
  if (!p) return 99;
  if (p.champion === 'user') return 1;
  if (p.runnerUp === 'user') return 2;
  if (p.seeds.includes('user')) return 3;
  return 99;
}

// ---------- cenário competitivo: VRS por região e Top 20 HLTV ----------
// VRS determinístico de um time da IA (o time do usuário usa o VRS real do save)
function aiTeamVrs(t: TeamSeason): number {
  const base = Math.max(0, t.teamwork - 38);
  return Math.round(base * 24 + (hashStr(t.id) % 90));
}
// região do time: país do time, senão maioria dos jogadores, senão Europa
function teamRegion(t: TeamSeason): RegionKey {
  const direct = regionOf(t.country);
  if (direct) return direct;
  const tally = new Map<RegionKey, number>();
  for (const p of t.players) {
    const r = regionOf(p.country);
    if (r) tally.set(r, (tally.get(r) ?? 0) + 1);
  }
  let best: RegionKey = 'europe';
  let bestN = -1;
  for (const [r, n] of tally) if (n > bestN) { best = r; bestN = n; }
  return best;
}
// ordem das regiões no ranking (as 5 pedidas + Ásia/África se houver times)
const REGION_ORDER: RegionKey[] = ['samerica', 'namerica', 'europe', 'cis', 'oceania', 'asia', 'africa'];

// rating "do ano" de um jogador (estilo HLTV), determinístico por temporada
function playerSeasonRating(p: Player, split: number): number {
  const ovr = playerOvr(p);
  const form = ((hashStr(`${p.id}:r${split}`) % 160) - 60) / 1000; // -0.06..+0.10
  // escala estilo HLTV: ~0.95 (mediano) até ~1.40 (melhor do mundo)
  return Math.max(0.85, 0.95 + (ovr - 70) / 55 + form);
}
// melhores N jogadores da temporada (entre todos os elencos da era)
function seasonTopPlayers(pool: TeamSeason[], split: number, n: number) {
  return pool
    .flatMap((t) => t.players.map((p) => ({ p, team: t, rating: playerSeasonRating(p, split) })))
    .sort((a, b) => b.rating - a.rating)
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

function loadSave(): CareerSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return emptySave();
    const s = JSON.parse(raw) as CareerSave;
    return { ...emptySave(), ...s };
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

const coachFee = (c: Coach): number => Math.max(100_000, (c.rating - 60) * 30_000);

// opção de entrada: técnico iniciante barato para clubes recém-fundados
const ROOKIE_COACH: Coach = { nick: 'rook1e', name: 'Técnico Iniciante', country: 'br', rating: 66, style: 'tactical' };
const ROOKIE_ID = '__rookie__';

type Stage = 'found' | 'market' | 'circuit' | 'hub' | 'veto' | 'match' | 'playoffHub' | 'seasonEnd' | 'majorHub' | 'major';
type HubTab = 'overview' | 'major' | 'market' | 'finance' | 'results' | 'standings' | 'squad' | 'vrs' | 'top20' | 'history';

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
  const [orgChoice, setOrgChoice] = useState<'select' | 'fictional'>('select'); // sub-tela da fundação
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
  const [profilePlayer, setProfilePlayer] = useState<Player | null>(null); // perfil detalhado do jogador (modal)
  const [t20Mode, setT20Mode] = useState<'season' | 'career'>('season'); // Top 20: temporada ou carreira
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

  // SÓ tempos atuais: usa EXCLUSIVAMENTE os elencos REAIS de CS2 (2026) do
  // bo3.gg, exclusivos do modo carreira (não aparecem no draft/online). Os
  // times CS2 antigos feitos à mão não entram aqui (evita duplicatas e OVRs
  // desatualizados).
  const currentEra = useMemo(
    // aplica as transferências já realizadas (save.moves) por cima da base:
    // assim os jogadores transferidos aparecem MESMO nos elencos novos
    () => applyMoves(applyBo3Edits(CS2_REAL_2026), save.moves).filter((t) => t.players.length >= 5),
    [save.moves],
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
  const brTeams = useMemo(
    () => oppEra.filter((t) => t.country === 'br').sort((a, b) => b.teamwork - a.teamwork),
    [oppEra],
  );

  // Campeonatos disponíveis a cada split: o jogador escolhe qual convite aceitar,
  // já sabendo quais times vai enfrentar em cada um. Cada circuito tem força,
  // premiação e número de vagas pro Major diferentes.
  const circuits = useMemo(() => {
    const pool = oppEra.filter((t) => t.id !== 'user');
    const byStrength = [...pool].sort((a, b) => b.teamwork - a.teamwork);
    const br = brTeams.filter((t) => t.id !== 'user');
    const mid = byStrength.slice(8, 16); // times medianos (fora do top 8)
    const mk = (
      id: string,
      name: string,
      desc: string,
      teams: TeamSeason[],
      spots: number,
      prizeMult: number,
      vrsMult: number,
      tier: number,
    ) => ({ id, name, desc, teams: teams.slice(0, 7), spots, prizeMult, vrsMult, tier });
    return [
      mk('blast', 'BLAST Premier (Mundial)', 'Tier 1 mundial: os gigantes. É AQUI que se chega ao Major. Paga muito mais.', byStrength, 2, 1.7, 1.6, 1),
      mk('gcmasters', 'Gamers Club Masters (BR)', 'Tier 2: liga nacional equilibrada. Vença para subir ao Tier 1 e brigar pelo Major.', br, 2, 1, 1, 2),
      mk('eslchallenger', 'ESL Challenger', 'Tier 3: liga de acesso com times medianos. Onde toda org começa.', mid, 1, 0.6, 0.6, 3),
    ].filter((c) => c.teams.length >= 5);
  }, [oppEra, brTeams]);

  // mercado: jogadores reais dos elencos atuais (CS2), com preço de mercado
  const market = useMemo(
    () =>
      currentEra
        .flatMap((t) => t.players.map((p) => ({ player: p, from: t, price: playerValue(p) })))
        .sort((a, b) => a.price - b.price),
    [currentEra],
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
    return { ...team, tag: s.org.tag, colors: s.org.colors, logoUrl: s.org.logo };
  };

  const startSplit = (s: CareerSave, circuit: (typeof circuits)[number]) => {
    const user = buildTeam(s);
    if (!user) return;
    // a IA fica mais forte a cada split: impede passar a carreira inteira
    // invicto depois de montar um time bom (o cenario "evolui" junto com você)
    const aiBoost = CIRCUIT_AI_BOOST + Math.min(13, (s.split - 1) * 1.7);
    const ai = circuit.teams.filter((t) => t.id !== 'user').slice(0, 7).map((t) => {
      const tt = teamSeasonToTTeam(t);
      tt.strength += aiBoost;
      return tt;
    });
    // turno e returno: temporada mais longa (14 rodadas com 8 times)
    const league = createLeague(`${circuit.name} - Split ${s.split}`, [user, ...ai], 2);
    const choice: CircuitChoice = {
      id: circuit.id,
      name: circuit.name,
      spots: circuit.spots,
      prizeMult: circuit.prizeMult,
      vrsMult: circuit.vrsMult,
      tier: circuit.tier,
    };
    const next = {
      ...s, league, circuit: choice, tierChange: null,
      objective: objectiveFor(circuit.tier, s.split, isMajorSplit(s.split)),
    };
    persist(next);
    setSave(next);
    setHubTab('overview');
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
      const age = effectiveAge(f.player, s.split);
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

  // contratos vencidos: o jogador cujo contrato acaba SAI de graça no próximo
  // split (a não ser que tenha sido renovado nas Finanças). Devolve o elenco
  // sem eles + os nicks que saíram (pra avisar no resumo do split).
  const expireContracts = (s: CareerSave, newSplit: number): Pick<CareerSave, 'squad' | 'contracts' | 'lastReleases'> => {
    const c = { ...(s.contracts ?? {}) };
    const released: string[] = [];
    const squad = s.squad.filter((sig) => {
      const until = c[sig.playerId];
      if (until !== undefined && until < newSplit) {
        released.push(findSigning(sig)?.player.nick ?? sig.playerId);
        delete c[sig.playerId];
        return false;
      }
      return true;
    });
    return { squad, contracts: c, lastReleases: released };
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
    resolveLeagueRound(l, rngRef.current, LEAGUE_BO);
    setMatchCtx(null);
    if (leagueDone(l)) {
      enterPlayoffs(l);
      return;
    }
    const next = { ...save, league: { ...l } };
    persist(next);
    setSave(next);
    setStage('hub');
  };

  // entra no mata-mata do circuito: top 4 jogam SF + final pelo título e vagas
  const enterPlayoffs = (l: League) => {
    const p = buildPlayoff(leagueTable(l), save.circuit?.name ?? l.name);
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
    const a = leagueTeam(save.league, m.a);
    const b = leagueTeam(save.league, m.b);
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
    const a = leagueTeam(save.league, live.a);
    const b = leagueTeam(save.league, live.b);
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
    const a = leagueTeam(l, m.a);
    const b = leagueTeam(l, m.b);
    const series = simulateSeries(rngRef.current, a, b, autoVeto([a, b], rngRef.current, LEAGUE_BO), LEAGUE_BO);
    setQuickSim({
      series, teams: [a, b], userIdx: m.a === 'user' ? 0 : 1,
      label: `${l.name} · Rodada ${l.current + 1}`,
      onDone: () => { setQuickSim(null); finishUserRound(l, series); },
    });
  };

  // SIM SPLIT: resolve TODAS as rodadas restantes do turno de uma vez (sem
  // animação) e para no mata-mata — corta a repetição de clicar rodada a rodada
  // (pedido de quem joga no celular) sem pular a parte decisiva (playoffs).
  const simWholeSplit = (l: League) => {
    rngRef.current = makeRng(randomSeed());
    let guard = 0;
    while (!leagueDone(l) && guard++ < 80) {
      const m = userLeagueMatch(l);
      if (m && !m.result) {
        const a = leagueTeam(l, m.a);
        const b = leagueTeam(l, m.b);
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
    const pool = currentEra.filter((t) => t.id !== 'user');
    const major = createTournament(pool, user, rngRef.current, MAJOR_NAME(s.split), 6 + Math.min(8, (s.split - 1)));
    setMajorT(major);
    setHubTab('major');
    setStage('hub');
  };

  // encerra o Major: calcula colocação, prêmio e VRS
  const concludeMajor = (t: Tournament) => {
    const placement = placementCode(t, 'user');
    setMajorResult({
      tournament: t,
      placement,
      prize: MAJOR_PRIZE[placement],
      vrs: MAJOR_VRS[placement],
      champion: placement === 'champion',
    });
    setStage('major');
  };

  // abre o veto/partida da rodada do usuário no Major
  const playMajorMine = () => {
    if (!majorT) return;
    const up = tournamentUserPairing(majorT);
    if (!up) return;
    const a = getTeam(majorT, up.a);
    const b = getTeam(majorT, up.b);
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
    setMajorT(clone);
    if (clone.phase === 'done') concludeMajor(clone);
    else { setHubTab('major'); setStage('hub'); }
  };

  const advanceMajor = (clone: Tournament) => {
    setMajorT(clone);
    if (clone.phase === 'done') concludeMajor(clone);
    else { setHubTab('major'); setStage('hub'); }
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
    const a = getTeam(majorT, up.a);
    const b = getTeam(majorT, up.b);
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
    () =>
      currentEra
        .flatMap((t) => t.players.map((p) => ({ p, team: t, rating: playerSeasonRating(p, save.split) })))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 20),
    [currentEra, save.split],
  );
  // ranking de CARREIRA: maiores ratings acumulados (estatísticas que sobem com
  // a evolução). Inclui você e quem você enfrentou pelos circuitos.
  const careerTop20Memo = useMemo(() => {
    const cs = save.careerStats ?? {};
    const byId = new Map<string, Player>();
    for (const t of CS2_REAL_2026) for (const p of t.players) byId.set(p.id, p);
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
  const vrsByRegionMemo = useMemo(() => {
    type Row = { id: string; name: string; tag: string; colors: [string, string]; logoUrl?: string; country: string; vrs: number; isUser: boolean };
    const rows: Row[] = oppEra.map((t) => ({
      id: t.id, name: `${t.team}`, tag: t.tag, colors: t.colors, logoUrl: t.logoUrl ?? logoForTeam(t),
      country: t.country, vrs: aiTeamVrs(t), isUser: false,
    }));
    if (buildTeam(save) && save.org) {
      rows.push({ id: 'user', name: save.org.name, tag: save.org.tag, colors: save.org.colors, logoUrl: save.org.logo, country: 'br', vrs: save.vrs, isUser: true });
    }
    const groups = new Map<RegionKey, Row[]>();
    for (const r of rows) {
      const t = currentEra.find((x) => x.id === r.id);
      const reg: RegionKey = r.isUser ? 'samerica' : t ? teamRegion(t) : 'europe';
      if (!groups.has(reg)) groups.set(reg, []);
      groups.get(reg)!.push(r);
    }
    return REGION_ORDER.filter((k) => groups.has(k)).map((k) => ({
      key: k,
      label: REGION_LABELS[k],
      teams: groups.get(k)!.sort((a, b) => b.vrs - a.vrs),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, currentEra]);

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
    if (orgChoice === 'fictional') {
      return <FoundOrg onExit={() => setOrgChoice('select')} onFound={(org) => {
        update({ org, takeoverId: null });
        setStage('market');
      }} />;
    }
    return (
      <OrgSelect
        teams={currentEra}
        onExit={onExit}
        onFictional={() => setOrgChoice('fictional')}
        onStart={(s) => {
          update({ org: s.org, squad: s.squad, coachFromId: s.coachFromId, budget: s.budget, tier: s.tier, takeoverId: s.takeoverId });
          setStage('market');
        }}
      />
    );
  }

  // ---------- mercado ----------
  if (stage === 'market') {
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
            const next: CareerSave = {
              ...save,
              squad: save.squad.filter((s) => s.playerId !== off.playerId),
              budget: save.budget + off.fee,
              pendingOffer: null,
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
          const next = { ...save, squad, coachFromId, budget, sponsors, sponsorUntil, contracts };
          persist(next);
          setSave(next);
          setStage('circuit');
        }}
      />
    );
  }

  // ---------- escolha do campeonato (qual convite aceitar) ----------
  if (stage === 'circuit') {
    return (
      <CircuitPicker
        circuits={circuits}
        split={save.split}
        playerTier={save.tier}
        onBack={() => setStage('market')}
        onPick={(c) => startSplit(save, c)}
      />
    );
  }

  const league = save.league;

  // ---------- resultado do Major ----------
  if (stage === 'major' && majorResult) {
    const mr = majorResult;
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
                const next = {
                  ...save,
                  budget: save.budget + mr.prize - payroll + sponsorIncome(save.sponsors) + majBonus,
                  vrs: save.vrs + mr.vrs,
                  titles: save.titles + (mr.champion ? 1 : 0),
                  split: save.split + 1,
                  league: null,
                  circuit: null,
                  playoff: null,
                  history: [...save.history, finished],
                  ...evolveSquad(save),
                  ...applyTransferWindow(save),
                  pendingOffer: null, // vindo do Major (tier 1): ninguém te assedia "pra cima"
                  board: majBoard,
                  lastObjective: majObj ? { text: majObj.text, met: true, delta: majBoard - save.board } : null,
                  objective: null,
                  ...expireContracts(save, save.split + 1),
                };
                persist(next);
                setSave(next);
                setMajorResult(null);
                setStage('market');
              }}
            >
              Pagar folha ({formatMoney(payroll)}) e ir pro Split {save.split + 1}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- fim de temporada (split) ----------
  if (stage === 'seasonEnd' && league) {
    const table = leagueTable(league);
    const pos = table.findIndex((t) => t.id === 'user') + 1;
    const me = leagueTeam(league, 'user');
    // premiações e destaques da temporada
    const seStats = seasonPlayerStats(league);
    const circuitMvp = seStats[0];
    const mySquadIdsSE = new Set((buildTeam(save)?.players ?? []).map((p) => p.id));
    const myStar = seStats.find((s) => mySquadIdsSE.has(s.id));
    const seasonTop3 = seasonTopPlayers(currentEra, save.split, 3);
    const nextFeed = feedMemo;
    const spots = save.circuit?.spots ?? MAJOR_SPOTS;
    // o título e as vagas no Major saem do PLAYOFF (mata-mata), não da fase de pontos
    const poRank = poUserRank(save.playoff);
    const isChampion = save.playoff?.champion === 'user';
    // bônus de mata-mata: campeão +60%, vice +25%
    const poMult = isChampion ? 1.6 : poRank === 2 ? 1.25 : 1;
    const prize = Math.round((PRIZE_BY_POS[pos - 1] ?? 50_000) * (save.circuit?.prizeMult ?? 1) * poMult);
    const vrsGain = Math.round((VRS_BY_POS[pos - 1] ?? 10) * (save.circuit?.vrsMult ?? 1) * poMult);
    // vaga pelo mata-mata, mas o Major só acontece a cada MAJOR_EVERY splits:
    // a jornada até ele é mais longa (rank garante, mas tem que ser split de Major)
    // o Major só é alcançável pelo Tier 1 (circuito BLAST): a meta é SUBIR de tier
    const rankQualified = save.playoff ? poRank <= spots : pos <= spots;
    const majorNow = isMajorSplit(save.split);
    const isTier1 = (save.circuit?.tier ?? 3) === 1;
    const qualified = rankQualified && majorNow && isTier1;
    const nextMajorSplit = save.split + (MAJOR_EVERY - (save.split % MAJOR_EVERY));

    // promoção/rebaixamento: só conta se você jogou no SEU tier (não farmando abaixo).
    // campeão sobe; fundo da tabela (penúltimo/último) cai.
    const finalPos = save.playoff ? Math.min(pos, poRank) : pos;
    const circuitTier = save.circuit?.tier ?? save.tier;
    const fieldSize = league.teams.length;
    const tierResult: { tier: number; tierChange: 'up' | 'down' | null } = (() => {
      if (circuitTier !== save.tier) return { tier: save.tier, tierChange: null };
      if (isChampion) return { tier: Math.max(1, save.tier - 1), tierChange: save.tier > 1 ? 'up' : null };
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
    const newBoard = Math.max(0, Math.min(100, save.board + boardDelta));
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
                <b>CLASSIFICADO PRO MAJOR MUNDIAL!</b> Chegar ao top {spots} do mata-mata do {save.circuit?.name ?? 'circuito'}
                {' '}garantiu a vaga. Hora de enfrentar os melhores do mundo.
              </div>
            ) : rankQualified && !majorNow ? (
              <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
                Campanha de Major, mas calma: o <b>Major Mundial acontece a cada {MAJOR_EVERY} splits</b>.
                O próximo é no fim do <b>Split {nextMajorSplit}</b>. Mantenha o nível até lá.
              </p>
            ) : (
              <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
                Chegue ao <b>top {spots}</b> do mata-mata do {save.circuit?.name ?? 'circuito'} no split de Major
                (a cada {MAJOR_EVERY} splits; o próximo é no <b>Split {majorNow ? save.split : nextMajorSplit}</b>) para garantir a vaga.
                Continue acumulando VRS e reforçando o elenco.
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
              <div className="se-award">
                <div className="se-award-title">Top 3 HLTV da temporada</div>
                <div className="se-top3">
                  {seasonTop3.map((e, i) => (
                    <div key={e.p.id} className="se-top3-row">
                      <span className="t20-rank">{i + 1}</span>
                      <span className="bp-nick"><Flag cc={e.p.country} /> {e.p.nick} <span className="muted small">{e.team.tag}</span></span>
                      <span className="t20-rating">{e.rating.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

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
                      careerStats: accumulateCareerStats(save.careerStats, league),
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
                  const next = {
                    ...save,
                    budget: save.budget + prize - payroll + sponsorIncome(save.sponsors) + objBonus,
                    vrs: save.vrs + vrsGain,
                    titles: save.titles + (isChampion ? 1 : 0),
                    split: save.split + 1,
                    league: null,
                    circuit: null,
                    playoff: null,
                    history: [...save.history, baseRecord()],
                    careerStats: accumulateCareerStats(save.careerStats, league),
                    ...evolveSquad(save),
                    ...applyTransferWindow(save),
                    ...boardPatch,
                    tier: tierResult.tier,
                    tierChange: tierResult.tierChange,
                    pendingOffer: makeOffer(save, tierResult.tier),
                    ...expireContracts(save, save.split + 1),
                  };
                  persist(next);
                  setSave(next);
                  setStage('market'); // se foi demitido, o render mostra a tela de demissão
                }}
              >
                Pagar folha e ir pro Split {save.split + 1}
              </button>
            </div>
          </div>
        </div>
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
    const isFinalNext = !!userMatch && p.final === userMatch;
    return (
      <div className="career-major-live">
        <div className="major-live-bar">
          <b>PLAYOFFS</b> · {p.circuit} · Split {save.split}
          <span className="spacer" />
          {userMatch ? (
            <>
              <button className="btn ghost" onClick={simPlayoffMine}>⏩ Simular</button>
              <button className="btn gold" onClick={playPlayoffMine}>▶ {isFinalNext ? 'Jogar a final' : 'Jogar minha semi'}</button>
            </>
          ) : p.champion ? (
            <button className="btn gold" onClick={() => setStage('seasonEnd')}>Ver resultado do split →</button>
          ) : null}
        </div>
        <PlayoffBracket p={p} teamOf={teamOf} onOpen={(s, ts) => setSelSeries({ series: s, teams: ts })} />
        {selSeries && <Scoreboard series={selSeries.series} teams={selSeries.teams} />}
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
    const a = leagueTeam(league, myMatch.a);
    const b = leagueTeam(league, myMatch.b);
    setMatchCtx({
      teams: [a, b],
      userIdx: myMatch.a === 'user' ? 0 : 1,
      mode: 'league',
      bestOf: LEAGUE_BO,
      phaseLabel: `${league.name} · Rodada ${league.current + 1}`,
    });
    setStage('veto');
  };

  const myPos = userPosition(league);
  const spots = save.circuit?.spots ?? MAJOR_SPOTS;
  const form = clubForm(league);
  const opp = myMatch ? leagueTeam(league, myMatch.a === 'user' ? myMatch.b : myMatch.a) : null;
  const oppPos = opp ? table.findIndex((t) => t.id === opp.id) + 1 : 0;
  const me = leagueTeam(league, 'user');
  const seasonStats = seasonStatsMemo;
  const mySquadIds = new Set((buildTeam(save)?.players ?? []).map((p) => p.id));
  const org = aggregateHistory(save.history);

  const majorActive = !!majorT && majorT.phase !== 'done';
  const TABS: { id: HubTab; label: string }[] = [
    { id: 'overview', label: 'Visão geral' },
    ...(majorActive ? [{ id: 'major' as HubTab, label: '★ Major' }] : []),
    { id: 'results', label: 'Resultados' },
    { id: 'standings', label: 'Classificação' },
    { id: 'squad', label: 'Elenco' },
    { id: 'finance', label: '💰 Finanças' },
    { id: 'market', label: 'Mercado' },
    { id: 'vrs', label: 'Ranking VRS' },
    { id: 'top20', label: 'Top 20 HLTV' },
    { id: 'history', label: 'História da org' },
  ];

  const vrsByRegion = vrsByRegionMemo;

  const top20 = top20Memo;
  const careerTop20 = careerTop20Memo;

  return (
    <div className="fade-in career-hub">
      {/* barra do clube (estilo hub do FIFA) */}
      <div className="career-topbar">
        <TeamBadge tag={save.org?.tag ?? ''} colors={save.org?.colors ?? ['#101820', '#61a8dd']} size={46} logoUrl={save.org?.logo} />
        <div className="ct-id">
          <div className="ct-name">
            {save.org?.name}
            <span className={`tier-badge t${save.tier}`}>TIER {save.tier}</span>
          </div>
          <div className="ct-sub">{save.circuit?.name ?? 'CIRCUIT X'} · Split {save.split}</div>
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

      <div className="career-tabs">
        {TABS.map((tab) => (
          <button key={tab.id} className={`career-tab${hubTab === tab.id ? ' on' : ''}`} onClick={() => setHubTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== VISÃO GERAL ===== */}
      {hubTab === 'overview' && (
        <div className="career-grid">
          <div className="career-main">
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
                  <li><b>Temporada em turno e returno</b>: {league.rounds.length} rodadas; os <b>4 melhores</b> vão pro mata-mata (semis MD3 + final MD5) que decide o campeão.</li>
                  <li><b>Major Mundial a cada {MAJOR_EVERY} splits</b>: chegue ao top {spots} do mata-mata num split de Major (o próximo é no Split {isMajorSplit(save.split) ? save.split : save.split + (MAJOR_EVERY - (save.split % MAJOR_EVERY))}) pra garantir a vaga.</li>
                  <li><b>Janela de transferências só entre temporadas</b>: durante o split é com o elenco que você tem.</li>
                  <li><b>Seu elenco evolui entre temporadas</b>: jogador em ascensão melhora, veterano em declínio cai; valor e salário acompanham. Olhe a fase de carreira antes de contratar.</li>
                  <li><b>Patrocinadores</b> pagam por split, e marcas maiores exigem mais VRS (seu ranking).</li>
                </ul>
              </div>
            )}
            {opp && myMatch ? (
              <div className="play-match-card" style={{ background: `linear-gradient(110deg, ${save.org?.colors[0] ?? '#101820'}cc, var(--header) 70%)` }}>
                <div className="pm-info">
                  <div className="pm-label">PRÓXIMA PARTIDA · MD3 · Rodada {league.current + 1}/{league.rounds.length}</div>
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
                    <Flag cc={opp.country} /> {oppPos}º na tabela · força {opp.strength.toFixed(1)}
                  </div>
                </div>
                <div className="pm-actions">
                  <button className="btn gold big" onClick={playMine}>▶ JOGAR</button>
                  <button className="btn ghost" onClick={() => simMine(league)}>⏩ Simular</button>
                  <button className="btn ghost" onClick={() => simWholeSplit(league)} title="Resolve todas as rodadas restantes de uma vez e vai pro mata-mata">⏩⏩ Split inteiro</button>
                </div>
              </div>
            ) : (
              <div className="career-banner">Rodada concluída. Avançando…</div>
            )}

            {/* resumo da temporada atual */}
            <div className="career-statgrid">
              <div className="cstat"><b>{me.wins}-{me.losses}</b><span>Campanha</span></div>
              <div className="cstat"><b className={me.roundDiff >= 0 ? 'pos' : 'neg'}>{me.roundDiff >= 0 ? '+' : ''}{me.roundDiff}</b><span>Saldo de rounds</span></div>
              <div className="cstat"><b>{myPos}º / {league.teams.length}</b><span>Posição</span></div>
              <div className="cstat"><b>{league.current}/{league.rounds.length}</b><span>Rodadas jogadas</span></div>
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
              <div className="muted small section-label" style={{ marginTop: 0 }}>Classificação · top {spots} vai ao Major</div>
              <CareerTable table={table} highlightTop={spots} onPick={setSelTeam} />
            </div>
            <div className="side-card">
              <div className="muted small section-label" style={{ marginTop: 0 }}>Destaques da temporada</div>
              <BestPlayers stats={seasonStats.slice(0, 5)} mine={mySquadIds} />
            </div>
          </div>
        </div>
      )}

      {/* ===== MAJOR AO VIVO (dentro do hub) ===== */}
      {hubTab === 'major' && majorT && (
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
      )}

      {/* ===== MERCADO: janela FECHADA durante a temporada ===== */}
      {hubTab === 'market' && (
        <div className="panel">
          <div className="panel-body center">
            <div className="trophy" style={{ fontSize: 40 }}>🔒</div>
            <h2>Janela de transferências fechada</h2>
            <p className="muted" style={{ maxWidth: 520, margin: '10px auto 4px' }}>
              Contratações só entre temporadas: a janela abre quando o split termina
              (depois dos playoffs{majorT ? ' e do Major' : ''}). Enquanto isso, é com
              o elenco que você tem.
            </p>
            <p className="muted small">Rodada {league.current + 1} de {league.rounds.length} · a janela abre ao fim do split</p>
            {/* prévia do mercado: dá pra olhar os rumores, mas não contratar */}
            <div className="muted small section-label" style={{ textAlign: 'left' }}>Rumores da próxima janela</div>
            <TransferFeed items={feedMemo} compact />
          </div>
        </div>
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
            <div className="muted small section-label" style={{ marginTop: 0 }}>{save.circuit?.name ?? 'Circuito'} · top {spots} vai ao Major Mundial</div>
            <CareerTable table={table} highlightTop={spots} onPick={setSelTeam} detailed />
            <p className="muted small" style={{ marginTop: 10 }}>Clique em um time para ver elenco, técnico e força.</p>
          </div>
        </div>
      )}

      {/* ===== ELENCO + RANKING DE JOGADORES ===== */}
      {hubTab === 'finance' && (() => {
        const picks = save.squad.map((s) => ({ sig: s, f: findSigning(s) })).filter((x) => x.f) as { sig: Signing; f: { player: Player } }[];
        const wages = picks.map((x) => ({ ...x, wage: playerWage(x.f.player), until: save.contracts?.[x.sig.playerId] }));
        const folha = wages.reduce((a, w) => a + w.wage, 0);
        const sponsorInc = sponsorIncome(save.sponsors);
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
              <table className="stats">
                <thead><tr><th style={{ textAlign: 'left' }}>Jogador</th><th>Idade</th><th>OVR</th><th>POT</th><th>Salário/split</th><th>Contrato</th><th></th></tr></thead>
                <tbody>
                  {wages.map((w) => {
                    const left = w.until != null ? w.until - save.split + 1 : 0;
                    const expiring = left <= 1;
                    const age = effectiveAge(w.f.player, save.split);
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
                return (
                  <div key={p.id} className={`cs-row${focused ? ' cs-focused' : ''}`}>
                    <button className="cs-open" onClick={() => setProfilePlayer(p)} title="Ver perfil do jogador">
                      <PlayerAvatar nick={p.nick} size={32} />
                      <span className="cs-nick"><Flag cc={p.country} /> {p.nick}
                        {grew > 0 && <span className="cs-grew" title={`+${grew} de evolução na carreira`}> ▲{grew}</span>}
                      </span>
                    </button>
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
            <div className="side-card">
              <div className="muted small section-label" style={{ marginTop: 0 }}>Melhores jogadores do {save.circuit?.name ?? 'circuito'}</div>
              <BestPlayers stats={seasonStats.slice(0, 8)} mine={mySquadIds} ranked />
            </div>
          </div>
        </div>
        );
      })()}

      {/* ===== RANKING VRS POR REGIÃO ===== */}
      {hubTab === 'vrs' && (
        <div className="panel">
          <div className="panel-body">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Ranking mundial de VRS por região</div>
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
                              <Flag cc={t.country} />
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
                {top20.map((e, i) => (
                  <div key={e.p.id} className={`t20-row${i === 0 ? ' first' : ''}`}>
                    <span className="t20-rank">{i + 1}</span>
                    <PlayerAvatar nick={e.p.nick} size={32} />
                    <span className="t20-nick"><Flag cc={e.p.country} /> {e.p.nick}</span>
                    <span className="muted small t20-team">
                      <TeamBadge tag={e.team.tag} colors={e.team.colors} size={16} logoUrl={e.team.logoUrl ?? logoForTeam(e.team)} /> {e.team.tag}
                    </span>
                    <span className={`role-pill ${e.p.role}`}>{e.p.role}</span>
                    <span className="t20-rating">{e.rating.toFixed(2)}</span>
                  </div>
                ))}
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

      {selSeries && <Scoreboard series={selSeries.series} teams={selSeries.teams} />}
      {selTeam && <TeamDetail team={selTeam} onClose={() => setSelTeam(null)} />}
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
            focused={save.trainingFocus === p.id}
            onToggleFocus={() => update({ trainingFocus: save.trainingFocus === p.id ? null : p.id })}
            onClose={() => setProfilePlayer(null)}
          />
        );
      })()}
    </div>
  );
}

// perfil completo do jogador (modal, só leitura). Atributos em barras + idade,
// potencial, fase, valor/salário/contrato e as STATS DE CARREIRA acumuladas
// (rating/K-D/ADR/KAST/mapas). O jogador da carreira não edita nada aqui — os
// atributos sobem sozinhos com a evolução; quem edita é o admin no CRM.
function PlayerProfile({ player, split, career, cur, contractUntil, evoTotal, focused, onToggleFocus, onClose }: {
  player: Player;
  split: number;
  career: ReturnType<typeof deriveCareer>;
  cur?: SeasonStat;
  contractUntil?: number;
  evoTotal: number;
  focused: boolean;
  onToggleFocus: () => void;
  onClose: () => void;
}) {
  const age = effectiveAge(player, split);
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
          <PlayerAvatar nick={player.nick} size={64} />
          <div className="pp-id">
            <div className="pp-nick"><Flag cc={player.country} /> {player.nick}
              <span className={`role-pill ${player.role}`} style={{ marginLeft: 8 }}>{player.role}</span>
            </div>
            <div className="muted small">{player.name}</div>
            <div className="pp-tags">
              <span className="pp-tag">{age} anos</span>
              <span className={`pp-tag pot-${tier}`}>POT {tier} ({pot})</span>
              <span className="pp-tag">{PHASE_LABEL[phase]}</span>
              {focused && <span className="pp-tag focus">🎯 em treino</span>}
            </div>
          </div>
          <OvrBadge ovr={ovr} />
        </div>

        <div className="pp-grid">
          <div className="pp-col">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Atributos
              {evoTotal > 0 && <span className="cs-grew"> ▲{evoTotal} na carreira</span>}
            </div>
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
function TeamDetail({ team, onClose }: { team: TTeam; onClose: () => void }) {
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

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onDone, 700);
    return () => clearTimeout(t);
  }, [done, onDone]);

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
            <span className="qs-final">
              {series.winner === userIdx ? 'Vitória!' : 'Derrota'} · {series.mapScore[0]}-{series.mapScore[1]}
            </span>
          ) : (
            <button className="btn ghost small" onClick={() => setDone(true)}>Pular ⏭</button>
          )}
        </div>
      </div>
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
  const Side = ({ id, win, seed }: { id?: string; win?: boolean; seed?: number }) => {
    if (!id) return <div className="po-side tbd"><span className="muted small">a definir</span></div>;
    const t = teamOf(id);
    return (
      <div className={`po-side${win ? ' win' : ''}${id === 'user' ? ' mine' : ''}`}>
        {seed && <span className="po-seed">{seed}</span>}
        <TeamBadge tag={t.tag} colors={t.colors} size={24} logoUrl={t.logoUrl} />
        <span className="po-tname"><Flag cc={t.country} /> {t.name}</span>
      </div>
    );
  };
  const Match = ({ m, label, seeds }: { m: PlayoffMatch | null; label: string; seeds?: [number, number] }) => {
    const w = poWinner(m);
    const r = m?.result;
    return (
      <div className={`po-match${r ? ' clickable' : ''}`}
        onClick={() => r && m && onOpen(r, [teamOf(m.a), teamOf(m.b)])}>
        <div className="po-label">{label}</div>
        <Side id={m?.a} win={!!w && w === m?.a} seed={seeds?.[0]} />
        <div className="po-score">{r ? `${r.mapScore[0]} : ${r.mapScore[1]}` : 'vs'}</div>
        <Side id={m?.b} win={!!w && w === m?.b} seed={seeds?.[1]} />
      </div>
    );
  };
  const champ = p.champion ? teamOf(p.champion) : null;
  return (
    <div className="panel">
      <div className="panel-head">{p.circuit} · Playoffs (mata-mata)</div>
      <div className="panel-body">
        <div className="po-bracket">
          <div className="po-col">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Semifinais (MD3)</div>
            <Match m={p.sf[0]} label="SF1" seeds={[1, 4]} />
            <Match m={p.sf[1]} label="SF2" seeds={[2, 3]} />
          </div>
          <div className="po-col">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Grande final (MD5)</div>
            <Match m={p.final} label="FINAL" />
            {champ && (
              <div className="po-champ">
                <div className="trophy" style={{ fontSize: 30 }}>🏆</div>
                <TeamBadge tag={champ.tag} colors={champ.colors} size={34} logoUrl={champ.logoUrl} />
                <div><b>{champ.name}</b><div className="muted small">campeão do {p.circuit}</div></div>
              </div>
            )}
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
  vrsMult: number;
  tier: number;
}
function CircuitPicker({ circuits, split, playerTier, onPick, onBack }: {
  circuits: CircuitOption[];
  split: number;
  playerTier: number;
  onPick: (c: CircuitOption) => void;
  onBack: () => void;
}) {
  // você só entra em circuitos do SEU tier ou mais fáceis (tier maior). Subir de
  // tier libera os circuitos de cima (o Tier 1 / BLAST é o caminho do Major).
  const canEnter = (opt: CircuitOption) => opt.tier >= playerTier;
  const firstOk = Math.max(0, circuits.findIndex((o) => canEnter(o)));
  const [sel, setSel] = useState(firstOk);
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
                    <span>VRS ×{opt.vrsMult}</span>
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
function OrgSelect({ teams, onStart, onFictional, onExit }: {
  teams: TeamSeason[];
  onStart: (s: OrgStart) => void;
  onFictional: () => void;
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
  const [coachId, setCoachId] = useState<string | null>(save.coachFromId);
  const [filter, setFilter] = useState('');
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
    return acc + (f ? playerValue(f.player) : 0);
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
  const coachOptions = [...coaches].sort((a, b) => coachFee(a.coach) - coachFee(b.coach));
  const budgetLeft = save.budget - spentPlayers - spentCoach + soldPlayers;
  const ready = squad.length === 5 && !!coachId && budgetLeft >= 0;

  const visible = market.filter(
    (m) =>
      !squad.some((s) => s.playerId === m.player.id) &&
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
            {coachOptions.slice(0, 12).map((t) => (
              <button key={t.id} className={`call-btn${coachId === t.id ? ' armed' : ''}`}
                title={`${t.coach.name} (${t.team})`}
                onClick={() => setCoachId(coachId === t.id ? null : t.id)}>
                {t.coach.nick} · {t.coach.rating} · {formatMoney(coachFee(t.coach))}
              </button>
            ))}
          </div>

          <div className="muted small section-label">Mercado ({visible.length} disponíveis)</div>
          <div className="field" style={{ marginBottom: 8 }}>
            <input placeholder="Buscar jogador ou time…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="career-market scroll">
            {visible.slice(0, 200).map((m) => {
              const dup = signedNicks.has(m.player.nick.toLowerCase());
              const affordable = m.price <= budgetLeft && squad.length < 5 && !dup;
              return (
                <button key={m.player.id} className={`pcard${!affordable ? ' taken' : ''}`}
                  disabled={!affordable}
                  onClick={() => setSquad([...squad, { playerId: m.player.id, fromId: m.from.id }])}>
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
                    const age = effectiveAge(m.player, save.split);
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
    </div>
  );
}
