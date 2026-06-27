import { ct } from '../state/career-i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { draftSynergy } from '../engine/ratings';
import { aiChoice, applyVeto, currentStep, newVeto, vetoDone, vetoMaps, vetoOrder, type VetoState } from '../engine/veto';
import { generateAnalystReport } from '../engine/analystReport';
import type { Rng } from '../engine/rng';
import type { MapId, TTeam } from '../types';
import { MAP_LABELS, MAP_POOL, PLAYBOOK_LABELS } from '../types';
import { MapThumb } from './ui';
import { MatchBanner } from './flags';
import { TeamLineups } from './lineups';
import { AnalystReportCard } from './AnalystReportCard';
import { useLang } from '../state/i18n';
import { CareerIcon } from './career/CareerIcon';

interface Props {
  teams: [TTeam, TTeam]; // [a, b] - usuário pode ser 0 ou 1
  userIdx: 0 | 1;
  rng: Rng;
  phaseLabel: string;
  bestOf?: 1 | 3 | 5;
  mapRecord?: Record<string, { w: number; l: number }>;
  onDone: (maps: { map: MapId; pickedBy: 0 | 1 | -1 }[]) => void;
}

export function VetoScreen({ teams, userIdx, rng, phaseLabel, bestOf = 3, mapRecord = {}, onDone }: Props) {
  const { t } = useLang();
  const [veto, setVeto] = useState<VetoState>(() => newVeto(bestOf));
  const mdLabel = bestOf === 1 ? 'MD1' : bestOf === 5 ? 'MD5' : 'MD3';
  const timer = useRef<number | undefined>(undefined);

  const done = vetoDone(veto);
  const step = done ? null : currentStep(veto);
  const isUserTurn = step !== null && step.team === userIdx;

  // IA joga sozinha com um pequeno delay
  useEffect(() => {
    if (done || isUserTurn || step === null) return;
    timer.current = window.setTimeout(() => {
      setVeto((v) => (vetoDone(v) || currentStep(v).team === userIdx ? v : applyVeto(v, aiChoice(v, teams, rng))));
    }, 700);
    return () => window.clearTimeout(timer.current);
  }, [veto, done, isUserTurn, step, teams, rng, userIdx]);

  // recomendação por mapa do SEU ponto de vista
  const tendency = useMemo(() => {
    const me = teams[userIdx], opp = teams[userIdx === 0 ? 1 : 0];
    const out: Record<string, { kind: 'pick' | 'ban' | 'even'; edge: number }> = {};
    for (const m of MAP_POOL) {
      const rec = mapRecord[m] ?? { w: 0, l: 0 };
      const edge = (me.mapPrefs[m] ?? 0) - (opp.mapPrefs[m] ?? 0) + (rec.w - rec.l) * 0.6;
      out[m] = { kind: edge >= 1 ? 'pick' : edge <= -1 ? 'ban' : 'even', edge: Math.round(edge * 10) / 10 };
    }
    return out;
  }, [teams, userIdx, mapRecord]);

  const mapState = useMemo(() => {
    const state: Record<string, { kind: 'banned' | 'picked' | 'decider'; by: 0 | 1 | -1 } | undefined> = {};
    for (const s of veto.steps) {
      if (!s.map) continue;
      state[s.map] = {
        kind: s.action === 'ban' ? 'banned' : s.action === 'pick' ? 'picked' : 'decider',
        by: s.team,
      };
    }
    return state;
  }, [veto]);

  const click = (m: MapId) => {
    if (!isUserTurn || mapState[m]) return;
    setVeto((v) => applyVeto(v, m));
  };

  // Progresso: lista pré-definida de passos do MDx, com o atual marcado
  const order = useMemo(() => vetoOrder(bestOf), [bestOf]);
  const progress = order.map((o, i) => {
    const performed = veto.steps[i];
    return {
      index: i,
      action: o.action,
      team: o.team,
      done: !!performed,
      current: !done && i === veto.steps.length,
    };
  });

  return (
    <div className="veto-layout fade-in">
      <div className="em-stage-card em-veto-card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header sticky com estado + progresso */}
        <div className="em-veto-head">
          <div className="em-veto-head-row">
            <div className="em-veto-head-title">
              <span className="em-veto-kicker">{phaseLabel} · {mdLabel}</span>
              <span className="em-veto-title">{t('veto.title')}</span>
            </div>
            <div className="em-veto-status">
              {done ? (
                <span className="em-status em-status-ready">
                  <CareerIcon name="check" size={14} /> {t('veto.official')}
                </span>
              ) : isUserTurn ? (
                <span className={`em-status em-status-turn ${step!.action}`}>
                  <span className="em-pulse" />
                  <b>{t('veto.yourTurn')}</b>
                  <span className="em-status-sub">{step!.action === 'ban' ? t('veto.banAMap') : t('veto.pickAMap')}</span>
                </span>
              ) : (
                <span className="em-status em-status-wait">
                  <span className="em-spinner" />
                  {t('veto.waitingFor')} <b>{teams[step!.team as 0 | 1].name}</b>
                </span>
              )}
            </div>
          </div>

          {/* Barra de progresso dos passos */}
          <div className="em-veto-steps" aria-label="Progresso do veto">
            {progress.map((p) => {
              // o decider tem team === -1 (mapa automatico): teams[-1] é undefined
              // e quebrava com "Cannot read properties of undefined (reading 'tag')".
              const isDecider = p.team === -1;
              const teamTag = isDecider ? '★' : teams[p.team as 0 | 1].tag;
              const isUser = !isDecider && p.team === userIdx;
              const cls = `em-veto-step ${p.action}${p.done ? ' is-done' : ''}${p.current ? ' is-current' : ''}${isUser ? ' is-user' : ''}`;
              return (
                <span key={p.index} className={cls} title={`${teamTag} ${p.action}`}>
                  <span className="em-veto-step-tag">{p.action === 'decider' ? '★' : teamTag}</span>
                  <span className="em-veto-step-act">
                    {p.action === 'ban' ? t('veto.ban') : p.action === 'pick' ? t('veto.pick') : t('veto.decider')}
                  </span>
                </span>
              );
            })}
          </div>

          {/* Banner times */}
          <div className="em-veto-banner">
            <MatchBanner teamA={teams[0]} teamB={teams[1]} center={mdLabel} event={phaseLabel} sub={t('veto.title')} />
          </div>
        </div>

        {/* Grid de mapas */}
        <div className="em-veto-body">
          <div className={`em-veto-maps${isUserTurn ? (step!.action === 'ban' ? ' mode-ban' : ' mode-pick') : ''}`}>
            {MAP_POOL.map((m, i) => {
              const st = mapState[m];
              const selectable = isUserTurn && !st;
              return (
                <button
                  key={m}
                  type="button"
                  className={`em-mapcard${st ? ` is-dead is-${st.kind}` : ''}${selectable ? ' is-selectable' : ''}`}
                  onClick={() => click(m)}
                  disabled={!selectable && !st}
                  style={{ animationDelay: `${i * 36}ms` }}
                >
                  <MapThumb map={m} className="em-mapcard-img" />
                  <div className="em-mapcard-scrim" />
                  <div className="em-mapcard-name">{MAP_LABELS[m]}</div>
                  {!st && tendency[m] && (
                    <span className={`em-mapcard-tend tend-${tendency[m].kind}`} title={`${t('veto.tendency')}: ${tendency[m].edge >= 0 ? '+' : ''}${tendency[m].edge}`}>
                      <CareerIcon name={tendency[m].kind === 'pick' ? 'check' : tendency[m].kind === 'ban' ? 'x' : 'target'} size={11} />
                      {tendency[m].kind === 'pick' ? t('veto.tendPick') : tendency[m].kind === 'ban' ? t('veto.tendBan') : t('veto.tendEven')}
                    </span>
                  )}
                  {st && (
                    <span className={`em-mapcard-stamp stamp-${st.kind}`}>
                      <CareerIcon name={st.kind === 'banned' ? 'x' : st.kind === 'picked' ? 'check' : 'star'} size={14} />
                      <span>
                        {st.kind === 'banned' ? t('veto.ban') : st.kind === 'picked' ? `${t('veto.pick')} · ${teams[st.by as 0 | 1].tag}` : t('veto.decider')}
                      </span>
                    </span>
                  )}
                  {selectable && (
                    <span className="em-mapcard-hover">
                      <CareerIcon name={step!.action === 'ban' ? 'x' : 'check'} size={14} />
                      {step!.action === 'ban' ? t('veto.banAMap') : t('veto.pickAMap')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Log dos passos executados */}
          {veto.steps.length > 0 && (
            <div className="em-veto-log">
              {veto.steps.map((s, i) => {
                const teamTag = s.team === -1 ? '' : teams[s.team as 0 | 1].tag;
                const isUser = s.team === userIdx;
                return (
                  <div key={i} className={`em-veto-log-row act-${s.action}${isUser ? ' is-user' : ''}`}>
                    <span className="em-veto-log-step">{i + 1}</span>
                    <span className="em-veto-log-tag">{teamTag || '★'}</span>
                    <span className="em-veto-log-action">
                      {s.action === 'decider' ? t('veto.staysAsDecider') : s.action === 'ban' ? t('veto.banned') : t('veto.picked')}
                    </span>
                    <b className="em-veto-log-map">{MAP_LABELS[s.map!]}</b>
                  </div>
                );
              })}
            </div>
          )}

          {/* Order hint quando nada foi escolhido ainda */}
          {!done && veto.steps.length === 0 && (
            <div className="em-veto-hint">
              {t('veto.order')} {vetoOrder(bestOf).map((s) => (s.action === 'decider' ? t('veto.decider').toLowerCase() : `${s.team === 0 ? teams[0].tag : teams[1].tag} ${s.action}`)).join(' → ')}
            </div>
          )}

          {/* Action bar bottom-fixed */}
          {done && (
            <div className="em-action-bar">
              <button className="em-btn em-btn-primary em-btn-big em-veto-go" onClick={() => onDone(vetoMaps(veto))}>
                <CareerIcon name="check" size={14} /> {t('veto.startSeries')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* T3.13: relatório do analista sobre o adversário, com narrativa + bans/picks recomendados */}
      <AnalystReportCardLazy teams={teams} userIdx={userIdx} />

      <VetoAnalysis teams={teams} userIdx={userIdx} dead={mapState} mapRecord={mapRecord} />

      <div className="veto-lineups-wrap">
        <TeamLineups teams={teams} />
      </div>
    </div>
  );
}

// Wrapper que memoiza o relatório (não recalcula a cada veto step). O report
// é estável durante todo o veto — só muda se trocar os times.
function AnalystReportCardLazy({ teams, userIdx }: { teams: [TTeam, TTeam]; userIdx: 0 | 1 }) {
  const opp = teams[userIdx === 0 ? 1 : 0];
  const me = teams[userIdx];
  const report = useMemo(() => generateAnalystReport(opp, me), [opp, me]);
  return <AnalystReportCard report={report} oppName={opp.name} oppTag={opp.tag} />;
}

// Painel de inteligência pré-partida: força, composição e vantagem por mapa
function VetoAnalysis({
  teams,
  userIdx,
  dead,
  mapRecord,
}: {
  teams: [TTeam, TTeam];
  userIdx: 0 | 1;
  dead: Record<string, { kind: string; by: number } | undefined>;
  mapRecord: Record<string, { w: number; l: number }>;
}) {
  const { t } = useLang();
  const me = teams[userIdx];
  const opp = teams[userIdx === 0 ? 1 : 0];
  const synergy = useMemo(() => draftSynergy(me.players), [me]);

  const edges = useMemo(
    () =>
      MAP_POOL.map((m) => {
        const rec = mapRecord[m] ?? { w: 0, l: 0 };
        const recEdge = (rec.w - rec.l) * 0.6;
        return {
          m,
          edge: (me.mapPrefs[m] ?? 0) - (opp.mapPrefs[m] ?? 0) + recEdge,
          rec,
        };
      }).sort((a, b) => b.edge - a.edge),
    [me, opp, mapRecord],
  );

  const verdictFor = (edge: number, rec: { w: number; l: number }) => {
    if (rec.w >= 2 && rec.w > rec.l) return { label: t('veto.verdictStrong'), cls: 'pick' };
    if (edge >= 1) return { label: t('veto.verdictGoodPick'), cls: 'pick' };
    if (edge <= -1) return { label: t('veto.verdictBanUrgent'), cls: 'ban' };
    return { label: t('veto.verdictEven'), cls: 'even' };
  };

  return (
    <div className="em-stage-card em-veto-analysis">
      <div className="em-veto-section-head">
        <CareerIcon name="brain" size={14} /> {t('veto.preMatchAnalysis')}
      </div>
      <div className="em-veto-strength">
        <span className="em-veto-strength-me">
          <span className="em-veto-strength-name">{me.name}</span>
          <span className="em-veto-strength-val">{me.strength.toFixed(1)}</span>
        </span>
        <span className="em-veto-strength-sep">{t('veto.strength')}</span>
        <span className="em-veto-strength-opp">
          <span className="em-veto-strength-val">{opp.strength.toFixed(1)}</span>
          <span className="em-veto-strength-name">{opp.name}</span>
        </span>
      </div>

      {me.playbook && (
        <div className="em-veto-playbook">
          <CareerIcon name="document" size={14} />
          <span>Playbook:</span>
          <span className="em-veto-playbook-chip">{ct(PLAYBOOK_LABELS[me.playbook])}</span>
          <span className="em-veto-playbook-fam">{ct('entrosamento')} {Math.round((me.playbookFam ?? 0) * 100)}%</span>
        </div>
      )}

      <div className="em-veto-section-label">{t('veto.mapAdvantage')}</div>
      <div className="em-veto-edges">
        {edges.map(({ m, edge, rec }) => {
          const v = verdictFor(edge, rec);
          const width = Math.min(50, Math.abs(edge) * 14);
          const recTxt = rec.w + rec.l > 0 ? ` · ${rec.w}${t('common.wins')}-${rec.l}${t('common.losses')}` : '';
          return (
            <div key={m} className={`em-veto-edge${dead[m] ? ' is-dead' : ''}`}>
              <span className="em-veto-edge-name">
                {MAP_LABELS[m]}
                {recTxt && <span className="em-muted">{recTxt}</span>}
              </span>
              <span className="em-veto-edge-bar">
                <span className="em-veto-edge-mid" />
                <i className={edge >= 0 ? 'pos' : 'neg'} style={{ width: `${width}%` }} />
              </span>
              <span className={`em-veto-edge-verdict v-${v.cls}`}>
                {edge >= 0 ? '+' : ''}{edge.toFixed(1)} <span>{v.label}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="em-veto-section-label">{t('veto.playerForm')}</div>
      <div className="em-veto-list">
        {me.players.map((p) => {
          const f = p.form ?? 1;
          const cls = f >= 1.04 ? 'hot' : f <= 0.96 ? 'cold' : 'stable';
          const label = f >= 1.04 ? t('veto.formHot') : f <= 0.96 ? t('veto.formCold') : t('veto.formStable');
          const iconName = f >= 1.04 ? 'trend-up' : f <= 0.96 ? 'trend-down' : 'target';
          return (
            <div key={p.id} className="em-veto-list-row">
              <span className="em-veto-list-left">
                <CareerIcon name={iconName} size={12} className={`em-trend-${cls}`} />
                {p.nick}
              </span>
              <span className={`em-veto-list-val val-${cls}`}>
                {label} ({((f - 1) * 100).toFixed(0) === '-0' ? '0' : ((f - 1) * 100).toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>

      <div className="em-veto-section-label">
        {t('veto.yourComposition')} <span className={synergy.total >= 0 ? 'em-trend-hot' : 'em-trend-cold'}>({synergy.total >= 0 ? '+' : ''}{synergy.total.toFixed(1)})</span>
      </div>
      <div className="em-veto-list">
        {synergy.items.map((it, i) => (
          <div key={i} className="em-veto-list-row">
            <span className="em-veto-list-left">{it.label}</span>
            <span className={`em-veto-list-val val-${it.value >= 0 ? 'hot' : 'cold'}`}>
              {it.value >= 0 ? '+' : ''}{it.value.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      {!synergy.hasIgl && (
        <div className="em-veto-alert">
          <CareerIcon name="megaphone" size={14} /> {t('veto.noIgl')}
        </div>
      )}
      {!synergy.hasAwp && (
        <div className="em-veto-alert">
          <CareerIcon name="target" size={14} /> {t('veto.noAwp')}
        </div>
      )}
    </div>
  );
}
