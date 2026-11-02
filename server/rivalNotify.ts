// [URG-3] AVISO DE RIVAL — detecção pura de "fulano te passou no ranking".
//
// Quem reporta uma vitória sobe no ladder; todo mundo que ficou pra trás foi
// ULTRAPASSADO. Só avisamos quem tem motivo pra ligar: rivais declarados
// (rtm_rivalries envolvendo quem subiu) e o vizinho imediato (quem agora está
// logo abaixo de quem subiu), dentro do top N. Sem banco, sem relógio: recebe o
// ladder já ordenado e devolve a lista; testável em server/rivalNotify.test.ts.
export interface LadderEntry { email: string; nick: string; mmr: number }
export interface Overtake {
  email: string; nick: string;
  /** posição (1-indexada) ANTES e DEPOIS da ultrapassagem */
  oldPos: number; newPos: number;
  reason: 'rival' | 'neighbor';
}
export const OVERTAKE_TOP = 100;

/**
 * Compara o MMR de quem reportou ANTES e DEPOIS com o ladder DEPOIS (top N,
 * ordenado por MMR desc) e devolve quem foi ultrapassado. Cada vítima estava
 * acima do reportante antes (mmr > before) e agora está abaixo dele no ladder.
 * Uma consulta só: a posição antiga da vítima é a atual menos um (o reportante
 * passou por cima de todas de uma vez).
 */
export function detectOvertakes(
  reporter: { email: string; before: number; after: number },
  ladderAfter: LadderEntry[],
  rivalEmails: Iterable<string>,
  top = OVERTAKE_TOP,
): Overtake[] {
  if (!(reporter.after > reporter.before)) return [];
  const me = reporter.email.toLowerCase();
  const ladder = ladderAfter.slice(0, top);
  const myIdx = ladder.findIndex((e) => e.email.toLowerCase() === me);
  if (myIdx < 0) return []; // fora do top N: ninguém do top foi ultrapassado
  const rivals = new Set([...rivalEmails].map((e) => e.toLowerCase()));
  const out: Overtake[] = [];
  for (let i = myIdx + 1; i < ladder.length; i++) {
    const v = ladder[i];
    const vm = v.email.toLowerCase();
    if (vm === me) continue;
    if (!(v.mmr > reporter.before)) break; // ordenado desc: daqui pra baixo ninguém estava acima de mim
    const reason: Overtake['reason'] | null = rivals.has(vm) ? 'rival' : i === myIdx + 1 ? 'neighbor' : null;
    if (!reason) continue;
    out.push({ email: vm, nick: v.nick, oldPos: i, newPos: i + 1, reason });
  }
  return out;
}
