// Minimapa tático 2D ao vivo. O simulador (match.ts) NÃO produz posições — então
// sintetizamos posições plausíveis de forma DETERMINÍSTICA (makeRng+hashStr por
// round) e animamos a partir dos KillEvents do round (quem matou quem, e quando).
// É só leitura: não toca no engine nem no rng da partida (senão dessincronizaria
// o resultado da seed). Visual estilizado (board + sites A/B + mid), não a foto.
import { useEffect, useRef, useState } from 'react';
import type { KillEvent, MapId, TTeam } from '../types';
import { makeRng } from '../engine/rng';
import { hashStr } from '../state/hash';

type XY = [number, number];
interface Anchors { ct: XY; t: XY; sites: { name: string; at: XY }[]; mid: XY }

// coordenadas normalizadas (viewBox 0..100). Layout tático genérico — CT em cima,
// T embaixo, dois sites e o meio. Não é radar calibrado; serve pra dar leitura.
const MAP_ANCHORS: Record<MapId, Anchors> = {
  mirage:  { ct: [50, 16], t: [50, 86], sites: [{ name: 'A', at: [78, 30] }, { name: 'B', at: [20, 42] }], mid: [50, 52] },
  inferno: { ct: [56, 18], t: [44, 86], sites: [{ name: 'A', at: [74, 32] }, { name: 'B', at: [26, 30] }], mid: [50, 56] },
  nuke:    { ct: [50, 22], t: [50, 84], sites: [{ name: 'A', at: [58, 38] }, { name: 'B', at: [44, 60] }], mid: [38, 50] },
  ancient: { ct: [50, 17], t: [50, 85], sites: [{ name: 'A', at: [76, 34] }, { name: 'B', at: [24, 40] }], mid: [50, 55] },
  anubis:  { ct: [50, 16], t: [50, 86], sites: [{ name: 'A', at: [74, 34] }, { name: 'B', at: [26, 36] }], mid: [50, 52] },
  dust2:   { ct: [50, 18], t: [50, 86], sites: [{ name: 'A', at: [78, 28] }, { name: 'B', at: [20, 32] }], mid: [48, 56] },
  train:   { ct: [50, 20], t: [50, 85], sites: [{ name: 'A', at: [72, 36] }, { name: 'B', at: [30, 36] }], mid: [50, 55] },
};

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const easeOut = (f: number) => 1 - Math.pow(1 - f, 2);
const TEAM_COLORS: [string, string] = ['#6fb6ec', '#f0b35c'];
const GOLD = '#d8a943'; // SVG presentation attrs não resolvem var(--gold)

interface Props {
  map: MapId;
  roundNo: number; // round (1-based) sendo exibido
  killFeed: KillEvent[]; // feed completo; filtramos por roundNo
  sides: ['ct' | 't', 'ct' | 't'];
  teams: [TTeam, TTeam];
  durationMs: number; // janela de animação (= velocidade do round)
  paused: boolean;
}

