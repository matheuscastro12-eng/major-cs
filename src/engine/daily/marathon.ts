// DIÁRIO — MODO MARATONA: os 4 desafios do dia em SEQUÊNCIA, contra o relógio.
// Puro, sem React. Os jogos são os MESMOS do dia (progresso/streaks/pings
// contam normal) — a maratona é a moldura: ordem fixa, cronômetro e uma NOTA
// única compartilhável no fim. Uma maratona por dia; o primeiro tempo vale.

export const MARATHON_ORDER = ['lines', 'whois', 'impostor', 'classic'] as const;

export type MarathonGrade = 'S' | 'A' | 'B' | 'C' | 'D';

// nota = vitórias mandam; o relógio só desempata o topo (4/4 rápido = S).
export function marathonGrade(wins: number, seconds: number): MarathonGrade {
  if (wins >= 4) return seconds <= 300 ? 'S' : 'A';
  if (wins === 3) return 'B';
  if (wins === 2) return 'C';
  return 'D';
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

const GRADE_FLAIR: Record<MarathonGrade, string> = {
  S: '🏆 NOTA S — impecável e no talo',
  A: '🥇 NOTA A — dia perfeito',
  B: '🥈 NOTA B — quase lá',
  C: '🥉 NOTA C — dá pra mais',
  D: '💀 NOTA D — amanhã tem revanche',
};

export function marathonShareText(day: number, wins: number, seconds: number, grade: MarathonGrade): string {
  return [
    `MARATONA DO DIÁRIO #${day} · MAJOR//CS`,
    `${wins}/4 em ${fmtDuration(seconds)} — ${GRADE_FLAIR[grade]}`,
    'Os 4 desafios do dia, em sequência, contra o relógio. Encara?',
    'roadtomajor.com.br/diario',
  ].join('\n');
}
