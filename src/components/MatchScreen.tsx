import { useEffect, useMemo, useRef, useState } from 'react';
import { LiveCanvasGame } from './LiveCanvasGame';
import { analyzeSeries } from '../engine/insights';
import { createMapSim, playbookLean, type BuyTier, type MapSim, type RoundCall, type Stance } from '../engine/match';
import { narrateRound, type RoundNarration } from '../engine/narration';
import type { Rng } from '../engine/rng';
import type { KillEvent, MapId, MapResult, PlayerLine, PlayerMapStats, Playstyle, SeriesResult, TPlayer, TTeam } from '../types';
import { derivePlaystyle, MAP_LABELS, PLAYBOOK_LABELS, PLAYSTYLE_ICONS, PLAYSTYLE_LABELS } from '../types';
import { CoreFlag } from './flags';
import { Scoreboard } from './Scoreboard';
import { Flag, MapThumb, PlayerAvatar, TeamBadge } from './ui';
import { HeadshotIcon, WeaponIcon, WEAPON_LABELS } from './weapons';
import { useLang } from '../state/i18n';
import { ct } from '../state/career-i18n';

interface Props {
  teams: [TTeam, TTeam];
  maps: { map: MapId; pickedBy: 0 | 1 | -1 }[];
  userIdx: 0 | 1;
  rng: Rng;
  phaseLabel: string;
  bestOf?: 1 | 3 | 5;
  onFinish: (series: SeriesResult) => void;
  onDecided?: (series: SeriesResult) => void; // dispara ao DECIDIR a série (antes do Continuar): trava o resultado
}

const TIMEOUTS_PER_MAP = 2;
const TIMEOUT_ROUNDS = 3;

const SPEEDS: { label: string; ms: number }[] = [
  { label: '0.25x', ms: 1500 }, // bem lento: dá tempo de ler o round e fazer a call
  { label: '0.5x', ms: 950 },
  { label: '1x', ms: 460 },
  { label: '2x', ms: 220 },
  { label: '4x', ms: 90 },
];
const DEFAULT_SPEED_IDX = 2; // começa em 1x (0.25x/0.5x são as opções mais lentas)
const FREEZE_SECONDS = 5; // modo Tático: freezetime antes de cada round

// textos do modo tático/lado, por idioma (sem precisar mexer no i18n global)
const LOCAL = {
  pt: { tactical: '🎯 Tático', tacticalHint: 'Freezetime de 5s antes de cada round para escolher sua chamada', freezetime: 'FREEZETIME', chooseCall: 'escolha sua chamada e postura', playRound: '▶ Jogar round', youPlay: 'VOCÊ JOGA', worked: 'deu certo', failed: 'não rolou', lastCall: 'Última chamada' },
  en: { tactical: '🎯 Tactical', tacticalHint: '5s freezetime before each round to pick your call', freezetime: 'FREEZETIME', chooseCall: 'pick your call and stance', playRound: '▶ Play round', youPlay: 'YOU PLAY', worked: 'worked', failed: "didn't work", lastCall: 'Last call' },
  es: { tactical: '🎯 Táctico', tacticalHint: 'Freezetime de 5s antes de cada ronda para elegir tu jugada', freezetime: 'FREEZETIME', chooseCall: 'elige tu jugada y postura', playRound: '▶ Jugar ronda', youPlay: 'JUEGAS', worked: 'funcionó', failed: 'no funcionó', lastCall: 'Última jugada' },
};

const STANCES: { key: Stance; icon: string; labelKey: string; hintKey: string }[] = [
  { key: 'aggressive', icon: '🔥', labelKey: 'match.stanceAggressive', hintKey: 'match.stanceAggressiveHint' },
  { key: 'default', icon: '⚖', labelKey: 'match.stanceDefault', hintKey: 'match.stanceDefaultHint' },
  { key: 'cautious', icon: '🛡', labelKey: 'match.stanceCautious', hintKey: 'match.stanceCautiousHint' },
];

// chamadas táticas de UM round (one-shot), com impacto em força e economia
const CALLS: { key: RoundCall; icon: string; labelKey: string; hintKey: string }[] = [
  { key: 'rush', icon: '🏃', labelKey: 'call.rush', hintKey: 'call.rushHint' },
  { key: 'retake', icon: '🛡', labelKey: 'call.retake', hintKey: 'call.retakeHint' },
  { key: 'force', icon: '💰', labelKey: 'call.force', hintKey: 'call.forceHint' },
  { key: 'save', icon: '🪙', labelKey: 'call.save', hintKey: 'call.saveHint' },
];

// estilo favorecido por cada postura
const favoredStyle = (mode: Stance): Playstyle | null =>
  mode === 'aggressive' ? 'aggressive' : mode === 'cautious' ? 'passive' : null;

// relação de um jogador com a postura ativa: buff (combina), nerf (oposto) ou neutro
function stanceRelation(ps: Playstyle, mode: Stance): 'buff' | 'nerf' | 'neutral' {
  const fav = favoredStyle(mode);
  if (!fav) return 'neutral';
  if (ps === fav) return 'buff';
  if ((mode === 'aggressive' && ps === 'passive') || (mode === 'cautious' && ps === 'aggressive')) return 'nerf';
  return 'neutral';
}

// quantos jogadores ganham (saldo) com uma postura
function stanceFitCount(players: TPlayer[], mode: Stance): number {
  let n = 0;
  for (const p of players) {
    const r = stanceRelation(p.playstyle ?? derivePlaystyle(p.role), mode);
    if (r === 'buff') n++;
    else if (r === 'nerf') n--;
  }
  return n;
}

const BUY_LABEL: Record<BuyTier, string> = {
  pistol: 'PISTOL',
  eco: 'ECO',
  force: 'FORCE BUY',
  full: 'FULL BUY',
};

