import { ct } from '../../state/career-i18n';
import { TeamBadge } from '../ui';
import { RtpFrame } from './RtpFrame';
import { RtpIcon } from './RtpIcon';
import { DashCard } from '../career/DashCard';
import { userPairing, getTeam, standings, pairingBestOf, phaseLabelDisplay } from '../../engine/swiss';
import type { RoadToProSave, MajorState, MajorPlacementCode } from '../../engine/rtp/types';
import type { Tournament, Pairing } from '../../types';

const money = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;

const PLACE_LABEL: Record<MajorPlacementCode, string> = {
  champion: ct('CAMPEÃO'), runnerup: ct('VICE-CAMPEÃO'), semi: ct('SEMIFINAL'),
  quarters: ct('QUARTAS'), top8: ct('TOP 8'), swiss: ct('FASE SUÍÇA'),
};
const STAGE_STEPS = [ct('Suíça'), ct('Quartas'), ct('Semi'), ct('Final')];

function stageIndex(t: Tournament): number {
  if (t.phase === 'swiss') return 0;
  if (t.phase === 'quarters') return 1;
  if (t.phase === 'semis') return 2;
  return 3; // final / done
}

export function RTPMajor({ save, onPlay, onSimulate, onDismiss }: {
  save: RoadToProSave;
  onPlay: () => void;
  onSimulate: () => void;
  onDismiss: () => void;
}) {
  const major = save.world.major!;
  const t = major.tournament;
  const resolved = major.resolved;

  if (resolved) return <ResultScreen major={major} onDismiss={onDismiss} />;

  const userTeam = getTeam(t, 'user');
  const up = userPairing(t);
  const opp = up ? getTeam(t, up.a === 'user' ? up.b : up.a) : null;
  const bestOf = up ? pairingBestOf(t, up) : 3;
  const si = stageIndex(t);

  return (
    <RtpFrame onExit={onDismiss} kicker={ct('MAJOR')}>
      <div className="rtp-major-head">
        <div className="rtp-major-title">
          <span className="rtp-major-trophy"><RtpIcon name="trophy" size={24} /></span>
          <div>
            <b>{major.name}</b>
            <span>{phaseLabelDisplay(t)} · {ct('você')} {userTeam.wins}–{userTeam.losses}</span>
          </div>
        </div>
        <div className="rtp-major-stepper">
          {STAGE_STEPS.map((s, i) => (
            <span key={s} className={`rtp-major-step${i === si ? ' on' : i < si ? ' done' : ''}`}>{s}</span>
          ))}
        </div>
      </div>

      {up && opp ? (
        <DashCard title={ct('Sua próxima série')}>
          <div className="rtp-major-next">
            <div className="rtp-major-vs">
              <TeamBadge tag={opp.tag} colors={opp.colors} size={28} logoUrl={opp.logoUrl} />
              <div className="rtp-major-vs-id"><b>{opp.name}</b><span>~{opp.strength} OVR</span></div>
              <span className="rtp-bo-pill">MD{bestOf}</span>
            </div>
            <div className="rtp-major-next-btns">
              <button type="button" className="rtp-nextmatch-btn" onClick={onPlay}><RtpIcon name="crosshair" size={14} /> {ct('Jogar')}</button>
              <button type="button" className="rtp-btn-ghost" onClick={onSimulate}>{ct('Simular')}</button>
            </div>
          </div>
        </DashCard>
      ) : (
        <DashCard title={ct('Aguardando')}>
          <div className="rtp-soon">{ct('Sem série sua nesta fase. Simule para avançar o chaveamento.')}</div>
          <div style={{ marginTop: 10 }}><button type="button" className="rtp-btn-ghost" onClick={onSimulate}>{ct('Avançar')}</button></div>
        </DashCard>
      )}

      {major.phaseStage === 'swiss' ? <SwissTable t={t} /> : <PlayoffBracket t={t} />}
    </RtpFrame>
  );
}

