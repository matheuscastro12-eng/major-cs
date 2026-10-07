// Cards compartilháveis do Legado (PNG gerado no cliente, sem servidor):
// "minha dinastia", "campeão do Major" e "jogador do ano". 1080×1350 (retrato,
// o formato que o feed do X/Instagram mostra inteiro). Paleta da interface
// universal: marinho profundo + dourado da estrela. Canvas não lê CSS vars,
// então as cores ficam aqui (espelho de styles/tokens.css).
//
// Compartilhar: Web Share API com arquivo (celular) → senão baixa o PNG e
// copia o texto pro clipboard.

import { ct } from './career-i18n';

const W = 1080;
const H = 1350;
const C = {
  bg0: '#070d19', bg1: '#0e1829', bg2: '#13213a', line: '#243757',
  ink: '#eaf0f8', dim: '#b7c4d8', faint: '#8fa2bf',
  gold: '#e8b64a', goldHi: '#f6d27a', goldDeep: '#a87a22', win: '#2fd583',
};
const COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY = 'Barlow, Arial, sans-serif';

export interface CardRosterRow { nick: string; role?: string; value?: string }

export interface DynastyCardData {
  kind: 'dynasty';
  orgName: string; tag: string; colors: [string, string];
  seasons: number; splits: number; titles: number; majors: number; reputation: number; repLabel: string;
  roster: CardRosterRow[];          // elenco atual (até 5)
  trophies: string[];               // linhas de troféus marcantes (até 4)
  legends: string[];                // lendas do clube (até 4)
  numbers: { label: string; value: string }[]; // 3 recordes
}
export interface MajorCardData {
  kind: 'major';
  orgName: string; tag: string; colors: [string, string];
  title: string;                    // "Major · Temporada 3"
  roster: CardRosterRow[];
  coach?: string; mvp?: string;
  numbers: { label: string; value: string }[];
}
export interface PlayerYearCardData {
  kind: 'poty';
  nick: string; country: string; role: string; team: string; year: number;
  rating: string; maps: number; titles: number; ovr: number;
  runnersUp: CardRosterRow[];       // #2…#5
  orgName: string; colors: [string, string];
}
export type LegadoCardData = DynastyCardData | MajorCardData | PlayerYearCardData;

// ─── primitivas ────────────────────────────────────────────────────────────
function frame(ctx: CanvasRenderingContext2D, accent: [string, string]) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.bg1);
  bg.addColorStop(0.55, C.bg0);
  bg.addColorStop(1, C.bg0);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // brilho dourado no topo (holofote de palco)
  const glow = ctx.createRadialGradient(W / 2, 120, 40, W / 2, 120, 820);
  glow.addColorStop(0, 'rgba(232,182,74,0.26)');
  glow.addColorStop(0.5, 'rgba(232,182,74,0.06)');
  glow.addColorStop(1, 'rgba(232,182,74,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // raios sutis
  ctx.save();
  ctx.translate(W / 2, 250);
  for (let i = 0; i < 18; i++) {
    ctx.rotate((Math.PI * 2) / 18);
    ctx.fillStyle = i % 2 ? 'rgba(246,210,122,0.035)' : 'rgba(246,210,122,0.015)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-60, -1200);
    ctx.lineTo(60, -1200);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // faixa com as cores do clube
  const stripe = ctx.createLinearGradient(0, 0, W, 0);
  stripe.addColorStop(0, accent[0]);
  stripe.addColorStop(1, accent[1]);
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, W, 10);
  // moldura dupla dourada
  ctx.strokeStyle = 'rgba(232,182,74,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 34, W - 56, H - 62);
  ctx.strokeStyle = 'rgba(232,182,74,0.18)';
  ctx.strokeRect(40, 46, W - 80, H - 86);
}

