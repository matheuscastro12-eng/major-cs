// Nomes REAIS de campeonatos de CS (fonte: Liquipedia/HLTV), por tier, usados
// tanto pela Carreira quanto pelo Road to Pro — a "database de campeonatos". Cada
// pool é uma rotação de eventos reais do ano; o índice determinístico por
// (ciclo, etapa) faz cada temporada/split disputar eventos diferentes.

export const MAJOR_NAMES = [
  'PGL Major Copenhagen', 'BLAST.tv Austin Major', 'IEM Major Rio', 'PGL Major Budapest', 'ESL One Major Cologne',
];

// Tier 1 (elite mundial) — IEM / BLAST / ESL Pro League / PGL…
export const T1_EVENTS = [
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

// Tier 2 (challenger mundial) — ESL Challenger / CCT Finals / Elisa / Pinnacle…
export const T2_EVENTS = [
  'ESL Challenger League', 'CCT Global Finals', 'Elisa Masters Espoo', 'YaLLa Compass',
  'Thunderpick World Champ', 'Pinnacle Cup', 'CCT Season Finals', 'Skyesports Masters',
  'ESL Challenger Valencia', 'CCT South America', 'CCT Europe', 'European Pro League S2',
  'Roobet Cup', 'Snow Sweet Snow', 'Pinnacle Cup Championship', 'Fragadelphia',
  'CCT Asia', 'CCT North America', 'Elisa Invitational', 'Esports Charts Cup',
  'ESL Impact Finals', 'Skyesports Champions', 'United Masters League', 'Pinnacle Champ Cup',
  'BLAST Bounty Spring', 'Akros Showmatch', 'GG.Bet Showdown', 'BetBoom Cup',
  'CCT Online Finals', 'IceCold Cup',
];

// Tier 3 (acesso — onde toda org começa) — CCT / ESEA / European Pro League…
export const T3_EVENTS = [
  'ESEA Advanced Season', 'CCT Open Series', 'European Pro League',
  'Pinnacle Winter Series', 'Elisa Invitational Qual', 'ESL Challenger Open', 'CCT Series',
  'ESEA Cash Cup', 'Aorus League', 'CBCS Series',
  'ESEA Open Season', 'Pinnacle Summer Series', 'CCT Open Qualifier',
  'ESL Open Cup', 'CCT Closed Qualifier', 'Esports Spring League',
  'Akros League', 'GG.Bet Tide',
];
export const T3_SA_EVENTS = [
  'Gamers Club Liga Pro', 'Gamers Club Masters', 'CCT South America', 'CBCS Series',
  'BB Masters Brasil', 'Aorus League BR', 'CazéTV Cup', 'Liga Gamers Club',
  'Esportes da Sorte Cup', 'NSG Brasileirão CS', 'Aorus League SA', 'Loud Park BR',
  'CCT South America S2', 'BB Masters Andinos', 'Liga Furiosa', 'Brasileirão CS',
];
export const T3_EU_EVENTS = [
  'European Pro League', 'ESEA Advanced Season', 'CCT Europe Series', 'Esportal Spring',
  'Pinnacle Winter Series', 'Elisa Invitational Qual', 'ESL Challenger Open',
  'GamersOrigin League', 'eXTREMESLAND EU', 'EVC EU Open', 'CCT Closed Qualifier',
  'A1 League', 'Polskie Mistrzostwa', 'United Kingdom Open', 'Akros League EU',
];
export const T3_ASIA_EVENTS = [
  'Perfect World Asia League', 'Asia Championship', 'CCT Asia Series', 'Esports Charts Asia',
  'Skyesports Stage', 'TIGER Asia League', 'Akros Asia', 'Mongolian Premier League',
];

// Academia — ligas de base reais / regionais.
export const ACADEMY_EVENTS = [
  'Academy Champions League', 'CCT Academy Series', 'ESEA Academy', 'Circuito Desafiante',
  'Gamers Club Academy', 'Aorus Academy Cup', 'Pinnacle Rookie Series', 'Future Stars League',
];

// Índice determinístico dentro de um pool por (ciclo, etapa, etapasPorCiclo).
export function eventIndex(cycle: number, ev: number, len: number, perCycle = 3): number {
  return ((((cycle - 1) * perCycle + (ev - 1)) % len) + len) % len;
}

export const majorName = (cycle: number) => MAJOR_NAMES[((cycle - 1) % MAJOR_NAMES.length + MAJOR_NAMES.length) % MAJOR_NAMES.length];
export const t1EventName = (cycle: number, ev = 1) => T1_EVENTS[eventIndex(cycle, ev, T1_EVENTS.length)];
export const t2EventName = (cycle: number, ev = 1) => T2_EVENTS[eventIndex(cycle, ev, T2_EVENTS.length)];
export const t3EventName = (cycle: number, ev = 1) => T3_EVENTS[eventIndex(cycle, ev, T3_EVENTS.length)];
export const academyEventName = (cycle: number, ev = 1) => ACADEMY_EVENTS[eventIndex(cycle, ev, ACADEMY_EVENTS.length)];

export type EventRegion = 'sa' | 'eu' | 'asia' | 'global';
export function t3RegionalEventName(cycle: number, ev: number, region: EventRegion): string {
  const pool = region === 'sa' ? T3_SA_EVENTS : region === 'eu' ? T3_EU_EVENTS : region === 'asia' ? T3_ASIA_EVENTS : T3_EVENTS;
  return pool[eventIndex(cycle, ev, pool.length)];
}
