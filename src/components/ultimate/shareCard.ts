// Card de compartilhamento do DUELO do Ultimate (iter42) — mesmo padrão do
// share de carreira (src/state/share.ts): canvas puro → PNG, zero libs.
// Fluxo: navigator.share com arquivo quando o device suporta (mobile); senão
// download do PNG + texto no clipboard (mesmo fallback do FinalScreen).

export interface UltShareData {
  won: boolean;
  score: string;               // já na perspectiva do usuário ("13-9")
  mapName: string;
  mode: 'rivals' | 'casual' | 'gauntlet' | 'pvp';
  oppName?: string;
  mvp?: { nick: string; kills: number; deaths: number };
  star?: { nick: string; traitName: string; traitIcon: string };
  casterLine?: string | null;  // chamada final do caster (determinística)
  divName?: string;
}

const MODE_LABEL: Record<UltShareData['mode'], string> = {
  rivals: 'DIVISÃO RIVALS', casual: 'AMISTOSO', gauntlet: 'ELITE GAUNTLET', pvp: 'DUELO ONLINE',
};

export function drawUltimateShareCard(d: UltShareData): string {
  const W = 1000;
  const H = 560;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // fundo (paleta escura + dourado do Ultimate)
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#171410');
  bg.addColorStop(1, '#0f0d0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, -120, 60, W / 2, -120, 720);
  glow.addColorStop(0, d.won ? 'rgba(236,199,95,0.30)' : 'rgba(240,108,108,0.16)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = d.won ? '#8a6f2c' : '#4a3f38';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  // lockup
  ctx.font = '700 34px Oswald, Arial Narrow, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('ROAD TO MAJOR', 40, 64);
  ctx.fillStyle = '#ecc75f';
  ctx.font = '700 22px Oswald, Arial Narrow, sans-serif';
  ctx.fillText('✦ ULTIMATE', 40, 94);
  ctx.font = '500 16px Inter, Arial, sans-serif';
  ctx.fillStyle = '#8b8577';
  ctx.textAlign = 'right';
  ctx.fillText(`${MODE_LABEL[d.mode]}${d.mapName ? ` · ${d.mapName}` : ''}`, W - 40, 64);

  // resultado
  ctx.textAlign = 'center';
  ctx.font = '700 60px Oswald, Arial Narrow, sans-serif';
  ctx.fillStyle = d.won ? '#ecc75f' : '#f06c6c';
  ctx.fillText(d.won ? 'VITÓRIA' : 'DERROTA', W / 2, 190);

  ctx.font = '800 96px "JetBrains Mono", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(d.score, W / 2, 295);

  if (d.oppName) {
    ctx.font = '600 22px Inter, Arial, sans-serif';
    ctx.fillStyle = '#c9c2b2';
    ctx.fillText(`vs ${d.oppName}`, W / 2, 335);
  }

  // MVP + craque (com trait)
  const parts: string[] = [];
  if (d.mvp) parts.push(`MVP: ${d.mvp.nick} (${d.mvp.kills}K/${d.mvp.deaths}D)`);
  if (d.star && d.star.nick !== d.mvp?.nick) parts.push(`Craque: ${d.star.traitIcon} ${d.star.nick} · ${d.star.traitName}`);
  else if (d.star) parts.push(`${d.star.traitIcon} ${d.star.traitName}`);
  if (parts.length) {
    ctx.font = '700 24px Inter, Arial, sans-serif';
    ctx.fillStyle = '#ecc75f';
    ctx.fillText(parts.join('   ·   '), W / 2, 390);
  }

  // chamada final do caster
  if (d.casterLine) {
    ctx.font = 'italic 500 20px Inter, Arial, sans-serif';
    ctx.fillStyle = '#a9a394';
    ctx.fillText(`“${d.casterLine}”`, W / 2, 435, W - 120);
  }

  if (d.divName) {
    ctx.font = '600 17px Inter, Arial, sans-serif';
    ctx.fillStyle = '#8b8577';
    ctx.fillText(d.divName, W / 2, 472);
  }

  // rodapé
  ctx.font = '600 17px Inter, Arial, sans-serif';
  ctx.fillStyle = '#ecc75f';
  ctx.fillText('roadtomajor.com.br · monte seu Ultimate Squad', W / 2, 512);

  return canvas.toDataURL('image/png');
}

// compartilha: Web Share API (arquivo) → senão download + texto no clipboard.
export async function shareUltimateResult(d: UltShareData): Promise<'shared' | 'saved'> {
  const url = drawUltimateShareCard(d);
  const text = [
    `${d.won ? '🏆 VITÓRIA' : 'DERROTA'} ${d.score} · ${MODE_LABEL[d.mode]}${d.mapName ? ` · ${d.mapName}` : ''}`,
    d.oppName ? `vs ${d.oppName}` : '',
    d.mvp ? `MVP: ${d.mvp.nick} (${d.mvp.kills}K/${d.mvp.deaths}D)` : '',
    d.star ? `Craque do duelo: ${d.star.traitIcon} ${d.star.nick} · ${d.star.traitName}` : '',
    'Monte seu Ultimate Squad: https://roadtomajor.com.br',
  ].filter(Boolean).join('\n');
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], 'ultimate-duelo.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text });
      return 'shared';
    }
  } catch { /* share cancelado/indisponível — cai pro download */ }
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ultimate-duelo.png';
  a.click();
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard indisponível */ }
  return 'saved';
}
