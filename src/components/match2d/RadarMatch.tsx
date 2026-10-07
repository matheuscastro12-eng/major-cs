// RADAR 2D AO VIVO da partida — o "match engine 2D" do Road to Major.
//
// Só APRESENTAÇÃO: lê o MapSim (roundLog, killFeed, lastSite, lastRoundPlay,
// lado, compra, dinheiro) e encena cada round já jogado. Nunca chama o rng nem
// muda o sim. No modo automático o MatchScreen deixa o radar ditar o ritmo:
// o radar pede o próximo round (`requestStep`) quando acabou de mostrar o atual.
//
// Desempenho: a árvore SVG de um round é montada uma vez (React); o laço de
// requestAnimationFrame só mexe em atributos via refs. prefers-reduced-motion
// troca a animação contínua por posições em etapas, sem rastro de tiro.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapSim, Stance, BuyTier } from '../../engine/match';
import { withFullRoster } from '../../engine/matchShared';
import type { KillEvent, MapId, PlayerMapStats, TTeam } from '../../types';
import { MAP_LABELS } from '../../types';
import { map2dOf } from './maps';
import { buildRoundScript, clockAt, posAt, type RoundScript, type ScriptEvent } from './choreo';
import { detectMoments, isHighlight, type Moment } from './moments';
import { assistantTips, type RoundRecord, type TipAction } from './assistant';
import './match2d.css';

export type RadarSpeed = '1' | '2' | '4' | 'hl';
const ROUND_MS: Record<'1' | '2' | '4', number> = { '1': 11000, '2': 5500, '4': 2750 };
const HL_FAST_MS = 650;
const HOLD_END_MS = 900;          // fica no quadro final antes do próximo round (1×)

interface RoundView {
  round: number;
  script: RoundScript;
  kills: KillEvent[];
  moments: Moment[];
  preScore: [number, number];
  postScore: [number, number];
  money: [number, number];
  buys: [BuyTier, BuyTier] | null;
  sides: ['ct' | 't', 'ct' | 't'];
  statsBefore: Stats;
  statsAfter: Stats;
}
type Stats = Record<string, PlayerMapStats>;
const snap = (s: Stats): Stats => JSON.parse(JSON.stringify(s)) as Stats;

interface Props {
  sim: MapSim;
  map: MapId;
  mapIdx: number;
  teams: [TTeam, TTeam];
  userIdx: 0 | 1;
  tick: number;                       // muda a cada step do MatchScreen
  gate: boolean;                      // true = o radar dita o ritmo (pede os rounds)
  paused: boolean;                    // pausa do MatchScreen (timeout/troca de mapa)
  requestStep: (n: number) => void;
  onShownScore: (s: [number, number] | null) => void;
  stance: Stance;
  timeoutsLeft: number;
  onTipAction: (a: TipAction) => void;
  onBusy?: (busy: boolean) => void;
  onShownStats?: (s: Record<string, PlayerMapStats> | null) => void; // stats do round ENCENADO (sem spoiler)   // true enquanto há round para encenar (o MatchScreen segura a troca de mapa)
}

const BUY_SHORT: Record<BuyTier, string> = { pistol: 'Pistol', eco: 'Eco', force: 'Force', full: 'Compra cheia' };
const MOMENT_TITLE: Record<Moment['kind'], string> = {
  ace: 'ACE', clutch: 'CLUTCH', multi: 'MULTI-KILL', eco: 'ECO VENCIDO', comeback: 'VIRADA', pistol: 'PISTOL',
};

