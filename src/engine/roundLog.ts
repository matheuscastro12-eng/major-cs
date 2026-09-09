// PÓS-JOGO COM EVIDÊNCIA — formato COMUM de evento de decisão.
//
// Dois motores decidem round a round: a Carreira (A CHAMADA em cima do
// createMapSim, % do peekWinProb) e o Road to Pro (a SALA, odds do roomOdds).
// Nenhum dos dois "explica" por que um round caiu — e este módulo também não.
// Ele só guarda O QUE O JOGADOR DECIDIU, com que % NA TELA, e o que o dado deu.
// Daqui saem duas réguas separadas de propósito:
//   • SORTE   (luckAdjusted)  — vitórias reais vs. a soma das % que você viu
//   • DECISÃO (decisionGrade) — a % que você escolheu vs. a média das alternativas
// Puro: sem RNG, sem relógio, sem placar recalculado. Fonte do placar segue
// sendo o motor de cada modo; aqui é só leitura do que ele rolou.

export type DecisionSource = 'career' | 'rtp';
export type Stakes = 'pistol' | 'matchpoint' | 'clutch' | 'overtime' | 'eco' | 'normal';

export interface DecisionEvent {
  source: DecisionSource;
  map: string;                 // MapId (string pra não amarrar os dois tipos)
  round?: number;              // Carreira: nº do round (1-based); Sala: round do beat
  beat?: string;               // Sala: kind do beat (pistol, clutch, mapPoint…)
  label: string;               // o que foi decidido (o golpe / a opção)
  actor?: string;              // quem executou (nick)
  pWin: number;                // a % mostrada ANTES de rolar (0..1) — o que o dado enfrentou
  execPerf?: number;           // Sala: performance no minigame (0..1), se houve
  won: boolean;                // o dado deu (contra pWin)
  stakes?: Stakes;
  // ── extras opcionais (só leitura, nunca inventam causa) ──
  pBase?: number;              // odds ANTES da execução (Sala) — a régua da decisão
  alternatives?: number[];     // pWin das outras opções na hora (pra nota de decisão)
  result?: 'success' | 'partial' | 'fail'; // Sala: o veredito literal do roll
}

export interface LuckAdjusted {
  n: number;
  expected: number;   // Σ pWin — quantos rounds "o dado devia" ter dado
  actual: number;     // vitórias reais
  delta: number;      // actual − expected (em rounds)
  deltaPct: number;   // delta / n, em pontos percentuais (−100..100)
}

// "Você venceu X rounds; pelas odds que viu, esperava-se Y." Sem n, tudo zero.
export function luckAdjusted(events: DecisionEvent[]): LuckAdjusted {
  const n = events.length;
  if (!n) return { n: 0, expected: 0, actual: 0, delta: 0, deltaPct: 0 };
  const expected = events.reduce((a, e) => a + clamp01(e.pWin), 0);
  const actual = events.filter((e) => e.won).length;
  const delta = actual - expected;
  return {
    n,
    expected: round2(expected),
    actual,
    delta: round2(delta),
    deltaPct: Math.round((delta / n) * 100),
  };
}

// Maior upset que PEGOU (menor pWin entre as vitórias). null se não venceu nada.
export function bestCall(events: DecisionEvent[]): DecisionEvent | null {
  const wins = events.filter((e) => e.won);
  if (!wins.length) return null;
  return wins.reduce((b, e) => (e.pWin < b.pWin ? e : b), wins[0]);
}

// Favorito que TROPEÇOU (maior pWin entre as derrotas). null se não perdeu nada.
export function worstCall(events: DecisionEvent[]): DecisionEvent | null {
  const losses = events.filter((e) => !e.won);
  if (!losses.length) return null;
  return losses.reduce((w, e) => (e.pWin > w.pWin ? e : w), losses[0]);
}

export type DecisionGradeLetter = 'S' | 'A' | 'B' | 'C' | 'D';

export interface DecisionGrade {
  grade: DecisionGradeLetter;
  chosenAvg: number;       // média da % escolhida (pBase quando houver, senão pWin)
  altAvg: number | null;   // média das alternativas (null = nenhum evento trouxe alternativas)
  edge: number | null;     // chosenAvg − altAvg em pontos percentuais (null sem alternativas)
  n: number;
}

// Régua da DECISÃO, separada da sorte: quando há alternativas, a nota é o
// quanto você escolheu ACIMA da média do leque (S ≥ +8pp … D < −4pp). Sem
// alternativas (modo sem leque), cai na própria média de % escolhida
// (S ≥ 65% … D < 40%). Vitórias/derrotas NÃO entram aqui — isso é a sorte.
export function decisionGrade(events: DecisionEvent[]): DecisionGrade {
  const n = events.length;
  if (!n) return { grade: 'C', chosenAvg: 0, altAvg: null, edge: null, n: 0 };
  const chosenAvg = events.reduce((a, e) => a + clamp01(e.pBase ?? e.pWin), 0) / n;
  const withAlt = events.filter((e) => e.alternatives && e.alternatives.length > 0);
  if (withAlt.length) {
    const altAvg = withAlt.reduce((a, e) => a + avg(e.alternatives!.map(clamp01)), 0) / withAlt.length;
    const chosenOfAlt = withAlt.reduce((a, e) => a + clamp01(e.pBase ?? e.pWin), 0) / withAlt.length;
    const edge = Math.round((chosenOfAlt - altAvg) * 100);
    const grade: DecisionGradeLetter = edge >= 8 ? 'S' : edge >= 4 ? 'A' : edge >= 0 ? 'B' : edge >= -4 ? 'C' : 'D';
    return { grade, chosenAvg: round2(chosenAvg), altAvg: round2(altAvg), edge, n };
  }
  const grade: DecisionGradeLetter = chosenAvg >= 0.65 ? 'S' : chosenAvg >= 0.55 ? 'A' : chosenAvg >= 0.47 ? 'B' : chosenAvg >= 0.4 ? 'C' : 'D';
  return { grade, chosenAvg: round2(chosenAvg), altAvg: null, edge: null, n };
}

// Frase da sorte, no tom do jogo: "+12% acima do dado" / "−8% abaixo do dado".
export function luckLine(l: LuckAdjusted): string {
  if (!l.n) return 'sem chamadas';
  if (l.deltaPct === 0) return 'na linha do dado';
  return `${l.deltaPct > 0 ? '+' : '−'}${Math.abs(l.deltaPct)}% ${l.deltaPct > 0 ? 'acima' : 'abaixo'} do dado`;
}

// Recorte por stakes com contagem — só pra quem tiver evento que sustente.
export function recordByStakes(events: DecisionEvent[], stakes: Stakes): { made: number; won: number } {
  const es = events.filter((e) => e.stakes === stakes);
  return { made: es.length, won: es.filter((e) => e.won).length };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
