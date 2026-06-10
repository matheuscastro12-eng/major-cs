import { getTeam, standings } from '../engine/swiss';
import type { Pairing, Tournament, TTeam } from '../types';
import { TeamBadge } from './ui';

interface MatchRef {
  pairing: Pairing;
  phase: string;
  current: boolean;
}

function MatchCard({ t, item }: { t: Tournament; item: MatchRef }) {
  const a = getTeam(t, item.pairing.a);
  const b = getTeam(t, item.pairing.b);
  const r = item.pairing.result;
  return (
    <div className={`br-match${item.current ? ' current' : ''}`}>
      <MiniTeam team={a} dim={r?.winner === 1} score={r?.mapScore[0]} />
      <div className="br-vs">{r ? ':' : 'vs'}</div>
      <MiniTeam team={b} dim={r?.winner === 0} score={r?.mapScore[1]} right />
    </div>
  );
}

function MiniTeam({ team, score, dim, right }: { team: TTeam; score?: number; dim?: boolean; right?: boolean }) {
  return (
    <div className={`br-team${right ? ' right' : ''}${dim ? ' dim' : ''}`}>
      {!right && <TeamBadge tag={team.tag} colors={team.colors} size={22} logoUrl={team.logoUrl} />}
      <span>{team.tag}</span>
      {score !== undefined && <b>{score}</b>}
      {right && <TeamBadge tag={team.tag} colors={team.colors} size={22} logoUrl={team.logoUrl} />}
    </div>
  );
}

function TeamToken({ team }: { team: TTeam }) {
  return (
    <div className={`br-token ${team.status}`}>
      <TeamBadge tag={team.tag} colors={team.colors} size={22} logoUrl={team.logoUrl} />
      <span>{team.tag}</span>
    </div>
  );
}

export function TournamentBracket({ t }: { t: Tournament }) {
  return (
    <div className="panel">
      <div className="panel-head">Bracket</div>
      <div className="panel-body">
        {t.phase === 'swiss' ? <SwissBracket t={t} /> : <PlayoffBracket t={t} />}
      </div>
    </div>
  );
}

function SwissBracket({ t }: { t: Tournament }) {
  const current: MatchRef[] = t.pairings.map((pairing) => ({ pairing, phase: 'Atual', current: true }));
  const past: MatchRef[] = t.history
    .filter((h) => h.pairing.label.includes('-'))
    .map((h) => ({ pairing: h.pairing, phase: h.phase, current: false }));
  const items = [...past, ...current];
  const records = ['0-0', '1-0', '0-1', '2-0', '1-1', '0-2', '2-1', '1-2', '2-2'];
  const ranked = standings(t);
  const advanced = ranked.filter((team) => team.status === 'advanced');
  const eliminated = ranked.filter((team) => team.status === 'eliminated');

  return (
    <div className="swiss-bracket">
      <div className="br-scroll">
        {records.map((record) => {
          const matches = items.filter((item) => item.pairing.label === record);
          return (
            <div key={record} className="br-col">
              <div className="br-title">{record.replace('-', ':')}</div>
              <div className="br-stack">
                {matches.length === 0 && <div className="br-empty">?</div>}
                {matches.map((item, i) => (
                  <MatchCard key={`${record}-${i}-${item.current ? 'c' : 'p'}`} t={t} item={item} />
                ))}
              </div>
            </div>
          );
        })}
        <StatusColumn title="3:0 / 3:1 / 3:2" tone="adv" teams={advanced} />
        <StatusColumn title="0:3 / 1:3 / 2:3" tone="elim" teams={eliminated} />
      </div>
    </div>
  );
}

function StatusColumn({ title, tone, teams }: { title: string; tone: 'adv' | 'elim'; teams: TTeam[] }) {
  return (
    <div className={`br-col status ${tone}`}>
      <div className="br-title">{title}</div>
      <div className="br-stack tokens">
        {teams.length === 0 && <div className="br-empty">?</div>}
        {teams.map((team) => (
          <TeamToken key={team.id} team={team} />
        ))}
      </div>
    </div>
  );
}

function PlayoffBracket({ t }: { t: Tournament }) {
  const all: MatchRef[] = [
    ...t.history
      .filter((h) => !h.pairing.label.includes('-'))
      .map((h) => ({ pairing: h.pairing, phase: h.phase, current: false })),
    ...t.pairings.map((pairing) => ({ pairing, phase: 'Atual', current: true })),
  ];
  const find = (label: string) => all.find((item) => item.pairing.label === label);
  const columns = [
    { title: 'Quartas', labels: ['QF1', 'QF2', 'QF3', 'QF4'] },
    { title: 'Semis', labels: ['SF1', 'SF2'] },
    { title: 'Final', labels: ['FINAL'] },
  ];
  const champion = t.championId ? getTeam(t, t.championId) : undefined;

  return (
    <div className="playoff-bracket">
      {columns.map((col) => (
        <div key={col.title} className="br-col">
          <div className="br-title">{col.title}</div>
          <div className="br-stack">
            {col.labels.map((label) => {
              const item = find(label);
              return item ? <MatchCard key={label} t={t} item={item} /> : <div key={label} className="br-empty">?</div>;
            })}
          </div>
        </div>
      ))}
      <div className="br-col status adv">
        <div className="br-title">Campeao</div>
        <div className="br-stack tokens">{champion ? <TeamToken team={champion} /> : <div className="br-empty">?</div>}</div>
      </div>
    </div>
  );
}
