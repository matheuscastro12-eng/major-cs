import { useEffect, useMemo, useRef, useState } from 'react';
import { draftSynergy } from '../engine/ratings';
import { aiChoice, applyVeto, currentStep, newVeto, vetoDone, vetoMaps, vetoOrder, type VetoState } from '../engine/veto';
import type { Rng } from '../engine/rng';
import type { MapId, TTeam } from '../types';
import { MAP_LABELS, MAP_POOL, PLAYBOOK_LABELS } from '../types';
import { MapThumb } from './ui';
import { MatchBanner } from './flags';
import { TeamLineups } from './lineups';
import { useLang } from '../state/i18n';

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

  // tendência de pick/ban por mapa: mapas em que OS DOIS times jogam bem tendem
  // a ser pickados; onde os dois jogam mal tendem a ser banidos. É o mesmo
  // raciocínio que a IA do veto usa, exposto pro usuário ler antes de agir.
  const tendency = useMemo(() => {
    const combo = MAP_POOL.map((m) => ({ m, v: (teams[0].mapPrefs[m] ?? 0) + (teams[1].mapPrefs[m] ?? 0) }));
    const vals = combo.map((c) => c.v);
    const max = Math.max(...vals), min = Math.min(...vals);
    const span = max - min;
    const out: Record<string, { kind: 'pick' | 'ban' | 'even'; pct: number }> = {};
    for (const { m, v } of combo) {
      // sem diferença entre mapas (ex.: prefs ainda zeradas) → tudo neutro, em vez
      // de marcar todo mapa como "tende a ban"
      const norm = span === 0 ? 0.5 : (v - min) / span; // 0..1
      out[m] = { kind: norm >= 0.62 ? 'pick' : norm <= 0.38 ? 'ban' : 'even', pct: Math.round(norm * 100) };
    }
    return out;
  }, [teams]);

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

  return (
    <div className="fade-in veto-layout">
      <div className="panel">
        <div className="panel-head">
          {t('veto.title')} - {phaseLabel}
          <span className="spacer" />
          <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
            {mdLabel} · {t('veto.official')}
          </span>
        </div>
        <div className="panel-body">
          <div className="veto-banner-wrap" style={{ marginBottom: 12 }}>
            <MatchBanner teamA={teams[0]} teamB={teams[1]} center={mdLabel} event={phaseLabel} sub={t('veto.title')} />
          </div>

          {done ? (
            <div className="center" style={{ marginBottom: 12 }}>
              <button className="btn big" onClick={() => onDone(vetoMaps(veto))}>
                ▶ {t('veto.startSeries')}
              </button>
            </div>
          ) : isUserTurn ? (
            <div className={`veto-action ${step!.action === 'ban' ? 'ban' : 'pick'}`}>
              <span className="va-icon">{step!.action === 'ban' ? '🚫' : '✅'}</span>
              <span className="va-text">
                <b>{t('veto.yourTurn')}</b>
                <span>{step!.action === 'ban' ? t('veto.banAMap') : t('veto.pickAMap')}</span>
              </span>
            </div>
          ) : (
            <div className="veto-action waiting">
              <span className="va-icon">⏳</span>
              <span className="va-text">{t('veto.waitingFor')} {teams[step!.team as 0 | 1].name}…</span>
            </div>
          )}

          <div className={`veto-maps${isUserTurn ? (step!.action === 'ban' ? ' mode-ban' : ' mode-pick') : ''}`}>
            {MAP_POOL.map((m) => {
              const st = mapState[m];
              const selectable = isUserTurn && !st;
              return (
                <div
                  key={m}
                  className={`mapcard${st ? ` dead ${st.kind}` : ''}${selectable ? ' selectable' : ''}`}
                  onClick={() => click(m)}
                >
                  <MapThumb map={m} className="mapcard-img" />
                  {!st && tendency[m] && (
                    <span className={`mtend ${tendency[m].kind}`} title={`${t('veto.tendency')}: ${tendency[m].pct}%`}>
                      {tendency[m].kind === 'pick' ? `🔥 ${t('veto.tendPick')}` : tendency[m].kind === 'ban' ? `🚫 ${t('veto.tendBan')}` : `➖ ${t('veto.tendEven')}`}
                    </span>
                  )}
                  {st && (
                    <span className={`mtag ${st.kind}`}>
                      {st.kind === 'banned' ? `🚫 ${t('veto.ban')}` : st.kind === 'picked' ? `✅ ${t('veto.pick')} ${teams[st.by as 0 | 1].tag}` : t('veto.decider')}
                    </span>
                  )}
                  {selectable && (
                    <span className="map-hover-action">
                      {step!.action === 'ban' ? `🚫 ${t('veto.banAMap')}` : `✅ ${t('veto.pickAMap')}`}
                    </span>
                  )}
                  <div className="mname">{MAP_LABELS[m]}</div>
                </div>
              );
            })}
          </div>

          <div className="veto-log">
            {veto.steps.map((s, i) => (
              <div key={i}>
                {i + 1}.{' '}
                {s.action === 'decider' ? (
                  <>
                    <b>{MAP_LABELS[s.map!]}</b> {t('veto.staysAsDecider')}
                  </>
                ) : (
                  <>
                    <b>{teams[s.team as 0 | 1].name}</b> {s.action === 'ban' ? t('veto.banned') : t('veto.picked')}{' '}
                    <b>{MAP_LABELS[s.map!]}</b>
                  </>
                )}
              </div>
            ))}
            {!done && veto.steps.length === 0 && (
              <div className="muted">
                {t('veto.order')} {vetoOrder(bestOf).map((s) => (s.action === 'decider' ? t('veto.decider').toLowerCase() : `${s.team === 0 ? teams[0].tag : teams[1].tag} ${s.action}`)).join(' → ')}
              </div>
            )}
          </div>
        </div>
      </div>

      <VetoAnalysis teams={teams} userIdx={userIdx} dead={mapState} mapRecord={mapRecord} />

      <div className="veto-lineups-wrap">
        <TeamLineups teams={teams} />
      </div>
    </div>
  );
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

  // retrospecto do usuário no mapa reforça a recomendação: mapa onde você vem
  // ganhando vira ponto forte (não banir), mapa onde apanha vira candidato a ban
  const edges = useMemo(
    () =>
      MAP_POOL.map((m) => {
        const rec = mapRecord[m] ?? { w: 0, l: 0 };
        const recEdge = (rec.w - rec.l) * 0.6; // cada vitória líquida pesa no veredito
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
    <div className="panel veto-analysis">
      <div className="panel-head">{t('veto.preMatchAnalysis')}</div>
      <div className="panel-body">
        <div className="vs-strength">
          <span className="me">
            {me.name} {me.strength.toFixed(1)}
          </span>
          <span className="x">{t('veto.strength')}</span>
          <span className="opp">
            {opp.strength.toFixed(1)} {opp.name}
          </span>
        </div>

        {me.playbook && (
          <div className="pb-analysis" style={{ margin: '4px 0 10px' }}>
            <span>📋 Playbook: <span className="pb-chip">{PLAYBOOK_LABELS[me.playbook]}</span></span>
            <span className="muted small">· entrosamento {Math.round((me.playbookFam ?? 0) * 100)}%</span>
          </div>
        )}

        <div className="muted small" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
          {t('veto.mapAdvantage')}
        </div>
        {edges.map(({ m, edge, rec }) => {
          const v = verdictFor(edge, rec);
          const width = Math.min(50, Math.abs(edge) * 14);
          const recTxt = rec.w + rec.l > 0 ? ` · ${rec.w}${t('common.wins')}-${rec.l}${t('common.losses')}` : '';
          return (
            <div key={m} className={`map-edge${dead[m] ? ' dead-row' : ''}`}>
              <span className="mn">
                {MAP_LABELS[m]}
                {recTxt && <span className="muted small">{recTxt}</span>}
              </span>
              <span className="bar">
                <span className="mid" />
                <i className={edge >= 0 ? 'pos' : 'neg'} style={{ width: `${width}%` }} />
              </span>
              <span className={`verdict-chip ${v.cls}`}>
                {edge >= 0 ? '+' : ''}
                {edge.toFixed(1)} {v.label}
              </span>
            </div>
          );
        })}

        <div className="muted small" style={{ margin: '14px 0 4px', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
          {t('veto.playerForm')}
        </div>
        <div className="synergy-list">
          {me.players.map((p) => {
            const f = p.form ?? 1;
            const icon = f >= 1.04 ? '🔥' : f <= 0.96 ? '🥶' : '➖';
            const label = f >= 1.04 ? t('veto.formHot') : f <= 0.96 ? t('veto.formCold') : t('veto.formStable');
            return (
              <div key={p.id} className="item">
                <span className="muted">
                  {icon} {p.nick}
                </span>
                <span className={f >= 1.04 ? 'pos' : f <= 0.96 ? 'neg' : 'neutral'}>
                  {label} ({((f - 1) * 100).toFixed(0) === '-0' ? '0' : ((f - 1) * 100).toFixed(0)}%)
                </span>
              </div>
            );
          })}
        </div>

        <div className="muted small" style={{ margin: '14px 0 4px', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
          {t('veto.yourComposition')} ({synergy.total >= 0 ? '+' : ''}
          {synergy.total.toFixed(1)})
        </div>
        <div className="synergy-list">
          {synergy.items.map((it, i) => (
            <div key={i} className="item">
              <span className="muted">{it.label}</span>
              <span className={it.value >= 0 ? 'pos' : 'neg'}>
                {it.value >= 0 ? '+' : ''}
                {it.value.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
        {!synergy.hasIgl && (
          <div className="insight-item bad" style={{ marginTop: 10 }}>
            <span className="ic">📢</span>
            <span>{t('veto.noIgl')}</span>
          </div>
        )}
        {!synergy.hasAwp && (
          <div className="insight-item bad" style={{ marginTop: 6 }}>
            <span className="ic">🔭</span>
            <span>{t('veto.noAwp')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
