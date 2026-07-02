import { ct } from '../../state/career-i18n';
import { TeamBadge } from '../ui';
import { DashCard } from '../career/DashCard';
import { RtpIcon } from './RtpIcon';
import { gslGroupView } from '../../engine/gsl';
import { leagueTeam, type League as GslLeague, type LeagueMatch } from '../../engine/league';
import { getTeam } from '../../engine/swiss';
import { stageLabel } from '../../engine/rtp/circuit';
import { TIER_NAME } from '../../engine/rtp/league';
import type { RoadToProSave } from '../../engine/rtp/types';
import type { Tournament, Pairing, TTeam } from '../../types';

const PLACE_TXT: Record<number, string> = { 1: '1º', 2: '2º', 3: '3º', 4: '4º' };

export function RtpLeague({ save }: { save: RoadToProSave }) {
  const c = save.world.league;
  if (!c) return <DashCard title={ct('Circuito')}><div className="rtp-soon">{ct('Sem circuito ativo.')}</div></DashCard>;

  return (
    <>
      <div className="rtp-major-head">
        <div className="rtp-major-title">
          <span className="rtp-major-trophy"><RtpIcon name="trophy" size={24} /></span>
          <div>
            <b>{c.name}</b>
            <span>{TIER_NAME[c.tier]} · {stageLabel(c)}</span>
          </div>
        </div>
      </div>

      {c.phase === 'done'
        ? <DashCard title={ct('Temporada encerrada')}><div className="rtp-soon">{ct('Circuito concluído — a nova temporada começa em seguida.')}</div></DashCard>
        : c.phase === 'playoffs' && c.playoff
          ? <PlayoffView t={c.playoff} />
          : <GroupsView gsl={c.gsl as GslLeague} />}
    </>
  );
}

// ── Fase de grupos GSL (dupla eliminação: upper = Vencedores, lower = Eliminação) ──
function GroupsView({ gsl }: { gsl: GslLeague }) {
  const groups = gslGroupView(gsl);
  return (
    <DashCard title={ct('Fase de grupos · dupla eliminação')}>
      <div className="rtp-gsl-groups">
        {groups.map((g) => (
          <div key={g.key} className="rtp-gsl-group">
            <div className="rtp-gsl-grouphead">{ct('Grupo')} {g.key}</div>
            <div className="rtp-gsl-cols">
              <div className="rtp-gsl-col">
                <span className="rtp-gsl-collabel">{ct('Abertura')}</span>
                {g.opening.map((m, i) => <Mtch key={i} l={gsl} m={m} />)}
              </div>
              <div className="rtp-gsl-col">
                <span className="rtp-gsl-collabel up">{ct('Vencedores')}</span>
                {g.winners ? <Mtch l={gsl} m={g.winners} /> : <Empty />}
                <span className="rtp-gsl-collabel low">{ct('Eliminação')}</span>
                {g.elim ? <Mtch l={gsl} m={g.elim} /> : <Empty />}
              </div>
              <div className="rtp-gsl-col">
                <span className="rtp-gsl-collabel">{ct('Decisão')}</span>
                {g.decider ? <Mtch l={gsl} m={g.decider} /> : <Empty />}
                <div className="rtp-gsl-places">
                  {g.teams.map((id) => {
                    const t = leagueTeam(gsl, id);
                    const pl = g.place[id];
                    return (
                      <div key={id} className={`rtp-gsl-place${id === 'user' ? ' me' : ''}${pl && pl <= 2 ? ' qual' : ''}`}>
                        <span className="rtp-gsl-rank">{pl ? PLACE_TXT[pl] : '·'}</span>
                        <TeamBadge tag={t.tag} colors={t.colors} size={16} logoUrl={t.logoUrl} />
                        <span className="rtp-gsl-pname">{t.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rtp-table-legend"><span><i className="rtp-leg-dot promo" /> {ct('2 melhores de cada grupo vão ao playoff')}</span></div>
    </DashCard>
  );
}

function Mtch({ l, m }: { l: GslLeague; m: LeagueMatch }) {
  const a = leagueTeam(l, m.a);
  const b = leagueTeam(l, m.b);
  const res = m.result;
  return (
    <div className="rtp-br-cell">
      <Row t={a} won={res?.winner === 0} score={res ? res.mapScore[0] : null} me={m.a === 'user'} />
      <Row t={b} won={res?.winner === 1} score={res ? res.mapScore[1] : null} me={m.b === 'user'} />
    </div>
  );
}

function Row({ t, won, score, me }: { t: TTeam; won: boolean; score: number | null; me: boolean }) {
  return (
    <div className={`rtp-br-team${won ? ' win' : ''}${me ? ' me' : ''}`}>
      <TeamBadge tag={t.tag} colors={t.colors} size={15} logoUrl={t.logoUrl} />
      <span className="rtp-br-name">{t.name}</span>
      {score !== null && <b>{score}</b>}
    </div>
  );
}

function Empty() { return <div className="rtp-br-cell empty">—</div>; }

// ── Playoff (SF + Final) ─────────────────────────────────────────────────────
function PlayoffView({ t }: { t: Tournament }) {
  const byPhase = (key: string, active: boolean): Pairing[] => {
    const done = t.history.filter((h) => h.phase === key).map((h) => h.pairing);
    return [...done, ...(active ? t.pairings : [])];
  };
  const cols = [
    { label: ct('Semifinal'), pairings: byPhase('Semifinal', t.phase === 'semis') },
    { label: ct('Final'), pairings: byPhase('GRANDE FINAL', t.phase === 'final') },
  ];
  return (
    <DashCard title={ct('Playoffs')}>
      <div className="rtp-bracket">
        {cols.map((col) => (
          <div key={col.label} className="rtp-br-col">
            <div className="rtp-br-coltitle">{col.label}</div>
            {col.pairings.length === 0 && <Empty />}
            {col.pairings.map((p, i) => {
              const a = getTeam(t, p.a); const b = getTeam(t, p.b); const res = p.result;
              return (
                <div key={i} className="rtp-br-cell">
                  <Row t={a} won={res?.winner === 0} score={res ? res.mapScore[0] : null} me={p.a === 'user'} />
                  <Row t={b} won={res?.winner === 1} score={res ? res.mapScore[1] : null} me={p.b === 'user'} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </DashCard>
  );
}
