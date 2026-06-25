import { useMemo, useState } from 'react';
import type { League } from '../../engine/league';
import { formatMoney, playerOvr, playerValue } from '../../engine/ratings';
import { ct } from '../../state/career-i18n';
import type { MapId, Player, Role, TPlayer, TTeam } from '../../types';
import { MAP_LABELS } from '../../types';
import { Flag, TeamBadge } from '../ui';
import { CareerIcon } from './CareerIcon';
import { PlayerLink } from './PlayerLink';
import { IconChevronLeft } from './DashIcons';

type TeamTab = 'squad' | 'stats' | 'trophies';

const TABS: { id: TeamTab; label: string }[] = [
  { id: 'squad', label: 'Elenco' },
  { id: 'stats', label: 'Stats' },
  { id: 'trophies', label: 'Troféus' },
];

function roleShort(role: Role): string {
  const m: Record<Role, string> = {
    AWP: 'AWP', IGL: 'IGL', Entry: 'ENT', Rifler: 'RIFL', Support: 'SUP', Lurker: 'LURK',
  };
  return m[role] ?? role.slice(0, 4).toUpperCase();
}

function tPlayerToPlayer(p: TPlayer): Player {
  return {
    id: p.sourcePlayerId ?? p.id,
    nick: p.nick,
    name: p.name,
    country: p.country,
    role: p.role,
    role2: p.role2,
    aim: p.aim,
    clutch: p.clutch,
    consistency: p.consistency,
    awp: p.awp,
    igl: p.igl,
  };
}

function potBadge(tier: string, known: boolean): string {
  return known ? tier : `? ${tier}`;
}

