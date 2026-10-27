// Card do Pick'em do Modo Major (canvas puro → PNG, mesmo padrão de
// state/careerShareCard.ts): campeão em destaque, a chave dos playoffs e os
// classificados de cada stage. O PNG leva só o domínio; o link vai no texto.
import type { MajorData, MajorPicks, MajorResult, MajorTeam } from '../../engine/majorSingapore';
import type { CampaignSummary, MajorCampaign } from '../../engine/majorCampaign';
import { bracketSides } from '../../engine/majorSingapore';

const NAVY = '#070d19';
const NAVY_2 = '#0e1829';
const LINE = '#243757';
const GOLD = '#e8b64a';
const INK = '#eaf0f8';
const DIM = '#8fa2bf';

const DISPLAY = '"Oswald", "Arial Narrow", sans-serif';
const TITLE = '"Barlow Condensed", "Arial Narrow", sans-serif';
const UI = 'Barlow, Arial, sans-serif';

export interface MajorCardLabels {
  champion: string;
  qf: string;
  sf: string;
  final: string;
  stage: (n: number) => string;
  foot: string;
}

export function drawMajorCard(d: MajorData, p: MajorPicks, L: MajorCardLabels): string {
  const W = 1200;
  const H = 675;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const team = new Map<string, MajorTeam>(d.teams.map((t) => [t.id, t]));
  const name = (id: string) => team.get(id)?.name ?? '—';

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.fillStyle = GOLD;
  ctx.fillRect(12, 12, W - 24, 4);

  // cabeçalho
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = DIM;
  ctx.font = `600 18px ${TITLE}`;
  ctx.fillText("PICK'EM", 48, 64);
  ctx.fillStyle = INK;
  ctx.font = `600 40px ${DISPLAY}`;
  ctx.fillText(d.event.name.toUpperCase(), 48, 108);

  // campeão
  const champ = team.get(p.bracket[6]);
  ctx.fillStyle = NAVY_2;
  ctx.fillRect(48, 136, 360, 200);
  ctx.strokeStyle = GOLD;
  ctx.strokeRect(48, 136, 360, 200);
  ctx.fillStyle = GOLD;
  ctx.font = `600 18px ${TITLE}`;
  ctx.fillText(L.champion.toUpperCase(), 72, 172);
  ctx.fillStyle = INK;
  ctx.font = `700 46px ${DISPLAY}`;
  fitText(ctx, (champ?.name ?? '—').toUpperCase(), 72, 236, 312);
  if (champ?.colors) {
    ctx.fillStyle = champ.colors[1];
    ctx.fillRect(72, 262, 64, 6);
  }
  ctx.fillStyle = DIM;
  ctx.font = `500 16px ${UI}`;
  ctx.fillText(`${d.event.city} · ${d.event.start.slice(8)}/${d.event.start.slice(5, 7)} – ${d.event.end.slice(8)}/${d.event.end.slice(5, 7)}/${d.event.end.slice(0, 4)}`, 72, 310);

  // chave: QF (4) → SF (2) → F
  const sides = bracketSides(d, p);
  const col = (x: number, label: string, games: number[], top: number, gap: number) => {
    ctx.fillStyle = DIM;
    ctx.font = `600 15px ${TITLE}`;
    ctx.fillText(label.toUpperCase(), x, 160);
    games.forEach((g, k) => {
      const y = top + k * gap;
      sides[g].forEach((id, s) => {
        const won = !!id && p.bracket[g] === id;
        ctx.fillStyle = won ? '#1c2c47' : NAVY_2;
        ctx.fillRect(x, y + s * 30, 220, 28);
        ctx.fillStyle = won ? GOLD : DIM;
        ctx.fillRect(x, y + s * 30, 3, 28);
        ctx.fillStyle = won ? INK : DIM;
        ctx.font = `${won ? 600 : 500} 15px ${UI}`;
        fitText(ctx, name(id), x + 12, y + s * 30 + 19, 200);
      });
    });
  };
  col(448, L.qf, [0, 1, 2, 3], 176, 74);
  col(700, L.sf, [4, 5], 213, 148);
  col(952, L.final, [6], 287, 0);

  // classificados por stage
  const stages: [number, string[]][] = [[1, p.s1], [2, p.s2], [3, p.s3]];
  stages.forEach(([n, ids], k) => {
    const x = 48 + k * 376;
    const y = 488;
    ctx.fillStyle = GOLD;
    ctx.font = `600 16px ${TITLE}`;
    ctx.fillText(L.stage(n).toUpperCase(), x, y);
    ctx.fillStyle = INK;
    ctx.font = `500 15px ${UI}`;
    ids.forEach((id, i) => {
      fitText(ctx, team.get(id)?.tag ?? '—', x + (i % 4) * 88, y + 30 + Math.floor(i / 4) * 26, 82);
    });
    // 3-0 / 0-3 do stage (opcionais no palpite)
    const tags = (xs: string[] | undefined) => (xs ?? []).map((id) => team.get(id)?.tag ?? '').filter(Boolean).join(' ');
    const ext = [p.x30?.[n - 1]?.length ? `3-0 ${tags(p.x30[n - 1])}` : '', p.x03?.[n - 1]?.length ? `0-3 ${tags(p.x03[n - 1])}` : ''].filter(Boolean).join(' · ');
    if (ext) {
      ctx.fillStyle = DIM;
      ctx.font = `500 14px ${UI}`;
      fitText(ctx, ext, x, y + 90, 340);
      ctx.fillStyle = INK;
      ctx.font = `500 15px ${UI}`;
    }
  });

  ctx.fillStyle = GOLD;
  ctx.font = `600 17px ${UI}`;
  ctx.fillText(L.foot, 48, H - 44);
  return c.toDataURL('image/png');
}

