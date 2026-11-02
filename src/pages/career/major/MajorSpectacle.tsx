// [Major espetáculo] A camada de espetáculo da aba Major: abertura animada,
// "dias de evento" com clima de LAN, momento da sua partida (eliminação,
// decider, walkout, contagem da final), pick'em e a chave navegável.
// Só apresentação: lê o Tournament que o motor resolveu, não decide nada.
import { useEffect, useMemo, useState } from 'react';
import { setOverlayHold } from '../../../state/overlayHold';
import { majorName } from '../../../data/tournaments';
import { eventHost } from '../../../engine/mundo/circuito';
import { userPairing } from '../../../engine/swiss';
import type { Pairing, Tournament, TTeam } from '../../../types';
import { Arena, Trophy } from './Art';
import { markSeen, play, seenOnce, useReducedMotion } from './audio';
import { mt } from './i18n';
import { eventDay, momentOf, segmentStages, swissBoard, titleOdds, type HistoryItem, type Moment, type PickemGrade } from './logic';
import { Countdown, PlayoffTreeView, SoundToggle, SwissBoardView, TeamChip, Walkout, teamLookup, type TeamOf } from './parts';
import './major.css';

export interface MajorShowSave {
  org?: { name: string; tag: string } | null;
  split: number;
  majorStage?: number;
  majorUserStage?: number;
  majorSeed2?: TTeam[];
  majorSeed3?: TTeam[];
}

const stageName = (n: number) => (n === 0 ? 'RMR' : n >= 4 ? 'Champions Stage' : `Stage ${n}`);
const pct = (p: number) => (p > 0 && p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);

function useOdds(t: Tournament, save: MajorShowSave) {
  const st = save.majorStage ?? 1;
  return useMemo(() => {
    const later = st === 0 ? [] : st === 1 ? [save.majorSeed2 ?? [], save.majorSeed3 ?? []] : st === 2 ? [save.majorSeed3 ?? []] : [];
    if (st === 0) return null; // RMR: a vaga é regional, a chance de título não faz sentido ainda
    const alive = t.phase !== 'swiss' && t.phase !== 'done' ? t.pairings.flatMap((p) => [p.a, p.b]) : undefined;
    return titleOdds({
      teams: t.teams.map((x) => ({ id: x.id, s: x.strength, w: x.wins, l: x.losses, status: x.status })),
      phase: t.phase, stageOnly: !!t.stageOnly,
      laterSeeds: later.map((g) => g.map((x) => ({ id: x.id, s: x.strength }))),
      bracketAlive: alive,
    }, 'user', 900, `${t.name}:${t.phase}:${t.swissRound}`);
  }, [t, st, save.majorSeed2, save.majorSeed3]);
}

const MOMENT_COPY: Record<Moment, { kicker: string; line: string }> = {
  opener: { kicker: 'Abertura', line: 'MD1 para abrir o caminho. Ninguém ganha o Major hoje, mas dá pra perder o ritmo.' },
  elimination: { kicker: 'Elimination match', line: 'Perdeu, voltou pra casa. MD3 com a temporada em jogo.' },
  decider: { kicker: 'Decider 2-2', line: 'Tudo ou nada: quem vencer avança, quem perder arruma as malas.' },
  advancement: { kicker: 'Jogo da vaga', line: 'Uma vitória e o time está no próximo stage.' },
  quarters: { kicker: 'Quartas de final', line: 'Arena cheia, mata-mata MD3. Os times sobem ao palco.' },
  semis: { kicker: 'Semifinal', line: 'A uma série da grande final. O palco treme.' },
  final: { kicker: 'Grande final', line: 'MD5 pelo troféu. Tudo o que a temporada construiu cabe nesta série.' },
};

