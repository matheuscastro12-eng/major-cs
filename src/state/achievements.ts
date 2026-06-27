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
  // ───── MAJORS (legacy) ─────
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

  // ───── SPONSORS (T3.5) ─────
  { id: 'first_sponsor', icon: '🤝', t: {
    pt: { title: 'Primeiro patrocínio', desc: 'Feche seu primeiro contrato de patrocínio.' },
    en: { title: 'First sponsor', desc: 'Sign your first sponsorship deal.' },
    es: { title: 'Primer patrocinio', desc: 'Cierra tu primer contrato.' } } },
  { id: 'sponsor_3', icon: '💼', t: {
    pt: { title: 'Portfólio', desc: 'Tenha 3 patrocinadores ativos ao mesmo tempo.' },
    en: { title: 'Portfolio', desc: 'Have 3 sponsors active at the same time.' },
    es: { title: 'Portafolio', desc: 'Ten 3 patrocinadores activos a la vez.' } } },
  { id: 'sponsor_global', icon: '🌐', t: {
    pt: { title: 'Marca global', desc: 'Feche contrato com um patrocinador GLOBAL (Samsung, Red Bull...).' },
    en: { title: 'Global brand', desc: 'Sign a contract with a GLOBAL sponsor.' },
    es: { title: 'Marca global', desc: 'Firma con un patrocinador GLOBAL.' } } },

  // ───── TEAM EVENTS (T3.6) ─────
  { id: 'first_event', icon: '🎭', t: {
    pt: { title: 'Liderou o vestiário', desc: 'Resolva seu primeiro evento de time.' },
    en: { title: 'Led the locker room', desc: 'Resolve your first team event.' },
    es: { title: 'Lideraste el vestuario', desc: 'Resuelve tu primer evento de equipo.' } } },
  { id: 'event_10', icon: '🧭', t: {
    pt: { title: 'Manager experiente', desc: 'Resolva 10 eventos de time.' },
    en: { title: 'Seasoned manager', desc: 'Resolve 10 team events.' },
    es: { title: 'Mánager experimentado', desc: 'Resuelve 10 eventos de equipo.' } } },

  // ───── PLAYER TALKS (T3.7) ─────
  { id: 'first_talk', icon: '💬', t: {
    pt: { title: 'Sentou pra conversar', desc: 'Tenha sua primeira conversa com um jogador.' },
    en: { title: 'Heart-to-heart', desc: 'Have your first one-on-one with a player.' },
    es: { title: 'De corazón', desc: 'Ten tu primera charla con un jugador.' } } },
  { id: 'talk_5', icon: '🫱', t: {
    pt: { title: 'Próximo do elenco', desc: 'Converse com 5 jogadores diferentes.' },
    en: { title: 'Squad whisperer', desc: 'Talk to 5 different players.' },
    es: { title: 'Cercano al plantel', desc: 'Habla con 5 jugadores distintos.' } } },

  // ───── YEAR-END AWARDS (T3.10) ─────
  { id: 'first_award', icon: '🏅', t: {
    pt: { title: 'Reconhecimento', desc: 'Veja a primeira cerimônia de awards do ano.' },
    en: { title: 'Recognition', desc: 'See your first year-end awards ceremony.' },
    es: { title: 'Reconocimiento', desc: 'Ve tu primera ceremonia de premios.' } } },
  { id: 'poy_alumni', icon: '🌟', t: {
    pt: { title: 'POY no elenco', desc: 'Tenha um jogador do seu squad eleito Player of the Year.' },
    en: { title: 'POY on the roster', desc: 'Have a player from your squad win Player of the Year.' },
    es: { title: 'POY en plantilla', desc: 'Ten un jugador tuyo elegido POY.' } } },

  // ───── CHEMISTRY (T3.4) ─────
  { id: 'chemistry_high', icon: '🧪', t: {
    pt: { title: 'Time entrosado', desc: 'Atinja química média ≥ 70 entre os 5 titulares.' },
    en: { title: 'Tight unit', desc: 'Reach average chemistry ≥ 70 among the starting 5.' },
    es: { title: 'Equipo unido', desc: 'Alcanza química media ≥ 70 entre los titulares.' } } },
  { id: 'chemistry_elite', icon: '🔬', t: {
    pt: { title: 'Sinergia perfeita', desc: 'Atinja química média ≥ 85 entre os 5 titulares.' },
    en: { title: 'Perfect synergy', desc: 'Reach average chemistry ≥ 85 among the starting 5.' },
    es: { title: 'Sinergia perfecta', desc: 'Alcanza química media ≥ 85 entre los titulares.' } } },

  // ───── FINANÇAS / CARREIRA ─────
  { id: 'rich', icon: '💰', t: {
    pt: { title: 'Caixa cheio', desc: 'Acumule R$ 5M em caixa.' },
    en: { title: 'Cash flush', desc: 'Reach $5M in cash.' },
    es: { title: 'Caja llena', desc: 'Acumula $5M en caja.' } } },
  { id: 'mogul', icon: '🏦', t: {
    pt: { title: 'Mogul', desc: 'Acumule R$ 20M em caixa.' },
    en: { title: 'Mogul', desc: 'Reach $20M in cash.' },
    es: { title: 'Magnate', desc: 'Acumula $20M en caja.' } } },
  { id: 'tier1_promo', icon: '⬆️', t: {
    pt: { title: 'Acesso à elite', desc: 'Suba sua org pro Tier 1.' },
    en: { title: 'Promoted to elite', desc: 'Promote your org to Tier 1.' },
    es: { title: 'Acceso a la élite', desc: 'Sube tu org al Tier 1.' } } },
  { id: 'board_perfect', icon: '🎯', t: {
    pt: { title: 'Confiança total', desc: 'Tenha 100 de confiança da diretoria.' },
    en: { title: 'Full trust', desc: 'Reach 100 board confidence.' },
    es: { title: 'Confianza total', desc: 'Alcanza 100 de confianza directiva.' } } },

  // ───── LONGEVIDADE ─────
  { id: 'season_10', icon: '📅', t: {
    pt: { title: 'Decanato', desc: 'Complete 10 splits sem ser demitido.' },
    en: { title: 'Deanship', desc: 'Survive 10 splits without being fired.' },
    es: { title: 'Decanato', desc: 'Completa 10 splits sin ser despedido.' } } },
  { id: 'survivor', icon: '🛡️', t: {
    pt: { title: 'Sobrevivente', desc: 'Atinja 30 splits sem ser demitido.' },
    en: { title: 'Survivor', desc: 'Reach 30 splits without being fired.' },
    es: { title: 'Superviviente', desc: 'Llega a 30 splits sin despido.' } } },
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