function useReducedMotion(): boolean {
  const [rm, setRm] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setRm(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return rm;
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function RadarMatch(props: Props) {
  const { sim, map, mapIdx, teams, userIdx, tick, gate, paused, requestStep, onShownScore, stance, timeoutsLeft, onTipAction, onBusy, onShownStats } = props;
  const reduced = useReducedMotion();
  const roster = useMemo(() => teams.map((t) => withFullRoster(t).players.slice(0, 5)) as [TTeam['players'], TTeam['players']], [teams]);
  const nickOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of roster) for (const p of t) m.set(p.id, p.nick);
    return m;
  }, [roster]);
  const teamIds = useMemo(() => roster.map((ps) => ps.map((p) => p.id)) as [string[], string[]], [roster]);

  const [speed, setSpeed] = useState<RadarSpeed>('1');
  const [current, setCurrent] = useState<RoundView | null>(null);
  const [replay, setReplay] = useState<RoundView | null>(null);
  const [feed, setFeed] = useState<ScriptEvent[]>([]);
  const [momentCard, setMomentCard] = useState<{ m: Moment; view: RoundView } | null>(null);
  const [gameMoment, setGameMoment] = useState<{ m: Moment; view: RoundView } | null>(null);
  const [history, setHistory] = useState<RoundRecord[]>([]);
  const [halftime, setHalftime] = useState(false);
  const [skipping, setSkipping] = useState(false);

  // fila de rounds observados e ainda não mostrados
  const queueRef = useRef<RoundView[]>([]);
  const seenRef = useRef(0);
  const pendingRef = useRef(false);
  const statsRef = useRef<Stats>({});
  const preRef = useRef<{ sides: ['ct' | 't', 'ct' | 't']; buys: [BuyTier, BuyTier]; money: [number, number]; score: [number, number] } | null>(null);
  const tRef = useRef(0);
  const doneAtRef = useRef<number | null>(null);
  const firedRef = useRef(0);
  const [qv, force] = useState(0);

  // ── troca de mapa: zera tudo ──
  useEffect(() => {
    queueRef.current = [];
    seenRef.current = sim.roundLog().length;
    pendingRef.current = false;
    preRef.current = { sides: sim.side(), buys: sim.buys(), money: sim.money(), score: sim.score() };
    setCurrent(null); setReplay(null); setFeed([]); setMomentCard(null); setHistory([]); setHalftime(false); setSkipping(false);
    onShownScore(sim.done() ? null : sim.score());
    statsRef.current = snap(sim.stats());
    onShownStats?.(sim.done() ? null : statsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, mapIdx]);
  useEffect(() => () => { onShownScore(null); onShownStats?.(null); onBusy?.(false); }, [onShownScore, onBusy, onShownStats]);

  // ── observa o sim: cada round novo vira um roteiro ──
  useEffect(() => {
    const log = sim.roundLog();
    if (log.length <= seenRef.current) return;
    const pre = preRef.current ?? { sides: sim.side(), buys: sim.buys(), money: sim.money(), score: [0, 0] as [number, number] };
    const r = log.length - 1;
    const skipped = log.length - seenRef.current > 1;
    seenRef.current = log.length;
    pendingRef.current = false;
    const all = sim.killFeed();
    const kills = all.filter((k) => k.round === r + 1);
    const ls = sim.lastSite();
    const play = sim.lastRoundPlay?.() ?? null;
    const winner = log[r];
    const tTeam: 0 | 1 = pre.sides[0] === 't' ? 0 : 1;
    const preScore: [number, number] = skipped ? (() => {
      const s: [number, number] = [0, 0];
      for (let i = 0; i < r; i++) s[log[i]]++;
      return s;
    })() : pre.score;
    const postScore = sim.score();
    const buys = skipped ? null : pre.buys;
    const script = buildRoundScript({
      map, round: r, teamIds, tTeam, kills, winner,
      tSite: ls && ls.round === r ? ls.tSite : null,
      play: play && play.round === r ? play : null, buys,
    });
    const moments = detectMoments({ round: r, kills, winner, roundLog: log.slice(0, r + 1), buys });
    const statsBefore = statsRef.current;
    statsRef.current = snap(sim.stats());
    const view: RoundView = { round: r, script, kills, moments, preScore, postScore, money: pre.money, buys, sides: pre.sides, statsBefore, statsAfter: statsRef.current };
    const rec: RoundRecord = {
      round: r, sides: pre.sides, winner, tSite: script.site,
      openingTeam: kills.length ? kills[0].killerTeam : -1, buys, planted: script.planted,
    };
    setHistory((h) => [...h, rec]);
    preRef.current = { sides: sim.side(), buys: sim.buys(), money: sim.money(), score: postScore };
    if (skipping) { onShownScore(postScore); onShownStats?.(statsRef.current); return; }
    queueRef.current.push(view);
    force((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, sim]);

  // ── pega o próximo da fila / pede um round novo ──
  const playing = replay ?? current;
  useEffect(() => {
    onBusy?.(!!playing || queueRef.current.length > 0 || halftime);
    if (playing || halftime) return;
    const next = queueRef.current.shift();
    if (next) {
      tRef.current = 0; firedRef.current = 0; doneAtRef.current = null;
      setFeed([]);
      onShownScore(next.preScore);
      onShownStats?.(next.statsBefore);
      setCurrent(next);
      return;
    }
    if (gate && !paused && !sim.done() && !pendingRef.current && !skipping) {
      pendingRef.current = true;
      requestStep(1);
    }
  }, [playing, halftime, gate, paused, sim, skipping, qv, tick, onBusy, onShownScore, onShownStats, requestStep]);


  const finishRound = useCallback((v: RoundView, wasReplay: boolean) => {
    if (wasReplay) { setReplay(null); return; }
    onShownScore(v.postScore);
    onShownStats?.(v.statsAfter);
    const top = v.moments[0];
    if (top && top.kind !== 'pistol') {
      setMomentCard({ m: top, view: v });
      setGameMoment((g) => (!g || top.weight > g.m.weight ? { m: top, view: v } : g));
    }
    if (v.round === 11 && gate) setHalftime(true);
    setCurrent(null);
  }, [gate, onShownScore, onShownStats]);

  // ── laço de animação ──
  const svgRef = useRef<SVGSVGElement | null>(null);
  const clockRef = useRef<HTMLSpanElement | null>(null);
  const aliveRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!playing) return;
    const view = playing;
    const sc = view.script;
    const isReplay = playing === replay;
    const hl = view.moments.length > 0 && isHighlight(view.moments);
    const dur = isReplay ? ROUND_MS['1'] : speed === 'hl' ? (hl ? ROUND_MS['1'] * 0.8 : HL_FAST_MS) : ROUND_MS[speed];
    let raf = 0;
    let last = performance.now();
    const svg = svgRef.current;
    const dots = svg ? Array.from(svg.querySelectorAll<SVGGElement>('[data-p]')) : [];
    const byId = new Map(sc.tracks.map((t) => [t.id, t]));
    const fx = svg ? Array.from(svg.querySelectorAll<SVGElement>('[data-ev]')) : [];
    const bomb = svg?.querySelector<SVGGElement>('[data-bomb]') ?? null;
    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (!paused || isReplay) tRef.current = Math.min(sc.endT, tRef.current + dt / dur);
      const t = tRef.current;
      const tp = reduced ? Math.floor(t * 8) / 8 : t;
      let aliveT = 0, aliveC = 0;
      for (const el of dots) {
        const tr = byId.get(el.dataset.p!);
        if (!tr) continue;
        const p = posAt(tr, tp);
        const dead = tr.deathT != null && t >= tr.deathT;
        if (!dead) { if (tr.side === 't') aliveT++; else aliveC++; }
        el.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
        el.classList.toggle('dead', dead);
      }
      for (const el of fx) {
        const ev = sc.events[Number(el.dataset.ev)];
        if (!ev) continue;
        const age = t - ev.t;
        let op = 0;
        if (ev.kind === 'kill') op = reduced ? (age >= 0 && age < 0.05 ? 1 : 0) : age >= 0 && age < 0.05 ? 1 - age / 0.05 : 0;
        else if (ev.kind === 'smoke') op = age >= 0 && age < 0.32 ? Math.min(1, age / 0.02) * (age > 0.27 ? (0.32 - age) / 0.05 : 1) : 0;
        else if (ev.kind === 'flash') op = reduced ? 0 : age >= 0 && age < 0.025 ? 1 - age / 0.025 : 0;
        else if (ev.kind === 'explode') op = age >= -0.001 ? 1 : 0;
        else if (ev.kind === 'defuse') op = age >= -0.04 ? 1 : 0;
        el.style.opacity = op.toFixed(3);
      }
      if (bomb) bomb.style.opacity = sc.plantT != null && t >= sc.plantT ? '1' : '0';
      // killfeed do round: dispara conforme o tempo passa
      let fired = firedRef.current;
      while (fired < sc.events.length && sc.events[fired].t <= t) fired++;
      if (fired !== firedRef.current) {
        firedRef.current = fired;
        setFeed(sc.events.slice(0, fired).filter((e) => e.kind === 'kill' || e.kind === 'plant' || e.kind === 'defuse' || e.kind === 'explode' || e.kind === 'end'));
      }
      if (clockRef.current) {
        const c = clockAt(sc, t);
        clockRef.current.textContent = fmtClock(c.secs);
        clockRef.current.classList.toggle('bomb', c.bomb);
      }
      if (aliveRef.current) aliveRef.current.textContent = `${aliveT}v${aliveC}`;
      if (t >= sc.endT) {
        if (doneAtRef.current == null) doneAtRef.current = now;
        const hold = isReplay ? 1400 : speed === 'hl' && !hl ? 120 : HOLD_END_MS * (speed === '1' || speed === 'hl' ? 1 : speed === '2' ? 0.6 : 0.35);
        if (now - doneAtRef.current >= hold) { finishRound(view, isReplay); return; }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, replay, speed, paused, reduced, finishRound]);

  // card "momento" some sozinho
  useEffect(() => {
    if (!momentCard) return;
    const id = window.setTimeout(() => setMomentCard(null), speed === '4' ? 2500 : 5000);
    return () => window.clearTimeout(id);
  }, [momentCard, speed]);
  // intervalo: o assistente fala; segue sozinho em 9 s
  useEffect(() => {
    if (!halftime) return;
    const id = window.setTimeout(() => setHalftime(false), 9000);
    return () => window.clearTimeout(id);
  }, [halftime]);

  const skipRound = () => { tRef.current = playing ? playing.script.endT : 0; doneAtRef.current = 0; };
  const skipMap = () => {
    setSkipping(true);
    queueRef.current = [];
    setCurrent(null); setReplay(null); setHalftime(false);
    pendingRef.current = true;
    requestStep(99);
  };

  const tips = useMemo(() => assistantTips({
    history, userIdx, money: preRef.current?.money ?? [0, 0],
    nextSide: preRef.current?.sides ?? ['ct', 't'], stance, timeoutsLeft,
  }), [history, userIdx, stance, timeoutsLeft]);

  const view = playing;
  const sc = view?.script ?? null;
  const m2 = sc?.map ?? null;
  const tTeam: 0 | 1 = view ? (view.sides[0] === 't' ? 0 : 1) : 0;
  const shownMoney = view?.money ?? preRef.current?.money ?? sim.money();
  const sides = view?.sides ?? preRef.current?.sides ?? sim.side();

  return (
    <section className="r2d" aria-label="Radar 2D da partida">
      <header className="r2d-bar">
        <div className={`r2d-team ${sides[0]}`}>
          <span className="r2d-tag">{teams[0].tag}</span>
          <span className="r2d-side">{sides[0].toUpperCase()}</span>
          <span className="r2d-money">${shownMoney[0].toLocaleString('pt-BR')}</span>
          {view?.buys && <span className="r2d-buy">{BUY_SHORT[view.buys[0]]}</span>}
        </div>
        <div className="r2d-mid">
          <span className="r2d-round">{view ? `Round ${view.round + 1}` : MAP_LABELS[map]}</span>
          <span className="r2d-clock" ref={clockRef}>1:55</span>
          <span className="r2d-alive" ref={aliveRef} aria-label="vivos">5v5</span>
        </div>
        <div className={`r2d-team right ${sides[1]}`}>
          {view?.buys && <span className="r2d-buy">{BUY_SHORT[view.buys[1]]}</span>}
          <span className="r2d-money">${shownMoney[1].toLocaleString('pt-BR')}</span>
          <span className="r2d-side">{sides[1].toUpperCase()}</span>
          <span className="r2d-tag">{teams[1].tag}</span>
        </div>
      </header>

      <div className="r2d-body">
        <div className="r2d-stage">
          <svg ref={svgRef} viewBox="0 0 100 100" className="r2d-svg" role="img" aria-label={`Radar de ${MAP_LABELS[map]}`}>
            <MapArt map={map} />
            {sc && m2 && (
              <g key={`${mapIdx}:${view!.round}:${replay ? 'r' : 'l'}`}>
                {sc.events.map((ev, i) => {
                  if (ev.kind === 'smoke') return <circle key={i} data-ev={i} className={`r2d-smoke ${ev.side}`} cx={ev.at.x} cy={ev.at.y} r={4.2} style={{ opacity: 0 }} />;
                  if (ev.kind === 'flash') return <circle key={i} data-ev={i} className="r2d-flash" cx={ev.at.x} cy={ev.at.y} r={3.2} style={{ opacity: 0 }} />;
                  if (ev.kind === 'kill') return (
                    <g key={i} data-ev={i} style={{ opacity: 0 }}>
                      <line className={`r2d-tracer ${ev.killerTeam === tTeam ? 't' : 'ct'}`} x1={ev.from.x} y1={ev.from.y} x2={ev.at.x} y2={ev.at.y} />
                      <circle className="r2d-hit" cx={ev.at.x} cy={ev.at.y} r={2.4} />
                    </g>
                  );
                  if (ev.kind === 'explode') return <circle key={i} data-ev={i} className="r2d-boom" cx={ev.at.x} cy={ev.at.y} r={9} style={{ opacity: 0 }} />;
                  if (ev.kind === 'defuse') return <circle key={i} data-ev={i} className="r2d-defuse" cx={ev.at.x} cy={ev.at.y} r={4} style={{ opacity: 0 }} />;
                  return null;
                })}
                {sc.bombAt && (
                  <g data-bomb="" style={{ opacity: 0 }} transform={`translate(${sc.bombAt.x} ${sc.bombAt.y})`}>
                    <rect className="r2d-bomb" x={-1.4} y={-1} width={2.8} height={2} rx={0.4} />
                    <circle className="r2d-bomb-pulse" r={2.6} />
                  </g>
                )}
                {sc.tracks.map((tr) => (
                  <g key={tr.id} data-p={tr.id} className={`r2d-dot ${tr.side}${tr.team === userIdx ? ' mine' : ''}`} transform={`translate(${tr.keys[0].x} ${tr.keys[0].y})`}>
                    <circle className="r2d-body-c" r={1.9} />
                    <path className="r2d-x" d="M-1.3,-1.3 L1.3,1.3 M1.3,-1.3 L-1.3,1.3" />
                    <text className="r2d-nick" y={4.6}>{nickOf.get(tr.id) ?? ''}</text>
                  </g>
                ))}
              </g>
            )}
          </svg>
          {!view && !skipping && <div className="r2d-wait">{gate ? 'Preparando o round…' : 'O radar mostra cada round assim que ele é jogado.'}</div>}
          {skipping && <div className="r2d-wait">Simulando até o fim do mapa…</div>}
          {replay && <div className="r2d-replay-tag">REPLAY · Round {replay.round + 1}</div>}
          {momentCard && !replay && (
            <div className={`r2d-moment ${momentCard.m.team === userIdx ? 'mine' : 'opp'}`} role="status">
              <span className="r2d-moment-k">{MOMENT_TITLE[momentCard.m.kind]}</span>
              <span className="r2d-moment-t">{momentText(momentCard.m, nickOf, teams)}</span>
              <button type="button" className="r2d-btn" onClick={() => { setReplay(momentCard.view); tRef.current = 0; firedRef.current = 0; doneAtRef.current = null; setMomentCard(null); }}>Rever</button>
            </div>
          )}
          {halftime && (
            <div className="r2d-half" role="dialog" aria-label="Intervalo">
              <div className="r2d-half-h">INTERVALO · {sim.score()[0]}:{sim.score()[1]}</div>
              <div className="r2d-half-s">O assistente técnico leu o primeiro half:</div>
              <TipList tips={tips} onTipAction={onTipAction} />
              <button type="button" className="r2d-btn gold" onClick={() => setHalftime(false)}>Começar o 2º half</button>
            </div>
          )}
        </div>

        <aside className="r2d-side-col">
          <div className="r2d-ctrl" role="group" aria-label="Velocidade do radar">
            {(['1', '2', '4', 'hl'] as RadarSpeed[]).map((s) => (
              <button key={s} type="button" className={`r2d-chip${speed === s ? ' on' : ''}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                {s === 'hl' ? 'Destaques' : `${s}×`}
              </button>
            ))}
            <button type="button" className="r2d-chip" onClick={skipRound} disabled={!view}>Fim do round</button>
            <button type="button" className="r2d-chip" onClick={skipMap} disabled={!gate || skipping}>Fim do mapa</button>
          </div>

          <div className="r2d-feed" aria-live="polite">
            {feed.length === 0 && <div className="r2d-feed-empty">{view ? (view.buys ? `${BUY_SHORT[view.buys[tTeam]]} no T · ${BUY_SHORT[view.buys[tTeam === 0 ? 1 : 0]]} no CT` : '—') : '—'}</div>}
            {feed.map((e, i) => (
              <div key={i} className={`r2d-fl ${e.kind}`}>
                {e.kind === 'kill' ? (
                  <>
                    <b className={e.killerTeam === tTeam ? 't' : 'ct'}>{nickOf.get(e.killer)}</b>
                    <span className="r2d-w">{e.weapon}{e.headshot ? ' · HS' : ''}{e.opening ? ' · abertura' : ''}{e.trade ? ' · troca' : ''}</span>
                    <b className={e.killerTeam === tTeam ? 'ct' : 't'}>{nickOf.get(e.victim)}</b>
                  </>
                ) : e.kind === 'plant' ? <span>Bomba plantada no {sc?.site}{e.by ? ` por ${nickOf.get(e.by)}` : ''}</span>
                  : e.kind === 'defuse' ? <span>Bomba desarmada{e.by ? ` por ${nickOf.get(e.by)}` : ''}</span>
                    : e.kind === 'explode' ? <span>A bomba explodiu</span>
                      : e.kind === 'end' && sc ? <span>Round para <b>{teams[sc.winner].tag}</b> · {endLabel(sc.end)}</span> : null}
              </div>
            ))}
          </div>

          <div className="r2d-coach">
            <div className="r2d-coach-h">Assistente técnico</div>
            {tips.length ? <TipList tips={tips} onTipAction={onTipAction} /> : <div className="r2d-coach-empty">Sem alerta por enquanto. Os números ainda estão equilibrados.</div>}
          </div>

          {gameMoment && (
            <div className="r2d-gm">
              <div className="r2d-coach-h">Momento do jogo</div>
              <div className="r2d-gm-t"><b>{MOMENT_TITLE[gameMoment.m.kind]}</b> · round {gameMoment.m.round + 1}</div>
              <div className="r2d-gm-d">{momentText(gameMoment.m, nickOf, teams)}</div>
              <button type="button" className="r2d-btn" onClick={() => { setReplay(gameMoment.view); tRef.current = 0; firedRef.current = 0; doneAtRef.current = null; }} disabled={!!replay}>Rever no radar</button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function TipList({ tips, onTipAction }: { tips: ReturnType<typeof assistantTips>; onTipAction: (a: TipAction) => void }) {
  return (
    <ul className="r2d-tips">
      {tips.map((t) => (
        <li key={t.id} className="r2d-tip">
          <div className="r2d-tip-t">{t.text}</div>
          <div className="r2d-tip-w">{t.why}</div>
          <button type="button" className="r2d-btn" onClick={() => onTipAction(t.action)}>{t.label}</button>
        </li>
      ))}
    </ul>
  );
}

function endLabel(e: RoundScript['end']): string {
  return e === 'elim' ? 'eliminação' : e === 'explode' ? 'bomba explodiu' : e === 'defuse' ? 'bomba desarmada' : e === 'save' ? 'o outro lado salvou' : 'o tempo acabou';
}

function momentText(m: Moment, nickOf: Map<string, string>, teams: [TTeam, TTeam]): string {
  const who = m.playerId ? nickOf.get(m.playerId) ?? '' : teams[m.team].tag;
  switch (m.kind) {
    case 'ace': return `${who} derruba os cinco.`;
    case 'clutch': return `${who} vence o 1v${m.vs} sozinho.`;
    case 'multi': return `${who} faz ${m.kills} abates no round.`;
    case 'eco': return `${teams[m.team].tag} vence o round de eco contra compra cheia${who ? ` (${who})` : ''}.`;
    case 'comeback': return `${teams[m.team].tag} vira o mapa e passa à frente.`;
    default: return `${teams[m.team].tag} leva o pistol.`;
  }
}

// ── desenho do mapa (estático por mapa) ──
function MapArt({ map }: { map: MapId }) {
  const m = useMemo(() => map2dOf(map), [map]);
  return (
    <g className="r2d-map" aria-hidden="true">
      <rect x={0} y={0} width={100} height={100} className="r2d-bg" />
      <g className="r2d-grid">
        {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={(i + 1) * 10} y1={0} x2={(i + 1) * 10} y2={100} />)}
        {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1={0} y1={(i + 1) * 10} x2={100} y2={(i + 1) * 10} />)}
      </g>
      <g className="r2d-walls">
        {m.edges.map(([a, b, w], i) => <line key={i} x1={m.nodes[a].x} y1={m.nodes[a].y} x2={m.nodes[b].x} y2={m.nodes[b].y} strokeWidth={(w ?? 5) + 1.6} />)}
      </g>
      <g className="r2d-floor">
        {m.edges.map(([a, b, w], i) => <line key={i} x1={m.nodes[a].x} y1={m.nodes[a].y} x2={m.nodes[b].x} y2={m.nodes[b].y} strokeWidth={w ?? 5} />)}
      </g>
      {(['A', 'B'] as const).map((s) => {
        const r = m.sites[s];
        return (
          <g key={s} className="r2d-site">
            <rect x={r.x - r.w / 2} y={r.y - r.h / 2} width={r.w} height={r.h} rx={1.6} />
            <text x={r.x} y={r.y + 2.2}>{s}</text>
          </g>
        );
      })}
      <rect className="r2d-spawn t" x={m.spawns.t.x - m.spawns.t.w / 2} y={m.spawns.t.y - m.spawns.t.h / 2} width={m.spawns.t.w} height={m.spawns.t.h} rx={1.6} />
      <rect className="r2d-spawn ct" x={m.spawns.ct.x - m.spawns.ct.w / 2} y={m.spawns.ct.y - m.spawns.ct.h / 2} width={m.spawns.ct.w} height={m.spawns.ct.h} rx={1.6} />
      <text className="r2d-maplabel" x={2.5} y={97}>{(MAP_LABELS[map] ?? map).toUpperCase()}</text>
    </g>
  );
}
