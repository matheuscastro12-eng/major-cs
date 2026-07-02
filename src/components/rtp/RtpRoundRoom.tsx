import { useMemo, useState, useEffect, useRef, type ComponentType } from 'react';
import { makeRng } from '../../engine/rng';
import { hashStr } from '../../state/hash';
import {
  resolveMoment, explainOdds, clutchStepMoment,
  type MomentOption, type MomentOutcome, type OddsBreakdown,
} from '../../engine/rtp/moments';
import {
  buildBeatPlan, ctxForBeat, feedForOutcome, outcomePills, bridgeToBeat, initialLiveScore,
  type BeatSpec, type FeedRow, type LiveScore, type Interlude,
} from '../../engine/rtp/roundModel';
import { MINIGAMES, type MiniGameId, type MiniGameProps } from '../../engine/rtp/minigames';
import { CrosshairFlick } from './minigames/CrosshairFlick';
import { ReactionGate } from './minigames/ReactionGate';
import { SprayTracer } from './minigames/SprayTracer';
import { CalloutMemory } from './minigames/CalloutMemory';
import { TempoLock } from './minigames/TempoLock';
import type { MatchPrep } from '../../engine/rtp/matchSim';
import { MAP_LABELS } from '../../types';
import { planStyleBias, gamePlanDef } from '../../engine/rtp/meta';
import type { RoadToProSave } from '../../engine/rtp/types';
import { RtpSituationBoard } from './RtpSituationBoard';
import { RtpIcon } from './RtpIcon';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const GAME_COMPONENTS: Record<MiniGameId, ComponentType<MiniGameProps>> = {
  flick: CrosshairFlick, reaction: ReactionGate, spray: SprayTracer, memory: CalloutMemory, tempo: TempoLock,
};
// perf → pontos de atributo EFETIVO. 0.55 = neutro (o "instinto"); execução
// perfeita ≈ +2.7 attr (~+8% de chance), o piso do scoreToPerf ≈ −0.9 (~−3%).
const EXEC_NEUTRAL = 0.55;
const execBoostOf = (perf: number) => (perf - EXEC_NEUTRAL) * 6;
const execVerdict = (perf: number) =>
  perf >= 0.92 ? 'PERFEITA' : perf >= 0.78 ? 'ÓTIMA' : perf >= 0.62 ? 'BOA' : perf >= 0.5 ? 'NA MÉDIA' : 'RUIM';

type SubPhase = 'decide' | 'exec' | 'rolling' | 'result';

interface LockedState {
  opt: MomentOption; odds: OddsBreakdown; roll: number; outcome: MomentOutcome;
  clutchFinal: boolean; newAlive: number;
  execPerf: number | null;    // performance no minigame (null = beat sem execução)
  baseTotal: number;          // odds ANTES da execução (o needle anima base→final)
}
interface ClutchState {
  alive: number; step: number; hot: number; bombSecs: number | null; subs: MomentOutcome[];
}

// Cor do gauge na rampa verde→âmbar→vermelho.
function oddsColor(pct: number): string {
  if (pct >= 0.6) return 'var(--rtp-odds-hi)';
  if (pct >= 0.42) return 'var(--rtp-odds-mid)';
  return 'var(--rtp-odds-lo)';
}

