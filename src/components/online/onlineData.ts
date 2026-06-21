// Dados + helpers do modo Online (Ranked 1v1, Ranked Major, Gauntlet). Porta fiel do
// onlineData.jsx do design. É um modo single-player vs IA: rivais são bots e a partida
// é resolvida por força de time. Ranking salvo só pra conta paga (ver useOnlineStats).
import type { TeamSeason } from '../../types';
import { playerOvr } from '../../engine/ratings';

export interface PoolPlayer { id: string; nick: string; country: string; role: string; ovr: number; }
export interface Rival { nick: string; country: string; mmr: number; }
export interface OnlineStats { mmr: number; w: number; l: number; majorPts: number; bestStreak: number; gamesMajor: number; }

// pool achatado de lendas, melhor primeiro (dedupe por nick)
export function buildPool(dataset: TeamSeason[]): PoolPlayer[] {
  const out: PoolPlayer[] = [];
  const seen = new Set<string>();
  for (const t of dataset) {
    for (const p of t.players) {
      const key = p.nick.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: p.id, nick: p.nick, country: p.country, role: p.role, ovr: playerOvr(p) });
    }
  }
  return out.sort((a, b) => b.ovr - a.ovr);
}

export const ONLINE_RANKS: { name: string; min: number; color: string }[] = [
  { name: 'Prata', min: 0, color: '#9fb6cd' },
  { name: 'Ouro Nova', min: 1200, color: '#d8a943' },
  { name: 'Mestre Guardião', min: 1600, color: '#6fc3df' },
  { name: 'Águia', min: 1900, color: '#c792ea' },
  { name: 'Global Elite', min: 2200, color: '#f3cf6b' },
];
export const rankFor = (mmr: number) => [...ONLINE_RANKS].reverse().find((r) => mmr >= r.min) ?? ONLINE_RANKS[0];

export const ONLINE_RIVALS: Rival[] = [
  { nick: 'nordavind', country: 'no', mmr: 2240 },
  { nick: 'taclocal', country: 'us', mmr: 2090 },
  { nick: 'zé_pequeno', country: 'br', mmr: 1980 },
  { nick: 'ggwp_andre', country: 'pt', mmr: 1910 },
  { nick: 'pixozin', country: 'br', mmr: 1875 },
  { nick: 'secret_agent', country: 'se', mmr: 1820 },
  { nick: 'mibrFanboy', country: 'br', mmr: 1760 },
  { nick: 'clutch_or_kick', country: 'fr', mmr: 1705 },
  { nick: 'rush_b_only', country: 'ua', mmr: 1640 },
  { nick: 'eco_frag', country: 'de', mmr: 1560 },
];

export const MAJOR_PLACES = [
  { key: 'champion', label: 'Campeão', pts: 100, color: '#f3cf6b' },
  { key: 'final', label: 'Vice (final)', pts: 70, color: '#d8a943' },
  { key: 'semi', label: 'Semifinal', pts: 45, color: '#c792ea' },
  { key: 'quarter', label: 'Quartas', pts: 25, color: '#6fc3df' },
  { key: 'swiss', label: 'Fase suíça', pts: 10, color: '#9fb6cd' },
] as const;
export type PlaceKey = typeof MAJOR_PLACES[number]['key'];
export const majorPlace = (k: PlaceKey | string) => MAJOR_PLACES.find((p) => p.key === k) ?? MAJOR_PLACES[4];

export const LB_MAJOR = [
  { nick: 'nordavind', country: 'no', pts: 540, best: 'champion' },
  { nick: 'taclocal', country: 'us', pts: 470, best: 'champion' },
  { nick: 'zé_pequeno', country: 'br', pts: 395, best: 'final' },
  { nick: 'ggwp_andre', country: 'pt', pts: 310, best: 'final' },
  { nick: 'pixozin', country: 'br', pts: 250, best: 'semi' },
  { nick: 'secret_agent', country: 'se', pts: 205, best: 'semi' },
  { nick: 'mibrFanboy', country: 'br', pts: 150, best: 'quarter' },
  { nick: 'clutch_or_kick', country: 'fr', pts: 95, best: 'quarter' },
];
export const LB_GAUNTLET = [
  { nick: 'nordavind', country: 'no', streak: 14 },
  { nick: 'taclocal', country: 'us', streak: 11 },
  { nick: 'pixozin', country: 'br', streak: 9 },
  { nick: 'zé_pequeno', country: 'br', streak: 8 },
  { nick: 'ggwp_andre', country: 'pt', streak: 7 },
  { nick: 'secret_agent', country: 'se', streak: 5 },
  { nick: 'rush_b_only', country: 'ua', streak: 4 },
];

// resolve uma partida por força de time → prob de vitória + placar plausível de MD3
export function resolve(myOvr: number, oppOvr: number): { win: boolean; prob: number; score: string } {
  const p = Math.max(0.12, Math.min(0.88, 0.5 + (myOvr - oppOvr) / 38));
  const win = Math.random() < p;
  const loserMaps = Math.random() < 0.5 ? 0 : 1;
  return { win, prob: p, score: win ? `2-${loserMaps}` : `${loserMaps}-2` };
}

export interface OpenRoom { id: string; name: string; host: { nick: string; country: string }; size: number; joined: number; region: string; ping: number; status: 'open' | 'full' | 'drafting'; }
export const OPEN_ROOMS: OpenRoom[] = [
  { id: 'r1', name: 'Major dos br', host: { nick: 'zé_pequeno', country: 'br' }, size: 8, joined: 5, region: 'SA', ping: 12, status: 'open' },
  { id: 'r2', name: 'Só lenda, sem noob', host: { nick: 'nordavind', country: 'no' }, size: 4, joined: 3, region: 'EU', ping: 142, status: 'open' },
  { id: 'r3', name: 'rapidinha 2 players', host: { nick: 'pixozin', country: 'br' }, size: 2, joined: 1, region: 'SA', ping: 9, status: 'open' },
  { id: 'r4', name: 'NA grind', host: { nick: 'taclocal', country: 'us' }, size: 6, joined: 6, region: 'NA', ping: 88, status: 'full' },
  { id: 'r5', name: 'treino de draft', host: { nick: 'ggwp_andre', country: 'pt' }, size: 4, joined: 2, region: 'EU', ping: 121, status: 'open' },
  { id: 'r6', name: 'salão do clutch', host: { nick: 'clutch_or_kick', country: 'fr' }, size: 8, joined: 4, region: 'EU', ping: 134, status: 'drafting' },
  { id: 'r7', name: 'copa da quebrada', host: { nick: 'mibrFanboy', country: 'br' }, size: 6, joined: 3, region: 'SA', ping: 7, status: 'open' },
];
export const REGION: Record<string, string> = { SA: 'América do Sul', EU: 'Europa', NA: 'América do Norte' };

// stats do jogador. Persiste local pra todo mundo; o ranking SALVO (servidor) é da
// conta paga — quem decide é o componente (mostra o gate quando não é paga).
const STATS_KEY = 'rtm-online-stats-v1';
export const DEFAULT_STATS: OnlineStats = { mmr: 1000, w: 0, l: 0, majorPts: 0, bestStreak: 0, gamesMajor: 0 };
export function loadStats(): OnlineStats {
  try { const raw = localStorage.getItem(STATS_KEY); if (raw) return { ...DEFAULT_STATS, ...JSON.parse(raw) }; } catch { /* sem storage */ }
  return { ...DEFAULT_STATS };
}
export function saveStats(s: OnlineStats) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* sem storage */ } }
