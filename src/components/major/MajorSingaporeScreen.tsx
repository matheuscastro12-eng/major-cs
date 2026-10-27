// MODO MAJOR — PGL Major Singapore 2026: visão geral (datas, formato, os 32
// times e os favoritos), Jogar (as séries de um time na Sala, MajorPlay),
// Pick'em (8 classificados + 3-0/0-3 por stage + chave dos playoffs, salvo no
// navegador e compartilhável por link/PNG), Liga com amigos (MajorLeague) e
// simulação do Major inteiro pontuando o palpite. A lógica é toda de
// engine/majorSingapore.ts; os times vêm de data/major-singapore-2026.json.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, Download, Dices, Eraser, Sparkles, Trophy } from 'lucide-react';
import { lazy, Suspense } from 'react';
import data from '../../data/major-singapore-2026.json';
import {
  EXTREME_PICKS, bracketSides, decodePicks, emptyPicks, encodePicks, normalizePicks, pickPool, picksComplete,
  phaseOdds, scorePicks, simulateMajor, stageEntrants, titleOdds,
  type MajorData, type MajorPicks, type MajorResult, type MajorTeam, type StageNo,
} from '../../engine/majorSingapore';
import { randomSeed } from '../../engine/rng';
import { useLang } from '../../state/i18n';
import { shareUrl } from '../../state/shareLink';
import { postOnX } from '../../state/shareX';
import { track, trackShare } from '../../state/track';
import { Alert, Button, EmptyState, Panel, Skeleton, Tag } from '../ds';
import { PlayerAvatar } from '../ui';
import bo3Teams from '../../data/bo3-2026.json';
import { MajorResultView } from './MajorResultView';
import { MajorLeague } from './MajorLeague';
import { majorT, type MajorKey } from './majorStrings';
import { downloadDataUrl, drawMajorCard } from './majorShareCard';
import '../../styles/major.css';

const D = data as unknown as MajorData;
type Bo3Team = { id: string; players: { nick: string }[]; coach?: { nick: string } };
const ROSTERS = new Map((bo3Teams as unknown as Bo3Team[]).map((x) => [x.id, x]));
// a Sala (RtpRoundRoom + engine do RtP) só carrega quando a aba Jogar abre
const MajorPlay = lazy(() => import('./MajorPlay').then((m) => ({ default: m.MajorPlay })));
const STORE = 'rtm-major-sg-picks-v1';
const MAJOR_PATH = '/major-singapore';

type Tab = 'overview' | 'play' | 'pickem' | 'league' | 'sim';
const TABS: [Tab, MajorKey][] = [['overview', 'tabOverview'], ['play', 'tabPlay'], ['pickem', 'tabPickem'], ['league', 'tabLeague'], ['sim', 'tabSim']];

function loadMine(): MajorPicks {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return normalizePicks(D, { ...emptyPicks(), ...JSON.parse(raw) });
  } catch { /* storage indisponível ou lixo */ }
  return emptyPicks();
}

function hasLeagueParam(): boolean {
  try { return new URLSearchParams(window.location.search).has('liga'); } catch { return false; }
}

function readSharedCode(): string | null {
  try { return new URLSearchParams(window.location.search).get('p'); } catch { return null; }
}

