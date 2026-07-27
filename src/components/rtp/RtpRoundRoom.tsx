import { useMemo, useState, useEffect, useRef } from 'react';
import { makeRng } from '../../engine/rng';
import { hashStr } from '../../state/hash';
import type { MomentOption, MomentOutcome, OddsBreakdown } from '../../engine/rtp/moments';
import { feedForOutcome, outcomePills, type FeedRow } from '../../engine/rtp/roundModel';
import {
  createRoom, currentBeat, currentMoment, currentCtx, inClutchOf, isLastBeat, pressureOf,
  spotlightOf, execSeedOf, roomOdds, winProbOf, liveRatingOf, partialBandOf,
  useRead as roomUseRead, lockIn as roomLockIn, advance as roomAdvance, skipRest as roomSkipRest,
  execBoostOf, EXEC_NEUTRAL,
  type RoomState, type ResolvedBeat, type ClosedMap,
} from '../../engine/rtp/room';
import { tierDifficulty } from '../../engine/rtp/minigames';
import { GAME_COMPONENTS } from './minigames';
import type { MatchPrep } from '../../engine/rtp/matchSim';
import { matchAtmosphere, crowdBeatLine, interludeAmbientLine, pressureKicker } from '../../engine/rtp/atmosphere';
import { MAP_LABELS } from '../../types';

import type { RoadToProSave } from '../../engine/rtp/types';
import { RtpSituationBoard } from './RtpSituationBoard';
import { RtpIcon } from './RtpIcon';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const execVerdict = (perf: number) =>
  perf >= 0.92 ? 'PERFEITA' : perf >= 0.78 ? 'ÓTIMA' : perf >= 0.62 ? 'BOA' : perf >= 0.5 ? 'NA MÉDIA' : 'RUIM';

// Sub-estado de APRESENTAÇÃO por cima do RoomState lógico: o engine resolve
// (decide→resolved→done) e a UI dá o ritmo (exec → rolling → result).
type SubPhase = 'decide' | 'exec' | 'rolling' | 'result';

// Cor do gauge na rampa verde→âmbar→vermelho.
function oddsColor(pct: number): string {
  if (pct >= 0.6) return 'var(--rtp-odds-hi)';
  if (pct >= 0.42) return 'var(--rtp-odds-mid)';
  return 'var(--rtp-odds-lo)';
}

