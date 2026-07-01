// Ultimate Squad — recompensa diária (streak de 7 dias). Portado do BUT, mas
// dirigido pelo relógio LOCAL (Date.now) + lastClaim no save — sem servidor.
// Puro (recebe as chaves de data como string) pra ser testável. Ver docs-but-map §2.2.

export interface DailyEntry { day: number; credits: number }

export const DAILY_TABLE: DailyEntry[] = [
  { day: 1, credits: 800 },
  { day: 2, credits: 1200 },
  { day: 3, credits: 1800 },
  { day: 4, credits: 2500 },
  { day: 5, credits: 3500 },
  { day: 6, credits: 5000 },
  { day: 7, credits: 9000 },
];

// YYYY-MM-DD no fuso local (single-player: dia local é o que o jogador percebe).
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T00:00:00`).getTime();
  const b = new Date(`${toKey}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export interface DailyStatus { canClaim: boolean; day: number; wasReset: boolean }

// dia da recompensa disponível AGORA, dado o streak/último claim.
//  - já pegou hoje (ou relógio recuou) → não pode
//  - pegou ontem → streak+1 (dá a volta 7→1)
//  - gap > 1 dia → reset pro dia 1
export function computeNextDaily(prevStreakDay: number, lastClaim: string | null, todayKey: string): DailyStatus {
  if (!lastClaim) return { canClaim: true, day: 1, wasReset: false };
  const diff = daysBetween(lastClaim, todayKey);
  if (diff <= 0) return { canClaim: false, day: Math.max(1, prevStreakDay), wasReset: false };
  if (diff === 1) return { canClaim: true, day: prevStreakDay >= 7 ? 1 : prevStreakDay + 1, wasReset: false };
  return { canClaim: true, day: 1, wasReset: true };
}

export function dailyCredits(day: number): number {
  return DAILY_TABLE[Math.max(0, Math.min(6, day - 1))].credits;
}
