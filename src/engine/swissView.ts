// Leitura do torneio suíço (fase, placar, adversário do usuário, retrospecto),
// sem o motor de partida. O App usa estas funções no render; swiss.ts (que
// simula as séries da IA com o motor inteiro) só carrega quando o jogo roda.
import type { Pairing, Tournament, TTeam } from '../types';
import { ct } from '../state/career-i18n';

export function getTeam(t: Tournament, id: string): TTeam {
  return t.teams.find((x) => x.id === id)!;
}

// Até onde um time chegou no Major, como código estável (identificador de
// lógica: premiação, ranking, estilo). O texto exibido vem do i18n
// ('placement.<code>'), nunca deste código.
export type PlacementCode = 'champion' | 'runnerup' | 'semi' | 'quarters' | 'playoffs' | 'swiss';

export function placementCode(t: Tournament, teamId: string): PlacementCode {
  if (t.championId === teamId) return 'champion';
  const team = t.teams.find((x) => x.id === teamId);
  // procura a fase onde o time perdeu nos playoffs
  for (const h of t.history) {
    const p = h.pairing;
    if (p.a !== teamId && p.b !== teamId) continue;
    if (!p.result) continue;
    const lost = (p.result.winner === 0 ? p.b : p.a) === teamId;
    if (!lost) continue;
    if (h.phase.includes('GRANDE FINAL')) return 'runnerup';
    if (h.phase.includes('Semifinal')) return 'semi';
    if (h.phase.includes('Quartas de final')) return 'quarters';
  }
  if (team?.status === 'advanced') return 'playoffs';
  return 'swiss';
}

// Formato real do Major: partidas de classificação (vitória vira 3-0/3-1/3-2)
// ou eliminação (derrota vira 0-3/1-3/2-3) são MD3; as aberturas são MD1.
export function bestOfForRecord(wins: number, losses: number): 1 | 3 {
  return wins === 2 || losses === 2 ? 3 : 1;
}

export function pairingBestOf(t: Tournament, p: Pairing): 1 | 3 | 5 {
  if (p.bestOf) return p.bestOf;
  if (t.phase === 'final' || p.label === 'FINAL') return 5; // grande final MD5
  if (t.phase !== 'swiss') return 3; // demais playoffs MD3
  const m = /^(\d)-(\d)$/.exec(p.label);
  if (m) return bestOfForRecord(Number(m[1]), Number(m[2]));
  return 3;
}

// Retrospecto do usuário por mapa ao longo do torneio (vitórias/derrotas)
export function userMapRecord(t: Tournament): Record<string, { w: number; l: number }> {
  const rec: Record<string, { w: number; l: number }> = {};
  for (const h of t.history) {
    const p = h.pairing;
    if (p.a !== 'user' && p.b !== 'user') continue;
    const res = p.result;
    if (!res) continue;
    const uidx = p.a === 'user' ? 0 : 1;
    for (const m of res.maps) {
      if (!rec[m.map]) rec[m.map] = { w: 0, l: 0 };
      if (m.winner === uidx) rec[m.map].w++;
      else rec[m.map].l++;
    }
  }
  return rec;
}

// CHAVE ESTÁVEL (PT): vai pro history e é casada por logica (placementCode,
// FinalScreen, OnlineScreen bracketPhase, phaseDisplay). NÃO traduzir aqui.
export function phaseLabel(t: Tournament): string {
  if (t.phase === 'swiss') return `Suíça - Rodada ${t.swissRound}`;
  if (t.phase === 'quarters') return 'Quartas de final';
  if (t.phase === 'semis') return 'Semifinal';
  if (t.phase === 'final') return 'GRANDE FINAL';
  return 'Encerrado';
}
// versão traduzida SÓ para exibição (nunca armazenar nem casar com isto).
export function phaseLabelDisplay(t: Tournament): string {
  if (t.phase === 'swiss') return `${ct('Suíça - Rodada')} ${t.swissRound}`;
  if (t.phase === 'quarters') return ct('Quartas de final');
  if (t.phase === 'semis') return ct('Semifinal');
  if (t.phase === 'final') return ct('GRANDE FINAL');
  return ct('Encerrado');
}

export function userPairing(t: Tournament): Pairing | undefined {
  return t.pairings.find((p) => p.a === 'user' || p.b === 'user');
}

export function userTeam(t: Tournament): TTeam {
  return getTeam(t, 'user');
}

// classificação para exibição da fase suíça
export function standings(t: Tournament): TTeam[] {
  return [...t.teams].sort((a, b) => {
    const stOrder = (s: TTeam) => (s.status === 'advanced' ? 0 : s.status === 'alive' ? 1 : 2);
    return stOrder(a) - stOrder(b) || b.wins - a.wins || a.losses - b.losses || b.roundDiff - a.roundDiff;
  });
}
