// LiveCanvasGame — orquestrador do replay/broadcast 2D. T2.5 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Layout estilo broadcast inspirado no print de referência (Mongolz vs Falcons):
//   ┌────────────────────────────────────────────────────────────────┐
//   │  LiveScoreboard (placar + clock + killfeed + mapas + torneio)   │
//   ├───────────┬──────────────────────────┬──────────────────────────┤
//   │  Sidebar  │                          │                          │
//   │   tabs    │      LiveMinimap         │   LivePostRoundFeed      │
//   │           │   (canvas com agents)    │   (narração rolante)     │
//   ├───────────┴──────────────────────────┴──────────────────────────┤
//   │       10x LivePlayerCard (5 vermelho + 5 azul, bottom)          │
//   ├─────────────────────────────────────────────────────────────────┤
//   │       Controles: 1x/2x/4x/8x · pause · skip round · fechar      │
//   └─────────────────────────────────────────────────────────────────┘
//
// Modos:
//   - replay (default): user controla speed/pause/skip
//   - autoplay: roda do começo ao fim sem intervenção (pra "ao vivo")
//
// Visual: chrome em-* (em-live-*); CSS em styles/career-dashboard.css.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createLiveCanvasSim, type LiveCanvasSim, type LiveState } from '../lib/liveCanvasSim';
import { getMaskSync } from '../lib/walkableMask';
import { geometryFor } from '../data/mapGeometry';
import { LiveScoreboard } from './live/LiveScoreboard';
import { LivePlayerCard } from './live/LivePlayerCard';
import { LiveMinimap } from './live/LiveMinimap';
import { LivePostRoundFeed } from './live/LivePostRoundFeed';
import { CareerIcon } from './career/CareerIcon';
import type { MapResult, SeriesResult, TTeam } from '../types';

interface Props {
  mapResult: MapResult;
  teams: [TTeam, TTeam];
  userIdx: 0 | 1;
  onClose: () => void;
  series?: SeriesResult;
  event?: string;
  autoplay?: boolean;
}

const SPEEDS: { label: string; mult: number }[] = [
  { label: '1x', mult: 1 },
  { label: '2x', mult: 2 },
  { label: '4x', mult: 4 },
  { label: '8x', mult: 8 },
];

type SideTabKey = 'scoreboard' | 'tactics' | 'analysis';