// ─────────────────────────────────────────────────────────────────────────────
// T3.14 — Conquistas BASEADAS no save (não-Major). Disparam via recordSaveTick
// no advanceSplit. Condições derivam diretamente do estado do CareerSave.

// Snapshot mínimo do save que essas conditions leem. Não importamos CareerSave
// pra evitar dependência circular — typing estrutural via interface.
export interface SaveSnapshot {
  split: number;
  budget: number;
  tier: number;
  board: number;
  sponsors: string[];
  // pairChem é Record<pairKey, value>. Calculamos média dos 5 starters fora.
  avgChemistryStarters?: number;
  // event/talk counts derivados
  resolvedTeamEventsCount: number;
  distinctPlayersTalkedCount: number;
  yearAwardsHistoryCount: number;
  poyInOwnSquadEver: boolean;
  hasGlobalSponsor: boolean;
  splitsAlive: number; // = split atual se fired === false; serve pra longevidade
}

const COND_SAVE: Record<string, (s: SaveSnapshot) => boolean> = {
  // Sponsors
  first_sponsor: (s) => s.sponsors.length >= 1,
  sponsor_3: (s) => s.sponsors.length >= 3,
  sponsor_global: (s) => s.hasGlobalSponsor,
  // Team events
  first_event: (s) => s.resolvedTeamEventsCount >= 1,
  event_10: (s) => s.resolvedTeamEventsCount >= 10,
  // Player talks
  first_talk: (s) => s.distinctPlayersTalkedCount >= 1,
  talk_5: (s) => s.distinctPlayersTalkedCount >= 5,
  // Awards
  first_award: (s) => s.yearAwardsHistoryCount >= 1,
  poy_alumni: (s) => s.poyInOwnSquadEver,
  // Chemistry
  chemistry_high: (s) => (s.avgChemistryStarters ?? 0) >= 70,
  chemistry_elite: (s) => (s.avgChemistryStarters ?? 0) >= 85,
  // Finanças / carreira
  rich: (s) => s.budget >= 5_000_000,
  mogul: (s) => s.budget >= 20_000_000,
  tier1_promo: (s) => s.tier <= 1,
  board_perfect: (s) => s.board >= 100,
  // Longevidade
  season_10: (s) => s.splitsAlive >= 10,
  survivor: (s) => s.splitsAlive >= 30,
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

// T3.14: avalia conquistas baseadas em snapshot do save. Chamada em pontos
// onde o save é mutado (advanceSplit, resolução de event, talk, etc.).
// Dispara CustomEvent 'rtm:achievements' pro App captar e exibir toast.
export function recordSaveTick(snap: SaveSnapshot): AchDef[] {
  const store = loadAchievements();
  const have = new Set(store.unlocked);
  const fresh: AchDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (have.has(def.id)) continue;
    if (COND_SAVE[def.id]?.(snap)) {
      have.add(def.id);
      fresh.push(def);
    }
  }
  if (fresh.length > 0) {
    store.unlocked = [...have];
    save(store);
    // notifica App pra mostrar toast (mesma infraestrutura do recordGameEnd)
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('rtm:achievements', { detail: fresh }));
      } catch {
        /* ignore — fail-safe */
      }
    }
  }
  return fresh;
}
