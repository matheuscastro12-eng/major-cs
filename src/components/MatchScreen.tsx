import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeSeries } from '../engine/insights';
import { createMapSim, type BuyTier, type MapSim, type Stance } from '../engine/match';
import type { Rng } from '../engine/rng';
import type { KillEvent, MapId, MapResult, SeriesResult, TPlayer, TTeam } from '../types';
import { MAP_LABELS } from '../types';
import { CoreFlag } from './flags';
import { Scoreboard } from './Scoreboard';
import { MapThumb, TeamBadge } from './ui';
import { HeadshotIcon, WeaponIcon, WEAPON_LABELS } from './weapons';

interface Props {
  teams: [TTeam, TTeam];
  maps: { map: MapId; pickedBy: 0 | 1 | -1 }[];
  userIdx: 0 | 1;
  rng: Rng;
  phaseLabel: string;
  bestOf?: 1 | 3;
  onFinish: (series: SeriesResult) => void;
}

const TIMEOUTS_PER_MAP = 2;
const TIMEOUT_ROUNDS = 3;

const SPEEDS: { label: string; ms: number }[] = [
  { label: '0.5x', ms: 560 },
  { label: '1x', ms: 280 },
  { label: '2x', ms: 140 },
  { label: '4x', ms: 60 },
];
const DEFAULT_SPEED_IDX = 1; // começa em 1x (0.5x é opção mais lenta)

const STANCES: { key: Stance; label: string; hint: string }[] = [
  { key: 'aggressive', label: '🔥 Agressivo', hint: 'Mais força no T, mas se expõe no CT' },
  { key: 'default', label: '⚖ Padrão', hint: 'Plano de jogo equilibrado' },
  { key: 'cautious', label: '🛡 Cauteloso', hint: 'Fecha o CT, perde ímpeto no T' },
];

const BUY_LABEL: Record<BuyTier, string> = {
  pistol: 'PISTOL',
  eco: 'ECO',
  force: 'FORCE BUY',
  full: 'FULL BUY',
};