export function LiveCanvasGame({
  mapResult,
  teams,
  userIdx,
  onClose,
  series,
  event,
  autoplay = false,
}: Props) {
  const simRef = useRef<LiveCanvasSim | null>(null);
  const lastTsRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(autoplay ? 1 : 0);
  const [snap, setSnap] = useState<LiveState | null>(null);
  const [activeTab, setActiveTab] = useState<SideTabKey>('scoreboard');

  useEffect(() => {
    // getMask: a sim consulta a cada tick. Walkable mask carrega async no
    // LiveMinimap; enquanto null, agents andam em linha reta (fallback).
    // Quando carrega, agents passam a respeitar paredes do radar PNG.
    const radarUrl = geometryFor(mapResult.map).radarImage;
    const getMask = radarUrl ? () => getMaskSync(radarUrl) : undefined;
    simRef.current = createLiveCanvasSim({ mapResult, teams, userIdx, getMask });
    setSnap(simRef.current.getState());
    lastTsRef.current = 0;
  }, [mapResult, teams, userIdx]);

  useEffect(() => {
    const tick = (ts: number) => {
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      const dtMs = ts - lastTsRef.current;
      lastTsRef.current = ts;
      const sim = simRef.current;
      if (sim) {
        if (!paused) {
          const dt = (dtMs / 1000) * SPEEDS[speedIdx].mult;
          sim.step(dt);
        }
        setSnap({ ...sim.getState() });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [paused, speedIdx]);

  // Atalhos de teclado: Space (pause), → (skip), Esc (fechar), 1-4 (speed)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v); }
      else if (e.key === 'ArrowRight') simRef.current?.skipToNextRound();
      else if (e.key === 'Escape') onClose();
      else if (e.key >= '1' && e.key <= '4') setSpeedIdx(Number(e.key) - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const seriesScores = useMemo(() => {
    if (!series) return [{ map: mapResult.map, score: mapResult.score }];
    return series.maps.map((m) => ({ map: m.map, score: m.score }));
  }, [series, mapResult]);

  if (!snap) return null;

  const team0Agents = snap.agents.filter((a) => a.team === 0);
  const team1Agents = snap.agents.filter((a) => a.team === 1);
  const progressPct = snap.totalRounds > 0 ? Math.min(100, ((snap.roundIdx + (snap.phase === 'postRound' ? 1 : 0.5)) / snap.totalRounds) * 100) : 0;

  return (
    <div className="em-live-canvas">
      <LiveScoreboard
        state={snap}
        teams={teams}
        seriesScores={seriesScores}
        currentMap={mapResult.map}
        event={event}
      />

      {/* Corpo principal: sidebar tabs + minimap + narration */}
      <div className="em-live-body">
        <div className="em-live-sidebar">
          {(['scoreboard', 'tactics', 'analysis'] as SideTabKey[]).map((key) => (
            <SideTab key={key} label={key} active={activeTab === key} onClick={() => setActiveTab(key)} />
          ))}
        </div>

        <div className="em-live-minimap-col">
          <div className="em-live-minimap-box">
            <LiveMinimap state={snap} />
          </div>
        </div>

        <div className="em-live-feed-col">
          <div className="em-live-feed-box">
            <LivePostRoundFeed mapResult={mapResult} teams={teams} state={snap} limit={6} />
          </div>
        </div>
      </div>

      {/* Player cards row (5 + 5) */}
      <div className="em-live-cards-row">
        <div className="em-live-cards-side em-live-cards-side--left">
          {team0Agents.map((a, i) => (
            <div key={a.id} className="em-live-card-wrap" style={{ animationDelay: `${i * 60}ms` }}>
              <LivePlayerCard agent={a} team={teams[0]} state={snap} align="left" isUser={userIdx === 0} />
            </div>
          ))}
        </div>
        <div className="em-live-cards-side em-live-cards-side--right">
          {team1Agents.map((a, i) => (
            <div key={a.id} className="em-live-card-wrap" style={{ animationDelay: `${i * 60}ms` }}>
              <LivePlayerCard agent={a} team={teams[1]} state={snap} align="right" isUser={userIdx === 1} />
            </div>
          ))}
        </div>
      </div>

      {/* Controles */}
      <div className="em-live-controls">
        {/* Progresso de rounds (barra + dots) */}
        <div className="em-live-progress" title={`Round ${snap.roundIdx + 1} / ${snap.totalRounds}`}>
          <span className="em-live-progress-fill" style={{ width: `${progressPct}%` }} />
          <span className="em-live-progress-label">
            R{snap.roundIdx + 1}/{snap.totalRounds}
          </span>
        </div>

        <div className="em-live-dots">
          {Array.from({ length: snap.totalRounds }, (_, i) => (
            <span
              key={i}
              title={`Round ${i + 1}`}
              className={`em-live-dot${i < snap.roundIdx ? ' is-past' : i === snap.roundIdx ? ' is-current' : ''}`}
            />
          ))}
        </div>

        <span style={{ flex: 1 }} />

        {/* Speed picker */}
        <div className="em-live-speed">
          {SPEEDS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setSpeedIdx(i)}
              className={`em-live-speed-btn${speedIdx === i ? ' is-on' : ''}`}
              title={`Velocidade ${s.label} (tecla ${i + 1})`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Ações */}
        <button type="button" className="em-live-action" onClick={() => simRef.current?.skipToNextRound()} title="Pular round (→)">
          <CareerIcon name="check" size={13} /> Pular
        </button>
        <button type="button" className={`em-live-action${paused ? ' is-paused' : ''}`} onClick={() => setPaused((v) => !v)} title={paused ? 'Continuar (espaço)' : 'Pausar (espaço)'}>
          {paused ? (
            <><span className="em-live-play-icon" /> Play</>
          ) : (
            <><span className="em-live-pause-icon"><span /><span /></span> Pause</>
          )}
        </button>
        <button type="button" className="em-live-action em-live-action--close" onClick={onClose} title="Fechar (Esc)">
          <CareerIcon name="x" size={13} /> Fechar
        </button>
      </div>
    </div>
  );
}

const SIDE_TAB_LABELS: Record<SideTabKey, string> = {
  scoreboard: 'Scoreboard',
  tactics: 'Tactics',
  analysis: 'Analysis',
};

function SideTab({ label, active, onClick }: { label: SideTabKey; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`em-live-tab${active ? ' is-active' : ''}`}
    >
      {SIDE_TAB_LABELS[label]}
    </button>
  );
}