export function MatchScreen({ teams, maps, userIdx, rng, phaseLabel, bestOf = 3, onFinish, onDecided }: Props) {
  const { t, lang } = useLang();
  const L = LOCAL[(lang as 'pt' | 'en' | 'es')] ?? LOCAL.pt;
  const need = Math.ceil(bestOf / 2); // BO1 -> 1, BO3 -> 2
  const mdLabel = bestOf === 1 ? 'MD1' : bestOf === 5 ? 'MD5' : 'MD3';
  const simsRef = useRef<MapSim[]>([]);
  const resultsRef = useRef<MapResult[]>([]);
  const [mapIdx, setMapIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const [finished, setFinished] = useState(false);
  const [series, setSeries] = useState<SeriesResult | null>(null);
  const [timeoutsLeft, setTimeoutsLeft] = useState(TIMEOUTS_PER_MAP);
  const [boostRounds, setBoostRounds] = useState(0);
  const [pausedMsg, setPausedMsg] = useState('');
  // T2.5: broadcast 2D do mapa selecionado após o fim da série. Abre overlay
  // com o LiveCanvasGame em modo autoplay; não substitui o MatchScreen atual.
  const [broadcastMapIdx, setBroadcastMapIdx] = useState<number | null>(null);
  const [caster, setCaster] = useState<RoundNarration | null>(null); // narração do último momento-chave
  const [reveal, setReveal] = useState(0); // quantos beats da fala já apareceram (suspense)
  const lastNarrated = useRef('');
  const [moments, setMoments] = useState<RoundNarration[]>([]); // todos os lances narrados (replay no fim)
  const buysByRound = useRef<Record<string, [BuyTier, BuyTier]>>({}); // compra de cada round (pra detectar eco/force)
  const [speedIdx, setSpeedIdx] = useState(DEFAULT_SPEED_IDX);
  const [stance, setStance] = useState<Stance>('default');
  // hint de descoberta das calls ao vivo (some ao dispensar; 1ª vez forte)
  const [callsHint, setCallsHint] = useState(() => {
    try { return localStorage.getItem('rtm-match-calls-hint-v1') !== '1'; } catch { return true; }
  });
  const dismissCallsHint = () => {
    setCallsHint(false);
    try { localStorage.setItem('rtm-match-calls-hint-v1', '1'); } catch { /* sem storage */ }
  };
  const stanceRef = useRef<Stance>('default');
  useEffect(() => { stanceRef.current = stance; }, [stance]);
  const [pendingCall, setPendingCall] = useState<RoundCall | null>(null);
  const callRef = useRef<RoundCall | null>(null);
  useEffect(() => { callRef.current = pendingCall; }, [pendingCall]);
  // modo Tático: freezetime de 5s antes de cada round pra escolher a chamada
  const [tactical, setTactical] = useState(false);
  const [freeze, setFreeze] = useState(0);
  // impacto da última chamada: a call, a postura ativa, a chance que ENFRENTAVA
  // (odds antes do round) e se deu certo — pro card "decisão → resultado".
  const [lastCall, setLastCall] = useState<{ call: RoundCall; stance: Stance; won: boolean; round: number; odds: number } | null>(null);
  // placar das suas calls NESTE mapa (reseta a cada mapa): mostra o impacto
  // acumulado das suas decisões, não só do round atual.
  const [callRecord, setCallRecord] = useState<{ made: number; won: number }>({ made: 0, won: 0 });
  // log de TODAS as suas calls na série (sobrevive à troca de mapa) — alimenta o
  // RESUMO TÁTICO no fim: taxa de acerto, maior aposta que pegou, sequência etc.
  const decisionLog = useRef<{ mapIdx: number; call: RoundCall; stance: Stance; won: boolean; round: number; odds: number }[]>([]);
  const endedMapsRef = useRef<Set<number>>(new Set());
  const mapTransitionRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (mapTransitionRef.current !== null) window.clearTimeout(mapTransitionRef.current);
  }, []);

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

  // ao terminar a série, sobe pro topo pra mostrar o resultado e o botão Continuar.
  // Também trava o resultado na hora, evitando re-rolar ao sair antes de continuar.
  const decidedRef = useRef(false);
  useEffect(() => {
    if (!finished) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!decidedRef.current) { decidedRef.current = true; onDecided?.(buildSeries()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

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
  // fim de mapa: registra o resultado e prepara o próximo (ou encerra a série)
  const onMapEnded = (sim: MapSim) => {
    // O interval pode disparar novamente antes de o estado de pausa renderizar.
    // Sem esta trava, o mesmo mapa agendava duas transições e pulava o próximo.
    if (endedMapsRef.current.has(mapIdx)) return;
    endedMapsRef.current.add(mapIdx);
    resultsRef.current[mapIdx] = sim.result();
    if (seriesOver()) {
      const s = buildSeries();
      setSeries(s);
      setFinished(true);
    } else {
      const next = maps[mapIdx + 1];
      setPausedMsg(`${t('match.mapEnd')} ${mapIdx + 1}${next ? ` - ${t('match.preparing')} ${MAP_LABELS[next.map]}…` : '…'}`);
      // pausa maior pra dar tempo de ver como ficaram as stats do mapa
      mapTransitionRef.current = window.setTimeout(() => {
        setMapIdx((m) => m + 1);
        setTimeoutsLeft(TIMEOUTS_PER_MAP);
        setBoostRounds(0);
        setFreeze(0);
        setPausedMsg('');
        setLastCall(null);
        setCallRecord({ made: 0, won: 0 });
        mapTransitionRef.current = null;
      }, 3500);
    }
  };

  // loop automático (0.5x..4x). Desligado no modo Tático.
  useEffect(() => {
    if (finished || tactical) return;
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
        // chamada de round (rush/retake/force/save) vale para 1 round e some
        const callKind = callRef.current;
        const c = callKind ? ({ team: userIdx, kind: callKind } as const) : undefined;
        buysByRound.current[`${mapIdx}:${sim.round()}`] = sim.buys(); // compra antes do round
        const odds = c ? sim.peekWinProb(userIdx, stanceMod, c) : 0; // chance ANTES do round
        if (boostRounds - boostsUsed > 0) {
          sim.step(userIdx, stanceMod, c);
          boostsUsed++;
        } else {
          sim.step(null, stanceMod, c);
        }
        if (c && callKind) {
          const log = sim.roundLog();
          const won = log[log.length - 1] === userIdx;
          setLastCall({ call: callKind, stance: stanceRef.current, won, round: sim.round(), odds });
          setCallRecord((r) => ({ made: r.made + 1, won: r.won + (won ? 1 : 0) }));
          decisionLog.current.push({ mapIdx, call: callKind, stance: stanceRef.current, won, round: sim.round(), odds });
          callRef.current = null;
          setPendingCall(null);
        }
        mapEnded = sim.done();
      }
      if (boostsUsed > 0) setBoostRounds((b) => Math.max(0, b - boostsUsed));
      setTick((t) => t + 1);
      if (mapEnded) onMapEnded(sim);
    }, Math.min(SPEEDS[speedIdx].ms, 250));
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, mapIdx, boostRounds, pausedMsg, speedIdx, tactical]);

  // modo Tático: freezetime de 5s, depois joga UM round e repete
  useEffect(() => {
    if (!tactical || finished || pausedMsg) return;
    if (freeze > 0) {
      const id = window.setTimeout(() => setFreeze((f) => f - 1), 1000);
      return () => window.clearTimeout(id);
    }
    // freezetime acabou: joga exatamente um round
    const sim = getSim(mapIdx);
    const stanceMod = stanceRef.current !== 'default' ? { team: userIdx, mode: stanceRef.current } : undefined;
    const callKind = callRef.current;
    const c = callKind ? ({ team: userIdx, kind: callKind } as const) : undefined;
    const boost = boostRounds > 0;
    buysByRound.current[`${mapIdx}:${sim.round()}`] = sim.buys(); // compra antes do round
    const odds = c ? sim.peekWinProb(userIdx, stanceMod, c) : 0; // chance ANTES do round
    sim.step(boost ? userIdx : null, stanceMod, c);
    if (boost) setBoostRounds((b) => Math.max(0, b - 1));
    if (c && callKind) {
      const log = sim.roundLog();
      const won = log[log.length - 1] === userIdx;
      setLastCall({ call: callKind, stance: stanceRef.current, won, round: sim.round(), odds });
      setCallRecord((r) => ({ made: r.made + 1, won: r.won + (won ? 1 : 0) }));
      decisionLog.current.push({ mapIdx, call: callKind, stance: stanceRef.current, won, round: sim.round(), odds });
      callRef.current = null;
      setPendingCall(null);
    }
    setTick((t) => t + 1);
    if (sim.done()) onMapEnded(sim);
    else setFreeze(FREEZE_SECONDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tactical, freeze, finished, pausedMsg, mapIdx, boostRounds]);

  // narração: depois de cada round, olha o último round concluído e, se foi um
  // momento-chave (clutch/ace/multi-kill), gera a fala do "caster"
  useEffect(() => {
    if (finished) return;
    const sim = getSim(mapIdx);
    const log = sim.roundLog();
    const completed = log.length - 1;
    if (completed < 0) return;
    const key = `${mapIdx}:${completed}`;
    if (key === lastNarrated.current) return;
    lastNarrated.current = key;
    const ks = sim.killFeed().filter((k) => k.round === completed);
    const winner = log[completed];
    const mapWon = sim.done();
    let seriesPoint = false;
    if (mapWon) {
      const won = resultsRef.current.filter((r) => r && r.winner === winner).length;
      const need = Math.floor(maps.length / 2) + 1;
      seriesPoint = won + 1 >= need;
    }
    const n = narrateRound(ks, winner, teams, {
      round: completed,
      score: sim.score(),
      roundLog: log,
      buys: buysByRound.current[key],
      map: maps[Math.min(mapIdx, maps.length - 1)].map,
      mapWon,
      seriesPoint,
    });
    if (n) {
      setCaster(n);
      setMoments((m) => [...m, n]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, mapIdx, finished]);

  // revelação em etapas (a "parada da tensão"): mostra os beats um a um, com uma
  // pausa maior antes do desfecho. Depois de revelado tudo, a fala some sozinha.
  useEffect(() => {
    if (!caster) {
      setReveal(0);
      return;
    }
    const beats = caster.beats ?? [caster.text];
    setReveal(1);
    const timers: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      // pausa progressiva; a última (o desfecho) demora mais pra criar suspense
      const delay = i * 820 + (i === beats.length - 1 ? 360 : 0);
      timers.push(window.setTimeout(() => setReveal(i + 1), delay));
    }
    const total = beats.length * 820 + 360;
    timers.push(window.setTimeout(() => setCaster(null), Math.max(5200, total + 2600)));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [caster]);

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
    setPausedMsg(`⏸ ${t('match.tacticalTimeout')} - ${teams[userIdx].coach.nick} ${t('match.adjustsPlan')}`);
    window.setTimeout(() => setPausedMsg(''), 1400);
  };

  // `tick` força o re-render a cada round simulado; os valores abaixo são
  // leituras baratas do sim atual, recalculadas a cada render de propósito.
  void tick;
  const sim = getSim(mapIdx);
  const [sa, sb] = finished && series ? [0, 0] : sim.score();
  const roundLog = sim.roundLog();
  const buys = sim.buys();
  const myMoney = sim.money()[userIdx];
  const sides = sim.side(); // ['ct'|'t', 'ct'|'t'] do round atual
  const mySide = sides[userIdx];
  const mapsWon: [number, number] = [0, 0];
  for (const r of resultsRef.current) if (r) mapsWon[r.winner]++;

  // ── HUD DE DECISÃO (impacto AO VIVO) ──────────────────────────────────────
  // win-prob do round atual com/sem suas escolhas → o user VÊ o efeito antes de
  // jogar. peekWinProb é read-only e usa a MESMA fórmula do round real (sem drift).
  const oppIdx: 0 | 1 = userIdx === 0 ? 1 : 0;
  const myStanceArg = stance !== 'default' ? ({ team: userIdx, mode: stance } as const) : undefined;
  const myCallArg = pendingCall ? ({ team: userIdx, kind: pendingCall } as const) : undefined;
  const baseProb = finished ? 0 : sim.peekWinProb(userIdx);
  const decisionProb = finished ? 0 : sim.peekWinProb(userIdx, myStanceArg, myCallArg);
  const probDelta = decisionProb - baseProb;
  const enemyBuy = buys[oppIdx]; // leitura: compra provável do inimigo no round
  // leitura de eco do inimigo em texto (freezetime read estilo CS)
  const enemyRead =
    enemyBuy === 'eco' ? { txt: ct('Inimigo em ECO — force compensa'), tone: '#5ed88a' }
    : enemyBuy === 'force' ? { txt: ct('Inimigo em FORCE BUY — cuidado com agressão'), tone: '#e8c170' }
    : enemyBuy === 'pistol' ? { txt: ct('Round pistola — economia zerada'), tone: '#9fb4c8' }
    : { txt: ct('Inimigo em FULL BUY — round equilibrado'), tone: '#e58a8a' };
  // momentum atual: quem está embalado e o tamanho da sequência (medidor visual)
  const mom = finished ? { team: -1 as 0 | 1 | -1, len: 0 } : sim.momentum();

  const playerById = useMemo(() => {
    const players = new Map<string, TPlayer>();
    for (const team of teams) {
      for (const p of team.players) players.set(p.id, p);
    }
    return players;
  }, [teams]);

  const visibleKills = sim.killFeed().slice(-8).reverse();
  const currentMap = maps[Math.min(mapIdx, maps.length - 1)].map;

  // PLAYBOOK ao vivo: mostra, no round atual, se o esquema do seu time está
  // favorável ou arriscado naquele contexto (lado/pistol/half) — o mesmo fator
  // que pesa de verdade na simulação (effStrength), exposto pro jogador ver.
  const me = teams[userIdx];
  const pbLive = (() => {
    if (finished || !me.playbook || !me.playbookFam) return null;
    const r = sim.round();
    const lean = playbookLean(me.playbook, {
      side: mySide,
      isPistol: r === 0 || r === 12,
      secondHalf: r >= 12,
      lostLast: false,
      pickedOwnMap: maps[Math.min(mapIdx, maps.length - 1)].pickedBy === userIdx,
      eco: buys[userIdx] !== 'full',
    });
    return { label: lean.label, good: lean.delta >= 0 };
  })();

  // melhores momentos pro replay no fim (prioriza clutch/ace > virada/eco > multi)
  const MOMENT_RANK: Record<string, number> = { clutch: 6, ace: 6, matchpoint: 5, mappoint: 4, eco: 3, comeback: 3, multi: 2, pistol: 1 };
  const topMoments = useMemo(() => {
    const ranked = [...moments].sort((a, b) => (MOMENT_RANK[b.kind] ?? 0) - (MOMENT_RANK[a.kind] ?? 0));
    const seen = new Set<string>();
    const out: typeof ranked = [];
    let clutches = 0;
    for (const m of ranked) {
      if (seen.has(m.text)) continue;          // nunca repete a mesma fala
      if (m.kind === 'clutch' && clutches >= 2) continue; // no máx. 2 clutches no replay
      seen.add(m.text);
      if (m.kind === 'clutch') clutches++;
      out.push(m);
      if (out.length >= 4) break;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moments]);
  const highlightsTitle = lang === 'en' ? '🎬 Best moments' : lang === 'es' ? '🎬 Mejores momentos' : '🎬 Melhores momentos';

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          {phaseLabel} - {mdLabel}
          <span className="spacer" />
          {!finished && (
            <>
              <div className="seg" title={t('match.simSpeed')}>
                {SPEEDS.map((s, i) => (
                  <button key={s.label} className={!tactical && speedIdx === i ? 'active' : ''} onClick={() => { setTactical(false); setSpeedIdx(i); }}>
                    {s.label}
                  </button>
                ))}
                <button className={tactical ? 'active tactical-on' : ''} title={L.tacticalHint}
                  onClick={() => { setTactical((v) => !v); setFreeze(FREEZE_SECONDS); }}>
                  {L.tactical}
                </button>
              </div>
              <button className="timeout-btn" onClick={callTimeout} disabled={timeoutsLeft <= 0 || !!pausedMsg}>
                ⏸ {t('match.timeout')} ({timeoutsLeft})
              </button>
              <button className="btn ghost" onClick={skipAll}>
                {t('match.skipToResult')}
              </button>
            </>
          )}
          {finished && series && (
            <button className="btn gold" onClick={() => onFinish(series)}>
              ▶ {t('common.continue')}
            </button>
          )}
        </div>

        {!finished && caster && (() => {
          const beats = caster.beats ?? [caster.text];
          const shown = beats.slice(0, Math.max(1, reveal)).join(' ');
          const pending = reveal < beats.length;
          return (
            <div
              key={caster.text}
              className={`caster-line ${caster.teamIdx === userIdx ? 'mine' : 'opp'}${caster.big ? ' big' : ''}${pending ? ' building' : ''}`}
            >
              <span className="caster-mic">🎙️</span>
              <span className="caster-text">{shown}{pending ? <span className="caster-cursor">▍</span> : null}</span>
            </div>
          );
        })()}

        <div className="live-stage">
          <MapThumb map={currentMap} className="live-map-art" />
          <div className="live-score">
            <div className="team">
              <span className="team-flag left">
                <CoreFlag players={teams[0].players} />
              </span>
              <TeamBadge tag={teams[0].tag} colors={teams[0].colors} size={48} logoUrl={teams[0].logoUrl} />
              <span className="tn">
                {teams[0].name}
                {!finished && <span className={`side-pill ${sides[0]}`}>{sides[0].toUpperCase()}</span>}
                {!finished && userIdx === 0 && <span className="you-pill">{L.youPlay}</span>}
              </span>
              <span className="muted small">
                {t('common.maps')}: {mapsWon[0]}
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
                  <div className="mapname">{t('match.seriesOver')}</div>
                </>
              ) : (
                <>
                  <div className="digits">
                    <span className={sa > sb ? 'winning' : ''}>{sa}</span>
                    <span className="sep"> : </span>
                    <span className={sb > sa ? 'winning' : ''}>{sb}</span>
                  </div>
                  <div className="mapname">
                    {t('common.map')} {mapIdx + 1} - {MAP_LABELS[currentMap]}
                    {boostRounds > 0 ? ` · 📢 ${t('match.postTimeout')}` : ''}
                  </div>
                </>
              )}
            </div>
            <div className="team">
              <span className="team-flag right">
                <CoreFlag players={teams[1].players} />
              </span>
              <TeamBadge tag={teams[1].tag} colors={teams[1].colors} size={48} logoUrl={teams[1].logoUrl} />
              <span className="tn">
                {teams[1].name}
                {!finished && <span className={`side-pill ${sides[1]}`}>{sides[1].toUpperCase()}</span>}
                {!finished && userIdx === 1 && <span className="you-pill">{L.youPlay}</span>}
              </span>
              <span className="muted small">
                {t('common.maps')}: {mapsWon[1]}
                {!finished && ` · ${BUY_LABEL[buys[1]]}`}
              </span>
            </div>
          </div>
          {!finished && mom.team >= 0 && mom.len >= 2 && (
            <MomentumMeter team={mom.team as 0 | 1} len={mom.len} teams={teams} userIdx={userIdx} />
          )}
          {pbLive && (
            <div className="center" style={{ marginTop: 4 }}>
              <span className="mm-playbook">
                📋 {ct(PLAYBOOK_LABELS[me.playbook!])} · <span className={`pb-note ${pbLive.good ? 'good' : 'bad'}`}>{pbLive.label} {pbLive.good ? `▲ ${ct('favorável')}` : `▼ ${ct('arriscado')}`}</span>
              </span>
            </div>
          )}
          {pausedMsg && <div className="timeout-flash">{pausedMsg}</div>}
          {!finished && <KillFeed events={visibleKills} teams={teams} playerById={playerById} />}
        </div>

        {!finished && (
          <LiveScoreboard
            teams={teams}
            userIdx={userIdx}
            stats={sim.stats()}
            label={`${MAP_LABELS[currentMap]} · ${sa}:${sb}`}
          />
        )}

        {!finished && (
          <>
            {callsHint && (
              <div className="calls-hint">
                <span>🎮 <b>{ct('Você comanda a partida, não só assiste:')}</b> {ct('mude a')} <b>{ct('postura')}</b> {ct('aqui embaixo (agressivo/cauteloso) quando quiser, chame')} <b>{ct('timeouts')}</b> {ct('e ligue o')} <b>🎯 {ct('Tático')}</b> {ct('(no topo) pra dar as calls round a round — tudo muda o resultado de verdade.')}</span>
                <button className="calls-hint-x" onClick={dismissCallsHint}>{ct('entendi')} ✕</button>
              </div>
            )}
            <div className={`stance-bar${callsHint ? ' pulse' : ''}`}>
              <span className="stance-label">{t('match.planOf')} {teams[userIdx].tag}:</span>
              {STANCES.map((s) => {
                const fit = stanceFitCount(teams[userIdx].players, s.key);
                return (
                  <button
                    key={s.key}
                    className={`stance-btn${stance === s.key ? ' on' : ''}`}
                    title={t(s.hintKey)}
                    onClick={() => setStance(s.key)}
                  >
                    {s.icon} {t(s.labelKey)}
                    {s.key !== 'default' && <span className="stance-fit">{fit > 0 ? `+${fit}` : fit}</span>}
                  </button>
                );
              })}
            </div>
            <div className="style-roster">
              {teams[userIdx].players.map((p) => {
                const ps = p.playstyle ?? derivePlaystyle(p.role);
                const rel = stanceRelation(ps, stance);
                return (
                  <span key={p.id} className={`style-chip ${rel}`} title={`${p.nick} — ${ct(PLAYSTYLE_LABELS[ps])}`}>
                    {PLAYSTYLE_ICONS[ps]} {p.nick}
                    {rel === 'buff' && <span className="sc-tag up">{t('match.valued')}</span>}
                    {rel === 'nerf' && <span className="sc-tag down">{t('match.outOfPlan')}</span>}
                  </span>
                );
              })}
            </div>
            {tactical && (
              <div className={`freeze-bar${freeze > 0 ? ' active' : ''}`}>
                {freeze > 0 ? (
                  <>
                    <span className="freeze-count">{L.freezetime} {freeze}s</span>
                    <span className="muted small">{L.chooseCall}</span>
                    <span className="spacer" />
                    <span className={`side-pill big ${mySide}`}>{mySide.toUpperCase()}</span>
                    <button className="btn gold small" onClick={() => setFreeze(0)}>{L.playRound}</button>
                  </>
                ) : (
                  <span className="muted small">{ct('simulando round…')}</span>
                )}
              </div>
            )}
            {/* HUD DE DECISÃO — win-prob ao vivo + impacto da escolha + leitura do inimigo */}
            {tactical && !finished && (
              <div
                style={{
                  display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px',
                  background: 'var(--em-panel, #12161e)', border: '1px solid var(--em-border, #2a3340)',
                  borderRadius: 8, margin: '8px 0',
                }}
              >
                {/* barra de probabilidade do round */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--em-muted, #8a99ab)', minWidth: 96 }}>
                    {ct('Chance do round')}
                  </span>
                  <div style={{ flex: 1, height: 14, borderRadius: 7, overflow: 'hidden', position: 'relative', background: 'rgba(229,138,138,0.25)' }}>
                    <div style={{
                      position: 'absolute', inset: 0, width: `${Math.round(decisionProb * 100)}%`,
                      background: decisionProb >= 0.5 ? 'linear-gradient(90deg,#3a8f5a,#5ed88a)' : 'linear-gradient(90deg,#8f5a3a,#e8a93b)',
                      transition: 'width .25s ease',
                    }} />
                    <span style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 900, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                      fontFamily: '"JetBrains Mono", monospace',
                    }}>
                      {Math.round(decisionProb * 100)}%
                    </span>
                  </div>
                  {/* delta da decisão */}
                  {Math.abs(probDelta) >= 0.005 && (
                    <span style={{
                      fontSize: '0.74rem', fontWeight: 900, fontFamily: '"JetBrains Mono", monospace',
                      color: probDelta > 0 ? '#5ed88a' : '#e58a8a', minWidth: 52, textAlign: 'right',
                    }}>
                      {probDelta > 0 ? '▲ +' : '▼ '}{Math.round(probDelta * 100)}%
                    </span>
                  )}
                </div>
                {/* leitura do inimigo (freezetime read) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: enemyRead.tone, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                    📡 {BUY_LABEL[enemyBuy]}
                  </span>
                  <span style={{ color: enemyRead.tone, fontStyle: 'italic' }}>{enemyRead.txt}</span>
                </div>
              </div>
            )}
            {lastCall && (
              <DecisionImpactCard
                key={`${lastCall.round}-${lastCall.call}`}
                lastCall={lastCall}
                t={t}
              />
            )}
            <div className="call-bar">
              <span className="call-label">
                <span className={`side-pill ${mySide}`}>{mySide.toUpperCase()}</span>{' '}
                {t('match.roundCall')} <span className="call-money">💵 ${myMoney.toLocaleString()}</span>
                {callRecord.made > 0 && (
                  <span style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--em-muted, #8a99ab)' }}>
                    · {ct('calls')}:{' '}
                    <b style={{ color: callRecord.won * 2 >= callRecord.made ? '#5ed88a' : '#e8c170' }}>
                      {callRecord.won}/{callRecord.made} ✓
                    </b>
                  </span>
                )}
              </span>
              {CALLS.map((c) => (
                <button
                  key={c.key}
                  className={`call-btn${pendingCall === c.key ? ' armed' : ''}`}
                  title={t(c.hintKey)}
                  disabled={!!pausedMsg}
                  onClick={() => setPendingCall(pendingCall === c.key ? null : c.key)}
                >
                  {c.icon} {t(c.labelKey)}
                </button>
              ))}
              {pendingCall && <span className="call-armed-tag">{t('match.callArmed')}</span>}
            </div>
          </>
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
                {m.pickedBy >= 0 ? ` (${t('match.pick')} ${teams[m.pickedBy as 0 | 1].tag})` : ` (${t('match.decider')})`}{' '}
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

      {finished && series && topMoments.length > 0 && (
        <div className="panel highlights-panel fade-in">
          <div className="panel-head">{highlightsTitle}</div>
          <div className="panel-body">
            {topMoments.map((m, i) => (
              <div key={i} className={`caster-line ${m.teamIdx === userIdx ? 'mine' : 'opp'}${m.big ? ' big' : ''}`}>
                <span className="caster-mic">🎙️</span>
                <span className="caster-text">{m.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {finished && series && (
        <DecisionRecapPanel decisions={decisionLog.current} series={series} maps={maps} teams={teams} userIdx={userIdx} />
      )}

      {finished && series && <InsightPanel series={series} teams={teams} userIdx={userIdx} />}

      {finished && series && (
        <>
          <Scoreboard series={series} teams={teams} />
          {/* Botões de broadcast 2D por mapa — T2.5. Abre o LiveCanvasGame em
              modo autoplay com o radar/agentes do mapa selecionado. */}
          <div className="center" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', margin: '12px 0' }}>
            {series.maps.map((m, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setBroadcastMapIdx(i)}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.78rem',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: broadcastMapIdx === i ? 'var(--em-gold)' : 'transparent',
                  color: broadcastMapIdx === i ? '#1a1205' : 'var(--em-text)',
                  border: '1px solid var(--em-border)',
                  borderRadius: 3,
                }}
              >
                ▶ Broadcast 2D · {m.map}
              </button>
            ))}
          </div>
          {broadcastMapIdx != null && series.maps[broadcastMapIdx] && (
            <div style={{ margin: '16px 0' }}>
              <LiveCanvasGame
                mapResult={series.maps[broadcastMapIdx]}
                teams={teams}
                userIdx={userIdx}
                series={series}
                event={phaseLabel}
                autoplay
                onClose={() => setBroadcastMapIdx(null)}
              />
            </div>
          )}
          <div className="center" style={{ margin: '18px 0' }}>
            <button className="btn big" onClick={() => onFinish(series)}>
              {t('common.continue')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// MEDIDOR DE MOMENTO: barra que pende para o time embalado, com intensidade
// proporcional à sequência. Torna VISÍVEL como suas decisões viram "runs".
function MomentumMeter({ team, len, teams, userIdx }: {
  team: 0 | 1; len: number; teams: [TTeam, TTeam]; userIdx: 0 | 1;
}) {
  const mine = team === userIdx;
  const accent = mine ? '#5ed88a' : '#e58a8a';
  const grad = mine ? 'linear-gradient(90deg,#3a8f5a,#5ed88a)' : 'linear-gradient(90deg,#8f5a3a,#e58a8a)';
  const fillPct = Math.min(48, len * 9); // cada lado ocupa no máx. metade da barra
  const fires = '🔥'.repeat(Math.min(3, len - 1));
  return (
    <div className="center" style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 360, margin: '0 auto' }}>
        <span style={{ fontSize: '0.66rem', fontWeight: 800, opacity: team === 0 ? 1 : 0.4, fontFamily: '"JetBrains Mono", monospace' }}>{teams[0].tag}</span>
        <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.18)' }} />
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            ...(team === 0 ? { right: '50%' } : { left: '50%' }),
            width: `${fillPct}%`, background: grad, transition: 'width .3s ease',
          }} />
        </div>
        <span style={{ fontSize: '0.66rem', fontWeight: 800, opacity: team === 1 ? 1 : 0.4, fontFamily: '"JetBrains Mono", monospace' }}>{teams[1].tag}</span>
      </div>
      <div style={{ fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.5px', color: accent, marginTop: 2 }}>
        {fires} {ct('EMBALO')} {teams[team].tag} · {len} {ct('rounds seguidos')}
      </div>
    </div>
  );
}