function lockup(ctx: CanvasRenderingContext2D, kicker: string) {
  ctx.textAlign = 'left';
  ctx.font = `700 34px ${COND}`;
  ctx.fillStyle = C.ink;
  ctx.fillText('ROAD TO', 76, 108);
  const w = ctx.measureText('ROAD TO ').width;
  ctx.fillStyle = C.gold;
  ctx.fillText('MAJOR', 76 + w, 108);
  ctx.textAlign = 'right';
  ctx.font = `700 22px ${COND}`;
  ctx.fillStyle = C.faint;
  ctx.fillText(kicker.toUpperCase(), W - 76, 106);
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Troféu vetorial (taça + alças + base), dourado com gradiente. */
function trophy(ctx: CanvasRenderingContext2D, cx: number, top: number, s: number) {
  const g = ctx.createLinearGradient(cx - 90 * s, 0, cx + 90 * s, 0);
  g.addColorStop(0, C.goldDeep);
  g.addColorStop(0.45, C.goldHi);
  g.addColorStop(1, C.goldDeep);
  ctx.save();
  ctx.fillStyle = g;
  ctx.strokeStyle = g;
  // alças
  ctx.lineWidth = 14 * s;
  ctx.beginPath();
  ctx.arc(cx - 78 * s, top + 60 * s, 34 * s, Math.PI * 0.5, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 78 * s, top + 60 * s, 34 * s, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();
  // taça
  ctx.beginPath();
  ctx.moveTo(cx - 92 * s, top);
  ctx.lineTo(cx + 92 * s, top);
  ctx.bezierCurveTo(cx + 92 * s, top + 120 * s, cx + 40 * s, top + 160 * s, cx + 16 * s, top + 168 * s);
  ctx.lineTo(cx + 16 * s, top + 200 * s);
  ctx.lineTo(cx - 16 * s, top + 200 * s);
  ctx.lineTo(cx - 16 * s, top + 168 * s);
  ctx.bezierCurveTo(cx - 40 * s, top + 160 * s, cx - 92 * s, top + 120 * s, cx - 92 * s, top);
  ctx.closePath();
  ctx.fill();
  // base
  ctx.beginPath();
  ctx.roundRect(cx - 62 * s, top + 200 * s, 124 * s, 22 * s, 4 * s);
  ctx.roundRect(cx - 82 * s, top + 222 * s, 164 * s, 30 * s, 6 * s);
  ctx.fill();
  ctx.restore();
  star(ctx, cx, top + 66 * s, 30 * s, 'rgba(7,13,25,0.55)');
}

function centerText(ctx: CanvasRenderingContext2D, text: string, y: number, font: string, color: string, maxW = W - 160) {
  ctx.textAlign = 'center';
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text, W / 2, y, maxW);
}

function statRow(ctx: CanvasRenderingContext2D, items: { label: string; value: string; gold?: boolean }[], y: number) {
  const x0 = 76, w = W - 152;
  ctx.fillStyle = 'rgba(19,33,58,0.72)';
  ctx.beginPath();
  ctx.roundRect(x0, y, w, 128, 16);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const colW = w / items.length;
  items.forEach((it, i) => {
    const cx = x0 + colW * i + colW / 2;
    if (i > 0) {
      ctx.fillStyle = C.line;
      ctx.fillRect(x0 + colW * i, y + 24, 1.5, 80);
    }
    ctx.textAlign = 'center';
    ctx.font = `800 58px ${COND}`;
    ctx.fillStyle = it.gold ? C.gold : C.ink;
    ctx.fillText(it.value, cx, y + 72, colW - 20);
    ctx.font = `600 19px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText(it.label.toUpperCase(), cx, y + 104, colW - 16);
  });
}

function sectionTitle(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number) {
  ctx.textAlign = 'left';
  ctx.font = `700 22px ${COND}`;
  ctx.fillStyle = C.gold;
  ctx.fillText(text.toUpperCase(), x, y);
  const tw = ctx.measureText(text.toUpperCase()).width;
  ctx.fillStyle = 'rgba(232,182,74,0.3)';
  ctx.fillRect(x + tw + 14, y - 7, Math.max(0, w - tw - 14), 1.5);
}

function rosterList(ctx: CanvasRenderingContext2D, rows: CardRosterRow[], x: number, y: number, w: number, rowH = 54) {
  rows.forEach((r, i) => {
    const yy = y + i * rowH;
    ctx.fillStyle = i % 2 ? 'rgba(14,24,41,0.6)' : 'rgba(19,33,58,0.6)';
    ctx.beginPath();
    ctx.roundRect(x, yy, w, rowH - 6, 8);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = `700 30px ${COND}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(r.nick, x + 18, yy + 34, w * 0.55);
    if (r.role) {
      ctx.font = `600 17px ${BODY}`;
      ctx.fillStyle = C.faint;
      ctx.fillText(r.role.toUpperCase(), x + 18 + Math.min(w * 0.55, ctx.measureText(r.nick).width * 1.55 + 14), yy + 32);
    }
    if (r.value) {
      ctx.textAlign = 'right';
      ctx.font = `700 26px ${COND}`;
      ctx.fillStyle = C.gold;
      ctx.fillText(r.value, x + w - 18, yy + 33);
    }
  });
}

function footer(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(232,182,74,0.3)';
  ctx.fillRect(76, H - 116, W - 152, 1.5);
  centerText(ctx, 'roadtomajor.com.br', H - 74, `700 26px ${COND}`, C.gold);
  centerText(ctx, ct('Construa a sua dinastia no Road to Major'), H - 46, `500 18px ${BODY}`, C.faint);
}

// ─── os três cards ─────────────────────────────────────────────────────────
function drawDynasty(ctx: CanvasRenderingContext2D, d: DynastyCardData) {
  frame(ctx, d.colors);
  lockup(ctx, ct('Minha dinastia'));
  trophy(ctx, W / 2, 160, 0.72);
  centerText(ctx, `${d.tag ? `[${d.tag.toUpperCase()}] ` : ''}${d.orgName.toUpperCase()}`, 410, `800 68px ${COND}`, C.ink);
  centerText(ctx, `${d.seasons} ${d.seasons === 1 ? ct('temporada') : ct('temporadas')} · ${d.splits} splits · ${ct('reputação')} ${d.reputation} (${d.repLabel})`, 452, `500 22px ${BODY}`, C.dim);
  statRow(ctx, [
    { label: ct('Títulos'), value: String(d.titles), gold: true },
    { label: 'Majors', value: String(d.majors), gold: d.majors > 0 },
    ...d.numbers.slice(0, 2).map((n) => ({ label: n.label, value: n.value })),
  ], 486);
  const colW = (W - 152 - 32) / 2;
  sectionTitle(ctx, ct('Elenco'), 76, 676, colW);
  rosterList(ctx, d.roster.slice(0, 5), 76, 694, colW);
  const rx = 76 + colW + 32;
  sectionTitle(ctx, ct('Sala de troféus'), rx, 676, colW);
  ctx.textAlign = 'left';
  (d.trophies.length ? d.trophies : [ct('A primeira taça está a caminho')]).slice(0, 4).forEach((t, i) => {
    const yy = 694 + i * 54;
    ctx.fillStyle = 'rgba(19,33,58,0.6)';
    ctx.beginPath();
    ctx.roundRect(rx, yy, colW, 48, 8);
    ctx.fill();
    star(ctx, rx + 26, yy + 24, 12, C.gold);
    ctx.font = `600 22px ${BODY}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(t, rx + 48, yy + 31, colW - 60);
  });
  sectionTitle(ctx, ct('Lendas do clube'), 76, 990, W - 152);
  centerText(ctx, d.legends.length ? d.legends.slice(0, 4).join('  ·  ') : ct('As lendas ainda estão sendo escritas'), 1046, `700 36px ${COND}`, d.legends.length ? C.goldHi : C.faint);
  const recs = d.numbers.slice(2, 5);
  if (recs.length) centerText(ctx, recs.map((n) => `${n.label}: ${n.value}`).join('   ·   '), 1110, `500 21px ${BODY}`, C.dim);
  footer(ctx);
}

function drawMajor(ctx: CanvasRenderingContext2D, d: MajorCardData) {
  frame(ctx, d.colors);
  lockup(ctx, d.title);
  trophy(ctx, W / 2, 150, 1.02);
  centerText(ctx, ct('CAMPEÃO DO MAJOR'), 470, `800 92px ${COND}`, C.gold);
  centerText(ctx, `${d.tag ? `[${d.tag.toUpperCase()}] ` : ''}${d.orgName.toUpperCase()}`, 536, `700 50px ${COND}`, C.ink);
  statRow(ctx, d.numbers.slice(0, 3).map((n, i) => ({ ...n, gold: i === 0 })), 576);
  sectionTitle(ctx, ct('Os campeões'), 76, 768, W - 152);
  rosterList(ctx, d.roster.slice(0, 5), 76, 786, W - 152, 56);
  const extra = [d.coach ? `${ct('Técnico')}: ${d.coach}` : '', d.mvp ? `MVP: ${d.mvp}` : ''].filter(Boolean).join('   ·   ');
  if (extra) centerText(ctx, extra, 1112, `600 24px ${BODY}`, C.dim);
  footer(ctx);
}

function drawPoty(ctx: CanvasRenderingContext2D, d: PlayerYearCardData) {
  frame(ctx, d.colors);
  lockup(ctx, `${ct('Temporada')} ${d.year}`);
  // medalha #1
  const cy = 300;
  const g = ctx.createRadialGradient(W / 2, cy - 30, 10, W / 2, cy, 150);
  g.addColorStop(0, C.goldHi);
  g.addColorStop(1, C.goldDeep);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(W / 2, cy, 132, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(7,13,25,0.35)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(W / 2, cy, 112, 0, Math.PI * 2);
  ctx.stroke();
  centerText(ctx, '#1', cy + 40, `800 120px ${COND}`, C.bg0);
  centerText(ctx, ct('JOGADOR DO ANO'), 512, `700 34px ${COND}`, C.gold);
  centerText(ctx, d.nick.toUpperCase(), 600, `800 104px ${COND}`, C.ink);
  centerText(ctx, `${d.role} · ${d.team} · ${d.country.toUpperCase()}`, 646, `600 24px ${BODY}`, C.dim);
  statRow(ctx, [
    { label: 'Rating', value: d.rating, gold: true },
    { label: ct('Mapas'), value: String(d.maps) },
    { label: ct('Títulos'), value: String(d.titles) },
    { label: 'OVR', value: String(d.ovr) },
  ], 690);
  sectionTitle(ctx, `Top 20 · ${ct('Temporada')} ${d.year}`, 76, 884, W - 152);
  rosterList(ctx, d.runnersUp.slice(0, 4), 76, 902, W - 152, 56);
  footer(ctx);
}

export function drawLegadoCard(d: LegadoCardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  if (d.kind === 'dynasty') drawDynasty(ctx, d);
  else if (d.kind === 'major') drawMajor(ctx, d);
  else drawPoty(ctx, d);
  return canvas;
}

/** Espera as fontes da interface antes de pintar (senão o canvas usa a do sistema). */
async function fontsReady(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    await Promise.all([`800 40px ${COND}`, `600 20px ${BODY}`].map((f) => fonts.load(f).catch(() => undefined)));
  } catch { /* sem FontFaceSet: segue com o fallback */ }
}

export async function legadoCardDataUrl(d: LegadoCardData): Promise<string> {
  await fontsReady();
  return drawLegadoCard(d).toDataURL('image/png');
}

export function legadoCardFileName(d: LegadoCardData): string {
  const base = d.kind === 'poty' ? `jogador-do-ano-${d.nick}` : d.kind === 'major' ? `campeao-do-major-${d.orgName}` : `minha-dinastia-${d.orgName}`;
  return `road-to-major-${base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
}

export function legadoShareText(d: LegadoCardData): string {
  if (d.kind === 'poty') return `${d.nick}: ${ct('jogador do ano')} (${ct('Temporada')} ${d.year}) ${ct('no Road to Major')}. Rating ${d.rating}.\nhttps://roadtomajor.com.br`;
  if (d.kind === 'major') return `${d.orgName} ${ct('é campeã do Major no Road to Major')} 🏆\nhttps://roadtomajor.com.br`;
  return `${ct('Minha dinastia no Road to Major')}: ${d.orgName}, ${d.titles} ${ct('títulos')}, ${d.majors} Major${d.majors === 1 ? '' : 's'}.\nhttps://roadtomajor.com.br`;
}

/** Compartilha (Web Share com arquivo) ou baixa o PNG + copia o texto. */
export async function shareLegadoCard(d: LegadoCardData): Promise<'shared' | 'saved'> {
  const url = await legadoCardDataUrl(d);
  const name = legadoCardFileName(d);
  const text = legadoShareText(d);
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], name, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'shared'; // cancelado pelo usuário
  }
  downloadLegadoCard(url, name);
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard indisponível */ }
  return 'saved';
}

export function downloadLegadoCard(url: string, name: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
