// Card do RESULTADO DA SÉRIE (canvas puro → PNG, mesma paleta do card do Major
// em components/major/majorShareCard.ts): vitória/derrota, o placar em mapas,
// cada mapa e o destaque da partida. Só lê o SeriesResult (o destaque vem do
// seriesPotm, a mesma regra do Scoreboard). O PNG leva o domínio; o link vai no
// texto do post. `seriesCardData` é puro (scripts/test-share-invite.mts).
import type { SeriesResult } from '../types';
import { MAP_LABELS } from '../types';

export interface SeriesCardData {
  won: boolean;
  me: string;
  opp: string;
  /** mapas vencidos, do ponto de vista do jogador */
  score: [number, number];
  maps: { label: string; score: [number, number]; won: boolean }[];
  potm: { nick: string; rating: number; team: string } | null;
}

export interface SeriesCardLabels {
  win: string;
  loss: string;
  potm: string;
  foot: string;
}

/** dados do card com tudo orientado pro jogador (userIdx = o lado dele) */
export function seriesCardData(
  series: SeriesResult,
  names: [string, string],
  userIdx: 0 | 1,
  potm: { nick: string; rating: number; team: 0 | 1 } | null,
): SeriesCardData {
  const opp: 0 | 1 = userIdx === 0 ? 1 : 0;
  return {
    won: series.winner === userIdx,
    me: names[userIdx],
    opp: names[opp],
    score: [series.mapScore[userIdx], series.mapScore[opp]],
    maps: series.maps.map((m) => ({
      label: MAP_LABELS[m.map] ?? m.map,
      score: [m.score[userIdx], m.score[opp]],
      won: m.winner === userIdx,
    })),
    potm: potm ? { nick: potm.nick, rating: potm.rating, team: names[potm.team] } : null,
  };
}

const NAVY = '#070d19';
const NAVY_2 = '#0e1829';
const LINE = '#243757';
const GOLD = '#e8b64a';
const INK = '#eaf0f8';
const DIM = '#8fa2bf';
const WIN = '#2fd583'; // --c-win (tema escuro)
const LOSS = '#ff6464'; // --c-loss (tema escuro)

const DISPLAY = '"Oswald", "Arial Narrow", sans-serif';
const TITLE = '"Barlow Condensed", "Arial Narrow", sans-serif';
const UI = 'Barlow, Arial, sans-serif';

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number) {
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > max) t = t.slice(0, -1);
  ctx.fillText(t === text ? t : `${t.slice(0, -1)}…`, x, y);
}

export function drawSeriesCard(d: SeriesCardData, L: SeriesCardLabels): string {
  const W = 1200;
  const H = 675;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  const tone = d.won ? WIN : LOSS;

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.fillStyle = GOLD;
  ctx.fillRect(12, 12, W - 24, 4);

  // cabeçalho: marca + resultado
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = DIM;
  ctx.font = `600 18px ${TITLE}`;
  ctx.fillText('ROAD TO MAJOR', 48, 64);
  ctx.fillStyle = tone;
  ctx.font = `700 40px ${DISPLAY}`;
  ctx.fillText((d.won ? L.win : L.loss).toUpperCase(), 48, 116);

  // confronto: meu time · placar · adversário
  ctx.fillStyle = INK;
  ctx.font = `700 64px ${DISPLAY}`;
  fitText(ctx, d.me.toUpperCase(), 48, 212, 440);
  ctx.textAlign = 'center';
  ctx.fillStyle = tone;
  ctx.font = `700 88px ${DISPLAY}`;
  ctx.fillText(`${d.score[0]}–${d.score[1]}`, W / 2, 222);
  ctx.textAlign = 'right';
  ctx.fillStyle = DIM;
  ctx.font = `700 64px ${DISPLAY}`;
  fitText(ctx, d.opp.toUpperCase(), W - 48, 212, 440);
  ctx.textAlign = 'left';

  // mapas
  const maps = d.maps.slice(0, 5);
  const cellW = maps.length ? Math.min(260, (W - 96 - (maps.length - 1) * 16) / maps.length) : 0;
  maps.forEach((m, i) => {
    const x = 48 + i * (cellW + 16);
    const y = 280;
    ctx.fillStyle = NAVY_2;
    ctx.fillRect(x, y, cellW, 150);
    ctx.fillStyle = m.won ? WIN : LOSS;
    ctx.fillRect(x, y, 4, 150);
    ctx.fillStyle = DIM;
    ctx.font = `600 18px ${TITLE}`;
    fitText(ctx, m.label.toUpperCase(), x + 24, y + 40, cellW - 40);
    ctx.fillStyle = INK;
    ctx.font = `700 56px ${DISPLAY}`;
    ctx.fillText(`${m.score[0]}–${m.score[1]}`, x + 24, y + 116);
  });

  // destaque da partida
  if (d.potm) {
    ctx.fillStyle = GOLD;
    ctx.font = `600 18px ${TITLE}`;
    ctx.fillText(L.potm.toUpperCase(), 48, 492);
    ctx.fillStyle = INK;
    ctx.font = `700 40px ${DISPLAY}`;
    fitText(ctx, `${d.potm.nick.toUpperCase()} · ${d.potm.rating.toFixed(2)}`, 48, 540, 760);
    ctx.fillStyle = DIM;
    ctx.font = `500 18px ${UI}`;
    fitText(ctx, `${d.potm.team} · rating`, 48, 572, 760);
  }

  ctx.fillStyle = GOLD;
  ctx.font = `600 17px ${UI}`;
  ctx.fillText(L.foot, 48, H - 44);
  return cv.toDataURL('image/png');
}
