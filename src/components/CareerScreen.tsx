// MODO CARREIRA REALISTA, gratuito e disponível em /carreira.
// Fundar ou assumir uma organização, gerir elenco, contratos, academia e caixa,
// disputar circuitos regionais, subir no VRS e buscar o Major Mundial completo
// em três stages suíços mais Champions Stage. A interface usa PT como fonte e
// traduz as strings da carreira com ct().
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { formatMoney, playerValue, playerWage, buildUserTeam, playerOvr, resyncUserRoles } from '../engine/ratings';
import { leagueDone, leagueTable, leagueTeam, resolveLeagueRound, userLeagueMatch, type League, type LeagueMatch } from '../engine/league';
import { createGSLStage, resolveGSLRound, gslDone, gslQualifiers, gslGroupView, GSL_ROUND_LABELS } from '../engine/gsl';
import { teamSeasonToTTeam } from '../engine/ratings';
import { simulateSeries } from '../engine/match';
import { autoVeto } from '../engine/veto';
import { createSwissStage, createPlayoffStage, stageAdvancers, placementCode, resolveRound, userPairing as tournamentUserPairing, getTeam, type PlacementCode } from '../engine/swiss';
// Hub: usado pela MajorTab; import movido pra page.
import { makeRng, randomSeed, type Rng } from '../engine/rng';
import type { Coach, MapId, Player, Playbook, Role, SeriesResult, TeamSeason, Tournament, TTeam } from '../types';
import { MAP_LABELS, MAP_POOL } from '../types';
import { MatchScreen } from './MatchScreen';
import { bestSeriesMoment } from '../engine/narration';
import { tournamentMvpNick, tournamentTeamRecords } from '../engine/hall';
import { applyRivalryFocus, recordRivalry, rivalryScore } from '../engine/career/rivalries';
import { applyFatigueForm, recoverFatigue, updateMatchFatigue } from '../engine/career/fatigue';
import { applyAnalystPrep, developmentBonus, EMPTY_FACILITIES, facilityUpgradeCost, facilityUpkeep, normalizeFacilities, stabilizeMorale } from '../engine/career/facilities';
import { personalityChemBonus, personalityDevelopmentBonus, personalityMoraleDelta, personalityOfferBonus, playerPersonality, type PlayerPersonality } from '../engine/career/personality';
import { hydrateCareerDepth } from '../engine/career/save';
import { parseAcademyPlayerId, parseRegenPlayerId, partitionResolvable } from '../engine/career/signings';
import { matchesNegotiationFilters } from '../engine/career/market';
// academyLeague: usado pela AcademyTab; import movido pra page.
import { VetoScreen } from './VetoScreen';
import { Scoreboard } from './Scoreboard';
import { Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';
// FutCard: usado pela SquadTab; import movido pra page.
import { DashCard } from './career/DashCard';
import { CareerShell, CareerDashFrame } from './career/CareerShell';
import { CareerPlayerPage } from './career/CareerPlayerPage';
import { CareerTeamPage } from './career/CareerTeamPage';
// PlayerLink: usado pela SquadTab; import movido pra page.
import { playerOrgId, playerRuntimeId } from '../state/career-player-route';
import {
  canCareerGoBack,
  careerHistoryBack,
  careerHistoryForward,
  initCareerNav,
  navigateCareerHub,
  navigateCareerPlayer,
  navigateCareerTeam,
  parseCareerPlayerId,
  parseCareerTeamId,
} from '../state/career-nav';
// buildDashboardTasks + CareerOverview + RecentMatchRow: usados pela OverviewTab; imports movidos pra page.
import { CareerIcon, type CareerIconName } from './career/CareerIcon';
import { CareerConfirmProvider, useCareerConfirm } from './career/ConfirmModal';
// OrgFlag: usado pelas pages (WorldTab/VrsTab); import removido daqui.
import { logoForTeam } from '../data/media';
import { hashStr } from '../state/hash';
import { macroRegionOf, macroRegionPlurality, MACRO_REGION_LABELS, MACRO_REGION_ORDER, type MacroRegion } from '../data/regions';
import { CS2_REAL_2026 } from '../data/bo3';
import { applyBo3Edits, applyBo3PlayerEdit, fetchBo3Edits, loadBo3Edits, mergeBo3Edits, saveBo3Edits, type Bo3Edits } from '../state/bo3-edits';
import { isAdminUnlocked } from './AdminGate';
import { useLang } from '../state/i18n';
import { ct, setCareerLang } from '../state/career-i18n';
import { getManager } from '../state/manager';
import { getActiveSlot } from '../state/careerSaves';
import { useGame, type Hydrator } from '../state/gameStore';
import type { VersionedSave } from '../state/saveMigrations';
import bo3Ages from '../data/bo3-ages.json';
const STARTING_BUDGET = 2_000_000; // começo realmente humilde: não dá pra montar um elenco de elite (str ~88) e dominar o Tier 3 de cara
const CIRCUIT_AI_BOOST = 1.5; // leve vantagem do circuito (mantem forcas perto do Major)
// premiação mais enxuta: montar o time dos sonhos leva várias temporadas (antes
// dava pra ter o melhor elenco com grana sobrando já no split 3)
const VRS_BY_POS = [150, 105, 75, 52, 36, 26, 18, 11];
// VRS é ROLANTE (como o Valve ranking real): a cada split os pontos antigos
// decaem, então não acumulam pra sempre (acabou o usuário com 3000 e a IA com
// 1200). No equilíbrio o VRS ganho ~ ganho/(1-decay), comparável ao field.
const VRS_DECAY = 0.6;
// PLANO DE JOGO: a decisão pré-partida do usuário. Cada plano dá um buff REAL na
// simulação (some você do "modo espectador": sua escolha muda a partida).
export type GamePlan = 'disciplined' | 'antistrat' | 'mapfocus' | 'aggressive';
const GAME_PLANS: { id: GamePlan; icon: CareerIconName; label: string; desc: string }[] = [
  { id: 'disciplined', icon: 'brain', label: ct('Disciplinado'), desc: ct('Jogo seguro e constante. Baixa variância, base sólida.') },
  { id: 'antistrat', icon: 'search', label: 'Anti-strat', desc: ct('Estuda o adversário: defesa mais sólida. Bom contra times melhores.') },
  { id: 'mapfocus', icon: 'map', label: ct('Foco no mapa forte'), desc: ct('Puxa o veto pro seu melhor mapa e joga mais forte nele.') },
  { id: 'aggressive', icon: 'swords', label: ct('Agressivo'), desc: ct('Pressão nas aberturas: teto alto, mais arriscado.') },
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
export const MAJOR_VRS_CUT = 32; // os 32 melhores do ranking VRS vão ao Major (3 stages)
// o Major Mundial fecha a TEMPORADA: a cada N campeonatos/splits acontece um Major.
// 4 = a temporada tem 3 campeonatos tier-1 + o Major encerrando o ano.
export const MAJOR_EVERY = 4;
// CADA SPLIT TEM VÁRIOS CAMPEONATOS (etapas). O "relógio do mundo" — idade dos
// jogadores, mercado/transferências, renovações, decaimento de VRS, Major — só
// avança ao FECHAR o split (a última etapa). As etapas intermediárias você joga
// com o MESMO elenco, sem offseason: mais campeonatos antes do mundo mexer.
const EVENTS_PER_SPLIT = 3;
export const isMajorSplit = (split: number) => split % MAJOR_EVERY === 0;
// VRS do Major por colocação (o prêmio em $ vem do pool real × fatia, ver eventPrize)
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
  // Calendário expandido: ~35 eventos T1 do ano (rotação por split×etapa)
  'IEM Katowice', 'ESL Pro League S20', 'IEM Cologne', 'IEM Dallas',
  'PGL Cluj-Napoca', 'BLAST Premier World Final', 'IEM Chengdu', 'Esports World Cup',
  'BLAST Open Lisboa', 'IEM Melbourne', 'PGL Astana', 'Thunderpick World Championship',
  'IEM Rio', 'BLAST Spring Final', 'BLAST Fall Final', 'IEM Sydney',
  'PGL Bucharest', 'IEM Fortaleza', 'BLAST Bounty', 'Gamers8 Riyadh',
  'BLAST Open Spring', 'BLAST Premier Spring Final', 'PGL Wallachia', 'IEM World Champ',
  'EPL Conference', 'ESL Pro League S21', 'BLAST Premier Fall', 'IEM Beijing',
  'PGL Belgrade', 'IEM Atlanta', 'BetBoom Dacha Belgrade', 'BetBoom Dacha Dubai',
  'Roobet Masters', 'YaLLa Compass Riyadh', 'IEM Berlin',
];
// Cada ETAPA do split é um evento distinto do calendário (não só por split).
const evIndex = (split: number, ev: number, len: number) => ((((split - 1) * EVENTS_PER_SPLIT + (ev - 1)) % len) + len) % len;
const t1EventName = (split: number, ev = 1) => T1_EVENTS[evIndex(split, ev, T1_EVENTS.length)];

// Tier 2 mundial: circuitos de segundo escalão reais (sem trava de região).
const T2_EVENTS = [
  'ESL Challenger League', 'CCT Global Finals', 'Elisa Masters Espoo', 'YaLLa Compass',
  'Thunderpick World Champ', 'Pinnacle Cup', 'CCT Season Finals', 'Skyesports Masters',
  'ESL Challenger Valencia', 'CCT South America', 'CCT Europe', 'European Pro League S2',
  'Roobet Cup', 'Snow Sweet Snow', 'Pinnacle Cup Championship', 'Fragadelphia',
  'CCT Asia', 'CCT North America', 'Elisa Invitational', 'Esports Charts Cup',
  'ESL Impact Finals', 'Skyesports Champions', 'United Masters League', 'Pinnacle Champ Cup',
  'BLAST Bounty Spring', 'Akros Showmatch', 'GG.Bet Showdown', 'BetBoom Cup',
  'CCT Online Finals', 'IceCold Cup',
];
const t2EventName = (split: number, ev = 1) => T2_EVENTS[evIndex(split, ev, T2_EVENTS.length)];

// Tier 3: circuitos de acesso/qualificatórias (onde toda org começa).
// AGORA segmentado por região — funções regionEventName() devolvem o nome do
// evento certo pra região do user. Mantém T3_EVENTS como pool global default.
const T3_EVENTS = [
  'ESEA Advanced Season', 'CCT Open Series', 'European Pro League',
  'Pinnacle Winter Series', 'Elisa Invitational Qual', 'ESL Challenger Open', 'CCT Series',
  'ESEA Cash Cup', 'Aorus League', 'CBCS Series',
  'ESEA Open Season', 'Pinnacle Summer Series', 'CCT Open Qualifier',
  'ESL Open Cup', 'CCT Closed Qualifier', 'Esports Spring League',
  'Akros League', 'GG.Bet Tide',
];
// Sub-arrays REGIONAIS pra T3 — usado quando region routing determina escopo.
const T3_SA_EVENTS = [
  'Gamers Club Liga Pro', 'Gamers Club Masters', 'CCT South America', 'CBCS Series',
  'BB Masters Brasil', 'Aorus League BR', 'CazéTV Cup', 'Liga Gamers Club',
  'Esportes da Sorte Cup', 'NSG Brasileirão CS', 'Aorus League SA', 'Loud Park BR',
  'CCT South America S2', 'BB Masters Andinos', 'Liga Furiosa', 'Brasileirão CS',
];
const T3_EU_EVENTS = [
  'European Pro League', 'ESEA Advanced Season', 'CCT Europe Series', 'Esportal Spring',
  'Pinnacle Winter Series', 'Elisa Invitational Qual', 'ESL Challenger Open',
  'GamersOrigin League', 'eXTREMESLAND EU', 'EVC EU Open', 'CCT Closed Qualifier',
  'A1 League', 'Polskie Mistrzostwa', 'United Kingdom Open', 'Akros League EU',
];
const T3_ASIA_EVENTS = [
  'Perfect World Asia League', 'Asia Championship', 'CCT Asia Series', 'Esports Charts Asia',
  'Skyesports Stage', 'TIGER Asia League', 'Akros Asia', 'Mongolian Premier League',
];
const t3EventName = (split: number, ev = 1) => T3_EVENTS[evIndex(split, ev, T3_EVENTS.length)];
// Picker por região: cai num pool regional específico (default = global).
// Exportado pra ser usado pelo CircuitPicker (Frente 3 — region routing).
export const t3RegionalEventName = (split: number, ev: number, region: 'sa' | 'eu' | 'asia' | 'global') => {
  const pool = region === 'sa' ? T3_SA_EVENTS : region === 'eu' ? T3_EU_EVENTS : region === 'asia' ? T3_ASIA_EVENTS : T3_EVENTS;
  return pool[evIndex(split, ev, pool.length)];
};

// IMERSÃO: prize pool real (USD) e sede de cada evento do calendário (fonte:
// Liquipedia/HLTV). Só FLAVOR — o prêmio que entra no caixa segue a fórmula
// balanceada (PRIZE_BY_POS × prizeMult), não o pool real, pra não estourar a
// economia. Eventos sem entrada caem num default por tier.
const EVENT_META: Record<string, { prize: number; venue: string }> = {
  // Majors
  'PGL Major Copenhagen': { prize: 1_250_000, venue: 'Copenhague 🇩🇰' },
  'BLAST.tv Austin Major': { prize: 1_250_000, venue: 'Austin 🇺🇸' },
  'IEM Major Rio': { prize: 1_250_000, venue: 'Rio de Janeiro 🇧🇷' },
  'PGL Major Budapest': { prize: 1_250_000, venue: 'Budapeste 🇭🇺' },
  'ESL One Major Cologne': { prize: 1_250_000, venue: 'Colônia 🇩🇪' },
  // Tier 1
  'IEM Katowice': { prize: 1_000_000, venue: 'Katowice 🇵🇱' },
  'ESL Pro League': { prize: 850_000, venue: 'Malta 🇲🇹' },
  'IEM Cologne': { prize: 1_000_000, venue: 'Colônia 🇩🇪' },
  'IEM Dallas': { prize: 250_000, venue: 'Dallas 🇺🇸' },
  'PGL Cluj-Napoca': { prize: 1_250_000, venue: 'Cluj-Napoca 🇷🇴' },
  'BLAST Premier World Final': { prize: 1_000_000, venue: 'Singapura 🇸🇬' },
  'IEM Chengdu': { prize: 500_000, venue: 'Chengdu 🇨🇳' },
  'Esports World Cup': { prize: 1_250_000, venue: 'Riade 🇸🇦' },
  'BLAST Open Lisboa': { prize: 200_000, venue: 'Lisboa 🇵🇹' },
  'IEM Melbourne': { prize: 250_000, venue: 'Melbourne 🇦🇺' },
  'PGL Astana': { prize: 500_000, venue: 'Astana 🇰🇿' },
  'Thunderpick World Championship': { prize: 1_000_000, venue: 'Malta 🇲🇹' },
  'IEM Rio': { prize: 250_000, venue: 'Rio de Janeiro 🇧🇷' },
  'BLAST Spring Final': { prize: 425_000, venue: 'Londres 🇬🇧' },
  'BLAST Fall Final': { prize: 425_000, venue: 'Copenhague 🇩🇰' },
  'IEM Sydney': { prize: 250_000, venue: 'Sydney 🇦🇺' },
  'PGL Bucharest': { prize: 1_000_000, venue: 'Bucareste 🇷🇴' },
  'IEM Fortaleza': { prize: 250_000, venue: 'Fortaleza 🇧🇷' },
  'BLAST Bounty': { prize: 300_000, venue: 'Copenhague 🇩🇰' },
  'Gamers8 Riyadh': { prize: 1_000_000, venue: 'Riade 🇸🇦' },
  // Tier 2
  'CCT Global Finals': { prize: 200_000, venue: 'Belgrado 🇷🇸' },
  'Elisa Masters Espoo': { prize: 75_000, venue: 'Espoo 🇫🇮' },
  'Thunderpick World Champ': { prize: 250_000, venue: 'Malta 🇲🇹' },
  'Pinnacle Cup': { prize: 100_000, venue: 'online 🌐' },
  'CCT Season Finals': { prize: 150_000, venue: 'Belgrado 🇷🇸' },
  'Skyesports Masters': { prize: 100_000, venue: 'Mumbai 🇮🇳' },
  'ESL Challenger Valencia': { prize: 100_000, venue: 'Valência 🇪🇸' },
  'Pinnacle Cup Championship': { prize: 200_000, venue: 'online 🌐' },
  'Fragadelphia': { prize: 30_000, venue: 'Filadélfia 🇺🇸' },
  // Tier 1 expandido
  'BLAST Open Spring': { prize: 200_000, venue: 'Londres 🇬🇧' },
  'BLAST Premier Spring Final': { prize: 400_000, venue: 'Singapura 🇸🇬' },
  'PGL Wallachia': { prize: 600_000, venue: 'Bucareste 🇷🇴' },
  'IEM World Champ': { prize: 1_000_000, venue: 'Katowice 🇵🇱' },
  'EPL Conference': { prize: 100_000, venue: 'Malta 🇲🇹' },
  'ESL Pro League S20': { prize: 850_000, venue: 'Malta 🇲🇹' },
  'ESL Pro League S21': { prize: 850_000, venue: 'Malta 🇲🇹' },
  'BLAST Premier Fall': { prize: 425_000, venue: 'Estocolmo 🇸🇪' },
  'IEM Beijing': { prize: 500_000, venue: 'Pequim 🇨🇳' },
  'PGL Belgrade': { prize: 1_250_000, venue: 'Belgrado 🇷🇸' },
  'IEM Atlanta': { prize: 250_000, venue: 'Atlanta 🇺🇸' },
  'BetBoom Dacha Belgrade': { prize: 300_000, venue: 'Belgrado 🇷🇸' },
  'BetBoom Dacha Dubai': { prize: 300_000, venue: 'Dubai 🇦🇪' },
  'Roobet Masters': { prize: 300_000, venue: 'online 🌐' },
  'YaLLa Compass Riyadh': { prize: 200_000, venue: 'Riade 🇸🇦' },
  'IEM Berlin': { prize: 750_000, venue: 'Berlim 🇩🇪' },
  // Tier 2 expandido
  'CCT Asia': { prize: 80_000, venue: 'online 🌐' },
  'CCT North America': { prize: 80_000, venue: 'online 🌐' },
  'Elisa Invitational': { prize: 60_000, venue: 'Helsinki 🇫🇮' },
  'Esports Charts Cup': { prize: 50_000, venue: 'online 🌐' },
  'ESL Impact Finals': { prize: 100_000, venue: 'Malta 🇲🇹' },
  'Skyesports Champions': { prize: 100_000, venue: 'Bangalore 🇮🇳' },
  'United Masters League': { prize: 75_000, venue: 'online 🌐' },
  'Pinnacle Champ Cup': { prize: 150_000, venue: 'online 🌐' },
  'BLAST Bounty Spring': { prize: 300_000, venue: 'Copenhague 🇩🇰' },
  'Akros Showmatch': { prize: 50_000, venue: 'online 🌐' },
  'GG.Bet Showdown': { prize: 60_000, venue: 'online 🌐' },
  'BetBoom Cup': { prize: 80_000, venue: 'online 🌐' },
  'CCT Online Finals': { prize: 100_000, venue: 'online 🌐' },
  'IceCold Cup': { prize: 40_000, venue: 'online 🌐' },
  // Tier 3 / locais
  'Gamers Club Liga Pro': { prize: 15_000, venue: 'São Paulo 🇧🇷' },
  'Gamers Club Masters': { prize: 25_000, venue: 'São Paulo 🇧🇷' },
  'Aorus League': { prize: 15_000, venue: 'Buenos Aires 🇦🇷' },
  'CBCS Series': { prize: 10_000, venue: 'Brasil 🇧🇷' },
  'Liga Gamers Club': { prize: 10_000, venue: 'São Paulo 🇧🇷' },
  // Tier 3 SA expandido
  'BB Masters Brasil': { prize: 20_000, venue: 'São Paulo 🇧🇷' },
  'Aorus League BR': { prize: 18_000, venue: 'São Paulo 🇧🇷' },
  'CazéTV Cup': { prize: 15_000, venue: 'online 🇧🇷' },
  'Esportes da Sorte Cup': { prize: 12_000, venue: 'online 🇧🇷' },
  'NSG Brasileirão CS': { prize: 18_000, venue: 'online 🇧🇷' },
  'Aorus League SA': { prize: 20_000, venue: 'Buenos Aires 🇦🇷' },
  'Loud Park BR': { prize: 15_000, venue: 'São Paulo 🇧🇷' },
  'CCT South America S2': { prize: 25_000, venue: 'online 🇧🇷' },
  'BB Masters Andinos': { prize: 18_000, venue: 'Lima 🇵🇪' },
  'Liga Furiosa': { prize: 15_000, venue: 'online 🇧🇷' },
  'Brasileirão CS': { prize: 20_000, venue: 'São Paulo 🇧🇷' },
  // Tier 3 EU expandido
  'CCT Europe Series': { prize: 25_000, venue: 'online 🌐' },
  'Esportal Spring': { prize: 15_000, venue: 'Estocolmo 🇸🇪' },
  'GamersOrigin League': { prize: 20_000, venue: 'Paris 🇫🇷' },
  'eXTREMESLAND EU': { prize: 25_000, venue: 'Bratislava 🇸🇰' },
  'EVC EU Open': { prize: 18_000, venue: 'online 🌐' },
  'A1 League': { prize: 15_000, venue: 'Viena 🇦🇹' },
  'Polskie Mistrzostwa': { prize: 18_000, venue: 'Varsóvia 🇵🇱' },
  'United Kingdom Open': { prize: 15_000, venue: 'Londres 🇬🇧' },
  'Akros League EU': { prize: 18_000, venue: 'online 🌐' },
  // Tier 3 Asia
  'Perfect World Asia League': { prize: 50_000, venue: 'Xangai 🇨🇳' },
  'Asia Championship': { prize: 60_000, venue: 'Seul 🇰🇷' },
  'CCT Asia Series': { prize: 30_000, venue: 'online 🌐' },
  'Esports Charts Asia': { prize: 25_000, venue: 'online 🌐' },
  'Skyesports Stage': { prize: 30_000, venue: 'Mumbai 🇮🇳' },
  'TIGER Asia League': { prize: 25_000, venue: 'Tóquio 🇯🇵' },
  'Akros Asia': { prize: 20_000, venue: 'online 🌐' },
  'Mongolian Premier League': { prize: 18_000, venue: 'Ulaanbaatar 🇲🇳' },
  // Tier 3 fallbacks novos
  'ESL Open Cup': { prize: 12_000, venue: 'online 🌐' },
  'CCT Closed Qualifier': { prize: 8_000, venue: 'online 🌐' },
  'Esports Spring League': { prize: 15_000, venue: 'online 🌐' },
  'Akros League': { prize: 15_000, venue: 'online 🌐' },
  'GG.Bet Tide': { prize: 12_000, venue: 'online 🌐' },
};
const TIER_DEFAULT_POOL: Record<number, { prize: number; venue: string }> = {
  1: { prize: 500_000, venue: 'circuito mundial 🌐' },
  2: { prize: 100_000, venue: 'circuito internacional 🌐' },
  3: { prize: 15_000, venue: 'circuito de acesso 🌐' },
};
export const eventMeta = (name: string, tier: number) => EVENT_META[name] ?? TIER_DEFAULT_POOL[tier] ?? TIER_DEFAULT_POOL[3];
// prize pool compacto em USD: $1.25M / $850k
const fmtPool = (usd: number) => (usd >= 1_000_000 ? `$${(usd / 1_000_000).toFixed(usd % 1_000_000 === 0 ? 0 : 2)}M` : `$${Math.round(usd / 1000)}k`);
// PRÊMIO por colocação (caixa). Equilibrado pra não enriquecer fácil: o Major é o
// grande pagador (campeão ~700k, na régua do ~$500k real), e os circuitos pagam
// uma fração disso (campeão Tier-1 ~345k com o prizeMult). Subir de tier e ir ao
// Major é o caminho do dinheiro; grindar circuito fraco rende pouco.
const PRIZE_BY_POS = [260_000, 156_000, 95_000, 60_000, 36_000, 23_000, 15_000, 8_000];
// premiação do Major por colocação (bem maior que o circuito)
const MAJOR_PRIZE: Record<PlacementCode, number> = {
  champion: 1_200_000,
  runnerup: 550_000,
  semi: 320_000,
  quarters: 170_000,
  playoffs: 90_000,
  swiss: 35_000,
};

export interface Signing {
  playerId: string;
  fromId: string;
  fee?: number; // valor negociado da transferência (se ausente, usa o de tabela)
  // Saves antigos guardavam apenas IDs. O snapshot evita que uma atualização da
  // base transforme um contratado em uma vaga invisível e bloqueie o mercado.
  playerSnapshot?: Player;
  fromSnapshot?: {
    id: string;
    team: string;
    tag: string;
    country: string;
    colors: [string, string];
    logoUrl?: string;
  };
}

interface ResolvedSigning {
  player: Player;
  from: TeamSeason;
  basePlayer: Player;
}

function signingWithSnapshot(signing: Signing, resolved: ResolvedSigning): Signing {
  const { from, basePlayer } = resolved;
  return {
    ...signing,
    playerSnapshot: { ...basePlayer },
    fromSnapshot: {
      id: from.id,
      team: from.team,
      tag: from.tag,
      country: from.country,
      colors: [...from.colors] as [string, string],
      logoUrl: from.logoUrl,
    },
  };
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
    return { kind: 'reject', firm: true, msg: `${player.nick} ${ct('não está à venda. O clube não quer nem ouvir.')}` };
  }
  // PISO: o menor valor que o clube aceita. Amolece no MÁXIMO ~12% ao longo de
  // poucas rodadas e NUNCA abaixo disso — insistir com a mesma oferta não derruba
  // mais o preço (antes a contraproposta caía sem limite e dava pra pagar 0).
  const soft = Math.round(asking * (1 - 0.04 * Math.min(round, 3)));
  if (offer >= soft) return { kind: 'accept' };
  const ratio = offer / Math.max(1, asking);
  // lowball repetido: o clube cansa e encerra a negociação
  if (ratio < 0.6 && round >= 2) {
    return { kind: 'reject', firm: true, msg: ct('O clube cansou da conversa: proposta baixa demais, negociação encerrada.') };
  }
  if (ratio < 0.45) {
    return { kind: 'reject', firm: false, msg: ct('Proposta muito abaixo do valor. O clube recusou na hora.') };
  }
  // contraproposta entre a sua oferta e a pedida, SEMPRE >= o piso (nunca abaixo)
  const counter = Math.max(soft, Math.round((offer + asking) / 2));
  return { kind: 'counter', value: counter };
}

// Patrocinadores movidos pra src/data/sponsors.ts (T3.5). O catálogo legacy
// (Logitech, HyperX, Razer, Secretlab, Monster, Intel, Red Bull, Samsung) e a
// interface Sponsor são preservados idênticos — saves antigos continuam ok.
// O engine novo (src/engine/sponsors.ts) adiciona OFERTAS DINÂMICAS por split,
// COOLDOWN pós-recusa e BÔNUS POR PLACEMENT — sem mexer no income legacy.
import { SPONSORS, SPONSOR_SLOTS, sponsorById, sponsorIncome } from '../data/sponsors';
import {
  tryGenerateOffer as trySponsorOffer,
  acceptOffer as acceptSponsorOffer,
  rejectOffer as rejectSponsorOffer,
  cleanupExpired as cleanupExpiredSponsors,
  placementBonusTotal as sponsorPlacementBonusTotal,
  type SponsorOffer,
  type SponsorState,
} from '../engine/sponsors';
import {
  tryGenerateTeamEvent,
  resolveTeamEvent as resolveTeamEventEngine,
  type PendingTeamEvent,
  type TeamEventState,
} from '../engine/teamEvents';
import { detectYearAwards, type YearAwards } from '../engine/awards';
import { type TalkResult } from '../engine/playerTalks';
import { TeamEventModal } from './TeamEventModal';
import { YearAwardsModal } from './YearAwardsModal';
import { PlayerTalkModal } from './PlayerTalkModal';
// ChemistryMatrix/CoachStintsCard/ScrimCard/ScoutingCard: usados pela SquadTab; imports movidos pra page.
// chemistry engine — usado em advanceSplit (decay) e após série jogada (tick).
// O modifier no match strength fica aplicado dentro do ChemistryMatrix (avg
// visível). Integração no engine de match (multiplicar strength) é PR
// separado — não muda o sigmoid do simulateSeries por enquanto.
import { tickPairChemAfterMatch, decayPairChemOnSplitChange, averageStarterChemistry } from '../engine/chemistry';
import { recordSaveTick, type SaveSnapshot } from '../state/achievements';
import {
  activeStint as activeCoachStint,
  startStint as startCoachStint,
  appendTrophy as appendCoachTrophy,
  type CoachStint,
} from '../engine/coachCareer';
import { tickAging, type AgingState } from '../engine/aging';
import { canScrimNow, runScrim } from '../engine/scrim';
import { playerAttributes } from '../engine/attributes';
import {
  generateScoutReports,
  scoutById,
  type ProspectCandidate,
  type ScoutReport,
} from '../engine/scouting';
import { useToast, Modal } from './ds';
import { confirm as confirmDialog } from './ConfirmDialog';
// T8.1 — abrir tutorial HowToPlay (host global montado no main.tsx)
import { openHowToPlay } from './HowToPlayHost';
import { openMeta } from './MetaPageHost';
import { openFiredModal } from './FiredModalHost';
import { openInfrastructure } from './InfrastructurePageHost';
import { openLockerRoom } from './LockerRoomPageHost';
import { openLogoBuilder } from './LogoBuilderHost';
import { InteractiveTour } from './InteractiveTour';
import { openSeasonRecap, type SeasonRecapData } from './SeasonRecapModalHost';
// T11 — modais cinematográficos
import { ChampionCelebrationModal, type ChampionCelebrationData } from './ChampionCelebrationModal';
import { PlayerRetirementModal, type PlayerRetirementData } from './PlayerRetirementModal';
import { TournamentEliminationModal, type TournamentEliminationData } from './TournamentEliminationModal';
// T1.4: abas extraídas em src/pages/career/. CareerScreen segue orquestrando
// state/handlers — só o JSX da aba saiu pra arquivo próprio.
import { StandingsTab } from '../pages/career/StandingsTab';
import { ResultsTab } from '../pages/career/ResultsTab';
import { VrsTab } from '../pages/career/VrsTab';
import { Top20Tab } from '../pages/career/Top20Tab';
import { HistoryTab } from '../pages/career/HistoryTab';
import { BracketTab } from '../pages/career/BracketTab';
import { InboxTab } from '../pages/career/InboxTab';
import { CalendarTab } from '../pages/career/CalendarTab';
import { WorldTab } from '../pages/career/WorldTab';
import { AcademyTab } from '../pages/career/AcademyTab';
import { MajorTab } from '../pages/career/MajorTab';
import { FinanceTab } from '../pages/career/FinanceTab';
import { SquadTab } from '../pages/career/SquadTab';
import { OverviewTab } from '../pages/career/OverviewTab';

// ----- prestígio + fãs da org (estilo Brasval) -----
// Derivados de conquistas (sem campo novo no save: não quebram saves e sobem ao
// longo da carreira). Prestígio 5-99; fãs crescem junto.
function careerPrestige(save: CareerSave): number {
  const h = aggregateHistory(save.history);
  const v = 22 + save.titles * 7 + h.majorApps * 4 + h.circuitTitles * 3 + (3 - (save.tier ?? 3)) * 6 + (save.vrs ?? 0) / 40;
  return Math.max(5, Math.min(99, Math.round(v)));
}
export function careerFans(save: CareerSave): number {
  const p = careerPrestige(save);
  return Math.round(Math.pow(p, 1.6) * 1100 + aggregateHistory(save.history).totalPrize / 120);
}
// patrocínio efetivo: prestígio atrai marcas melhores (até +33% no topo).
export function effSponsorIncome(save: CareerSave): number {
  return Math.round(sponsorIncome(save.sponsors) * (1 + careerPrestige(save) / 300));
}

// T3.11: garante que existe stint ATIVO pra o coach atual. Se não, abre um
// novo (caso típico de save migrado pra v8: tinha coachFromId mas array vazio).
// Não muta o save — devolve patch parcial.
function ensureActiveCoachStint(save: CareerSave): Partial<CareerSave> {
  if (!save.coachFromId || !save.org) return {};
  const stints = save.coachStints ?? [];
  const cur = activeCoachStint(stints);
  if (cur && cur.coachId === save.coachFromId) return {}; // já está ok
  // Tenta resolver o nick do coach. Pra simplicidade pegamos o ROOKIE como
  // fallback de label — não impacta a engine.
  const coachNick = save.coachFromId === ROOKIE_ID ? ROOKIE_COACH.nick : save.coachFromId;
  return {
    coachStints: startCoachStint(stints, {
      coachId: save.coachFromId,
      coachNick,
      orgName: save.org.name,
      orgTag: save.org.tag,
      tier: save.tier ?? 3,
      startSplit: save.split,
    }),
  };
}

// T3.12: tick de scouting na virada de split.
//   - Subtrai o salário do scout contratado do budget
//   - Gera 1-2 relatórios novos sobre prospects da região-foco
// Pool de prospects: jovens (idade ≤24, OVR 50-84) do bo3 oppEra resolvido.
function applyScoutingSplitTick(
  save: CareerSave,
  oppEra: TeamSeason[],
  rng: Rng,
): Partial<CareerSave> {
  const patch: Partial<CareerSave> = {};
  if (!save.hiredScoutId) return patch;
  const scout = scoutById(save.hiredScoutId);
  if (!scout) {
    patch.hiredScoutId = null;
    return patch;
  }

  // Salário pago no split (subtraído do budget pelo consumer)
  // Pra simplicidade aqui só geramos relatórios; o consumer aplica salário
  // diretamente no spread (vide chamada em advanceSplit).

  // Monta pool de prospects a partir do oppEra (times reais com elenco jovem)
  const pool: ProspectCandidate[] = [];
  for (const team of oppEra) {
    for (const p of team.players) {
      pool.push({
        id: p.id,
        nick: p.nick,
        country: p.country,
        age: p.age ?? 22,
        role: p.role,
        ovr: playerOvr(p),
        region: macroRegionOf(team.country) ?? 'global',
      });
    }
  }

  const newReports = generateScoutReports(
    {
      split: save.split,
      hiredScoutId: save.hiredScoutId,
      scoutReports: save.scoutReports,
    },
    pool,
    rng,
  );
  if (newReports.length > 0) {
    patch.scoutReports = [...(save.scoutReports ?? []), ...newReports];
  }
  return patch;
}

// T3.9: tick de aging do squad próprio. Devolve patch parcial com:
//   - `evo`: somado aos deltas existentes (negativo = decline)
//   - `retired`: novos ids appended ao array
//   - `lastRetirees`: nicks/idades dos novos aposentados (pra notícia)
// Não muta o save. O `findSigning`/`effectiveAge` resolvem o player como
// fonte de verdade dos dados (idade dinâmica via split count).
function applyAgingTick(save: CareerSave, findSigning: (sig: Signing) => ResolvedSigning | null): Partial<CareerSave> {
  const players: AgingState['players'] = [];
  for (const sig of save.squad) {
    const f = findSigning(sig);
    if (!f) continue;
    const p = f.player;
    const age = effectiveAge(p, save.split, save.youthAge);
    if (age <= 0) continue;
    players.push({ id: sig.playerId, nick: p.nick, ovr: playerOvr(p), age, role: p.role });
  }
  if (players.length === 0) return {};
  const result = tickAging({ split: save.split, retired: save.retired ?? [], players });
  if (Object.keys(result.ovrDeltas).length === 0 && result.newRetirees.length === 0) return {};

  // Aplica deltas ao evo (somados — engine de evo já trata acumulado)
  const evo = { ...(save.evo ?? {}) };
  for (const [id, d] of Object.entries(result.ovrDeltas)) {
    evo[id] = (evo[id] ?? 0) + d;
  }
  const retired = [...(save.retired ?? []), ...result.newRetirees.map((r) => r.id)];
  const lastRetirees = result.newRetirees.map((r) => ({ nick: r.nick, age: r.age }));

  return { evo, retired, lastRetirees };
}

// T3.14: monta snapshot pra avaliar conquistas baseadas no save.
// Chamado após a mutação principal (no save NOVO, pós-update).
function buildAchievementSnapshot(save: CareerSave, starterIds: string[]): SaveSnapshot {
  const avgChem = starterIds.length >= 2
    ? averageStarterChemistry({ pairChem: save.pairChem }, starterIds)
    : 0;
  // Sponsor global = qualquer sponsor ativo cujo perSplit é >= 600k (tier global)
  const hasGlobalSponsor = (save.sponsors ?? []).some((id) => {
    const def = sponsorById(id);
    return def != null && def.perSplit >= 600_000;
  });
  // POY proxy: histórico tem algum MVP atribuído. Refinamento futuro: checar
  // se o `playerNick` do MVP bate com algum jogador que JÁ ESTEVE no squad
  // (precisa de squadHistory que ainda não temos).
  const poyEver = (save.yearAwardsHistory ?? []).some((y) =>
    y.winners?.some((w) => w.kind === 'mvp'),
  );
  return {
    split: save.split,
    budget: save.budget,
    tier: save.tier ?? 3,
    board: save.board ?? 60,
    sponsors: save.sponsors ?? [],
    avgChemistryStarters: avgChem,
    resolvedTeamEventsCount: (save.resolvedTeamEvents ?? []).length,
    distinctPlayersTalkedCount: Object.keys(save.lastTalkAt ?? {}).length,
    yearAwardsHistoryCount: (save.yearAwardsHistory ?? []).length,
    poyInOwnSquadEver: poyEver,
    hasGlobalSponsor,
    splitsAlive: save.fired ? 0 : save.split,
  };
}

// T3.6: tick de team events na virada de split. Tenta gerar evento contextual
// se o save não tem evento pendente. Não muta o save. Devolve patch parcial.
function applyTeamEventSplitTick(save: CareerSave, newSplit: number, rng: Rng): Partial<CareerSave> {
  // Se já tem evento pendente de split anterior, é fail-safe — limpa
  // (UI deveria ter forçado a escolha, mas se F5 travou o estado, libera).
  const stillPending = save.pendingTeamEvent && save.pendingTeamEvent.splitWhen >= newSplit
    ? save.pendingTeamEvent
    : null;
  if (stillPending) return { pendingTeamEvent: stillPending };

  const state: TeamEventState = {
    split: newSplit,
    tier: save.tier ?? 3,
    pendingTeamEvent: null,
    resolvedTeamEvents: save.resolvedTeamEvents ?? [],
  };
  const ev = tryGenerateTeamEvent(state, rng);
  return { pendingTeamEvent: ev };
}

// T3.5: tick de sponsors na virada de split. Limpa contratos expirados +
// gera oferta nova com chance modulada. Devolve patch parcial pra mergear
// no `next` save. PURO — não mexe no `save`.
function applySponsorSplitTick(save: CareerSave, newSplit: number, rng: Rng): Partial<CareerSave> {
  // copia o estado dos sponsors pra não mutar o save
  const state: SponsorState = {
    sponsors: [...save.sponsors],
    sponsorUntil: { ...save.sponsorUntil },
    pendingSponsorOffer: save.pendingSponsorOffer ?? null,
    sponsorCooldown: { ...(save.sponsorCooldown ?? {}) },
  };
  // 1) expira oferta pendente se já está estampada num split anterior
  if (state.pendingSponsorOffer && state.pendingSponsorOffer.splitOffered < newSplit) {
    state.pendingSponsorOffer = null;
  }
  // 2) limpa expirados (contrato terminou)
  cleanupExpiredSponsors(state, newSplit);
  // 3) tenta gerar nova oferta
  const offer = trySponsorOffer(state, { split: newSplit, vrs: save.vrs ?? 0, clubeTier: save.tier ?? 3 }, rng);
  if (offer) state.pendingSponsorOffer = offer;
  return {
    sponsors: state.sponsors,
    sponsorUntil: state.sponsorUntil,
    pendingSponsorOffer: state.pendingSponsorOffer,
    sponsorCooldown: state.sponsorCooldown,
  };
}
export function formatFans(n: number): string {
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
const TIER_NAMES: Record<number, string> = { 1: ct('Tier 1 · Elite'), 2: 'Tier 2 · Challenger', 3: ct('Tier 3 · Acesso') };
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
  { id: 'org_cloud9', name: 'Cloud9', tag: 'C9', colors: ['#0a1a2f', '#00aeef'], logoUrl: PHOTON('/commons/images/b/bb/Cloud9_2023_allmode.png'), blurb: ct('Gigante norte-americana fora do CS2. Marca enorme e caixa cheio pra reconstruir do zero.'), budget: 4_200_000 },
  { id: 'org_eg', name: 'Evil Geniuses', tag: 'EG', colors: ['#101014', '#5b2be0'], logoUrl: PHOTON('/commons/images/1/14/Evil_Geniuses_2023_lightmode.png'), blurb: ct('Org lendária sem elenco ativo. Verba boa pra recolocar o nome no topo.'), budget: 3_600_000 },
  { id: 'org_dignitas', name: 'Dignitas', tag: 'DIG', colors: ['#0b0b0b', '#e7b53b'], logoUrl: PHOTON('/commons/images/5/56/Dignitas_2021_allmode.png'), blurb: ct('Tradicional, sem line desde 2022. Orçamento mediano: monte com inteligência.'), budget: 2_900_000 },
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
const PROSPECT_NICK_SUFFIX = ['', '', 'zy', 'ko', 'ix', 'er', '1x', 'zin', 'oo', 'qt', 'on', 'sk', 'y0'];
function prospectIdentity(seed: string, region: MacroRegion): { nick: string; name: string; country: string } {
  const h = hashStr(seed);
  const names = PROSPECT_NAMES[region] ?? PROSPECT_NAMES.europe;
  const ccs = REGION_CC[region] ?? REGION_CC.europe;
  // IMPORTANTE: usar shift SEM sinal (>>>). hashStr retorna 0..2^32-1, e `h >> k`
  // (com sinal) vira NEGATIVO p/ h >= 2^31, gerando índice negativo => undefined.
  const base = PROSPECT_NICKS[(h >>> 4) % PROSPECT_NICKS.length];
  const suffix = PROSPECT_NICK_SUFFIX[(h >>> 11) % PROSPECT_NICK_SUFFIX.length];
  return {
    nick: base + suffix,
    name: names[(h >>> 7) % names.length],
    country: ccs[h % ccs.length],
  };
}

// ----- ACADEMIA: prospectos que você forma e promove quando quiser -----
export const ACADEMY_MAX = 6;       // teto de prospectos na academia
export const ACADEMY_SCOUT_COST = 250_000; // custo de revelar um prospecto
export interface AcademyEntry {
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
export function makeProspect(seed: string, region: MacroRegion, split: number): AcademyEntry {
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

// prospecto com PAÍS e FUNÇÃO forçados — base do time academy, pra que os
// jovens sejam condizentes com a nacionalidade do time (e cubram as 5 funções).
function makeAcademyTeamPlayer(seed: string, country: string, role: Role, split: number): AcademyEntry {
  const region = macroRegionOf(country) ?? 'europe';
  const p = makeProspect(seed, region, split);
  return {
    ...p,
    id: `acateam__${seed.replace(/[^a-z0-9]/gi, '')}`,
    country,
    role,
    awp: role === 'AWP' ? Math.max(p.awp, p.aim - 2) : Math.min(p.awp, p.aim - 6),
    igl: role === 'IGL' ? Math.max(p.igl, p.aim - 2) : Math.min(p.igl, p.aim - 5),
  };
}

// monta o time academy do usuário: 5 jovens (um por função), todos com a
// nacionalidade da org. Determinístico por org+split.
export function buildUserAcademyTeam(orgCountry: string, orgTag: string, split: number): AcademyEntry[] {
  return FILL_ROLES.map((role, i) =>
    makeAcademyTeamPlayer(`acateam:${orgTag}:${role}:${i}:${split}`, orgCountry, role, split));
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
  atual: ct('🌍 Cenário atual (2026)'), br: ct('🇧🇷 Brasil'), pt: '🇵🇹 Portugal',
};
const SCENARIO_CAT_ORDER: ScenarioCat[] = ['atual', 'br', 'pt'];
const CAREER_SCENARIOS: CareerScenario[] = [
  // ATUAIS
  { id: 'faze_rebuild', cat: 'atual', teamName: 'FaZe', title: ct('FaZe: a reconstrução'), board: 55,
    context: ct('A FaZe despencou pro #22 do mundo no pós-karrigan. Pegue o projeto americano em obras e devolva a org à elite mundial.'),
    goals: [{ type: 'reachTier1', text: ct('Subir ao Tier 1') }, { type: 'winCircuit', text: ct('Vencer um campeonato') }] },
  { id: 'nip_revival', cat: 'atual', teamName: 'Ninjas in Pyjamas', title: ct('NiP: o gigante adormecido'), board: 55,
    context: ct('Um dos nomes mais tradicionais da Suécia vive longe do topo. Reacenda a lenda dos ninjas.'),
    goals: [{ type: 'reachTier1', text: ct('Subir ao Tier 1') }, { type: 'top4', text: ct('Top 4 num circuito') }] },
  // BRASIL
  { id: 'furia_topo', cat: 'br', teamName: 'FURIA', title: ct('FURIA: manter o Brasil no topo'),
    context: ct('A FURIA é a bandeira do CS brasileiro no mundo. A cobrança é alta: top 4 mundial e presença no Major.'),
    goals: [{ type: 'top4', text: ct('Terminar top 4 num circuito de elite') }, { type: 'qualifyMajor', text: ct('Classificar pro Major') }] },
  { id: 'mibr_orgulho', cat: 'br', teamName: 'MIBR', title: ct('MIBR: reerguer a marca'),
    context: ct('A sigla mais histórica do Brasil quer voltar a brigar lá em cima. Construa do circuito até o Major.'),
    goals: [{ type: 'winCircuit', text: ct('Vencer um campeonato') }, { type: 'reachTier1', text: ct('Chegar ao Tier 1') }] },
  { id: 'legacy_geracao', cat: 'br', teamName: 'Legacy', title: ct('Legacy: a nova geração'),
    context: ct('arT lidera a nova safra do Brasil. Transforme a Legacy numa potência mundial de verdade.'),
    goals: [{ type: 'reachTier1', text: ct('Chegar ao Tier 1') }, { type: 'qualifyMajor', text: ct('Classificar pro Major') }] },
  { id: 'pain_tradicao', cat: 'br', teamName: 'paiN', title: ct('paiN Gaming: a tradição'),
    context: ct('A paiN carrega mais de uma década de torcida brasileira. Devolva os títulos pra casa.'),
    goals: [{ type: 'winCircuit', text: ct('Vencer um campeonato') }, { type: 'reachTier1', text: ct('Chegar ao Tier 1') }] },
  // PORTUGAL
  { id: 'saw_portugal', cat: 'pt', teamName: 'SAW', title: ct('SAW: o orgulho de Portugal'),
    context: ct('A SAW é a esperança lusa, mas começa lá embaixo no ranking. Leve Portugal, do zero, até o Major mundial.'),
    goals: [{ type: 'reachTier1', text: ct('Levar a SAW ao Tier 1') }, { type: 'winCircuit', text: ct('Vencer um campeonato') }, { type: 'qualifyMajor', text: ct('Classificar pro Major') }] },
  // MAIS ATUAIS
  { id: 'astralis_dynasty', cat: 'atual', teamName: 'Astralis', title: ct('Astralis: reviver a dinastia'),
    context: ct('A Astralis foi a maior dinastia do CS, mas hoje briga no meio do pelotão. Reconstrua o império dinamarquês.'),
    goals: [{ type: 'reachTier1', text: ct('Voltar ao Tier 1') }, { type: 'qualifyMajor', text: ct('Classificar pro Major') }] },
  { id: 'mouz_nextgen', cat: 'atual', teamName: 'MOUZ', title: ct('MOUZ: a nova geração'),
    context: ct('A MOUZ aposta numa base jovem e promissora. Lapide os talentos e brigue pelo topo mundial.'),
    goals: [{ type: 'top4', text: ct('Top 4 num circuito de elite') }, { type: 'winCircuit', text: ct('Vencer um campeonato') }] },
  { id: 'navi_revival', cat: 'atual', teamName: 'Natus Vincere', title: ct('NAVI: o renascimento'),
    context: ct('A NAVI vive de glórias passadas. Coloque a lenda da CIS de volta na elite mundial.'),
    goals: [{ type: 'reachTier1', text: ct('Chegar ao Tier 1') }, { type: 'winCircuit', text: ct('Vencer um campeonato') }] },
  { id: 'big_hope', cat: 'atual', teamName: 'BIG', title: ct('BIG: a esperança alemã'),
    context: ct('A BIG carrega o CS alemão nas costas, mas precisa voltar à elite. Reerga o projeto.'),
    goals: [{ type: 'reachTier1', text: ct('Subir ao Tier 1') }, { type: 'top4', text: ct('Top 4 num circuito') }] },
  { id: 'flyquest_na', cat: 'atual', teamName: 'FlyQuest', title: ct('FlyQuest: o sonho norte-americano'),
    context: ct('A NA quer voltar a brigar lá em cima. Construa o projeto e dispute o Major mundial.'),
    goals: [{ type: 'reachTier1', text: ct('Chegar ao Tier 1') }, { type: 'qualifyMajor', text: ct('Classificar pro Major') }] },
  // MAIS BRASIL (entram se o time existir no dataset)
  { id: 'imperial_br', cat: 'br', teamName: 'Imperial', title: ct('Imperial: a última dança'),
    context: ct('O projeto brasileiro de veteranos quer um último grande Major. Honre a camisa verde-amarela.'),
    goals: [{ type: 'winCircuit', text: ct('Vencer um campeonato') }, { type: 'qualifyMajor', text: ct('Classificar pro Major') }] },
  { id: 'oddik_br', cat: 'br', teamName: 'ODDIK', title: ct('ODDIK: do acesso à elite'),
    context: ct('Saída da base do CS brasileiro, a ODDIK quer provar que o acesso vira elite. Suba os tiers.'),
    goals: [{ type: 'reachTier1', text: ct('Chegar ao Tier 1') }, { type: 'winCircuit', text: ct('Vencer um campeonato') }] },
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
export interface SplitRecord {
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
export interface Playoff {
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
  eventInSplit?: number; // etapa atual dentro do split (1..EVENTS_PER_SPLIT)
  titles: number;
  squad: Signing[];
  coachFromId: string | null;
  league: League | null;
  circuit: CircuitChoice | null;
  inviteAccepted?: boolean; // jogou um circuito acima do tier por convite neste split (boost dos jovens)
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
  majorHistory?: Tournament['history']; // partidas do usuario acumuladas entre os stages do Major
  majorResult?: MajorResult | null; // resultado do Major persistido: reidrata a tela de resultado no F5 (evita re-simular a final)
  evo: Record<string, number>; // delta acumulado de evolução por jogador (id)
  lastEvo: { nick: string; delta: number; phase: PlayerPhase }[]; // última janela
  sponsorUntil: Record<string, number>; // patrocinador id -> split até onde o contrato vale
  // T3.5: oferta dinâmica gerada pelo engine na virada de split. Quando != null,
  // a UI dispara confirmDialog pra user aceitar/recusar. Expira na próxima virada.
  pendingSponsorOffer?: SponsorOffer | null;
  // T3.5: sponsor.id → split a partir do qual pode tentar oferecer de novo
  sponsorCooldown?: Record<string, number>;
  // T3.6: evento de time pendente (briga, scandal, oferta de bootcamp...).
  // Aparece via <TeamEventModal>. Resolvido aplica deltas em budget/board/morale.
  pendingTeamEvent?: PendingTeamEvent | null;
  // T3.6: histórico de eventos resolvidos (evita repetir o mesmo)
  resolvedTeamEvents?: string[];
  // T3.10: awards do ano que acaba (a cada 4 splits). Quando != null, modal
  // cinematográfico abre. Após user fechar, vai pro yearAwardsHistory.
  pendingYearAwards?: YearAwards | null;
  // T3.10: histórico de awards por ano (consultado pra evitar redetect)
  yearAwardsHistory?: YearAwards[];
  // T3.7: último split em que houve conversa com cada player (cooldown
  // de PlayerTalk — 1 conversa a cada 2 splits por player).
  lastTalkAt?: Record<string, number>;
  // T3.4: química entre pares (key canonical sortedA|sortedB → valor 0-100).
  // Ausência = 30 default (engine trata lazy). Sobe quando players jogam
  // juntos, decai ao fim do split. Avg dos 5 starters vira modifier 0.95-1.05.
  pairChem?: Record<string, number>;
  // T3.11: histórico de stints do coach. Cada item: período numa org com
  // wins/losses/troféus. Reputação 0-100 derivada do array inteiro.
  coachStints?: CoachStint[];
  // T3.9: ids de players já aposentados. Player aposentado pode continuar no
  // squad (user decide quando liberar/renovar) mas recebe chip "Aposentado"
  // no profile. Engine de aging NÃO força saída — sinaliza.
  retired?: string[];
  // T3.9: lista dos últimos players a se aposentar (mostrar como news no split).
  lastRetirees?: { nick: string; age: number }[];
  // T3.8: contador de scrims usadas no split atual (limite 2 por split).
  // Resetado pra 0 a cada virada de split.
  scrimsThisSplit?: number;
  // T3.12: scout contratado (1 por vez). null = sem scout. Salário pago no
  // fim de cada split como subtração do budget.
  hiredScoutId?: string | null;
  // T3.12: histórico de relatórios gerados pelo scout ativo.
  scoutReports?: ScoutReport[];
  moves: Record<string, string>; // transferências aplicadas: playerId -> teamId atual
  lastMoves: { nick: string; from: string; to: string }[]; // transferências do último split
  tier: number; // tier atual da organização (1 = elite). Começa em 3.
  tierChange?: 'up' | 'down' | null; // resultado da última temporada (promoção/rebaixamento)
  takeoverId?: string | null; // id do time real que o jogador assumiu (excluído dos adversários)
  pendingOffer?: PoachOffer | null; // proposta de uma org maior por um jogador seu
  pendingDeals?: PendingDeal[]; // acordos fechados DURANTE a temporada; entram em vigor na janela (próximo split)
  renewals?: Renewal[]; // contratos vencendo: forçam a tela de renovação na abertura da janela
  pendingSales?: { playerId: string; nick: string; fee: number; toTag: string; toId: string }[]; // propostas aceitas por jogadores SEUS: o jogador sai (e entra a grana) na janela. toId = id do clube COMPRADOR (pro applyMoves / extraOnTeam)
  rejectedOffers?: string[]; // ids de jogadores cuja proposta você recusou neste split (some até a virada)
  // jogadores VENDIDOS que NÃO existem no CS2_REAL_2026 (academy, FA, youth
  // promovido). applyMoves só move ids da base — pros customizados a gente
  // precisa de uma rota alternativa, senão somem. teamId -> jogadores apensos
  // no roster do comprador, com snapshot dos atributos no momento da venda.
  extraOnTeam?: Record<string, { player: Player; arrival: number }[]>;
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
  academyTeam?: AcademyEntry[]; // time academy (5 jovens, um por função) que disputa a Liga Academy
  academyFocus?: string | null; // id do prospecto em foco de treino (cresce mais rápido)
  // resultados de jogos da Liga Academy que o user JOGOU (override do determinístico).
  // Chave: `${split}:${oppId}` — o split garante reset natural a cada virada.
  academyPlayed?: Record<string, [number, number]>;
  academyTrophies?: number; // títulos do campeonato Academy
  academyPaidSplits?: number[]; // splits cujo prize money já foi pago (evita double-pay)
  // playoff Academy (top 4 → semis + final) do split atual. Limpa ao avançar split.
  academyPlayoff?: import('../engine/career/academyMatch').AcademyPlayoffState | null;
  youth?: Record<string, Player>; // prospectos já promovidos (resolvidos pelo findSigning)
  youthAge?: Record<string, number>; // idade-base (no split 1) de cada prospecto promovido
  scenario?: { id: string; cat: ScenarioCat; title: string; context: string; goals: { type: ScenarioGoalType; text: string; done: boolean }[] } | null; // desafio de carreira em curso
  rivalries?: Record<string, number>; // intensidade por adversario; 4+ vira classico e gera foco extra
  fatigue?: Record<string, number>; // carga acumulada 0-100 por jogador
  restingPlayers?: string[]; // ate dois jogadores em carga reduzida na proxima serie
  facilities?: Record<string, number>; // centro de treino, analista e psicologo (nivel 0-3)
}

// manchete da caixa de entrada (imprensa/diretoria) — dá vida à carreira
export type NewsCat = 'result' | 'transfer' | 'board' | 'scene' | 'social' | 'scout';
export interface NewsItem { id: string; split: number; icon: string; tone: 'good' | 'bad' | 'info'; title: string; body: string; cat?: NewsCat; handle?: string; }
export const NEWS_CATS: { key: NewsCat | 'all'; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'result', label: ct('Resultados') },
  { key: 'transfer', label: ct('Mercado') },
  { key: 'board', label: ct('Diretoria') },
  { key: 'scout', label: ct('Olheiros') },
  { key: 'scene', label: ct('Cenário') },
  { key: 'social', label: 'Social' },
];

// stats acumuladas de um jogador ao longo de TODA a carreira (somatório bruto;
// rating/ADR/KAST são derivados na hora). É só leitura pro jogador (sobe sozinho
// conforme o jogador evolui e joga); quem edita atributo é o admin no CRM.
interface CareerStatLine { k: number; d: number; a: number; dmg: number; kast: number; rounds: number; maps: number; splits: number; }

export const CONTRACT_TERM = 3; // splits de contrato ao assinar/renovar

// funções que o técnico pode atribuir a um jogador (gerenciamento estilo Brasval)
export const ROLE_OPTS: Role[] = ['AWP', 'IGL', 'Rifler', 'Entry', 'Support', 'Lurker'];

// proposta de uma org de elite (tier 1) por um jogador do seu elenco
interface PoachOffer { orgId: string; orgName: string; orgTag: string; playerId: string; nick: string; ovr: number; fee: number }

// meta da diretoria por split (FM/Brasval): cumprir sobe a confiança e dá bônus;
// falhar derruba a confiança — no fundo do poço você é demitido.
type ObjectiveType = 'major' | 'win' | 'top4' | 'promote' | 'noRelegation';
interface BoardObjective { type: ObjectiveType; text: string; bonus: number }
function objectiveFor(tier: number, split: number, majorNow: boolean): BoardObjective {
  if (tier === 1) {
    return majorNow
      ? { type: 'major', text: ct('Classificar para o Major Mundial'), bonus: 700_000 }
      : { type: 'top4', text: ct('Terminar no top 4 do circuito de elite'), bonus: 300_000 };
  }
  if (tier === 2) {
    // de vez em quando a diretoria cobra acesso direto
    return hashStr(`obj:${split}`) % 3 === 0
      ? { type: 'promote', text: ct('Subir para o Tier 1 nesta temporada'), bonus: 500_000 }
      : { type: 'top4', text: ct('Terminar no top 4 e brigar pelo acesso'), bonus: 250_000 };
  }
  return { type: 'noRelegation', text: ct('Não ser rebaixado (longe da zona)'), bonus: 150_000 };
}

const emptySave = (): CareerSave => ({
  org: null,
  budget: STARTING_BUDGET,
  vrs: 0,
  split: 1,
  eventInSplit: 1,
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
  rivalries: {},
  fatigue: {},
  restingPlayers: [],
  facilities: { ...EMPTY_FACILITIES },
});

// ----- treino de mapa: domínio por mapa, com TETO (impossível ser bom em tudo) -----
export const MAP_TRAIN_MAX = 2.6; // teto de domínio de um mapa
export const MAP_TRAIN_MIN = -1.6; // piso (mapa abandonado vira fraqueza leve, não catástrofe)
const MAP_TRAIN_GAIN = 1.3; // ganho no mapa em foco por split
const MAP_TRAIN_DECAY = 0.3; // todo mapa decai por split (o não-treinado escorrega devagar)
export const MAP_FOCUS_MAX = 3; // até 3 mapas em treino por split
// nível de domínio de um mapa (0 = neutro se nunca treinado)
export const mapLevel = (s: CareerSave, m: MapId) => s.mapTraining?.[m] ?? 0;
// lista de mapas em foco (compat: aceita formato antigo de mapa único)
export const mapFocusList = (s: CareerSave): MapId[] =>
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
export const PLAYBOOK_SWITCH_TO = 25; // entrosamento ao adotar um esquema novo

// ----- moral / satisfação do jogador -----
export const MORALE_DEFAULT = 70;
const clampMorale = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
export function moraleInfo(v: number): { label: string; cls: 'good' | 'warn' | 'bad'; icon: CareerIconName } {
  if (v >= 78) return { label: ct('Motivado'), cls: 'good', icon: 'mood-5' };
  if (v >= 55) return { label: ct('Contente'), cls: 'good', icon: 'mood-4' };
  if (v >= 38) return { label: ct('Indiferente'), cls: 'warn', icon: 'mood-3' };
  if (v >= 22) return { label: ct('Insatisfeito'), cls: 'bad', icon: 'mood-2' };
  return { label: ct('Revoltado'), cls: 'bad', icon: 'mood-1' };
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
    const prevM = prev[s.oid] ?? MORALE_DEFAULT;
    let m = prevM;
    m += (MORALE_DEFAULT - m) * 0.25; // reversão à média mais firme (não trava em baixa)
    // forma só puxa pra CIMA: fase quente motiva, mas fase fria não realimenta a
    // queda de moral (senão vira má fase eterna num time que perde sempre).
    m += Math.max(0, (s.form ?? 1) - 1) * 55;
    if (ctx.champion) m += 12; else if (ctx.objMet) m += 4; else m -= 7;
    if (s.expiring) m -= 6;
    m += personalityMoraleDelta(s.oid, { champion: ctx.champion, objectiveMet: ctx.objMet, expiring: s.expiring });
    // piso de recuperação: a moral cai no máximo 12 por split, então ninguém fica
    // preso em má fase por muitas temporadas seguidas (sobe de volta em 1-2 splits).
    out[s.oid] = clampMorale(Math.max(m, prevM - 12));
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
  boardConfidence?: number;
}): NewsItem[] {
  const s = ctx.split;
  const out: NewsItem[] = [];
  const add = (key: string, icon: string, tone: NewsItem['tone'], cat: NewsCat, title: string, body: string) =>
    out.push({ id: `${s}:${key}`, split: s, icon, tone, cat, title, body });

  if (ctx.major) {
    if (ctx.major.champion) add('major', '🏆', 'good', 'result', `${ctx.org} ${ct('é CAMPEÃO MUNDIAL!')}`, `${ct('A')} ${ctx.org} ${ct('levantou o troféu do Major. O nome entrou para a história do CS.')}`);
    else add('major', '🌍', 'info', 'result', `${ctx.org} ${ct('no Major:')} ${ctx.major.placement}º`, `${ct('A campanha mundial terminou em')} ${ctx.major.placement}º. Aprendizado pra voltar mais forte.`);
  } else if (ctx.champion) {
    add('title', '🏆', 'good', 'result', `${ctx.org} ${ct('campeã do')} ${ctx.circuit}`, `${ct('Título conquistado! A torcida foi à loucura e a diretoria respira aliviada.')}`);
  }
  if (ctx.tierChange === 'up') add('tier', '⬆️', 'good', 'result', `${ctx.org} promovida ao ${ctx.tierName}`, `${ct('Subir de divisão coloca a org mais perto do Major. Patrocinadores de olho.')}`);
  else if (ctx.tierChange === 'down') add('tier', '⬇️', 'bad', 'result', `${ctx.org} rebaixada ao ${ctx.tierName}`, `${ct('Temporada para esquecer: a queda de divisão pressiona o elenco e o caixa.')}`);
  if (ctx.objText) add('board', ctx.objMet ? '🏛️' : '⚠️', ctx.objMet ? 'good' : 'bad', 'board',
    ctx.objMet ? ct('Diretoria satisfeita') : ct('Diretoria cobra resultados'),
    `${ctx.objMet ? ct('Objetivo cumprido') : ct('Objetivo não cumprido')}: "${ctx.objText}". ${ctx.objMet ? ct('A confiança subiu.') : ct('A confiança caiu — atenção redobrada no próximo split.')}`);
  if (ctx.offer) add('offer', '📞', 'info', 'transfer', `${ctx.offer.orgName} sonda ${ctx.offer.nick}`, `Proposta de ${formatMoney(ctx.offer.fee)} pelo seu ${ctx.offer.nick} (OVR ${ctx.offer.ovr}${ct('). Decida na janela de transferências.')}`);
  if (ctx.releases.length) add('release', '📄', 'bad', 'transfer', `${ct('Contrato vencido:')} ${ctx.releases.join(', ')}`, `${ctx.releases.length === 1 ? ct('O jogador saiu') : ct('Os jogadores saíram')} ${ct('de graça por fim de contrato. Reforce o elenco no mercado.')}`);
  if (ctx.risers.length) add('rise', '📈', 'good', 'board', `${ct('Em ascensão:')} ${ctx.risers.join(', ')}`, `${ct('A comissão técnica destaca a evolução de')} ${ctx.risers.join(', ')} ${ct('no último split.')}`);
  if (ctx.sliders.length) add('slide', '📉', 'info', 'board', `${ct('Em queda:')} ${ctx.sliders.join(', ')}`, `${ctx.sliders.join(', ')} ${ctx.sliders.length === 1 ? 'perdeu' : ct('perderam')} ${ct('rendimento. Veteranos cobram mais minutos de treino.')}`);
  if (ctx.unhappy.length) add('mood', '😟', 'bad', 'board', `${ct('Vestiário:')} ${ctx.unhappy.join(', ')} insatisfeito${ctx.unhappy.length > 1 ? 's' : ''}`, `${ct('Moral baixa no elenco. Vitórias, renovação de contrato e títulos levantam o astral.')}`);
  if ((ctx.boardConfidence ?? 100) <= 25) add('ultimatum', '🚨', 'bad', 'board', ct('Ultimato da diretoria'), ct('A confiança chegou ao limite. O próximo campeonato precisa mostrar evolução ou o cargo estará em risco.'));
  else if ((ctx.boardConfidence ?? 100) <= 42) add('pressure', '📰', 'bad', 'board', ct('Pressão aumenta nos bastidores'), ct('Diretoria e torcida cobram uma resposta imediata depois dos resultados recentes.'));
  if (!ctx.champion && !ctx.objMet) add('fans', '📣', 'bad', 'scene', ct('Torcida pede reação'), ct('As arquibancadas perderam a paciência. O próximo split começa com cobrança por desempenho e atitude.'));
  else if (ctx.champion) add('fans', '📣', 'good', 'scene', ct('Festa com a torcida'), ct('O título levou a torcida às ruas e aumentou a expectativa pelo próximo campeonato.'));
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
    add('star', '@cs_headlines', 'info', `${pick.p.nick} ${ct('dominando o cenário')}`,
      `${pick.p.nick} (${pick.t.team}${ct(') está em outro nível nesse split. Provavelmente o melhor do mundo agora. 🔥')}`);
  }
  // meme reagindo ao seu time
  add('meme', '@clutchozao', champion ? 'good' : 'info',
    champion ? `${org} ${ct('CAMPEÃO e a TL surtou')}` : `e a ${org}...?`,
    champion ? `${org} ${ct('levantou a taça e o povo foi à loucura. MERECIDO. 🐐🏆')}` : `mais um split da ${org} ${ct('sem troféu. calma que ano que vem é nosso 😅🙏')}`);
  // time em alta no cenário
  if (teams.length) {
    const hot = teams[hashStr(`hot:${split}`) % teams.length];
    add('hot', '@vrs_radar', 'info', `Fica de olho na ${hot.team}`,
      `${ct('A')} ${hot.team} ${ct('vem subindo no ranking e promete brigar lá em cima. Time pra acompanhar. 📈')}`);
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
      title: `${s.champ.team} ${ct('campeão na')} ${CAREER_REGION_LABELS[s.reg]}`,
      body: `${s.champ.team} ${ct('venceu o')} ${s.league}${s.runnerUp ? ` sobre ${s.runnerUp.team}` : ''}. A cena segue fervendo enquanto você disputa a sua região.`,
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
function baseAge(p: Pick<Player, 'id' | 'nick' | 'age'>, youthAge?: Record<string, number>): number {
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
// jogador gerado pela base da IA (regen): o id carrega o split de estreia e a
// idade de estreia, pra idade/evolução baterem com o relógio próprio dele.
function regenInfo(id: string): { debut: number; a0: number } | null {
  const parsed = parseRegenPlayerId(id);
  return parsed ? { debut: parsed.debut, a0: parsed.ageAtDebut } : null;
}
export function effectiveAge(p: Pick<Player, 'id' | 'nick'>, split: number, youthAge?: Record<string, number>): number {
  const rg = regenInfo(p.id);
  if (rg) return rg.a0 + Math.floor(Math.max(0, split - rg.debut) / 3);
  return baseAge(p, youthAge) + Math.floor((split - 1) / 3);
}
// potencial = teto de OVR. Jovem bom tem espaço pra crescer (S/A); veterano já
// está no teto (sem crescimento). Determinístico por jogador.
export function playerPotentialOvr(p: Player, age: number): number {
  const base = playerOvr(p);
  const room = age <= 18 ? 9 : age <= 20 ? 7 : age <= 22 ? 4 : age <= 24 ? 2 : age <= 26 ? 1 : 0;
  const talent = room > 0 ? hashStr(`pot:${p.id}`) % 4 : 0; // 0-3 de variação de talento
  return Math.min(99, base + room + talent);
}
export type PotTier = 'S' | 'A' | 'B' | 'C';
export function potentialTier(potOvr: number): PotTier {
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

// idade em que um jogador da IA se aposenta (determinístico, mesmo eixo de
// longevidade do evoDelta): a maioria sai por volta de 35-38.
function aiRetireAge(pid: string): number {
  return 35 + Math.floor((hashStr(`long:${pid}`) % 100) / 25); // 35..38
}

// drift de OVR entre o split de estreia e o atual, pelo relógio de idade próprio
// do jogador (serve tanto pro titular original quanto pro jovem da base).
function driftFrom(pid: string, baseOvr: number, a0: number, debut: number, split: number, potCap?: number): number {
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

// drift de envelhecimento que reproduz o OVR de MERCADO ao contratar (do BASE até o
// split atual). Regen usa o relógio próprio (estreia gravada no id) com o MESMO teto
// do aiSlotPlayer; os demais usam o MESMO driftFrom que aiSlotPlayer aplica pra IA
// (debut=1, sem teto extra). Assim o contratado entra no MESMO OVR que aparecia no
// mercado — antes aiAttrDrift clampava ±10 e driftFrom ±12, causando "contrata 86
// chega 84" pra jogadores no extremo da escala.
function signingDrift(player: Player, split: number): number {
  const r = parseRegenPlayerId(player.id);
  if (r) {
    const orig = CS2_REAL_2026.find((t) => t.id === r.teamId)?.players[r.slot];
    return driftFrom(player.id, playerOvr(player), r.ageAtDebut, r.debut, split, orig ? playerOvr(orig) + 2 : undefined);
  }
  return driftFrom(player.id, playerOvr(player), baseAge(player), 1, split);
}

// jovem da base que assume a vaga de um titular aposentado. OVR de estreia abaixo
// do nível do time (cru, com espaço pra crescer). Determinístico por time/vaga/geração.
function regenYouth(team: TeamSeason, slot: number, gen: number, debut: number, a0: number, orig: Player): Player {
  const seed = `regen:${team.id}:${slot}:${gen}`;
  const region = macroRegionOf(team.country) ?? 'europe';
  const ident = prospectIdentity(seed, region);
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
function aiSlotPlayer(orig: Player, team: TeamSeason, slot: number, split: number, skip: Set<string>): Player {
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

function applyAiAging(teams: TeamSeason[], split: number, skip: Set<string>): TeamSeason[] {
  if (split <= 1) return teams;
  return teams.map((t) => ({ ...t, players: t.players.map((p, i) => (skip.has(p.id) ? p : aiSlotPlayer(p, t, i, split, skip))) }));
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
function poFindMatch(p: Playoff, ids?: [string, string]): PlayoffMatch | null {
  if (!ids) return poUserMatch(p);
  return poMatches(p).find((m) => m.a === ids[0] && m.b === ids[1]) ?? null;
}
function poProgressKey(p: Playoff): string {
  const mKey = (m: PlayoffMatch | null | undefined) =>
    m ? `${m.a}:${m.b}:${m.result ? `${m.result.winner}/${m.result.mapScore.join('-')}` : '_'}` : '_';
  return [
    ...(p.qf ?? []).map(mKey),
    ...p.sf.map(mKey),
    mKey(p.final),
    p.champion ?? '_',
    p.runnerUp ?? '_',
  ].join('|');
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
// LEGADO: dominância sustentada (Majors vencidos + títulos tier-1) deixa uma marca
// que NÃO decai. O VRS rolante sozinho tinha teto ~2.5x o ganho de 1 split, então
// um campeão em série estacionava abaixo do #1. Com o legado, quem vence DE
// VERDADE e SEGUIDO sobe acima do field (1 título sozinho ainda rende pouco).
function userLegacyVrs(save: CareerSave): number {
  const h = aggregateHistory(save.history);
  return (h.majorTitles ?? 0) * 130 + h.circuitTitles * 28;
}
// VRS COMPLETO do usuário (base do elenco + rolante + legado) — o mesmo número do
// ranking. Versão self-contained pra telas que não têm o buildTeam no closure.
function userVrsTotal(save: CareerSave, findSigning: (s: Signing) => ResolvedSigning | null, coaches: TeamSeason[]): number {
  const picks = save.squad.map(findSigning).filter(Boolean) as { player: Player; from: TeamSeason }[];
  let teamwork = 78;
  if (save.org && picks.length >= 5 && save.coachFromId) {
    const coach = coaches.find((t) => t.id === save.coachFromId)?.coach ?? ROOKIE_COACH;
    teamwork = buildUserTeam(save.org.name, picks.slice(0, 5), coach).teamwork;
  }
  return userBaseVrsFor(teamwork) + (save.vrs ?? 0) + userLegacyVrs(save);
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
export interface RegionScene { reg: CareerRegion; league: string; champ: TeamSeason; runnerUp: TeamSeason | null; top: TeamSeason[]; }
export function worldScene(teams: TeamSeason[], split: number): RegionScene[] {
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
export function scoutOppPlayerStats(
  p: { id: string; sourcePlayerId?: string; nick: string; name: string; country: string; role: Role; role2?: Role; aim: number; clutch: number; consistency: number; awp: number; igl: number },
  split: number,
  seasonStats: { id: string; nick: string; rating: number; adr: number }[],
): { rating: number; adr: number } {
  const st = seasonStats.find((s) => s.id === p.id || s.id === p.sourcePlayerId || s.nick === p.nick);
  if (st && st.rating > 0) return { rating: st.rating, adr: st.adr };
  const pl: Player = {
    id: p.sourcePlayerId ?? p.id,
    nick: p.nick,
    name: p.name,
    country: p.country,
    role: p.role,
    role2: p.role2,
    aim: p.aim,
    clutch: p.clutch,
    consistency: p.consistency,
    awp: p.awp,
    igl: p.igl,
  };
  const sl = hltvStatline(pl, p.role, split);
  return { rating: sl.rating, adr: sl.adr };
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
interface Top20Entry { p: Player; team: TeamSeason; role: Role; rating: number; mvps: number; sl: HltvStat; points: number; titles: string[]; }
// um jogador não pode aparecer 2x no Top 20 (estava contratado + ainda listado no
// clube antigo, ou duplicado na era). Mantém a MELHOR entrada (mais pontos) por nick.
function dedupeTop20ByNick(list: Top20Entry[]): Top20Entry[] {
  const best = new Map<string, Top20Entry>();
  for (const e of list) {
    const k = e.p.nick.toLowerCase();
    const cur = best.get(k);
    if (!cur || e.points > cur.points) best.set(k, e);
  }
  return [...best.values()];
}
// TÍTULOS do ano por jogador (por nick): a cada split, o time com o melhor
// desempenho coletivo leva o evento-bandeira (Major no split de Major, senão o
// Tier 1). A forma varia por split, então o título roda entre os tops do ano.
function seasonTitlesByPlayer(pool: TeamSeason[], endSplit: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of seasonSplitRange(endSplit)) {
    let bestTeam: TeamSeason | null = null;
    let bestScore = -1;
    for (const t of pool) {
      const score = t.players.reduce((a, p) => a + hltvPointsAt(p, t, p.role as Role, s), 0);
      if (score > bestScore) { bestScore = score; bestTeam = t; }
    }
    if (!bestTeam) continue;
    const ev = isMajorSplit(s) ? MAJOR_NAME(s) : t1EventName(s);
    for (const p of bestTeam.players) {
      const k = p.nick.toLowerCase();
      const arr = out.get(k) ?? [];
      arr.push(ev);
      out.set(k, arr);
    }
  }
  return out;
}
// melhores N jogadores da TEMPORADA inteira: currículo composto (média dos pontos
// por split do ano + bônus por MVP), não só a média de rating.
function seasonTopPlayersYear(pool: TeamSeason[], endSplit: number, n: number): Top20Entry[] {
  const splits = seasonSplitRange(endSplit);
  const mvps = seasonMvpCounts(pool, endSplit);
  const titlesMap = seasonTitlesByPlayer(pool, endSplit);
  const all = pool.flatMap((t) => t.players.map((p): Top20Entry => {
    const m = mvps.get(p.id) ?? 0;
    const yearAvg = splits.reduce((a, s) => a + hltvPointsAt(p, t, p.role as Role, s), 0) / splits.length;
    return { p, team: t, role: p.role as Role, rating: playerYearRating(p, endSplit), mvps: m, sl: hltvStatline(p, p.role as Role, endSplit), points: yearAvg + m * 85, titles: titlesMap.get(p.nick.toLowerCase()) ?? [] };
  }));
  return dedupeTop20ByNick(all)
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

// Hidratador do save: merge com defaults + cura de dados antigos. Recebe o save
// já PARSEADO e MIGRADO pelo gameStore (saveMigrations). Antes esta lógica vivia
// dentro de `hydrate(raw: string)` aqui, mas a parte de localStorage / JSON parse
// / migrations / backup / cloud foi centralizada em src/state/gameStore.ts (T1.1).
// Continua aqui porque depende de `emptySave()`/`stripEraDeep`/`healProspect`/
// `healYouthPlayer` que são internos do CareerScreen — vão pra src/state/
// careerDefaults.ts em T1.4 quando quebrar este monolito.
const hydrateCareerSave: Hydrator<CareerSave> = (parsed: VersionedSave): CareerSave => {
  const s = parsed as unknown as CareerSave;
  const merged = { ...emptySave(), ...s, ...hydrateCareerDepth(parsed as unknown as Record<string, unknown>) };
  stripEraDeep(merged.league);
  stripEraDeep(merged.playoff);
  stripEraDeep(merged.majorT);
  stripEraDeep(merged.majorSeed2);
  stripEraDeep(merged.majorHistory);
  merged.academy = (merged.academy ?? []).map(healProspect);
  if (merged.youth) {
    const y: Record<string, Player> = {};
    for (const [k, v] of Object.entries(merged.youth)) y[k] = healYouthPlayer(v);
    merged.youth = y;
  }
  return merged;
};

// Carrega o save do slot ativo via gameStore. O store cuida de:
//   - localStorage.getItem do slotKey ativo
//   - JSON.parse + migrations (saveMigrations.migrateSave) + hidratação custom
//   - fallback pro .bak quando o save principal está ilegível
//   - preserva o cru em .corrupt pra diagnóstico
//   - re-persiste no formato novo quando uma migration rodou
// Devolve emptySave() quando não há save no slot (mantém o contrato externo).
function loadSave(): CareerSave {
  // double-cast: CareerSave é interface fechada, Hydrator espera retornar
  // VersionedSave-compatible (com index signature). Em runtime são o mesmo objeto.
  const fromStore = useGame.getState().loadFromSlot(getActiveSlot(), hydrateCareerSave as unknown as Hydrator);
  return (fromStore as unknown as CareerSave | null) ?? emptySave();
}

// RESET de verdade: apaga TODO rastro do save do slot ativo (principal, backup
// de um passo e cópia de diagnóstico) e marca a nuvem como vazia (tombstone).
// Sem isso, "Recomeçar" deixava o save antigo no .bak/nuvem e ele voltava depois.
function wipeActiveSlot(): void {
  useGame.getState().wipeActiveSlot();
}

// Persiste o save no localStorage do slot ativo + espelha na nuvem (debounced)
// + mantém backup .bak. Toda a logística vive no gameStore agora.
function persist(s: CareerSave): void {
  // double-cast: idem loadSave — CareerSave não declara index signature.
  useGame.getState().setSave(s as unknown as VersionedSave);
}

// preço do técnico: curva acelerada (não linear). Iniciante é barato, mas técnico
// de elite custa MILHÕES — contratar um top tem que doer no caixa.
// rating 66 ~80k · 72 ~380k · 80 ~1.4M · 85 ~2.6M · 88 ~3.5M
const coachFee = (c: Coach): number => Math.round(60_000 + Math.pow(Math.max(0, c.rating - 62), 2.5) * 1000);

// opção de entrada: técnico iniciante barato para clubes recém-fundados
const ROOKIE_COACH: Coach = { nick: 'rook1e', name: ct('Técnico Iniciante'), country: 'br', rating: 66, style: 'tactical' };
const ROOKIE_ID = '__rookie__';

type Stage = 'found' | 'market' | 'circuit' | 'hub' | 'veto' | 'match' | 'playoffHub' | 'seasonEnd' | 'majorHub' | 'major';
type HubTab = 'overview' | 'major' | 'market' | 'finance' | 'results' | 'standings' | 'bracket' | 'squad' | 'academy' | 'vrs' | 'top20' | 'history' | 'inbox' | 'world' | 'calendar';

// time sintético ct('Academia') usado como origem de um prospecto promovido ao elenco
const ACADEMY_FROM: TeamSeason = {
  id: '__youth__', team: ct('Academia'), tag: 'ACA', era: 'Base', game: 'CS2',
  country: 'br', teamwork: 70, honors: '', colors: ['#2a2f45', '#5ba0d0'],
  mapPrefs: {}, coach: ROOKIE_COACH, players: [],
};

// ----- FREE AGENTS: profissionais reais e conhecidos atualmente sem time, à
// disposição no mercado por um preço camarada (não estão em nenhum elenco) -----
// Free Agents: derivado do "time virtual" id='__free__' em bo3-2026.json
// (50 jogadores importados da planilha + qualquer adição manual via CRM).
// Antes era um array hardcoded de 20 entradas; agora a fonte é o JSON.
const FREE_AGENT_PLAYERS: Player[] =
  CS2_REAL_2026.find((t) => t.id === '__free__')?.players ?? [];
// pseudo-time ct('sem time') usado como origem de um free agent contratado
const FREE_AGENTS_FROM: TeamSeason = {
  id: '__free__', team: 'Free Agent', tag: 'FA', era: ct('sem time'), game: 'CS2',
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

const HALL_PLACEMENT: Record<PlacementCode, string> = {
  champion: '1', runnerup: '2', semi: '3-4', quarters: '5-8', playoffs: '9-16', swiss: '17-32',
};

interface Props {
  dataset: TeamSeason[];
  onExit: () => void;
  founder?: boolean; // conta Fundador: pode subir logo própria ao fundar a org
}

export function CareerScreen(props: Props) {
  return (
    <CareerConfirmProvider>
      <CareerScreenInner {...props} />
    </CareerConfirmProvider>
  );
}

function CareerScreenInner({ onExit, founder = false, dataset }: Props) {
  const { lang } = useLang();
  setCareerLang(lang); // idioma a nivel de modulo: ct() funciona em todos os subcomponentes
  // T1.1 5b: save vive no gameStore. Componente lê via useGame (subscribe a
  // mudanças) e expõe `setSave` com a MESMA assinatura do useState antigo
  // (React.Dispatch<SetStateAction<CareerSave>>) — aceita CareerSave OU
  // callback `(prev) => CareerSave`. Callback lê o valor ATUAL via
  // `useGame.getState()` pra evitar stale closure entre renders.
  const storeSave = useGame((s) => s.save) as CareerSave | null;
  const save = storeSave ?? (loadSave() as CareerSave);
  const setSave: Dispatch<SetStateAction<CareerSave>> = useCallback((next) => {
    const cur = (useGame.getState().save ?? loadSave()) as CareerSave;
    const value = typeof next === 'function'
      ? (next as (s: CareerSave) => CareerSave)(cur)
      : next;
    useGame.getState().setSave(value as unknown as VersionedSave);
  }, []);
  // ativação (upsell) de conta grátis: marcos da carreira abrem o card (que decide se mostra).
  const upsellSplitRef = useRef(0);
  const upsellTitleRef = useRef<number | null>(null);
  // T11.5: guarda pra evitar reabrir FiredModal a cada re-render
  const firedShownRef = useRef(false);
  const upsellTierRef = useRef<number | null>(null);
  useEffect(() => {
    // mais momentos de ativação ao longo da carreira (o card respeita cooldown de 45min)
    if ([2, 3, 5, 8, 12, 16].includes(save.split) && upsellSplitRef.current !== save.split) {
      upsellSplitRef.current = save.split;
      window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: save.split >= 5 ? 'milestone' : 'save-risk' } }));
    }
  }, [save.split]);
  useEffect(() => {
    // promoção de divisão (tier menor = melhor) é um momento de orgulho → ativação
    if (upsellTierRef.current === null) { upsellTierRef.current = save.tier; return; }
    if (save.tier < upsellTierRef.current) {
      upsellTierRef.current = save.tier;
      window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: 'promotion' } }));
    } else { upsellTierRef.current = save.tier; }
  }, [save.tier]);
  useEffect(() => {
    if (upsellTitleRef.current === null) { upsellTitleRef.current = save.titles; return; }
    if (save.titles > upsellTitleRef.current) {
      upsellTitleRef.current = save.titles;
      window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: 'major' } }));
    }
  }, [save.titles]);
  // momento histórico: PRIMEIRA vez classificando pro Major (save.majorT vira !null).
  // Persistente entre sessões (ref por save), só dispara uma vez na carreira.
  const upsellMajorStageRef = useRef(false);
  useEffect(() => {
    if (!save.majorT || upsellMajorStageRef.current) return;
    upsellMajorStageRef.current = true;
    window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: 'major-stage' } }));
  }, [save.majorT]);
  // refs auxiliares dos novos triggers (declaradas aqui pra ficarem visíveis em
  // outros useEffect deste componente; o de #1 do VRS roda quando vrsAll estiver
  // em escopo lá embaixo).
  const upsellWorld1Ref = useRef(false);
  const [orgChoice, setOrgChoice] = useState<'select' | 'fictional' | 'scenario'>('scenario'); // a fundação abre nos DESAFIOS (entrada principal da carreira)
  const [stage, setStage] = useState<Stage>(() => {
    const s = loadSave();
    if (!s.org) return 'found';
    // sem elenco fechado = janela de mercado/transferências
    if (s.squad.length < 5 || !s.coachFromId) return 'market';
    // elenco pronto mas sem liga = escolha do campeonato (qual convite aceitar)
    if (!s.league) return 'circuit';
    if (s.majorResult) return 'major'; // Major encerrado: reidrata a tela de resultado (F5-safe)
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
    playoffIds?: [string, string];
  } | null>(null);
  const [selSeries, setSelSeries] = useState<{ series: SeriesResult; teams: [TTeam, TTeam] } | null>(null);
  const [majorResult, setMajorResult] = useState<MajorResult | null>(() => loadSave().majorResult ?? null);
  const [careerHallStatus, setCareerHallStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
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
  const [selTeam, setSelTeam] = useState<TTeam | null>(null);
  const [showCeremony, setShowCeremony] = useState(false); // cerimônia Top 20 HLTV (fim de temporada)
  const [showOnb, setShowOnb] = useState(() => { try { return !localStorage.getItem('rtm-onboarded-v1'); } catch { return false; } });
  const dismissOnb = () => { try { localStorage.setItem('rtm-onboarded-v1', '1'); } catch { /* sem storage */ } setShowOnb(false); };
  const [promoting, setPromoting] = useState<string | null>(null); // prospecto escolhendo quem sai do elenco
  const [playerRouteId, setPlayerRouteId] = useState<string | null>(() => parseCareerPlayerId());
  const [teamRouteId, setTeamRouteId] = useState<string | null>(() => parseCareerTeamId());
  const [canNavBack, setCanNavBack] = useState(() => canCareerGoBack());
  const [t20Mode, setT20Mode] = useState<'season' | 'career'>('season'); // Top 20: temporada ou carreira
  const [newsCat, setNewsCat] = useState<NewsCat | 'all'>('all'); // filtro da Inbox
  const [vrsMode, setVrsMode] = useState<'regiao' | 'geral'>('geral'); // ranking VRS: por região ou geral
  const [quickSim, setQuickSim] = useState<{ series: SeriesResult; teams: [TTeam, TTeam]; userIdx: 0 | 1; label: string; onDone: () => void } | null>(null);
  const rngRef = useRef(makeRng(randomSeed()));
  const { askConfirm } = useCareerConfirm();
  // registro parcial do split, finalizado após o Major (se houver)
  const pendingSplit = useRef<SplitRecord | null>(null);
  // T3.5: ref pra evitar abrir o ConfirmDialog 2x pra mesma oferta (React 19
  // dispara useEffect 2x em dev). Guarda o id da oferta processada.
  const sponsorOfferShownRef = useRef<string | null>(null);
  // T11.1/T11.3/T11.4 — modais cinematográficos. State local (não estampa
  // no save) porque cada um deve aparecer UMA VEZ na sessão em que rolou.
  const [championModal, setChampionModal] = useState<ChampionCelebrationData | null>(null);
  const [eliminationModal, setEliminationModal] = useState<TournamentEliminationData | null>(null);
  // PlayerRetirement: queue (pode haver várias aposentadorias no mesmo split)
  const [retirementQueue, setRetirementQueue] = useState<PlayerRetirementData[]>([]);
  // Ref pra detectar mudança no save.lastRetirees sem disparar cíclico
  const lastRetireesHandledRef = useRef<string>('');

  // T11.3: enfileira retirees novos quando o engine de aging (T3.9) popula
  // save.lastRetirees. Usa fingerprint do array pra evitar re-trigger em
  // re-renders. Mostra 1 modal por vez (fila); user fecha → próximo abre.
  useEffect(() => {
    const list = save.lastRetirees ?? [];
    if (list.length === 0) return;
    const fingerprint = `${save.split}:${list.map((r) => `${r.nick}@${r.age}`).join('|')}`;
    if (lastRetireesHandledRef.current === fingerprint) return;
    lastRetireesHandledRef.current = fingerprint;
    const queued: PlayerRetirementData[] = list.map((r) => {
      // Busca extras do save (peakOvr, titles totais — aproximação por share da carreira)
      const oid = r.nick.toLowerCase();
      const peak = save.peakOvr?.[oid];
      return {
        nick: r.nick,
        age: r.age,
        peakOvr: peak,
        // Aproxima titulos da carreira pelos do save (manager-share) — não dá
        // pra atribuir títulos individuais sem track per-player. Mostramos só
        // os totais do MANAGER (cosmético).
        titles: save.titles,
        splitsPlayed: save.split,
      };
    });
    setRetirementQueue((q) => [...q, ...queued]);
  }, [save.lastRetirees, save.split, save.peakOvr, save.titles]);
  // T3.14: split anterior pra disparar recordSaveTick na virada
  const lastSplitTickedRef = useRef<number>(save.split);
  // T3.7: player com modal de conversa aberto. null = nenhum.
  const [talkPlayer, setTalkPlayer] = useState<{ oid: string; nick: string; age?: number } | null>(null);
  // T3.8: toast pra resultado de scrim (e outros eventos pontuais)
  const toast = useToast();

  const update = (patch: Partial<CareerSave>) => {
    setSave((s) => {
      const next = { ...s, ...patch };
      persist(next);
      return next;
    });
  };

  // T3.10: detecção de year-end awards. Roda quando split passa de múltiplo
  // de 4 (5, 9, 13...) e ainda não temos award detectado pra esse ano.
  useEffect(() => {
    // Já tem pending? Skip — modal vai mostrar.
    if (save.pendingYearAwards) return;
    // Primeiro ano ainda não acabou (precisa split >= 5).
    if (save.split < 5) return;
    // Já detectou este ano?
    const yearJustEnded = Math.floor((save.split - 1) / 4);
    if ((save.yearAwardsHistory ?? []).some((y) => y.year === yearJustEnded)) return;

    // Lookups: nick + age + joinedThisYear
    const startSplit = (yearJustEnded - 1) * 4 + 1;
    const nickById = (id: string): string | undefined => {
      // youth gerada na academia
      if (save.youth?.[id]) return save.youth[id].nick;
      // signing real → busca no dataset
      const sg = save.squad.find((x) => x.playerId === id);
      if (sg) {
        for (const ts of dataset) {
          const p = ts.players.find((pp: Player) => pp.id === sg.playerId);
          if (p) return p.nick;
        }
      }
      return undefined;
    };
    const ageById = (id: string): number | undefined => {
      const ya = save.youthAge?.[id];
      if (ya != null) return ya + Math.floor((save.split - 1) / 4); // envelhece
      // dataset
      for (const ts of dataset) {
        const p = ts.players.find((pp: Player) => pp.id === id);
        if (p) {
          const r = REAL_AGES[p.nick]?.age;
          if (r) return r;
        }
      }
      return undefined;
    };
    // joinedThisYear: não temos signedAtSplit no shape — placeholder false (breakout fica off)
    const joinedThisYear = (_id: string): boolean => false;

    const awards = detectYearAwards(
      {
        split: save.split,
        titles: save.titles,
        squad: save.squad,
        evo: save.evo,
        peakOvr: save.peakOvr,
        youth: save.youth as Record<string, { age?: number; nick?: string; ovr?: number }> | undefined,
        yearAwardsHistory: save.yearAwardsHistory,
        pendingYearAwards: save.pendingYearAwards,
        coach: save.coachFromId ? { nick: undefined } : undefined,
      },
      { nickById, ageById, joinedThisYear },
    );
    if (!awards) return;

    setSave((s) => {
      const next: CareerSave = { ...s, pendingYearAwards: awards };
      persist(next);
      return next;
    });
    void startSplit; // referenciado pra TS não reclamar de unused
  }, [save.split]);

  // T3.11: no mount, garante que existe stint ativo do coach atual.
  // Cobre o caso de save migrado pra v8 (coachStints: [] mas coachFromId já existe).
  useEffect(() => {
    const patch = ensureActiveCoachStint(save);
    if (Object.keys(patch).length > 0) update(patch);
    // intencional: só roda 1x no mount (mudanças de coach durante o jogo já são
    // tratadas onde o coachFromId é setado — no caso, é simples e raro).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // T3.14: avalia conquistas baseadas no save a cada virada de split + uma vez
  // no mount (pra estampar conquistas antigas que o save já satisfaz mas nunca
  // foram detectadas — ex.: tier1 promo num save importado).
  useEffect(() => {
    const starterIds = save.squad.map((s) => s.playerId);
    const snap = buildAchievementSnapshot(save, starterIds);
    recordSaveTick(snap);
    lastSplitTickedRef.current = save.split;
  }, [save.split, save.tier, save.budget, save.board, save.sponsors.length,
      save.resolvedTeamEvents?.length, save.lastTalkAt, save.yearAwardsHistory?.length, save.pairChem, save.squad]);

  // T3.12: contrata/troca scout. Substitui o anterior (sem multa).
  const hireScout = (scoutId: string) => {
    const def = scoutById(scoutId);
    if (!def) return;
    update({ hiredScoutId: scoutId });
    toast.success(`Contratou ${def.name}`);
  };
  const fireScout = () => {
    update({ hiredScoutId: null });
    toast.info('Scout dispensado');
  };

  // T3.8: roda 1 scrim. Valida, aplica patch (custo + chem + fadiga) + toast.
  const doScrim = () => {
    const starterIds = save.squad.map((s) => s.playerId);
    const stateArg = {
      split: save.split,
      budget: save.budget,
      scrimsThisSplit: save.scrimsThisSplit ?? 0,
      starterIds,
      pairChem: save.pairChem,
      fatigue: save.fatigue,
    };
    const check = canScrimNow(stateArg);
    if (!check.ok) {
      toast.error(check.reason ?? 'Scrim indisponível');
      return;
    }
    const result = runScrim(stateArg, rngRef.current);
    update({
      budget: save.budget + result.patch.budgetDelta,
      scrimsThisSplit: result.patch.scrimsThisSplitNext,
      pairChem: result.patch.pairChem,
      fatigue: result.patch.fatigue,
    });
    toast.success(`Scrim vs ${result.opponentName}: ${result.outcome}`);
  };

  // T3.5: prompt automático quando uma oferta de patrocínio é gerada na virada
  // de split. Mostra modal global (ConfirmDialog) com termos + 2 opções. A
  // ref `sponsorOfferShownRef` impede re-prompt da mesma oferta em re-renders.
  useEffect(() => {
    const offer = save.pendingSponsorOffer;
    if (!offer) return;
    if (sponsorOfferShownRef.current === offer.id) return;
    sponsorOfferShownRef.current = offer.id;
    const def = sponsorById(offer.sponsorId);
    if (!def) return;
    const splits = def.term;
    const totalProj = def.perSplit * splits;
    void confirmDialog({
      title: ct('Oferta de patrocínio'),
      message: `${def.name} ${ct('quer fechar contrato de')} ${splits} ${ct('splits a')} ${formatMoney(def.perSplit)}/${ct('split')} (${ct('total estimado')} ${formatMoney(totalProj)}). ${ct('Aceitar?')}`,
      confirmLabel: ct('Aceitar'),
      cancelLabel: ct('Recusar'),
    }).then((ok) => {
      // Aplica mutação no save (mantém o pattern de update()/persist)
      setSave((s) => {
        const nextState: SponsorState = {
          sponsors: [...s.sponsors],
          sponsorUntil: { ...s.sponsorUntil },
          pendingSponsorOffer: s.pendingSponsorOffer,
          sponsorCooldown: { ...(s.sponsorCooldown ?? {}) },
        };
        if (ok) acceptSponsorOffer(nextState, offer, s.split);
        else rejectSponsorOffer(nextState, offer, s.split);
        const next: CareerSave = {
          ...s,
          sponsors: nextState.sponsors,
          sponsorUntil: nextState.sponsorUntil,
          pendingSponsorOffer: nextState.pendingSponsorOffer,
          sponsorCooldown: nextState.sponsorCooldown,
        };
        persist(next);
        return next;
      });
    });
  }, [save.pendingSponsorOffer]);

  useEffect(() => {
    initCareerNav(window.location.pathname);
    const syncRoutes = () => {
      setPlayerRouteId(parseCareerPlayerId());
      setTeamRouteId(parseCareerTeamId());
      setCanNavBack(canCareerGoBack());
    };
    window.addEventListener('popstate', syncRoutes);
    syncRoutes();
    return () => window.removeEventListener('popstate', syncRoutes);
  }, []);

  const closeCareerOverlays = () => {
    if (playerRouteId || teamRouteId || parseCareerPlayerId() || parseCareerTeamId()) {
      navigateCareerHub();
      setPlayerRouteId(null);
      setTeamRouteId(null);
      setCanNavBack(canCareerGoBack());
    }
  };

  const openPlayerProfile = (p: Player) => {
    const baseId = playerOrgId(p.id);
    const isOwn = save.squad.some((sig) => {
      const f = findSigning(sig);
      return f && (f.player.id === baseId || sig.playerId === baseId);
    }) || !!save.youth?.[baseId] || !!save.academy?.some((a) => a.id === baseId);
    const routeId = isOwn ? playerRuntimeId(p.id) : baseId;
    navigateCareerPlayer(routeId);
    setPlayerRouteId(routeId);
    setCanNavBack(canCareerGoBack());
  };

  const closePlayerProfile = () => {
    careerHistoryBack();
  };

  const openTeamProfile = (teamId: string) => {
    navigateCareerTeam(teamId);
    setTeamRouteId(teamId);
    setCanNavBack(canCareerGoBack());
  };

  const closeTeamProfile = () => {
    careerHistoryBack();
  };

  useEffect(() => {
    if (stage !== 'playoffHub' || !save.playoff || !save.league) return;
    const clone: Playoff = structuredClone(save.playoff);
    const before = poProgressKey(clone);
    poRunAI(clone, (id) => leagueTeam(save.league!, id), rngRef.current);
    if (poProgressKey(clone) === before) return;

    const next = { ...save, playoff: clone };
    persist(next);
    const timer = window.setTimeout(() => {
      setSave(next);
      if (clone.champion) setStage('seasonEnd');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [save, stage]);

  useEffect(() => {
    if (!majorResult || !save.org) return;
    const tournament = majorResult.tournament;
    const hallKey = `career-major-hall-${save.org.name}-${save.split}-${majorResult.placement}-${tournament.history.length}`;
    try {
      if (localStorage.getItem(hallKey)) {
        const savedTimer = window.setTimeout(() => setCareerHallStatus('saved'), 0);
        return () => window.clearTimeout(savedTimer);
      }
    } catch { /* sem storage: ainda tenta registrar */ }

    const user = tournament.teams.find((team) => team.id === 'user');
    if (!user) return;
    const champion = tournament.championId
      ? tournament.teams.find((team) => team.id === tournament.championId)?.name
      : majorResult.champion ? save.org.name : ct('Campanha encerrada');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    const statusTimer = window.setTimeout(() => setCareerHallStatus('saving'), 0);
    fetch('/api/hall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: getManager()?.nick || save.org.tag,
        teamName: save.org.name,
        pool: 'world',
        placement: HALL_PLACEMENT[majorResult.placement],
        champion: champion || ct('Campanha encerrada'),
        mvp: tournamentMvpNick(tournament),
        season: Math.max(1, Math.ceil(save.split / MAJOR_EVERY)),
        roster: user.players.map((player) => ({ nick: player.nick, country: player.country, ovr: player.ovr })),
        records: tournamentTeamRecords(tournament),
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('hall');
        try { localStorage.setItem(hallKey, '1'); } catch { /* sem storage */ }
        setCareerHallStatus('saved');
      })
      .catch(() => setCareerHallStatus('error'))
      .finally(() => window.clearTimeout(timer));
    return () => { window.clearTimeout(timer); window.clearTimeout(statusTimer); controller.abort(); };
  }, [majorResult, save.org, save.split]);

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
    return applyAnalystPrep(applyGamePlanBuff(synced, save.gamePlan ?? 'disciplined'), normalizeFacilities(save.facilities).analyst);
  };
  const prepareTeams = (rawA: TTeam | undefined, rawB: TTeam | undefined): [TTeam, TTeam] | null => {
    // `leagueTeam(l, id)` mente sobre o tipo (non-null assertion) e devolve
    // undefined silenciosamente se o id não estiver em `l.teams`. Acontece com
    // saves antigos (criados antes do fix do seedGroups) onde o match referencia
    // um time que sumiu do grupo. Bug 'isUser' undefined no Continue.
    if (!rawA || !rawB) return null;
    let a = applyFatigueForm(syncUser(rawA), save.fatigue, save.restingPlayers);
    let b = applyFatigueForm(syncUser(rawB), save.fatigue, save.restingPlayers);
    if (a.isUser) a = applyRivalryFocus(a, rivalryScore(save.rivalries, b.id));
    if (b.isUser) b = applyRivalryFocus(b, rivalryScore(save.rivalries, a.id));
    return [a, b];
  };
  const recordCareerMatch = (series: SeriesResult, teams: [TTeam, TTeam], userIdx: 0 | 1, label: string) => {
    const opponent = teams[userIdx === 0 ? 1 : 0];
    setSave((current) => {
      const rivalry = recordRivalry(current.rivalries, opponent.id, series);
      const userTeam = teams[userIdx];
      const psychologist = normalizeFacilities(current.facilities).psychologist;
      const load = updateMatchFatigue(current.fatigue, userTeam.players, series.maps.length, current.restingPlayers, current.morale, psychologist);
      const items: NewsItem[] = [];
      const highlight = bestSeriesMoment(series, teams, userIdx);
      const userWon = series.winner === userIdx;
      const mapGap = Math.abs(series.mapScore[0] - series.mapScore[1]);
      if (highlight) items.push({
        id: `${current.split}:hl:${highlight.nick}:${label}`.slice(0, 80), split: current.split,
        icon: '🎬', tone: 'good', cat: 'result', title: highlight.text, body: `${label} · vs ${opponent.tag}.`,
      });
      if (rivalry.becameRival) items.push({
        id: `${current.split}:rival:${opponent.id}`, split: current.split,
        icon: '⚔️', tone: 'info', cat: 'result',
        title: `${ct('Virou clássico:')} ${current.org?.tag ?? 'ORG'} x ${opponent.tag}`,
        body: ct('Os confrontos repetidos e equilibrados transformaram esta série numa rivalidade. O elenco entra mais focado nos próximos encontros.'),
      });
      if (userWon && userTeam.strength + 2 < opponent.strength) items.push({
        id: `${current.split}:upset:${opponent.id}:${label}`.slice(0, 80), split: current.split,
        icon: '📰', tone: 'good', cat: 'scene', title: ct('A zebra que abalou o circuito'),
        body: `${current.org?.name ?? ct('Sua organização')} ${ct('derrubou um favorito e virou assunto entre analistas e torcedores.')}`,
      });
      else if (userWon && mapGap >= 2) items.push({
        id: `${current.split}:dominant:${opponent.id}:${label}`.slice(0, 80), split: current.split,
        icon: '📣', tone: 'good', cat: 'social', handle: '@arena_cs', title: ct('Vitória dominante'),
        body: `${current.org?.tag ?? 'ORG'} ${ct('controlou a série do início ao fim. A torcida já pede voo mais alto.')}`,
      });
      if (load.newBurnouts.length) items.push({
        id: `${current.split}:burnout:${load.newBurnouts.join('-')}`.slice(0, 80), split: current.split,
        icon: '🔋', tone: 'bad', cat: 'board',
        title: `${ct('Risco de burnout:')} ${load.newBurnouts.join(', ')}`,
        body: ct('A sequência de partidas pesou. Use carga reduzida ou invista em psicologia para recuperar o elenco.'),
      });
      const next = { ...current, rivalries: rivalry.rivalries, fatigue: load.fatigue, restingPlayers: [], ...pushNews(current, items) };
      persist(next);
      return next;
    });
  };

  // SÓ tempos atuais: usa EXCLUSIVAMENTE os elencos REAIS de CS2 (2026) do
  // bo3.gg, exclusivos do modo carreira (não aparecem no draft/online). Os
  // times CS2 antigos feitos à mão não entram aqui (evita duplicatas e OVRs
  // desatualizados).
  // edições do dataset: o SERVIDOR é a fonte da verdade (valem pra todos). Começa
  // do cache local pra render instantâneo, mas a busca global sobrescreve o cache
  // (nada de cache local sobrepondo o que o admin editou pra todo mundo).
  const [bo3Edits, setBo3Edits] = useState<Bo3Edits>(() => loadBo3Edits());
  // só libera a FUNDAÇÃO depois que as edições globais chegam, pra carreira nova
  // nascer com os elencos editados (o snapshot do elenco é tirado na fundação).
  // Se o cache local já tem edições (device que já viu), começa pronto = instantâneo.
  const [editsReady, setEditsReady] = useState(() => Object.keys(loadBo3Edits().players).length > 0);
  useEffect(() => {
    let alive = true;
    fetchBo3Edits().then((srv) => {
      if (!alive) return;
      // jogador comum recebe o SERVIDOR CRU (fonte da verdade global): assim as
      // edições do admin chegam a todos, e o cache velho não "volta pro que era".
      // só o ADMIN mantém suas edições locais por cima (pra não perder trabalho).
      if (srv) { const next = isAdminUnlocked() ? mergeBo3Edits(srv, loadBo3Edits()) : srv; setBo3Edits(next); saveBo3Edits(next); }
      setEditsReady(true); // libera fundar mesmo se a API falhar (srv null), pra não travar
    });
    return () => { alive = false; };
  }, []);
  const currentEra = useMemo(
    // aplica as transferências já realizadas (save.moves) por cima da base, e o
    // ENVELHECIMENTO da IA por split (pulando seus jogadores, que evoluem pelo evo).
    () => {
      const skip = new Set(save.squad.map((s) => s.playerId));
      return applyAiAging(applyMoves(applyBo3Edits(CS2_REAL_2026, bo3Edits), save.moves), save.split, skip)
        .filter((t) => t.id !== '__free__')
        // times com <5 jogadores (Legacy/Galorys/RED Canids no dataset atual) somem
        // do circuito porque a UI/engine assume 5 titulares. Antes a gente filtrava
        // (= 'legacy sumiu'); agora completa o line com prospects sintéticos do
        // mesmo país via backfillPlayers — o time fica vivo e mantém o resto do
        // elenco intacto (ninguém troca de função, atributos preservados).
        .map((t) => t.players.length >= 5 ? t : ({ ...t, players: [...t.players, ...backfillPlayers(t, 5 - t.players.length)] }))
        // INJETA os jogadores vendidos pelo user que NÃO existem no CS2_REAL_2026
        // (academy/youth/FA): apêndice no roster do clube comprador. Antes esses
        // somiam do mundo após a venda — bug do 'jogador academy não aparece no
        // time que comprou'. Snapshot é congelado no momento da venda.
        .map((t) => {
          const extras = save.extraOnTeam?.[t.id];
          if (!extras || extras.length === 0) return t;
          // evita duplicar com quem já está no roster (regen colidir com snapshot)
          const have = new Set(t.players.map((p) => p.id));
          const fresh = extras.filter((e) => !have.has(e.player.id)).map((e) => e.player);
          return fresh.length === 0 ? t : { ...t, players: [...t.players, ...fresh] };
        });
    },
    [save.moves, save.extraOnTeam, bo3Edits, save.split, save.squad],
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
    const ev = save.eventInSplit ?? 1;
    // ROTAÇÃO POR ETAPA: cada evento do split pega um conjunto diferente da faixa,
    // deslocando a banda de força. Assim os 3 eventos do split não repetem os
    // mesmos times nem a mesma 1ª rodada (o GSL semeia por força, então mudar o
    // conjunto de times muda os grupos e os confrontos de abertura).
    // BANDA DE FORÇA POR TIER (por índice no ranking, não rotação global): o Tier-1
    // sai SÓ da faixa de elite, o Tier-3 SÓ da faixa de acesso. O núcleo é sempre o
    // mais forte da faixa; a rotação por etapa mexe apenas nas vagas rotativas DENTRO
    // da banda. Bandas com leve sobreposição (ex.: um Tier-2 forte às vezes sobe ao
    // Tier-1), mas elite NUNCA despenca pro acesso. Antes a rotação da banda inteira
    // empurrava um time de elite pro Tier-3 (Falcons na CCT Open Series).
    const bandField = (lo: number, hi: number, coreN: number, n: number, seed: number, rotBy: number): TeamSeason[] => {
      const band = byStrength.slice(lo, hi).filter((t) => !used.has(t.id));
      const core = band.slice(0, coreN);                  // os mais fortes da faixa, fixos
      const windowPart = band.slice(coreN);               // vagas rotativas (variam por etapa)
      const off = windowPart.length ? (((rotBy % windowPart.length) + windowPart.length) % windowPart.length) : 0;
      const rotatedWindow = [...windowPart.slice(off), ...windowPart.slice(0, off)];
      const rot = seededShuffle(rotatedWindow, seed).slice(0, Math.max(0, n - core.length));
      const field = [...core, ...rot];
      for (const t of field) used.add(t.id);
      return field;
    };
    const evSeed = ev * 7;          // cada etapa do split sorteia um field diferente
    const evRot = (ev - 1) * 4;     // desloca as vagas rotativas por etapa (1ª rodada diferente)
    const t1Teams = bandField(0, 24, 9, 15, save.split * 101 + 1 + evSeed, evRot);       // elite (ranking ~top 24)
    const t2Teams = bandField(15, 42, 9, 15, save.split * 101 + 2 + evSeed, evRot + 1);  // segundo escalão (~15-42)
    const t3Teams = bandField(34, 80, 9, 15, save.split * 101 + 3 + evSeed, evRot + 2);  // acesso (~34+)
    // FRENTE 2/3: VARIANTES + REGIONAIS
    // bandFieldRegional: aceita filtro de país (filtra dentro da banda + skip já-usados).
    // Permite criar circuitos T3 regionais (SA/EU/Ásia) que cobrem os times "regionais"
    // — geralmente country BR/AR/etc com teamwork baixo, que não devem cair em pools EU.
    const bandFieldRegional = (lo: number, hi: number, n: number, seed: number, countrySet: Set<string>): TeamSeason[] => {
      const band = byStrength.slice(lo, hi).filter((t) => !used.has(t.id) && countrySet.has(t.country.toLowerCase()));
      const picked = seededShuffle(band, seed).slice(0, n);
      for (const t of picked) used.add(t.id);
      return picked;
    };
    // Sets de países por macro-região (cobertura ampla pra não excluir times válidos).
    const SA_COUNTRIES = new Set(['br','ar','cl','pe','uy','co','ec','bo','py','ve','mx']);
    const EU_COUNTRIES = new Set(['de','fr','gb','es','it','pl','dk','se','fi','no','nl','be','at','cz','ro','hu','bg','pt','ie','ch','sk','rs','hr','si','ba','mk','al','gr','md','is','lu','mt','ee','lv','lt']);
    const ASIA_COUNTRIES = new Set(['cn','jp','kr','mn','vn','th','id','ph','my','sg','in','pk','tw','hk','kz','uz','tr']);

    const mk = (
      id: string,
      name: string,
      desc: string,
      teams: TeamSeason[],
      spots: number,
      prizeMult: number,
      tier: number,
      region?: 'global' | 'sa' | 'eu' | 'asia',
    ) => {
      const ai = teams.slice(0, 15);
      const favg = ai.length ? ai.reduce((a, t) => a + vrsCore(t.teamwork), 0) / ai.length : 400;
      return { id, name, desc, teams: ai, spots, prizeMult, vrsWeight: opponentMult(favg), tier, region: region ?? 'global' };
    };
    const t1Name = t1EventName(save.split, ev);
    const t1AltName = t1EventName(save.split, ev + 7);   // 2ª opção T1 (deslocada)
    const t2Name = t2EventName(save.split, ev);
    const t2AltName = t2EventName(save.split, ev + 5);   // 2ª opção T2
    const t3Name = t3EventName(save.split, ev);
    const t3SaName = t3RegionalEventName(save.split, ev, 'sa');
    const t3EuName = t3RegionalEventName(save.split, ev, 'eu');
    const t3AsiaName = t3RegionalEventName(save.split, ev, 'asia');

    // Variante T1/T2 paralela: pega vagas mais profundas da banda (com seed diferente).
    // Times em comum são removidos via `used` set (bandField é destrutivo).
    const t1AltTeams = bandField(8, 28, 4, 15, save.split * 101 + 21 + evSeed, evRot + 3);
    const t2AltTeams = bandField(20, 50, 4, 15, save.split * 101 + 22 + evSeed, evRot + 5);

    // Pools regionais (T3): puxam de 30-95 pra incluir os times mais fracos (BR
    // pequenos, regional only). Cada um filtrado pelos países da região.
    const t3SaTeams = bandFieldRegional(30, 95, 15, save.split * 101 + 31, SA_COUNTRIES);
    const t3EuTeams = bandFieldRegional(30, 95, 15, save.split * 101 + 32, EU_COUNTRIES);
    const t3AsiaTeams = bandFieldRegional(30, 95, 15, save.split * 101 + 33, ASIA_COUNTRIES);

    const out: CircuitOption[] = [
      mk('t1', t1Name, `${ct('Tier 1 mundial ·')} ${t1Name}${ct(': fase de grupos (GSL) + playoffs com a elite. Principal caminho pro Major; paga muito.')}`, t1Teams, 2, 1.8, 1),
      mk('t1-alt', t1AltName, `${ct('Tier 1 alt ·')} ${t1AltName}${ct(': field diferente da elite (vagas mais profundas, mesmas regras).')}`, t1AltTeams, 1, 1.6, 1),
      mk('t2', t2Name, `${ct('Tier 2 mundial ·')} ${t2Name}${ct(': segundo escalão do ranking, grupos GSL + playoffs. Vença pra subir ao Tier 1.')}`, t2Teams, 2, 1, 2),
      mk('t2-alt', t2AltName, `${ct('Tier 2 alt ·')} ${t2AltName}${ct(': segundo escalão com field rotativo (mais regional).')}`, t2AltTeams, 1, 0.9, 2),
      mk('t3', t3Name, `Tier 3 · ${t3Name}${ct(': circuito de acesso mundial. Onde toda org começa.')}`, t3Teams, 1, 0.6, 3),
      mk('t3-sa', t3SaName, `${ct('Tier 3 SA ·')} ${t3SaName}${ct(': circuito regional sulamericano (Brasil, Argentina, Chile, etc).')}`, t3SaTeams, 1, 0.55, 3, 'sa'),
      mk('t3-eu', t3EuName, `${ct('Tier 3 EU ·')} ${t3EuName}${ct(': circuito regional europeu (Alemanha, França, Polônia, Nórdicos).')}`, t3EuTeams, 1, 0.55, 3, 'eu'),
      mk('t3-asia', t3AsiaName, `${ct('Tier 3 Ásia ·')} ${t3AsiaName}${ct(': circuito regional asiático (China, Mongólia, Coreia, Sudeste).')}`, t3AsiaTeams, 1, 0.5, 3, 'asia'),
    ];
    return out.filter((c) => c.teams.length >= 5);
  }, [oppEra, save.split, save.eventInSplit]);

  // mercado: jogadores reais dos elencos atuais (CS2) + FREE AGENTS (pros sem
  // time), com preço de mercado. Free agents saem 25% mais barato (sem multa).
  const market = useMemo(
    () => {
      const squadIds = new Set(save.squad.map((s) => s.playerId));
      // jogador que CAIU de OVR enquanto era seu (declínio acumulado em save.evo)
      // não pode voltar pro mercado com o OVR antigo, alto. Aplica o evo sobre a
      // BASE (mesma conta do findSigning) pra mostrar o OVR ATUAL, caído.
      const evoMap = save.evo ?? {};
      const baseById = new Map<string, Player>(CS2_REAL_2026.flatMap((t) => t.players.map((p) => [p.id, p] as const)));
      const clampA = (v: number) => Math.max(40, Math.min(99, v));
      const withDecline = (p: Player): Player => {
        const d = evoMap[p.id];
        if (d == null || d >= 0) return p; // só caída (negativa); sem evo, segue igual
        const base = baseById.get(p.id) ?? p;
        return { ...base, aim: clampA(base.aim + d), consistency: clampA(base.consistency + d), clutch: clampA(base.clutch + d), awp: clampA(base.awp + d), igl: clampA(base.igl + d) };
      };
      const fromTeams = currentEra.flatMap((t) => t.players.map((p) => { const pl = withDecline(p); return { player: pl, from: t, price: playerValue(pl) }; }));
      const freeAgents = FREE_AGENT_PLAYERS
        .filter((p) => !squadIds.has(p.id)) // some do mercado quando já contratado
        .map((p) => ({ player: p, from: FREE_AGENTS_FROM, price: Math.round(playerValue(p) * 0.75) }));
      // rookies GRÁTIS (preço 0) sempre disponíveis: garantem que dá pra montar um
      // cinco mesmo sem grana — sem isso, liberar todos e ficar sem caixa travava a
      // carreira (não dava pra fechar 5 jogadores dentro do orçamento).
      const freeRookies = backfillPlayers(FREE_AGENTS_FROM, 5)
        .filter((p) => !squadIds.has(p.id))
        .map((p) => ({ player: p, from: FREE_AGENTS_FROM, price: 0 }));
      return [...fromTeams, ...freeAgents, ...freeRookies].sort((a, b) => a.price - b.price);
    },
    [currentEra, save.squad, save.evo],
  );

  const findSigning = (s: Signing): ResolvedSigning | null => {
    // O jogador é resolvido SEMPRE pelos atributos da BASE (não-envelhecida); o
    // envelhecimento é aplicado UMA vez abaixo (signingDrift). Resolver pelo
    // currentEra (já envelhecido) e ainda aplicar drift causava queda dupla de OVR
    // (86 -> 78) e, com a base regenerada, troca de função entre splits.
    let from = currentEra.find((t) => t.id === s.fromId);
    // currentEra filtra alguns times (__free__, __youth__, times de <5). Quando
    // for um desses, garante o pseudo-time correto pra `from` não ficar undefined
    // — senão o player é encontrado mas a função retorna null lá no fim e o
    // jogador some do elenco (bug do urban0/n1ssim, ambos free agents).
    if (!from) {
      if (s.fromId === FREE_AGENTS_FROM.id) from = FREE_AGENTS_FROM;
      else if (s.fromId === ACADEMY_FROM.id) from = ACADEMY_FROM;
      else from = CS2_REAL_2026.find((t) => t.id === s.fromId);
    }
    let player = CS2_REAL_2026.find((t) => t.id === s.fromId)?.players.find((p) => p.id === s.playerId);
    if (!player) {
      for (const t of CS2_REAL_2026) {
        const p = t.players.find((pp) => pp.id === s.playerId);
        if (p) { from = from ?? currentEra.find((ct) => ct.id === t.id) ?? t; player = p; break; }
      }
    }
    // 4) free agent (pro sem time): resolve da lista de free agents
    if (!player) {
      const fa = FREE_AGENT_PLAYERS.find((p) => p.id === s.playerId);
      if (fa) { from = FREE_AGENTS_FROM; player = fa; }
    }
    // 4b) rookie GRÁTIS (custo 0): vem do backfill determinístico do free agent.
    // Sem isto o jogador some da line (findSigning null) e a carreira trava em 5/5.
    if (!player) {
      const rk = backfillPlayers(FREE_AGENTS_FROM, 8).find((p) => p.id === s.playerId);
      if (rk) { from = FREE_AGENTS_FROM; player = rk; }
    }
    // 5) prospecto promovido da academia (não está na base): resolve do save.youth
    if (!player && save.youth?.[s.playerId]) {
      player = save.youth[s.playerId];
      from = ACADEMY_FROM;
    }
    // 5b) prospecto AINDA na academia (promovido direto na janela de transferências,
    // antes de virar youth): resolve da lista save.academy pra entrar no elenco.
    if (!player) {
      const ac = save.academy?.find((a) => a.id === s.playerId);
      if (ac) { player = ac; from = ACADEMY_FROM; }
    }
    // 6) jovens gerados por versões anteriores. O ID carrega todos os dados para
    // reconstruí-los, mesmo quando a geração atual da IA já trocou aquele atleta.
    if (!player) {
      const generated = parseRegenPlayerId(s.playerId);
      const origin = generated && CS2_REAL_2026.find((t) => t.id === generated.teamId);
      const original = generated && origin?.players[generated.slot];
      if (generated && origin && original) {
        player = regenYouth(origin, generated.slot, generated.generation, generated.debut, generated.ageAtDebut, original);
        from = currentEra.find((t) => t.id === generated.teamId) ?? origin;
      }
    }
    // 7) atletas de base também são determinísticos e podem ser refeitos mesmo
    // quando um save antigo referencia um índice maior que o mercado atual exibe.
    if (!player) {
      const academy = parseAcademyPlayerId(s.playerId);
      const origin = academy?.teamId === FREE_AGENTS_FROM.id
        ? FREE_AGENTS_FROM
        : academy && (currentEra.find((t) => t.id === academy.teamId) ?? CS2_REAL_2026.find((t) => t.id === academy.teamId));
      if (academy && origin) {
        player = backfillPlayers(origin, academy.index + 1)[academy.index];
        from = origin;
      }
    }
    // 7c) o ID do jogador mudou numa reimportação do bo3 (donk!), mas temos a
    // cópia (snapshot): acha o MESMO atleta pelo NICK no dataset atual, pra ele
    // resolver no seu eu vivo (atualizado) em vez de ser perdido / virar vaga.
    if (!player && s.playerSnapshot?.nick) {
      const nk = s.playerSnapshot.nick.toLowerCase();
      for (const t of CS2_REAL_2026) {
        const p = t.players.find((pp) => pp.nick.toLowerCase() === nk);
        if (p) { from = currentEra.find((ct) => ct.id === t.id) ?? t; player = p; break; }
      }
    }
    // 8) último recurso para saves novos: usa a cópia do jogador gravada quando
    // o elenco foi fechado, independente de alterações futuras na base.
    if (!player && s.playerSnapshot) {
      player = s.playerSnapshot;
      const src = s.fromSnapshot;
      from = src ? {
        ...FREE_AGENTS_FROM,
        id: src.id,
        team: src.team,
        tag: src.tag,
        country: src.country,
        colors: src.colors,
        logoUrl: src.logoUrl,
      } : { ...FREE_AGENTS_FROM, id: s.fromId };
    }
    if (!from || !player) return null;
    // trava a FUNÇÃO no snapshot tirado na contratação: backfill/regen podem
    // reconstruir o atleta com função diferente da que apareceu no mercado
    // (atributos seguem vindo de base+drift; só a role é fixada aqui).
    if (s.playerSnapshot && player.role !== s.playerSnapshot.role) {
      player = { ...player, role: s.playerSnapshot.role };
    }
    // função definida pelo técnico (override do dado da base; corrige dados
    // errados e dá controle de tática igual ao gerenciamento do Brasval)
    const ovrRole = save.roles?.[player.id];
    if (ovrRole && ovrRole !== player.role) player = { ...player, role: ovrRole };
    // aplica a evolução acumulada do SEU elenco (atributos sobem/caem entre
    // temporadas; valor e salário acompanham automaticamente). Jogador recém-contratado
    // ainda sem evo registrado HERDA o drift que a IA tinha aplicado nele (senão ele
    // "cai" do OVR mostrado no mercado pro OVR base ao ser contratado).
    // aplica as edições do admin (bo3Edits) no BASE — sem isso, o mercado mostrava
    // o jogador editado (saffee 84) mas a squad do user mostrava o cru (saffee 79).
    // Bug do "vendi saffe 79, mercado mostra 84 — me senti tapeado": signingDrift
    // e o evo ficam calculados em cima da MESMA base que o `currentEra` enxerga.
    player = applyBo3PlayerEdit(player, bo3Edits);
    const basePlayer = player;
    const d = save.evo?.[player.id] ?? signingDrift(player, save.split);
    if (!d) return { player, from, basePlayer };
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
      basePlayer,
    };
  };

  // AUTO-CURA: garante que todo jogador do elenco que AINDA resolve tenha um
  // snapshot gravado. Assim, se a base do bo3 for reimportada (troca de ids) num
  // deploy futuro, o passo 8 do findSigning recupera o atleta pela cópia em vez de
  // "perder" e liberar a vaga (o bug do mzinho/Techno4K/zweih). Roda uma vez por
  // save: depois que todos têm snapshot, nada muda e não re-persiste.
  useEffect(() => {
    if (!save.squad.length) return;
    let changed = false;
    const healed = save.squad.map((sig) => {
      if (sig.playerSnapshot) return sig;
      const r = findSigning(sig);
      if (!r) return sig;
      changed = true;
      return signingWithSnapshot(sig, r);
    });
    if (changed) { const next = { ...save, squad: healed }; persist(next); setSave(next); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.squad]);

  // AUTO-CURA da LIGA: saves criados ANTES do fix do padding podem ter grupos
  // com menos de 4 times — o opening match referencia s[3] = undefined e o user
  // não consegue jogar nem avançar (bug reportado pelo Maicon na PGL Bucharest).
  // Detecta e reconstrói o bracket via createGSLStage com PADDING, mas SÓ se
  // ainda não rolou nenhuma partida (current === 0, todos os matches sem
  // result). Senão arrisca derrubar progresso real.
  useEffect(() => {
    const l = save.league;
    if (!l || l.current !== 0) return;
    const teamIds = new Set(l.teams.map((t) => t.id));
    const round = l.rounds[0] ?? [];
    const hasBroken = round.some((m) => !teamIds.has(m.a) || !teamIds.has(m.b));
    const noneStarted = round.every((m) => !m.result);
    if (!hasBroken || !noneStarted) return;
    // Repõe o bracket: junta os times existentes + filler dos mais fracos do
    // oppEra (mesma lógica do padding do startSplit) até dar múltiplo de 4.
    const ai = l.teams.filter((t) => t.id !== 'user');
    if (ai.length < 15) {
      const inLeague = new Set([...ai.map((t) => t.id), 'user']);
      if (save.takeoverId) inLeague.add(save.takeoverId);
      const filler = oppEra
        .filter((t) => !inLeague.has(t.id) && t.players.length >= 5)
        .sort((a, b) => a.teamwork - b.teamwork)
        .slice(0, 15 - ai.length)
        .map((t) => teamSeasonToTTeam(t));
      ai.push(...filler);
    }
    const user = l.teams.find((t) => t.id === 'user');
    if (!user) return; // sem user no bracket, abandona — outro problema
    const rebuilt = createGSLStage(l.name, [user, ...ai]);
    const next = { ...save, league: rebuilt };
    persist(next);
    setSave(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.league?.name]);

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
    // PAD: garante que [user, ...ai] tenha 16 times (= 4 grupos de 4 perfeitos
    // no GSL). Sem isso, circuitos com field curto (T1-alt, T3 regionais)
    // geram grupos incompletos — o opening match referencia s[3] undefined,
    // e o user não consegue jogar nem avançar (bug reportado pelo Maicon na
    // PGL Bucharest). Padding usa os times mais FRACOS do oppEra que ainda
    // não estão no circuito, mantém balanceamento e não infla a competição.
    if (ai.length < 15) {
      const inCircuit = new Set([...ai.map((t) => t.id), 'user']);
      if (s.takeoverId) inCircuit.add(s.takeoverId);
      const filler = oppEra
        .filter((t) => !inCircuit.has(t.id) && t.players.length >= 5)
        .sort((a, b) => a.teamwork - b.teamwork) // mais fracos primeiro
        .slice(0, 15 - ai.length)
        .map((t) => {
          const tt = teamSeasonToTTeam(t);
          tt.strength += aiBoost;
          return tt;
        });
      ai.push(...filler);
    }
    // formato real do CS: 2 grupos GSL (dupla eliminação, 4 times, top 2
    // avançam) → playoffs mata-mata. Nada de pontos corridos (isso é futebol).
    const ev = s.eventInSplit ?? 1;
    const league = createGSLStage(`${circuit.name} · Etapa ${ev}/${EVENTS_PER_SPLIT} (Split ${s.split})`, [user, ...ai]);
    const choice: CircuitChoice = {
      id: circuit.id,
      name: circuit.name,
      spots: circuit.spots,
      prizeMult: circuit.prizeMult,
      vrsWeight: circuit.vrsWeight,
      tier: circuit.tier,
    };
    // a meta da diretoria é do SPLIT inteiro: define na 1ª etapa e mantém nas demais
    const objective = ev === 1 || !s.objective ? objectiveFor(circuit.tier, s.split, isMajorSplit(s.split)) : s.objective;
    const startItem: NewsItem = {
      id: `${s.split}:start:${ev}`, split: s.split, icon: '🗓️', tone: 'info', cat: 'board',
      title: `Split ${s.split} · Etapa ${ev}/${EVENTS_PER_SPLIT}: ${circuit.name}`,
      body: `${ct('Meta da diretoria: "')}${objective.text}${ct('" (bônus')} ${formatMoney(objective.bonus)}).`,
    };
    // relatório do olheiro: o time a temer no circuito + o mapa forte dele
    const toughest = ai.slice().sort((a, b) => b.strength - a.strength)[0];
    const scoutItem: NewsItem[] = toughest ? [{
      id: `${s.split}:scout`, split: s.split, icon: '🔍', tone: 'info', cat: 'scout',
      title: `Olheiros: ${toughest.name} ${ct('é o time a temer')}`,
      body: `O favorito do ${circuit.name} ${ct('é a')} ${toughest.name} ${ct('(força')} ${toughest.strength.toFixed(1)}), perigosa em ${MAP_LABELS[scoutMaps(toughest)[0].m]}${ct('. Pré-jogo: confira o relatório do adversário na Visão geral antes de cada partida.')}`,
    }] : [];
    const next = {
      ...s, league, circuit: choice, tierChange: null, objective,
      inviteAccepted: choice.tier < s.tier || s.inviteAccepted, // jogou acima do tier por convite
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
      // recém-contratado sem evo herda o drift da IA (mesmo OVR do mercado).
      // Usa o BASE (não-envelhecido) + o drift acumulado; f.player já vem driftado,
      // então somar prev de novo contava o envelhecimento em dobro.
      const prev = s.evo?.[sig.playerId] ?? signingDrift(f.basePlayer, s.split);
      const ovr = playerOvr(f.basePlayer) + prev; // OVR efetivo atual (base + evolução)
      const age = effectiveAge(f.basePlayer, s.split, s.youthAge);
      // teto é calculado pela idade-BASE (igual aiAttrDrift faz pra IA). Usar a idade
      // CORRENTE encolhia o teto a cada virada de bloco etário (21→22, 22→23...) e
      // travava o jogador "no teto" pra sempre — sem nunca crescer mais (bug do
      // "jogadores não evoluem dps de um certo tempo").
      const baseAgeForPot = baseAge(f.basePlayer, s.youthAge);
      const pot = playerPotentialOvr(f.basePlayer, baseAgeForPot);
      const atCeiling = ovr >= pot;
      let d = evoDelta(sig.playerId, s.split, age, atCeiling);
      // foco de treino: o jogador escolhido desenvolve mais rápido. Jovem/auge
      // ganha +1 (não ultrapassa o potencial); veterano treina pra perder menos.
      const focused = s.trainingFocus === sig.playerId;
      if (focused) {
        if (!atCeiling) d += 1;
        else if (d < 0) d += 1; // mitiga o declínio do veterano
      }
      if (!atCeiling && d > 0) d += developmentBonus(sig.playerId, s.split, normalizeFacilities(s.facilities).training);
      if (!atCeiling && d > 0) d += personalityDevelopmentBonus(sig.playerId, s.split, age);
      // CONVITE: encarar um tier acima acelera os jovens (rodagem contra os grandes)
      if (s.inviteAccepted && !atCeiling && d > 0 && age <= 22) d += 2;
      if (d > 0) d = Math.min(d, Math.max(0, pot - ovr));
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
      d += developmentBonus(a.id, s.split, normalizeFacilities(s.facilities).training);
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

  // promove um prospecto da academia (revelado por 250k) pro TIME ACADEMY
  // (5 jovens que disputam a Liga Academy). Se o time tem vaga (<5), entra
  // direto. Se cheio, exige replaceAcaId pra trocar com um titular. O prospecto
  // sai do save.academy. (Pedido do user pra controlar o time academy.)
  const promoteToAcaTeam = (prospectId: string, replaceAcaId?: string) => {
    const a = (save.academy ?? []).find((x) => x.id === prospectId);
    if (!a) return;
    const acaTeam = save.academyTeam ?? [];
    let newTeam: AcademyEntry[];
    if (replaceAcaId) {
      if (!acaTeam.some((x) => x.id === replaceAcaId)) return;
      newTeam = acaTeam.map((x) => (x.id === replaceAcaId ? a : x));
    } else if (acaTeam.length < 5) {
      newTeam = [...acaTeam, a];
    } else {
      return; // time cheio, UI deve forçar replaceAcaId
    }
    const academy = (save.academy ?? []).filter((x) => x.id !== prospectId);
    const academyFocus = save.academyFocus === prospectId ? null : save.academyFocus;
    const next = { ...save, academy, academyTeam: newTeam, academyFocus };
    persist(next);
    setSave(next);
  };

  // dispensa um jogador do time academy (sai do squad de 5 que disputa a Liga
  // Academy; o slot fica vazio até o user encaixar outro prospect).
  const releaseAcaTeamPlayer = (acaId: string) => {
    const acaTeam = (save.academyTeam ?? []).filter((x) => x.id !== acaId);
    const next = { ...save, academyTeam: acaTeam };
    persist(next);
    setSave(next);
  };

  // promove um jogador do time academy direto pro elenco principal (mesma
  // lógica do promoteProspect, mas lê do academyTeam em vez do academy).
  const promoteAcaTeamToSquad = (acaId: string, replaceOid?: string) => {
    const a = (save.academyTeam ?? []).find((x) => x.id === acaId);
    if (!a) return;
    if (save.squad.length >= 5 && !replaceOid) return; // UI decide
    const player: Player = {
      id: a.id, nick: a.nick, name: a.name, country: a.country, role: a.role,
      aim: a.aim, consistency: a.consistency, clutch: a.clutch, awp: a.awp, igl: a.igl,
    };
    const youth = { ...(save.youth ?? {}), [a.id]: player };
    const youthAge = { ...(save.youthAge ?? {}), [a.id]: a.age - Math.floor((save.split - 1) / 3) };
    const acaTeam = (save.academyTeam ?? []).filter((x) => x.id !== acaId);
    let squad = save.squad;
    if (squad.length >= 5 && replaceOid) squad = squad.filter((sg) => sg.playerId !== replaceOid);
    squad = [...squad, { playerId: a.id, fromId: '__youth__' }];
    const contracts = { ...(save.contracts ?? {}), [a.id]: save.split + CONTRACT_TERM - 1 };
    const next = { ...save, academyTeam: acaTeam, youth, youthAge, squad, contracts };
    persist(next);
    setSave(next);
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
    // moves/extraOnTeam recebem as VENDAS pra o jogador realmente ir pro
    // clube comprador. Antes a venda só removia do squad sem atualizar
    // moves — real player voltava pro time original e academy/youth sumia.
    const moves = { ...(s.moves ?? {}) };
    const extraOnTeam = { ...(s.extraOnTeam ?? {}) };
    const arrivals: string[] = [];
    const departures: string[] = [];
    const failedDeals: string[] = []; // acordos que caíram (sem caixa) — vão pro feed
    // checa se o id existe na base real (pra decidir se applyMoves cobre,
    // ou se precisa ir pro extraOnTeam). Roda 1x antes do loop.
    const baseHasPlayer = (pid: string): boolean => {
      for (const t of CS2_REAL_2026) {
        if (t.players.some((p) => p.id === pid)) return true;
      }
      return false;
    };
    // VENDAS: jogador seu sai (proposta aceita na temporada), entra a grana e
    // ele REALMENTE migra pro time comprador (não some, não volta pro antigo).
    for (const sale of sales) {
      const sig = squad.find((x) => x.playerId === sale.playerId);
      if (!sig) continue; // já não está
      // captura snapshot do jogador no momento da venda — atributos atuais,
      // pós-evo. Esse é o estado que vai pro extraOnTeam (academy/youth).
      const resolved = findSigning(sig);
      squad = squad.filter((x) => x.playerId !== sale.playerId);
      delete contracts[sale.playerId]; delete morale[sale.playerId]; delete peakOvr[sale.playerId]; delete evo[sale.playerId];
      budget += sale.fee;
      // ROTA 1: jogador real da base → applyMoves resolve por id.
      if (baseHasPlayer(sale.playerId)) {
        moves[sale.playerId] = sale.toId;
      } else if (resolved?.player) {
        // ROTA 2: academy / youth / FA / regen — não existe em CS2_REAL_2026,
        // então `moves` sozinho não move. Apêndice no roster do comprador
        // via extraOnTeam (currentEra injeta esses no merge).
        const list = extraOnTeam[sale.toId] ?? [];
        if (!list.some((e) => e.player.id === sale.playerId)) {
          extraOnTeam[sale.toId] = [...list, { player: resolved.player, arrival: s.split }];
        }
      }
      departures.push(`${sale.nick} (${sale.toTag})`);
    }
    // ACORDOS DE COMPRA: tira a troca, traz o alvo e desconta o dinheiro
    for (const d of deals) {
      if (squad.some((x) => x.playerId === d.inPlayerId)) continue; // já está no elenco
      if (budget < d.fee) {
        // sem caixa agora: acordo cai, mas o usuário precisa SABER (antes era silencioso
        // e o jogador "sumia" sem aviso). NÃO mexe no elenco: kye continua, n1ssim não vem.
        failedDeals.push(d.inNick);
        continue;
      }
      for (const out of d.outPlayerIds) {
        squad = squad.filter((x) => x.playerId !== out);
        delete contracts[out]; delete morale[out]; delete peakOvr[out]; delete evo[out];
      }
      // anexa snapshot do jogador que chega: se a base regenerar / mudar de ID antes
      // do próximo render, o findSigning ainda recupera o atleta pelo snapshot
      // (sem snapshot, o slot vira ct('vaga vazia') e a contratação some).
      const resolved = findSigning({ playerId: d.inPlayerId, fromId: d.inFromId, fee: d.fee });
      const newSig: Signing = resolved
        ? signingWithSnapshot({ playerId: d.inPlayerId, fromId: d.inFromId, fee: d.fee }, resolved)
        : { playerId: d.inPlayerId, fromId: d.inFromId, fee: d.fee };
      squad.push(newSig);
      contracts[d.inPlayerId] = s.split + CONTRACT_TERM - 1;
      budget -= d.fee;
      arrivals.push(d.inNick);
    }
    let next: CareerSave = { ...s, squad, budget, contracts, morale, peakOvr, evo, moves, extraOnTeam, pendingDeals: [], pendingSales: [], rejectedOffers: [] };
    const news: NewsItem[] = [];
    if (arrivals.length) news.push({ id: `${s.split}:deals`, split: s.split, icon: '🤝', tone: 'good', cat: 'board', title: ct('Reforços confirmados na janela'), body: `${ct('Acordos fechados na temporada passada entraram em vigor:')} ${arrivals.join(', ')}.` });
    if (departures.length) news.push({ id: `${s.split}:sales`, split: s.split, icon: '💸', tone: 'info', cat: 'transfer', title: ct('Vendas confirmadas na janela'), body: `${ct('Saíram por proposta aceita:')} ${departures.join(', ')}.` });
    if (failedDeals.length) news.push({ id: `${s.split}:dealsFail`, split: s.split, icon: '⚠️', tone: 'bad', cat: 'board', title: ct('Acordos cancelados (sem caixa)'), body: `${ct('A diretoria não fechou esses reforços por falta de caixa na janela:')} ${failedDeals.join(', ')}. ${ct('Tente de novo no próximo mercado.')}` });
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
    const best = picks.map((p) => p.player).sort((a, b) => {
      const aScore = playerOvr(a) + personalityOfferBonus(a.id, s.morale?.[a.id] ?? MORALE_DEFAULT) / 8;
      const bScore = playerOvr(b) + personalityOfferBonus(b.id, s.morale?.[b.id] ?? MORALE_DEFAULT) / 8;
      return bScore - aScore;
    })[0];
    if (!best || playerOvr(best) < 78) return null; // ninguém assedia jogador mediano
    const h = hashStr(`offer:${s.split}:${best.id}`);
    const offerChance = 50 + personalityOfferBonus(best.id, s.morale?.[best.id] ?? MORALE_DEFAULT);
    if (h % 100 >= Math.max(20, Math.min(80, offerChance))) return null;
    const elite = oppEra.filter((t) => teamTier(t) === 1 && t.id !== s.takeoverId);
    if (elite.length === 0) return null;
    const org = elite[h % elite.length];
    const fee = Math.round(playerValue(best) * (1.4 + (h % 35) / 100)); // 1.4x a 1.75x
    return { orgId: org.id, orgName: org.team, orgTag: org.tag, playerId: best.id, nick: best.nick, ovr: playerOvr(best), fee };
  };

  // clubForm: usado pela OverviewTab; helper movido pra page.


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
    const pair = prepareTeams(leagueTeam(save.league, m.a), leagueTeam(save.league, m.b));
    if (!pair) return; // save corrompido (team id no match não está em league.teams)
    const [a, b] = pair;
    const isFinal = p.final === m;
    setMatchCtx({
      teams: [a, b],
      userIdx: m.a === 'user' ? 0 : 1,
      mode: 'playoff',
      bestOf: isFinal ? PO_FINAL_BO : PO_SF_BO,
      phaseLabel: `${p.circuit} · ${isFinal ? ct('GRANDE FINAL') : ct('Semifinal')}`,
      playoffIds: [m.a, m.b],
    });
    setStage('veto');
  };

  const finishPlayoffRound = (series?: SeriesResult, playedIds?: [string, string]) => {
    const p = save.playoff;
    if (!p || !save.league) return;
    const clone: Playoff = structuredClone(p);
    const m = poFindMatch(clone, playedIds);
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
    const pair = prepareTeams(leagueTeam(save.league, live.a), leagueTeam(save.league, live.b));
    if (!pair) { applyPlayoff(structuredClone(p)); return; }
    const [a, b] = pair;
    const isFinal = p.final === live;
    const bo = isFinal ? PO_FINAL_BO : PO_SF_BO;
    const series = simulateSeries(rngRef.current, a, b, autoVeto([a, b], rngRef.current, bo), bo);
    setQuickSim({
      series, teams: [a, b], userIdx: live.a === 'user' ? 0 : 1,
      label: `${p.circuit} · ${isFinal ? ct('Final') : ct('Semifinal')}`,
      onDone: () => {
        setQuickSim(null);
        const clone: Playoff = structuredClone(p);
        const m = poUserMatch(clone);
        if (m) m.result = series;
        applyPlayoff(clone);
        recordCareerMatch(series, [a, b], live.a === 'user' ? 0 : 1, `${p.circuit} · ${isFinal ? ct('Final') : ct('Semifinal')}`);
      },
    });
  };

  // SIM MATCH: simula a partida do usuário com animação rápida (mini partida)
  const simMine = () => {
    if (!save.league) return;
    const l = structuredClone(save.league);
    const m = userLeagueMatch(l);
    if (!m) return;
    rngRef.current = makeRng(randomSeed());
    const pair = prepareTeams(leagueTeam(l, m.a), leagueTeam(l, m.b));
    if (!pair) return;
    const [a, b] = pair;
    const bo = m.bo ?? LEAGUE_BO; // GSL: abertura Bo1, resto Bo3
    const series = simulateSeries(rngRef.current, a, b, autoVeto([a, b], rngRef.current, bo), bo);
    setQuickSim({
      series, teams: [a, b], userIdx: m.a === 'user' ? 0 : 1,
      label: `${l.name} · ${l.gsl ? ct(GSL_ROUND_LABELS[l.current]) : `${ct('Rodada')} ${l.current + 1}`}`,
      onDone: () => { setQuickSim(null); finishUserRound(l, series); recordCareerMatch(series, [a, b], m.a === 'user' ? 0 : 1, `${l.name} · ${l.gsl ? ct(GSL_ROUND_LABELS[l.current]) : `${ct('Rodada')} ${l.current + 1}`}`); },
    });
  };

  // SIM SPLIT: resolve TODAS as rodadas restantes do turno de uma vez (sem
  // animação) e para no mata-mata — corta a repetição de clicar rodada a rodada
  // (pedido de quem joga no celular) sem pular a parte decisiva (playoffs).
  const simWholeSplit = () => {
    if (!save.league) return;
    const l = structuredClone(save.league);
    rngRef.current = makeRng(randomSeed());
    let guard = 0;
    const simulated: { series: SeriesResult; teams: [TTeam, TTeam]; userIdx: 0 | 1; label: string }[] = [];
    if (l.gsl) {
      while (!gslDone(l) && guard++ < 12) {
        const m = userLeagueMatch(l);
        if (m && !m.result) {
          const pair = prepareTeams(leagueTeam(l, m.a), leagueTeam(l, m.b));
          if (pair) {
            const [a, b] = pair;
            const bo = m.bo ?? 3;
            m.result = simulateSeries(rngRef.current, a, b, autoVeto([a, b], rngRef.current, bo), bo);
            simulated.push({ series: m.result, teams: [a, b], userIdx: m.a === 'user' ? 0 : 1, label: `${l.name} · ${ct(GSL_ROUND_LABELS[l.current])}` });
          }
        }
        resolveGSLRound(l, rngRef.current);
      }
      enterPlayoffs(l);
      simulated.forEach((match) => recordCareerMatch(match.series, match.teams, match.userIdx, match.label));
      return;
    }
    while (!leagueDone(l) && guard++ < 80) {
      const m = userLeagueMatch(l);
      if (m && !m.result) {
        const pair = prepareTeams(leagueTeam(l, m.a), leagueTeam(l, m.b));
        if (pair) {
          const [a, b] = pair;
          m.result = simulateSeries(rngRef.current, a, b, autoVeto([a, b], rngRef.current, LEAGUE_BO), LEAGUE_BO);
          simulated.push({ series: m.result, teams: [a, b], userIdx: m.a === 'user' ? 0 : 1, label: `${l.name} · ${ct('Rodada')} ${l.current + 1}` });
        }
      }
      resolveLeagueRound(l, rngRef.current, LEAGUE_BO);
    }
    enterPlayoffs(l);
    simulated.forEach((match) => recordCareerMatch(match.series, match.teams, match.userIdx, match.label));
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
    const userVrs = userBaseVrsFor(user.teamwork) + s.vrs + userLegacyVrs(s);
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
      majorHistory: [],
    });
  };

  // encerra o Major do usuário: colocação, prêmio e VRS
  const concludeMajor = (t: Tournament, placement: PlacementCode) => {
    const tournament = { ...t, history: [...(save.majorHistory ?? []), ...t.history] };
    const result: MajorResult = {
      tournament,
      placement,
      prize: MAJOR_PRIZE[placement],
      vrs: MAJOR_VRS[placement],
      champion: placement === 'champion',
    };
    setMajorResult(result);
    setMajorTState(tournament);
    // persiste o resultado: se o jogador der F5 na tela de resultado, reidrata aqui
    // em vez de voltar pro hub com o Major "vivo" e re-jogar a última série
    setSave((s) => { const n = { ...s, majorT: tournament, majorResult: result }; persist(n); return n; });
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
      const majorHistory = [...(save.majorHistory ?? []), ...clone.history];
      if (stageNow < 3) {
        const seeds = stageNow === 1 ? (save.majorSeed2 ?? []) : (save.majorSeed3 ?? []);
        const next = createSwissStage([...advancers, ...seeds], rngRef.current, `${MAJOR_NAME(save.split)} · Stage ${stageNow + 1}`);
        setMajorState(next, { majorStage: stageNow + 1, majorHistory });
      } else {
        const po = createPlayoffStage(advancers, `${MAJOR_NAME(save.split)} · Champions Stage`);
        setMajorState(po, { majorStage: 4, majorHistory });
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
    const pair = prepareTeams(getTeam(majorT, up.a), getTeam(majorT, up.b));
    if (!pair) return;
    const [a, b] = pair;
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
    const pair = prepareTeams(getTeam(majorT, up.a), getTeam(majorT, up.b));
    if (!pair) return;
    const [a, b] = pair;
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
        recordCareerMatch(series, [a, b], up.a === 'user' ? 0 : 1, `${majorT.name} · ${up.label}`);
      },
    });
  };

  // ---------- caches dos painéis (hooks precisam vir antes dos early-returns) ----------
  // stats da temporada, rankings e feed de transferências são caros de calcular;
  // memoizados aqui pra não recomputar a cada render do hub
  const seasonStatsMemo = useMemo(() => (save.league ? seasonPlayerStats(save.league) : []), [save.league]);
  // o SEU time como TeamSeason, pra entrar nos rankings da temporada (MVP/Top 20).
  // Sem isto os seus jogadores nunca apareciam (o pool era só a IA do currentEra).
  const userTeamSeason = useMemo((): TeamSeason | null => {
    if (!save.org) return null;
    const players = save.squad.map(findSigning).filter(Boolean).map((f) => (f as ResolvedSigning).player);
    if (players.length < 5) return null;
    return {
      id: 'user', team: save.org.name, tag: save.org.tag, era: 'CS2 2026', game: 'CS2',
      country: players[0]?.country ?? 'br', teamwork: 80, honors: '', colors: save.org.colors,
      mapPrefs: {}, coach: ROOKIE_COACH, players,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.squad, save.org, save.evo, save.roles, save.split, currentEra]);
  // pool dos rankings da temporada = SEU time + a IA
  const top20Pool = useMemo(() => (userTeamSeason ? [userTeamSeason, ...currentEra] : currentEra), [userTeamSeason, currentEra]);

  const top20Memo = useMemo(
    () => {
      const mvps = seasonMvpCounts(top20Pool, save.split);
      const titlesMap = seasonTitlesByPlayer(top20Pool, save.split);
      const all = top20Pool
        .flatMap((t) => t.players.map((p): Top20Entry => ({
          p, team: t, role: p.role as Role,
          rating: playerSeasonRating(p, save.split),
          mvps: mvps.get(p.id) ?? 0,
          sl: hltvStatline(p, p.role as Role, save.split),
          points: hltvPointsAt(p, t, p.role as Role, save.split),
          titles: titlesMap.get(p.nick.toLowerCase()) ?? [],
        })));
      return dedupeTop20ByNick(all)
        .sort((a, b) => b.points - a.points)
        .slice(0, 20);
    },
    [top20Pool, save.split],
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
  }, [save.careerStats, save.roles, save.org, currentEra]);
  const feedMemo = useMemo(() => transferFeed(save.split, currentEra), [save.split, currentEra]);
  // propostas que CHEGAM pelos seus jogadores: clubes assediam seus melhores nomes.
  // Determinístico por split; some quem você já vendeu ou recusou.
  const incomingOffers = (() => {
    const sold = new Set([
      ...(save.pendingSales ?? []).map((x) => x.playerId),
      ...(save.rejectedOffers ?? []),
      ...(save.pendingDeals ?? []).flatMap((d) => d.outPlayerIds),
    ]);
    const buyers = currentEra.filter((t) => t.id !== save.takeoverId).sort((a, b) => b.teamwork - a.teamwork);
    if (!buyers.length) return [];
    // toId = id do clube comprador. ANTES era guardado só toTag/toName (string),
    // então na hora de consumar a venda a gente não sabia pra onde o jogador
    // ia REALMENTE — `moves` ficava sem entrada e o atleta voltava pro time
    // original via applyMoves (bug do 'vende real, vai pro time antigo').
    const out: { playerId: string; nick: string; ovr: number; country: string; fee: number; toTag: string; toId: string; toName: string }[] = [];
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
      out.push({ playerId: p.id, nick: p.nick, ovr, country: p.country, fee, toTag: buyer.tag, toId: buyer.id, toName: buyer.team });
    }
    return out;
  })();
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
      rows.push({ id: 'user', name: save.org.name, tag: save.org.tag, colors: save.org.colors, logoUrl: save.org.logo, players: orgPlayers, region: reg, vrs: userBaseVrsFor(ut?.teamwork ?? 78) + save.vrs + userLegacyVrs(save), isUser: true });
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
  // ativação: PRIMEIRA vez chegando ao #1 do VRS mundial (uma vez por carreira).
  // Tem que ficar ANTES dos early returns do componente (`if (quickSim) return`,
  // `if (!league) return null` etc.) — senão o número de hooks chamados varia
  // entre renders e dispara o erro React #310 ("rendered more hooks than during
  // the previous render"). Bug do "Ta dando bug em alguns clicks ao selecionar
  // campeonato": passar pra um estado SEM league pulava o hook.
  const myVrsRankEarly = useMemo(
    () => vrsAllMemo.findIndex((t) => t.isUser) + 1,
    [vrsAllMemo],
  );
  useEffect(() => {
    if (myVrsRankEarly !== 1 || upsellWorld1Ref.current) return;
    upsellWorld1Ref.current = true;
    window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: 'world-1' } }));
  }, [myVrsRankEarly]);

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
  // T11.5: dispara FiredModal cinematográfico via host global em vez do
  // panel inline antigo. Só dispara uma vez (controla via _firedShown).
  if (save.fired) {
    if (!firedShownRef.current) {
      firedShownRef.current = true;
      const orgAg = aggregateHistory(save.history);
      const quotes = [
        ct('Investimos confiando que viria uma virada. Não veio.'),
        ct('A torcida pediu mudanças. A gente ouviu.'),
        ct('Esse projeto não é mais sustentável com você no comando.'),
        ct('A diretoria agradece o trabalho, mas decidiu mudar de rumo.'),
      ];
      const quoteIdx = (save.split * 17 + (save.history.length * 3)) % quotes.length;
      openFiredModal(
        {
          orgName: save.org?.name ?? ct('sua organização'),
          splitsManaged: save.split,
          circuitTitles: orgAg.circuitTitles,
          majorTitles: orgAg.majorTitles,
          sponsorsLost: (save.sponsors ?? []).length,
          reason: ct('Confiança da diretoria chegou ao fundo após resultados consecutivos abaixo do esperado.'),
          quote: quotes[quoteIdx],
        },
        () => {
          wipeActiveSlot();
          const fresh = emptySave();
          persist(fresh);
          setSave(fresh);
          setOrgChoice('select');
          setStage('found');
        },
      );
    }
    // Render mínimo enquanto o modal está aberto — visual neutro pra não
    // competir com o modal cinematográfico.
    return (
      <div className="fade-in" style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--em-muted)', fontSize: '0.86rem' }}>
          {ct('Aguardando decisão…')}
        </div>
      </div>
    );
  }

  // ---------- fundação ----------
  // T8.2: removido o `if (showOnb) return <CareerOnboarding />` early-return.
  // Agora o tour é INTERATIVO (com spotlight nos elementos reais), renderizado
  // como overlay no fim do JSX. Steps com target ausente fazem fallback pro
  // tooltip centralizado — funciona mesmo se a app ainda não tá no hub.

  if (stage === 'found') {
    // espera os elencos editados (global) antes de deixar fundar: senão a carreira
    // nasce com o roster antigo congelado no snapshot e nunca pega as edições.
    if (!editsReady) {
      return (
        <CareerDashFrame onExit={onExit} title={ct('Modo carreira')}>
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 14 }}>
            <div className="spinner" />
            <p className="muted">{ct('Carregando os elencos atualizados…')}</p>
          </div>
        </CareerDashFrame>
      );
    }
    const startFromOrg = (s: OrgStart) => {
      update({
        org: s.org, squad: s.squad, coachFromId: s.coachFromId, budget: s.budget,
        tier: s.tier, takeoverId: s.takeoverId, region: s.region,
        board: s.board ?? 60, scenario: s.scenario ?? null,
      });
      setStage('market');
    };
    if (orgChoice === 'fictional') {
      return <FoundOrg founder={founder} onExit={() => setOrgChoice('select')} onFound={(org) => {
        update({ org, takeoverId: null, scenario: null });
        setStage('market');
      }} />;
    }
    if (orgChoice === 'scenario') {
      return <ScenarioPicker current={currentEra} onBack={() => setOrgChoice('select')} onStart={startFromOrg} />;
    }
    return (
      <CareerDashFrame onExit={onExit} title={ct('Assumir organização')}>
        <OrgSelect
          teams={currentEra}
          onExit={onExit}
          onFictional={() => setOrgChoice('fictional')}
          onScenarios={() => setOrgChoice('scenario')}
          onStart={startFromOrg}
        />
      </CareerDashFrame>
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
                title: ct('Saídas por fim de contrato'),
                body: `${ct('Sem renovação, saíram do elenco:')} ${released.join(', ')}.`,
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
      <CareerDashFrame onExit={onExit} title={ct('Mercado de transferências')}>
      <MarketScreen
        save={save}
        market={market}
        coaches={currentEra}
        findSigning={findSigning}
        onExit={onExit}
        onConfirm={(squad, coachFromId, budget, sponsors, sponsorUntil) => {
          const stableSquad = squad.map((signing) => {
            const resolved = findSigning(signing);
            return resolved ? signingWithSnapshot(signing, resolved) : signing;
          });
          // todo jogador do elenco fechado tem contrato; novos ganham CONTRACT_TERM
          const contracts = { ...(save.contracts ?? {}) };
          const ids = new Set(stableSquad.map((x) => x.playerId));
          for (const sig of stableSquad) {
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
          // quem saiu do elenco: MANTÉM o declínio acumulado (evo negativo) pra não
          // "ressuscitar" no OVR base, alto, quando volta ao mercado (bug do veterano
          // que caiu e voltava caro/forte). Só o GANHO (evo positivo) é zerado, pra
          // ninguém recontratar barato um jogador que você desenvolveu.
          const evo = { ...(save.evo ?? {}) };
          for (const k of Object.keys(evo)) if (!ids.has(k) && (evo[k] ?? 0) >= 0) delete evo[k];
          // prospectos PROMOVIDOS da academia dentro da janela: move academia -> youth
          // (mesma conta do promoteProspect) pra eles persistirem e seguirem evoluindo.
          const youth = { ...(save.youth ?? {}) };
          const youthAge = { ...(save.youthAge ?? {}) };
          let academy = save.academy ?? [];
          let academyFocus = save.academyFocus;
          for (const sig of stableSquad) {
            const ac = (save.academy ?? []).find((a) => a.id === sig.playerId);
            if (ac && !youth[ac.id]) {
              youth[ac.id] = { id: ac.id, nick: ac.nick, name: ac.name, country: ac.country, role: ac.role, aim: ac.aim, consistency: ac.consistency, clutch: ac.clutch, awp: ac.awp, igl: ac.igl };
              youthAge[ac.id] = ac.age - Math.floor((save.split - 1) / 3);
              academy = academy.filter((x) => x.id !== ac.id);
              if (academyFocus === ac.id) academyFocus = null;
            }
          }
          // org do zero (sem região ainda): define a região pelo core do 1º elenco
          const region = save.region ?? macroRegionPlurality(stableSquad.map((s) => findSigning(s)?.player.country ?? '').filter(Boolean));
          const next = { ...save, squad: stableSquad, coachFromId, budget, sponsors, sponsorUntil, contracts, morale, peakOvr, evo, region, youth, youthAge, academy, academyFocus };
          persist(next);
          setSave(next);
          setStage('circuit');
        }}
      />
      </CareerDashFrame>
    );
  }

  // ---------- escolha do campeonato (qual convite aceitar) ----------
  if (stage === 'circuit') {
    // core do elenco mudou de região? oferece realocar a org (muda bandeira/região)
    const orgPlayers = buildTeam(save)?.players ?? [];
    const coreReg = orgPlayers.length ? macroRegionPlurality(orgPlayers.map((p) => p.country)) : undefined;
    const relocate = save.region && coreReg && coreReg !== save.region ? { from: save.region, to: coreReg } : null;
    // CONVITE: às vezes (determinístico por split) um time recebe convite pra
    // disputar o circuito UM tier acima, mesmo sem estar classificado pelo VRS.
    // Chance maior pra quem já está perto do topo da sua divisão (forte no split).
    const inviteTier = save.tier > 1 && hashStr(`invite:${save.org?.tag ?? ''}:${save.split}`) % 100 < 35 ? save.tier - 1 : null;
    return (
      <CareerDashFrame onExit={onExit} title={ct('Escolher campeonato')}>
      <CircuitPicker
        circuits={circuits}
        split={save.split}
        playerTier={save.tier}
        inviteTier={inviteTier}
        userRegion={save.region ?? null}
        relocate={relocate}
        onRelocate={() => coreReg && update({ region: coreReg })}
        onBack={() => setStage('market')}
        onPick={(c) => startSplit(save, c)}
      />
      </CareerDashFrame>
    );
  }

  const league = save.league;

  // T7.3: streak W/L do split atual (alimenta o StreakBadge no header)
  const formStreak: ('W' | 'L')[] = (() => {
    if (!league) return [];
    const out: ('W' | 'L')[] = [];
    for (const round of league.rounds) {
      for (const m of round) {
        if (!m.result || (m.a !== 'user' && m.b !== 'user')) continue;
        const userWon = (m.result.winner === 0 ? m.a : m.b) === 'user';
        out.push(userWon ? 'W' : 'L');
      }
    }
    return out;
  })();

  // ---------- resultado do Major ----------
  if (stage === 'major' && majorResult) {
    const mr = majorResult;
    // o Major fecha a temporada (sempre cai num split de Major): entrega aqui a
    // premiação do Top 20 HLTV do ano
    const seasonNo = seasonOf(save.split);
    const mySquadOidsM = new Set(save.squad.map((s) => s.playerId));
    const seasonTop3 = seasonTopPlayersYear(top20Pool, save.split, 3);
    const seasonTop20 = seasonTopPlayersYear(top20Pool, save.split, 20);
    const PLACE_PT: Record<PlacementCode, string> = {
      champion: ct('CAMPEÃO DO MAJOR'),
      runnerup: ct('VICE-CAMPEÃO'),
      semi: ct('SEMIFINAL'),
      quarters: ct('QUARTAS DE FINAL'),
      playoffs: ct('FASE DE PLAYOFFS'),
      swiss: ct('FASE SUÍÇA'),
    };
    return (
      <CareerDashFrame title={ct('Major Mundial — resultado')} onExit={onExit}>
        <div className="em-stage-page">
          <div className="em-stage-card center">
            <div className="trophy">{mr.champion ? '🏆' : mr.placement === 'runnerup' ? '🥈' : '★'}</div>
            <h2>{save.org?.name}: {PLACE_PT[mr.placement]}</h2>
            <div className="prize-banner">
              {ct('Premiação:')} <b>+{formatMoney(mr.prize)}</b> · VRS: <b>+{mr.vrs} pts</b>
              {mr.champion ? ` · ${ct('+1 título!')}` : ''}
            </div>
            <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
              {mr.champion
                ? ct('Sua organização é CAMPEÃ MUNDIAL! O nome entrou para a história do CS.')
                : ct('Sua org representou o circuito no Major mundial. Volte mais forte no próximo split.')}
            </p>
            <div className={`career-hall-status ${careerHallStatus}`}>
              {careerHallStatus === 'saving' && ct('Registrando a campanha no Hall da Fama…')}
              {careerHallStatus === 'saved' && ct('Campanha registrada no Hall da Fama com elenco, MVP e recordes.')}
              {careerHallStatus === 'error' && ct('Hall indisponível agora. O registro será tentado novamente ao reabrir este resultado.')}
            </div>

            {/* o Major encerra a temporada: aqui sai a premiação do Top 20 HLTV do ano */}
            <div className="se-awards">
              <div className="se-award">
                <div className="se-award-title">{ct('Top 3 HLTV da temporada')}</div>
                <div className="se-top3">
                  {seasonTop3.map((e, i) => {
                    const tag = mySquadOidsM.has(e.p.id) ? (save.org?.tag ?? ct('VOCÊ')) : e.team.tag;
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
              🏆 {ct('Cerimônia do Top 20 HLTV — Temporada')} {seasonNo}
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
                const morale = stabilizeMorale(nextMorale(save.morale ?? {}, squadInfo, { champion: mr.champion, objMet: true }), normalizeFacilities(save.facilities).psychologist);
                const peakOvr = { ...(save.peakOvr ?? {}) };
                for (const sg of save.squad) { const f = findSigning(sg); if (f) peakOvr[sg.playerId] = Math.max(peakOvr[sg.playerId] ?? 0, playerOvr(f.player)); }
                const items = splitNews({
                  split: save.split, org: save.org?.name ?? 'Sua org', champion: mr.champion,
                  circuit: save.circuit?.name ?? ct('circuito'), objMet: true, objText: majObj?.text,
                  tierChange: null, releases: [], offer: null,
                  risers: (evo.lastEvo ?? []).filter((e) => e.delta >= 2).map((e) => e.nick),
                  sliders: (evo.lastEvo ?? []).filter((e) => e.delta <= -2).map((e) => e.nick),
                  unhappy: squadInfo.filter((si) => (morale[si.oid] ?? MORALE_DEFAULT) < 32).map((si) => nickByOid[si.oid] ?? si.oid),
                  major: { placement: mr.placement, champion: mr.champion },
                  boardConfidence: majBoard,
                });
                // T3.5: bônus de placement dos sponsors no Major. PlacementCode é
                // 'champion'|'runnerup'|'semi'|'quarters'|'playoffs'|'swiss'.
                const majorPlacementKind =
                  mr.champion
                    ? 'major' as const
                    : mr.placement === 'runnerup' || mr.placement === 'semi'
                    ? 'top4' as const
                    : 'top8' as const;
                const sponsorMajorBonus = sponsorPlacementBonusTotal(save, save.split, majorPlacementKind);
                // T11.1/T11.4: dispara modal cinematográfico conforme resultado
                if (mr.champion) {
                  setChampionModal({
                    tournamentName: mr.tournament.name,
                    orgName: save.org?.name ?? 'Sua org',
                    tier: 'major',
                    prize: mr.prize + sponsorMajorBonus,
                    flavor: `${save.org?.name ?? 'A org'} agora é campeã mundial. O caixa fica com ${formatMoney(mr.prize + sponsorMajorBonus)} e o legado começa a ser escrito.`,
                  });
                } else {
                  setEliminationModal({
                    tournamentName: mr.tournament.name,
                    placement: mr.placement,
                    prize: mr.prize,
                  });
                }
                const sponsorTick = applySponsorSplitTick(save, save.split + 1, rngRef.current);
                const teamEventTick = applyTeamEventSplitTick(save, save.split + 1, rngRef.current);
                // T3.4: decay leve de química no fim do split (pares ociosos perdem 1)
                const decayedPairChem = decayPairChemOnSplitChange({ pairChem: save.pairChem });
                // T3.11: registra troféu de Major no stint do coach se foi campeão
                const coachStintsAfterMajor = mr.champion
                  ? appendCoachTrophy(save.coachStints ?? [], `Major ${save.split}`)
                  : (save.coachStints ?? []);
                // T3.9: aging — decline pós-peak + aposentadorias (mesmo no fechamento via Major)
                const agingPatchMajor = applyAgingTick(save, findSigning);
                // T3.12: scouting tick — salário + relatórios
                const scoutingPatchMajor = applyScoutingSplitTick(save, oppEra, rngRef.current);
                const scoutSalaryMajor = save.hiredScoutId ? (scoutById(save.hiredScoutId)?.salaryPerSplit ?? 0) : 0;
                const next = {
                  ...save,
                  budget: Math.max(0, save.budget + mr.prize - payroll - facilityUpkeep(save.facilities) - scoutSalaryMajor + effSponsorIncome(save) + majBonus + sponsorMajorBonus),
                  vrs: Math.round(save.vrs * VRS_DECAY) + mr.vrs, // VRS rolante (decai e soma o do Major)
                  titles: save.titles + (mr.champion ? 1 : 0),
                  split: save.split + 1,
                  eventInSplit: 1, // o Major fecha o split: próximo split começa na etapa 1
                  inviteAccepted: false, // convite é consumido ao fechar o split
                  pairChem: decayedPairChem,
                  coachStints: coachStintsAfterMajor,
                  scrimsThisSplit: 0, // T3.8: reset por split
                  ...sponsorTick,
                  ...teamEventTick,
                  ...agingPatchMajor,
                  ...scoutingPatchMajor,
                  majorT: null, // o Major acabou: não persiste o bracket finalizado
                  majorResult: null, // limpa o resultado reidratável (já consumido)
                  majorStage: undefined, majorUserStage: undefined,
                  majorSeed2: undefined, majorSeed3: undefined, majorPre: undefined, majorHistory: undefined,
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
                  // FIM DE TEMPORADA (pós-Major): pré-temporada longa, quase zera a
                  // fadiga — é o reset que evita a espiral de burnout em carreira longa.
                  fatigue: recoverFatigue(save.fatigue, 70, normalizeFacilities(save.facilities).psychologist * 4),
                  restingPlayers: [],
                  peakOvr,
                  mapTraining: applyMapTraining(save),
                  playbookXp: Math.min(100, (save.playbookXp ?? 0) + PLAYBOOK_FAM_GAIN),
                  ...pushNews(save, [...items, ...worldNews(oppEra, save.split, save.region ?? 'americas'), ...socialNews(oppEra, save.split, save.org?.name ?? 'Sua org', mr.champion)]),
                };
                const fin = consummateDeals(next);
                persist(fin);
                setSave(fin);
                setMajorResult(null);
                // FRENTE 1 — beats narrativos pós-Major: dispara SeasonRecap cinematográfico
                // antes de cair no mercado. Slides: posição final → MVP → finanças → próximos passos.
                const topUser = save.squad
                  .map((s) => findSigning(s))
                  .filter(Boolean)
                  .sort((a, b) => playerOvr(b!.player) - playerOvr(a!.player))[0];
                const upkeepNow = facilityUpkeep(save.facilities);
                const recap: SeasonRecapData = {
                  split: save.split,
                  circuitName: `Major · ${MAJOR_NAME(save.split)}`,
                  placementLabel: mr.champion
                    ? '1º · CAMPEÃO DO MAJOR'
                    : mr.placement === 'runnerup' ? '2º · VICE-CAMPEÃO'
                    : mr.placement === 'semi' ? 'TOP 4 · semifinal'
                    : mr.placement === 'quarters' ? 'TOP 8 · quartas'
                    : mr.placement === 'playoffs' ? 'PLAYOFFS · 1ª rodada'
                    : 'FASE SUÍÇA',
                  outcome: mr.champion
                    ? 'champion'
                    : mr.placement === 'runnerup' || mr.placement === 'semi' ? 'top4'
                    : mr.placement === 'quarters' || mr.placement === 'playoffs' ? 'mid'
                    : 'bottom',
                  trophy: mr.champion,
                  mvp: topUser
                    ? {
                        nick: topUser.player.nick,
                        name: topUser.player.name,
                        country: topUser.player.country,
                        role: topUser.player.role,
                        ovr: playerOvr(topUser.player),
                        highlight: mr.champion
                          ? ct('Levantou o time nos mapas decisivos do Major.')
                          : ct('Carregou o time na campanha mesmo sem o título.'),
                      }
                    : null,
                  finance: {
                    prize: mr.prize + (majBonus || 0),
                    sponsors: effSponsorIncome(save) + (sponsorMajorBonus || 0),
                    payroll,
                    upkeep: upkeepNow,
                    net: mr.prize + (majBonus || 0) + effSponsorIncome(save) + (sponsorMajorBonus || 0) - payroll - upkeepNow,
                    cashAfter: fin.budget,
                  },
                  nextStepHint: 'Major fechado. Próxima janela: pré-temporada longa — renovar contratos, planejar reforços e treinar mapas.',
                };
                openSeasonRecap(recap, () => setStage('market'));
              }}
            >
              Pagar folha ({formatMoney(payroll)}) e ir pro Split {save.split + 1}
            </button>
          </div>
        </div>
        {showCeremony && (
          <Top20Ceremony entries={seasonTop20} mine={mySquadOidsM} orgTag={save.org?.tag ?? 'VOCÊ'} split={save.split} circuit={save.circuit?.name ?? ct('Temporada')} onClose={() => setShowCeremony(false)} />
        )}
      </CareerDashFrame>
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
    const ev = save.eventInSplit ?? 1;
    const lastEvent = ev >= EVENTS_PER_SPLIT; // última etapa = fecha o split (offseason)
    const seasonEndsNow = isMajorSplit(save.split) && lastEvent; // a temporada (ano) só fecha no split de Major, na última etapa
    const seasonNo = seasonOf(save.split);
    const seasonTop3 = seasonTopPlayersYear(top20Pool, save.split, 3);
    const seasonTop20 = seasonTopPlayersYear(top20Pool, save.split, 20);
    const mySquadOids = new Set(save.squad.map((s) => s.playerId)); // ids do seu elenco (relabel HLTV)
    const nextFeed = feedMemo;
    // o título e as vagas no Major saem do PLAYOFF (mata-mata), não da fase de pontos
    const poRank = poUserRank(save.playoff);
    const isChampion = save.playoff?.champion === 'user';
    // bônus de mata-mata: campeão +60%, vice +25% (no prêmio e no VRS)
    const poMult = isChampion ? 1.6 : poRank === 2 ? 1.25 : 1;
    const prize = Math.round((PRIZE_BY_POS[pos - 1] ?? 4_000) * (save.circuit?.prizeMult ?? 1) * poMult);
    // ganho de VRS ponderado pelo Opponent Network do evento: ir longe num campo
    // forte vale muito; ganhar um campeonato fraco rende quase nada no mundial.
    const vrsGain = Math.round((VRS_BY_POS[pos - 1] ?? 10) * (save.circuit?.vrsWeight ?? 0.4) * poMult);
    // CLASSIFICAÇÃO AO MAJOR = TOP 16 DO RANKING VRS MUNDIAL (como na vida real).
    // Some VRS vencendo partidas e indo longe; sua posição é base do elenco + ganhos.
    // Projeta o VRS já com o ganho DESTE split pra decidir a vaga no fim da temporada.
    const userProjVrs = userBaseVrsFor(buildTeam(save)?.teamwork ?? 78) + save.vrs + vrsGain + userLegacyVrs(save);
    const worldRank = oppEra.filter((t) => aiTeamVrs(t) > userProjVrs).length + 1; // posição mundial projetada
    const rankQualified = worldRank <= MAJOR_VRS_CUT;
    const majorNow = isMajorSplit(save.split) && lastEvent; // Major só na última etapa do split de Major
    const qualified = rankQualified && majorNow;
    const nextMajorSplit = save.split + (MAJOR_EVERY - (save.split % MAJOR_EVERY));

    // promoção/rebaixamento: só conta se você jogou no SEU tier (não farmando abaixo).
    // CHEGAR NA FINAL (campeão OU vice) promove — não precisa mais SÓ vencer; bater
    // final em todo campeonato e perder pra um top não pode te travar. Fundo da tabela cai.
    const finalPos = save.playoff ? Math.min(pos, poRank) : pos;
    const circuitTier = save.circuit?.tier ?? save.tier;
    // TIER POR RANKING VRS (não só título): sua divisão segue sua posição mundial.
    // top 32 = Tier 1; 33–64 = Tier 2; 65+ = Tier 3. Sobe/cai UM degrau por split
    // rumo ao que o VRS diz. Vencer ajuda porque dá VRS — mas título sozinho, sem
    // ranking, não promove. (E só conta jogando no SEU tier — farmar abaixo nem rola.)
    const tierByVrs = worldRank <= MAJOR_VRS_CUT ? 1 : worldRank <= MAJOR_VRS_CUT * 2 ? 2 : 3;
    const tierResult: { tier: number; tierChange: 'up' | 'down' | null } = (() => {
      if (circuitTier !== save.tier) return { tier: save.tier, tierChange: null };
      if (tierByVrs < save.tier) return { tier: save.tier - 1, tierChange: 'up' };
      if (tierByVrs > save.tier) return { tier: save.tier + 1, tierChange: 'down' };
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
      <CareerDashFrame title={`${league.name} — ${lastEvent ? ct('split encerrado') : `${ct('etapa')} ${ev}/${EVENTS_PER_SPLIT} ${ct('concluída')}`}`} onExit={onExit}>
        <div className="em-stage-page">
          <div className="em-stage-card center">
            <div className="trophy">{isChampion ? '🏆' : poRank === 2 ? '🥈' : poRank === 3 ? '🥉' : pos <= 3 ? '🥉' : '★'}</div>
            <h2>
              {isChampion
                ? `${save.org?.name} ${ct('é CAMPEÃO do')} ${save.circuit?.name ?? ct('circuito')}!`
                : poRank === 2
                  ? `${save.org?.name}${ct(': vice-campeão (perdeu a final)')}`
                  : poRank === 3
                    ? `${save.org?.name} caiu na semifinal`
                    : `${save.org?.name} terminou em ${pos}º na fase de pontos`}
            </h2>
            <div className="prize-banner">
              {ct('Premiação:')} <b>+{formatMoney(prize)}</b> · VRS: <b>+{vrsGain} pts</b> · {ct('Folha:')}{' '}
              <b className="neg">-{formatMoney(payroll)}</b>
            </div>
            {!lastEvent && (
              <div className="tier-banner up">
                ✔ {ct('Etapa')} {ev}/{EVENTS_PER_SPLIT} {ct('concluída.')} {ct('Faltam')} {EVENTS_PER_SPLIT - ev} {ct('etapa(s) pra fechar o split — aí entra o offseason (mercado, evolução, renovações). Até lá, mesmo elenco.')}
              </div>
            )}
            {obj && lastEvent && (
              <div className={`tier-banner ${objMet ? 'up' : 'down'}`}>
                {objMet ? '✅' : '❌'} {ct('Objetivo da diretoria')} ({ct(obj.text)}): <b>{objMet ? ct('CUMPRIDO') : ct('falhou')}</b>
                {' · '}{ct('confiança')} {boardDelta >= 0 ? '+' : ''}{boardDelta}% → {Math.round(newBoard)}%
                {objMet && objBonus > 0 ? ` ${ct('· bônus +')}${formatMoney(objBonus)}` : ''}
                {fired ? ` · ${ct('VOCÊ FOI DEMITIDO')}` : ''}
              </div>
            )}
            {lastEvent && tierResult.tierChange === 'up' && (
              <div className="tier-banner up">⬆ {ct('PROMOVIDO ao')} {ct(TIER_NAMES[tierResult.tier])}! {ct('Você venceu no seu nível e subiu de tier.')}</div>
            )}
            {lastEvent && tierResult.tierChange === 'down' && (
              <div className="tier-banner down">⬇ {ct('Rebaixado ao')} {ct(TIER_NAMES[tierResult.tier])}. {ct('Terminou no fundo da tabela; recupere o nível no próximo split.')}</div>
            )}
            {qualified ? (
              <div className="qualify-banner">
                <b>{ct('CLASSIFICADO PRO MAJOR MUNDIAL!')}</b> {ct('Você está em')} <b>#{worldRank}</b> {ct('no ranking VRS mundial')}
                {' '}({ct('top')} {MAJOR_VRS_CUT} {ct('garantem vaga). Hora de enfrentar os melhores do mundo.')}
              </div>
            ) : rankQualified && !majorNow ? (
              <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
                {ct('Você está')} <b>{ct('dentro do top')} {MAJOR_VRS_CUT} {ct('do VRS mundial')}</b> (#{worldRank}) — {ct('vaga no Major encaminhada!')}
                {ct('O Major acontece a cada')} <b>{MAJOR_EVERY} splits</b>{ct('; o próximo é no fim do')} <b>Split {nextMajorSplit}</b>. {ct('Mantenha o nível.')}
              </p>
            ) : (
              <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
                {ct('A vaga no Major é dos')} <b>{ct('top')} {MAJOR_VRS_CUT} {ct('do ranking VRS mundial')}</b> {ct('(você está em')} <b>#{worldRank}</b>).
                {ct('Ganhe VRS')} <b>{ct('vencendo partidas, indo longe e levando campeonatos')}</b> {ct('pra subir no ranking.')} {ct('Major a cada')} {MAJOR_EVERY} {ct('splits (próximo: Split')} {majorNow ? save.split : nextMajorSplit}).
              </p>
            )}
            {save.playoff && <PlayoffBracket p={save.playoff} teamOf={(id) => leagueTeam(league, id)} onOpen={(s, ts) => setSelSeries({ series: s, teams: ts })} />}

            {/* premiações e destaques da temporada */}
            <div className="se-awards">
              {circuitMvp && (
                <div className="se-award">
                  <div className="se-award-title">{ct('MVP do circuito')}</div>
                  <PlayerAvatar nick={circuitMvp.nick} size={40} />
                  <div className="se-award-name"><Flag cc={circuitMvp.country} /> {circuitMvp.nick}</div>
                  <div className="muted small">{circuitMvp.teamTag} · rating {circuitMvp.rating.toFixed(2)}</div>
                </div>
              )}
              {myStar && (
                <div className="se-award">
                  <div className="se-award-title">{ct('Destaque do seu time')}</div>
                  <PlayerAvatar nick={myStar.nick} size={40} />
                  <div className="se-award-name"><Flag cc={myStar.country} /> {myStar.nick}</div>
                  <div className="muted small">rating {myStar.rating.toFixed(2)} · {myStar.kd.toFixed(2)} K/D</div>
                </div>
              )}
              {seasonEndsNow && (
                <div className="se-award">
                  <div className="se-award-title">{ct('Top 3 HLTV da temporada')}</div>
                  <div className="se-top3">
                    {seasonTop3.map((e, i) => {
                      const tag = mySquadOids.has(e.p.id) ? (save.org?.tag ?? ct('VOCÊ')) : e.team.tag;
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
                🏆 {ct('Cerimônia do Top 20 HLTV — Temporada')} {seasonNo}
              </button>
            ) : (
              <div className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
                🏆 {ct('A')} <b>{ct('Premiação do Top 20 HLTV')}</b> {ct('fecha a temporada (a cada')} {MAJOR_EVERY} {ct('campeonatos) —')}
                {ct('a próxima é no')} <b>Split {nextMajorSplit}</b>. {ct('Ainda não acabou a temporada.')}
              </div>
            )}

            {/* prévia da próxima janela de transferências */}
            <div className="muted small section-label">{ct('Rumores para a próxima janela')}</div>
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
                  {ct('Disputar o Major Mundial')}
                </button>
              )}
              <button
                className={qualified ? 'btn ghost big' : 'btn gold big'}
                onClick={() => {
                  // ETAPA INTERMEDIÁRIA: não fecha o split. Bota o prêmio/VRS no
                  // bolso (VRS sem decair, folha só no offseason), registra o
                  // campeonato e vai pro próximo — MESMO elenco, sem mercado/idade.
                  if (!lastEvent) {
                    const nextEv = {
                      ...save,
                      budget: save.budget + prize,
                      // VRS é POR JOGO: decai e soma o ganho a cada campeonato
                      // (independente do envelhecimento, que é por split).
                      vrs: Math.round(save.vrs * VRS_DECAY) + vrsGain,
                      titles: save.titles + (isChampion ? 1 : 0),
                      eventInSplit: ev + 1,
                      league: null,
                      circuit: null,
                      playoff: null,
                      history: [...save.history, baseRecord()],
                      ...bankStats(save),
                      // folga curta entre etapas: compensa ~um campeonato jogado
                      fatigue: recoverFatigue(save.fatigue, 16, normalizeFacilities(save.facilities).psychologist * 2),
                      restingPlayers: [],
                    };
                    persist(nextEv);
                    setSave(nextEv);
                    setStage('circuit'); // escolhe o próximo campeonato da etapa
                    return;
                  }
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
                  const morale = stabilizeMorale(nextMorale(save.morale ?? {}, squadInfo, { champion: isChampion, objMet }), normalizeFacilities(save.facilities).psychologist);
                  const peakOvr = { ...(save.peakOvr ?? {}) };
                  for (const sg of save.squad) { const f = findSigning(sg); if (f) peakOvr[sg.playerId] = Math.max(peakOvr[sg.playerId] ?? 0, playerOvr(f.player)); }
                  const items = splitNews({
                    split: save.split, org: save.org?.name ?? 'Sua org', champion: isChampion,
                    circuit: save.circuit?.name ?? ct('circuito'), objMet, objText: obj?.text,
                    tierChange: tierResult.tierChange, tierName: TIER_NAMES[tierResult.tier],
                    releases: [], offer,
                    risers: (evo.lastEvo ?? []).filter((e) => e.delta >= 2).map((e) => e.nick),
                    sliders: (evo.lastEvo ?? []).filter((e) => e.delta <= -2).map((e) => e.nick),
                    unhappy: squadInfo.filter((si) => (morale[si.oid] ?? MORALE_DEFAULT) < 32).map((si) => nickByOid[si.oid] ?? si.oid),
                    boardConfidence: newBoard,
                  });
                  // T3.5: bônus de placement do circuito + tick de sponsors.
                  // Usa a mesma lógica de posição que vai pro SplitRecord
                  // (save.playoff? min(pos,poRank) : pos).
                  const finalPosForSponsors = save.playoff ? Math.min(pos, poRank) : pos;
                  const circuitPlacementKind: 'title' | 'top4' | 'top8' = isChampion
                    ? 'title'
                    : finalPosForSponsors <= 4
                    ? 'top4'
                    : 'top8';
                  const sponsorCircuitBonus = sponsorPlacementBonusTotal(save, save.split, circuitPlacementKind);
                  // T11.1: champion modal cinematográfico se ganhou o circuito.
                  // (Eliminação em circuito é trivial e não vale modal — só Major)
                  if (isChampion) {
                    setChampionModal({
                      tournamentName: save.circuit?.name ?? 'Circuito',
                      orgName: save.org?.name ?? 'Sua org',
                      tier: 'circuit',
                      prize: prize + sponsorCircuitBonus,
                    });
                  }
                  const sponsorTick = applySponsorSplitTick(save, save.split + 1, rngRef.current);
                  const teamEventTick = applyTeamEventSplitTick(save, save.split + 1, rngRef.current);
                  // T3.4: decay leve de química no fim do split
                  const decayedPairChem = decayPairChemOnSplitChange({ pairChem: save.pairChem });
                  // T3.11: registra troféu de circuito no stint do coach se foi campeão
                  const coachStintsAfterCircuit = isChampion
                    ? appendCoachTrophy(save.coachStints ?? [], `${save.circuit?.name ?? 'Circuito'} S${save.split}`)
                    : (save.coachStints ?? []);
                  // T3.9: aging — decline pós-peak + aposentadorias
                  const agingPatch = applyAgingTick(save, findSigning);
                  // T3.12: scouting tick — salário + relatórios
                  const scoutingPatch = applyScoutingSplitTick(save, oppEra, rngRef.current);
                  const scoutSalary = save.hiredScoutId ? (scoutById(save.hiredScoutId)?.salaryPerSplit ?? 0) : 0;
                  const next = {
                    ...save,
                    // piso em 0: estourar a folha esvazia o caixa, mas nunca trava
                    // a carreira com saldo negativo (impossível montar 5)
                    budget: Math.max(0, save.budget + prize - payroll - facilityUpkeep(save.facilities) - scoutSalary + effSponsorIncome(save) + objBonus + sponsorCircuitBonus),
                    vrs: Math.round(save.vrs * VRS_DECAY) + vrsGain, // VRS rolante (decai e soma o ganho do split)
                    titles: save.titles + (isChampion ? 1 : 0),
                    split: save.split + 1,
                    eventInSplit: 1, // fecha o split: volta pra etapa 1 do próximo
                    inviteAccepted: false, // convite é consumido ao fechar o split
                    pairChem: decayedPairChem,
                    coachStints: coachStintsAfterCircuit,
                    scrimsThisSplit: 0, // T3.8: reset por split
                    ...sponsorTick,
                    ...teamEventTick,
                    ...agingPatch,
                    ...scoutingPatch,
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
                    // offseason de split (não-Major): descanso de verdade entre splits
                    fatigue: recoverFatigue(save.fatigue, 40, normalizeFacilities(save.facilities).psychologist * 3),
                    restingPlayers: [],
                    peakOvr,
                    mapTraining: applyMapTraining(save),
                    playbookXp: Math.min(100, (save.playbookXp ?? 0) + PLAYBOOK_FAM_GAIN),
                    ...pushNews(save, [...items, ...worldNews(oppEra, save.split, save.region ?? 'americas'), ...socialNews(oppEra, save.split, save.org?.name ?? 'Sua org', isChampion)]),
                  };
                  const fin = consummateDeals(next);
                  persist(fin);
                  setSave(fin);
                  // FRENTE 1 — recap cinematográfico só no FIM do split (não em etapas
                  // intermediárias). Dispara SeasonRecap antes do mercado pra dar peso.
                  if (lastEvent && !save.fired) {
                    const topUser = save.squad
                      .map((s) => findSigning(s))
                      .filter(Boolean)
                      .sort((a, b) => playerOvr(b!.player) - playerOvr(a!.player))[0];
                    const upkeepNow = facilityUpkeep(save.facilities);
                    const sponsorsNow = effSponsorIncome(save) + (sponsorCircuitBonus || 0);
                    const totalIn = prize + sponsorsNow + (objBonus || 0);
                    const recap: SeasonRecapData = {
                      split: save.split,
                      circuitName: save.circuit?.name ?? 'Circuito',
                      placementLabel: isChampion
                        ? `1º · CAMPEÃO`
                        : finalPosForSponsors <= 4
                        ? `${finalPosForSponsors}º · TOP 4`
                        : finalPosForSponsors <= 8
                        ? `${finalPosForSponsors}º · TOP 8`
                        : `${finalPosForSponsors}º`,
                      outcome: isChampion ? 'champion' : finalPosForSponsors <= 4 ? 'top4' : finalPosForSponsors <= 8 ? 'mid' : 'bottom',
                      trophy: isChampion,
                      mvp: topUser
                        ? {
                            nick: topUser.player.nick,
                            name: topUser.player.name,
                            country: topUser.player.country,
                            role: topUser.player.role,
                            ovr: playerOvr(topUser.player),
                            highlight: isChampion
                              ? ct('Carregou o time pro troféu do split.')
                              : finalPosForSponsors <= 4
                              ? ct('Foi o destaque na campanha que terminou no TOP 4.')
                              : ct('Manteve o nível mesmo num split difícil.'),
                          }
                        : null,
                      finance: {
                        prize,
                        sponsors: sponsorsNow,
                        payroll,
                        upkeep: upkeepNow,
                        net: totalIn - payroll - upkeepNow,
                        cashAfter: fin.budget,
                      },
                      nextStepHint: ct('Pagou a folha. Próxima janela: renovar contratos vencidos, contratar reforços e treinar mapas.'),
                    };
                    openSeasonRecap(recap, () => setStage('market'));
                  } else {
                    setStage('market'); // etapa intermediária OU demitido: vai direto
                  }
                }}
              >
                {lastEvent
                  ? `Fechar Split ${save.split} · pagar folha e abrir o mercado`
                  : `Próxima etapa (Etapa ${ev + 1}/${EVENTS_PER_SPLIT}) →`}
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
          <Top20Ceremony entries={seasonTop20} mine={new Set(save.squad.map((s) => s.playerId))} orgTag={save.org?.tag ?? ct('VOCÊ')} split={save.split} circuit={save.circuit?.name ?? ct('temporada')} onClose={() => setShowCeremony(false)} />
        )}
      </CareerDashFrame>
    );
  }

  // ---------- veto / partida (liga OU Major, ao vivo) ----------
  if ((stage === 'veto' || stage === 'match') && matchCtx) {
    const finish = (series: SeriesResult) => {
      if (matchCtx.mode === 'major') finishMajorRound(series);
      else if (matchCtx.mode === 'playoff') finishPlayoffRound(series, matchCtx.playoffIds);
      else if (league) finishUserRound(league, series);
      recordCareerMatch(series, matchCtx.teams, matchCtx.userIdx, matchCtx.phaseLabel);
      // T3.4: chemistry sobe entre os starters do user team após série.
      // Convertemos runtime ids pra org-ids (playerOrgId) pra bater com o
      // pairChem que é indexado pelo id ORIGINAL.
      const userStarters = matchCtx.teams[matchCtx.userIdx].players.map((p) => playerOrgId(p.id));
      const won = series.winner === matchCtx.userIdx;
      // T3.2: passa personalityChemBonus pra que líderes puxem química mais
      // rápido e hotheads/mercenários atrapalhem.
      const newPairChem = tickPairChemAfterMatch(
        { pairChem: save.pairChem },
        userStarters,
        won,
        personalityChemBonus,
      );
      setSave((s) => {
        const next = { ...s, pairChem: newPairChem };
        persist(next);
        return next;
      });
    };
    // TRAVA o resultado assim que a série é decidida (antes do "Continuar"). Sem isso,
    // sair da carreira na tela de resultado deixava re-rolar a partida ao reentrar.
    const commitDecided = (series: SeriesResult) => {
      if (matchCtx.mode === 'playoff') {
        if (!save.playoff || !save.league) return;
        const clone: Playoff = structuredClone(save.playoff);
        const m = poFindMatch(clone, matchCtx.playoffIds);
        if (!m) return;
        m.result = series;
        poRunAI(clone, (id) => leagueTeam(save.league!, id), rngRef.current);
        const next = { ...save, playoff: clone };
        persist(next); setSave(next);
      } else if (matchCtx.mode !== 'major' && league) {
        const clone: League = structuredClone(league);
        const m = userLeagueMatch(clone);
        if (!m) return;
        m.result = series;
        const next = { ...save, league: clone };
        persist(next); setSave(next);
      }
    };
    if (stage === 'veto') {
      const teamA = matchCtx.teams[0];
      const teamB = matchCtx.teams[1];
      return (
        <CareerDashFrame title={`${teamA.tag} vs ${teamB.tag} · ${matchCtx.phaseLabel}`} onExit={onExit}>
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
        </CareerDashFrame>
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
        onDecided={commitDecided}
      />
    );
  }

  // ---------- playoffs do circuito (mata-mata com bracket) ----------
  if (stage === 'playoffHub' && save.playoff && league) {
    const p = save.playoff;
    const teamOf = (id: string) => leagueTeam(league, id);
    const userMatch = poUserMatch(p);
    const userRoundLabel = !userMatch ? '' : p.final === userMatch ? ct('a final') : (p.qf?.includes(userMatch) ? ct('minha quarta') : ct('minha semi'));
    return (
      <CareerDashFrame title={`Playoffs · ${p.circuit} · Split ${save.split}`} onExit={onExit}>
        <DashCard title={`${ct('Playoffs')} · ${p.circuit}`} actions={
          <span className="em-action-row">
            {userMatch ? (
              <>
                <button type="button" className="em-btn em-btn-ghost" onClick={simPlayoffMine}>⏩ {ct('Simular')}</button>
                <button type="button" className="em-btn em-btn-primary" onClick={playPlayoffMine}>▶ {ct('Jogar')} {userRoundLabel}</button>
              </>
            ) : p.champion ? (
              <button type="button" className="em-btn em-btn-primary" onClick={() => setStage('seasonEnd')}>{ct('Ver resultado do split →')}</button>
            ) : null}
          </span>
        }>
          <PlayoffBracket p={p} teamOf={teamOf} onOpen={(s, ts) => setSelSeries({ series: s, teams: ts })} />
        </DashCard>
        {selSeries && (
          <div className="modal-backdrop" onClick={() => setSelSeries(null)}>
            <div className="modal scoreboard-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-x" onClick={() => setSelSeries(null)}>✕</button>
              <Scoreboard series={selSeries.series} teams={selSeries.teams} />
            </div>
          </div>
        )}
      </CareerDashFrame>
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
    const pair = prepareTeams(leagueTeam(league, myMatch.a), leagueTeam(league, myMatch.b));
    if (!pair) {
      // save com referência morta a um team que não está em league.teams.
      // Sem dado pra jogar — não trava o jogo, só avisa no console.
      console.warn('playMine: time do match não encontrado em league.teams', { a: myMatch.a, b: myMatch.b });
      return;
    }
    const [a, b] = pair;
    setMatchCtx({
      teams: [a, b],
      userIdx: myMatch.a === 'user' ? 0 : 1,
      mode: 'league',
      bestOf: myMatch.bo ?? LEAGUE_BO, // GSL: abertura Bo1, resto Bo3
      phaseLabel: `${league.name} · ${league.gsl ? ct(GSL_ROUND_LABELS[league.current]) : `${ct('Rodada')} ${league.current + 1}`}`,
    });
    setStage('veto');
  };

  const myPos = userPosition(league);
  const spots = save.circuit?.spots ?? MAJOR_SPOTS;
  const opp = myMatch ? leagueTeam(league, myMatch.a === 'user' ? myMatch.b : myMatch.a) : null;
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
    overview: ct('Visão geral'), major: 'Major', calendar: ct('Calendário'), results: ct('Resultados'),
    standings: ct('Classificação'), bracket: ct('Chave'), squad: ct('Elenco'), academy: ct('Academia'),
    market: ct('Negociações'), finance: ct('Finanças'), vrs: ct('Ranking VRS'), top20: 'Top 20 HLTV',
    world: ct('Cena mundial'), inbox: ct('Tarefas'), history: ct('História da org'),
  };
  const HUB_GROUPS: { id: string; label: string; tabs: HubTab[] }[] = [
    { id: 'dashboard', label: 'Dashboard', tabs: ['overview', 'inbox'] },
    { id: 'team', label: ct('Meu time'), tabs: ['squad', 'academy'] },
    { id: 'ingame', label: ct('Em jogo'), tabs: [...(majorActive ? ['major' as HubTab] : []), 'bracket', 'results', 'standings'] },
    { id: 'transfers', label: ct('Transferências'), tabs: ['market', 'finance'] },
    { id: 'news', label: ct('Notícias HLTV'), tabs: ['inbox'] },
    { id: 'stats', label: ct('Estatísticas'), tabs: ['vrs', 'top20', 'world', 'history'] },
  ];
  const tabAlert = (id: HubTab) => (id === 'finance' && expiringCount > 0) || (id === 'inbox' && unread > 0);
  const tabLabelFull = (id: HubTab) =>
    id === 'inbox' && unread > 0 ? `${ct('Tarefas')} (${unread})`
    : id === 'finance' && expiringCount > 0 ? `${ct('Finanças')} (${expiringCount})`
    : TAB_LABEL[id];
  const activeGroup = HUB_GROUPS.find((g) => g.tabs.includes(hubTab)) ?? HUB_GROUPS[0];

  const vrsByRegion = vrsByRegionMemo;
  const vrsAll = vrsAllMemo;
  const myVrsRank = vrsAll.findIndex((t) => t.isUser) + 1; // posição global (0 = sem time)

  const top20 = top20Memo;
  const careerTop20 = careerTop20Memo;

  // recomeçar a carreira do zero (disponível pra TODOS, inclusive grátis)
  const resetCareer = () => {
    askConfirm({
      title: ct('Resetar carreira'),
      message: ct('Isso apaga todo o seu progresso (org, elenco, títulos, dinheiro). Não dá pra desfazer.'),
      confirmLabel: ct('Resetar e começar do zero'),
      danger: true,
      onConfirm: () => {
        wipeActiveSlot();
        const fresh = emptySave();
        persist(fresh);
        setSave(fresh);
        setOrgChoice('select');
        setStage('found');
      },
    });
  };

  const userVrs = vrsAll.find((t) => t.isUser)?.vrs ?? save.vrs ?? 0;
  const dateLabel = `Split ${save.split} · ${save.circuit?.name?.split(' ').slice(0, 2).join(' ') ?? '2026'}`;

  const resolvePlayerById = (id: string): Player | null => {
    const baseId = playerOrgId(id);
    for (const sig of save.squad) {
      const f = findSigning(sig);
      if (f && (f.player.id === baseId || sig.playerId === baseId)) {
        return { ...f.player, id: playerRuntimeId(f.player.id) };
      }
    }
    const fromSave =
      save.youth?.[baseId] ??
      save.academy?.find((a) => a.id === baseId) ??
      save.academyTeam?.find((a) => a.id === baseId);
    if (fromSave) return fromSave;
    if (save.league) {
      for (const t of save.league.teams) {
        for (const p of t.players) {
          if (p.id === baseId || p.sourcePlayerId === baseId || p.id === id) {
            return {
              id: p.sourcePlayerId ?? p.id,
              nick: p.nick,
              name: p.name,
              country: p.country,
              role: p.role,
              role2: p.role2,
              aim: p.aim,
              clutch: p.clutch,
              consistency: p.consistency,
              awp: p.awp,
              igl: p.igl,
            };
          }
        }
      }
    }
    for (const t of oppEra) {
      const p = t.players.find((pl) => pl.id === baseId);
      if (p) return p;
    }
    return null;
  };

  const resolveTeamById = (id: string): TTeam | null => {
    if (save.league) {
      const lt = save.league.teams.find((t) => t.id === id);
      if (lt) return lt;
    }
    if (id === 'user') {
      const ut = buildTeam(save);
      if (!ut) return null;
      const synced = syncUser({ ...ut, id: 'user', isUser: true });
      if (save.league) {
        const lt = save.league.teams.find((t) => t.id === 'user');
        if (lt) return { ...synced, wins: lt.wins, losses: lt.losses, roundDiff: lt.roundDiff, status: lt.status };
      }
      return synced;
    }
    const ts = oppEra.find((t) => t.id === id);
    if (ts) return teamSeasonToTTeam(ts);
    return null;
  };

  const personalityUi: Record<PlayerPersonality, { label: string; desc: string }> = {
    leader: { label: ct('Líder nato'), desc: ct('Segura o vestiário sob pressão e perde menos moral em fases ruins.') },
    mercenary: { label: ct('Ambicioso'), desc: ct('Valoriza contratos e oportunidades; atrai mais propostas de organizações maiores.') },
    prodigy: { label: ct('Prodígio'), desc: ct('Pode se desenvolver mais rápido enquanto ainda é jovem.') },
    hothead: { label: ct('Cabeça-quente'), desc: ct('Oscila mais com resultados e acumula carga com maior facilidade.') },
    resilient: { label: ct('Resiliente'), desc: ct('Recupera-se melhor da pressão e acumula menos fadiga.') },
  };

  return (
    <>
    <CareerShell
      groups={HUB_GROUPS}
      activeGroupId={activeGroup.id}
      activeTab={hubTab}
      tabLabel={(id) => tabLabelFull(id as HubTab)}
      tabAlert={(id) => tabAlert(id as HubTab)}
      onGroupChange={(_gid, tab) => { setHubTab(tab as HubTab); setSelSeries(null); }}
      onTabChange={(id) => {
        setHubTab(id as HubTab);
        setSelSeries(null);
        if (id === 'inbox' && (save.unread ?? 0) > 0) update({ unread: 0 });
      }}
      orgTag={save.org?.tag ?? ''}
      orgColors={save.org?.colors ?? ['#101820', '#3a3a3a']}
      orgLogo={save.org?.logo}
      onExit={onExit}
      onReset={resetCareer}
      onContinue={myMatch ? playMine : undefined}
      dateLabel={dateLabel}
      showOnboarding={() => setShowOnb(true)}
      onSearch={() => setHubTab('squad')}
      onBeforeNav={closeCareerOverlays}
      onHistoryBack={careerHistoryBack}
      onHistoryForward={careerHistoryForward}
      canGoBack={canNavBack}
      budgetLabel={formatMoney(save.budget)}
      unreadCount={save.unread ?? 0}
      onOpenInbox={() => {
        setHubTab('inbox');
        setSelSeries(null);
        if ((save.unread ?? 0) > 0) update({ unread: 0 });
      }}
      onHowToPlay={openHowToPlay}
      onOpenLogoBuilder={save.org ? () => {
        // T7.2: abre o LogoBuilder pré-povoado com cores e tag da org atual.
        // Ao salvar, persiste no save.org.logo (data URL SVG).
        const orgNow = save.org!;
        openLogoBuilder({
          initial: {
            primary: orgNow.colors[0],
            secondary: orgNow.colors[1],
            initials: orgNow.tag,
          },
          onSave: (dataUrl) => {
            update({ org: { ...orgNow, logo: dataUrl } });
          },
        });
      } : undefined}
      onOpenLockerRoom={(() => {
        // T10.2: só plugamos o handler se de fato existe próxima partida não-jogada
        // do user no split atual. Sem ela, o botão nem aparece (CareerShell omite
        // o ícone quando o prop é undefined).
        if (!league) return undefined;
        let nextMatch: { oppKey: string; mapIdx: number } | null = null;
        outer: for (const round of league.rounds) {
          for (const m of round) {
            if (m.result) continue;
            if (m.a === 'user' || m.b === 'user') {
              const oppKey = m.a === 'user' ? m.b : m.a;
              nextMatch = { oppKey, mapIdx: 0 };
              break outer;
            }
          }
        }
        if (!nextMatch) return undefined;
        const opp = oppEra.find((t) => t.id === nextMatch!.oppKey);
        if (!opp) return undefined;
        const oppOvr = Math.round(opp.players.reduce((s, p) => s + playerOvr(p), 0) / opp.players.length);
        const lineup = save.squad.map((sig) => findSigning(sig)?.player).filter(Boolean) as Player[];
        const PLAN_LABELS: Record<string, string> = {
          disciplined: 'Disciplinado',
          antistrat: 'Antistrat',
          mapfocus: 'Foco de mapa',
          aggressive: 'Agressivo',
        };
        // Briefing curto derivado do scout do oponente
        const mapPickFav = Object.entries(opp.mapPrefs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Mirage';
        const briefing = `${opp.tag} chega com ${opp.coach.nick} no banco e ${oppOvr} OVR médio. O grupo prefere ${mapPickFav} no mapa-jogo, então prepara um veto agressivo. Manter o foco do playbook é fundamental pra não dar espaço de leitura pro coach deles.`;
        return () => {
          openLockerRoom({
            lineup,
            morale: save.morale ?? {},
            opponent: { tag: opp.tag, name: opp.team, ovr: oppOvr },
            gamePlan: PLAN_LABELS[save.gamePlan ?? 'disciplined'] ?? 'Disciplinado',
            briefing,
            mapName: mapPickFav,
          });
        };
      })()}
      onOpenInfrastructure={() => {
        // T10.1: abre modal de infraestrutura. Handler `onUpgrade` debita custo
        // e aplica o nível. Reusa engine `facilityUpgradeCost` + `normalizeFacilities`.
        const openWithCurrent = () => {
          const cur = (useGame.getState().save ?? loadSave()) as CareerSave;
          openInfrastructure({
            facilities: normalizeFacilities(cur.facilities),
            budget: cur.budget,
            onUpgrade: (key) => {
              const facilities = normalizeFacilities(cur.facilities);
              const level = facilities[key];
              const cost = facilityUpgradeCost(key, level);
              if (!cost || cur.budget < cost) return;
              update({
                budget: cur.budget - cost,
                facilities: { ...facilities, [key]: level + 1 },
              });
              // Re-abre com state atualizado pro modal refletir o upgrade na hora
              setTimeout(openWithCurrent, 0);
            },
          });
        };
        openWithCurrent();
      }}
      onOpenMeta={() => {
        // T9.2: monta agregados on-demand. top20 já é memo do CareerScreen;
        // worldScene roda em cima de oppEra; mapPicks deriva do league.rounds.
        const scene = worldScene(oppEra, save.split);
        const orgAg = aggregateHistory(save.history);
        const mapCounts = new Map<MapId, number>();
        for (const round of league?.rounds ?? []) {
          for (const m of round) {
            if (!m.result) continue;
            for (const mp of m.result.maps) {
              mapCounts.set(mp.map, (mapCounts.get(mp.map) ?? 0) + 1);
            }
          }
        }
        openMeta({
          topPlayers: top20.map((e) => ({ nick: e.p.nick, country: e.p.country, role: e.p.role })),
          regionChamps: scene.map((s) => ({
            reg: s.reg,
            champTag: s.champ.tag,
            champName: s.champ.team,
            champColors: s.champ.colors,
          })),
          mapPicks: Array.from(mapCounts.entries()).map(([map, count]) => ({ map, count })),
          userTrophies: { circuits: orgAg.circuitTitles, majors: orgAg.majorTitles },
          currentSplit: save.split,
        });
      }}
      formStreak={formStreak}
    >
      {playerRouteId && (() => {
        const p = resolvePlayerById(playerRouteId);
        if (!p) {
          return (
            <div className="pp-not-found">
              <p>{ct('Jogador não encontrado.')}</p>
              <button type="button" onClick={closePlayerProfile}>{ct('Voltar')}</button>
            </div>
          );
        }
        const rid = playerRuntimeId(p.id);
        const oid = playerOrgId(p.id);
        const age = effectiveAge(p, save.split, save.youthAge);
        const pot = playerPotentialOvr(p, age);
        const tier = potentialTier(pot);
        const phase = playerPhase(oid, age);
        const ovr = playerOvr(p);
        const personality = playerPersonality(oid);
        const mi = moraleInfo(save.morale?.[oid] ?? MORALE_DEFAULT);
        const contractUntil = save.contracts?.[oid];
        const left = contractUntil != null ? contractUntil - save.split + 1 : null;
        const contractLeft = left == null ? '—' : left <= 0 ? ct('vencido') : `${left} split${left > 1 ? 's' : ''}`;
        const developmentProgress = Math.max(0, Math.min(100, Math.round((ovr - 40) / Math.max(1, pot - 40) * 100)));
        const cur = seasonStatsMemo.find((s) => s.id === rid || s.id === oid || s.nick === p.nick);
        const playerTeam = (() => {
          if (save.league) {
            const lt = save.league.teams.find((t) => t.players.some((pl) => (pl.sourcePlayerId ?? pl.id) === oid || pl.id === oid));
            if (lt) return { name: lt.name, tag: lt.tag, colors: lt.colors, logo: lt.logoUrl };
          }
          const ts = oppEra.find((t) => t.players.some((pl) => pl.id === oid));
          if (ts) return { name: ts.team, tag: ts.tag, colors: ts.colors, logo: ts.logoUrl ?? logoForTeam(ts) };
          return null;
        })();
        const displayOrg = playerTeam ?? (save.org ? { name: save.org.name, tag: save.org.tag, colors: save.org.colors, logo: save.org.logo } : null);
        return (
          <CareerPlayerPage
            player={{ ...p, id: rid }}
            orgName={displayOrg?.name ?? ''}
            orgTag={displayOrg?.tag}
            orgColors={displayOrg?.colors}
            orgLogo={displayOrg?.logo}
            split={save.split}
            age={age}
            pot={pot}
            potTier={tier}
            phaseLabel={ct(PHASE_LABEL[phase])}
            ovr={ovr}
            peakOvr={Math.max(save.peakOvr?.[oid] ?? 0, ovr)}
            personalityLabel={personalityUi[personality].label}
            personalityDesc={personalityUi[personality].desc}
            morale={save.morale?.[oid] ?? MORALE_DEFAULT}
            moraleLabel={mi.label}
            moraleIcon={mi.icon}
            fatigue={save.fatigue?.[oid] ?? 0}
            valueLabel={formatMoney(playerValue({ ...p, ovr }))}
            wageLabel={formatMoney(playerWage(p))}
            contractLeft={contractLeft}
            evoTotal={save.evo?.[oid] ?? 0}
            developmentProgress={developmentProgress}
            focused={save.trainingFocus === oid}
            reducedLoad={save.restingPlayers?.includes(oid) ?? false}
            trainingLevel={normalizeFacilities(save.facilities).training}
            career={deriveCareer(save.careerStats?.[rid])}
            cur={cur}
            seasonGames={cur?.maps ?? 0}
            seasonWins={0}
            titles={save.titles ?? 0}
            onToggleFocus={() => update({ trainingFocus: save.trainingFocus === oid ? null : oid })}
            onToggleRest={() => update({
              restingPlayers: save.restingPlayers?.includes(oid)
                ? (save.restingPlayers ?? []).filter((pid) => pid !== oid)
                : (save.restingPlayers?.length ?? 0) < 2 ? [...(save.restingPlayers ?? []), oid] : save.restingPlayers,
            })}
            onBack={closePlayerProfile}
            onTalk={
              // só permite "Conversar" pra player do squad próprio
              save.squad.some((sig) => sig.playerId === oid)
                ? () => setTalkPlayer({ oid, nick: p.nick, age })
                : undefined
            }
            retired={(save.retired ?? []).includes(oid)}
            attributes={playerAttributes({
              id: oid,
              aim: p.aim,
              clutch: p.clutch,
              consistency: p.consistency,
              awp: p.awp,
              igl: p.igl,
              role: (save.roles?.[oid] ?? p.role) as Role,
            })}
          />
        );
      })()}
      {!playerRouteId && teamRouteId && (() => {
        const team = resolveTeamById(teamRouteId);
        if (!team) {
          return (
            <div className="tp-not-found">
              <p>{ct('Time não encontrado.')}</p>
              <button type="button" onClick={closeTeamProfile}>{ct('Voltar')}</button>
            </div>
          );
        }
        const isUserTeam = team.id === 'user' || team.isUser;
        const vrsRank = vrsAll.findIndex((t) => t.id === team.id) + 1;
        const vrsPoints = vrsAll.find((t) => t.id === team.id)?.vrs ?? 0;
        const teamPotentialMap: Record<string, number> = {};
        const teamAges: Record<string, number> = {};
        for (const p of team.players) {
          const pid = p.sourcePlayerId ?? p.id;
          const pl: Player = {
            id: pid, nick: p.nick, name: p.name, country: p.country, role: p.role, role2: p.role2,
            aim: p.aim, clutch: p.clutch, consistency: p.consistency, awp: p.awp, igl: p.igl,
          };
          const age = effectiveAge(pl, save.split, save.youthAge);
          teamAges[pid] = age;
          teamPotentialMap[pid] = playerPotentialOvr(pl, age);
        }
        return (
          <CareerTeamPage
            team={team}
            league={save.league}
            vrsRank={vrsRank}
            vrsPoints={vrsPoints}
            isUserTeam={isUserTeam}
            budgetLabel={isUserTeam ? formatMoney(save.budget) : undefined}
            wageLabel={isUserTeam ? formatMoney(payroll) : undefined}
            titles={isUserTeam ? (save.titles ?? 0) : 0}
            split={save.split}
            contracts={save.contracts ?? {}}
            potentialMap={teamPotentialMap}
            ages={teamAges}
            onBack={closeTeamProfile}
            onOpenPlayer={openPlayerProfile}
          />
        );
      })()}
      {!playerRouteId && !teamRouteId && (
      <>
      {/* ===== INBOX (manchetes da imprensa + diretoria) ===== */}
      {/* T1.4: aba Inbox extraída em src/pages/career/InboxTab.tsx */}
      {hubTab === 'inbox' && (
        <InboxTab
          news={save.news ?? []}
          newsCat={newsCat}
          setNewsCat={setNewsCat}
          unread={save.unread ?? 0}
          onMarkAllRead={() => update({ unread: 0 })}
        />
      )}

      {/* ===== VISÃO GERAL (dashboard estilo análise pós-partida) ===== */}
      {/* T1.4: aba Overview extraída em src/pages/career/OverviewTab.tsx */}
      {hubTab === 'overview' && (
        <OverviewTab
          save={save as unknown as Parameters<typeof OverviewTab>[0]['save']}
          league={league}
          opp={opp}
          myMatch={myMatch}
          findSigning={findSigning}
          seasonStats={seasonStats}
          myVrsRank={myVrsRank}
          userVrs={userVrs}
          vrsAll={vrsAll}
          expiringCount={expiringCount}
          playMine={playMine}
          simMine={simMine}
          simWholeSplit={simWholeSplit}
          setHubTab={setHubTab as unknown as (t: string) => void}
          openTeamProfile={openTeamProfile}
          openPlayerProfile={openPlayerProfile}
          update={update as unknown as Parameters<typeof OverviewTab>[0]['update']}
          buildTeam={buildTeam as unknown as Parameters<typeof OverviewTab>[0]['buildTeam']}
        />
      )}

      {/* ===== MAJOR AO VIVO (dentro do hub) ===== */}
      {/* T1.4: aba Major extraída em src/pages/career/MajorTab.tsx */}
      {hubTab === 'major' && majorT && (
        <MajorTab
          majorT={majorT}
          save={save}
          playMajorMine={playMajorMine}
          simMajorRound={simMajorRound}
          setSelSeries={setSelSeries}
        />
      )}

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
      {/* T1.4: abas Results e Standings extraídas em src/pages/career/ */}
      {hubTab === 'results' && (
        <ResultsTab league={league} setSelSeries={setSelSeries} />
      )}

      {/* ===== CLASSIFICAÇÃO (detalhada) ===== */}
      {hubTab === 'standings' && (
        <StandingsTab save={save} league={league} table={table} spots={spots} setSelSeries={setSelSeries} setSelTeam={setSelTeam} />
      )}

      {/* ===== CHAVE (BRACKET DEDICADO) ===== */}
      {/* T1.4: aba Bracket extraída em src/pages/career/BracketTab.tsx */}
      {hubTab === 'bracket' && (
        <BracketTab
          save={save}
          league={league}
          opp={opp}
          myMatch={myMatch}
          update={update}
          playMine={playMine}
          simMine={simMine}
          setSelSeries={setSelSeries}
        />
      )}

      {/* ===== ACADEMIA (prospectos: revelar, treinar, promover) ===== */}
      {/* T1.4: aba Academy extraída em src/pages/career/AcademyTab.tsx */}
      {hubTab === 'academy' && (
        <AcademyTab
          save={save}
          update={update}
          promoting={promoting}
          setPromoting={setPromoting}
          promoteProspect={promoteProspect}
          promoteToAcaTeam={promoteToAcaTeam}
          releaseAcaTeamPlayer={releaseAcaTeamPlayer}
          promoteAcaTeamToSquad={promoteAcaTeamToSquad}
          findSigning={findSigning}
          askConfirm={askConfirm}
          openPlayerProfile={openPlayerProfile}
        />
      )}

      {/* ===== ELENCO + RANKING DE JOGADORES ===== */}
      {/* T1.4: aba Finance extraída em src/pages/career/FinanceTab.tsx */}
      {hubTab === 'finance' && (
        // CareerSave é interface fechada (sem index signature); FinanceTab usa
        // shape broad — cast via unknown pra reconciliar.
        <FinanceTab
          save={save as unknown as Parameters<typeof FinanceTab>[0]['save']}
          findSigning={findSigning}
          update={update as unknown as Parameters<typeof FinanceTab>[0]['update']}
        />
      )}

      {/* T1.4: aba Squad extraída em src/pages/career/SquadTab.tsx */}
      {hubTab === 'squad' && (
        <SquadTab
          save={save as unknown as Parameters<typeof SquadTab>[0]['save']}
          findSigning={findSigning}
          update={update as unknown as Parameters<typeof SquadTab>[0]['update']}
          openPlayerProfile={openPlayerProfile}
          doScrim={doScrim}
          hireScout={hireScout}
          fireScout={fireScout}
          seasonStats={seasonStats}
          mySquadIds={mySquadIds}
        />
      )}

      {/* ===== CENA MUNDIAL: o que rola nas outras regiões ===== */}
      {/* T1.4: aba World extraída em src/pages/career/WorldTab.tsx */}
      {hubTab === 'world' && (
        <WorldTab oppEra={oppEra} save={save} openTeamProfile={openTeamProfile} />
      )}

      {/* ===== RANKING VRS POR REGIÃO ===== */}
      {/* T1.4: aba VRS extraída em src/pages/career/VrsTab.tsx */}
      {hubTab === 'vrs' && (
        <VrsTab
          vrsMode={vrsMode}
          setVrsMode={setVrsMode}
          myVrsRank={myVrsRank}
          vrsAll={vrsAll}
          vrsByRegion={vrsByRegion}
          openTeamProfile={openTeamProfile}
        />
      )}

      {/* ===== TOP 20 HLTV DA TEMPORADA ===== */}
      {/* T1.4: aba Top20 extraída em src/pages/career/Top20Tab.tsx */}
      {hubTab === 'top20' && (
        <Top20Tab
          t20Mode={t20Mode}
          setT20Mode={setT20Mode}
          save={save}
          top20={top20}
          careerTop20={careerTop20}
          mySquadOids={mySquadOids}
          openPlayerProfile={openPlayerProfile}
          resolvePlayerById={resolvePlayerById}
        />
      )}

      {/* ===== HISTÓRIA DA ORGANIZAÇÃO ===== */}
      {/* T1.4: aba Calendar extraída em src/pages/career/CalendarTab.tsx */}
      {hubTab === 'calendar' && (
        <CalendarTab
          save={save}
          league={league}
          table={table}
          myPos={myPos}
          myVrsRank={myVrsRank}
          setSelTeam={setSelTeam}
        />
      )}

      {/* T1.4: aba History extraída em src/pages/career/HistoryTab.tsx */}
      {hubTab === 'history' && (
        <HistoryTab save={save} org={org} />
      )}
      </>
      )}
    </CareerShell>

      {selSeries && (
        <div className="modal-backdrop" onClick={() => setSelSeries(null)}>
          <div className="modal scoreboard-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={() => setSelSeries(null)}>✕</button>
            <Scoreboard series={selSeries.series} teams={selSeries.teams} />
          </div>
        </div>
      )}
      {selTeam && <TeamDetail team={selTeam} league={league} onClose={() => setSelTeam(null)} />}
      {talkPlayer && (
        <PlayerTalkModal
          playerNick={talkPlayer.nick}
          playerState={{
            split: save.split,
            currentMorale: save.morale?.[talkPlayer.oid] ?? MORALE_DEFAULT,
            age: talkPlayer.age,
            lastTalkAtSplit: save.lastTalkAt?.[talkPlayer.oid],
            playerId: talkPlayer.oid, // T3.2 — personalityTalkResponse precisa do id
          }}
          onResolve={(result: TalkResult) => {
            // Aplica delta no morale específico + estampa lastTalkAt
            setSave((s) => {
              const oid = talkPlayer.oid;
              const cur = s.morale?.[oid] ?? MORALE_DEFAULT;
              const next: CareerSave = {
                ...s,
                morale: {
                  ...(s.morale ?? {}),
                  [oid]: Math.max(0, Math.min(100, cur + result.outcome.moraleDelta)),
                },
                lastTalkAt: { ...(s.lastTalkAt ?? {}), [oid]: s.split },
              };
              persist(next);
              return next;
            });
          }}
          onClose={() => setTalkPlayer(null)}
        />
      )}
      {save.pendingYearAwards && (
        <YearAwardsModal
          awards={save.pendingYearAwards}
          onClose={() => {
            setSave((s) => {
              const next: CareerSave = {
                ...s,
                pendingYearAwards: null,
                yearAwardsHistory: [...(s.yearAwardsHistory ?? []), s.pendingYearAwards!],
              };
              persist(next);
              return next;
            });
          }}
        />
      )}
      {/* T11.1: champion celebration (Major ou circuito) */}
      {championModal && (
        <ChampionCelebrationModal
          data={championModal}
          onClose={() => setChampionModal(null)}
        />
      )}
      {/* T11.4: eliminação em torneio (Major only — circuito é trivial) */}
      {eliminationModal && (
        <TournamentEliminationModal
          data={eliminationModal}
          onClose={() => setEliminationModal(null)}
        />
      )}
      {/* T11.3: aposentadoria do player (queue: mostra 1 por vez). Trigger:
          useEffect detecta save.lastRetirees novo e enfileira. */}
      {retirementQueue.length > 0 && (
        <PlayerRetirementModal
          data={retirementQueue[0]}
          onClose={() => setRetirementQueue((q) => q.slice(1))}
        />
      )}
      {save.pendingTeamEvent && (
        <TeamEventModal
          eventId={save.pendingTeamEvent.eventId}
          onChoose={(choiceId) => {
            const result = resolveTeamEventEngine(
              {
                split: save.split,
                tier: save.tier ?? 3,
                pendingTeamEvent: save.pendingTeamEvent ?? null,
                resolvedTeamEvents: save.resolvedTeamEvents ?? [],
              },
              choiceId,
            );
            if (!result) return null;
            // Aplica patch no save
            const { patch } = result;
            const moraleNext = patch.moraleDelta
              ? Object.fromEntries(
                  Object.entries(save.morale ?? {}).map(([id, m]) => [
                    id,
                    Math.max(0, Math.min(100, (m ?? MORALE_DEFAULT) + patch.moraleDelta!)),
                  ]),
                )
              : save.morale;
            const next: CareerSave = {
              ...save,
              budget: Math.max(0, save.budget + (patch.budgetDelta ?? 0)),
              board: Math.max(0, Math.min(100, save.board + (patch.boardDelta ?? 0))),
              morale: moraleNext,
              fired: save.fired || !!patch.triggersFire,
              pendingTeamEvent: null,
              resolvedTeamEvents: [...(save.resolvedTeamEvents ?? []), patch.newResolvedId],
            };
            persist(next);
            setSave(next);
            return { outcome: result.outcome, deltas: { budget: patch.budgetDelta, board: patch.boardDelta, morale: patch.moraleDelta } };
          }}
          onClose={() => {
            // Já resolveu no onChoose. Só fecha.
          }}
        />
      )}

      {/* T8.2: Tour interativo de boas-vindas — substitui o slideshow estático. */}
      {showOnb && (
        <InteractiveTour
          steps={[
            {
              title: ct('Bem-vindo ao Modo Carreira'),
              body: ct('Você comanda uma organização de Counter-Strike do zero até o Major. Esse tour rápido te mostra onde tudo fica.'),
              placement: 'center',
            },
            {
              target: '.em-brand',
              title: ct('Sua identidade'),
              body: ct('Aqui você vê o nome da sua org. O topo é sua central de comando — todas as áreas estão sempre acessíveis daqui.'),
              placement: 'bottom',
            },
            {
              target: '.em-main-nav',
              title: ct('Navegação principal'),
              body: ct('Dashboard, Meu time, Em jogo, Transferências, Notícias e Estatísticas. Cada grupo abre um menu com sub-abas. Use a barra superior pra navegar entre tudo.'),
              placement: 'bottom',
            },
            {
              target: '.em-header-right',
              title: ct('Topo direito'),
              body: ct('Orçamento, slots, contagem de inbox e o botão CONTINUAR (avança o calendário). O menu ⋯ Ferramentas tem Como jogar, Meta, Infraestrutura, Vestiário e o editor de logo.'),
              placement: 'bottom',
            },
            {
              title: ct('Bora começar'),
              body: ct('Você pode reabrir esse tour a qualquer momento pelo botão ❔. Boa sorte na sua jornada rumo ao Major.'),
              placement: 'center',
            },
          ]}
          onClose={dismissOnb}
        />
      )}
    </>
  );
}

// seletor do plano de jogo pré-partida (decisão do usuário, com buff real)
export function GamePlanPicker({ plan, onPick }: { plan: GamePlan; onPick: (p: GamePlan) => void }) {
  return (
    <div className="gameplan-picker">
      <span className="muted small gp-title"><CareerIcon name="focus" size={13} /> {ct('Plano de jogo')}</span>
      <div className="gp-chips">
        {GAME_PLANS.map((g) => (
          <button key={g.id} className={`gp-chip${plan === g.id ? ' on' : ''}`} title={ct(g.desc)} onClick={() => onPick(g.id)}>
            <CareerIcon name={g.icon} size={13} /> {ct(g.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

// linha de confronto reaproveitada (overview e resultados)
export function MatchLine({ league, m, onOpen }: {
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

export const PLACE_SHORT: Record<PlacementCode, string> = {
  champion: ct('Campeão'), runnerup: ct('Vice'), semi: ct('Semi'), quarters: ct('Quartas'), playoffs: ct('Playoffs'), swiss: ct('Suíça'),
};

// fase de grupos GSL: 2 grupos com classificação (1-4) e os jogos por estágio.
// compact = só a classificação (cabe no card lateral). full = + jogos clicáveis.
export function GSLGroups({ league, onOpen, compact }: {
  league: League;
  onOpen: (s: { series: SeriesResult; teams: [TTeam, TTeam] }) => void;
  compact?: boolean;
}) {
  const groups = gslGroupView(league);
  return (
    <div className={`gsl-groups${compact ? ' compact' : ''}`}>
      {groups.map((g) => (
        <div key={g.key} className="gsl-group">
          <div className="gsl-group-head">Grupo {g.key} <span className="muted small">{ct('· top 2 avançam')}</span></div>
          <div className="gsl-standings">
            {[...g.teams].sort((x, y) => (g.place[x] || 9) - (g.place[y] || 9)).map((id) => {
              const t = leagueTeam(league, id);
              const pl = g.place[id];
              return (
                <div key={id} className={`gsl-st-row${pl && pl <= 2 ? ' adv' : pl ? ' out' : ''}${id === 'user' ? ' me' : ''}`}>
                  <span className="gsl-pl">{pl || '–'}</span>
                  <TeamBadge tag={t.tag} colors={t.colors} size={16} logoUrl={t.logoUrl} />
                  <span className="gsl-st-name">{t.name}</span>
                  {pl && pl <= 2 ? <span className="gsl-q" title={ct('Classificado')}>✓</span> : null}
                </div>
              );
            })}
          </div>
          {!compact && (
            <>
              <div className="gsl-stage-label">{ct('Abertura · MD1')}</div>
              {g.opening.map((m, i) => <MatchLine key={`o${i}`} league={league} m={m} onOpen={onOpen} />)}
              {g.winners && (
                <>
                  <div className="gsl-stage-label">{ct('Vencedores · Eliminação · MD3')}</div>
                  <MatchLine league={league} m={g.winners} onOpen={onOpen} />
                  {g.elim && <MatchLine league={league} m={g.elim} onOpen={onOpen} />}
                </>
              )}
              {g.decider && (
                <>
                  <div className="gsl-stage-label">{ct('Decisão · MD3')}</div>
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
      title={r ? ct('Ver estatísticas da série') : undefined}>
      {row(a, r?.mapScore[0], !!r && r.winner === 1)}
      {row(b, r?.mapScore[1], !!r && r.winner === 0)}
    </div>
  );
}

// CHAVE DEDICADA do GSL (dupla eliminação por grupo), no mesmo visual do Major:
// Abertura (MD1) → Vencedores/Eliminação (MD3) → Decisão (MD3) → Classificados.
export function GSLBracket({ league, onOpen }: {
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
            <div className="gsl-br-title">Grupo {g.key} <span className="muted small">{ct('· dupla eliminação · top 2 avançam')}</span></div>
            <div className="hb-scroll">
              <div className="hb-col">
                <div className="hb-reclabel">{ct('Abertura · MD1')}</div>
                <div className="hb-group">
                  {g.opening.map((m, i) => <GslBrCell key={i} league={league} m={m} onOpen={onOpen} />)}
                </div>
              </div>
              <div className="hb-col">
                <div className="hb-reclabel">{ct('Vencedores / Eliminação · MD3')}</div>
                <div className="hb-group">
                  <div className="gsl-br-sub adv">{ct('⬆ Vencedores (1º)')}</div>
                  <GslBrCell league={league} m={g.winners} onOpen={onOpen} />
                  <div className="gsl-br-sub elim">{ct('⬇ Eliminação (4º)')}</div>
                  <GslBrCell league={league} m={g.elim} onOpen={onOpen} />
                </div>
              </div>
              <div className="hb-col">
                <div className="hb-reclabel">{ct('Decisão · MD3')}</div>
                <div className="hb-group">
                  <div className="gsl-br-sub">{ct('Vaga final (2º/3º)')}</div>
                  <GslBrCell league={league} m={g.decider} onOpen={onOpen} />
                </div>
              </div>
              <div className="hb-col">
                <div className="hb-reclabel">{ct('Resultado')}</div>
                <div className="hb-resultbox adv">
                  <div className="hb-resultbox-title">{ct('✓ Classificados')}</div>
                  {adv.length ? adv.map((id) => token(id, 'adv', g.place[id])) : <div className="hb-row ghost">?</div>}
                </div>
                <div className="hb-resultbox elim">
                  <div className="hb-resultbox-title">{ct('✕ Eliminados')}</div>
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
export function BestPlayers({ stats, mine, ranked }: { stats: SeasonStat[]; mine: Set<string>; ranked?: boolean }) {
  if (stats.length === 0) return <p className="muted small">{ct('Os destaques aparecem após as primeiras partidas.')}</p>;
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
  entries: { p: Player; team: TeamSeason; rating: number; mvps?: number; sl?: HltvStat; role?: Role; titles?: string[] }[];
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
          <div className="cer-kicker">{ct('Premiação de fim de temporada · Temporada')} {seasonOf(split)} · {circuit}</div>
          <h2>🏆 {ct('Ranking HLTV — Top 20 do ano')}</h2>
        </div>
        {top1 && (
          <div className={`cer-one${mine.has(top1.p.id) ? ' mine' : ''}`}>
            <span className="cer-1-badge">HLTV #1</span>
            <PlayerAvatar nick={top1.p.nick} size={62} />
            <div className="cer-1-id">
              <div className="cer-1-nick"><Flag cc={top1.p.country} /> {top1.p.nick}</div>
              <div className="muted small">{tagOf(top1)} · {top1.p.name}</div>
              {!!top1.mvps && <div className="t20-mvp" style={{ marginTop: 4 }}>🏆 {top1.mvps}× MVP de torneio no ano</div>}
              {!!top1.titles?.length && (
                <div className="cer-titles" style={{ marginTop: 6 }}>
                  {[...new Set(top1.titles)].map((t) => (
                    <span key={t} className="cer-title-chip">🥇 {t}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="cer-1-rating">{top1.rating.toFixed(2)}<span>rating</span></div>
          </div>
        )}
        <div className="cer-list">
          {rest.map((e, i) => (
            <div key={e.p.id} className={`cer-row${mine.has(e.p.id) ? ' mine' : ''}`} style={{ animationDelay: `${0.1 + i * 0.045}s` }}>
              <span className="cer-rank">{i + 2}</span>
              <PlayerAvatar nick={e.p.nick} size={24} />
              <span className="cer-nick"><Flag cc={e.p.country} /> {e.p.nick} <span className="muted small">{tagOf(e)}</span>{!!e.mvps && <span className="t20-mvp" style={{ marginLeft: 6 }}>{e.mvps}× MVP</span>}{!!e.titles?.length && <span className="cer-title-chip" style={{ marginLeft: 6 }} title={[...new Set(e.titles)].join(' · ')}>🥇 {[...new Set(e.titles)].length}</span>}</span>
              <span className="cer-rating">{e.rating.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="center" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onClose}>{ct('Fechar')}</button>
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
        <button className="modal-x" onClick={onClose}>✕</button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* hero do time */}
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '10px', border: '1px solid var(--rtm-border)', boxShadow: 'var(--rtm-shadow-banner)' }}>
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(110deg, ${team.colors[0]}33, rgba(13,17,22,.92))` }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '18px', padding: '20px 22px', flexWrap: 'wrap' }}>
              <TeamBadge tag={team.tag} colors={team.colors} logoUrl={team.logoUrl} size={64} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: '11px', letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--rtm-gold)', fontWeight: 700 }}>{team.wins}-{team.losses} · {ct('saldo')} {team.roundDiff >= 0 ? '+' : ''}{team.roundDiff} · {ct('força')} {team.strength.toFixed(1)}</div>
                <h1 style={{ margin: '2px 0', fontFamily: 'var(--rtm-font-cond)', fontSize: '34px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--em-text)', lineHeight: 1 }}>{team.name}</h1>
                <div style={{ fontSize: '13px', color: 'var(--rtm-dim)', display: 'flex', alignItems: 'center', gap: '8px' }}><Flag cc={team.country} /> {team.tag}{team.coach && <> · {ct('Técnico:')} <b style={{ color: 'var(--rtm-text)' }}>{team.coach.nick}</b> ({team.coach.rating})</>}</div>
              </div>
            </div>
          </div>
          <div className="rtm-career-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: '14px', alignItems: 'start' }}>
            <DashCard title={ct('Elenco')} flush>
              {team.players.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: i % 2 ? 'var(--rtm-row-b)' : 'var(--rtm-row-a)', padding: '9px 14px' }}>
                  <PlayerAvatar nick={p.nick} size={30} />
                  <b style={{ fontFamily: 'var(--rtm-font-cond)', color: 'var(--em-text)', fontSize: '15px', flex: 1, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Flag cc={p.country} /> {p.nick}</b>
                  <span className={`role-pill ${p.role}`}>{p.role}</span>
                  <span className="cs-ovr">{p.ovr}</span>
                </div>
              ))}
            </DashCard>
            <DashCard title={ct('Mapas na temporada')}>
              {mapStats.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>{ct('Sem partidas jogadas ainda nesta temporada.')}</p>
              ) : (
                <table className="stats td-maps">
                  <thead><tr><th style={{ textAlign: 'left' }}>{ct('Mapa')}</th><th>V-D</th><th>{ct('Rounds')}</th><th>{ct('Aprov.')}</th></tr></thead>
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
            </DashCard>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- agregações para a aba de história / destaques -----
export interface SeasonStat { id: string; nick: string; teamTag: string; country: string; role: string; rating: number; kd: number; adr: number; maps: number; }

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
export function deriveCareer(s: CareerStatLine | undefined) {
  if (!s || s.rounds < 1) return null;
  const kpr = s.k / s.rounds, dpr = s.d / s.rounds, apr = s.a / s.rounds;
  const kast = s.kast / s.rounds, adr = s.dmg / s.rounds;
  const impact = Math.max(0, 2.13 * kpr + 0.42 * apr - 0.41);
  const rating = Math.max(0, 0.0073 * kast * 100 + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587);
  return { rating, kd: s.d ? s.k / s.d : s.k, adr, kastPct: kast * 100, maps: s.maps, kills: s.k, splits: s.splits };
}

export function aggregateHistory(h: SplitRecord[]) {
  let circuitTitles = 0, majorApps = 0, majorTitles = 0, totalPrize = 0, bestPos = 99;
  for (const r of h) {
    if (r.champion) circuitTitles++;
    if (r.major) majorApps++;
    if (r.major?.champion) majorTitles++; // só Major vencido (não título de circuito)
    totalPrize += r.prize;
    if (r.position && r.position < bestPos) bestPos = r.position;
  }
  return {
    circuitTitles, majorApps, majorTitles, totalPrize,
    bestPlacement: bestPos === 99 ? '-' : `${bestPos}º`,
  };
}

export function CareerTable({ table, highlightTop = 0, onPick, detailed }: {
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
          <th style={{ textAlign: 'left' }}>{ct('Time')}</th>
          <th>V</th>
          <th>D</th>
          <th>{ct('Saldo')}</th>
          {detailed && <th>{ct('Força')}</th>}
        </tr>
      </thead>
      <tbody>
        {table.map((t, i) => (
          <tr
            key={t.id}
            className={`${t.id === 'user' ? 'human-row' : ''}${highlightTop && i < highlightTop ? ' qualify-row' : ''}${onPick ? ' clickable' : ''}`}
            onClick={() => onPick?.(t)}
          >
            <td style={{ textAlign: 'left', fontFamily: 'inherit', fontWeight: 800, fontSize: 15, color: i < Math.max(highlightTop, 3) && i < 3 ? 'var(--gold)' : undefined }}>{i + 1}</td>
            <td style={{ textAlign: 'left', fontWeight: t.id === 'user' ? 700 : 500 }}>
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
    if (!map) return;
    if (round >= map.roundLog.length) {
      if (mapIdx + 1 >= series.maps.length) return;
      const t = setTimeout(() => { setMapIdx(mapIdx + 1); setRound(0); }, 380);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRound((r) => r + 1), 28);
    return () => clearTimeout(t);
  }, [mapIdx, round, done, series]);

  const map = series.maps[mapIdx];
  const naturallyDone = !map || (mapIdx + 1 >= series.maps.length && round >= map.roundLog.length);
  const finished = done || naturallyDone;
  const log = map ? map.roundLog.slice(0, round) : [];
  const sa = log.filter((w) => w === 0).length;
  const sb = log.filter((w) => w === 1).length;
  // mapas já decididos (placar de mapas)
  const mapsWonA = series.maps.slice(0, mapIdx).filter((m) => m.winner === 0).length;
  const mapsWonB = series.maps.slice(0, mapIdx).filter((m) => m.winner === 1).length;

  return (
    <div className="modal-backdrop" style={{ alignItems: 'center' }}>
      <div className="qs-card">
        <div className="qs-label">{label} · simulação rápida</div>
        <div className="qs-board">
          <QuickSimSide team={teams[0]} score={sa} mine={userIdx === 0} />
          <div className="qs-mid">
            <div className="qs-map">{map ? map.map.toUpperCase() : 'FIM'}</div>
            <div className="qs-vs">vs</div>
            <div className="qs-mapscore">{mapsWonA} - {mapsWonB} <span className="muted small">mapas</span></div>
          </div>
          <QuickSimSide team={teams[1]} score={sb} mine={userIdx === 1} />
        </div>
        <div className="qs-foot">
          {finished ? (
            <>
              <span className="qs-final">
                {series.winner === userIdx ? ct('Vitória!') : ct('Derrota')} · {series.mapScore[0]}-{series.mapScore[1]}
              </span>
              <button className="btn ghost small" onClick={() => setShowStats(true)}><CareerIcon name="chart-bar" size={13} /> {ct('Ver stats')}</button>
              <button className="btn small" onClick={onDone}>{ct('Continuar →')}</button>
            </>
          ) : (
            <button className="btn ghost small" onClick={() => setDone(true)}>{ct('Pular ⏭')}</button>
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

function QuickSimSide({ team, score, mine }: { team: TTeam; score: number; mine: boolean }) {
  return (
    <div className={`qs-side${mine ? ' mine' : ''}`}>
      <TeamBadge tag={team.tag} colors={team.colors} size={48} logoUrl={team.logoUrl} />
      <div className="qs-name">{team.name}</div>
      <div className="qs-score">{score}</div>
    </div>
  );
}

// ---------- feed da janela de transferências ----------
function TransferFeed({ items, compact }: { items: TransferItem[]; compact?: boolean }) {
  const list = compact ? items.slice(0, 6) : items;
  if (list.length === 0) return <p className="muted small">{ct('Mercado parado por enquanto.')}</p>;
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
export function PlayoffBracket({ p, teamOf, onOpen }: {
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
        title={r ? ct('Ver estatísticas da série') : undefined}>
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
              <div className="hb-reclabel">{ct('Quartas · MD3')}</div>
              <div className="hb-group playoff-group">
                {cell(p.qf[0], [1, 8])}
                {cell(p.qf[1], [4, 5])}
                {cell(p.qf[2], [2, 7])}
                {cell(p.qf[3], [3, 6])}
              </div>
            </div>
          )}
          <div className="hb-col">
            <div className="hb-reclabel">{ct('Semifinal · MD3')}</div>
            <div className="hb-group playoff-group">
              {cell(p.sf[0].a ? p.sf[0] : null, p.qf ? undefined : [1, 4])}
              {cell(p.sf[1].a ? p.sf[1] : null, p.qf ? undefined : [2, 3])}
            </div>
          </div>
          <div className="hb-col">
            <div className="hb-reclabel">{ct('Grande final · MD5')}</div>
            <div className="hb-group playoff-group">
              {cell(p.final)}
            </div>
          </div>
          <div className="hb-col">
            <div className="hb-reclabel">{ct('Campeão')}</div>
            <div className="hb-resultbox adv" style={{ minWidth: 150 }}>
              <div className="hb-resultbox-title"><CareerIcon name="trophy" size={14} /> {ct('Troféu')}</div>
              {champ ? (
                <div className={`hb-token adv${champ.isUser ? ' is-user' : ''}`} style={{ fontSize: 13 }}>
                  <TeamBadge tag={champ.tag} colors={champ.colors} size={24} logoUrl={champ.logoUrl} />
                  <span><Flag cc={champ.country} /> {champ.name}</span>
                </div>
              ) : (
                <div className="hb-row ghost">{ct('a definir')}</div>
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
  /** FRENTE 3: 'global' = aberto a todos; 'sa'/'eu'/'asia' = só user da macro-região
   *  ou que tenha core lá. Default = global. */
  region?: 'global' | 'sa' | 'eu' | 'asia';
}
function CircuitPicker({ circuits, split, playerTier, inviteTier, userRegion, relocate, onRelocate, onPick, onBack }: {
  circuits: CircuitOption[];
  split: number;
  playerTier: number;
  inviteTier: number | null;
  userRegion: MacroRegion | null;
  relocate: { from: MacroRegion; to: MacroRegion } | null;
  onRelocate: () => void;
  onPick: (c: CircuitOption) => void;
  onBack: () => void;
}) {
  // FRENTE 3 — REGION ROUTING:
  // - circuitos 'global' são abertos a todos
  // - circuitos regionais ('sa'/'eu'/'asia') só pra user cuja MacroRegion bate
  // - mapeia macroRegion → conjunto de region tags aceitas
  const userRegionTags: Set<'global' | 'sa' | 'eu' | 'asia'> = (() => {
    const set = new Set<'global' | 'sa' | 'eu' | 'asia'>(['global']);
    if (userRegion === 'americas') set.add('sa');
    if (userRegion === 'europe' || userRegion === 'cis') set.add('eu');
    if (userRegion === 'asia' || userRegion === 'oceania') set.add('asia');
    return set;
  })();
  const regionOk = (opt: CircuitOption) => userRegionTags.has(opt.region ?? 'global');
  // você disputa: o circuito do SEU tier; o tier de CIMA se recebeu CONVITE; e UM
  // tier ABAIXO por opção. Acrescido do filtro de região pra regionais.
  const tierOk = (opt: CircuitOption) => opt.tier === playerTier || opt.tier === inviteTier || opt.tier === playerTier + 1;
  const canEnter = (opt: CircuitOption) => tierOk(opt) && regionOk(opt);
  const isInvite = (opt: CircuitOption) => opt.tier === inviteTier && opt.tier !== playerTier;
  const isBelow = (opt: CircuitOption) => opt.tier === playerTier + 1;
  const isRegional = (opt: CircuitOption) => opt.region && opt.region !== 'global';
  const REGION_LABEL: Record<string, string> = { sa: '🌎 SA', eu: '🇪🇺 EU', asia: '🌏 Ásia' };
  const firstAvailable = circuits.find(canEnter) ?? circuits[0];
  const [selectedId, setSelectedId] = useState(firstAvailable?.id ?? '');
  const selected = circuits.find((option) => option.id === selectedId);
  const c = selected ?? firstAvailable;
  const cOk = c && canEnter(c);
  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 900, margin: '24px auto' }}>
        <div className="panel-head">
          Divisões · Split {split} · você está no {ct(TIER_NAMES[playerTier])}
          <span className="spacer" />
          <button className="btn" onClick={onBack}>{ct('← Mercado')}</button>
        </div>
        <div className="panel-body">
          {relocate && (
            <div className="relocate-banner">
              🌍 Seu <b>core</b> {ct('mudou: agora é da')} <b>{ct(MACRO_REGION_LABELS[relocate.to])}</b>{ct(', mas você compete na')} <b>{ct(MACRO_REGION_LABELS[relocate.from])}</b>.
              {' '}Quer <b>realocar a org para a {ct(MACRO_REGION_LABELS[relocate.to])}</b>? A bandeira do time passa a ser a dessa região.
              <button className="btn small" onClick={onRelocate}>Mudar para {ct(MACRO_REGION_LABELS[relocate.to])}</button>
            </div>
          )}
          <p className="muted small">{ct('Cada circuito é um')} <b>tier</b>{ct('. Você joga no seu tier ou abaixo; vencer o seu circuito te')} <b>promove</b>{ct(', terminar no fundo te')} <b>rebaixa</b>{ct('. Só o')} <b>Tier 1</b> {ct('dá vaga no Major.')}</p>
          <div className="circuit-cards">
            {circuits.map((opt) => {
              const locked = !canEnter(opt);
              return (
                <button key={opt.id} className={`circuit-card${c?.id === opt.id ? ' on' : ''}${locked ? ' locked' : ''}`} onClick={() => setSelectedId(opt.id)}>
                  <div className="cc-name">
                    <span className={`tier-badge t${opt.tier}`}>TIER {opt.tier}</span> {opt.name}
                    {isInvite(opt) && <span className="tier-badge" style={{ background: 'var(--rtm-gold)', color: '#06121d', marginLeft: 6 }}>✉ {ct('CONVITE')}</span>}
                    {isRegional(opt) && (
                      <span className="tier-badge" style={{ background: 'rgba(95,164,232,0.18)', color: '#5fa4e8', border: '1px solid rgba(95,164,232,0.45)', marginLeft: 6 }}>
                        {REGION_LABEL[opt.region ?? '']}
                      </span>
                    )}
                  </div>
                  <div className="cc-desc muted small">{opt.desc}</div>
                  <div className="cc-meta">
                    <span>💰 {fmtPool(eventMeta(opt.name, opt.tier).prize)}</span>
                    <span>📍 {eventMeta(opt.name, opt.tier).venue}</span>
                    <span>{opt.spots} {opt.spots === 1 ? 'vaga' : 'vagas'} ao Major</span>
                    <span>prêmio ×{opt.prizeMult}</span>
                    <span>VRS ×{opt.vrsWeight.toFixed(2)}</span>
                  </div>
                  {isInvite(opt) && <div className="cc-lock small" style={{ color: 'var(--rtm-gold)' }}>✉ {ct('Convite: jogar aqui acelera a evolução dos seus jogadores mais jovens.')}</div>}
                  {isBelow(opt) && <div className="cc-lock muted small">↓ {ct('Opcional: um tier abaixo (menos VRS e prêmio).')}</div>}
                  {locked && !regionOk(opt) && (
                    <div className="cc-lock muted small">🔒 {ct('Circuito regional —')} {REGION_LABEL[opt.region ?? '']} {ct('exclusivo (sua org não compete nessa região)')}</div>
                  )}
                  {locked && regionOk(opt) && (opt.tier < playerTier
                    ? <div className="cc-lock muted small">🔒 {ct('Acima da sua divisão — suba pelo ranking VRS')}</div>
                    : <div className="cc-lock muted small">🔒 {ct('Fora da sua divisão (você joga o seu tier)')}</div>)}
                </button>
              );
            })}
          </div>
          {c && (
            <>
              <div className="muted small section-label">{ct('Times confirmados no')} {c.name}</div>
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
                  <div className="muted">🔒 Você precisa estar no {ct(TIER_NAMES[c.tier])} para disputar este circuito. Suba vencendo o seu tier atual.</div>
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
  { id: 'circle', label: ct('Círculo') },
  { id: 'hexagon', label: ct('Hexágono') },
  { id: 'bolt', label: 'Raio' },
  { id: 'star', label: ct('Estrela') },
  { id: 'diamond', label: ct('Losango') },
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
// T8.2: CareerOnboarding (modal slideshow estático) + ONB_SLIDES removidos —
// substituídos pelo InteractiveTour (tour com spotlight nos elementos reais).

// tela OBRIGATÓRIA de renovação: aparece na janela quando há contratos vencendo.
// O usuário decide quem fica (paga 1 salário) e quem sai. Sem perder jogador "do nada".
function RenewalScreen({ renewals, budget, onConfirm }: {
  renewals: Renewal[];
  budget: number;
  onConfirm: (renewIds: string[]) => void;
}) {
  // Redesenhada no padrão em-*: header banner + DashCard com rows limpas
  // + sticky bottom com hud de cost/budget e CTA. API preservada.
  const [decided, setDecided] = useState<Record<string, 'keep' | 'drop'>>({});
  const set = (id: string, v: 'keep' | 'drop') => setDecided((d) => ({ ...d, [id]: v }));
  const setAll = (v: 'keep' | 'drop') => setDecided(Object.fromEntries(renewals.map((r) => [r.playerId, v])));
  const kept = renewals.filter((r) => decided[r.playerId] === 'keep');
  const dropped = renewals.filter((r) => decided[r.playerId] === 'drop');
  const cost = kept.reduce((a, r) => a + r.wage, 0);
  const overBudget = cost > budget;
  const allDecided = renewals.every((r) => decided[r.playerId]);

  return (
    <div className="em-renewals fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 20px 24px', maxWidth: 880, margin: '0 auto' }}>
      {/* Header banner */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(232,193,112,0.12) 0%, transparent 60%)',
          border: '1px solid var(--em-border)',
          borderRadius: 6,
        }}
      >
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 800 }}>
            📝 {ct('Janela de renovação')}
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: '1.4rem', fontWeight: 900, color: 'var(--em-text)', letterSpacing: '-0.3px' }}>
            {renewals.length} {ct('contratos venceram')}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--em-muted)', maxWidth: 580, lineHeight: 1.45 }}>
            {ct('Decida cada um:')} <b style={{ color: 'var(--em-text)' }}>{ct('Renovar')}</b> {ct('mantém no elenco e custa 1 salário · ')}<b style={{ color: 'var(--em-text)' }}>{ct('Liberar')}</b> {ct('libera o jogador agora (de graça).')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setAll('keep')}
            style={{
              padding: '6px 12px',
              background: 'rgba(94,216,138,0.12)',
              color: '#5ed88a',
              border: '1px solid rgba(94,216,138,0.45)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✓ {ct('Renovar todos')}
          </button>
          <button
            type="button"
            onClick={() => setAll('drop')}
            style={{
              padding: '6px 12px',
              background: 'rgba(229,138,138,0.10)',
              color: '#e58a8a',
              border: '1px solid rgba(229,138,138,0.45)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕ {ct('Liberar todos')}
          </button>
        </div>
      </header>

      {/* Lista de renovações */}
      <DashCard
        title={ct('Decisões')}
        info={`${kept.length} ${ct('renovar')} · ${dropped.length} ${ct('liberar')} · ${renewals.length - kept.length - dropped.length} ${ct('pendente')}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {renewals.map((r) => {
            const v = decided[r.playerId];
            const isKeep = v === 'keep';
            const isDrop = v === 'drop';
            const accent = isKeep ? '#5ed88a' : isDrop ? '#e58a8a' : 'var(--em-border)';
            return (
              <div
                key={r.playerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  background: 'var(--em-panel-2)',
                  border: `1px solid ${accent}`,
                  borderLeft: `3px solid ${accent}`,
                  borderRadius: 4,
                  opacity: isDrop ? 0.7 : 1,
                  transition: 'border-color .15s, opacity .15s',
                }}
              >
                <PlayerAvatar nick={r.nick} size={40} />
                <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.92rem', fontWeight: 800, color: 'var(--em-text)' }}>
                    <Flag cc={r.country} /> {r.nick}
                    <span className={`role-pill ${r.role}`}>{r.role}</span>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 3, fontSize: '0.74rem', color: 'var(--em-muted)', fontFamily: '"JetBrains Mono", monospace' }}>
                    <span>OVR <b style={{ color: 'var(--em-text)', fontWeight: 800 }}>{r.ovr}</b></span>
                    <span>{ct('salário')} <b style={{ color: 'var(--em-text)', fontWeight: 800 }}>{formatMoney(r.wage)}</b></span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => set(r.playerId, 'keep')}
                    style={{
                      padding: '7px 14px',
                      background: isKeep ? '#5ed88a' : 'transparent',
                      color: isKeep ? '#0a1a0c' : '#5ed88a',
                      border: `1px solid ${isKeep ? '#5ed88a' : 'rgba(94,216,138,0.45)'}`,
                      borderRadius: 4,
                      fontFamily: 'inherit',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      minWidth: 90,
                    }}
                  >
                    {isKeep ? `✓ ${ct('Renovar')}` : ct('Renovar')}
                  </button>
                  <button
                    type="button"
                    onClick={() => set(r.playerId, 'drop')}
                    style={{
                      padding: '7px 14px',
                      background: isDrop ? '#c0392b' : 'transparent',
                      color: isDrop ? '#fff' : '#e58a8a',
                      border: `1px solid ${isDrop ? '#c0392b' : 'rgba(229,138,138,0.45)'}`,
                      borderRadius: 4,
                      fontFamily: 'inherit',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      minWidth: 90,
                    }}
                  >
                    {isDrop ? `✕ ${ct('Liberar')}` : ct('Liberar')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </DashCard>

      {/* Sticky bottom hud + CTA — `em-market-sticky-bottom` reaproveitada da
         MarketScreen: respeita o banner G4 (sobe 126/92px quando has-ad-footer)
         e ganha flex-wrap no mobile. */}
      <div
        className="em-market-sticky-bottom"
        style={{
          position: 'sticky',
          padding: '12px 18px',
          background: 'var(--em-panel)',
          border: '1px solid var(--em-border)',
          borderRadius: 6,
          boxShadow: '0 -4px 16px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.84rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {ct('Custo renovações')}
            </span>
            <b style={{ fontFamily: '"JetBrains Mono", monospace', color: overBudget ? '#e58a8a' : 'var(--em-text)', fontSize: '1.05rem', fontWeight: 900 }}>
              {formatMoney(cost)}
            </b>
          </div>
          <span style={{ color: 'var(--em-muted)' }}>·</span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {ct('Caixa')}
            </span>
            <b style={{ fontFamily: '"JetBrains Mono", monospace', color: '#5ed88a', fontSize: '1.05rem', fontWeight: 900 }}>
              {formatMoney(budget)}
            </b>
          </div>
          {!allDecided && (
            <span style={{ color: 'var(--em-muted)', fontSize: '0.78rem', marginLeft: 8 }}>
              ⚠ {ct('Faltam')} <b style={{ color: 'var(--em-text)' }}>{renewals.length - kept.length - dropped.length}</b> {ct('decisões')}
            </span>
          )}
          {overBudget && (
            <span style={{ color: '#e58a8a', fontSize: '0.78rem', marginLeft: 8 }}>
              ⚠ {ct('Estourou')} {formatMoney(cost - budget)}
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={overBudget || !allDecided}
          onClick={() => onConfirm(kept.map((r) => r.playerId))}
          style={{
            padding: '10px 22px',
            background: (overBudget || !allDecided) ? 'var(--em-panel-2)' : 'var(--em-gold)',
            color: (overBudget || !allDecided) ? 'var(--em-muted)' : '#1a1205',
            border: (overBudget || !allDecided) ? '1px solid var(--em-border)' : 'none',
            borderRadius: 4,
            fontFamily: 'inherit',
            fontWeight: 900,
            fontSize: '0.9rem',
            cursor: (overBudget || !allDecided) ? 'not-allowed' : 'pointer',
            letterSpacing: '0.3px',
          }}
        >
          ✔ {ct('Confirmar e abrir o mercado')}
        </button>
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
  // Redesenhada no padrão em-* — banner gold cinematográfico + decisão clara.
  return (
    <div
      className="em-offer fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '12px 20px 24px',
        maxWidth: 640,
        margin: '40px auto 0',
      }}
    >
      {/* Header banner dramático */}
      <header
        style={{
          padding: '24px 20px',
          background: 'linear-gradient(135deg, rgba(232,193,112,0.18) 0%, transparent 80%)',
          border: '1px solid rgba(232,193,112,0.5)',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '0.66rem', color: 'var(--em-gold)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 900 }}>
          📨 {ct('Proposta recebida')}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <span style={{ padding: '3px 10px', background: 'rgba(232,193,112,0.18)', color: '#e8c170', border: '1px solid rgba(232,193,112,0.55)', borderRadius: 3, fontSize: '0.66rem', fontWeight: 900, letterSpacing: '0.5px' }}>
            TIER 1
          </span>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: 'var(--em-text)', letterSpacing: '-0.3px' }}>
            {offer.orgName}
          </h2>
        </div>
        <div style={{ fontSize: '0.95rem', color: 'var(--em-text)', marginTop: 8 }}>
          {ct('quer o seu')} <b style={{ color: 'var(--em-gold)' }}>{offer.nick}</b>
        </div>
      </header>

      {/* Detalhes da oferta — 2 cards lado a lado: player + fee */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            background: 'var(--em-panel-2)',
            border: '1px solid var(--em-border)',
            borderRadius: 6,
          }}
        >
          <PlayerAvatar nick={offer.nick} size={52} />
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
              {ct('Jogador alvo')}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--em-text)' }}>
              {offer.nick}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--em-muted)', fontFamily: '"JetBrains Mono", monospace' }}>
              OVR <b style={{ color: 'var(--em-gold)', fontWeight: 900 }}>{offer.ovr}</b>
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '14px 16px',
            background: 'rgba(94,216,138,0.10)',
            border: '1px solid rgba(94,216,138,0.45)',
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
            {ct('Valor da proposta')}
          </div>
          <b style={{ fontFamily: '"JetBrains Mono", monospace', color: '#5ed88a', fontSize: '1.5rem', fontWeight: 900, marginTop: 2 }}>
            {formatMoney(offer.fee)}
          </b>
        </div>
      </div>

      {/* Narrativa */}
      <div
        style={{
          padding: '14px 16px',
          background: 'var(--em-panel)',
          border: '1px solid var(--em-border)',
          borderLeft: '3px solid var(--em-gold)',
          borderRadius: '0 6px 6px 0',
          color: 'var(--em-text)',
          fontSize: '0.86rem',
          lineHeight: 1.55,
        }}
      >
        <b>{offer.orgName}</b> {ct('(org de elite) ofereceu')} <b style={{ color: '#5ed88a' }}>{formatMoney(offer.fee)}</b> {ct('pelo seu')} <b>{offer.nick}</b>.
        {' '}
        {ct('Vender enche o caixa, mas você fica com 4 e precisa repor no mercado. Segurar mantém a')} <b>{orgName}</b> {ct('forte.')}
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--em-border)', paddingTop: 16 }}>
        <button
          type="button"
          onClick={onRefuse}
          style={{
            padding: '12px 20px',
            background: 'transparent',
            color: 'var(--em-text)',
            border: '1px solid var(--em-border)',
            borderRadius: 4,
            fontFamily: 'inherit',
            fontWeight: 700,
            fontSize: '0.86rem',
            cursor: 'pointer',
          }}
        >
          ✕ {ct('Recusar e segurar o jogador')}
        </button>
        <button
          type="button"
          onClick={onAccept}
          style={{
            padding: '12px 22px',
            background: 'var(--em-gold)',
            color: '#1a1205',
            border: 'none',
            borderRadius: 4,
            fontFamily: 'inherit',
            fontWeight: 900,
            fontSize: '0.9rem',
            cursor: 'pointer',
            letterSpacing: '0.3px',
          }}
        >
          ✔ {ct('Vender por')} {formatMoney(offer.fee)}
        </button>
      </div>
    </div>
  );
}

// escolha da org: assumir QUALQUER time real do dataset (com elenco e contexto)
// ou uma org sem line pra montar do zero. Substitui o "inventar do nada".
// Tela redesenhada no padrão em-* (DashCard, filtros, grid 3-col).
function OrgSelect({ teams, onStart, onFictional, onScenarios, onExit }: {
  teams: TeamSeason[];
  onStart: (s: OrgStart) => void;
  onFictional: () => void;
  onScenarios: () => void;
  onExit: () => void;
}) {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<0 | 1 | 2 | 3>(0); // 0 = todos
  const [regionFilter, setRegionFilter] = useState<MacroRegion | ''>('');

  // TODOS os times com 5+ jogadores ficam disponíveis pra assumir. O usuário
  // pode escolher qualquer um — incluindo elite (tier 1) — mas o caixa é
  // proporcional ao tier (elite ganha menos verba pra balancear).
  const allTakeovers = useMemo(
    () =>
      teams
        .filter((t) => t.players.length >= 5)
        .map((t) => {
          const tier = teamTier(t);
          const ovr = Math.round(t.players.reduce((a, p) => a + playerOvr(p), 0) / t.players.length);
          const region = macroRegionPlurality(t.players.slice(0, 5).map((p) => p.country));
          return { t, tier, ovr, region };
        })
        .sort((a, b) => b.ovr - a.ovr),
    [teams],
  );

  const visible = useMemo(
    () =>
      allTakeovers.filter((x) => {
        if (tierFilter && x.tier !== tierFilter) return false;
        if (regionFilter && x.region !== regionFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!x.t.team.toLowerCase().includes(q) && !x.t.tag.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [allTakeovers, tierFilter, regionFilter, search],
  );

  const tierCounts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  for (const x of allTakeovers) tierCounts[x.tier as 1 | 2 | 3]++;

  const takeOver = (t: TeamSeason) => {
    const tier = teamTier(t);
    onStart({
      org: { name: t.team, tag: t.tag, colors: t.colors, logo: t.logoUrl ?? logoForTeam(t) },
      squad: t.players.slice(0, 5).map((p) => ({ playerId: p.id, fromId: t.id })),
      coachFromId: t.id, // herda o coach da org
      budget: takeoverBudget(tier),
      tier,
      takeoverId: t.id,
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
    <div className="em-org-select fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header banner */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(232,193,112,0.12) 0%, transparent 60%)',
          border: '1px solid var(--em-border)',
          borderRadius: 6,
        }}
      >
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 800 }}>
            Modo carreira
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: '1.6rem', fontWeight: 900, color: 'var(--em-text)', letterSpacing: '-0.3px' }}>
            {ct('Assuma uma organização')}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: 'var(--em-muted)', maxWidth: 620, lineHeight: 1.45 }}>
            {ct('Qualquer time do dataset CS2 (86+) tá disponível. Tiers maiores ganham menos caixa pra balancear — elite tem folha pesada, tier 3 tem caixa folgado pra reconstruir.')}
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          style={{
            padding: '8px 14px',
            background: 'var(--em-panel-2)',
            color: 'var(--em-text)',
            border: '1px solid var(--em-border)',
            borderRadius: 4,
            fontFamily: 'inherit',
            fontWeight: 600,
            fontSize: '0.84rem',
            cursor: 'pointer',
          }}
        >
          ← {ct('Sair')}
        </button>
      </header>

      {/* CTAs secundários: Desafios + Fundar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button
          type="button"
          onClick={onScenarios}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 18px',
            background: 'var(--em-panel)',
            border: '1px solid var(--em-gold)',
            borderRadius: 6,
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: 'var(--em-text)',
            transition: 'background .15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(232,193,112,0.08)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--em-panel)')}
        >
          <span style={{ fontSize: '1.8rem' }}>🎯</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 800 }}>{ct('Desafios de carreira')}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--em-muted)', marginTop: 2 }}>
              {ct('Cenários com contexto e metas: FaZe rebuild, MIBR orgulho, SAW Portugal e mais')}
            </div>
          </div>
          <span style={{ fontSize: '1.2rem', color: 'var(--em-gold)' }}>→</span>
        </button>
        <button
          type="button"
          onClick={onFictional}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 18px',
            background: 'var(--em-panel)',
            border: '1px solid var(--em-border)',
            borderRadius: 6,
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: 'var(--em-text)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--em-gold)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--em-border)')}
        >
          <span style={{ fontSize: '1.8rem' }}>✨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 800 }}>{ct('Fundar org fictícia')}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--em-muted)', marginTop: 2 }}>
              {ct('Crie nome, sigla, cores e logo do zero. Sem elenco, caixa cheio.')}
            </div>
          </div>
          <span style={{ fontSize: '1.2rem', color: 'var(--em-muted)' }}>→</span>
        </button>
      </div>

      {/* DashCard com filter bar + grid de times */}
      <DashCard
        title={`${ct('Times reais')} (${visible.length}/${allTakeovers.length})`}
        info={ct('Clique pra assumir')}
        actions={
          (search || tierFilter || regionFilter) ? (
            <button
              type="button"
              onClick={() => { setSearch(''); setTierFilter(0); setRegionFilter(''); }}
              style={{
                padding: '4px 10px',
                fontSize: '0.72rem',
                fontFamily: 'inherit',
                fontWeight: 700,
                background: 'transparent',
                color: 'var(--em-text)',
                border: '1px solid var(--em-border)',
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              ✕ {ct('Limpar')}
            </button>
          ) : undefined
        }
      >
        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder={ct('Buscar time ou tag…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: '1 1 220px',
              padding: '8px 12px',
              background: 'var(--em-panel-2)',
              color: 'var(--em-text)',
              border: '1px solid var(--em-border)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontSize: '0.86rem',
            }}
          />
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value as MacroRegion | '')}
            style={{
              padding: '8px 12px',
              background: 'var(--em-panel-2)',
              color: 'var(--em-text)',
              border: '1px solid var(--em-border)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontSize: '0.84rem',
              minWidth: 140,
            }}
          >
            <option value="">🌍 {ct('Região')} ({ct('todas')})</option>
            {MACRO_REGION_ORDER.map((reg) => (
              <option key={reg} value={reg}>{MACRO_REGION_LABELS[reg]}</option>
            ))}
          </select>
        </div>

        {/* Tier chips */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          <TierChip label={`${ct('Todos')} (${allTakeovers.length})`} active={tierFilter === 0} onClick={() => setTierFilter(0)} />
          <TierChip label={`TIER 1 (${tierCounts[1]})`} active={tierFilter === 1} onClick={() => setTierFilter(tierFilter === 1 ? 0 : 1)} tier={1} />
          <TierChip label={`TIER 2 (${tierCounts[2]})`} active={tierFilter === 2} onClick={() => setTierFilter(tierFilter === 2 ? 0 : 2)} tier={2} />
          <TierChip label={`TIER 3 (${tierCounts[3]})`} active={tierFilter === 3} onClick={() => setTierFilter(tierFilter === 3 ? 0 : 3)} tier={3} />
        </div>

        {/* Grid de times */}
        {visible.length === 0 ? (
          <div style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--em-muted)', fontSize: '0.88rem', fontStyle: 'italic' }}>
            {ct('Nenhum time com esses filtros.')}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 10,
              maxHeight: 'calc(100vh - 380px)',
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {visible.map(({ t, tier, ovr, region }) => (
              <TeamPickCard
                key={t.id}
                team={t}
                tier={tier}
                ovr={ovr}
                region={region}
                budget={takeoverBudget(tier)}
                onClick={() => takeOver(t)}
              />
            ))}
          </div>
        )}
      </DashCard>

      {/* Orgs sem line — começar do zero */}
      <DashCard title={ct('Começar do zero (org sem line ativa)')} info={ct('Caixa maior pra montar elenco')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {EMPTY_ORGS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => startEmpty(e)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 14,
                background: 'var(--em-panel-2)',
                border: '1px solid var(--em-border)',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'var(--em-text)',
                textAlign: 'left',
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.borderColor = 'var(--em-gold)'; }}
              onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.borderColor = 'var(--em-border)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TeamBadge tag={e.tag} colors={e.colors} size={36} logoUrl={e.logoUrl} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.96rem', fontWeight: 800 }}>{e.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--em-muted)' }}>
                    <span style={{ ...tierBadgeStyle(3), padding: '1px 6px', borderRadius: 3, fontSize: '0.6rem', fontWeight: 800 }}>TIER 3</span>
                    <span style={{ marginLeft: 6 }}>{ct('sem elenco')}</span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--em-muted)', lineHeight: 1.45 }}>
                {ct(e.blurb)}
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--em-border)', paddingTop: 8 }}>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.9rem', color: '#5ed88a', fontWeight: 800 }}>
                  💰 {formatMoney(e.budget)}
                </span>
                <span style={{ fontSize: '0.74rem', color: 'var(--em-gold)', fontWeight: 700 }}>{ct('Assumir')} →</span>
              </div>
            </button>
          ))}
        </div>
      </DashCard>
    </div>
  );
}

function tierBadgeStyle(tier: number): React.CSSProperties {
  const colors: Record<number, { bg: string; fg: string; border: string }> = {
    1: { bg: 'rgba(232,193,112,0.18)', fg: '#e8c170', border: 'rgba(232,193,112,0.5)' },
    2: { bg: 'rgba(155,111,232,0.16)', fg: '#9b6fe8', border: 'rgba(155,111,232,0.5)' },
    3: { bg: 'rgba(95,164,232,0.14)',  fg: '#5fa4e8', border: 'rgba(95,164,232,0.4)' },
  };
  const c = colors[tier] ?? colors[3];
  return { background: c.bg, color: c.fg, border: `1px solid ${c.border}` };
}

function TierChip({ label, active, tier, onClick }: { label: string; active: boolean; tier?: number; onClick: () => void }) {
  const tierStyle = tier ? tierBadgeStyle(tier) : { background: 'var(--em-panel-2)', color: 'var(--em-text)', border: '1px solid var(--em-border)' };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 12px',
        ...(active ? { background: 'var(--em-gold)', color: '#1a1205', border: '1px solid var(--em-gold)' } : tierStyle),
        borderRadius: 12,
        fontFamily: 'inherit',
        fontSize: '0.74rem',
        fontWeight: 800,
        cursor: 'pointer',
        letterSpacing: '0.3px',
      }}
    >
      {label}
    </button>
  );
}

function TeamPickCard({
  team,
  tier,
  ovr,
  region,
  budget,
  onClick,
}: {
  team: TeamSeason;
  tier: number;
  ovr: number;
  region: MacroRegion;
  budget: number;
  onClick: () => void;
}) {
  const lineup = team.players.slice(0, 5);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        background: 'var(--em-panel-2)',
        border: '1px solid var(--em-border)',
        borderRadius: 6,
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: 'var(--em-text)',
        textAlign: 'left',
        transition: 'border-color .15s, transform .12s',
      }}
      onMouseEnter={(ev) => {
        const el = ev.currentTarget as HTMLElement;
        el.style.borderColor = 'var(--em-gold)';
        el.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(ev) => {
        const el = ev.currentTarget as HTMLElement;
        el.style.borderColor = 'var(--em-border)';
        el.style.transform = 'translateY(0)';
      }}
    >
      {/* Header com badge + nome + flag */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TeamBadge tag={team.tag} colors={team.colors} size={36} logoUrl={team.logoUrl ?? logoForTeam(team)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.94rem', fontWeight: 800 }}>
            <Flag cc={team.country} /> {team.team}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ ...tierBadgeStyle(tier), padding: '1px 6px', borderRadius: 3, fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.5px' }}>
              TIER {tier}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {MACRO_REGION_LABELS[region]}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', lineHeight: 1.1 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>OVR</div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '1.1rem', color: 'var(--em-gold)', fontWeight: 900 }}>
            {ovr}
          </div>
        </div>
      </div>

      {/* Lineup com 5 avatares pequenos */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 0' }}>
        {lineup.map((p) => (
          <div key={p.id} title={`${p.nick} · ${p.role} · OVR ${playerOvr(p)}`} style={{ position: 'relative', flex: 1 }}>
            <PlayerAvatar nick={p.nick} size={36} />
            <span
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                background: 'var(--em-panel)',
                color: 'var(--em-text)',
                border: '1px solid var(--em-border)',
                borderRadius: 8,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '0.62rem',
                fontWeight: 800,
                padding: '0 4px',
                lineHeight: 1.4,
              }}
            >
              {playerOvr(p)}
            </span>
          </div>
        ))}
      </div>

      {/* Footer: budget + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--em-border)', paddingTop: 8, marginTop: 2 }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.88rem', color: '#5ed88a', fontWeight: 800 }}>
          💰 {formatMoney(budget)}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--em-gold)', fontWeight: 700 }}>
          {ct('Assumir')} →
        </span>
      </div>
    </button>
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
    <div className="em-scenarios fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(232,193,112,0.12) 0%, transparent 60%)',
          border: '1px solid var(--em-border)',
          borderRadius: 6,
        }}
      >
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 800 }}>
            🎯 {ct('Modo carreira')}
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: '1.6rem', fontWeight: 900, color: 'var(--em-text)', letterSpacing: '-0.3px' }}>
            {ct('Desafios de carreira')}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: 'var(--em-muted)', maxWidth: 620, lineHeight: 1.45 }}>
            {ct('Assuma uma organização com contexto e metas próprias. O elenco e o técnico já vêm prontos; cumpra os objetivos do desafio ao longo da campanha.')}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '8px 14px',
            background: 'var(--em-panel-2)',
            color: 'var(--em-text)',
            border: '1px solid var(--em-border)',
            borderRadius: 4,
            fontFamily: 'inherit',
            fontWeight: 600,
            fontSize: '0.84rem',
            cursor: 'pointer',
          }}
        >
          ← {ct('Voltar')}
        </button>
      </header>

      {SCENARIO_CAT_ORDER.map((cat) => {
        const group = items.filter((x) => x.sc.cat === cat);
        if (!group.length) return null;
        return (
          <DashCard key={cat} title={ct(SCENARIO_CAT_LABELS[cat])} info={`${group.length} ${group.length === 1 ? ct('cenário') : ct('cenários')}`}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 10,
              }}
            >
              {group.map(({ sc, team }) => {
                const t = team!;
                const tier = teamTier(t);
                const ovr = Math.round(t.players.reduce((a, p) => a + playerOvr(p), 0) / Math.max(1, t.players.length));
                const budget = sc.budget ?? takeoverBudget(tier);
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => pick(sc, t)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      padding: 14,
                      background: 'var(--em-panel-2)',
                      border: '1px solid var(--em-border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: 'var(--em-text)',
                      textAlign: 'left',
                      transition: 'border-color .15s, transform .12s',
                    }}
                    onMouseEnter={(ev) => {
                      const el = ev.currentTarget as HTMLElement;
                      el.style.borderColor = 'var(--em-gold)';
                      el.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(ev) => {
                      const el = ev.currentTarget as HTMLElement;
                      el.style.borderColor = 'var(--em-border)';
                      el.style.transform = 'translateY(0)';
                    }}
                  >
                    {/* Header com badge + título + tier */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <TeamBadge tag={t.tag} colors={t.colors} size={42} logoUrl={t.logoUrl ?? logoForTeam(t)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.98rem', fontWeight: 800, lineHeight: 1.2 }}>
                          <Flag cc={t.country} /> {ct(sc.title)}
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <span style={{ ...tierBadgeStyle(tier), padding: '1px 6px', borderRadius: 3, fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.5px' }}>
                            TIER {tier}
                          </span>
                          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.74rem', color: 'var(--em-muted)' }}>
                            OVR {ovr}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Contexto narrativo */}
                    <div style={{ fontSize: '0.78rem', color: 'var(--em-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
                      {ct(sc.context)}
                    </div>

                    {/* Goals */}
                    {sc.goals.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                          {ct('Objetivos')}
                        </div>
                        {sc.goals.map((g, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 8px',
                              background: 'rgba(232,193,112,0.08)',
                              border: '1px solid rgba(232,193,112,0.25)',
                              borderRadius: 3,
                              fontSize: '0.76rem',
                              color: 'var(--em-text)',
                            }}
                          >
                            <span style={{ color: 'var(--em-gold)' }}>🎯</span>
                            <span>{ct(g.text)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Footer: budget + CTA */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--em-border)', paddingTop: 8, marginTop: 'auto' }}>
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.9rem', color: '#5ed88a', fontWeight: 800 }}>
                        💰 {formatMoney(budget)}
                      </span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--em-gold)', fontWeight: 700 }}>
                        {ct('Aceitar desafio')} →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </DashCard>
        );
      })}
    </div>
  );
}

// redimensiona a imagem enviada pra 128px (contain) e devolve um PNG data-url
// pequeno — evita estourar o localStorage/save na nuvem com um arquivo grande.
function resizeLogoToDataUrl(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('img'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('ctx'));
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function FoundOrg({ onFound, onExit, founder = false }: { onFound: (org: NonNullable<CareerSave['org']>) => void; onExit: () => void; founder?: boolean }) {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [c1, setC1] = useState('#101820');
  const [c2, setC2] = useState('#3a3a3a');
  const [emblem, setEmblem] = useState<EmblemId>('shield');
  const [customLogo, setCustomLogo] = useState<string | null>(null); // upload do Fundador
  const [logoErr, setLogoErr] = useState('');

  // Fundador pode subir a própria logo; senão, usa o emblema construído.
  const logo = useMemo(() => customLogo ?? buildLogoDataUrl(emblem, c1, c2, tag || name), [customLogo, emblem, c1, c2, tag, name]);
  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setLogoErr('');
    if (file.size > 5_000_000) { setLogoErr(ct('Imagem muito grande (máx 5MB).')); return; }
    try { setCustomLogo(await resizeLogoToDataUrl(file)); } catch { setLogoErr(ct('Não foi possível ler a imagem.')); }
  };

  const canFound = name.trim() && tag.trim();

  return (
    <div className="em-found fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 20px 24px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header banner */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(232,193,112,0.12) 0%, transparent 60%)',
          border: '1px solid var(--em-border)',
          borderRadius: 6,
        }}
      >
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 800 }}>
            ✨ {ct('Modo carreira · fundar do zero')}
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: '1.5rem', fontWeight: 900, color: 'var(--em-text)' }}>
            {ct('Fundar organização')}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: 'var(--em-muted)', maxWidth: 580, lineHeight: 1.45 }}>
            {ct('Crie sua org nos tempos atuais (CS2). Começa com')} <b style={{ color: 'var(--em-text)' }}>{formatMoney(STARTING_BUDGET)}</b> {ct('pra montar 5 + coach, fechar patrocínios e brigar pelo Major. Sem lendas do passado: construa do zero.')}
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          style={{
            padding: '8px 14px',
            background: 'var(--em-panel-2)',
            color: 'var(--em-text)',
            border: '1px solid var(--em-border)',
            borderRadius: 4,
            fontFamily: 'inherit',
            fontWeight: 600,
            fontSize: '0.84rem',
            cursor: 'pointer',
          }}
        >
          ← {ct('Sair')}
        </button>
      </header>

      {/* Grid 2 colunas: identidade | preview. CSS responsivo no .em-found-grid:
         desktop 2 cols, mobile 1 col (preview embaixo da edição). Antes era inline
         com minmax(280px,1fr)+minmax(260px,320px) = 540px mínimo, estourava no celular. */}
      <div className="em-found-grid">
        {/* IDENTIDADE */}
        <DashCard title={ct('Identidade da org')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FoundField label={ct('Nome da organização')}>
              <FoundInput value={name} maxLength={24} placeholder={ct('ex: Astro Esports')} onChange={setName} />
            </FoundField>
            <FoundField label={ct('Tag (até 4 letras)')}>
              <FoundInput value={tag} maxLength={4} placeholder="ASTR" upper onChange={(v) => setTag(v.toUpperCase())} />
            </FoundField>
            <FoundField label={ct('Cores (primária / secundária)')}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <ColorSwatch value={c1} onChange={setC1} label={ct('Primária')} />
                <ColorSwatch value={c2} onChange={setC2} label={ct('Texto / emblema')} />
                <span style={{ fontSize: '0.72rem', color: 'var(--em-muted)' }}>
                  {ct('a secundária colore o texto/emblema')}
                </span>
              </div>
            </FoundField>
            <FoundField label={ct('Emblema')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))', gap: 6 }}>
                {EMBLEMS.map((em) => (
                  <button
                    key={em.id}
                    type="button"
                    onClick={() => setEmblem(em.id)}
                    title={em.label}
                    style={{
                      padding: 4,
                      background: emblem === em.id ? 'var(--em-gold)' : 'var(--em-panel-2)',
                      border: `1px solid ${emblem === em.id ? 'var(--em-gold)' : 'var(--em-border)'}`,
                      borderRadius: 4,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img src={buildLogoDataUrl(em.id, c1, c2, tag || name)} alt={em.label} width={36} height={36} />
                  </button>
                ))}
              </div>
            </FoundField>

            {/* Founder upload */}
            {founder ? (
              <FoundField label={`👑 ${ct('Logo própria')} (${ct('vantagem de Fundador')})`}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => { void onUpload(e.target.files?.[0]); e.target.value = ''; }}
                    style={{ color: 'var(--em-text)', fontSize: '0.78rem' }}
                  />
                  {customLogo && (
                    <button
                      type="button"
                      onClick={() => setCustomLogo(null)}
                      style={{
                        padding: '4px 10px',
                        background: 'transparent',
                        color: 'var(--em-text)',
                        border: '1px solid var(--em-border)',
                        borderRadius: 3,
                        fontFamily: 'inherit',
                        fontSize: '0.74rem',
                        cursor: 'pointer',
                      }}
                    >
                      {ct('Usar emblema')}
                    </button>
                  )}
                </div>
                {logoErr && <div style={{ marginTop: 4, fontSize: '0.74rem', color: '#e58a8a' }}>{logoErr}</div>}
                {customLogo && <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--em-muted)' }}>{ct('Logo enviada — redimensionada pra 128px.')}</div>}
              </FoundField>
            ) : (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--em-panel-2)',
                  border: '1px dashed var(--em-border)',
                  borderRadius: 4,
                  fontSize: '0.74rem',
                  color: 'var(--em-muted)',
                }}
              >
                👑 {ct('Subir a própria logo é vantagem de Fundador.')}
              </div>
            )}
          </div>
        </DashCard>

        {/* PREVIEW */}
        <DashCard title={ct('Pré-visualização')} info={ct('como aparece in-game')}>
          <div
            style={{
              padding: '20px 16px',
              background: `linear-gradient(150deg, ${c1} 0%, #0c0f14 80%)`,
              border: '1px solid var(--em-border)',
              borderRadius: 6,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <img src={logo} alt="logo" style={{ width: 96, height: 96, objectFit: 'contain' }} />
            <div style={{ fontSize: '1rem', fontWeight: 900, color: '#fff', textAlign: 'center' }}>
              {name || ct('Sua Organização')}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '1px', color: c2, fontFamily: '"JetBrains Mono", monospace' }}>
              {(tag || 'ORG').toUpperCase()}
            </div>
          </div>
          {/* Mini-thumbs em vários tamanhos */}
          <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--em-panel-2)', border: '1px solid var(--em-border)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
            <TeamBadge tag={tag || 'ORG'} colors={[c1, c2]} size={40} logoUrl={logo} />
            <TeamBadge tag={tag || 'ORG'} colors={[c1, c2]} size={28} logoUrl={logo} />
            <TeamBadge tag={tag || 'ORG'} colors={[c1, c2]} size={18} logoUrl={logo} />
            <span style={{ fontSize: '0.7rem', color: 'var(--em-muted)' }}>
              {ct('lista · bracket · header')}
            </span>
          </div>
        </DashCard>
      </div>

      {/* CTA fundar */}
      <button
        type="button"
        disabled={!canFound}
        onClick={() => onFound({ name: name.trim(), tag: tag.trim() || 'ORG', colors: [c1, c2], logo })}
        style={{
          padding: '14px 22px',
          background: canFound ? 'var(--em-gold)' : 'var(--em-panel-2)',
          color: canFound ? '#1a1205' : 'var(--em-muted)',
          border: canFound ? 'none' : '1px solid var(--em-border)',
          borderRadius: 6,
          fontFamily: 'inherit',
          fontWeight: 900,
          fontSize: '0.96rem',
          cursor: canFound ? 'pointer' : 'not-allowed',
          letterSpacing: '0.5px',
          marginTop: 4,
        }}
      >
        ✔ {ct('Fundar e abrir o mercado')}
      </button>
      {!canFound && (
        <p style={{ margin: 0, textAlign: 'center', fontSize: '0.74rem', color: 'var(--em-muted)' }}>
          {ct('Preencha nome e tag pra liberar.')}
        </p>
      )}
    </div>
  );
}

function FoundField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: 4, display: 'block' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FoundInput({ value, maxLength, placeholder, upper, onChange }: { value: string; maxLength?: number; placeholder?: string; upper?: boolean; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '8px 12px',
        background: 'var(--em-panel-2)',
        color: 'var(--em-text)',
        border: '1px solid var(--em-border)',
        borderRadius: 4,
        fontFamily: 'inherit',
        fontSize: '0.92rem',
        textTransform: upper ? 'uppercase' : undefined,
      }}
    />
  );
}

function ColorSwatch({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
      />
      <span style={{ width: 40, height: 40, background: value, border: '1px solid var(--em-border)', borderRadius: 4, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.06)' }} />
      <span style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {label}
      </span>
    </label>
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
  // Redesenhada no padrão em-* — Modal + DashCard-style sections + sliders/chips
  // legíveis. API + estados internos preservados.
  return (
    <Modal open onClose={onClose} title="" size="md">
      <div className="em-nego" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Header com player + clube */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            background: 'linear-gradient(135deg, rgba(232,193,112,0.10) 0%, transparent 60%)',
            border: '1px solid var(--em-border)',
            borderRadius: 6,
          }}
        >
          <PlayerAvatar nick={player.nick} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '1.05rem', fontWeight: 800, color: 'var(--em-text)' }}>
              <Flag cc={player.country} /> {player.nick}
              <span className={`role-pill ${player.role}`}>{player.role}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--em-muted)', marginTop: 2 }}>
              {ct('Negociando com')} <b style={{ color: 'var(--em-text)' }}>{from.team}</b> · OVR <b style={{ color: 'var(--em-gold)', fontFamily: '"JetBrains Mono", monospace' }}>{playerOvr(player)}</b>
            </div>
          </div>
        </header>

        {/* Figures: 3 cards inline */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <NegoFigure label={ct('Valor mercado')} value={formatMoney(mkt)} />
          <NegoFigure label={ct('Pedida do clube')} value={formatMoney(ask)} accent="#e8c170" />
          <NegoFigure label={ct('Salário / split')} value={formatMoney(wage)} accent="#e58a8a" />
        </div>

        {/* Swap pool (só se habilitado) */}
        {swapPool && swapPool.length > 0 && (
          <div>
            <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 800, marginBottom: 6 }}>
              {ct('Incluir na troca (abate o valor em dinheiro)')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {swapPool.map((p) => {
                const on = swapOut.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleSwap(p.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 10px',
                      background: on ? 'rgba(232,193,112,0.18)' : 'var(--em-panel-2)',
                      color: on ? 'var(--em-gold)' : 'var(--em-text)',
                      border: `1px solid ${on ? 'var(--em-gold)' : 'var(--em-border)'}`,
                      borderRadius: 14,
                      fontFamily: 'inherit',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Flag cc={p.country} /> {p.nick}
                    <span style={{ color: 'var(--em-muted)', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem' }}>
                      {formatMoney(playerValue(p))}
                    </span>
                  </button>
                );
              })}
            </div>
            {swapValue > 0 && (
              <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--em-muted)' }}>
                {ct('Valor da troca:')} <b style={{ color: '#5ed88a', fontFamily: '"JetBrains Mono", monospace' }}>{formatMoney(swapValue)}</b>
              </div>
            )}
          </div>
        )}

        {/* Offer + slider */}
        <div
          style={{
            padding: 12,
            background: 'var(--em-panel-2)',
            border: '1px solid var(--em-border)',
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <PresetBtn label={ct('Baixa')} onClick={() => { setOffer(Math.max(0, Math.round(ask * 0.7) - swapValue)); reset(); }} />
            <PresetBtn label={ct('Justa')} onClick={() => { setOffer(Math.max(0, ask - swapValue)); reset(); }} primary />
            <PresetBtn label={ct('Generosa')} onClick={() => { setOffer(Math.max(0, Math.round(ask * 1.1) - swapValue)); reset(); }} />
          </div>
          <input
            type="range"
            min={0}
            max={Math.round(ask * 1.4)}
            step={10000}
            value={offer}
            onChange={(e) => { setOffer(Number(e.target.value)); reset(); }}
            style={{ width: '100%', accentColor: 'var(--em-gold)' }}
          />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: '0.86rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--em-muted)' }}>{ct('Dinheiro:')}</span>
            <b style={{ fontFamily: '"JetBrains Mono", monospace', color: overBudget ? '#e58a8a' : 'var(--em-text)', fontSize: '1.1rem', fontWeight: 900 }}>
              {formatMoney(offer)}
            </b>
            {swapValue > 0 && (
              <span style={{ color: 'var(--em-muted)', fontSize: '0.78rem' }}>
                + troca <b style={{ color: '#5ed88a', fontFamily: '"JetBrains Mono", monospace' }}>{formatMoney(swapValue)}</b> = oferta total <b style={{ color: 'var(--em-text)', fontFamily: '"JetBrains Mono", monospace' }}>{formatMoney(effectiveOffer)}</b>
              </span>
            )}
            {overBudget && (
              <span style={{ color: '#e58a8a', fontSize: '0.76rem', fontWeight: 700 }}>· {ct('sem caixa')}</span>
            )}
          </div>
        </div>

        {/* Reply do clube */}
        {reply && (
          <div
            style={{
              padding: '10px 14px',
              background:
                reply.kind === 'accept' ? 'rgba(94,216,138,0.12)' :
                reply.kind === 'counter' ? 'rgba(232,193,112,0.12)' :
                'rgba(229,138,138,0.12)',
              border: `1px solid ${
                reply.kind === 'accept' ? 'rgba(94,216,138,0.45)' :
                reply.kind === 'counter' ? 'rgba(232,193,112,0.45)' :
                'rgba(229,138,138,0.45)'
              }`,
              borderLeft: `3px solid ${
                reply.kind === 'accept' ? '#5ed88a' :
                reply.kind === 'counter' ? '#e8c170' :
                '#e58a8a'
              }`,
              borderRadius: 4,
              fontSize: '0.84rem',
              color: 'var(--em-text)',
              lineHeight: 1.5,
            }}
          >
            {reply.kind === 'accept' && <span>✅ {from.team} {ct('aceitou a oferta de')} <b>{formatMoney(effectiveOffer)}</b>.</span>}
            {reply.kind === 'counter' && <span>↔️ {from.team} {ct('quer')} <b>{formatMoney(reply.value)}</b> {ct('no total')}{swapValue > 0 ? ` (${formatMoney(counterCash)} ${ct('em dinheiro + sua troca')})` : ''}.</span>}
            {reply.kind === 'reject' && <span>❌ {reply.msg}</span>}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--em-border)', paddingTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: 'var(--em-text)',
              border: '1px solid var(--em-border)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.84rem',
              cursor: 'pointer',
            }}
          >
            {ct('Desistir')}
          </button>
          {reply?.kind === 'accept' ? (
            <ActionGold label={ct('Fechar acordo')} onClick={() => onAgree(offer, swapOut)} />
          ) : reply?.kind === 'counter' ? (
            <>
              <button
                type="button"
                disabled={overBudget}
                onClick={submit}
                style={{
                  padding: '8px 16px',
                  background: 'var(--em-panel-2)',
                  color: overBudget ? 'var(--em-muted)' : 'var(--em-text)',
                  border: '1px solid var(--em-border)',
                  borderRadius: 4,
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  cursor: overBudget ? 'not-allowed' : 'pointer',
                }}
              >
                {ct('Insistir')}
              </button>
              <ActionGold
                label={`${ct('Aceitar')} (${formatMoney(counterCash)})`}
                disabled={counterCash > budget}
                onClick={() => onAgree(counterCash, swapOut)}
              />
            </>
          ) : reply?.kind === 'reject' && reply.firm ? (
            <ActionGold label={ct('Sair')} onClick={onClose} />
          ) : (
            <ActionGold label={ct('Fazer proposta')} disabled={overBudget} onClick={submit} />
          )}
        </div>
      </div>
    </Modal>
  );
}

function NegoFigure({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: '8px 10px', background: 'var(--em-panel-2)', border: '1px solid var(--em-border)', borderRadius: 4, lineHeight: 1.2 }}>
      <div style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
        {label}
      </div>
      <b style={{ fontFamily: '"JetBrains Mono", monospace', color: accent ?? 'var(--em-text)', fontSize: '0.96rem', fontWeight: 800 }}>
        {value}
      </b>
    </div>
  );
}

function PresetBtn({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '5px 10px',
        background: primary ? 'rgba(232,193,112,0.14)' : 'transparent',
        color: primary ? 'var(--em-gold)' : 'var(--em-text)',
        border: `1px solid ${primary ? 'rgba(232,193,112,0.45)' : 'var(--em-border)'}`,
        borderRadius: 4,
        fontFamily: 'inherit',
        fontWeight: 700,
        fontSize: '0.76rem',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function ActionGold({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 18px',
        background: disabled ? 'var(--em-panel-2)' : 'var(--em-gold)',
        color: disabled ? 'var(--em-muted)' : '#1a1205',
        border: disabled ? '1px solid var(--em-border)' : 'none',
        borderRadius: 4,
        fontFamily: 'inherit',
        fontWeight: 900,
        fontSize: '0.84rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: '0.3px',
      }}
    >
      {label}
    </button>
  );
}

// ---------- negociações durante a temporada (acordos pendentes p/ a janela) ----------
function SeasonNegotiations({ market, squadPlayers, budget, pendingDeals, pendingSales, offers, onAddDeal, onCancelDeal, onAcceptOffer, onRejectOffer, onCancelSale, feed }: {
  market: { player: Player; from: TeamSeason; price: number }[];
  squadPlayers: Player[];
  budget: number;
  pendingDeals: PendingDeal[];
  pendingSales: { playerId: string; nick: string; fee: number; toTag: string; toId: string }[];
  offers: { playerId: string; nick: string; ovr: number; country: string; fee: number; toTag: string; toId: string; toName: string }[];
  onAddDeal: (d: PendingDeal) => void;
  onCancelDeal: (id: string) => void;
  onAcceptOffer: (o: { playerId: string; nick: string; fee: number; toTag: string; toId: string }) => void;
  onRejectOffer: (playerId: string) => void;
  onCancelSale: (playerId: string) => void;
  feed: TransferItem[];
}) {
  const [target, setTarget] = useState<{ player: Player; from: TeamSeason } | null>(null);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [countryFilter, setCountryFilter] = useState('');
  const marketRoles = ROLE_OPTS.filter((role) => market.some((item) => item.player.role === role));
  const marketCountries = [...new Set(market.map((m) => m.player.country).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const committedCash = pendingDeals.reduce((a, d) => a + d.fee, 0);
  const dealBudget = budget - committedCash;
  const committedOut = new Set(pendingDeals.flatMap((d) => d.outPlayerIds));
  const targeted = new Set(pendingDeals.map((d) => d.inPlayerId));
  const squadIds = new Set(squadPlayers.map((p) => p.id));
  const swapPool = squadPlayers.filter((p) => !committedOut.has(p.id));
  const filteredMarket = market
    // free agents (sem time) também entram: negociam direto a pedida, sem clube
    .filter((m) => !targeted.has(m.player.id) && !squadIds.has(m.player.id))
    .filter((m) => matchesNegotiationFilters(m.player, m.from.team, {
      query: q,
      role: roleFilter,
      country: countryFilter,
    }))
    .sort((a, b) => playerOvr(b.player) - playerOvr(a.player));
  const list = filteredMarket.slice(0, 60);
  const filtersActive = !!(q.trim() || roleFilter || countryFilter);
  return (
    <DashCard title={ct('Mercado')}>
        <div className="muted small" style={{ marginBottom: 12 }}>
          {ct('🤝 Negociações · você fecha agora, o jogador entra na')} <b>{ct('próxima janela')}</b> (fim do split)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap', padding: '12px 16px', borderRadius: '6px', background: 'linear-gradient(120deg, var(--em-panel-2), var(--rtm-header))', border: '1px solid var(--em-border)', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--rtm-dim)', fontWeight: 700 }}>{ct('Caixa pra acordos')}</div>
            <div style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '26px', fontWeight: 800, color: dealBudget < 0 ? 'var(--rtm-red-bright)' : 'var(--rtm-gold)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(dealBudget)}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: '12px', color: 'var(--rtm-dim)' }}>
            {committedCash > 0 ? <span><b style={{ color: 'var(--rtm-gold)' }}>{formatMoney(committedCash)}</b> {ct('já comprometido')}</span> : ct('Janela aberta · feche acordos pra próxima temporada')}
          </div>
        </div>
        {(offers.length > 0 || pendingSales.length > 0) && (
          <div className="nego-offers">
            <div className="muted small section-label" style={{ marginTop: 0 }}>{ct('📨 Propostas pelos seus jogadores')}</div>
            {pendingSales.map((s) => (
              <div key={s.playerId} className="nego-offer-row sold">
                <span className="nego-offer-who">💸 <b>{s.nick}</b> <span className="muted small">vendido pra {s.toTag}</span></span>
                <span className="nego-offer-fee pos">{formatMoney(s.fee)}</span>
                <button className="btn ghost small" onClick={() => onCancelSale(s.playerId)}>{ct('Desfazer')}</button>
              </div>
            ))}
            {offers.map((o) => (
              <div key={o.playerId} className="nego-offer-row">
                <span className="nego-offer-who"><Flag cc={o.country} /> <b>{o.nick}</b> <span className="muted small">OVR {o.ovr} · {o.toName} quer</span></span>
                <span className="nego-offer-fee">{formatMoney(o.fee)}</span>
                <button className="btn gold small" onClick={() => onAcceptOffer({ playerId: o.playerId, nick: o.nick, fee: o.fee, toTag: o.toTag, toId: o.toId })}>{ct('Vender')}</button>
                <button className="btn ghost small" onClick={() => onRejectOffer(o.playerId)}>{ct('Recusar')}</button>
              </div>
            ))}
            <p className="muted small" style={{ margin: '6px 0 0' }}>{ct('Aceitar vende o jogador na próxima janela (a grana entra no caixa). O jogador continua jogando até lá.')}</p>
          </div>
        )}
        {pendingDeals.length > 0 && (
          <div className="nego-pending">
            <div className="muted small section-label">{ct('Acordos fechados')} ({pendingDeals.length})</div>
            {pendingDeals.map((d) => (
              <div key={d.id} className="nego-deal-row">
                <span className="nego-deal-in">🤝 <b>{d.inNick}</b></span>
                <span className="muted small">{formatMoney(d.fee)}{d.outNicks.length > 0 ? ` ${ct('+ troca:')} ${d.outNicks.join(', ')}` : ''}</span>
                <button className="btn ghost small" onClick={() => onCancelDeal(d.id)}>{ct('Cancelar')}</button>
              </div>
            ))}
          </div>
        )}
        <div className="muted small section-label">
          {ct('Mercado · negocie com os clubes')} · {filteredMarket.length} {ct(filteredMarket.length === 1 ? 'jogador' : 'jogadores')}
        </div>
        <div className="market-filters negotiation-filter-bar">
          <input className="mf-search" aria-label={ct('Buscar jogador ou time')} placeholder={ct('Buscar jogador ou time…')} value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="mf-select" aria-label={ct('Filtrar por função')} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | '')}>
            <option value="">{ct('Todas as funções')}</option>
            {marketRoles.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <select className="mf-select" aria-label={ct('Filtrar por nacionalidade')} value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
            <option value="">{ct('Todos os países')}</option>
            {marketCountries.map((country) => <option key={country} value={country}>{country.toUpperCase()}</option>)}
          </select>
          {filtersActive && (
            <button className="mf-clear" type="button" onClick={() => { setQ(''); setRoleFilter(''); setCountryFilter(''); }}>
              {ct('✕ Limpar')}
            </button>
          )}
        </div>
        <div className="career-market scroll">
          {list.length === 0 && <div className="muted small" style={{ padding: 12 }}>{ct('Nenhum jogador com esse filtro.')}</div>}
          {list.map((m) => (
            <button key={m.player.id} className="pcard" onClick={() => setTarget({ player: m.player, from: m.from })}>
              <PlayerAvatar nick={m.player.nick} size={48} />
              <OvrBadge ovr={playerOvr(m.player)} />
              <div className="nick">{m.player.nick}</div>
              <div className="meta"><span className={`role-pill ${m.player.role}`}>{m.player.role}</span></div>
              <div className="meta muted small">
                <TeamBadge tag={m.from.tag} colors={m.from.colors} size={16} logoUrl={m.from.logoUrl ?? logoForTeam(m.from)} /> {m.from.team}
              </div>
              <div className="meta small"><span className="muted">{ct('pedida')}</span> {formatMoney(askingPrice(m.player, m.from.teamwork))}</div>
            </button>
          ))}
        </div>
        <div className="muted small section-label">{ct('Rumores da janela')}</div>
        <TransferFeed items={feed} compact />
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
    </DashCard>
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
  findSigning: (s: Signing) => ResolvedSigning | null;
  onConfirm: (squad: Signing[], coachFromId: string, budget: number, sponsors: string[], sponsorUntil: Record<string, number>) => void;
  onExit: () => void;
  embedded?: boolean;
}) {
  const [initialSquad] = useState(() => partitionResolvable(save.squad, findSigning));
  const [squad, setSquad] = useState<Signing[]>(initialSquad.resolved);
  const recoveredSlots = initialSquad.unresolved.length;
  const [nego, setNego] = useState<{ player: Player; from: TeamSeason } | null>(null);
  // Limite de jogadores visíveis (paginação 'load more'). Antes era 60 fixo
  // com mensagem 'Refine filtros'. User reportou (Fundador #103) que o resto
  // ficava inalcançável mesmo filtrando. Agora botão carrega +60 por clique.
  const [marketLimit, setMarketLimit] = useState(60);
  // Reset do limite quando filtros mudam: ao aplicar um filtro novo o user
  // espera começar do zero, não continuar de onde parou na paginação anterior.
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
  // todos os signings precisam RESOLVER (findSigning != null) — senão o slot fica
  // vazio na hora de buildTeam e a carreira não avança apesar do contador mostrar 5/5.
  const unresolvedCount = squad.filter((s) => !findSigning(s)).length;
  const ready = squad.length === 5 && unresolvedCount === 0 && !!coachId && budgetLeft >= 0;

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

  // ── derivações pro redesign ────────────────────────────────────────────────
  const academyAvail = (save.academy ?? []).filter((a) => !squad.some((s) => s.playerId === a.id));
  const sponsorVrs = userVrsTotal(save, findSigning, coaches);
  const filtersActive = !!(filter || roleFilter || ccFilter);
  // reset do paginador quando filtros mudam (cada novo filtro = começar do zero)
  useEffect(() => { setMarketLimit(60); }, [filter, roleFilter, ccFilter]);
  const PLAN_LABEL_FOR_BTN = embedded ? ct('Salvar elenco') : ct('Fechar elenco e escolher o campeonato');

  return (
    <div className="em-market fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 20px 24px' }}>
      {/* ── Header bem visível (resolve tooltip sobrepondo + cliente em destaque) */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(232,193,112,0.10) 0%, transparent 60%)',
          border: '1px solid var(--em-border)',
          borderRadius: 6,
        }}
      >
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 800 }}>
            Janela de transferências
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: '1.5rem', fontWeight: 900, color: 'var(--em-text)', letterSpacing: '-0.3px' }}>
            Split {save.split} · {save.org?.name ?? '—'}
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HudPill label="Orçamento" value={formatMoney(budgetLeft)} tone={budgetLeft >= 0 ? 'green' : 'red'} mono />
          <HudPill label="Elenco" value={`${squad.length}/5`} tone={squad.length === 5 ? 'green' : 'neutral'} mono />
          <HudPill label="Coach" value={coachId ? '✓' : '—'} tone={coachId ? 'green' : 'red'} />
          <button
            type="button"
            onClick={onExit}
            style={{
              padding: '8px 14px',
              background: 'var(--em-panel-2)',
              color: 'var(--em-text)',
              border: '1px solid var(--em-border)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.84rem',
              cursor: 'pointer',
            }}
          >
            ← {embedded ? ct('Voltar') : ct('Sair')}
          </button>
        </div>
      </header>

      {/* Banners de status (warnings / contratos vencidos / save reparado) */}
      {(save.lastReleases?.length ?? 0) > 0 && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(229,138,138,0.10)',
            border: '1px solid rgba(229,138,138,0.35)',
            borderRadius: 4,
            color: 'var(--em-text)',
            fontSize: '0.86rem',
          }}
        >
          📄 <b>{ct('Contrato vencido:')}</b> <b>{save.lastReleases!.join(', ')}</b> — {ct('saiu de graça. Reforce o elenco no mercado.')}
        </div>
      )}
      {recoveredSlots > 0 && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            background: 'rgba(232,193,112,0.10)',
            border: '1px solid rgba(232,193,112,0.35)',
            borderRadius: 4,
            color: 'var(--em-text)',
            fontSize: '0.86rem',
          }}
        >
          <b>{ct('Save reparado:')}</b>{' '}
          {recoveredSlots === 1
            ? ct('1 jogador de uma versão antiga não pôde ser recuperado e teve a vaga liberada.')
            : `${recoveredSlots} ${ct('jogadores de uma versão antiga não puderam ser recuperados e tiveram as vagas liberadas.')}`}
        </div>
      )}

      {/* Evolução do elenco (só quando há mudanças relevantes) */}
      {(save.lastEvo?.length ?? 0) > 0 && (
        <DashCard title={ct('Evolução do elenco na janela')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {save.lastEvo.map((e) => {
              const isUp = e.delta > 0;
              const isDown = e.delta < 0;
              return (
                <span
                  key={e.nick}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    background: isUp ? 'rgba(94,216,138,0.12)' : isDown ? 'rgba(229,138,138,0.12)' : 'var(--em-panel-2)',
                    border: `1px solid ${isUp ? 'rgba(94,216,138,0.4)' : isDown ? 'rgba(229,138,138,0.4)' : 'var(--em-border)'}`,
                    borderRadius: 4,
                    fontSize: '0.78rem',
                    color: 'var(--em-text)',
                  }}
                >
                  <b style={{ color: isUp ? '#5ed88a' : isDown ? '#e58a8a' : 'var(--em-muted)', fontFamily: '"JetBrains Mono", monospace' }}>
                    {isUp ? '▲' : isDown ? '▼' : '▬'} {e.nick}
                  </b>
                  <i style={{ color: 'var(--em-muted)', fontSize: '0.72rem', fontStyle: 'normal' }}>
                    {isUp ? `+${e.delta}` : e.delta} · {ct(PHASE_LABEL[e.phase])}
                  </i>
                </span>
              );
            })}
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--em-muted)', lineHeight: 1.5 }}>
            Entre temporadas o elenco evolui: jogador <b>{ct('em ascensão')}</b> melhora,
            <b> {ct('no auge')}</b> oscila e <b>{ct('veterano em declínio')}</b> cai.
            O valor e o salário acompanham os atributos.
          </p>
        </DashCard>
      )}

      {/* ── 3-COL LAYOUT ────────────────────────────────────────────────────── */}
      {/* grid-template-columns vive no CSS (.em-market-grid) — responsivo: 3 cols
         no desktop, 2 cols no tablet (mercado + elenco em cima, coach embaixo
         full-width), 1 col no mobile com mercado em primeiro pra resolver o
         'não aparece o mercado' reportado. */}
      <div className="em-market-grid">

        {/* ─── ESQUERDA: Seu time + Academia ───────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <DashCard
            title={`${ct('Seu elenco')} (${squad.length}/5)`}
            info={ct('Clique pra dispensar (vende a 85% se for jogador atual).')}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[0, 1, 2, 3, 4].map((i) => {
                const s = squad[i];
                const f = s ? findSigning(s) : null;
                if (!f) {
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '14px 10px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px dashed var(--em-border)',
                        borderRadius: 4,
                        color: 'var(--em-muted)',
                        fontSize: '0.78rem',
                        fontStyle: 'italic',
                      }}
                    >
                      Vaga {i + 1}
                    </div>
                  );
                }
                return (
                  <SquadRow
                    key={i}
                    player={f.player}
                    rightLabel={`${formatMoney(playerValue(f.player))}`}
                    rightHint={ct('dispensar')}
                    tone="release"
                    onClick={() => setSquad(squad.filter((x) => x.playerId !== s!.playerId))}
                  />
                );
              })}
            </div>
          </DashCard>

          {academyAvail.length > 0 && (
            <DashCard
              title={ct('Promover da academia')}
              info={ct('Grátis. Cresce com treino.')}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {academyAvail.map((a) => {
                  const full = squad.length >= 5;
                  return (
                    <SquadRow
                      key={a.id}
                      player={a}
                      rightLabel={`${a.age}a · pot ${a.potential}`}
                      rightHint={full ? '' : ct('promover')}
                      tone="promote"
                      disabled={full}
                      disabledHint={full ? ct('Elenco cheio') : undefined}
                      onClick={() => { if (!full) setSquad([...squad, { playerId: a.id, fromId: '__youth__' }]); }}
                    />
                  );
                })}
              </div>
            </DashCard>
          )}
        </div>

        {/* ─── CENTRO: Mercado de jogadores ─────────────────────────────────── */}
        <DashCard
          title={`${ct('Mercado')} (${visible.length}/${market.length})`}
          actions={
            filtersActive ? (
              <button
                type="button"
                onClick={() => { setRoleFilter(''); setCcFilter(''); setFilter(''); }}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.72rem',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  background: 'transparent',
                  color: 'var(--em-text)',
                  border: '1px solid var(--em-border)',
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                ✕ {ct('Limpar filtros')}
              </button>
            ) : undefined
          }
        >
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              type="text"
              placeholder={ct('Buscar jogador ou time…')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--em-panel-2)',
                color: 'var(--em-text)',
                border: '1px solid var(--em-border)',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontSize: '0.86rem',
              }}
            />
            <select
              value={ccFilter}
              onChange={(e) => setCcFilter(e.target.value)}
              title={ct('Filtrar por nacionalidade')}
              style={{
                padding: '8px 12px',
                background: 'var(--em-panel-2)',
                color: 'var(--em-text)',
                border: '1px solid var(--em-border)',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontSize: '0.84rem',
                minWidth: 140,
              }}
            >
              <option value="">🌐 {ct('País')} ({ct('todos')})</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c.toUpperCase()} ({countryCounts[c]})</option>
              ))}
            </select>
          </div>

          {/* Role chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            <RoleChip label={ct('Todas')} active={!roleFilter} onClick={() => setRoleFilter('')} />
            {ROLE_OPTS.map((r) => (
              <RoleChip
                key={r}
                label={r}
                role={r}
                active={roleFilter === r}
                onClick={() => setRoleFilter(roleFilter === r ? '' : r)}
              />
            ))}
          </div>
          {/* Grid de jogadores (mantém pcard pra reuso do CSS existente) */}
          {visible.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--em-muted)', fontSize: '0.86rem', fontStyle: 'italic' }}>
              {ct('Nenhum jogador com esses filtros.')}
            </div>
          ) : (
            // maxHeight só no desktop (col-mid limitado pra não crescer demais).
            // No mobile vira 1-col e a lista flui no scroll natural da página
            // — sem isso, calc(100vh - 360px) virava negativo no celular e
            // 'nenhum jogador aparecia'. Slice(0,60) já bounded a renderização.
            <div className="career-market scroll em-market-list">
              {visible.slice(0, marketLimit).map((m) => {
                const dup = signedNicks.has(m.player.nick.toLowerCase());
                const isFA = m.from.id === '__free__';
                const canPick = squad.length < 5 && !dup && (isFA ? m.price <= budgetLeft : true);
                return (
                  <button
                    key={m.player.id}
                    className={`pcard${!canPick ? ' taken' : ''}`}
                    disabled={!canPick}
                    onClick={() =>
                      isFA
                        ? setSquad([...squad, signingWithSnapshot({ playerId: m.player.id, fromId: m.from.id, fee: m.price }, { player: m.player, from: m.from, basePlayer: m.player })])
                        : setNego({ player: m.player, from: m.from })
                    }
                  >
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
                            <span title={ct('Idade')}>🎂 {age}a</span>
                            <span className={`pot-badge pot-${pot}`} title={ct('Potencial (teto de OVR)')}>POT {pot}</span>
                          </div>
                          <div className={`meta small phase-tag ${ph}`} title={ct('Jovem em ascensão melhora entre temporadas; veterano cai')}>
                            {ph === 'rising' ? '📈' : ph === 'declining' ? '📉' : '▬'} {ct(PHASE_LABEL[ph])}
                          </div>
                        </>
                      );
                    })()}
                    <div className="price buy">💰 {formatMoney(m.price)}</div>
                    {dup && <div className="meta muted small">{ct('já contratado')}</div>}
                  </button>
                );
              })}
              {visible.length > marketLimit && (
                <div style={{ gridColumn: '1 / -1', padding: 10, textAlign: 'center', color: 'var(--em-muted)', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <span>{ct('Mostrando')} {marketLimit} {ct('de')} {visible.length}</span>
                  <button
                    type="button"
                    onClick={() => setMarketLimit((n) => n + 60)}
                    style={{
                      padding: '6px 16px',
                      background: 'var(--em-gold)',
                      color: '#1a1205',
                      border: 'none',
                      borderRadius: 4,
                      fontFamily: 'inherit',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      letterSpacing: '0.3px',
                    }}
                  >
                    ⬇ {ct('Carregar mais')} (+60)
                  </button>
                </div>
              )}
            </div>
          )}
        </DashCard>

        {/* ─── DIREITA: Coach + Sponsors + Rumores ──────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <DashCard
            title={ct('Coach')}
            info={`${coachOptions.length + 1} ${ct('disponíveis')}`}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
              <CoachRow
                nick={ROOKIE_COACH.nick}
                name={ROOKIE_COACH.name}
                country={ROOKIE_COACH.country ?? '??'}
                rating={ROOKIE_COACH.rating}
                fee={coachFee(ROOKIE_COACH)}
                selected={coachId === ROOKIE_ID}
                tag={ct('Estreante')}
                onClick={() => setCoachId(coachId === ROOKIE_ID ? null : ROOKIE_ID)}
              />
              {coachOptions.slice(0, 24).map((t) => (
                <CoachRow
                  key={t.id}
                  nick={t.coach.nick}
                  name={t.coach.name}
                  country={t.coach.country ?? '??'}
                  rating={t.coach.rating}
                  fee={coachFee(t.coach)}
                  selected={coachId === t.id}
                  tag={t.tag}
                  onClick={() => setCoachId(coachId === t.id ? null : t.id)}
                />
              ))}
            </div>
          </DashCard>

          <DashCard
            title={`${ct('Patrocínios')} (${sponsors.length}/${SPONSOR_SLOTS})`}
            info={`+${formatMoney(sponsorIncome(sponsors))}/split`}
          >
            <div className="sponsor-grid">
              {SPONSORS.map((sp) => {
                const active = sponsors.includes(sp.id);
                const committed = active && underContract(sp.id);
                const reqVrs = !active && sp.minVrs > sponsorVrs;
                const full = !active && sponsors.length >= SPONSOR_SLOTS;
                const blocked = reqVrs || full;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    className={`sponsor-card${active ? ' on' : ''}${blocked ? ' locked' : ''}${committed ? ' committed' : ''}`}
                    disabled={blocked}
                    onClick={() => !blocked && toggleSponsor(sp.id)}
                    title={
                      reqVrs ? `${ct('Requer')} ${sp.minVrs} VRS`
                      : full ? ct('Slots cheios')
                      : committed ? `${ct('Contrato até o Split')} ${sponsorUntil[sp.id]}`
                      : active ? ct('Contrato encerrado: clique para sair')
                      : `${ct('Compromisso de')} ${sp.term} splits`
                    }
                  >
                    <span className="sp-logo" style={{ background: sp.color }}>{sp.name.slice(0, 1)}</span>
                    <span className="sp-name">{sp.name}</span>
                    <span className="sp-pay pos">+{formatMoney(sp.perSplit)}</span>
                    {reqVrs && <span className="sp-lock muted small">{sp.minVrs} VRS</span>}
                    {!active && !reqVrs && <span className="sp-lock muted small">{sp.term} splits</span>}
                    {committed && <span className="sp-lock muted small">🔒 até Split {sponsorUntil[sp.id]}</span>}
                    {active && !committed && <span className="sp-lock muted small">{ct('renovável')}</span>}
                    {active && <span className="sp-check">✔</span>}
                  </button>
                );
              })}
            </div>
          </DashCard>

          {(save.lastMoves?.length ?? 0) > 0 && (
            <DashCard title={ct('Confirmadas na janela anterior')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {save.lastMoves.map((mv, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '6px 10px',
                      background: 'var(--em-panel-2)',
                      borderRadius: 4,
                      fontSize: '0.78rem',
                      color: 'var(--em-text)',
                    }}
                  >
                    <b>{mv.nick}</b>{' '}
                    <span style={{ color: 'var(--em-muted)' }}>{mv.from} →</span>{' '}
                    <b>{mv.to}</b>
                  </div>
                ))}
              </div>
            </DashCard>
          )}

          <DashCard title={ct('Rumores da próxima janela')}>
            <TransferFeed items={marketFeed} />
          </DashCard>
        </div>
      </div>

      {/* Sticky bottom: confirmar. `bottom` é controlado por CSS (em-market-sticky-bottom)
         pra reagir ao body.has-ad-footer (sobe 126px no desktop / 92px no mobile,
         senão o banner G4 engole o botão). flex/wrap pro mobile não quebrar layout. */}
      <div
        className="em-market-sticky-bottom"
        style={{
          position: 'sticky',
          marginTop: 4,
          padding: '12px 18px',
          background: 'var(--em-panel)',
          border: '1px solid var(--em-border)',
          borderRadius: 6,
          boxShadow: '0 -4px 16px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.82rem', color: 'var(--em-muted)' }}>
          {squad.length < 5 && <span>⚠ {ct('Faltam')} <b style={{ color: 'var(--em-text)' }}>{5 - squad.length}</b> {ct('jogador(es)')}</span>}
          {squad.length === 5 && unresolvedCount > 0 && <span style={{ color: '#e58a8a' }}>⚠ {unresolvedCount} {ct('jogador(es) com vaga vazia — remova e escolha outro')}</span>}
          {squad.length === 5 && !coachId && <span>⚠ {ct('Escolha um coach')}</span>}
          {budgetLeft < 0 && <span style={{ color: '#e58a8a' }}>⚠ {ct('Orçamento estourado')}</span>}
          {ready && <span style={{ color: '#5ed88a', fontWeight: 700 }}>✓ {ct('Pronto pra fechar')}</span>}
        </div>
        <button
          type="button"
          disabled={!ready}
          onClick={() => coachId && onConfirm(squad, coachId, budgetLeft, sponsors, sponsorUntil)}
          style={{
            padding: '10px 24px',
            background: ready ? 'var(--em-gold)' : 'var(--em-panel-2)',
            color: ready ? '#1a1205' : 'var(--em-muted)',
            border: ready ? 'none' : '1px solid var(--em-border)',
            borderRadius: 4,
            fontFamily: 'inherit',
            fontWeight: 900,
            fontSize: '0.92rem',
            letterSpacing: '0.3px',
            cursor: ready ? 'pointer' : 'not-allowed',
          }}
        >
          ✔ {PLAN_LABEL_FOR_BTN}
        </button>
      </div>

      {nego && (
        <NegotiationModal
          player={nego.player}
          from={nego.from}
          budget={budgetLeft}
          onClose={() => setNego(null)}
          onAgree={(fee) => {
            setSquad([...squad, signingWithSnapshot({ playerId: nego.player.id, fromId: nego.from.id, fee }, { player: nego.player, from: nego.from, basePlayer: nego.player })]);
            setNego(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-componentes locais do MarketScreen ────────────────────────────────

function HudPill({ label, value, tone, mono }: { label: string; value: string; tone: 'green' | 'red' | 'neutral'; mono?: boolean }) {
  const colors: Record<string, { fg: string; bg: string; border: string }> = {
    green:   { fg: '#5ed88a', bg: 'rgba(94,216,138,0.12)',  border: 'rgba(94,216,138,0.4)' },
    red:     { fg: '#e58a8a', bg: 'rgba(229,138,138,0.12)', border: 'rgba(229,138,138,0.4)' },
    neutral: { fg: 'var(--em-text)', bg: 'var(--em-panel-2)', border: 'var(--em-border)' },
  };
  const c = colors[tone];
  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        padding: '5px 12px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        lineHeight: 1.1,
        minWidth: 70,
      }}
    >
      <span style={{ fontSize: '0.6rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      <b style={{ color: c.fg, fontSize: '0.94rem', fontWeight: 800, fontFamily: mono ? '"JetBrains Mono", monospace' : 'inherit' }}>
        {value}
      </b>
    </div>
  );
}

function SquadRow({
  player,
  rightLabel,
  rightHint,
  tone,
  disabled,
  disabledHint,
  onClick,
}: {
  player: Player;
  rightLabel: string;
  rightHint?: string;
  tone: 'release' | 'promote';
  disabled?: boolean;
  disabledHint?: string;
  onClick: () => void;
}) {
  const accent = tone === 'promote' ? '#5ed88a' : '#e8a93b';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? disabledHint : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        background: 'var(--em-panel-2)',
        border: '1px solid var(--em-border)',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'var(--em-text)',
        transition: 'border-color .12s, background .12s',
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.borderColor = accent; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--em-border)'; }}
    >
      <PlayerAvatar nick={player.nick} size={36} />
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.86rem', fontWeight: 700 }}>
          <Flag cc={player.country} /> {player.nick}
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.78rem', color: accent, fontWeight: 800 }}>
            {playerOvr(player)}
          </span>
        </div>
        <div style={{ marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className={`role-pill ${player.role}`}>{player.role}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 60, lineHeight: 1.15 }}>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.78rem', color: 'var(--em-text)', fontWeight: 700 }}>
          {rightLabel}
        </div>
        {rightHint && (
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {rightHint}
          </div>
        )}
      </div>
    </button>
  );
}

function CoachRow({
  nick,
  name,
  country,
  rating,
  fee,
  selected,
  tag,
  onClick,
}: {
  nick: string;
  name: string;
  country: string;
  rating: number;
  fee: number;
  selected: boolean;
  tag?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${name}${tag ? ` (${tag})` : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        background: selected ? 'rgba(232,193,112,0.14)' : 'var(--em-panel-2)',
        border: `1px solid ${selected ? 'var(--em-gold)' : 'var(--em-border)'}`,
        borderRadius: 4,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'var(--em-text)',
        transition: 'border-color .12s, background .12s',
      }}
    >
      <PlayerAvatar nick={nick} size={30} />
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.86rem', fontWeight: 700 }}>
          <Flag cc={country} /> {nick}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {tag ? tag : name}
        </div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 60, lineHeight: 1.15 }}>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.92rem', color: selected ? 'var(--em-gold)' : 'var(--em-text)', fontWeight: 800 }}>
          {rating}
        </div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', color: 'var(--em-muted)' }}>
          {formatMoney(fee)}
        </div>
      </div>
      {selected && (
        <span style={{ color: 'var(--em-gold)', fontWeight: 900, fontSize: '0.86rem', marginLeft: 4 }}>✓</span>
      )}
    </button>
  );
}

function RoleChip({ label, role, active, onClick }: { label: string; role?: Role; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        background: active ? 'var(--em-gold)' : 'var(--em-panel-2)',
        color: active ? '#1a1205' : 'var(--em-text)',
        border: `1px solid ${active ? 'var(--em-gold)' : 'var(--em-border)'}`,
        borderRadius: 12,
        fontFamily: 'inherit',
        fontSize: '0.74rem',
        fontWeight: 700,
        cursor: 'pointer',
      }}
      className={role ? `role-${role}` : undefined}
    >
      {label}
    </button>
  );
}