// CARD DE IMPACTO DA DECISÃO: cruza a chamada + postura + a CHANCE que enfrentava
// com o resultado real. É o "ver o impacto da decisão" — não só deu/não deu certo,
// mas se foi aposta corajosa, favoritismo confirmado ou tropeço.
function DecisionImpactCard({ lastCall, t }: {
  lastCall: { call: RoundCall; stance: Stance; won: boolean; round: number; odds: number };
  t: (k: string) => string;
}) {
  const cc = CALLS.find((c) => c.key === lastCall.call)!;
  const st = STANCES.find((s) => s.key === lastCall.stance);
  const pct = Math.round(lastCall.odds * 100);
  const won = lastCall.won;
  const verdict = won
    ? lastCall.odds < 0.4 ? ct('Aposta arriscada que PEGOU! 🎯')
      : lastCall.odds >= 0.62 ? ct('Favoritismo confirmado.')
      : ct('Boa leitura — deu certo.')
    : lastCall.odds >= 0.62 ? ct('Você era favorito e tropeçou.')
      : lastCall.odds < 0.4 ? ct('Aposta difícil — não pegou.')
      : ct('Não foi dessa vez.');
  const accent = won ? '#5ed88a' : '#e58a8a';
  return (
    <div
      className="fade-in"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', margin: '8px 0',
        borderRadius: 8, background: won ? 'rgba(94,216,138,0.08)' : 'rgba(229,138,138,0.08)',
        border: `1px solid ${won ? 'rgba(94,216,138,0.35)' : 'rgba(229,138,138,0.35)'}`,
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <div style={{ fontSize: '1.8rem', lineHeight: 1, color: accent }}>{won ? '✓' : '✗'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--em-muted,#8a99ab)' }}>
            {ct('SUA DECISÃO')} · R{lastCall.round}
          </span>
          <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>{cc.icon} {t(cc.labelKey)}</span>
          {st && lastCall.stance !== 'default' && (
            <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', fontWeight: 700 }}>
              {st.icon} {t(st.labelKey)}
            </span>
          )}
          <span style={{ fontSize: '0.7rem', color: 'var(--em-muted,#8a99ab)', fontFamily: '"JetBrains Mono", monospace' }}>
            ({ct('tinha')} {pct}%)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 900, color: accent }}>
            {won ? ct('ROUND VENCIDO') : ct('ROUND PERDIDO')}
          </span>
          <span style={{ fontSize: '0.74rem', color: 'var(--em-text,#d6deea)', fontStyle: 'italic' }}>— {verdict}</span>
        </div>
      </div>
    </div>
  );
}

