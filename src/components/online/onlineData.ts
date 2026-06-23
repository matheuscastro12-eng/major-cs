// Dados + helpers do modo Online (Ranked 1v1, Ranked Major, Gauntlet). Porta fiel do
// onlineData.jsx do design. É um modo single-player vs IA: rivais são bots e a partida
// é resolvida por força de time. Ranking salvo só pra conta paga (ver useOnlineStats).
import type { Coach, Player, TeamSeason, TTeam } from '../../types';
import { buildUserTeam, playerOvr } from '../../engine/ratings';
import { ct } from '../../state/career-i18n';

const DEFAULT_COACH: Coach = { nick: 'coach', name: 'Técnico', country: 'br', rating: 70, style: 'tactical' };

// monta um TTeam real a partir das escolhas do draft, com id e ids de jogador únicos
// (o motor de partida indexa stats/MVP por id; os dois times não podem colidir).
export function buildOnlineTeam(name: string, picks: PoolPlayer[], idPrefix: string): TTeam {
  const team = buildUserTeam(name, picks.map((p) => ({ player: p.player, from: p.from })), DEFAULT_COACH);
  return { ...team, id: idPrefix, name, players: team.players.map((p) => ({ ...p, id: `${idPrefix}__${p.sourcePlayerId}` })) };
}

// PoolPlayer carrega o Player completo + a TeamSeason de origem pra montar TTeam real.
export interface PoolPlayer { id: string; nick: string; country: string; role: string; ovr: number; player: Player; from: TeamSeason; }
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
      out.push({ id: p.id, nick: p.nick, country: p.country, role: p.role, ovr: playerOvr(p), player: p, from: t });
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

// adversários são IA ANÔNIMA (sem jogadores fictícios nomeados no ranking).
const OPP_COUNTRIES = ['br', 'us', 'se', 'dk', 'ua', 'fr', 'de', 'pt', 'no', 'fi'];
const randCc = () => OPP_COUNTRIES[Math.floor(Math.random() * OPP_COUNTRIES.length)];
// um adversário genérico (1v1 / fila do gauntlet / chave do major)
export const genOpp = (i?: number): Rival => ({ nick: i == null ? ct('Adversário') : `${ct('Adversário')} ${i}`, country: randCc(), mmr: 0 });

export const MAJOR_PLACES = [
  { key: 'champion', label: 'Campeão', pts: 100, color: '#f3cf6b' },
  { key: 'final', label: 'Vice (final)', pts: 70, color: '#d8a943' },
  { key: 'semi', label: 'Semifinal', pts: 45, color: '#c792ea' },
  { key: 'quarter', label: 'Quartas', pts: 25, color: '#6fc3df' },
  { key: 'swiss', label: 'Fase suíça', pts: 10, color: '#9fb6cd' },
] as const;
export type PlaceKey = typeof MAJOR_PLACES[number]['key'];
export const majorPlace = (k: PlaceKey | string) => MAJOR_PLACES.find((p) => p.key === k) ?? MAJOR_PLACES[4];

// resolve uma partida por força de time → prob de vitória + placar plausível de MD3
export function resolve(myOvr: number, oppOvr: number): { win: boolean; prob: number; score: string } {
  const p = Math.max(0.12, Math.min(0.88, 0.5 + (myOvr - oppOvr) / 38));
  const win = Math.random() < p;
  const loserMaps = Math.random() < 0.5 ? 0 : 1;
  return { win, prob: p, score: win ? `2-${loserMaps}` : `${loserMaps}-2` };
}

// stats do jogador. Persiste local pra todo mundo; o ranking SALVO (servidor) é da
// conta paga — quem decide é o componente (mostra o gate quando não é paga).
const STATS_KEY = 'rtm-online-stats-v1';
export const DEFAULT_STATS: OnlineStats = { mmr: 1000, w: 0, l: 0, majorPts: 0, bestStreak: 0, gamesMajor: 0 };
export function loadStats(): OnlineStats {
  try { const raw = localStorage.getItem(STATS_KEY); if (raw) return { ...DEFAULT_STATS, ...JSON.parse(raw) }; } catch { /* sem storage */ }
  return { ...DEFAULT_STATS };
}
export function saveStats(s: OnlineStats) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* sem storage */ } }