export function MajorSingaporeScreen() {
  const { lang } = useLang();
  const t = majorT(lang);
  const teams = useMemo(() => new Map(D.teams.map((x) => [x.id, x])), []);
  const sharedCode = useMemo(() => readSharedCode(), []);
  const shared = useMemo(() => (sharedCode ? decodePicks(D, sharedCode) : null), [sharedCode]);
  const [tab, setTab] = useState<Tab>(shared ? 'pickem' : hasLeagueParam() ? 'league' : 'overview');
  const [mine, setMine] = useState<MajorPicks>(loadMine);
  const [viewShared, setViewShared] = useState(!!shared);
  const [sim, setSim] = useState<MajorResult | null>(null);
  const [copied, setCopied] = useState(false);
  const odds = useMemo(() => titleOdds(D, 1000), []);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(mine)); } catch { /* sem storage */ }
  }, [mine]);
  useEffect(() => { track('major_sg_view', { shared: shared ? 1 : 0 }); }, [shared]);

  const picks = viewShared && shared ? shared : mine;
  const readOnly = viewShared && !!shared;
  const update = (p: MajorPicks) => setMine(normalizePicks(D, p));

  const toggleExtreme = (kind: 'x30' | 'x03', stage: StageNo, id: string) => {
    if (readOnly) return;
    const i = stage - 1;
    const cur = mine[kind][i];
    const nextList = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < EXTREME_PICKS ? [...cur, id] : cur;
    const arr = [...mine[kind]] as MajorPicks['x30'];
    arr[i] = nextList;
    update({ ...mine, [kind]: arr });
  };
  const toggle = (stage: StageNo, id: string) => {
    if (readOnly) return;
    const k = `s${stage}` as 's1' | 's2' | 's3';
    const cur = mine[k];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 8 ? [...cur, id] : cur;
    update({ ...mine, [k]: next });
  };
  const pickWinner = (game: number, id: string) => {
    if (readOnly || !id) return;
    const bracket = [...mine.bracket];
    bracket[game] = id;
    update({ ...mine, bracket });
  };
  const autofill = () => {
    // favoritos = maior chance de título; mantém o que já foi escolhido
    const rank = (x: MajorTeam) => -(odds.get(x.id) ?? 0) * 1e4 + x.seed;
    let p = { ...mine };
    for (const st of [1, 2, 3] as StageNo[]) {
      const k = `s${st}` as 's1' | 's2' | 's3';
      const pool = pickPool(D, p, st).sort((a, b) => rank(a) - rank(b)).map((x) => x.id);
      const keep = p[k].filter((id) => pool.includes(id));
      p = normalizePicks(D, { ...p, [k]: [...keep, ...pool.filter((id) => !keep.includes(id))].slice(0, 8) });
    }
    const bracket = [...p.bracket];
    for (let g = 0; g < 7; g++) {
      const sides = bracketSides(D, { ...p, bracket })[g];
      if (!bracket[g] || !sides.includes(bracket[g])) {
        bracket[g] = [...sides].sort((a, b) => rank(teams.get(a)!) - rank(teams.get(b)!))[0];
      }
    }
    update({ ...p, bracket });
  };

  const complete = picksComplete(picks);
  const link = complete ? shareUrl(`${MAJOR_PATH}?p=${encodePicks(D, picks)}`, 'major-pickem') : '';
  const champName = teams.get(picks.bracket[6])?.name ?? '';
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); trackShare('major-pickem', 'copy'); setTimeout(() => setCopied(false), 1800); } catch { /* sem clipboard */ }
  };
  const saveImage = () => {
    const url = drawMajorCard(D, picks, {
      champion: t('champion'), qf: t('qf'), sf: t('sf'), final: t('final'),
      stage: (n) => `Stage ${n}`, foot: t('cardFoot'),
    });
    downloadDataUrl(url, 'pickem-major-singapore.png');
    track('major_sg_image', {});
  };

  return (
    <div className="msg">
      <header className="msg-hero">
        <div className="msg-hero__kicker">{t('title')}</div>
        <h1 className="msg-hero__title">{D.event.name}</h1>
        <p className="msg-hero__meta">{t('dates')} · {t('playoffsDates')}</p>
        <nav className="msg-tabs" role="tablist" aria-label={t('title')}>
          {TABS.map(([id, key]) => (
            <button key={id} role="tab" aria-selected={tab === id} className="msg-tab" onClick={() => setTab(id)}>
              {t(key)}
            </button>
          ))}
        </nav>
      </header>

      {D.event.status === 'projecao'
        ? <Alert tone="warn">{t('projection')}</Alert>
        : <Alert tone="info">{t('official')}</Alert>}

      {tab === 'overview' && <Overview t={t} odds={odds} onStart={() => setTab('pickem')} />}

      {tab === 'play' && (
        <Suspense fallback={<Skeleton height={240} />}>
          <MajorPlay t={t} />
        </Suspense>
      )}

      {tab === 'league' && <MajorLeague t={t} picks={mine} onEditPicks={() => setTab('pickem')} />}

      {tab === 'pickem' && (
        <div className="msg-stack">
          <PrizePanel t={t} />
          {sharedCode && !shared && <Alert tone="danger">{t('badLink')}</Alert>}
          {shared && (
            <Alert
              tone="info"
              action={viewShared
                ? <Button size="sm" variant="primary" onClick={() => { setMine(shared); setViewShared(false); }}>{t('useShared')}</Button>
                : <Button size="sm" onClick={() => setViewShared(true)}>{t('sharedBanner')}</Button>}
            >
              {viewShared ? t('sharedBanner') : ''}
              {viewShared && <> <button className="msg-link" onClick={() => setViewShared(false)}>{t('backToMine')}</button></>}
            </Alert>
          )}
          {!readOnly && (
            <div className="msg-toolbar">
              <Button size="sm" icon={<Sparkles size={16} aria-hidden />} onClick={autofill}>{t('auto')}</Button>
              <Button size="sm" variant="ghost" icon={<Eraser size={16} aria-hidden />} onClick={() => setMine(emptyPicks())}>{t('clear')}</Button>
            </div>
          )}
          {([1, 2, 3] as StageNo[]).map((st) => (
            <StagePicker key={st} stage={st} picks={picks} readOnly={readOnly} t={t} onToggle={(id) => toggle(st, id)} onExtreme={(k, id) => toggleExtreme(k, st, id)} />
          ))}
          <BracketPicker picks={picks} readOnly={readOnly} t={t} onPick={pickWinner} />
          <Panel title={t('share')} accent="gold">
            {complete ? (
              <div className="msg-share">
                <p className="msg-share__champ"><Trophy size={18} aria-hidden /> {t('champion')}: <strong>{champName}</strong></p>
                <div className="msg-toolbar">
                  <Button variant="primary" icon={copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} onClick={copyLink}>{copied ? t('copied') : t('copyLink')}</Button>
                  <Button icon={<Download size={16} aria-hidden />} onClick={saveImage}>{t('saveImage')}</Button>
                  <Button variant="ghost" onClick={() => postOnX('major-pickem', `${t('shareText')} ${champName} 🏆`, link)}>{t('postX')}</Button>
                </div>
              </div>
            ) : <p className="msg-muted">{t('incomplete')}</p>}
          </Panel>
        </div>
      )}

      {tab === 'sim' && (
        <SimView t={t} picks={mine} predictions={<Predictions t={t} />} result={sim} onRun={() => { setSim(simulateMajor(D, randomSeed())); track('major_sg_sim', {}); }} />
      )}
    </div>
  );
}