export function MatchScreen({ teams, maps, userIdx, rng, phaseLabel, bestOf = 3, onFinish }: Props) {
  const need = Math.ceil(bestOf / 2); // BO1 -> 1, BO3 -> 2
  const mdLabel = bestOf === 1 ? 'MD1' : 'MD3';
  const simsRef = useRef<MapSim[]>([]);
  const resultsRef = useRef<MapResult[]>([]);
  const [mapIdx, setMapIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const [finished, setFinished] = useState(false);
  const [series, setSeries] = useState<SeriesResult | null>(null);
  const [timeoutsLeft, setTimeoutsLeft] = useState(TIMEOUTS_PER_MAP);
  const [boostRounds, setBoostRounds] = useState(0);
  const [pausedMsg, setPausedMsg] = useState('');
  const [speedIdx, setSpeedIdx] = useState(DEFAULT_SPEED_IDX);
  const [stance, setStance] = useState<Stance>('default');
  const stanceRef = useRef<Stance>('default');
  stanceRef.current = stance;

  const seriesOver = () => {
    const wins = resultsRef.current.reduce(
      (acc, r) => {
        acc[r.winner]++;
        return acc;
      },
      [0, 0] as [number, number],
    );
    return wins[0] >= need || wins[1] >= need || resultsRef.current.length >= maps.length;
  };

  const buildSeries = (): SeriesResult => {
    const ms = resultsRef.current;
    const winsA = ms.filter((m) => m.winner === 0).length;
    const winsB = ms.filter((m) => m.winner === 1).length;
    return { teamIds: [teams[0].id, teams[1].id], maps: ms, winner: winsA > winsB ? 0 : 1, mapScore: [winsA, winsB] };
  };

  const getSim = (idx: number): MapSim => {
    const safe = Math.min(idx, maps.length - 1); // guarda defensiva contra índice além do veto
    if (!simsRef.current[safe]) {
      simsRef.current[safe] = createMapSim(rng, teams[0], teams[1], maps[safe].map, maps[safe].pickedBy);
    }
    return simsRef.current[safe];
  };

  // loop da simulação ao vivo com catch-up por tempo real: mesmo com o
  // navegador limitando timers (aba em segundo plano), o ritmo escolhido vale.
  const lastStepRef = useRef(0);
  useEffect(() => {
    if (finished) return;
    lastStepRef.current = performance.now();
    const id = window.setInterval(() => {
      if (pausedMsg) {
        lastStepRef.current = performance.now();
        return; // pausa de timeout/troca de mapa
      }
      const ms = SPEEDS[speedIdx].ms;
      const now = performance.now();
      const due = Math.min(10, Math.floor((now - lastStepRef.current) / ms));
      if (due <= 0) return;
      lastStepRef.current += due * ms;

      const sim = getSim(mapIdx);
      const stanceMod =
        stanceRef.current !== 'default' ? { team: userIdx, mode: stanceRef.current } : undefined;
      let boostsUsed = 0;
      let mapEnded = false;
      for (let i = 0; i < due && !mapEnded; i++) {
        if (boostRounds - boostsUsed > 0) {
          sim.step(userIdx, stanceMod);
          boostsUsed++;
        } else {
          sim.step(null, stanceMod);
        }
        mapEnded = sim.done();
      }
      if (boostsUsed > 0) setBoostRounds((b) => Math.max(0, b - boostsUsed));
      setTick((t) => t + 1);

      if (mapEnded) {
        resultsRef.current[mapIdx] = sim.result();
        if (seriesOver()) {
          const s = buildSeries();
          setSeries(s);
          setFinished(true);
        } else {
          const next = maps[mapIdx + 1];
          setPausedMsg(`Fim do mapa ${mapIdx + 1}${next ? ` - preparando ${MAP_LABELS[next.map]}…` : '…'}`);
          window.setTimeout(() => {
            setMapIdx((m) => m + 1);
            setTimeoutsLeft(TIMEOUTS_PER_MAP);
            setBoostRounds(0);
            setPausedMsg('');
          }, 1500);
        }
      }
    }, Math.min(SPEEDS[speedIdx].ms, 250));
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, mapIdx, boostRounds, pausedMsg, speedIdx]);

  const skipAll = () => {
    setPausedMsg(' '); // congela o interval enquanto resolvemos tudo de forma síncrona
    let idx = mapIdx;
    while (idx < maps.length) {
      const sim = getSim(idx);
      while (!sim.done()) sim.step();
      resultsRef.current[idx] = sim.result();
      if (seriesOver()) break;
      idx++;
    }
    setMapIdx(Math.min(idx, maps.length - 1));
    const s = buildSeries();
    setSeries(s);
    setFinished(true);
    setPausedMsg('');
  };

  const callTimeout = () => {
    if (timeoutsLeft <= 0 || finished || pausedMsg) return;
    setTimeoutsLeft((t) => t - 1);
    setBoostRounds(TIMEOUT_ROUNDS);
    setPausedMsg(`⏸ TIMEOUT TÁTICO - ${teams[userIdx].coach.nick} ajusta o plano!`);
    window.setTimeout(() => setPausedMsg(''), 1400);
  };

  // `tick` força o re-render a cada round simulado; os valores abaixo são
  // leituras baratas do sim atual, recalculadas a cada render de propósito.
  void tick;
  const sim = getSim(mapIdx);
  const [sa, sb] = finished && series ? [0, 0] : sim.score();
  const roundLog = sim.roundLog();
  const buys = sim.buys();
  const mapsWon: [number, number] = [0, 0];
  for (const r of resultsRef.current) if (r) mapsWon[r.winner]++;

  const playerById = useMemo(() => {
    const players = new Map<string, TPlayer>();
    for (const team of teams) {
      for (const p of team.players) players.set(p.id, p);
    }
    return players;
  }, [teams]);

  const visibleKills = sim.killFeed().slice(-8).reverse();
  const currentMap = maps[Math.min(mapIdx, maps.length - 1)].map;

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          {phaseLabel} - {mdLabel}
          <span className="spacer" />
          {!finished && (
            <>
              <div className="seg" title="Velocidade da simulação">
                {SPEEDS.map((s, i) => (
                  <button key={s.label} className={speedIdx === i ? 'active' : ''} onClick={() => setSpeedIdx(i)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <button className="timeout-btn" onClick={callTimeout} disabled={timeoutsLeft <= 0 || !!pausedMsg}>
                ⏸ Timeout ({timeoutsLeft})
              </button>
              <button className="btn ghost" onClick={skipAll}>
                Pular para o resultado
              </button>
            </>
          )}
        </div>

        <div className="live-stage">
          <MapThumb map={currentMap} className="live-map-art" />
          <div className="live-score">
            <div className="team">
              <span className="team-flag left">
                <CoreFlag players={teams[0].players} />
              </span>
              <TeamBadge tag={teams[0].tag} colors={teams[0].colors} size={48} logoUrl={teams[0].logoUrl} />
              <span className="tn">{teams[0].name}</span>
              <span className="muted small">
                mapas: {mapsWon[0]}
                {!finished && ` · ${BUY_LABEL[buys[0]]}`}
              </span>
            </div>
            <div className="mid">
              {finished && series ? (
                <>
                  <div className="digits">
                    <span className={series.winner === 0 ? 'winning' : ''}>{series.mapScore[0]}</span>
                    <span className="sep"> : </span>
                    <span className={series.winner === 1 ? 'winning' : ''}>{series.mapScore[1]}</span>
                  </div>
                  <div className="mapname">Serie encerrada</div>
                </>
              ) : (
                <>
                  <div className="digits">
                    <span className={sa > sb ? 'winning' : ''}>{sa}</span>
                    <span className="sep"> : </span>
                    <span className={sb > sa ? 'winning' : ''}>{sb}</span>
                  </div>
                  <div className="mapname">
                    Mapa {mapIdx + 1} - {MAP_LABELS[currentMap]}
                    {boostRounds > 0 ? ' · 📢 pós-timeout' : ''}
                  </div>
                </>
              )}
            </div>
            <div className="team">
              <span className="team-flag right">
                <CoreFlag players={teams[1].players} />
              </span>
              <TeamBadge tag={teams[1].tag} colors={teams[1].colors} size={48} logoUrl={teams[1].logoUrl} />
              <span className="tn">{teams[1].name}</span>
              <span className="muted small">
                mapas: {mapsWon[1]}
                {!finished && ` · ${BUY_LABEL[buys[1]]}`}
              </span>
            </div>
          </div>
          {pausedMsg && <div className="timeout-flash">{pausedMsg}</div>}
          {!finished && <KillFeed events={visibleKills} teams={teams} playerById={playerById} />}
        </div>

        {!finished && (
          <div className="stance-bar">
            <span className="stance-label">Plano do {teams[userIdx].tag}:</span>
            {STANCES.map((s) => (
              <button
                key={s.key}
                className={`stance-btn${stance === s.key ? ' on' : ''}`}
                title={s.hint}
                onClick={() => setStance(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {!finished && (
          <div className="round-dots">
            {roundLog.map((w, i) => (
              <span key={i} className={`rdot ${w === 0 ? 'a' : 'b'}`} />
            ))}
          </div>
        )}

        <div className="map-pills">
          {maps.map((m, i) => {
            const r = resultsRef.current[i];
            const current = i === mapIdx && !finished;
            const willPlay = i <= mapIdx || r;
            return (
              <span key={i} className={`map-pill${!r && !current ? ' pending' : ''}`}>
                {MAP_LABELS[m.map]}
                {m.pickedBy >= 0 ? ` (pick ${teams[m.pickedBy as 0 | 1].tag})` : ' (decider)'}{' '}
                {r ? (
                  <b>
                    <span className={r.winner === 0 ? 'mw' : 'ml'}>{r.score[0]}</span>:
                    <span className={r.winner === 1 ? 'mw' : 'ml'}>{r.score[1]}</span>
                  </b>
                ) : current ? (
                  <b>
                    {sa}:{sb}
                  </b>
                ) : willPlay ? (
                  '-'
                ) : (
                  '-'
                )}
              </span>
            );
          })}
        </div>
      </div>

      {finished && series && <InsightPanel series={series} teams={teams} userIdx={userIdx} />}

      {finished && series && (
        <>
          <Scoreboard series={series} teams={teams} />
          <div className="center" style={{ margin: '18px 0' }}>
            <button className="btn big" onClick={() => onFinish(series)}>
              Continuar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const TEAM_FEED_COLORS: [string, string] = ['#6fb6ec', '#f0b35c'];

function KillFeed({
  events,
  teams,
  playerById,
}: {
  events: KillEvent[];
  teams: [TTeam, TTeam];
  playerById: Map<string, TPlayer>;
}) {
  return (
    <div className="killfeed2">
      <div className="kf-head">
        <span>Killfeed</span>
        <span>
          <span style={{ color: TEAM_FEED_COLORS[0] }}>{teams[0].tag}</span>
          {' · '}
          <span style={{ color: TEAM_FEED_COLORS[1] }}>{teams[1].tag}</span>
        </span>
      </div>
      <div className="kf2-list">
        {events.length === 0 && <div className="kf2-row empty">Aguardando primeiro contato…</div>}
        {events.map((e, i) => {
          const killer = playerById.get(e.killerId);
          const victim = playerById.get(e.victimId);
          return (
            <div key={`${e.round}-${e.killerId}-${e.victimId}-${i}`} className="kf2-row">
              <span className="kf-round">R{e.round}</span>
              <span className="nick" style={{ color: TEAM_FEED_COLORS[e.killerTeam] }}>
                {killer?.nick ?? teams[e.killerTeam].tag}
              </span>
              {e.opening && <span className="tag-open">1st</span>}
              <span className="wpn" title={WEAPON_LABELS[e.weapon] ?? e.weapon}>
                <WeaponIcon weapon={e.weapon} />
              </span>
              {e.headshot && (
                <span className="hs" title="Headshot">
                  <HeadshotIcon />
                </span>
              )}
              <span className="nick victim" style={{ color: TEAM_FEED_COLORS[e.victimTeam] }}>
                {victim?.nick ?? teams[e.victimTeam].tag}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InsightPanel({ series, teams, userIdx }: { series: SeriesResult; teams: [TTeam, TTeam]; userIdx: 0 | 1 }) {
  const insight = useMemo(() => analyzeSeries(series, teams, userIdx), [series, teams, userIdx]);
  return (
    <div className="panel insight-panel fade-in">
      <div className="panel-head">Analise da serie</div>
      <div className="panel-body">
        <div className="verdict">{insight.verdict}</div>
        <div className="insight-list">
          {insight.bullets.map((b, i) => (
            <div key={i} className={`insight-item ${b.tone}`}>
              <span className="ic">{b.icon}</span>
              <span>{b.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