export function MajorOpening({ t, save, teamOf, odds, onClose }: {
  t: Tournament; save: MajorShowSave; teamOf: TeamOf; odds: ReturnType<typeof titleOdds> | null; onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const st = save.majorStage ?? 1;
  const name = majorName(save.split);
  const host = eventHost(name, 1);
  const favs = odds?.favorites.filter((f) => f.id !== 'user').slice(0, 3) ?? [...t.teams].filter((x) => !x.isUser).sort((a, b) => b.strength - a.strength).slice(0, 3).map((x) => ({ id: x.id, p: 0 }));
  useEffect(() => { play('intro'); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className={`mj-open${reduced ? ' still' : ''}`} role="dialog" aria-modal="true" aria-label={`${mt('Abertura do')} ${name}`}>
      <Arena className="mj-open-arena" />
      <div className="mj-open-card">
        <p className="mj-open-kicker mj-in" style={{ animationDelay: '0.1s' }}>{mt('Road to Major apresenta')}</p>
        <h2 className="mj-open-title mj-in" style={{ animationDelay: '0.35s' }}>{name}</h2>
        <p className="mj-open-sub mj-in" style={{ animationDelay: '0.6s' }}>
          <b>{stageName(st)}</b> · {host.venue || mt('LAN')} {host.cc && <span className="mj-cc">{host.cc.toUpperCase()}</span>} · {t.teams.length} {mt('times')}
        </p>
        <div className="mj-open-grid">
          <section className="mj-in" style={{ animationDelay: '0.9s' }}>
            <h3>{mt('Formato')}</h3>
            <p>{t.stageOnly ? mt('Suíço: 3 vitórias classificam, 3 derrotas eliminam. Aberturas MD1, jogos de vaga e de eliminação MD3.') : mt('Mata-mata MD3 com 8 times. Grande final MD5.')}</p>
          </section>
          <section className="mj-in" style={{ animationDelay: '1.15s' }}>
            <h3>{mt('Favoritos')}</h3>
            <ol className="mj-favs">
              {favs.map((f) => <li key={f.id}><TeamChip team={teamOf(f.id)} /> <span>{teamOf(f.id).name}</span>{f.p > 0 && <b>{pct(f.p)}</b>}</li>)}
            </ol>
          </section>
          <section className="mj-in mj-open-you" style={{ animationDelay: '1.4s' }}>
            <h3>{mt('Sua chance')}</h3>
            {odds ? (
              <div className="mj-odds">
                <div><b>{pct(odds.title)}</b><small>{mt('de título')}</small></div>
                <div><b>{pct(odds.playoffs)}</b><small>{t.stageOnly ? mt('de chegar aos playoffs') : mt('vivo no mata-mata')}</small></div>
              </div>
            ) : <p>{mt('No RMR só a vaga importa: os melhores do regional vão ao Stage 1.')}</p>}
            <small className="mj-muted">{mt('Calculada pela força dos elencos (a mesma régua do VRS), simulando o que falta do Major.')}</small>
          </section>
        </div>
        <button type="button" className="mj-open-go mj-in" style={{ animationDelay: '1.7s' }} onClick={onClose} autoFocus>
          {mt('Entrar na arena')}
        </button>
      </div>
    </div>
  );
}

export function MajorSpectacle({ majorT: t, save, history, grade, onPick, onOpenSeries }: {
  majorT: Tournament; save: MajorShowSave; history: HistoryItem[]; grade: PickemGrade;
  onPick: (key: string, teamId: string) => void; onOpenSeries?: (p: Pairing) => void;
}) {
  const st = save.majorStage ?? 1;
  const entered = save.majorUserStage ?? 1;
  const org = save.org?.name ?? '';
  const openKey = `open:${org}:${save.split}:${st}`;
  const [opening, setOpening] = useState(() => !seenOnce(openKey));
  const [lastKey, setLastKey] = useState(openKey);
  if (lastKey !== openKey) { setLastKey(openKey); setOpening(!seenOnce(openKey)); }
  const closeOpening = () => { markSeen(openKey); setOpening(false); };
  // [integração] tour/Novidades esperam a abertura fechar
  useEffect(() => { setOverlayHold('major-open', opening); return () => setOverlayHold('major-open', false); }, [opening]);

  const teamOf = useMemo(() => teamLookup(t.teams, save.majorSeed2, save.majorSeed3), [t.teams, save.majorSeed2, save.majorSeed3]);
  const odds = useOdds(t, save);
  const host = eventHost(majorName(save.split), 1);

  // stages navegáveis: cada segmento do histórico combinado + o stage ao vivo
  const segs = useMemo(() => {
    const done = segmentStages(history.slice(0, history.length - t.history.length));
    const stages = done.map((items, i) => ({ stage: entered + i, items }));
    stages.push({ stage: st, items: t.history });
    return stages.filter((s, i, arr) => arr.findIndex((x) => x.stage === s.stage) === i);
  }, [history, t.history, entered, st]);
  const [view, setView] = useState<number | null>(null);
  const shown = segs.find((s) => s.stage === (view ?? st)) ?? segs[segs.length - 1];
  const isLive = shown.stage === st;

  const up = userPairing(t);
  const moment = up ? momentOf(t, up) : null;
  const playoffs = moment === 'quarters' || moment === 'semis' || moment === 'final';
  const walkKey = up ? `walk:${org}:${save.split}:${up.label}:${up.a}:${up.b}` : '';
  const [walkTick, setWalkTick] = useState(0);
  const [walkSeen, setWalkSeen] = useState(() => (walkKey ? seenOnce(walkKey) : true));
  const [lastWalk, setLastWalk] = useState(walkKey);
  if (lastWalk !== walkKey) { setLastWalk(walkKey); setWalkSeen(walkKey ? seenOnce(walkKey) : true); }
  useEffect(() => {
    if (!playoffs || walkSeen || !walkKey || opening) return;
    play('walkout');
    markSeen(walkKey);
  }, [playoffs, walkSeen, walkKey, opening]);

  const day = eventDay(st, t);
  const userId = 'user';
  const meTeam = t.teams.find((x) => x.id === userId);
  const record = meTeam && t.stageOnly ? `${meTeam.wins}-${meTeam.losses}` : null;

  return (
    <div className="mj-show">
      {opening && <MajorOpening t={t} save={save} teamOf={teamOf} odds={odds} onClose={closeOpening} />}

      <header className="mj-hero">
        <Arena className="mj-hero-arena" />
        <div className="mj-hero-in">
          <div className="mj-hero-top">
            <span className="mj-live"><i aria-hidden="true" />{mt('AO VIVO')} · {mt('Dia')} {day}</span>
            <SoundToggle />
          </div>
          <h2 className="mj-hero-title">{majorName(save.split)}</h2>
          <p className="mj-hero-sub">
            {stageName(st)} · {host.venue || 'LAN'}{host.cc ? ` (${host.cc.toUpperCase()})` : ''}
            {record && <> · {mt('seu recorde')} <b className="mj-rec">{record}</b></>}
          </p>
          <div className="mj-hero-chips">
            {odds && <span className="mj-stat"><b>{pct(odds.title)}</b> {mt('chance de título')}</span>}
            {odds && t.stageOnly && <span className="mj-stat"><b>{pct(odds.playoffs)}</b> {mt('de playoffs')}</span>}
            <span className="mj-stat pk" title={mt("Pick'em: palpites nos outros jogos")}>
              <b>{grade.score}/{grade.total}</b> Pick'em{grade.streak >= 2 ? ` · ${grade.streak} ${mt('seguidos')}` : ''}{grade.pending ? ` · ${grade.pending} ${mt('em aberto')}` : ''}
            </span>
            <button type="button" className="mj-link" onClick={() => setOpening(true)}>{mt('Rever abertura')}</button>
          </div>
        </div>
      </header>

      {up && moment && (
        <section className={`mj-moment m-${moment}`} aria-live="polite">
          <div className="mj-moment-txt">
            <span className="mj-moment-kicker">{mt(MOMENT_COPY[moment].kicker)}</span>
            <div className="mj-moment-vs">
              <TeamChip team={teamOf(up.a)} big user={up.a === userId} />
              <span>vs</span>
              <TeamChip team={teamOf(up.b)} big user={up.b === userId} />
              <small>MD{up.bestOf ?? (moment === 'final' ? 5 : 3)}</small>
            </div>
            <p>{mt(MOMENT_COPY[moment].line)}</p>
          </div>
          {moment === 'final' && <Countdown label={mt('A grande final começa em')} />}
          {moment === 'final' && <Trophy size={64} className="mj-moment-trophy" />}
          {playoffs && (
            <div className="mj-moment-walk">
              <Walkout a={teamOf(up.a)} b={teamOf(up.b)} userSide={up.a === userId ? 0 : up.b === userId ? 1 : -1} replayKey={walkTick} />
              <button type="button" className="mj-link" onClick={() => { setWalkTick((x) => x + 1); setWalkSeen(true); play('walkout'); }}>{mt('Rever walkout')}</button>
            </div>
          )}
        </section>
      )}

      <section className="mj-board">
        <div className="mj-board-head">
          <h3>{mt('Chave ao vivo')}</h3>
          <div className="mj-tabs" role="tablist" aria-label={mt('Stages do Major')}>
            {segs.map((s) => (
              <button key={s.stage} type="button" role="tab" aria-selected={s.stage === shown.stage} className={s.stage === shown.stage ? 'on' : ''} onClick={() => setView(s.stage)}>
                {stageName(s.stage)}{s.stage === st && <i className="mj-dot" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
        {(shown.stage >= 4 || (isLive && !t.stageOnly)) ? (
          <PlayoffTreeView items={shown.items} live={isLive ? t.pairings : []} teamOf={teamOf} onOpen={onOpenSeries} grade={grade} stage={shown.stage} onPick={isLive ? onPick : undefined} />
        ) : (
          <SwissBoardView board={swissBoard(shown.items, isLive && t.phase === 'swiss' ? { round: t.swissRound, pairings: t.pairings } : undefined)} teamOf={teamOf} stage={shown.stage} grade={grade} onPick={isLive ? onPick : undefined} onOpen={onOpenSeries} />
        )}
        <p className="mj-muted mj-board-foot">{mt("Toque num time dos jogos em aberto para palpitar (Pick'em). Os acertos contam no fim do Major.")}</p>
      </section>
    </div>
  );
}