export function Minimap({ map, roundNo, killFeed, sides, teams, durationMs, paused }: Props) {
  const [f, setF] = useState(0); // fração da animação [0..1]
  const raf = useRef(0);
  const start = useRef(0);

  // reinicia a animação quando muda o round
  useEffect(() => {
    start.current = 0;
    setF(0);
    if (paused) return; // o efeito roda de novo quando `paused` mudar
    const dur = Math.max(220, Math.min(durationMs, 1100));
    const loop = (ts: number) => {
      if (!start.current) start.current = ts;
      const frac = Math.min(1, (ts - start.current) / dur);
      setF(frac);
      if (frac < 1) raf.current = requestAnimationFrame(loop); // para sozinho em f=1
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [roundNo, durationMs, paused]);

  const anchors = MAP_ANCHORS[map] ?? MAP_ANCHORS.mirage;
  const events = killFeed.filter((e) => e.round === roundNo);
  const n = events.length;

  // posição-fim (death) por id de vítima + ordem do kill (pra cronometrar)
  const deathOrder = new Map<string, number>();
  events.forEach((e, i) => { if (!deathOrder.has(e.victimId)) deathOrder.set(e.victimId, i); });

  // semente determinística por round — NÃO usa o rng do engine
  const rng = makeRng(hashStr(`${teams[0].id}:${teams[1].id}:${map}:${roundNo}`));
  const contested = anchors.sites[Math.floor(rng() * anchors.sites.length)] ?? anchors.sites[0];
  const otherSite = anchors.sites.find((s) => s !== contested) ?? contested;

  // monta os 10 jogadores com origem/destino determinísticos
  const dots = teams.flatMap((team, ti) => {
    const side = sides[ti];
    const spawn = side === 'ct' ? anchors.ct : anchors.t;
    return team.players.slice(0, 5).map((p, i) => {
      const jx = (rng() - 0.5) * 16;
      const jy = (rng() - 0.5) * 12;
      // T empurra o site contestado; CT divide entre contestado, outro site e mid
      let dest: XY;
      if (side === 't') {
        dest = [contested.at[0] + (rng() - 0.5) * 18, contested.at[1] + (rng() - 0.5) * 14];
      } else {
        const hold = i < 2 ? contested.at : i < 4 ? otherSite.at : anchors.mid;
        dest = [hold[0] + (rng() - 0.5) * 14, hold[1] + (rng() - 0.5) * 12];
      }
      const from: XY = [spawn[0] + jx, spawn[1] + jy];
      return { id: p.id, team: ti as 0 | 1, from, dest };
    });
  });

  const posAt = (from: XY, dest: XY, frac: number): XY => {
    const move = easeOut(Math.min(1, frac / 0.6));
    return [lerp(from[0], dest[0], move), lerp(from[1], dest[1], move)];
  };
  const deathFrac = (order: number) => (order + 1) / (n + 1);

  let aliveCt = 0;
  let aliveT = 0;
  const rendered = dots.map((d) => {
    const order = deathOrder.get(d.id);
    const dead = order != null && f >= deathFrac(order);
    const at = dead ? posAt(d.from, d.dest, deathFrac(order)) : posAt(d.from, d.dest, f);
    if (!dead) { (sides[d.team] === 'ct' ? (aliveCt += 1) : (aliveT += 1)); }
    return { ...d, at, dead };
  });

  // tracer do kill mais recente (linha killer->vítima por ~0.12 de fração)
  const tracers = events
    .map((e, i) => ({ e, t: deathFrac(i) }))
    .filter((x) => f >= x.t && f < x.t + 0.14)
    .map((x) => {
      const k = rendered.find((d) => d.id === x.e.killerId);
      const v = rendered.find((d) => d.id === x.e.victimId);
      return k && v ? { from: k.at, to: v.at, hs: x.e.headshot } : null;
    })
    .filter(Boolean) as { from: XY; to: XY; hs: boolean }[];

  return (
    <div className="minimap">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mm-svg">
        <defs>
          <radialGradient id="mmbg" cx="50%" cy="42%" r="75%">
            <stop offset="0%" stopColor="#1b2735" />
            <stop offset="100%" stopColor="#0c1117" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#mmbg)" />
        {/* corredores estilizados: spawns -> mid -> sites */}
        <g stroke="rgba(255,255,255,0.06)" strokeWidth="6" fill="none" strokeLinecap="round">
          <line x1={anchors.t[0]} y1={anchors.t[1]} x2={anchors.mid[0]} y2={anchors.mid[1]} />
          <line x1={anchors.ct[0]} y1={anchors.ct[1]} x2={anchors.mid[0]} y2={anchors.mid[1]} />
          {anchors.sites.map((s) => (
            <line key={s.name} x1={anchors.mid[0]} y1={anchors.mid[1]} x2={s.at[0]} y2={s.at[1]} />
          ))}
        </g>
        {/* zonas dos bombsites */}
        {anchors.sites.map((s) => {
          const hot = s === contested;
          return (
            <g key={s.name}>
              <circle cx={s.at[0]} cy={s.at[1]} r="11"
                fill={hot ? 'rgba(216,169,67,0.14)' : 'rgba(255,255,255,0.04)'}
                stroke={hot ? GOLD : 'rgba(255,255,255,0.18)'} strokeWidth="0.6" strokeDasharray="2 1.5" />
              <text x={s.at[0]} y={s.at[1] + 2.2} textAnchor="middle" fontSize="7" fontWeight="800"
                fill={hot ? GOLD : 'rgba(255,255,255,0.45)'}>{s.name}</text>
            </g>
          );
        })}
        {/* spawns */}
        <text x={anchors.ct[0]} y={anchors.ct[1] - 3} textAnchor="middle" fontSize="4.4" fill={TEAM_COLORS[sides[0] === 'ct' ? 0 : 1]} opacity="0.7">CT</text>
        <text x={anchors.t[0]} y={anchors.t[1] + 6} textAnchor="middle" fontSize="4.4" fill={TEAM_COLORS[sides[0] === 't' ? 0 : 1]} opacity="0.7">T</text>

        {/* tracers de kill */}
        {tracers.map((tr, i) => (
          <line key={i} x1={tr.from[0]} y1={tr.from[1]} x2={tr.to[0]} y2={tr.to[1]}
            stroke={tr.hs ? '#ff5b5b' : '#fff'} strokeWidth="0.8" opacity="0.85" />
        ))}

        {/* jogadores */}
        {rendered.map((d) => (
          d.dead ? (
            <g key={d.id} opacity="0.55">
              <line x1={d.at[0] - 2} y1={d.at[1] - 2} x2={d.at[0] + 2} y2={d.at[1] + 2} stroke={TEAM_COLORS[d.team]} strokeWidth="1" />
              <line x1={d.at[0] + 2} y1={d.at[1] - 2} x2={d.at[0] - 2} y2={d.at[1] + 2} stroke={TEAM_COLORS[d.team]} strokeWidth="1" />
            </g>
          ) : (
            <circle key={d.id} cx={d.at[0]} cy={d.at[1]} r="2.4" fill={TEAM_COLORS[d.team]} stroke="#0b0f14" strokeWidth="0.5" />
          )
        ))}
      </svg>
      <div className="mm-foot">
        <span className="mm-side ct" style={{ color: TEAM_COLORS[sides[0] === 'ct' ? 0 : 1] }}>CT {aliveCt}</span>
        <span className="mm-round">Round {roundNo} · push {contested.name}</span>
        <span className="mm-side t" style={{ color: TEAM_COLORS[sides[0] === 't' ? 0 : 1] }}>{aliveT} T</span>
      </div>
    </div>
  );
}