// rating ao vivo (estilo HLTV) a partir da linha acumulada do jogador
function liveRating(line?: PlayerLine): number {
  if (!line || line.rounds < 1) return 1.0;
  const r = line.rounds;
  const kpr = line.kills / r, dpr = line.deaths / r, apr = line.assists / r;
  const kast = line.kastRounds / r, adr = line.dmg / r;
  const impact = Math.max(0, 2.13 * kpr + 0.42 * apr - 0.41);
  return Math.max(0, 0.0073 * kast * 100 + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587);
}

// placar ao vivo com K/D/A e rating subindo round a round (e congela ao fim do mapa)
function LiveScoreboard({ teams, userIdx, stats, label }: {
  teams: [TTeam, TTeam];
  userIdx: 0 | 1;
  stats: Record<string, PlayerMapStats>;
  label?: string;
}) {
  const Side = ({ team, idx }: { team: TTeam; idx: 0 | 1 }) => {
    const rows = team.players.map((p) => {
      const line = stats[p.id]?.both;
      return { p, line, rating: liveRating(line) };
    });
    const avg = rows.reduce((a, x) => a + x.rating, 0) / Math.max(1, rows.length);
    const sorted = [...rows].sort((a, b) => b.rating - a.rating);
    const top = sorted[0]?.rating ?? 0;
    return (
      <div className={`lsb-team${idx === userIdx ? ' mine' : ''}`}>
        <div className="lsb-head">
          <TeamBadge tag={team.tag} colors={team.colors} size={20} logoUrl={team.logoUrl} />
          <span className="lsb-tname">{team.name}</span>
          {idx === userIdx && <span className="you-pill">{ct('VOCÊ')}</span>}
          <span className="spacer" />
          <span className="lsb-avg">{avg.toFixed(2)}</span>
        </div>
        {rows.map(({ p, line, rating }) => (
          <div key={p.id} className="lsb-row">
            <PlayerAvatar nick={p.nick} size={26} />
            <span className="lsb-nick"><Flag cc={p.country} /> {p.nick}</span>
            <span className={`lsb-rating${rating === top && rating > 0 ? ' best' : ''}`}>{rating.toFixed(2)}</span>
            <span className="lsb-kda">{line?.kills ?? 0}/{line?.deaths ?? 0}/{line?.assists ?? 0}</span>
          </div>
        ))}
      </div>
    );
  };
  return (
    <div className="live-scoreboard">
      <Side team={teams[0]} idx={0} />
      <div className="lsb-vs">{label ?? 'VS'}</div>
      <Side team={teams[1]} idx={1} />
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
  const { t } = useLang();
  return (
    <div className="killfeed2">
      <div className="kf-head">
        <span>{t('match.killfeed')}</span>
        <span>
          <span style={{ color: TEAM_FEED_COLORS[0] }}>{teams[0].tag}</span>
          {' · '}
          <span style={{ color: TEAM_FEED_COLORS[1] }}>{teams[1].tag}</span>
        </span>
      </div>
      <div className="kf2-list">
        {events.length === 0 && <div className="kf2-row empty">{t('match.waitingFirstContact')}</div>}
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
                <span className="hs" title={t('match.headshot')}>
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

// RESUMO TÁTICO DA SÉRIE: payoff das decisões do jogador. Taxa de acerto das
// calls, maior aposta que pegou (vitória com a menor chance), tropeço (derrota
// sendo favorito), maior sequência que VOCÊ engatou e quebra por mapa. É o
// "ver o impacto acumulado" — fecha o ciclo do sistema de decisões.
function DecisionRecapPanel({ decisions, series, maps, userIdx }: {
  decisions: { mapIdx: number; call: RoundCall; stance: Stance; won: boolean; round: number; odds: number }[];
  series: SeriesResult;
  maps: { map: MapId; pickedBy: 0 | 1 | -1 }[];
  teams: [TTeam, TTeam];
  userIdx: 0 | 1;
}) {
  // maior sequência de rounds seguidos que VOCÊ engatou na série
  let bestRun = 0;
  for (const m of series.maps) {
    let run = 0;
    for (const w of m.roundLog) {
      if (w === userIdx) { run++; if (run > bestRun) bestRun = run; }
      else run = 0;
    }
  }

  const made = decisions.length;
  if (made === 0) {
    return (
      <div className="panel fade-in">
        <div className="panel-head">🎯 {ct('Resumo tático')}</div>
        <div className="panel-body">
          <div className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
            {ct('Você não deu nenhuma call nesta série — assistiu no automático.')}{' '}
            {ct('Ligue o')} <b>🎯 {ct('Tático')}</b> {ct('no topo da próxima partida pra comandar round a round: postura, timeouts e chamadas mudam o resultado de verdade.')}
          </div>
          {bestRun >= 3 && (
            <div style={{ marginTop: 10, fontSize: '0.82rem' }}>🔥 {ct('Maior sequência da série')}: <b style={{ color: '#5ed88a' }}>{bestRun} {ct('rounds seguidos')}</b></div>
          )}
        </div>
      </div>
    );
  }

  const won = decisions.filter((d) => d.won).length;
  const rate = won / made;
  const rateColor = rate >= 0.6 ? '#5ed88a' : rate >= 0.4 ? '#e8c170' : '#e58a8a';
  const bestCall = decisions.filter((d) => d.won).sort((a, b) => a.odds - b.odds)[0]; // maior upset chamado
  const worstCall = decisions.filter((d) => !d.won).sort((a, b) => b.odds - a.odds)[0]; // favorito que tropeçou
  const perMap = series.maps.map((m, i) => {
    const ds = decisions.filter((d) => d.mapIdx === i);
    return { i, map: maps[Math.min(i, maps.length - 1)].map, made: ds.length, won: ds.filter((d) => d.won).length, score: m.score };
  }).filter((r) => r.made > 0);
  const icon = (k: RoundCall) => CALLS.find((x) => x.key === k)!.icon;
  const verdict = rate >= 0.65 ? ct('Leitura de jogo afiada — suas calls decidiram.')
    : rate >= 0.45 ? ct('Calls equilibradas: acertou tanto quanto errou.')
    : ct('As apostas não pegaram dessa vez — ajuste a leitura.');

  return (
    <div className="panel fade-in">
      <div className="panel-head">🎯 {ct('Resumo tático')} — {ct('suas decisões')}</div>
      <div className="panel-body">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: rateColor, fontFamily: '"JetBrains Mono", monospace', lineHeight: 1 }}>{won}/{made}</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: rateColor }}>{Math.round(rate * 100)}% {ct('das calls deram certo')}</span>
          <span className="spacer" />
          {bestRun >= 3 && <span style={{ fontSize: '0.82rem' }}>🔥 {ct('maior sequência')}: <b style={{ color: '#5ed88a' }}>{bestRun}</b></span>}
        </div>
        <div style={{ fontSize: '0.82rem', fontStyle: 'italic', color: 'var(--em-text,#d6deea)', marginBottom: 12 }}>{verdict}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, marginBottom: 12 }}>
          {bestCall && bestCall.odds < 0.55 && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(94,216,138,0.08)', border: '1px solid rgba(94,216,138,0.3)' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--em-muted,#8a99ab)' }}>{ct('Melhor aposta')}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, marginTop: 2 }}>{icon(bestCall.call)} R{bestCall.round} · {ct('tinha')} {Math.round(bestCall.odds * 100)}% → <span style={{ color: '#5ed88a' }}>{ct('PEGOU')}</span></div>
            </div>
          )}
          {worstCall && worstCall.odds >= 0.5 && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(229,138,138,0.08)', border: '1px solid rgba(229,138,138,0.3)' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--em-muted,#8a99ab)' }}>{ct('Tropeço')}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, marginTop: 2 }}>{icon(worstCall.call)} R{worstCall.round} · {ct('era favorito')} ({Math.round(worstCall.odds * 100)}%) → <span style={{ color: '#e58a8a' }}>{ct('perdeu')}</span></div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {perMap.map((r) => {
            const mr = r.won / r.made;
            const c = mr >= 0.6 ? '#5ed88a' : mr >= 0.4 ? '#e8c170' : '#e58a8a';
            return (
              <div key={r.i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem' }}>
                <span style={{ minWidth: 90, fontWeight: 700 }}>{MAP_LABELS[r.map]}</span>
                <span style={{ color: 'var(--em-muted,#8a99ab)', fontFamily: '"JetBrains Mono", monospace' }}>{r.score[0]}:{r.score[1]}</span>
                <span className="spacer" />
                <span style={{ color: c, fontWeight: 800, fontFamily: '"JetBrains Mono", monospace' }}>{r.won}/{r.made} ✓</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InsightPanel({ series, teams, userIdx }: { series: SeriesResult; teams: [TTeam, TTeam]; userIdx: 0 | 1 }) {
  const { t } = useLang();
  const insight = useMemo(() => analyzeSeries(series, teams, userIdx), [series, teams, userIdx]);
  return (
    <div className="panel insight-panel fade-in">
      <div className="panel-head">{t('match.seriesAnalysis')}</div>
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
