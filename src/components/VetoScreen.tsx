import { useEffect, useMemo, useRef, useState } from 'react';
import { draftSynergy } from '../engine/ratings';
import { aiChoice, applyVeto, currentStep, newVeto, vetoDone, vetoMaps, VETO_ORDER, type VetoState } from '../engine/veto';
import type { Rng } from '../engine/rng';
import type { MapId, TTeam } from '../types';
import { MAP_LABELS, MAP_POOL } from '../types';
import { MapThumb } from './ui';
import { MatchBanner } from './flags';

interface Props {
  teams: [TTeam, TTeam]; // [a, b] - usuário pode ser 0 ou 1
  userIdx: 0 | 1;
  rng: Rng;
  phaseLabel: string;
  bestOf?: 1 | 3;
  mapRecord?: Record<string, { w: number; l: number }>;
  onDone: (maps: { map: MapId; pickedBy: 0 | 1 | -1 }[]) => void;
}

export function VetoScreen({ teams, userIdx, rng, phaseLabel, bestOf = 3, mapRecord = {}, onDone }: Props) {
  const [veto, setVeto] = useState<VetoState>(() => newVeto(bestOf));
  const mdLabel = bestOf === 1 ? 'MD1' : 'MD3';
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
          Veto de mapas - {phaseLabel}
          <span className="spacer" />
          <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
            {mdLabel} · ban/pick oficial
          </span>
        </div>
        <div className="panel-body">
          <div className="veto-banner-wrap" style={{ marginBottom: 12 }}>
            <MatchBanner teamA={teams[0]} teamB={teams[1]} center={mdLabel} event={phaseLabel} sub="Veto de mapas" />
          </div>

          <div className="center" style={{ marginBottom: 12 }}>
            {done ? (
              <button className="btn big" onClick={() => onDone(vetoMaps(veto))}>
                ▶ Começar a série
              </button>
            ) : isUserTurn ? (
              <span className="gold-text">
                Sua vez: <b>{step!.action === 'ban' ? 'BANIR um mapa' : 'ESCOLHER um mapa'}</b>
              </span>
            ) : (
              <span className="muted">Aguardando {teams[step!.team as 0 | 1].name}…</span>
            )}
          </div>

          <div className="veto-maps">
            {MAP_POOL.map((m) => {
              const st = mapState[m];
              return (
                <div
                  key={m}
                  className={`mapcard${st ? ` dead ${st.kind}` : ''}`}
                  onClick={() => click(m)}
                >
                  <MapThumb map={m} className="mapcard-img" />
                  {st && (
                    <span className="mtag">
                      {st.kind === 'banned' ? 'BAN' : st.kind === 'picked' ? `PICK ${teams[st.by as 0 | 1].tag}` : 'DECIDER'}
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
                    <b>{MAP_LABELS[s.map!]}</b> sobra como decider
                  </>
                ) : (
                  <>
                    <b>{teams[s.team as 0 | 1].name}</b> {s.action === 'ban' ? 'baniu' : 'escolheu'}{' '}
                    <b>{MAP_LABELS[s.map!]}</b>
                  </>
                )}
              </div>
            ))}
            {!done && veto.steps.length === 0 && (
              <div className="muted">
                Ordem: {VETO_ORDER.map((s) => (s.action === 'decider' ? 'decider' : `${s.team === 0 ? teams[0].tag : teams[1].tag} ${s.action}`)).join(' → ')}
              </div>
            )}
          </div>
        </div>
      </div>

      <VetoAnalysis teams={teams} userIdx={userIdx} dead={mapState} mapRecord={mapRecord} />
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
    if (rec.w >= 2 && rec.w > rec.l) return { label: 'mapa forte · pegue', cls: 'pick' };
    if (edge >= 1) return { label: 'bom pick', cls: 'pick' };
    if (edge <= -1) return { label: 'ban urgente', cls: 'ban' };
    return { label: 'equilibrado', cls: 'even' };
  };

  return (
    <div className="panel veto-analysis">
      <div className="panel-head">Análise pré-partida</div>
      <div className="panel-body">
        <div className="vs-strength">
          <span className="me">
            {me.name} {me.strength.toFixed(1)}
          </span>
          <span className="x">FORÇA</span>
          <span className="opp">
            {opp.strength.toFixed(1)} {opp.name}
          </span>
        </div>

        <div className="muted small" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
          Vantagem por mapa (você ⟵⟶ adversário)
        </div>
        {edges.map(({ m, edge, rec }) => {
          const v = verdictFor(edge, rec);
          const width = Math.min(50, Math.abs(edge) * 14);
          const recTxt = rec.w + rec.l > 0 ? ` · ${rec.w}V-${rec.l}D` : '';
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
          Forma dos seus jogadores
        </div>
        <div className="synergy-list">
          {me.players.map((p) => {
            const f = p.form ?? 1;
            const icon = f >= 1.04 ? '🔥' : f <= 0.96 ? '🥶' : '➖';
            const label = f >= 1.04 ? 'em chamas' : f <= 0.96 ? 'fase ruim' : 'estável';
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
          Sua composição ({synergy.total >= 0 ? '+' : ''}
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
            <span>Sem IGL: priorize mapas onde você tem vantagem clara - em jogos fechados seu time tende a desmoronar no 2º half.</span>
          </div>
        )}
        {!synergy.hasAwp && (
          <div className="insight-item bad" style={{ marginTop: 6 }}>
            <span className="ic">🔭</span>
            <span>Sem AWPer: evite mapas de linhas longas onde o CT depende da sniper (Dust2, Train).</span>
          </div>
        )}
      </div>
    </div>
  );
}
