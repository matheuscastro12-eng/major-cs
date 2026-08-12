// DIÁRIO — SALA DE TROFÉUS: badges colecionáveis dos minigames grátis. Puro:
// avalia um snapshot de fatos (streaks/vitórias/feitos) e devolve o estado de
// cada badge. A UI (hub) renderiza conquistado × bloqueado; o storage dos
// fatos vive em state/daily.ts.

export interface DailyBadgeDef {
  id: string;
  title: string;
  desc: string;
  icon: string;      // emoji — mesmo espírito leve do Diário
  tier: 1 | 2 | 3;   // bronze/prata/ouro (só apresentação)
}

export interface DailyBadgeFacts {
  bestStreak: Record<string, number>;  // melhor streak por jogo + 'perfect'
  totalWins: number;                   // vitórias somadas nos 4 jogos
  flags: Record<string, boolean>;      // feitos especiais (setados pelos jogos)
}

export const DAILY_BADGES: DailyBadgeDef[] = [
  // frequência (qualquer jogo)
  { id: 'streak-3', title: 'Frequente', desc: '3 dias seguidos vencendo um jogo', icon: '📅', tier: 1 },
  { id: 'streak-7', title: 'Viciado no Diário', desc: '7 dias seguidos vencendo um jogo', icon: '🔥', tier: 2 },
  { id: 'streak-30', title: 'Lenda do Diário', desc: '30 dias seguidos vencendo um jogo', icon: '👑', tier: 3 },
  // dias perfeitos
  { id: 'perfect-1', title: 'Dia Perfeito', desc: 'Venceu os 4 jogos num dia', icon: '✨', tier: 1 },
  { id: 'perfect-7', title: 'Semana Perfeita', desc: '7 dias perfeitos seguidos', icon: '💎', tier: 2 },
  { id: 'perfect-30', title: 'Mês Imaculado', desc: '30 dias perfeitos seguidos', icon: '🏆', tier: 3 },
  // volume
  { id: 'wins-10', title: 'Aquecido', desc: '10 vitórias somadas no Diário', icon: '🎯', tier: 1 },
  { id: 'wins-50', title: 'Maratonista', desc: '50 vitórias somadas no Diário', icon: '🏃', tier: 2 },
  // feitos especiais (um por jogo)
  { id: 'ace', title: 'ACE', desc: 'Lines Históricas: os 5 sem errar nenhuma vez', icon: '🖐️', tier: 2 },
  { id: 'sniper', title: 'Um Tiro, Um Abate', desc: 'Quem é o Pro?: cravou no 1º chute', icon: '🕵️', tier: 2 },
  { id: 'detetive', title: 'Detetive', desc: 'O Impostor: achou de primeira', icon: '🎭', tier: 1 },
  { id: 'historiador', title: 'Historiador', desc: 'Placar do Clássico: cravou de primeira', icon: '📜', tier: 1 },
];

export interface DailyBadgeState {
  def: DailyBadgeDef;
  earned: boolean;
}

export function evaluateDailyBadges(facts: DailyBadgeFacts): DailyBadgeState[] {
  const games = Object.entries(facts.bestStreak).filter(([k]) => k !== 'perfect');
  const bestAnyGame = Math.max(0, ...games.map(([, v]) => v));
  const perfectBest = facts.bestStreak.perfect ?? 0;
  const has = (id: string): boolean => {
    switch (id) {
      case 'streak-3': return bestAnyGame >= 3;
      case 'streak-7': return bestAnyGame >= 7;
      case 'streak-30': return bestAnyGame >= 30;
      case 'perfect-1': return perfectBest >= 1;
      case 'perfect-7': return perfectBest >= 7;
      case 'perfect-30': return perfectBest >= 30;
      case 'wins-10': return facts.totalWins >= 10;
      case 'wins-50': return facts.totalWins >= 50;
      default: return !!facts.flags[id];
    }
  };
  return DAILY_BADGES.map((def) => ({ def, earned: has(def.id) }));
}