// ── Fase Suíça: classificação ────────────────────────────────────────────────
function SwissTable({ t }: { t: Tournament }) {
  const rows = standings(t);
  return (
    <DashCard title={ct('Fase Suíça')}>
      <div className="rtp-table">
        <div className="rtp-table-head"><span>#</span><span>{ct('Time')}</span><span>V</span><span>D</span><span>SM</span></div>
        {rows.map((tm, i) => (
          <div key={tm.id} className={`rtp-table-row${tm.id === 'user' ? ' me' : ''}${tm.status === 'advanced' ? ' promo' : ''}${tm.status === 'eliminated' ? ' releg' : ''}`}>
            <span>{i + 1}</span>
            <span className="rtp-table-team">
              <TeamBadge tag={tm.tag} colors={tm.colors} size={20} logoUrl={tm.logoUrl} />
              <span className="rtp-table-name">{tm.name}</span>
            </span>
            <span>{tm.wins}</span><span>{tm.losses}</span><span>{tm.roundDiff > 0 ? `+${tm.roundDiff}` : tm.roundDiff}</span>
          </div>
        ))}
      </div>
      <div className="rtp-table-legend"><span><i className="rtp-leg-dot promo" /> {ct('Classificado')}</span><span><i className="rtp-leg-dot releg" /> {ct('Eliminado')}</span></div>
    </DashCard>
  );
}

// ── Playoffs: chaveamento em colunas (Quartas → Semi → Final) ─────────────────
function PlayoffBracket({ t }: { t: Tournament }) {
  // junta pairings concluídos (history) + ativos (t.pairings) por fase
  const byPhase = (phaseKey: string, active: boolean): Pairing[] => {
    const done = t.history.filter((h) => h.phase === phaseKey).map((h) => h.pairing);
    const cur = active ? t.pairings : [];
    return [...done, ...cur];
  };
  const cols: { label: string; pairings: Pairing[] }[] = [
    { label: ct('Quartas'), pairings: byPhase('Quartas de final', t.phase === 'quarters') },
    { label: ct('Semi'), pairings: byPhase('Semifinal', t.phase === 'semis') },
    { label: ct('Final'), pairings: byPhase('GRANDE FINAL', t.phase === 'final') },
  ];

  return (
    <DashCard title={ct('Chaveamento')}>
      <div className="rtp-bracket">
        {cols.map((col) => (
          <div key={col.label} className="rtp-br-col">
            <div className="rtp-br-coltitle">{col.label}</div>
            {col.pairings.length === 0 && <div className="rtp-br-cell empty">—</div>}
            {col.pairings.map((p, i) => (
              <BrCell key={i} t={t} p={p} />
            ))}
          </div>
        ))}
      </div>
    </DashCard>
  );
}

function BrCell({ t, p }: { t: Tournament; p: Pairing }) {
  const a = getTeam(t, p.a);
  const b = getTeam(t, p.b);
  const res = p.result;
  const aWon = res?.winner === 0;
  const bWon = res?.winner === 1;
  const row = (team: typeof a, won: boolean, score: number | null, isUser: boolean) => (
    <div className={`rtp-br-team${won ? ' win' : ''}${isUser ? ' me' : ''}`}>
      <TeamBadge tag={team.tag} colors={team.colors} size={16} logoUrl={team.logoUrl} />
      <span className="rtp-br-name">{team.name}</span>
      {score !== null && <b>{score}</b>}
    </div>
  );
  return (
    <div className="rtp-br-cell">
      {row(a, aWon, res ? res.mapScore[0] : null, p.a === 'user')}
      {row(b, bWon, res ? res.mapScore[1] : null, p.b === 'user')}
    </div>
  );
}

// ── Tela de resultado do Major ───────────────────────────────────────────────
function ResultScreen({ major, onDismiss }: { major: MajorState; onDismiss: () => void }) {
  const r = major.resolved!;
  const champ = r.placement === 'champion';
  return (
    <RtpFrame onExit={onDismiss} kicker={ct('MAJOR')}>
      <div className={`rtp-major-result${champ ? ' champ' : ''}`}>
        <span className="rtp-major-result-trophy"><RtpIcon name={champ ? 'trophy' : 'chart'} size={48} /></span>
        <div className="rtp-major-result-place">{PLACE_LABEL[r.placement]}</div>
        <div className="rtp-major-result-name">{major.name}</div>
        <div className="rtp-major-result-stats">
          <div><span>{ct('Premiação')}</span><b>{money(r.prize)}</b></div>
          <div><span>{ct('Fama')}</span><b>+{r.fameDelta}</b></div>
        </div>
        {r.trophy && <div className="rtp-major-result-troph"><RtpIcon name="trophy" size={14} /> {r.trophy}</div>}
        {r.award && <div className={`rtp-major-result-award a-${r.award}`}><RtpIcon name="fame" size={14} /> {ct('Você foi')} {r.award.toUpperCase()} {ct('do Major!')}</div>}
        <button type="button" className="rtp-cta" onClick={onDismiss}>{ct('Continuar')} <RtpIcon name="chevR" size={14} /></button>
      </div>
    </RtpFrame>
  );
}
