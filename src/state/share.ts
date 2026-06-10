// Gera o card de compartilhamento (PNG via canvas) com o resultado da campanha.
import type { Tournament, TTeam } from '../types';

export function drawShareCard(t: Tournament, user: TTeam, placementLabel: string, mvpNick?: string): string {
  const W = 1000;
  const H = 560;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // fundo
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1c222b');
  bg.addColorStop(1, '#12161b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, -100, 50, W / 2, -100, 700);
  glow.addColorStop(0, 'rgba(97,168,221,0.25)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#3a4452';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  const isChampion = t.championId === 'user';

  // logo do jogo
  ctx.font = '700 34px Oswald, Arial Narrow, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('MAJOR', 40, 64);
  ctx.fillStyle = '#61a8dd';
  ctx.fillText('//CS', 158, 64);
  ctx.font = '500 16px Inter, Arial, sans-serif';
  ctx.fillStyle = '#8b96a3';
  ctx.fillText(t.name, 40, 90);

  // troféu / resultado
  ctx.textAlign = 'center';
  ctx.font = '120px serif';
  ctx.fillText(isChampion ? '🏆' : '🥀', W / 2, 230);

  ctx.font = '700 56px Oswald, Arial Narrow, sans-serif';
  ctx.fillStyle = isChampion ? '#d8a943' : '#f06c6c';
  ctx.fillText(isChampion ? 'CAMPEÃO DO MAJOR' : placementLabel.toUpperCase(), W / 2, 310);

  ctx.font = '700 36px Oswald, Arial Narrow, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(user.name.toUpperCase(), W / 2, 360);

  // elenco
  ctx.font = '600 22px Inter, Arial, sans-serif';
  ctx.fillStyle = '#dfe5ec';
  ctx.fillText(user.players.map((p) => p.nick).join(' · '), W / 2, 410);

  ctx.font = '500 18px Inter, Arial, sans-serif';
  ctx.fillStyle = '#8b96a3';
  const coachLine = `coach ${user.coach.nick}` + (mvpNick ? `  ·  MVP do torneio: ${mvpNick}` : '');
  ctx.fillText(coachLine, W / 2, 444);

  // rodapé
  ctx.font = '600 17px Inter, Arial, sans-serif';
  ctx.fillStyle = '#61a8dd';
  ctx.fillText('major-cs-pi.vercel.app — monte o seu time dos sonhos', W / 2, 510);

  return canvas.toDataURL('image/png');
}

export function downloadShareCard(t: Tournament, user: TTeam, placementLabel: string, mvpNick?: string): void {
  const url = drawShareCard(t, user, placementLabel, mvpNick);
  const a = document.createElement('a');
  a.href = url;
  a.download = `major-cs-${user.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  a.click();
}
