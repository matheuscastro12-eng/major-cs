// Conquistas: objetivos que dão motivo pra voltar. Desbloqueio detectado no
// fim de cada Major (single player) e guardado em localStorage.
import type { PlacementCode } from '../engine/swiss';

export type Lang = 'pt' | 'en' | 'es';

export interface AchDef {
  id: string;
  icon: string;
  t: Record<Lang, { title: string; desc: string }>;
}

export const ACHIEVEMENTS: AchDef[] = [
  { id: 'rookie', icon: '🎮', t: {
    pt: { title: 'Estreia', desc: 'Conclua seu primeiro Major.' },
    en: { title: 'Debut', desc: 'Finish your first Major.' },
    es: { title: 'Debut', desc: 'Termina tu primer Major.' } } },
  { id: 'semis', icon: '🥉', t: {
    pt: { title: 'Top 4', desc: 'Chegue à semifinal de um Major.' },
    en: { title: 'Top 4', desc: 'Reach the semifinals of a Major.' },
    es: { title: 'Top 4', desc: 'Llega a semifinales de un Major.' } } },
  { id: 'finalist', icon: '🥈', t: {
    pt: { title: 'Finalista', desc: 'Dispute a grande final de um Major.' },
    en: { title: 'Finalist', desc: 'Play the grand final of a Major.' },
    es: { title: 'Finalista', desc: 'Juega la gran final de un Major.' } } },
  { id: 'first_title', icon: '🏆', t: {
    pt: { title: 'Campeão', desc: 'Vença seu primeiro Major.' },
    en: { title: 'Champion', desc: 'Win your first Major.' },
    es: { title: 'Campeón', desc: 'Gana tu primer Major.' } } },
  { id: 'flawless', icon: '✨', t: {
    pt: { title: 'Imbatível', desc: 'Passe a fase suíça com 3 vitórias e nenhuma derrota.' },
    en: { title: 'Flawless', desc: 'Pass the Swiss stage 3-0, no losses.' },
    es: { title: 'Imparable', desc: 'Pasa la fase suiza 3-0, sin derrotas.' } } },
  { id: 'br_title', icon: '🇧🇷', t: {
    pt: { title: 'Orgulho nacional', desc: 'Seja campeão no GC Masters (elencos BR).' },
    en: { title: 'National pride', desc: 'Win the GC Masters (BR rosters).' },
    es: { title: 'Orgullo nacional', desc: 'Gana el GC Masters (planteles BR).' } } },
  { id: 'hard_title', icon: '🟠', t: {
    pt: { title: 'No talento', desc: 'Vença um Major na dificuldade Difícil.' },
    en: { title: 'The hard way', desc: 'Win a Major on Hard difficulty.' },
    es: { title: 'A pulso', desc: 'Gana un Major en dificultad Difícil.' } } },
  { id: 'legend_title', icon: '🔴', t: {
    pt: { title: 'Lenda viva', desc: 'Vença um Major na dificuldade Lendário.' },
    en: { title: 'Living legend', desc: 'Win a Major on Legend difficulty.' },
    es: { title: 'Leyenda viva', desc: 'Gana un Major en dificultad Leyenda.' } } },
  { id: 'collector', icon: '👑', t: {
    pt: { title: 'Dinastia', desc: 'Conquiste 3 títulos de Major.' },
    en: { title: 'Dynasty', desc: 'Win 3 Major titles.' },
    es: { title: 'Dinastía', desc: 'Gana 3 títulos de Major.' } } },
  { id: 'veteran', icon: '🎖️', t: {
    pt: { title: 'Veterano', desc: 'Dispute 10 Majors.' },
    en: { title: 'Veteran', desc: 'Play 10 Majors.' },
    es: { title: 'Veterano', desc: 'Juega 10 Majors.' } } },
];

export interface GameEndCtx {
  champion: boolean;
  placement: PlacementCode;
  difficulty: string;
  pool: string;
  swissWins: number;
  swissLosses: number;
  totalTitles: number; // títulos acumulados (após este jogo)
}

const COND: Record<string, (c: GameEndCtx, games: number) => boolean> = {
  rookie: () => true,
  semis: (c) => ['champion', 'runnerup', 'semi'].includes(c.placement),
  finalist: (c) => ['champion', 'runnerup'].includes(c.placement),
  first_title: (c) => c.champion,
  flawless: (c) => c.swissWins >= 3 && c.swissLosses === 0,
  br_title: (c) => c.champion && c.pool === 'br',
  hard_title: (c) => c.champion && c.difficulty === 'hard',
  legend_title: (c) => c.champion && c.difficulty === 'legend',
  collector: (c) => c.totalTitles >= 3,
  veteran: (_c, games) => games >= 10,
};

const KEY = 'rtm-achievements-v1';
interface Store { unlocked: string[]; games: number }

export function loadAchievements(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw) as Store; return { unlocked: s.unlocked ?? [], games: s.games ?? 0 }; }
  } catch { /* ignore */ }
  return { unlocked: [], games: 0 };
}
function save(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem storage */ } }

export function unlockedIds(): Set<string> {
  return new Set(loadAchievements().unlocked);
}

// registra o fim de um Major e retorna as conquistas RECÉM-desbloqueadas
export function recordGameEnd(ctx: GameEndCtx): AchDef[] {
  const store = loadAchievements();
  store.games += 1;
  const have = new Set(store.unlocked);
  const fresh: AchDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (have.has(def.id)) continue;
    if (COND[def.id]?.(ctx, store.games)) {
      have.add(def.id);
      fresh.push(def);
    }
  }
  store.unlocked = [...have];
  save(store);
  return fresh;
}
