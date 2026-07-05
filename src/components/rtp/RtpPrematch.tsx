import { useEffect, useMemo, useState } from 'react';
import { ct } from '../../state/career-i18n';
import { Flag } from '../ui';
import { RtpIcon } from './RtpIcon';
import { MAP_IMAGES } from '../../data/media';
import { MAP_LABELS, type MapId, type TTeam } from '../../types';
import { makeRng } from '../../engine/rng';
import { newVeto, currentStep, applyVeto, aiChoice, vetoDone, vetoMaps, type VetoState } from '../../engine/veto';
import { GAME_PLANS, heroMapComfort, type GamePlan } from '../../engine/rtp/meta';
import type { MatchPrep } from '../../engine/rtp/matchSim';
import type { RoadToProSave } from '../../engine/rtp/types';

// Pré-jogo (RTP v9 — META COMPETITIVO): scouting do adversário + plano de jogo +
// veto de mapa interativo. Devolve o plano escolhido e os mapas vetados.
export function RtpPrematch({ save, prep, major, onReady, onExit }: {
  save: RoadToProSave;
  prep: MatchPrep;
  major?: boolean;
  onReady: (plan: GamePlan, maps: { map: MapId; pickedBy: 0 | 1 | -1 }[]) => void;
  onExit: () => void;
}) {
  const [plan, setPlan] = useState<GamePlan>('default');
  const [veto, setVeto] = useState<VetoState>(() => newVeto(prep.bestOf));
  const comfort = useMemo(() => heroMapComfort(save), [save]);
  const scout = prep.scout;
  const condPct = Math.round((prep.conditionMod - 1) * 100);

  // times mínimos só com mapPrefs pra IA de veto (aiChoice só lê mapPrefs).
  const teams = useMemo(
    () => ([{ mapPrefs: comfort }, { mapPrefs: prep.opp.mapPrefs ?? {} }] as unknown as [TTeam, TTeam]),
    [comfort, prep.opp.mapPrefs],
  );

  // IA joga automaticamente os turnos do adversário (team 1).
  useEffect(() => {
    if (vetoDone(veto)) return;
    const step = currentStep(veto);
    if (step.team !== 1) return;
    const rng = makeRng((prep.matchSeed ^ (veto.steps.length * 0x9e37)) >>> 0);
    const t = setTimeout(() => setVeto((v) => (vetoDone(v) || currentStep(v).team !== 1 ? v : applyVeto(v, aiChoice(v, teams, rng)))), 480);
    return () => clearTimeout(t);
  }, [veto, teams, prep.matchSeed]);

  const done = vetoDone(veto);
  const step = done ? null : currentStep(veto);
  const yourTurn = step?.team === 0;
  const picked = vetoMaps(veto);

  const onMap = (m: MapId) => { if (yourTurn) setVeto((v) => applyVeto(v, m)); };

  // VETO RÁPIDO (RTP v14): resolve os passos restantes na hora — os seus pelo
  // conforto de mapa (mesma IA), sem os delays. Pro grinder na 40ª partida.
  const quickVeto = () => {
    setVeto((v0) => {
      let v = v0;
      let guard = 0;
      while (!vetoDone(v) && guard++ < 12) {
        const rng = makeRng((prep.matchSeed ^ (v.steps.length * 0x9e37) ^ 0xfa57) >>> 0);
        v = applyVeto(v, aiChoice(v, teams, rng));
      }
      return v;
    });
  };

  return (
    <div className="rtp-prematch">
      <div className="rtp-vs">
        <span className="rtp-vs-tag" style={{ color: save.team.colors[0] }}>{save.team.tag}</span>
        <span className="rtp-vs-x">VS</span>
        <span className="rtp-vs-name">{prep.opp.name}</span>
      </div>
      <div className="rtp-match-maps">
        {/* MD (melhor de) — mesma língua do hub e da Sala; era "BO" só aqui. */}
        <span className="rtp-bo">{major ? ct('MAJOR') : ''} MD{prep.bestOf}</span>
        <span className={`rtp-cond-net ${condPct >= 0 ? 'good' : 'bad'}`}>{ct('Condição')} {condPct >= 0 ? '+' : ''}{condPct}%</span>
      </div>

      {prep.factors.length > 0 && (
        <div className="rtp-cond-chips rtp-prematch-chips">
          {prep.factors.map((f, i) => (
            <span key={i} className={`rtp-cond-chip ${f.good ? 'good' : 'bad'}`}>{f.label} {f.delta > 0 ? '+' : ''}{f.delta}%</span>
          ))}
        </div>
      )}

      {/* Scouting */}
      {scout && (
        <div className="dash-card rtp-scout">
          <header className="dash-card-head"><b>{ct('Scouting do adversário')}</b><span style={{ flex: 1 }} /><span className={`rtp-scout-edge ${scout.edge > 2 ? 'bad' : scout.edge < -2 ? 'good' : ''}`}>{scout.edge > 0 ? `+${scout.edge}` : scout.edge} {ct('força')}</span></header>
        <div className="dash-card-body rtp-scout-body">
          <div className="rtp-scout-grid">
            <div className="rtp-scout-cell">
              <span className="rtp-scout-k"><RtpIcon name="fame" size={12} /> {ct('Astro')}</span>
              <b><Flag cc={scout.star.country} /> {scout.star.nick}</b>
              <span className="rtp-scout-v">{scout.star.role} · OVR {scout.star.ovr}</span>
            </div>
            <div className="rtp-scout-cell">
              <span className="rtp-scout-k"><RtpIcon name="arrowUp" size={12} /> {ct('Mapa forte deles')}</span>
              <b>{MAP_LABELS[scout.strongMap]}</b>
              <span className="rtp-scout-v rtp-scout-weak"><RtpIcon name="arrowDown" size={11} /> {ct('Fraco')}: {MAP_LABELS[scout.weakMap]}</span>
            </div>
          </div>
          <p className="rtp-scout-note"><b>{scout.tendency}</b> {scout.note}</p>
        </div>
        </div>
      )}

      {/* Plano de jogo */}
      <div className="dash-card">
        <header className="dash-card-head"><b>{ct('Plano de jogo')}</b></header>
        <div className="dash-card-body">
          <div className="rtp-plan-grid">
            {GAME_PLANS.map((p) => (
              <button key={p.id} type="button" className={`rtp-plan${plan === p.id ? ' on' : ''}`} onClick={() => setPlan(p.id)}>
                <span className="rtp-plan-h"><RtpIcon name={p.icon} size={15} /> {p.label}</span>
                <span className="rtp-plan-desc">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Veto de mapa */}
      <div className="dash-card">
        <header className="dash-card-head">
          <b>{ct('Veto de mapa')}</b><span style={{ flex: 1 }} />
          {!done && <button type="button" className="rtp-btn-ghost rtp-veto-quick" onClick={quickVeto}><RtpIcon name="chevR" size={12} /> {ct('Veto rápido')}</button>}
          <span className="rtp-veto-turn">{done ? ct('Mapas definidos') : yourTurn ? <><RtpIcon name="crosshair" size={12} /> {ct('Sua vez')}: {step?.action === 'pick' ? ct('escolha') : ct('bana')}</> : ct('Adversário decidindo…')}</span>
        </header>
        <div className="dash-card-body">
          <div className="rtp-veto-pool">
            {veto.remaining.map((m) => {
              const c = comfort[m] ?? 0;
              return (
                <button key={m} type="button" className={`rtp-veto-map${yourTurn ? ' pick' : ''}`} disabled={!yourTurn} onClick={() => onMap(m)}
                  style={{ backgroundImage: `url(${MAP_IMAGES[m]})` }}>
                  <span className="rtp-veto-map-scrim" />
                  <span className="rtp-veto-map-name">{MAP_LABELS[m]}</span>
                  <span className={`rtp-veto-comfort ${c > 0 ? 'good' : c < 0 ? 'bad' : ''}`}>{c > 0 ? `+${c}` : c} {ct('conforto')}</span>
                </button>
              );
            })}
          </div>
          {/* histórico do veto */}
          <div className="rtp-veto-log">
            {veto.steps.map((s, i) => (
              <span key={i} className={`rtp-veto-chip ${s.action}${s.team === 0 ? ' you' : ''}`}>
                {s.team === 0 ? ct('Você') : s.team === 1 ? prep.opp.tag : ct('Decider')} {s.action === 'ban' ? '✕' : s.action === 'pick' ? '✓' : '★'} {s.map ? MAP_LABELS[s.map] : ''}
              </span>
            ))}
          </div>
          {done && (
            <div className="rtp-veto-final">
              <span className="rtp-veto-final-lbl">{ct('Vão jogar')}:</span>
              {picked.map((p) => <span key={p.map} className={`rtp-veto-final-map${p.pickedBy === 0 ? ' you' : p.pickedBy === -1 ? ' dec' : ''}`}>{MAP_LABELS[p.map]}</span>)}
            </div>
          )}
        </div>
      </div>

      <div className="rtp-footer-actions">
        <button type="button" className="rtp-cta" style={{ flex: 1 }} disabled={!done} onClick={() => onReady(plan, picked)}>
          {done ? <>{ct('Entrar em quadra')} →</> : ct('Termine o veto pra entrar…')}
        </button>
        <button type="button" className="rtp-btn-ghost" onClick={onExit}>{ct('Voltar')}</button>
      </div>
    </div>
  );
}
