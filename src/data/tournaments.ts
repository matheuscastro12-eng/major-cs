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

// IMERSÃO: prize pool real (USD) e sede de cada evento do calendário (fonte:
// Liquipedia/HLTV). Só FLAVOR — o prêmio que entra no caixa segue a fórmula
// balanceada (PRIZE_BY_POS × prizeMult), não o pool real, pra não estourar a
// economia. Eventos sem entrada caem num default por tier.
export const EVENT_META: Record<string, { prize: number; venue: string }> = {
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
export const TIER_DEFAULT_POOL: Record<number, { prize: number; venue: string }> = {
  1: { prize: 500_000, venue: 'circuito mundial 🌐' },
  2: { prize: 100_000, venue: 'circuito internacional 🌐' },
  3: { prize: 15_000, venue: 'circuito de acesso 🌐' },
};
export const eventMeta = (name: string, tier: number): { prize: number; venue: string } => EVENT_META[name] ?? TIER_DEFAULT_POOL[tier] ?? TIER_DEFAULT_POOL[3];

// Sede de um evento a partir do texto da sede ("Katowice 🇵🇱", "online 🌐"):
// país-sede (bandeira → código ISO) e se é LAN. Evento sem sede conhecida
// (pool padrão do tier, "circuito ...") e "online" são online.
export function venueHost(venue: string): { cc: string | null; lan: boolean } {
  const online = /^online|^circuito/i.test(venue.trim());
  const cps = [...venue].map((ch) => ch.codePointAt(0) ?? 0).filter((c) => c >= 0x1f1e6 && c <= 0x1f1ff);
  const cc = cps.length >= 2 ? String.fromCharCode(cps[0] - 0x1f1e6 + 97, cps[1] - 0x1f1e6 + 97) : null;
  return { cc: online ? null : cc, lan: !online && !!cc };
}