export function CareerTeamPage({
  team,
  league,
  vrsRank,
  vrsPoints,
  isUserTeam,
  budgetLabel,
  wageLabel,
  titles,
  split,
  contracts,
  potentialMap,
  ages,
  onBack,
  onOpenPlayer,
}: {
  team: TTeam;
  league?: League | null;
  vrsRank: number;
  vrsPoints: number;
  isUserTeam: boolean;
  budgetLabel?: string;
  wageLabel?: string;
  titles: number;
  split: number;
  contracts: Record<string, number | undefined>;
  potentialMap: Record<string, number>;
  ages: Record<string, number>;
  onBack: () => void;
  onOpenPlayer: (p: Player) => void;
}) {
  const [tab, setTab] = useState<TeamTab>('squad');

  const roster = team.players;
  const avgOvr = roster.length
    ? Math.round(roster.reduce((s, p) => s + p.ovr, 0) / roster.length)
    : 0;
  const avgPot = roster.length
    ? Math.round(roster.reduce((s, p) => s + (potentialMap[p.sourcePlayerId ?? p.id] ?? p.ovr + 4), 0) / roster.length)
    : 0;
  const avgAge = roster.length
    ? Math.round(roster.reduce((s, p) => s + (ages[p.sourcePlayerId ?? p.id] ?? 22), 0) / roster.length * 10) / 10
    : 0;

  const prestige = Math.round(team.strength);
  const fans = useMemo(() => {
    let h = 0;
    for (let i = 0; i < team.id.length; i++) h = (h * 31 + team.id.charCodeAt(i)) & 0xffff;
    return 8000 + (h % 42000) + prestige * 120;
  }, [team.id, prestige]);

  const mapStats = useMemo(() => {
    const rec: Record<string, { w: number; l: number; rf: number; ra: number }> = {};
    if (league) {
      for (const round of league.rounds) for (const m of round) {
        if (!m.result || (m.a !== team.id && m.b !== team.id)) continue;
        const side = m.a === team.id ? 0 : 1;
        for (const mp of m.result.maps) {
          const r = (rec[mp.map] ??= { w: 0, l: 0, rf: 0, ra: 0 });
          if (mp.winner === side) r.w++; else r.l++;
          r.rf += mp.score[side]; r.ra += mp.score[side === 0 ? 1 : 0];
        }
      }
    }
    return Object.entries(rec).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l) || b[1].w - a[1].w);
  }, [league, team.id]);

  const leagueRecord = `${team.wins}-${team.losses}`;

  return (
    <div className="tp-page">
      <nav className="tp-crumb">
        <button type="button" className="tp-back" onClick={onBack} aria-label={ct('Voltar')}>
          <IconChevronLeft size={16} />
        </button>
        <span className="tp-crumb-muted">{ct('Times')}</span>
        <span className="tp-crumb-sep">›</span>
        <span className="tp-crumb-current">{team.name}</span>
      </nav>

      <header className="tp-hero">
        <div className="tp-hero-left">
          <TeamBadge tag={team.tag} colors={team.colors} size={72} logoUrl={team.logoUrl} />
          <div className="tp-identity">
            <div className="tp-name-row">
              <h1>{team.name}</h1>
              <span className="tp-tag">{team.tag}</span>
            </div>
            <p className="tp-meta">
              <Flag cc={team.country} /> {team.country.toUpperCase()}
              {' · '}{ct('Prestígio')} {prestige}
              {' · '}{fans.toLocaleString('pt-BR')} {ct('fãs')}
              {vrsRank > 0 && <> · #{vrsRank} VRS ({Math.round(vrsPoints)})</>}
            </p>
            {team.coach && (
              <p className="tp-coach">
                {ct('Técnico:')} <b>{team.coach.nick}</b> ({team.coach.rating})
              </p>
            )}
          </div>
        </div>
        {isUserTeam && budgetLabel && (
          <div className="tp-finance">
            <span>{ct('Caixa')}</span>
            <b>{budgetLabel}</b>
            {wageLabel && <small>{ct('Folha')}: {wageLabel}</small>}
          </div>
        )}
      </header>

      <div className="tp-metrics">
        <div className="tp-metric blue"><span>{ct('OVR médio')}</span><b>{avgOvr}</b></div>
        <div className="tp-metric purple"><span>{ct('POT médio')}</span><b>{avgPot}</b></div>
        <div className="tp-metric orange"><span>{ct('Idade média')}</span><b>{avgAge}</b></div>
        <div className="tp-metric"><span>{ct('Elenco')}</span><b>{roster.length}</b></div>
        <div className="tp-metric green"><span>{ct('Liga')}</span><b>{leagueRecord}</b></div>
        <div className="tp-metric gold"><span>{ct('Troféus')}</span><b>{titles}</b></div>
      </div>

      <nav className="tp-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
          >
            {ct(t.label)}
          </button>
        ))}
      </nav>

      <div className="tp-body">
        {tab === 'squad' && (
          <div className="tp-table-wrap">
            <table className="tp-table">
              <thead>
                <tr>
                  <th>{ct('Jogador')}</th>
                  <th>{ct('Função')}</th>
                  <th>OVR</th>
                  <th>{ct('Pot.')}</th>
                  <th>{ct('Idade')}</th>
                  <th>{ct('Contrato')}</th>
                  <th>{ct('Valor')}</th>
                  <th>{ct('Status')}</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((p) => {
                  const pid = p.sourcePlayerId ?? p.id;
                  const pl = tPlayerToPlayer(p);
                  const pot = potentialMap[pid] ?? playerOvr(pl) + 4;
                  const tier = pot >= 88 ? 'S' : pot >= 82 ? 'A' : pot >= 76 ? 'B' : pot >= 70 ? 'C' : 'D';
                  const knownPot = isUserTeam || potentialMap[pid] != null;
                  const left = contracts[pid] != null ? contracts[pid]! - split + 1 : null;
                  const age = ages[pid];
                  return (
                    <tr key={p.id}>
                      <td>
                        <PlayerLink player={pl} onOpen={onOpenPlayer} className="tp-player-link" avatarSize={32}>
                          <span className="tp-player-info">
                            <b>{p.nick}</b>
                            <span>{p.name}</span>
                          </span>
                        </PlayerLink>
                      </td>
                      <td><span className={`tp-role ${p.role}`}>{roleShort(p.role)}</span></td>
                      <td><span className="tp-ovr">{p.ovr}</span></td>
                      <td><span className={`tp-pot pot-${tier.toLowerCase()}`}>{potBadge(tier, knownPot)}</span></td>
                      <td>{age ?? '—'}</td>
                      <td>{left == null ? '—' : left <= 0 ? ct('Vencido') : `${left} split${left > 1 ? 's' : ''}`}</td>
                      <td>{formatMoney(playerValue(pl))}</td>
                      <td><span className="tp-status">{ct('Titular')}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'stats' && (
          <div className="tp-stats-panel">
            {mapStats.length === 0 ? (
              <p className="tp-empty">{ct('Sem partidas jogadas ainda nesta temporada.')}</p>
            ) : (
              <table className="tp-map-table">
                <thead>
                  <tr>
                    <th>{ct('Mapa')}</th>
                    <th>V-D</th>
                    <th>{ct('Rounds')}</th>
                    <th>{ct('Aprov.')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mapStats.map(([mp, r]) => {
                    const tot = r.w + r.l;
                    const pct = Math.round((r.w / tot) * 100);
                    return (
                      <tr key={mp}>
                        <td>{MAP_LABELS[mp as MapId] ?? mp}</td>
                        <td className={r.w >= r.l ? 'pos' : 'neg'}><b>{r.w}-{r.l}</b></td>
                        <td className="muted">{r.rf}:{r.ra}</td>
                        <td className={pct >= 50 ? 'pos' : 'neg'}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div className="tp-extra-stats">
              <div><span>{ct('Força')}</span><b>{team.strength.toFixed(1)}</b></div>
              <div><span>{ct('Teamwork')}</span><b>{team.teamwork}</b></div>
              <div><span>{ct('Saldo rounds')}</span><b className={team.roundDiff >= 0 ? 'pos' : 'neg'}>{team.roundDiff >= 0 ? '+' : ''}{team.roundDiff}</b></div>
            </div>
          </div>
        )}

        {tab === 'trophies' && (
          <div className="tp-trophies">
            <div className="tp-trophy-card">
              <CareerIcon name="trophy" size={28} />
              <div>
                <b>{titles}</b>
                <span>{ct('Títulos na carreira')}</span>
              </div>
            </div>
            {isUserTeam ? (
              <p className="tp-empty">{ct('Histórico completo de conquistas na aba História.')}</p>
            ) : (
              <p className="tp-empty">{ct('Conquistas públicas deste time ainda não registradas.')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
