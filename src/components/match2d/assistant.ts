// ASSISTENTE TÉCNICO (intervalo e ao vivo): 2–3 dicas acionáveis tiradas dos
// números do mapa que o motor já produziu. Puro. Cada dica traz UMA ação que a
// tela sabe executar (postura, call do round, tempo técnico) — e um gancho
// genérico `style` para quando o time de estilos T/CT (engine/gestao/estilo.ts)
// existir: a tela que souber aplicar estilo passa `canStyle` e trata a ação.

import type { BuyTier, RoundCall, Stance } from '../../engine/match';

export interface RoundRecord {
  round: number;                       // 0-based
  sides: ['ct' | 't', 'ct' | 't'];     // lado de cada time no round
  winner: 0 | 1;
  tSite: 'A' | 'B' | null;
  openingTeam: 0 | 1 | -1;             // quem fez o 1º abate
  buys: [BuyTier, BuyTier] | null;
  planted: boolean;
}

export type TipAction =
  | { kind: 'stance'; mode: Stance }
  | { kind: 'call'; call: RoundCall }
  | { kind: 'timeout' }
  | { kind: 'style'; side: 't' | 'ct'; hint: 'slow' | 'fast' | 'retake' | 'stack' };

export interface Tip {
  id: string;
  text: string;          // a leitura ("perdendo 70% das aberturas no B")
  why: string;           // o número por trás
  action: TipAction;
  label: string;         // texto do botão
  priority: number;
}

export interface AssistantInput {
  history: RoundRecord[];              // rounds do mapa atual
  userIdx: 0 | 1;
  money: [number, number];             // dinheiro ANTES do próximo round
  nextSide: ['ct' | 't', 'ct' | 't'];
  stance: Stance;
  timeoutsLeft: number;
  canStyle?: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const FULL_BUY = 3900; // rifle + colete + utilitária mínima (aprox.)

export function assistantTips(inp: AssistantInput): Tip[] {
  const { history: h, userIdx: me } = inp;
  const opp: 0 | 1 = me === 0 ? 1 : 0;
  const tips: Tip[] = [];
  if (!h.length) return tips;

  // 1) aberturas por site quando ATACAMOS (T) — e no geral
  for (const site of ['A', 'B'] as const) {
    const rs = h.filter((r) => r.sides[me] === 't' && r.tSite === site && r.openingTeam >= 0);
    if (rs.length < 3) continue;
    const lost = rs.filter((r) => r.openingTeam === opp).length / rs.length;
    if (lost >= 0.6) {
      tips.push({
        id: `open-${site}`, priority: 70 + lost * 20,
        text: `Perdendo ${pct(lost)} das aberturas no ${site}`,
        why: `${rs.filter((r) => r.openingTeam === opp).length} de ${rs.length} rounds atacando o ${site} começaram com uma baixa nossa`,
        action: inp.canStyle ? { kind: 'style', side: 't', hint: 'slow' } : { kind: 'stance', mode: 'cautious' },
        label: inp.canStyle ? 'Ataque lento, entrar em dupla' : 'Postura cautelosa (entrar trocando)',
      });
    }
  }
  const ctRounds = h.filter((r) => r.sides[me] === 'ct' && r.openingTeam >= 0);
  if (ctRounds.length >= 4) {
    const lostCt = ctRounds.filter((r) => r.openingTeam === opp).length / ctRounds.length;
    const retakesLost = h.filter((r) => r.sides[me] === 'ct' && r.planted && r.winner === opp).length;
    if (lostCt >= 0.6) {
      tips.push({
        id: 'open-ct', priority: 60 + lostCt * 20,
        text: `A defesa cede a 1ª baixa em ${pct(lostCt)} dos rounds`,
        why: 'segurar ângulo agressivo está custando o duelo de abertura',
        action: inp.canStyle ? { kind: 'style', side: 'ct', hint: 'retake' } : { kind: 'call', call: 'retake' },
        label: inp.canStyle ? 'Defesa recuada, jogar o retake' : 'Chamar retake no próximo',
      });
    } else if (retakesLost >= 3) {
      tips.push({
        id: 'retake', priority: 55,
        text: `${retakesLost} retakes perdidos depois do plant`,
        why: 'a bomba está caindo e o CT chega tarde',
        action: inp.canStyle ? { kind: 'style', side: 'ct', hint: 'stack' } : { kind: 'stance', mode: 'aggressive' },
        label: inp.canStyle ? 'Empilhar no site mais atacado' : 'Postura agressiva (negar o plant)',
      });
    }
  }

  // 2) economia: a deles quebra / a nossa quebra
  const oppMoney = inp.money[opp], myMoney = inp.money[me];
  const last = h[h.length - 1];
  if (oppMoney < FULL_BUY && last.winner === me) {
    tips.push({
      id: 'eco-opp', priority: 65,
      text: 'A economia deles quebra neste round',
      why: `eles têm $${oppMoney.toLocaleString('pt-BR')}: vem eco ou force de pistola`,
      action: { kind: 'stance', mode: 'cautious' },
      label: 'Cautelosa: segurar distância contra o eco',
    });
  } else if (oppMoney >= FULL_BUY && oppMoney < FULL_BUY + 1400 && last.winner === opp) {
    tips.push({
      id: 'eco-opp-next', priority: 40,
      text: 'Vencer este round quebra a economia deles',
      why: `eles têm $${oppMoney.toLocaleString('pt-BR')}: compram agora, mas sem sobra para o seguinte`,
      action: { kind: 'stance', mode: 'aggressive' },
      label: 'Agressiva: forçar o duelo agora',
    });
  }
  if (myMoney < FULL_BUY && last.winner === opp) {
    const big = myMoney >= 2400;
    tips.push({
      id: 'eco-me', priority: 50,
      text: big ? 'Nossa grana dá só um force' : 'Sem dinheiro para comprar',
      why: `temos $${myMoney.toLocaleString('pt-BR')} (compra cheia ≈ $${FULL_BUY.toLocaleString('pt-BR')})`,
      action: { kind: 'call', call: big ? 'force' : 'save' },
      label: big ? 'Chamar force' : 'Salvar (eco) e comprar cheio no próximo',
    });
  }

  // 3) sequência ruim → tempo técnico
  let streak = 0;
  for (let i = h.length - 1; i >= 0 && h[i].winner === opp; i--) streak++;
  if (streak >= 3 && inp.timeoutsLeft > 0) {
    tips.push({
      id: 'timeout', priority: 75 + streak * 3,
      text: `${streak} rounds perdidos seguidos`,
      why: 'o embalo é deles; o tempo técnico zera a sequência',
      action: { kind: 'timeout' },
      label: 'Pedir tempo técnico',
    });
  }

  // não sugere o que já está ligado
  const useful = tips.filter((t) => !(t.action.kind === 'stance' && t.action.mode === inp.stance));
  const seen = new Set<string>();
  return useful
    .sort((a, b) => b.priority - a.priority)
    .filter((t) => { const k = t.action.kind + JSON.stringify(t.action); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 3);
}
