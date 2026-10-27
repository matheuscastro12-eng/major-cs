// Card "MINHA CHAVE DO MAJOR" — o Champions Stage simulado como imagem 1200×675
// (proporção do card do X). Canvas puro → PNG, mesmo padrão de careerShareCard.ts.
// Sem logos remotos (canvas "tainted" bloqueia o toDataURL): cada time vira uma
// pastilha com as cores e a tag do time.
import type { MajorRun } from '../engine/majorSingapore';
import { shareUrl, xIntentUrl } from './shareLink';
import { BO3_PHOTO_CREDIT_CARD, BO3_PHOTOS_ON, drawAvatar, loadedPhoto } from '../data/bo3Photos';

export interface CardTeam { id: string; name: string; tag: string; colors: [string, string]; players?: string[] }
export interface CardSeries { a: CardTeam; b: CardTeam; score: [number, number]; winner: 0 | 1 }
export interface MajorCardData { rounds: { key: 'QF' | 'SF' | 'FINAL'; series: CardSeries[] }[]; champion: CardTeam }

const NEUTRAL: [string, string] = ['#2a3240', '#e8edf3'];

/** Monta os dados do card a partir de um Major simulado. Puro (testável). */
export function majorCardData(run: MajorRun, info: (id: string) => { name: string; tag: string; colors?: [string, string]; players?: string[] } | undefined): MajorCardData {
  const team = (id: string): CardTeam => {
    const t = info(id);
    // time sem dados (ex.: fora da base bo3.gg) não derruba o card
    return { id, name: t?.name ?? id, tag: (t?.tag ?? id.slice(-3)).toUpperCase().slice(0, 5), colors: t?.colors ?? NEUTRAL, ...(t?.players ? { players: t.players.slice(0, 5) } : {}) };
  };
  const hist = run.stages[3]?.history ?? [];
  const rounds = (['QF', 'SF', 'FINAL'] as const).map((key) => ({
    key,
    series: hist.filter((h) => h.pairing.label.startsWith(key) && h.pairing.result).map(({ pairing: p }) => ({
      a: team(p.a), b: team(p.b), score: [p.result!.mapScore[0], p.result!.mapScore[1]] as [number, number], winner: p.result!.winner as 0 | 1,
    })),
  }));
  return { rounds, champion: team(run.championId) };
}

export const MAJOR_CARD_URL = shareUrl('/major-singapore', 'major-chave');

export function majorXText(d: MajorCardData): string {
  const f = d.rounds.find((r) => r.key === 'FINAL')?.series[0];
  const vice = f ? (f.winner === 0 ? f.b : f.a).name : '';
  return `simulei o major de singapura e deu ${d.champion.name} campeã 🏆${vice ? ` em cima da ${vice}` : ''}\nqual é a sua chave? #CS2 #RoadToMajor`;
}

