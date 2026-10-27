// Card "MEU TIME DOS SONHOS" do Draft: os 5 picks (+ coach) como imagem 1200×675
// pro X (canvas puro → PNG; mesmo padrão de careerShareCard.ts). Sem logos
// remotos (canvas "tainted" quebra o toDataURL): a origem vai como pílula com
// as cores do time.
import type { DraftState, TeamSeason } from '../types';
import { playerOvr } from '../engine/ratings';
import { shareUrl } from './shareLink';
import { BO3_PHOTO_CREDIT_CARD, BO3_PHOTOS_ON, drawAvatar, loadedPhoto } from '../data/bo3Photos';

export interface DreamPick { nick: string; role: string; ovr: number; from: string; era: string; colors: [string, string] }
export interface DreamTeamData {
  teamName: string;
  picks: DreamPick[];          // até 5, na ordem do draft
  coach?: { nick: string; from: string };
  avgOvr: number;
  eras: number;                // quantas eras/jogos diferentes no elenco
}

const NEUTRAL: [string, string] = ['#3a4350', '#ecc75f'];

/** Puro: extrai do DraftState o que vai no card (tolera pick sem time/jogador). */
export function dreamTeamData(draft: DraftState, dataset: TeamSeason[]): DreamTeamData {
  const picks: DreamPick[] = [];
  for (const r of draft.rounds.slice(0, 5)) {
    if (!r.pickedPlayerId) continue;
    const t = dataset.find((x) => x.id === r.teamSeasonId);
    const p = t?.players.find((x) => x.id === r.pickedPlayerId);
    if (!t || !p) continue;
    const c = (t.colors?.length ? [t.colors[0], t.colors[1] ?? t.colors[0]] : NEUTRAL) as [string, string];
    picks.push({ nick: p.nick, role: p.role, ovr: playerOvr(p), from: t.team, era: t.era, colors: c });
  }
  const ct = draft.pickedCoachTeamId ? dataset.find((x) => x.id === draft.pickedCoachTeamId) : undefined;
  const avgOvr = picks.length ? Math.round(picks.reduce((s, p) => s + p.ovr, 0) / picks.length) : 0;
  return {
    teamName: draft.teamName?.trim() || 'Meu time dos sonhos',
    picks,
    coach: ct ? { nick: ct.coach.nick, from: `${ct.team} ${ct.era}` } : undefined,
    avgOvr,
    eras: new Set(picks.map((p) => p.era)).size,
  };
}

export const DREAM_CARD_URL = shareUrl('/jogo/draft', 'dream-team');

