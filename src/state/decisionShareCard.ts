// Card "MINHAS CHAMADAS EM 1 PRINT" — o pós-jogo com evidência como imagem
// (canvas puro → PNG, zero libs; mesmo padrão de careerShareCard.ts).
// O gancho visual é a FITA DAS CHAMADAS: um quadrado por decisão, verde se o
// dado deu, vermelho se não — com a % que você viu escrita dentro. Embaixo, o
// placar AJUSTADO PELA SORTE e a NOTA DE DECISÃO, separadas de propósito.

import { luckAdjusted, decisionGrade, luckLine, bestCall, type DecisionEvent } from '../engine/roundLog';

export interface DecisionShareData {
  nick: string;
  mode: 'career' | 'rtp';
  scoreLabel: string;        // "2 — 1 vs RVL" / "13–9 · 16–14"
  won: boolean | null;       // null = sem veredito de série (mapa isolado)
  events: DecisionEvent[];
}

const GOLD = '#ecc75f';
const GREEN = '#39c07a';
const RED = '#e05a5a';
const GRAY = '#3a4350';
const INK = '#ffffff';
const DIM = '#8b93a3';

const GRADE_COLOR: Record<string, string> = { S: GOLD, A: GREEN, B: '#7fc8ff', C: '#c9d1dc', D: RED };

export function drawDecisionShareCard(d: DecisionShareData): string {
  const W = 1000;
  const H = 625;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const luck = luckAdjusted(d.events);
  const grade = decisionGrade(d.events);
  const accent = d.won === false ? RED : GREEN;

  // fundo escuro + glow na cor do veredito
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#141821');
  bg.addColorStop(1, '#0d1118');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -120, 60, W / 2, -120, 760);
  glow.addColorStop(0, d.won === false ? 'rgba(224,90,90,0.20)' : 'rgba(57,192,122,0.20)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#8a6f2c';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  // lockup
  ctx.font = '700 34px Oswald, Arial Narrow, sans-serif';
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText('MAJOR//CS', 40, 64);
  ctx.fillStyle = GOLD;
  ctx.font = '700 22px Oswald, Arial Narrow, sans-serif';
  ctx.fillText(d.mode === 'rtp' ? 'ROAD TO PRO · A SALA' : 'CARREIRA · A CHAMADA', 40, 94);

  // quem + placar
  ctx.textAlign = 'right';
  ctx.font = '800 30px Oswald, Arial Narrow, sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText(d.nick, W - 40, 70);
  ctx.font = '500 16px Inter, Arial, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText('minhas chamadas em 1 print', W - 40, 96);

  // placar + veredito
  ctx.textAlign = 'left';
  ctx.font = '800 54px Oswald, Arial Narrow, sans-serif';
  ctx.fillStyle = d.won == null ? INK : accent;
  ctx.fillText(d.won == null ? d.scoreLabel : `${d.won ? 'VITÓRIA' : 'DERROTA'}  ${d.scoreLabel}`, 40, 170);

  // as duas réguas — SORTE e DECISÃO, lado a lado e separadas
  const stats: [string, string, string][] = [
    [`${luck.actual}/${luck.n}`, 'CHAMADAS QUE DERAM', INK],
    [luck.expected.toFixed(1), 'O DADO DEVIA DAR', DIM],
    [`${luck.deltaPct > 0 ? '+' : luck.deltaPct < 0 ? '−' : ''}${Math.abs(luck.deltaPct)}%`, luck.deltaPct >= 0 ? 'ACIMA DO DADO' : 'ABAIXO DO DADO', luck.deltaPct >= 0 ? GREEN : RED],
    [grade.grade, 'NOTA DE DECISÃO', GRADE_COLOR[grade.grade] ?? INK],
  ];
  const colW = (W - 80) / stats.length;
  stats.forEach(([v, label, color], i) => {
    const cx = 40 + colW * i + colW / 2;
    ctx.textAlign = 'center';
    ctx.font = '800 44px Oswald, Arial Narrow, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(v, cx, 250, colW - 16);
    ctx.font = '600 14px Inter, Arial, sans-serif';
    ctx.fillStyle = DIM;
    ctx.fillText(label, cx, 278, colW - 10);
  });

  // a FITA DAS CHAMADAS — um quadrado por decisão, com a % que você viu
  ctx.textAlign = 'left';
  ctx.font = '600 15px Inter, Arial, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText('A FITA DAS CHAMADAS — um quadrado por decisão · o número é a % que você viu antes de rolar', 40, 328);
  const PER_ROW = 14;
  const CELL = 56;
  const GAP = 8;
  const startY = 346;
  const shown = d.events.slice(0, PER_ROW * 3);
  shown.forEach((e, i) => {
    const r = Math.floor(i / PER_ROW);
    const c = i % PER_ROW;
    const x = 40 + c * (CELL + GAP);
    const y = startY + r * (CELL + GAP);
    ctx.fillStyle = e.won ? GREEN : e.result === 'partial' ? '#c9a23f' : RED;
    ctx.beginPath();
    ctx.roundRect(x, y, CELL, CELL, 6);
    ctx.fill();
    ctx.font = '800 18px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#141821';
    ctx.fillText(`${Math.round(e.pWin * 100)}%`, x + CELL / 2, y + CELL / 2 + 6);
    ctx.textAlign = 'left';
  });
  if (!shown.length) {
    ctx.fillStyle = GRAY;
    ctx.font = '600 16px Inter, Arial, sans-serif';
    ctx.fillText('sem chamadas nesta série', 40, startY + 30);
  }

  // destaque: maior upset que pegou
  const rows = Math.max(1, Math.ceil(shown.length / PER_ROW));
  const bestY = startY + rows * (CELL + GAP) + 26;
  const best = bestCall(d.events);
  if (best) {
    ctx.font = '600 16px Inter, Arial, sans-serif';
    ctx.fillStyle = GREEN;
    ctx.fillText(`★ maior aposta que pegou: ${best.label} · tinha ${Math.round(best.pWin * 100)}%`, 40, bestY, W - 80);
  }

  // rodapé
  ctx.textAlign = 'center';
  ctx.font = '600 17px Inter, Arial, sans-serif';
  ctx.fillStyle = GOLD;
  ctx.fillText(`roadtomajor.com.br · ${luckLine(luck)} · nota ${grade.grade}`, W / 2, H - 38);

  return canvas.toDataURL('image/png');
}

// compartilha: Web Share API (arquivo) → senão download + texto no clipboard.
export async function shareDecisionCard(d: DecisionShareData): Promise<'shared' | 'saved'> {
  const url = drawDecisionShareCard(d);
  const luck = luckAdjusted(d.events);
  const grade = decisionGrade(d.events);
  const text = [
    `${d.nick} no MAJOR//CS: ${luck.actual}/${luck.n} chamadas deram — ${luckLine(luck)} · nota de decisão ${grade.grade}`,
    d.won == null ? d.scoreLabel : `${d.won ? 'Vitória' : 'Derrota'} ${d.scoreLabel}`,
    'Jogue a sua: https://roadtomajor.com.br',
  ].join('\n');
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], 'minhas-chamadas.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text });
      return 'shared';
    }
  } catch { /* share cancelado/indisponível — cai pro download */ }
  const a = document.createElement('a');
  a.href = url;
  a.download = 'minhas-chamadas.png';
  a.click();
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard indisponível */ }
  return 'saved';
}