const FONT_D = '"Barlow Condensed", "Arial Narrow", sans-serif';
const FONT_B = 'Barlow, Arial, sans-serif';
const GOLD = '#ecc75f';
const INK = '#eef2f7';
const DIM = '#8b96a3';

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, t: CardTeam, r: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = t.colors[0]; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();
  ctx.fillStyle = t.colors[1] ?? INK;
  ctx.font = `700 ${Math.round(r * 0.62)}px ${FONT_D}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(t.tag.slice(0, 4), x, y + 1);
  ctx.textBaseline = 'alphabetic';
}

function fit(ctx: CanvasRenderingContext2D, s: string, max: number) {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export function drawMajorCard(d: MajorCardData): string {
  const W = 1200, H = 675;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#121826'); bg.addColorStop(1, '#0a0e16');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 220, 120, 40, W - 220, 120, 620);
  glow.addColorStop(0, 'rgba(236,199,95,0.26)'); glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = GOLD; ctx.fillRect(0, 0, W, 6);

  // cabeçalho
  ctx.textAlign = 'left';
  ctx.font = `700 30px ${FONT_D}`; ctx.fillStyle = INK; ctx.fillText('ROAD TO', 48, 64);
  ctx.fillStyle = GOLD; ctx.fillText('MAJOR', 48 + ctx.measureText('ROAD TO ').width, 64);
  ctx.font = `700 52px ${FONT_D}`; ctx.fillStyle = INK; ctx.fillText('MINHA CHAVE · PGL MAJOR SINGAPORE', 48, 124);
  ctx.font = `500 20px ${FONT_B}`; ctx.fillStyle = DIM; ctx.fillText('Champions Stage simulado · 10 – 13 dez · Singapore Indoor Stadium', 48, 156);

  // chave: 3 colunas
  const cols = [48, 368, 688], colW = 280, top = 200, area = 400;
  const titles = { QF: 'QUARTAS', SF: 'SEMIFINAL', FINAL: 'FINAL' } as const;
  d.rounds.forEach((r, ci) => {
    const x = cols[ci];
    ctx.font = `700 18px ${FONT_D}`; ctx.fillStyle = DIM; ctx.textAlign = 'left';
    ctx.fillText(titles[r.key], x, top - 12);
    const n = Math.max(1, r.series.length), slot = area / n, h = 84;
    r.series.forEach((s, i) => {
      const y = top + slot * i + (slot - h) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x, y, colW, h, 10); ctx.fill(); ctx.stroke();
      [s.a, s.b].forEach((t, side) => {
        const ry = y + 22 + side * 40, win = s.winner === side;
        pill(ctx, x + 24, ry, t, 15);
        ctx.textAlign = 'left'; ctx.font = `${win ? 700 : 500} 20px ${FONT_B}`; ctx.fillStyle = win ? INK : DIM;
        ctx.fillText(fit(ctx, t.name, colW - 100), x + 48, ry + 7);
        ctx.textAlign = 'right'; ctx.font = `700 22px ${FONT_D}`; ctx.fillStyle = win ? (r.key === 'FINAL' ? GOLD : INK) : DIM;
        ctx.fillText(String(s.score[side]), x + colW - 16, ry + 8);
      });
    });
  });

  // campeão
  const cx = 1036;
  ctx.textAlign = 'center';
  ctx.font = `700 18px ${FONT_D}`; ctx.fillStyle = GOLD; ctx.fillText('CAMPEÃ', cx, 268);
  pill(ctx, cx, 360, d.champion, 70);
  ctx.beginPath(); ctx.arc(cx, 360, 80, 0, Math.PI * 2); ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
  ctx.font = `700 40px ${FONT_D}`; ctx.fillStyle = INK; ctx.fillText(fit(ctx, d.champion.name.toUpperCase(), 280), cx, 488);
  const roster = d.champion.players ?? [];
  if (roster.length) {
    // elenco campeão: foto local (same-origin, flag bo3) ou iniciais — nunca hotlink
    const r = 21, gap = 50, x0 = cx - ((roster.length - 1) * gap) / 2;
    roster.forEach((nick, i) => {
      const x = x0 + i * gap;
      drawAvatar(ctx, nick, x, 540, r, d.champion.colors[0], FONT_D);
      ctx.beginPath(); ctx.arc(x, 540, r, 0, Math.PI * 2); ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = `600 13px ${FONT_B}`; ctx.fillStyle = DIM; ctx.fillText(fit(ctx, nick, gap - 4), x, 580);
    });
    if (BO3_PHOTOS_ON || roster.some((n) => loadedPhoto(n))) { ctx.textAlign = 'right'; ctx.font = `600 14px ${FONT_B}`; ctx.fillStyle = DIM; ctx.fillText(BO3_PHOTO_CREDIT_CARD, W - 32, H - 36); }
  } else {
    ctx.font = '64px serif'; ctx.fillText('🏆', cx, 570);
  }

  ctx.textAlign = 'left'; ctx.font = `600 18px ${FONT_B}`; ctx.fillStyle = GOLD;
  ctx.fillText('roadtomajor.com.br/major-singapore · simule a sua chave', 48, H - 36);
  return c.toDataURL('image/png');
}

/** Web Share (arquivo) no celular; senão baixa o PNG e copia o texto. */
export async function shareMajorCard(d: MajorCardData): Promise<'shared' | 'saved'> {
  const url = drawMajorCard(d);
  const text = `${majorXText(d)}\n${MAJOR_CARD_URL}`;
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], 'minha-chave-major.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], text }); return 'shared'; }
  } catch { /* cancelado/indisponível → download */ }
  const a = document.createElement('a'); a.href = url; a.download = 'minha-chave-major.png'; a.click();
  try { await navigator.clipboard.writeText(text); } catch { /* sem clipboard */ }
  return 'saved';
}

/** Baixa o PNG e devolve o intent do X (o usuário anexa a imagem baixada). */
export function postMajorCardOnX(d: MajorCardData): string {
  const a = document.createElement('a'); a.href = drawMajorCard(d); a.download = 'minha-chave-major.png'; a.click();
  return xIntentUrl(majorXText(d), MAJOR_CARD_URL);
}