export function dreamXText(d: DreamTeamData): string {
  const five = d.picks.map((p) => p.nick).join(', ');
  return `meu time dos sonhos no road to major: ${five}${d.coach ? ` · coach ${d.coach.nick}` : ''}\n${d.eras} era${d.eras === 1 ? '' : 's'} do CS, OVR médio ${d.avgOvr}. monta o seu 👇`;
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawDreamTeamCard(d: DreamTeamData): string {
  const W = 1200, H = 675;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#141821'); bg.addColorStop(1, '#0b0f16');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -160, 60, W / 2, -160, 900);
  glow.addColorStop(0, 'rgba(236,199,95,0.22)'); glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#8a6f2c'; ctx.lineWidth = 2; ctx.strokeRect(12, 12, W - 24, H - 24);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ecc75f';
  ctx.font = '700 22px Barlow, Arial, sans-serif';
  ctx.fillText('ROAD TO MAJOR · DRAFT', W / 2, 70);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 58px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.fillText('MEU TIME DOS SONHOS', W / 2, 135);
  ctx.fillStyle = '#9aa4b2';
  ctx.font = '600 24px Barlow, Arial, sans-serif';
  ctx.fillText(d.teamName.slice(0, 40), W / 2, 172);

  const n = Math.max(d.picks.length, 1);
  const cw = 200, gap = 22, total = n * cw + (n - 1) * gap;
  let x = (W - total) / 2;
  const y = 212, ch = 300;
  for (const p of d.picks) {
    pill(ctx, x, y, cw, ch, 18); ctx.fillStyle = '#1a202b'; ctx.fill();
    ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x, y + ch);
    g.addColorStop(0, p.colors[0]); g.addColorStop(0.55, 'transparent');
    ctx.globalAlpha = 0.45; ctx.fillStyle = g; ctx.fillRect(x, y, cw, ch);
    ctx.globalAlpha = 1; ctx.fillStyle = p.colors[0]; ctx.fillRect(x, y, cw, 8);
    ctx.restore();
    pill(ctx, x, y, cw, ch, 18); ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2; ctx.stroke();
    // foto local same-origin (flag bo3.gg) ou iniciais; OVR no canto
    drawAvatar(ctx, p.nick, x + cw / 2, y + 80, 46, p.colors[0], '"Barlow Condensed", "Arial Narrow", sans-serif');
    ctx.beginPath(); ctx.arc(x + cw / 2, y + 80, 46, 0, Math.PI * 2); ctx.strokeStyle = '#ecc75f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = '#ecc75f';
    ctx.font = '800 36px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(String(p.ovr), x + 14, y + 48);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 34px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(p.nick.slice(0, 12), x + cw / 2, y + 166);
    ctx.fillStyle = '#c9d1dc';
    ctx.font = '700 18px Barlow, Arial, sans-serif';
    ctx.fillText(p.role.toUpperCase(), x + cw / 2, y + 194);
    pill(ctx, x + 16, y + ch - 78, cw - 32, 56, 12); ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 17px Barlow, Arial, sans-serif';
    ctx.fillText(p.from.slice(0, 18), x + cw / 2, y + ch - 52);
    ctx.fillStyle = '#ecc75f';
    ctx.font = '600 15px Barlow, Arial, sans-serif';
    ctx.fillText(p.era, x + cw / 2, y + ch - 32);
    x += cw + gap;
  }

  ctx.fillStyle = '#c9d1dc';
  ctx.font = '600 24px Barlow, Arial, sans-serif';
  const stats = [`OVR médio ${d.avgOvr}`, `${d.eras} era${d.eras === 1 ? '' : 's'} do CS`];
  if (d.coach) stats.push(`Coach ${d.coach.nick} (${d.coach.from})`);
  ctx.fillText(stats.join('  ·  '), W / 2, 566);
  ctx.fillStyle = '#ecc75f';
  ctx.font = '600 20px Barlow, Arial, sans-serif';
  ctx.fillText('roadtomajor.com.br · monte o SEU', W / 2, 628);
  if (BO3_PHOTOS_ON || d.picks.some((p) => loadedPhoto(p.nick))) {
    ctx.textAlign = 'right'; ctx.fillStyle = '#9aa4b2'; ctx.font = '600 14px Barlow, Arial, sans-serif';
    ctx.fillText(BO3_PHOTO_CREDIT_CARD, W - 28, H - 24);
  }
  return canvas.toDataURL('image/png');
}

function download(url: string) {
  const a = document.createElement('a');
  a.href = url; a.download = 'meu-time-dos-sonhos.png'; a.click();
}

/** Baixa o PNG (síncrono, no clique, antes de abrir o X). */
export function downloadDreamTeamCard(d: DreamTeamData): void { download(drawDreamTeamCard(d)); }

/** Web Share com arquivo → senão download + texto no clipboard. */
export async function shareDreamTeamCard(d: DreamTeamData): Promise<'shared' | 'saved'> {
  const url = drawDreamTeamCard(d);
  const text = `${dreamXText(d)}\n${DREAM_CARD_URL}`;
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], 'meu-time-dos-sonhos.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text });
      return 'shared';
    }
  } catch { /* cancelado/indisponível */ }
  download(url);
  try { await navigator.clipboard.writeText(text); } catch { /* sem clipboard */ }
  return 'saved';
}