type T = (k: MajorKey) => string;

function TeamChip({ team, sub }: { team: MajorTeam; sub?: string }) {
  return (
    <span className="msg-team">
      <span className="msg-team__swatch" style={{ background: team.colors?.[1] ?? 'var(--c-ink-faint)' }} aria-hidden />
      <span className="msg-team__name">{team.name}</span>
      {sub && <span className="msg-team__sub">{sub}</span>}
    </span>
  );
}

function Overview({ t, odds, onStart }: { t: T; odds: Map<string, number>; onStart: () => void }) {
  const fav = [...D.teams].sort((a, b) => (odds.get(b.id) ?? 0) - (odds.get(a.id) ?? 0)).slice(0, 8);
  const groups: [string, MajorTeam[]][] = [
    ['Stage 3 · seeds 1–8', stageEntrants(D, 3)],
    ['Stage 2 · seeds 9–16', stageEntrants(D, 2)],
    ['Stage 1 · seeds 17–32', stageEntrants(D, 1)],
  ];
  return (
    <div className="msg-grid">
      <div className="msg-stack">
        <PrizePanel t={t} />
        <Panel title={t('formatTitle')}>
          <ol className="msg-format">
            <li>{t('formatS1')}</li>
            <li>{t('formatS2')}</li>
            <li>{t('formatS3')}</li>
            <li>{t('formatPO')}</li>
          </ol>
          <p className="msg-muted">{t('formatNote')}</p>
          <Button variant="primary" onClick={onStart}>{t('startPickem')}</Button>
        </Panel>
        <Panel title={t('favorites')}>
          <ol className="msg-odds">
            {fav.map((x) => {
              const pct = (odds.get(x.id) ?? 0) * 100;
              return (
                <li key={x.id}>
                  <TeamChip team={x} />
                  <span className="msg-odds__bar"><span style={{ transform: `scaleX(${Math.min(1, pct / 40)})` }} /></span>
                  <span className="msg-odds__pct">{pct.toFixed(1)}%</span>
                </li>
              );
            })}
          </ol>
        </Panel>
      </div>
      <Panel title={t('teamsTitle')}>
        {groups.map(([label, list]) => (
          <section key={label} className="msg-seedgroup">
            <h3 className="msg-seedgroup__title">{label}</h3>
            <ul className="msg-seedlist">
              {list.map((x) => (
                <li key={x.id}>
                  <span className="msg-seed">{x.seed}</span>
                  <TeamChip team={x} />
                  {!x.confirmed && <Tag className="msg-proj">{t('projected')}</Tag>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Panel>
      <Rosters t={t} />
    </div>
  );
}

function PrizePanel({ t }: { t: T }) {
  return (
    <Panel title={t('prizeTitle')} accent="gold">
      <p className="msg-prize"><Trophy size={18} aria-hidden /> <strong>{t('prizeText')}</strong></p>
      <p className="msg-muted">{t('prizeRules')}</p>
    </Panel>
  );
}

// elenco de cada time com as fotos do bo3.gg (locais) ou iniciais. O crédito
// "Fotos: bo3.gg" é o global do GameShell: não repetir aqui.
function Rosters({ t }: { t: T }) {
  return (
    <Panel title={t('rostersTitle')}>
      <ul className="msg-rosters">
        {[...D.teams].sort((a, b) => a.seed - b.seed).map((x) => {
          const r = x.bo3Id ? ROSTERS.get(x.bo3Id) : undefined;
          return (
            <li key={x.id} className="msg-roster">
              <TeamChip team={x} />
              <span className="msg-roster__players">
                {(r?.players ?? []).map((p) => (
                  <span key={p.nick} className="msg-roster__p"><PlayerAvatar nick={p.nick} size={34} /><small>{p.nick}</small></span>
                ))}
                {r?.coach && <span className="msg-roster__p is-coach"><PlayerAvatar nick={r.coach.nick} size={28} coach /><small>{t('coach')} {r.coach.nick}</small></span>}
                {!r && <small className="msg-muted">—</small>}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const PRED_RUNS = 2000;
function Predictions({ t }: { t: T }) {
  const rows = useMemo(() => phaseOdds(D, PRED_RUNS), []);
  const teams = new Map(D.teams.map((x) => [x.id, x]));
  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
  return (
    <Panel title={t('predTitle')}>
      <p className="msg-muted">{PRED_RUNS.toLocaleString()} {t('predNote')}</p>
      <div className="msg-pred-wrap">
        <table className="msg-pred">
          <thead><tr><th>{t('predTeam')}</th><th>Stage 1</th><th>Stage 2</th><th>Playoffs</th><th>{t('sf')}</th><th>{t('final')}</th><th>{t('predTitleCol')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><TeamChip team={teams.get(r.id)!} /></td>
                <td>{pct(r.s1)}</td><td>{pct(r.s2)}</td><td>{pct(r.playoffs)}</td><td>{pct(r.sf)}</td><td>{pct(r.final)}</td><td><strong>{pct(r.title)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function StagePicker({ stage, picks, readOnly, t, onToggle, onExtreme }: { stage: StageNo; picks: MajorPicks; readOnly: boolean; t: T; onToggle: (id: string) => void; onExtreme: (kind: 'x30' | 'x03', id: string) => void }) {
  const teams = new Map(D.teams.map((x) => [x.id, x]));
  const prev = stage === 1 ? 8 : (stage === 2 ? picks.s1 : picks.s2).length;
  const chosen = picks[`s${stage}` as 's1' | 's2' | 's3'];
  const pool = pickPool(D, picks, stage);
  return (
    <Panel title={`Stage ${stage} · ${t('pickStage')}`} actions={<span className={`msg-count${chosen.length === 8 ? ' is-full' : ''}`}>{chosen.length}/8 {t('picked')}</span>}>
      {prev < 8 ? <p className="msg-muted">{t('needPrev')}</p> : (
        <div className="msg-picks">
          {pool.map((x) => {
            const on = chosen.includes(x.id);
            return (
              <button
                key={x.id}
                className={`msg-pick${on ? ' is-on' : ''}`}
                aria-pressed={on}
                disabled={readOnly || (!on && chosen.length >= 8)}
                onClick={() => onToggle(x.id)}
              >
                <span className="msg-seed">{x.seed}</span>
                <TeamChip team={x} />
                {on && <Check size={16} className="msg-pick__check" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
      {prev >= 8 && chosen.length === 8 && (
        <div className="msg-extremes">
          <p className="msg-muted">{t('pickExtremeHint')}</p>
          {(['x30', 'x03'] as const).map((kind) => {
            const list = kind === 'x30' ? chosen : pool.map((x) => x.id).filter((id) => !chosen.includes(id));
            const on = picks[kind][stage - 1];
            return (
              <div key={kind} className="msg-extreme">
                <span className="msg-extreme__label">{t(kind === 'x30' ? 'pick30' : 'pick03')}</span>
                <div className="msg-chips">
                  {list.map((id) => {
                    const sel = on.includes(id);
                    return (
                      <button key={id} type="button" className={`msg-chip${sel ? ' is-on' : ''}`} aria-pressed={sel}
                        disabled={readOnly || (!sel && on.length >= EXTREME_PICKS)} onClick={() => onExtreme(kind, id)}>
                        {teams.get(id)?.tag ?? id}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function BracketPicker({ picks, readOnly, t, onPick }: { picks: MajorPicks; readOnly: boolean; t: T; onPick: (game: number, id: string) => void }) {
  const teams = new Map(D.teams.map((x) => [x.id, x]));
  const sides = bracketSides(D, picks);
  const col = (label: string, games: number[], cls: string) => (
    <div className={`msg-bcol ${cls}`}>
      <h3 className="msg-bcol__title">{label}</h3>
      {games.map((g) => (
        <div key={g} className="msg-game">
          {sides[g].map((id, s) => {
            const tm = teams.get(id);
            const won = !!id && picks.bracket[g] === id;
            return (
              <button key={s} className={`msg-slot${won ? ' is-won' : ''}`} disabled={readOnly || !id || !sides[g][0] || !sides[g][1]} aria-pressed={won} onClick={() => onPick(g, id)}>
                {tm ? <><span className="msg-seed">{tm.seed}</span><span className="msg-slot__name">{tm.name}</span></> : <span className="msg-slot__tbd">—</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
  const champ = teams.get(picks.bracket[6]);
  return (
    <Panel title={t('bracketTitle')}>
      {picks.s3.length < 8 ? <p className="msg-muted">{t('needS3')}</p> : (
        <div className="msg-bracket">
          {col(t('qf'), [0, 1, 2, 3], 'is-qf')}
          {col(t('sf'), [4, 5], 'is-sf')}
          {col(t('final'), [6], 'is-f')}
          <div className="msg-bcol is-champ">
            <h3 className="msg-bcol__title">{t('champion')}</h3>
            <div className={`msg-champ${champ ? ' is-set' : ''}`}>
              <Trophy size={22} aria-hidden />
              <span>{champ?.name ?? '—'}</span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function SimView({ t, picks, result, onRun, predictions }: { t: T; picks: MajorPicks; result: MajorResult | null; onRun: () => void; predictions: ReactNode }) {
  if (!result) {
    return <div className="msg-stack">{predictions}<EmptyState icon={<Dices size={28} />} title={t('simRun')} action={<Button variant="primary" onClick={onRun}>{t('simRun')}</Button>}>{t('simEmpty')}</EmptyState></div>;
  }
  const sc = picksComplete(picks) ? scorePicks(picks, result) : null;
  return (
    <div className="msg-stack">
      <div className="msg-toolbar">
        <Button variant="primary" icon={<Dices size={16} aria-hidden />} onClick={onRun}>{t('simAgain')}</Button>
      </div>
      {predictions}
      <Panel title={t('summaryTitle')}>
        {sc ? (
          <div className="msg-score">
            <span className="msg-score__big">{sc.points}<small>/{sc.max} {t('points')}</small></span>
            <div className="msg-summary">
              {[0, 1, 2].map((i) => (
                <p key={i}>
                  <strong>Stage {i + 1}</strong>
                  <span>{sc.stage[i]}/8</span>
                  <span>3-0 {sc.x30[i]}/{picks.x30[i].length || 0}</span>
                  <span>0-3 {sc.x03[i]}/{picks.x03[i].length || 0}</span>
                </p>
              ))}
              <p><strong>Playoffs</strong><span>{sc.playoff}/7</span></p>
            </div>
            {sc.champion && <Tag tone="achievement">{t('hitChampion')}</Tag>}
            <span className="msg-muted">{t('scoreRule')}</span>
          </div>
        ) : <p className="msg-muted">{t('noPicks')}</p>}
      </Panel>
      <MajorResultView t={t} result={result} picks={picks} />
    </div>
  );
}