export interface CampaignCardLabels {
  champion: string;
  record: string;
  maps: string;
  rating: string;
  mvp: string;
  foot: string;
}

/** card da campanha jogada: seu time, onde parou, séries, mapas, rating e o campeão */
export function drawCampaignCard(d: MajorData, c: MajorCampaign, r: MajorResult, s: CampaignSummary, L: CampaignCardLabels): string {
  const W = 1200;
  const H = 675;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  const team = new Map<string, MajorTeam>(d.teams.map((t) => [t.id, t]));
  const mine = team.get(c.teamId);
  const champ = r.playoffs.champion === c.teamId;

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.fillStyle = GOLD;
  ctx.fillRect(12, 12, W - 24, 4);

  ctx.fillStyle = DIM;
  ctx.font = `600 18px ${TITLE}`;
  ctx.fillText(d.event.name.toUpperCase(), 48, 64);
  ctx.fillStyle = INK;
  ctx.font = `700 72px ${DISPLAY}`;
  fitText(ctx, (mine?.name ?? '').toUpperCase(), 48, 150, 1100);
  if (mine?.colors) {
    ctx.fillStyle = mine.colors[1];
    ctx.fillRect(48, 172, 96, 6);
  }
  ctx.fillStyle = champ ? GOLD : DIM;
  ctx.font = `600 34px ${TITLE}`;
  ctx.fillText(champ ? L.champion.toUpperCase() : `${placeOf(r, c.teamId)}`.toUpperCase(), 48, 232);

  const kpis: [string, string][] = [
    [L.record, `${s.record[0]}–${s.record[1]}`],
    [L.maps, `${s.maps[0]}–${s.maps[1]}`],
    [L.rating, s.avgRating !== null ? s.avgRating.toFixed(2) : '—'],
  ];
  kpis.forEach(([label, val], i) => {
    const x = 48 + i * 300;
    ctx.fillStyle = NAVY_2;
    ctx.fillRect(x, 290, 270, 150);
    ctx.fillStyle = DIM;
    ctx.font = `600 18px ${TITLE}`;
    ctx.fillText(label.toUpperCase(), x + 24, 330);
    ctx.fillStyle = INK;
    ctx.font = `700 64px ${DISPLAY}`;
    ctx.fillText(val, x + 24, 410);
  });
  if (s.mvp) {
    ctx.fillStyle = GOLD;
    ctx.font = `700 40px ${DISPLAY}`;
    ctx.fillText(`${L.mvp.toUpperCase()} · ${c.nick.toUpperCase()}`, 48, 510);
  } else {
    ctx.fillStyle = DIM;
    ctx.font = `500 22px ${UI}`;
    ctx.fillText(`${L.champion}: ${team.get(r.playoffs.champion)?.name ?? ''}`, 48, 510);
  }
  ctx.fillStyle = GOLD;
  ctx.font = `600 17px ${UI}`;
  ctx.fillText(L.foot, 48, H - 44);
  return cv.toDataURL('image/png');
}

function placeOf(r: MajorResult, id: string): string {
  const out = (ms: { a: string; b: string; winner: string }[]) => ms.some((m) => (m.a === id || m.b === id) && m.winner !== id);
  if (r.playoffs.final.a === id || r.playoffs.final.b === id) return 'Final';
  if (out(r.playoffs.sf)) return 'Semis';
  if (out(r.playoffs.qf)) return 'Quartas';
  const st = r.stages.find((x) => x.eliminated.includes(id));
  return st ? `Stage ${st.stage}` : '';
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number) {
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > max) t = t.slice(0, -1);
  ctx.fillText(t === text ? t : `${t.slice(0, -1)}…`, x, y);
}

export function downloadDataUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}
