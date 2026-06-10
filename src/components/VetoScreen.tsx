import { useEffect, useMemo, useRef, useState } from 'react';
import { aiChoice, applyVeto, currentStep, newVeto, vetoDone, vetoMaps, VETO_ORDER, type VetoState } from '../engine/veto';
import type { Rng } from '../engine/rng';
import type { MapId, TTeam } from '../types';
import { MAP_LABELS, MAP_POOL } from '../types';
import { MapThumb, TeamBadge } from './ui';

interface Props {
  teams: [TTeam, TTeam]; // [a, b] — usuário pode ser 0 ou 1
  userIdx: 0 | 1;
  rng: Rng;
  phaseLabel: string;
  onDone: (maps: { map: MapId; pickedBy: 0 | 1 | -1 }[]) => void;
}

export function VetoScreen({ teams, userIdx, rng, phaseLabel, onDone }: Props) {
  const [veto, setVeto] = useState<VetoState>(() => newVeto());
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
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          Veto de mapas — {phaseLabel}
          <span className="spacer" />
          <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
            MD3 · ban/pick oficial
          </span>
        </div>
        <div className="panel-body">
          <div className="matchline" style={{ background: 'transparent', borderBottom: 'none', marginBottom: 10 }}>
            <span className="side">
              <TeamBadge tag={teams[0].tag} colors={teams[0].colors} logoUrl={teams[0].logoUrl} />
              <span className="tname">{teams[0].name}</span>
            </span>
            <span className="score">vs</span>
            <span className="side right">
              <span className="tname">{teams[1].name}</span>
              <TeamBadge tag={teams[1].tag} colors={teams[1].colors} logoUrl={teams[1].logoUrl} />
            </span>
            <span />
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
    </div>
  );
}