export function RtpRoundRoom({ save, prep, onComplete }: {
  save: RoadToProSave;
  prep: MatchPrep;
  onComplete: (outcomes: MomentOutcome[]) => void;
}) {
  const beats = useMemo<BeatSpec[]>(
    () => buildBeatPlan(save.player.role, prep.maps.map((m) => m.map), prep.matchSeed),
    [save.player.role, prep.maps, prep.matchSeed],
  );

  const [idx, setIdx] = useState(0);
  // PLACAR VIVO (v15): rounds do mapa + série de mapas. Os rounds ENTRE os
  // momentos-chave acontecem via bridgeToBeat — nada de placar pulando 1-0 → 2-0.
  const [live, setLive] = useState<LiveScore>(initialLiveScore);
  const [interlude, setInterlude] = useState<Interlude | null>(null);
  const [outcomes, setOutcomes] = useState<MomentOutcome[]>([]);
  const [sub, setSub] = useState<SubPhase>('decide');
  const [locked, setLocked] = useState<LockedState | null>(null);
  // MOMENTO-CHAVE: a opção travada esperando a EXECUÇÃO (minigame) resolver.
  const [pendingOpt, setPendingOpt] = useState<MomentOption | null>(null);
  const execDone = useRef(false);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  // momentum inicial SEMEADO pela confiança (moral + sequência): entra na Sala
  // embalado ou pressionado antes do 1º round.
  const [momentum, setMomentum] = useState(() => clamp(0.5 + (prep.confidence ?? 0) * 0.14, 0.32, 0.68));
  // sub-estado do clutch multi-step (null fora de um clutch)
  const [clutch, setClutch] = useState<ClutchState | null>(null);
  // "Ler o jogo" — leitura tática: recurso limitado (escala com game sense) que
  // revela a tendência do adversário e melhora suas odds na decisão atual.
  const [reads, setReads] = useState(() => clamp(1 + Math.round((prep.effAttrs.gameSense ?? 10) / 7), 1, 4));
  const [readUsed, setReadUsed] = useState(false);
  // flash/shake cinematográfico no fechamento de um round-chave.
  const [flash, setFlash] = useState<{ k: number; type: 'win' | 'loss'; big: boolean } | null>(null);

  const beat = beats[idx];
  const isLast = idx >= beats.length - 1;
  const ctx = ctxForBeat(beat, live.mapScore, isLast);
  const inClutch = beat.kind === 'clutch' && !!clutch;

  // momento/contexto correntes: no clutch, é a etapa atual (1vX) com a bomba/vivos.
  const currentMoment = inClutch ? clutchStepMoment(clutch!.alive, clutch!.bombSecs) : beat.moment;
  const currentCtx = inClutch
    ? { ...ctx, alive: [1, clutch!.alive] as [number, number], bomb: ctx.bomb ? { ...ctx.bomb, defuseSecs: clutch!.bombSecs ?? ctx.bomb.defuseSecs } : null }
    : ctx;

  // momentum aquece/esfria a SUA próxima decisão (acoplamento real e honesto).
  const momMult = 1 + (momentum - 0.5) * 0.16;         // ±8%
  const heroNick = save.player.nick;
  const oppNicks = prep.opp.players.map((p) => p.nick);

  // atributo efetivo de uma opção: condição off-game (effAttrs) + momentum +
  // hot-hand + leitura tática + plano de jogo + rivalidade (TODOS entram no roll
  // real via resolveMoment — nada cosmético).
  const planBias = (opt: MomentOption) => (prep.plan ? planStyleBias(prep.plan, opt.style) : 0);
  // Confiança firma (ou faz tremer) nos rounds de PRESSÃO — clutch/map point.
  const pressure = beat.kind === 'clutch' || beat.kind === 'mapPoint' || inClutch;
  const confBoost = pressure ? (prep.confidence ?? 0) * 2 : 0;
  const effFor = (opt: MomentOption) =>
    clamp((prep.effAttrs[opt.attr] + (inClutch ? clutch!.hot : 0) + (readUsed ? 2 : 0) + planBias(opt) + (prep.grudge ?? 0) + confBoost) * momMult, 1, 20);
  // atributo efetivo COM a execução do minigame (perf move o attr de verdade).
  const effWith = (opt: MomentOption, execPerf: number | null) =>
    clamp(effFor(opt) + (execPerf != null ? execBoostOf(execPerf) : 0), 1, 20);

  // odds por opção, espelhando EXATAMENTE a fórmula do resolveMoment.
  const oddsFor = (opt: MomentOption, execPerf: number | null = null): OddsBreakdown => {
    const factors = [...prep.factors];
    const mPct = Math.round((momMult - 1) * 100);
    if (mPct !== 0) factors.push({ label: momentum >= 0.5 ? 'Embalado' : 'Pressionado', delta: mPct, good: mPct > 0 });
    if (inClutch && clutch!.hot > 0) factors.push({ label: 'Embalo do clutch', delta: Math.round(clutch!.hot * 5), good: true });
    if (readUsed) factors.push({ label: 'Leitura tática', delta: 8, good: true });
    const pb = planBias(opt);
    if (prep.plan && pb !== 0) factors.push({ label: gamePlanDef(prep.plan).label, delta: pb * 4, good: pb > 0 });
    if (pressure && confBoost !== 0) factors.push({ label: confBoost > 0 ? 'Confiança' : 'Pressão', delta: Math.round(confBoost * 5), good: confBoost > 0 });
    if (execPerf != null) {
      const d = Math.round(execBoostOf(execPerf) * 3.1);   // ≈ % por ponto de attr
      if (d !== 0) factors.push({ label: 'Execução', delta: d, good: d > 0 });
    }
    return explainOdds(opt, effWith(opt, execPerf), prep.opp.strength, factors);
  };

  // MOMENTO-CHAVE atual: beat com spotlight — no clutch, só o DUELO FINAL (1v1)
  // é executado na sua mão; os passos anteriores mantêm o ritmo do dado.
  const spotlightGame = beat.spotlight && (!inClutch || clutch!.alive === 1) ? MINIGAMES[beat.spotlight] : null;
  const execSeed = (prep.matchSeed ^ ((idx + 1) * 0x51ed) ^ ((clutch?.step ?? 0) * 0xe1) ^ 0x9a3e) >>> 0;
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // tendência revelada pela leitura tática (determinística por beat).
  const readTell = useMemo(() => {
    const tells = [
      'o adversário costuma forçar o duelo aqui',
      'eles seguram ângulo — cuidado com o pre-aim',
      'o time recua pra retake, não corre',
      'esperam sua agressão — entre com calma',
      'a AWP está de olho no meio',
      'eles apostam no flanco esquerdo',
    ];
    return tells[hashStr(`tell:${idx}:${clutch?.step ?? 0}:${prep.matchSeed}`) % tells.length];
  }, [idx, clutch?.step, prep.matchSeed]);

  const useRead = () => { if (reads <= 0 || readUsed) return; setReads((r) => r - 1); setReadUsed(true); };

  // RESOLVE de verdade: roll pré-comprometido (seed fixo) + threshold movido pela
  // execução — a zona verde cresce/encolhe NA TELA, mas o dado já estava lançado.
  const resolveWith = (opt: MomentOption, execPerf: number | null) => {
    const seed = (prep.matchSeed ^ ((idx + 1) * 0x9e3779b1) ^ ((clutch?.step ?? 0) * 0x85ebca6b)) >>> 0;
    const roll = makeRng(seed)();                       // mesmo 1º valor que o resolveMoment usa
    // execPerf viaja NO outcome: summarizeMoments agrega e o finish converte em
    // boost real de rating (jogou bem os minigames → rating bom; mal → ruim).
    const outcome: MomentOutcome = {
      ...resolveMoment(currentMoment, opt, effWith(opt, execPerf), prep.opp.strength, makeRng(seed)),
      ...(execPerf != null ? { execPerf } : {}),
    };
    let clutchFinal = true, newAlive = 0;
    if (inClutch) {
      const died = outcome.result === 'fail';
      newAlive = clutch!.alive - (died ? 0 : 1);
      clutchFinal = died || newAlive <= 0;
    }
    setLocked({ opt, odds: oddsFor(opt, execPerf), roll, outcome, clutchFinal, newAlive, execPerf, baseTotal: oddsFor(opt).total });
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

  // A arena de execução pode nascer abaixo da dobra (o board da situação é alto)
  // — traz o minigame pro centro da tela na hora do EXECUTE.
  useEffect(() => {
    if (sub !== 'exec') return;
    document.querySelector('.rtp-exec-head')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [sub, reduced]);

  // rolling → result após a animação do needle
  useEffect(() => {
    if (sub !== 'rolling' || !locked) return;
    const t = setTimeout(() => {
      const out = locked.outcome;
      setFeed(feedForOutcome(beat, locked.opt, out, heroNick, oppNicks, makeRng((prep.matchSeed ^ (idx * 131) ^ ((clutch?.step ?? 0) * 977)) >>> 0)));
      // só pontua a rodada da BO3 num beat normal OU no FECHAMENTO do clutch.
      if (!inClutch || locked.clutchFinal) {
        const youWin = inClutch
          ? out.result !== 'fail' && locked.newAlive <= 0
          : out.result === 'success' || (out.result === 'partial' && locked.roll < locked.odds.total + 0.09);
        setLive((l) => ({ ...l, mapScore: youWin ? [l.mapScore[0] + 1, l.mapScore[1]] : [l.mapScore[0], l.mapScore[1] + 1] }));
        setMomentum((m) => clamp(m * 0.55 + out.value * 0.45, 0, 1));
        // flash + shake nos rounds grandes (clutch, map point, ou derrota).
        const big = inClutch || beat.kind === 'clutch' || beat.kind === 'mapPoint';
        setFlash({ k: idx * 10 + (clutch?.step ?? 0), type: youWin ? 'win' : 'loss', big });
      }
      setSub('result');
    }, 1150);
    return () => clearTimeout(t);
  }, [sub]); // eslint-disable-line react-hooks/exhaustive-deps

  // win-prob = estado derivado do PLACAR REAL (mapa + série) + momentum + força.
  const winProb = useMemo(() => {
    const edge = (live.mapScore[0] - live.mapScore[1]) * 2.2 + (live.seriesScore[0] - live.seriesScore[1]) * 14
      + (momentum - 0.5) * 30 + (save.player.ovr - prep.opp.strength) * 0.8;
    return clamp(50 + edge, 5, 95);
  }, [live, momentum, save.player.ovr, prep.opp.strength]);

  const initClutch = (b: BeatSpec): ClutchState => ({ alive: Math.max(1, b.alive[1]), step: 0, hot: 0, bombSecs: b.bomb?.defuseSecs ?? null, subs: [] });

  const next = () => {
    if (!locked) return;
    // CONTINUA o clutch: mais inimigos vivos e você sobreviveu
    if (inClutch && !locked.clutchFinal) {
      setClutch((c) => c && ({ alive: locked.newAlive, step: c.step + 1, hot: c.hot + 1.6, bombSecs: c.bombSecs != null ? Math.max(0, c.bombSecs - 7) : null, subs: [...c.subs, locked.outcome] }));
      setLocked(null); setFeed([]); setReadUsed(false); setFlash(null); setInterlude(null); setSub('decide');
      return;
    }
    // FINALIZA o beat (normal, ou clutch fechado/perdido)
    let beatOutcome = locked.outcome;
    if (inClutch && clutch) {
      const subs = [...clutch.subs, locked.outcome];
      const cleared = locked.outcome.result !== 'fail' && locked.newAlive <= 0;
      beatOutcome = {
        result: cleared ? 'success' : 'fail',
        value: subs.reduce((s, o) => s + o.value, 0) / subs.length,
        frags: subs.reduce((s, o) => s + o.frags, 0),
        deaths: cleared ? 0 : 1,
        openings: 0,
        clutches: cleared ? 1 : 0,
        narrative: cleared ? 'CLUTCH FECHADO! Você limpou o 1vX sozinho.' : 'O clutch escapou no último duelo.',
      };
    }
    const acc = [...outcomes, beatOutcome];
    setOutcomes(acc);
    setLocked(null); setFeed([]);
    if (isLast) { onComplete(acc); return; }
    const nb = beats[idx + 1];
    // PONTE: os rounds entre este beat e o próximo acontecem agora — placar avança
    // com viés do momentum/resultado, e mapas fecham na transição da BO3.
    const youWon = inClutch
      ? beatOutcome.result === 'success'
      : locked.outcome.result === 'success' || (locked.outcome.result === 'partial' && locked.roll < locked.odds.total + 0.09);
    const nbLastOfMap = idx + 2 >= beats.length || beats[idx + 2].mapIndex !== nb.mapIndex;
    const bridge = bridgeToBeat(live, nb, youWon, momentum, save.player.ovr - prep.opp.strength, prep.matchSeed, prep.maps.map((m) => m.map), nbLastOfMap);
    setLive(bridge.live);
    setInterlude(bridge.interlude);
    setClutch(nb?.kind === 'clutch' ? initClutch(nb) : null);
    setReadUsed(false); setFlash(null);
    setIdx(idx + 1); setSub('decide');
  };

  // PULAR: resolve os beats restantes (a partir do atual) no automático e vai direto
  // ao resultado — pra quem não quer jogar rodada a rodada. Preserva os já jogados.
  const skipRest = () => {
    const acc = [...outcomes];
    for (let i = idx; i < beats.length; i++) {
      const b = beats[i];
      const opt = b.moment.options.find((o) => o.style === 'smart') ?? b.moment.options[0];
      const seed = (prep.matchSeed ^ ((i + 1) * 0x9e3779b1)) >>> 0;
      const eff = clamp(prep.effAttrs[opt.attr] + planBias(opt) + (prep.grudge ?? 0), 1, 20);
      acc.push(resolveMoment(b.moment, opt, eff, prep.opp.strength, makeRng(seed)));
    }
    onComplete(acc);
  };

  // rating ao vivo estimado (pra ticker)
  const liveRating = useMemo(() => {
    const all = [...outcomes, ...(locked && sub === 'result' ? [locked.outcome] : [])];
    if (!all.length) return 1.0;
    const avg = all.reduce((s, o) => s + o.value, 0) / all.length;
    return Math.round((0.55 + avg * 1.05) * 100) / 100;
  }, [outcomes, locked, sub]);

  return (
    <div className={`rtp-room${momentum >= 0.62 ? ' mom-hot' : momentum <= 0.38 ? ' mom-cold' : ''}`}>
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
          {prep.maps.length > 1 ? `MAPA ${Math.min(live.mapIndex + 1, prep.maps.length)}/${prep.maps.length} · ` : ''}MOMENTO {idx + 1}/{beats.length}
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
            <div className="rtp-momentum-track"><div className="rtp-momentum-knob" style={{ left: `${momentum * 100}%` }} /></div>
            <span>MOMENTUM</span>
          </div>
          <div className="rtp-rating-tick" title="Seu rating ao vivo">
            <b style={{ color: liveRating >= 1.1 ? 'var(--rtp-win)' : liveRating >= 0.9 ? 'var(--rtp-warn)' : 'var(--rtp-loss)' }}>{liveRating.toFixed(2)}</b>
            <span>RATING</span>
          </div>
        </div>
      </div>

      <RtpSituationBoard
        ctx={currentCtx}
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
          </div>
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
          <h3 className="rtp-room-title">{currentMoment.title}</h3>
          <p className="rtp-room-sit">{currentMoment.situation}</p>
          <div className="rtp-room-read">
            {readUsed ? (
              <span className="rtp-read-active"><RtpIcon name="brain" size={13} /> LEITURA: {readTell}</span>
            ) : (
              <button type="button" className="rtp-read-btn" disabled={reads <= 0} onClick={useRead}>
                <RtpIcon name="brain" size={13} /> {reads > 0 ? `LER O JOGO · ${reads}` : 'SEM LEITURAS'}
              </button>
            )}
            <button type="button" className="rtp-room-skip" onClick={skipRest} title="Resolve os momentos restantes no automático e vai pro resultado">
              PULAR PARTIDA <RtpIcon name="chevR" size={12} />
            </button>
          </div>
          <div className="rtp-room-opts">
            {currentMoment.options.map((opt) => {
              const o = oddsFor(opt);
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
              <Game key={execSeed} seed={execSeed} durationMs={spotlightGame.durationMs} reducedMotion={reduced} onFinish={finishExec} />
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
  // Mesma banda do resolveMoment: [thr, thr+banda) = PARCIAL (meio-termo com
  // frag), não falha seca — antes o needle carimbava "FALHOU" nesses rolls.
  const partialBand = Math.min(0.18, (1 - threshold) * 0.7);
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
