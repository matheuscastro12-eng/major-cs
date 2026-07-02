import { geometryFor, type Vec2, type ZoneRect } from '../../data/mapGeometry';
import { MAP_LABELS } from '../../types';
import { RtpIcon, type RtpIconName } from './RtpIcon';
import type { RoundCtx } from '../../engine/rtp/roundModel';

// Mini tac-map SVG: o "palco" de cada decisão. Radar real dimmado + dots
// posicionados de forma plausível pro tipo de beat (spawn push / no site /
// pós-plant), strip de economia e contagem de vivos. Estático (sem loop de
// canvas) — só CSS-pulses leves.

const center = (z: ZoneRect): Vec2 => ({ x: z.cx, y: z.cy });
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const jitter = (p: Vec2, seed: number, amt: number): Vec2 => ({
  x: p.x + (((seed * 9301 + 49297) % 233280) / 233280 - 0.5) * amt,
  y: p.y + (((seed * 4099 + 7001) % 233280) / 233280 - 0.5) * amt,
});

const BUY_GLYPH: Record<string, RtpIconName> = { eco: 'money', force: 'spark', full: 'crosshair' };

// Cruz "morto" desenhada inline DENTRO do <svg> (não dá pra usar <RtpIcon> aqui).
function DeadX({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <path
      className="rtp-dot-deadx"
      d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`}
      style={{ stroke: 'var(--rtp-ink-faint)', strokeWidth: Math.max(3, r * 0.5), strokeLinecap: 'round' }}
    />
  );
}

export function RtpSituationBoard({ ctx, seriesLabel }: { ctx: RoundCtx; seriesLabel?: string }) {
  const geo = geometryFor(ctx.map);
  const W = geo.width, H = geo.height;
  const sideColor = ctx.side === 'CT' ? 'var(--rtp-ct)' : 'var(--rtp-t)';
  const enemyColor = ctx.side === 'CT' ? 'var(--rtp-t)' : 'var(--rtp-ct)';

  // âncoras: minha base, base inimiga, site relevante
  const mySpawn = ctx.side === 'CT' ? geo.spawnsCT : geo.spawnsT;
  const enemySpawn = ctx.side === 'CT' ? geo.spawnsT : geo.spawnsCT;
  const myMid = ctx.side === 'CT' ? geo.midCT : geo.midT;
  const enemyMid = ctx.side === 'CT' ? geo.midT : geo.midCT;
  const site = (ctx.bomb?.site ?? 'A') === 'A' ? center(geo.siteA) : center(geo.siteB);

  // onde estou e onde está a ação, conforme o beat
  const post = ctx.bomb ? 'site' : ctx.round <= 1 ? 'spawn' : 'mid';
  const myAnchor = post === 'site' ? lerp(site, myMid, 0.35) : post === 'spawn' ? (mySpawn[2] ?? myMid) : myMid;
  const enemyAnchor = post === 'site' ? site : post === 'spawn' ? (enemySpawn[2] ?? enemyMid) : enemyMid;

  // dots
  const myAlive = ctx.alive[0], enAlive = ctx.alive[1];
  const myDots = Array.from({ length: 5 }, (_, i) => jitter(i === 0 ? myAnchor : (mySpawn[i] ? lerp(mySpawn[i], myAnchor, 0.5) : myAnchor), i + 1, 90)).map((p, i) => ({ p, hero: i === 0, dead: i >= myAlive }));
  const enDots = Array.from({ length: 5 }, (_, i) => jitter(enemyAnchor, i + 11, 110)).map((p, i) => ({ p, dead: i >= enAlive, known: i < (post === 'site' ? enAlive : Math.min(2, enAlive)) }));

  return (
    <div className="rtp-board">
      <div className="rtp-board-head">
        <span className="rtp-board-map">{MAP_LABELS[ctx.map] ?? ctx.map}</span>
        <span className={`rtp-board-side s-${ctx.side.toLowerCase()}`}>{ctx.side}</span>
        <span className="rtp-board-mapscore">{ctx.score[0]}–{ctx.score[1]}</span>
        {seriesLabel && <span className="rtp-board-series">{seriesLabel}</span>}
        <span className="rtp-board-kicker">{ctx.kicker}</span>
      </div>
      <div className="rtp-board-stage" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="rtp-board-svg" preserveAspectRatio="xMidYMid slice">
          {geo.radarImage && <image href={geo.radarImage} x="0" y="0" width={W} height={H} className="rtp-board-radar" />}
          <rect x="0" y="0" width={W} height={H} className={`rtp-board-tint t-${ctx.side.toLowerCase()}`} />
          {/* vetor da ação */}
          <line x1={myAnchor.x} y1={myAnchor.y} x2={enemyAnchor.x} y2={enemyAnchor.y} className="rtp-board-vec" />
          {/* inimigos */}
          {enDots.map((d, i) => (
            d.dead
              ? <DeadX key={`e${i}`} x={d.p.x} y={d.p.y} r={Math.max(9, W * 0.011)} />
              : <circle key={`e${i}`} cx={d.p.x} cy={d.p.y} r={Math.max(14, W * 0.014)} className="rtp-dot-enemy" style={{ stroke: enemyColor, opacity: d.known ? 1 : 0.35 }} />
          ))}
          {/* aliados + você */}
          {myDots.map((d, i) => (
            d.dead
              ? <DeadX key={`m${i}`} x={d.p.x} y={d.p.y} r={Math.max(9, W * 0.011)} />
              : <g key={`m${i}`}>
                  {d.hero && <circle cx={d.p.x} cy={d.p.y} r={Math.max(26, W * 0.026)} className="rtp-dot-hero-ring" style={{ stroke: sideColor }} />}
                  <circle cx={d.p.x} cy={d.p.y} r={Math.max(14, W * 0.014)} className="rtp-dot-ally" style={{ fill: d.hero ? sideColor : 'var(--rtp-ink-dim)' }} />
                </g>
          ))}
          {/* bomba */}
          {ctx.bomb && (
            <g>
              <circle cx={site.x} cy={site.y} r={Math.max(20, W * 0.02)} className="rtp-board-bomb" />
              <text x={site.x} y={site.y + W * 0.006} className="rtp-board-bomb-txt" textAnchor="middle">C4</text>
            </g>
          )}
        </svg>
      </div>
      <div className="rtp-board-strips">
        <div className="rtp-board-eco">
          <span className="rtp-board-eco-side">VOCÊ</span>
          <span className="rtp-board-eco-buy"><RtpIcon name={BUY_GLYPH[ctx.yourBuy]} size={12} /> {ctx.yourBuy.toUpperCase()}</span>
        </div>
        <div className="rtp-board-alive">{ctx.alive[0]}<i>v</i>{ctx.alive[1]}</div>
        <div className="rtp-board-eco r">
          <span className="rtp-board-eco-buy">{ctx.theirBuy.toUpperCase()} <RtpIcon name={BUY_GLYPH[ctx.theirBuy]} size={12} /></span>
          <span className="rtp-board-eco-side">ELES</span>
        </div>
      </div>
    </div>
  );
}