export function RtpRoundRoom({ save, prep, onComplete, major }: {
  save: RoadToProSave;
  prep: MatchPrep;
  // liveMaps: os mapas COMO A SALA FECHOU/EXIBIU (v17) — o card oficial usa
  // exatamente estes placares em vez de recomputar (Sala == card por construção).
  onComplete: (outcomes: MomentOutcome[], liveMaps?: ClosedMap[]) => void;
  major?: boolean;
}) {
  // A REGRA DA SÉRIE vive em engine/rtp/room.ts (a Sala) — aqui só render/ritmo.
  const [room, setRoom] = useState<RoomState>(() => createRoom(save, prep));
  // resolução recém-rolada: o novo estado fica ESTAGIADO durante a animação do
  // needle (o scorebug só avança quando o resultado aparece na tela).
  const [staged, setStaged] = useState<{ state: RoomState; beat: ResolvedBeat } | null>(null);
  const [sub, setSub] = useState<SubPhase>('decide');
  const [pendingOpt, setPendingOpt] = useState<MomentOption | null>(null);
  const execDone = useRef(false);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  // flash/shake cinematográfico no fechamento de um round-chave.
  const [flash, setFlash] = useState<{ k: number; type: 'win' | 'loss'; big: boolean } | null>(null);

  // ATMOSFERA (iter41): o palco escala com tier/evento — só texto/CSS,
  // determinístico pelo matchSeed; nunca toca em odds/beats/resultado.
  const atmo = useMemo(() => matchAtmosphere(save, prep, !!major), [save, prep, major]);

  const beat = currentBeat(room);
  const isLast = isLastBeat(room);
  const inClutch = inClutchOf(room);
  const moment = currentMoment(room);
  const ctx = currentCtx(room);
  const pressure = pressureOf(room);
  const live = room.live;
  const heroNick = save.player.nick;
  const oppNicks = prep.opp.players.map((p) => p.nick);

  const spotlightGame = spotlightOf(room);
  const execSeed = execSeedOf(room);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // tendência revelada pela leitura tática (flavor determinístico por beat).
  const readTell = useMemo(() => {
    const tells = [
      'o adversário costuma forçar o duelo aqui',
      'eles seguram ângulo — cuidado com o pre-aim',
      'o time recua pra retake, não corre',
      'esperam sua agressão — entre com calma',
      'a AWP está de olho no meio',
      'eles apostam no flanco esquerdo',
    ];
    return tells[hashStr(`tell:${room.idx}:${room.clutch?.step ?? 0}:${prep.matchSeed}`) % tells.length];
  }, [room.idx, room.clutch?.step, prep.matchSeed]);

  const useRead = () => setRoom((r) => roomUseRead(r));

  // RESOLVE de verdade (engine): roll pré-comprometido + placar/momentum já
  // aplicados no estado ESTAGIADO — a tela ainda anima antes de revelar.
  const resolveWith = (opt: MomentOption, execPerf: number | null) => {
    setStaged(roomLockIn(room, opt.id, execPerf));
    setPendingOpt(null);
    setSub('rolling');
  };

  // DECIDIR: em MOMENTO-CHAVE, o lock-in abre a EXECUÇÃO (minigame) antes do roll.
  const lockIn = (opt: MomentOption) => {
    if (spotlightGame) { execDone.current = false; setPendingOpt(opt); setSub('exec'); return; }
    resolveWith(opt, null);
  };

  const finishExec = (raw: number) => {
    if (execDone.current || !pendingOpt || !spotlightGame) return;
    execDone.current = true;
    resolveWith(pendingOpt, spotlightGame.scoreToPerf(clamp(raw, 0, 1)));
  };

  // Safety net da execução: se o minigame nunca reportar, resolve neutro.
  useEffect(() => {
    if (sub !== 'exec' || !spotlightGame) return;
    const t = setTimeout(() => { if (!execDone.current && pendingOpt) { execDone.current = true; resolveWith(pendingOpt, EXEC_NEUTRAL); } }, spotlightGame.durationMs + 2500);
    return () => clearTimeout(t);
  }, [sub]); // eslint-disable-line react-hooks/exhaustive-deps

  // A arena de execução pode nascer abaixo da dobra — centraliza no EXECUTE.
  useEffect(() => {
    if (sub !== 'exec') return;
    document.querySelector('.rtp-exec-head')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [sub, reduced]);

  // rolling → result após a animação do needle: o estado estagiado assenta
  // (scorebug/momentum avançam) e o killfeed/flash entram.
  useEffect(() => {
    if (sub !== 'rolling' || !staged) return;
    const t = setTimeout(() => {
      const { state, beat: rb } = staged;
      setFeed(feedForOutcome(beat, rb.opt, rb.outcome, heroNick, oppNicks, makeRng((prep.matchSeed ^ (room.idx * 131) ^ ((room.clutch?.step ?? 0) * 977)) >>> 0)));
      if (rb.scored) {
        const big = inClutch || beat.kind === 'clutch' || beat.kind === 'mapPoint';
        setFlash({ k: room.idx * 10 + (room.clutch?.step ?? 0), type: rb.youWonRound ? 'win' : 'loss', big });
      }
      setRoom(state);
      setSub('result');
    }, 1150);
    return () => clearTimeout(t);
  }, [sub]); // eslint-disable-line react-hooks/exhaustive-deps

  const winProb = winProbOf(room);
  const liveRating = liveRatingOf(room, sub === 'result');

  const next = () => {
    if (!staged) return;
    const after = roomAdvance(room);
    setStaged(null); setFeed([]);
    if (after.phase === 'done') {
      // o flash reflete o mapa que VOCÊ acabou de fechar (mapas virtuais do BO5
      // vêm depois dele na lista) — primeiro fechado NESTE advance.
      const justClosed = after.closedMaps[room.closedMaps.length];
      if (justClosed) setFlash({ k: room.idx * 7 + 5, type: justClosed.won ? 'win' : 'loss', big: true });
      setRoom(after);
      onComplete(after.final!.outcomes, after.final!.liveMaps);
      return;
    }
    if (after.interlude?.mapClosed) {
      setFlash({ k: room.idx * 7 + 3, type: after.interlude.mapClosed.won ? 'win' : 'loss', big: true });
    } else {
      setFlash(null);
    }
    setRoom(after);
    setSub('decide');
  };

  // PULAR: o engine resolve os beats restantes no automático (sem liveMaps —
  // o fechamento natural fica pro card, como sempre foi no skip).
  const skipRest = () => {
    const done = roomSkipRest(room);
    onComplete(done.final!.outcomes);
  };

  // dado da resolução em tela (needle/stinger) — vem ESTAGIADO do engine.
  const locked = staged?.beat ?? null;
  const interlude = room.interlude;

  // chave determinística do beat corrente (reações da torcida / kicker de pressão)
  const beatSeedKey = `${room.idx}:${room.clutch?.step ?? 0}:${prep.matchSeed}`;

  return (
    <div className={`rtp-room${room.momentum >= 0.62 ? ' mom-hot' : room.momentum <= 0.38 ? ' mom-cold' : ''}${pressure ? ' pres' : ''}`}>
      {/* flash cinematográfico do fechamento de round-chave */}
      {flash && sub === 'result' && <div key={flash.k} className={`rtp-room-flash f-${flash.type}${flash.big ? ' big' : ''}`} aria-hidden />}
      {/* scorebug do round room — série (mapas) + placar do mapa atual */}
      <div className="rtp-room-bug">
        <span className="rtp-room-bug-team you">{save.team.tag}</span>
        {prep.maps.length > 1 && <span className="rtp-room-bug-maps you">{live.seriesScore[0]}</span>}
        <span className="rtp-room-bug-score">{live.mapScore[0]}</span>
        <span className="rtp-room-bug-sep">:</span>
        <span className="rtp-room-bug-score">{live.mapScore[1]}</span>
        {prep.maps.length > 1 && <span className="rtp-room-bug-maps">{live.seriesScore[1]}</span>}
        <span className="rtp-room-bug-team">{prep.opp.tag}</span>
        <span className="rtp-room-bug-prog">
          {prep.maps.length > 1 ? `MAPA ${Math.min(live.mapIndex + 1, prep.maps.length)}/${prep.maps.length} · ` : ''}MOMENTO {room.idx + 1}/{room.beats.length}
        </span>
      </div>

      {/* ATMOSFERA — o palco da série: local + lotação (persistente, sutil) */}
      <div className={`rtp-atmo st-${atmo.stage}`}>
        <span className="rtp-atmo-venue">{atmo.venue}</span>
        <span className="rtp-atmo-crowd" title="Lotação da arena">
          <i className="rtp-atmo-crowd-track"><i className="rtp-atmo-crowd-fill" style={{ width: `${atmo.crowd}%` }} /></i>
          {atmo.crowdLabel}
        </span>
      </div>

      {/* win-prob + momentum + rating ao vivo */}
      <div className="rtp-room-meters">
        <div className="rtp-winprob" title="Probabilidade de vencer a série">
          <div className="rtp-winprob-fill you" style={{ width: `${winProb}%` }} />
          <span className="rtp-winprob-lbl l">{Math.round(winProb)}%</span>
          <span className="rtp-winprob-lbl r">{Math.round(100 - winProb)}%</span>
        </div>
        <div className="rtp-room-side">
          <div className="rtp-momentum" title="Momentum">
            <div className="rtp-momentum-track"><div className="rtp-momentum-knob" style={{ left: `${room.momentum * 100}%` }} /></div>
            <span>MOMENTUM</span>
          </div>
          <div className="rtp-rating-tick" title="Seu rating ao vivo">
            <b style={{ color: liveRating >= 1.1 ? 'var(--rtp-win)' : liveRating >= 0.9 ? 'var(--rtp-warn)' : 'var(--rtp-loss)' }}>{liveRating.toFixed(2)}</b>
            <span>RATING</span>
          </div>
        </div>
      </div>

      <RtpSituationBoard
        ctx={ctx}
        seriesLabel={prep.maps.length > 1 ? `MD${prep.maps.length} · SÉRIE ${live.seriesScore[0]}–${live.seriesScore[1]}` : 'MD1'}
      />

      {/* ENQUANTO ISSO — o que aconteceu entre os momentos-chave (imersão + placar coerente) */}
      {sub === 'decide' && interlude && (
        <div className="rtp-interlude">
          {interlude.mapClosed && (
            <div className={`rtp-interlude-map ${interlude.mapClosed.won ? 'won' : 'lost'}`}>
              <RtpIcon name={interlude.mapClosed.won ? 'trophy' : 'skull'} size={14} />
              <b>{interlude.mapClosed.won ? 'MAPA FECHADO' : 'MAPA PERDIDO'} {interlude.mapClosed.score[0]}–{interlude.mapClosed.score[1]}</b>
              <span>série {live.seriesScore[0]}–{live.seriesScore[1]} · agora: {MAP_LABELS[beat.map] ?? beat.map}</span>
            </div>
          )}
          <div className="rtp-interlude-body">
            <span className="rtp-interlude-kicker">ENQUANTO ISSO</span>
            {interlude.lines.filter((_, i) => !interlude.mapClosed || i > 0).map((l, i) => <span key={i}>{l}</span>)}
            {interlude.bridged[0] + interlude.bridged[1] > 0 && !interlude.mapClosed && (
              <span className="rtp-interlude-score">placar chegou em {live.mapScore[0]}–{live.mapScore[1]}</span>
            )}
            {(() => {
              const amb = interludeAmbientLine(atmo, `${room.idx}:${prep.matchSeed}`);
              return amb ? <span className="rtp-atmo-amb">{amb}</span> : null;
            })()}
          </div>
        </div>
      )}

      {/* ABERTURA — antes do 1º beat: walkout (MAJOR) + o que está em jogo */}
      {sub === 'decide' && room.idx === 0 && room.outcomes.length === 0 && (atmo.walkout || atmo.stakes) && (
        <div className="rtp-atmo-open">
          {atmo.walkout?.map((l, i) => <span key={i} className="rtp-atmo-walkout">{l}</span>)}
          {atmo.stakes && <span className="rtp-atmo-stakes"><b>EM JOGO</b> {atmo.stakes}</span>}
        </div>
      )}

      {/* PRESSÃO — clutch / match point: a arquibancada vira personagem */}
      {sub === 'decide' && pressure && (
        <div className="rtp-atmo-pressure">
          <span className="rtp-atmo-pressure-kicker">{pressureKicker(atmo, beatSeedKey)}</span>
          {atmo.taunt && atmo.rivalName && (
            <span className="rtp-atmo-taunt"><b>{atmo.rivalName}</b> provoca do outro lado: “{atmo.taunt}”</span>
          )}
        </div>
      )}

      {/* DECIDE — opções com odds transparentes */}
      {sub === 'decide' && (
        <div className={`rtp-room-decide${spotlightGame ? ' spot' : ''}`}>
          {spotlightGame && (
            <div className="rtp-spot-banner">
              <RtpIcon name={spotlightGame.icon} size={14} />
              <b>MOMENTO-CHAVE</b>
              <span>decida → execute ({spotlightGame.title.toLowerCase()}) · execução move as odds em até ±8%</span>
            </div>
          )}
          <h3 className="rtp-room-title">{moment.title}</h3>
          <p className="rtp-room-sit">{moment.situation}</p>
          <div className="rtp-room-read">
            {room.readUsed ? (
              <span className="rtp-read-active"><RtpIcon name="brain" size={13} /> LEITURA: {readTell}</span>
            ) : (
              <button type="button" className="rtp-read-btn" disabled={room.reads <= 0} onClick={useRead}>
                <RtpIcon name="brain" size={13} /> {room.reads > 0 ? `LER O JOGO · ${room.reads}` : 'SEM LEITURAS'}
              </button>
            )}
            <button type="button" className="rtp-room-skip" onClick={skipRest} title="Resolve os momentos restantes no automático e vai pro resultado">
              PULAR PARTIDA <RtpIcon name="chevR" size={12} />
            </button>
          </div>
          <div className="rtp-room-opts">
            {moment.options.map((opt) => {
              const o = roomOdds(room, opt);
              const pct = Math.round(o.total * 100);
              return (
                <div key={opt.id} className={`rtp-opt s-${opt.style}`}>
                  <OddsGauge pct={o.total} />
                  <div className="rtp-opt-main">
                    <div className="rtp-opt-label">{opt.label}</div>
                    <div className="rtp-opt-desc">{opt.desc}</div>
                    <OddsBar odds={o} />
                    <div className="rtp-opt-risk">
                      {opt.style === 'aggro'
                        ? <><b className="hi">TETO +{o.ceilingFrags} frags</b> · <b className="lo">PISO: você morre primeiro</b></>
                        : opt.style === 'safe'
                          ? <><b className="hi">+1 frag garantido</b> · baixa variância</>
                          : <><b className="hi">leitura recompensada</b> · risco médio</>}
                    </div>
                  </div>
                  <button type="button" className="rtp-lockin" onClick={() => lockIn(opt)}>
                    {spotlightGame ? <>LOCK IN → EXECUTAR · {pct}%</> : <>LOCK IN · {pct}%</>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* EXECUTE — o minigame do momento-chave: sua mão move as odds */}
      {sub === 'exec' && pendingOpt && spotlightGame && (() => {
        const Game = GAME_COMPONENTS[spotlightGame.id];
        return (
          <div className="rtp-room-exec">
            <div className="rtp-exec-head">
              <span className="rtp-exec-kicker"><RtpIcon name={spotlightGame.icon} size={15} /> EXECUTE · {spotlightGame.title}</span>
              <span className="rtp-exec-opt">{pendingOpt.label}</span>
              <span className="rtp-exec-blurb">{spotlightGame.blurb}</span>
            </div>
            <div className="rtp-mini-arena rtp-exec-arena">
              <Game key={execSeed} seed={execSeed} durationMs={spotlightGame.durationMs} difficulty={tierDifficulty(save.team.tier)} reducedMotion={reduced} onFinish={finishExec} />
            </div>
            <button type="button" className="rtp-btn-ghost rtp-exec-instinct" onClick={() => finishExec(EXEC_NEUTRAL)}>
              {`Resolver no instinto · sem bônus`}
            </button>
          </div>
        );
      })()}

      {/* ROLLING — needle visível contra o threshold (a zona anima base→execução) */}
      {sub === 'rolling' && locked && (
        <div className="rtp-room-roll">
          <div className="rtp-roll-label">{locked.opt.label}</div>
          {locked.execPerf != null && (
            <div className={`rtp-roll-exec e-${locked.execPerf >= 0.62 ? 'good' : locked.execPerf >= 0.5 ? 'mid' : 'bad'}`}>
              EXECUÇÃO {execVerdict(locked.execPerf)} · {Math.round(execBoostOf(locked.execPerf) * 3.1) > 0 ? '+' : ''}{Math.round(execBoostOf(locked.execPerf) * 3.1)}% nas odds
            </div>
          )}
          <RollNeedle roll={locked.roll} threshold={locked.odds.total} from={locked.baseTotal} />
        </div>
      )}

      {/* RESULT — stinger + killfeed + pílulas */}
      {sub === 'result' && locked && (
        <div className={`rtp-room-result${flash?.big ? ' big' : ''}`}>
          <div className={`rtp-stinger r-${locked.outcome.result}`}>
            <span className="rtp-stinger-verb">
              {inClutch && !locked.clutchFinal
                ? `ABATE! RESTA 1v${locked.newAlive}`
                : inClutch
                  ? (locked.outcome.result !== 'fail' && locked.newAlive <= 0 ? 'CLUTCH FECHADO!' : 'VOCÊ CAIU')
                  : locked.outcome.result === 'success' ? 'ROUND VENCIDO'
                    : locked.outcome.result === 'partial' ? 'PARCIAL' : 'ROUND PERDIDO'}
            </span>
            <div className="rtp-stinger-pills">
              {locked.execPerf != null && locked.execPerf >= 0.9 && <span className="rtp-pill exec-gold">EXECUÇÃO PERFEITA</span>}
              {locked.execPerf != null && locked.execPerf < 0.5 && <span className="rtp-pill exec-bad">EXECUÇÃO FALHOU</span>}
              {outcomePills(beat, locked.outcome).map((p, i) => <span key={i} className="rtp-pill">{p}</span>)}
            </div>
          </div>
          <p className="rtp-room-narr">{locked.outcome.narrative}</p>
          {/* a torcida reage ao SEU round — 1 linha, coerente com o palco */}
          <p className="rtp-crowd-line">{crowdBeatLine(atmo, locked.outcome.result, !!flash?.big, beatSeedKey)}</p>
          {feed.length > 0 && (
            <div className="rtp-killfeed">
              {feed.map((f, i) => (
                <div key={i} className={`rtp-kf-row${f.byHero ? ' me' : f.deathOfHero ? ' dead' : ''}`} style={{ animationDelay: `${i * 90}ms` }}>
                  <span className="rtp-kf-killer">{f.killer}</span>
                  <span className="rtp-kf-wpn">{f.hs && <RtpIcon name="crosshair" size={11} />} {f.weapon}{f.opening && <> <RtpIcon name="spark" size={11} /></>}{f.trade && <> <RtpIcon name="trade" size={11} /></>}</span>
                  <span className="rtp-kf-victim">{f.victim}</span>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="rtp-room-next" onClick={next}>
            {inClutch && !locked.clutchFinal ? `CONTINUAR · 1v${locked.newAlive}` : isLast ? 'VER RESULTADO DA SÉRIE' : 'PRÓXIMO ROUND'} →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Gauge circular de odds ──────────────────────────────────────────────────
function OddsGauge({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r;
  const col = oddsColor(pct);
  return (
    <div className="rtp-gauge">
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} className="rtp-gauge-track" />
        <circle cx="32" cy="32" r={r} className="rtp-gauge-arc" style={{ stroke: col, strokeDasharray: c, strokeDashoffset: c * (1 - pct) }} />
      </svg>
      <span className="rtp-gauge-pct" style={{ color: col }}>{Math.round(pct * 100)}<i>%</i></span>
    </div>
  );
}

// ── Barra de breakdown (1:1 com explainOdds) ────────────────────────────────
function OddsBar({ odds }: { odds: OddsBreakdown }) {
  return (
    <div className="rtp-oddsbar">
      {odds.segments.map((s, i) => (
        <span key={i} className={`rtp-seg k-${s.kind} ${s.pct < 0 ? 'neg' : 'pos'}`}>
          {s.label} {s.pct > 0 ? '+' : ''}{s.pct}%
        </span>
      ))}
      {odds.conditions.filter((c) => c.delta !== 0).map((c, i) => (
        <span key={`c${i}`} className={`rtp-seg k-cond ${c.delta < 0 ? 'neg' : 'pos'}`}>{c.label} {c.delta > 0 ? '+' : ''}{c.delta}%</span>
      ))}
    </div>
  );
}

// ── Roll-needle estilo ROLETA: varre rápido e assenta no roll (RNG justo/visível) ──
function RollNeedle({ roll, threshold, from }: { roll: number; threshold: number; from?: number }) {
  const [pos, setPos] = useState(0.5);
  const [settled, setSettled] = useState(false);
  // A zona verde nasce no valor BASE e cresce/encolhe até o valor pós-execução —
  // o jogador VÊ a mão dele mexendo nas odds antes do roll assentar.
  const [zone, setZone] = useState(from ?? threshold);
  useEffect(() => {
    // sequência de varredura (posições rápidas) → assenta no valor real do roll.
    const seq = [0.9, 0.14, 0.7, 0.28, roll];
    const timers = seq.map((p, i) => setTimeout(() => { setPos(p); if (i === seq.length - 1) setSettled(true); }, 60 + i * 110));
    const z = setTimeout(() => setZone(threshold), 140);
    return () => { timers.forEach(clearTimeout); clearTimeout(z); };
  }, [roll, threshold]);
  // banda de PARCIAL lida da MESMA fonte do engine (partialBandOf) — antes era
  // uma cópia literal da fórmula e já divergiu uma vez ("needle carimbava FALHOU").
  const partialBand = partialBandOf(threshold);
  const verdict = roll < threshold ? 'win' : roll < threshold + partialBand ? 'part' : 'loss';
  return (
    <div className="rtp-needle">
      <div className="rtp-needle-track">
        <div className="rtp-needle-zone" style={{ width: `${zone * 100}%` }} />
        <div className="rtp-needle-zone part" style={{ left: `${zone * 100}%`, width: `${partialBand * 100}%` }} />
        <div className="rtp-needle-thresh" style={{ left: `${zone * 100}%` }} />
        <div className={`rtp-needle-pin ${settled ? verdict : 'spin'}`} style={{ left: `${pos * 100}%` }} />
      </div>
      <div className="rtp-needle-read">
        <span>ROLOU <b>{settled ? Math.round(roll * 100) : '··'}</b></span>
        <span>PRECISAVA <b>&lt;{Math.round(threshold * 100)}</b></span>
        <span className={settled ? verdict : ''}>{settled ? (verdict === 'win' ? 'PASSOU' : verdict === 'part' ? 'PARCIAL' : 'FALHOU') : 'ROLANDO…'}</span>
      </div>
    </div>
  );
}
