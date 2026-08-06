// Card "MINHA CARREIRA EM 1 PRINT" — a história da org como imagem (canvas puro
// → PNG, zero libs; mesmo padrão de share.ts e ultimate/shareCard.ts).
// O gancho visual é a FITA DA CARREIRA: um quadradinho por split (dourado =
// campeão, verde = top 4, cinza = meio, vermelho = fundo) com ⭐ nos Majors —
// a "grade do Wordle" da sua gestão.

export interface CareerShareSplit {
  champion: boolean;
  top4: boolean;
  bottom: boolean;
  major?: 'won' | 'played';
}

export interface CareerShareData {
  orgName: string;
  tag?: string;
  splits: number;
  titles: number;
  majorsWon: number;
  majorsPlayed: number;
  prizeLabel: string;
  bestLabel: string;
  seq: CareerShareSplit[];   // cronológico (split 1 → hoje)
}

const GOLD = '#ecc75f';
const GREEN = '#39c07a';
const GRAY = '#3a4350';
const RED = '#e05a5a';

function toneOf(s: CareerShareSplit): string {
  return s.champion ? GOLD : s.top4 ? GREEN : s.bottom ? RED : GRAY;
}

export function drawCareerShareCard(d: CareerShareData): string {
  const W = 1000;
  const H = 625;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // fundo escuro + glow dourado (a carreira é conquista, não derrota)
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#141821');
  bg.addColorStop(1, '#0d1118');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -120, 60, W / 2, -120, 760);
  glow.addColorStop(0, 'rgba(236,199,95,0.22)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#8a6f2c';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  // lockup
  ctx.font = '700 34px Oswald, Arial Narrow, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('ROAD TO MAJOR', 40, 64);
  ctx.fillStyle = GOLD;
  ctx.font = '700 22px Oswald, Arial Narrow, sans-serif';
  ctx.fillText('MODO CARREIRA', 40, 94);

  // org
  ctx.textAlign = 'right';
  ctx.font = '800 30px Oswald, Arial Narrow, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${d.tag ? `[${d.tag.toUpperCase()}] ` : ''}${d.orgName}`, W - 40, 70);
  ctx.font = '500 16px Inter, Arial, sans-serif';
  ctx.fillStyle = '#8b93a3';
  ctx.fillText('minha carreira em 1 print', W - 40, 96);

  // stats — a régua da gestão
  const stats: [string, string, string][] = [
    [String(d.splits), 'SPLITS', '#ffffff'],
    [String(d.titles), 'TÍTULOS', GREEN],
    [`${d.majorsWon}/${d.majorsPlayed}`, 'MAJORS 🏆', GOLD],
    [d.prizeLabel, 'PRÊMIOS', '#ffffff'],
    [d.bestLabel, 'MELHOR CAMPANHA', GOLD],
  ];
  const colW = (W - 80) / stats.length;
  stats.forEach(([v, label, color], i) => {
    const cx = 40 + colW * i + colW / 2;
    ctx.textAlign = 'center';
    ctx.font = '800 44px Oswald, Arial Narrow, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(v, cx, 190, colW - 16);
    ctx.font = '600 14px Inter, Arial, sans-serif';
    ctx.fillStyle = '#8b93a3';
    ctx.fillText(label, cx, 218, colW - 10);
  });

  // a FITA DA CARREIRA — um quadrado por split, 20 por linha
  ctx.textAlign = 'left';
  ctx.font = '600 15px Inter, Arial, sans-serif';
  ctx.fillStyle = '#8b93a3';
  ctx.fillText('A FITA DA CARREIRA — um quadrado por split', 40, 268);
  const PER_ROW = 20;
  const CELL = 34;
  const GAP = 8;
  const rows = Math.max(1, Math.ceil(d.seq.length / PER_ROW));
  const startY = 288;
  d.seq.forEach((s, i) => {
    const r = Math.floor(i / PER_ROW);
    const c = i % PER_ROW;
    const x = 40 + c * (CELL + GAP);
    const y = startY + r * (CELL + GAP);
    ctx.fillStyle = toneOf(s);
    ctx.beginPath();
    ctx.roundRect(x, y, CELL, CELL, 6);
    ctx.fill();
    if (s.major) {
      ctx.font = '700 18px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = s.major === 'won' ? '#141821' : 'rgba(20,24,33,0.75)';
      ctx.fillText(s.major === 'won' ? '★' : '☆', x + CELL / 2, y + CELL / 2 + 6);
      ctx.textAlign = 'left';
    }
  });

  // legenda
  const legendY = startY + rows * (CELL + GAP) + 26;
  const legend: [string, string][] = [[GOLD, 'campeão'], [GREEN, 'top 4'], [GRAY, 'meio de tabela'], [RED, 'fundo'], ['★', 'Major']];
  let lx = 40;
  for (const [color, label] of legend) {
    if (color === '★') {
      ctx.font = '700 16px Inter, Arial, sans-serif';
      ctx.fillStyle = GOLD;
      ctx.fillText('★', lx, legendY + 12);
      lx += 20;
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(lx, legendY, 14, 14, 3);
      ctx.fill();
      lx += 22;
    }
    ctx.font = '500 14px Inter, Arial, sans-serif';
    ctx.fillStyle = '#8b93a3';
    ctx.fillText(label, lx, legendY + 12);
    lx += ctx.measureText(label).width + 26;
  }

  // rodapé
  ctx.textAlign = 'center';
  ctx.font = '600 17px Inter, Arial, sans-serif';
  ctx.fillStyle = GOLD;
  ctx.fillText('roadtomajor.com.br · construa a SUA história', W / 2, H - 38);

  return canvas.toDataURL('image/png');
}

// compartilha: Web Share API (arquivo) → senão download + texto no clipboard.
export async function shareCareerCard(d: CareerShareData): Promise<'shared' | 'saved'> {
  const url = drawCareerShareCard(d);
  const text = [
    `Minha carreira no MAJOR//CS: ${d.splits} splits, ${d.titles} títulos, ${d.majorsWon} Major${d.majorsWon === 1 ? '' : 's'} 🏆`,
    `Melhor campanha: ${d.bestLabel} · Prêmios: ${d.prizeLabel}`,
    'Construa a sua: https://roadtomajor.com.br',
  ].join('\n');
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], 'minha-carreira.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text });
      return 'shared';
    }
  } catch { /* share cancelado/indisponível — cai pro download */ }
  const a = document.createElement('a');
  a.href = url;
  a.download = 'minha-carreira.png';
  a.click();
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard indisponível */ }
  return 'saved';
}
