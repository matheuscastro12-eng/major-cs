import type { ReactNode } from 'react';
import type { League, LeagueMatch } from '../../engine/league';
import type { Player, TTeam } from '../../types';
import { MAP_LABELS, type MapId } from '../../types';
import { MAP_IMAGES } from '../../data/media';
import { ct } from '../../state/career-i18n';
import { playerOrgId } from '../../state/career-player-route';
import type { DashTask } from '../../state/career-tasks';
import { Flag, TeamBadge } from '../ui';
import { PlayerLink } from './PlayerLink';
import { DashCard } from './DashCard';
import { SparkLine } from './DashCharts';
import { playerOvr } from '../../engine/ratings';
import {
  IconExternal, IconFastForward, IconPlay, IconSwords, IconTrophy,
  IconTriangleDown, IconTriangleUp, StarRating,
} from './DashIcons';

export type OverviewPlayerStat = {
  id: string; nick: string; country: string; role: string;
  rating: number; kd: number; adr: number;
};

export type VrsRow = {
  id: string; tag: string; name: string; colors: [string, string]; logoUrl?: string; vrs: number; isUser: boolean;
};

export type RecentMatchRow = {
  key: string; label: string; opponent: string; score: string; won: boolean; maps: string[];
};

function moodLabel(morale: number): string {
  if (morale >= 75) return ct('Confiante');
  if (morale >= 55) return ct('Estável');
  if (morale >= 40) return ct('Cansado');
  return ct('Exausto');
}

function ovrStars(ovr: number): number {
  return Math.max(1, Math.min(5, Math.round((ovr - 55) / 8)));
}

function potStars(pot: number): number {
  return Math.max(1, Math.min(5, Math.round((pot - 60) / 7)));
}

export function CareerOverview({
  save, league, opp, myMatch, squadPlayers, seasonStats, form,
  myVrsRank, vrsPoints, avgOvr, budgetLabel, wageLabel,
  chem, fam, tasks, vrsRanking, recentMatches,
  oppRank, contracts, moraleMap, potentialMap, ages,
  roundLabel, boLabel, venueLabel, nextRivalry, nextRivalryScore,
  onPlay, onSim, onSimSplit, onOpenTasks, onOpenCalendar, onOpenVrs, onOpenResults,
  onPickTeam, onPickPlayer, onSquad, gamePlanPicker, oppScoutStats,
}: {
  save: { org?: { name?: string; tag?: string; colors?: [string, string]; logo?: string }; circuit?: { name?: string }; split: number; titles?: number; budget: number; tier?: number };
  league: League;
  opp: TTeam | null;
  myMatch: LeagueMatch | null;
  squadPlayers: Player[];
  seasonStats: OverviewPlayerStat[];
  form: ('W' | 'L')[];
  myVrsRank: number;
  vrsPoints: number;
  avgOvr: number;
  budgetLabel: string;
  wageLabel: string;
  chem: number;
  fam: number;
  tasks: DashTask[];
  vrsRanking: VrsRow[];
  recentMatches: RecentMatchRow[];
  oppRank: number;
  contracts: Record<string, number | undefined>;
  moraleMap: Record<string, number>;
  potentialMap: Record<string, number>;
  ages: Record<string, number>;
  roundLabel: string;
  boLabel: string;
  venueLabel: string;
  nextRivalry: string;
  nextRivalryScore: number;
  onPlay: () => void;
  onSim: () => void;
  onSimSplit: () => void;
  onOpenTasks: () => void;
  onOpenCalendar: () => void;
  onOpenVrs: () => void;
  onOpenResults: () => void;
  onPickTeam: (teamId: string) => void;
  onPickPlayer: (p: Player) => void;
  onSquad: () => void;
  gamePlanPicker: ReactNode;
  oppScoutStats?: Record<string, { rating: number; adr: number }>;
}) {
  const eventName = save.circuit?.name ?? ct('Circuito');
  const oppPlayers = opp?.players ?? [];
  const oppTop = [...oppPlayers].sort((a, b) => playerOvr(b) - playerOvr(a)).slice(0, 2);
  const oppMaps = opp
    ? (Object.entries(opp.mapPrefs ?? {}) as [MapId, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3)
    : [];

  const squadStats = squadPlayers.map((p) => {
    const st = seasonStats.find((s) => s.nick === p.nick || s.id === `user__${p.id}`);
    return { player: p, rating: st?.rating ?? 0 };
  });

  const balanceLine = [
    { label: ct('Caixa'), values: [0.4, 0.55, 0.5, 0.65, 0.7, 0.68], color: 'var(--em-green)' },
  ];

  const myTeam = vrsRanking.find((t) => t.isUser);
  const top10Others = vrsRanking.slice(0, 10).filter((t) => !t.isUser);

  const weekNum = Math.min(4, Math.max(1, league.current + 1));
  const weeks = [1, 2, 3, 4].map((w) => ({
    w, label: `W${w}`, current: w === weekNum,
    event: w === weekNum ? eventName.split(' ').slice(0, 2).join(' ') : '',
  }));

  return (
    <div className="em-layout">
      {/* ===== COLUNA ESQUERDA ===== */}
      <div className="em-col em-col-left">
        <section className="em-card em-nextup">
          <div className="em-nextup-bg" style={{ backgroundImage: `url(${MAP_IMAGES.mirage})` }} />
          <div className="em-nextup-scrim" />
          <div className="em-nextup-body">
            <div className="em-card-label">{ct('Próximo jogo')}</div>
            <div className="em-nextup-event">{eventName} | {roundLabel}</div>
            {opp && myMatch ? (
              <div className="em-nextup-teams">
                <div className="em-nextup-team">
                  <TeamBadge tag={save.org?.tag ?? ''} colors={save.org?.colors ?? ['#101820', '#61a8dd']} size={52} logoUrl={save.org?.logo} />
                  <span>{save.org?.tag}</span>
                </div>
                <span className="em-vs">vs</span>
                <button type="button" className="em-nextup-team em-btn-reset" onClick={() => onPickTeam(opp.id)}>
                  <TeamBadge tag={opp.tag} colors={opp.colors} size={52} logoUrl={opp.logoUrl} />
                  <span>{opp.tag}</span>
                </button>
              </div>
            ) : (
              <div className="em-nextup-done"><IconTrophy size={16} /> {ct('Rodada concluída')}</div>
            )}
            <div className="em-nextup-meta">
              <span>{venueLabel}</span>
              <span>{boLabel} · Split {save.split}</span>
            </div>
            {opp && myMatch && (
              <>
                {nextRivalry !== 'none' && (
                  <div className="em-rivalry"><IconSwords size={13} /> {ct('Clássico')} {nextRivalryScore}/12</div>
                )}
                <div className="em-plan-row">{gamePlanPicker}</div>
                <div className="em-nextup-actions">
                  <button type="button" className="em-btn em-btn-primary" onClick={onPlay}>
                    <IconPlay size={13} /> {ct('Jogar')}
                  </button>
                  <button type="button" className="em-btn em-btn-ghost" onClick={onSim}>
                    <IconFastForward size={13} /> {ct('Simular')}
                  </button>
                  <button type="button" className="em-btn em-btn-ghost" onClick={onSimSplit}>{ct('Split')}</button>
                </div>
              </>
            )}
          </div>
        </section>

        <DashCard title={ct('Tarefas')} flush className="em-tasks-card">
          <div className="em-task-list">
            {tasks.length === 0 ? (
              <p className="em-empty">{ct('Nenhuma tarefa pendente.')}</p>
            ) : tasks.map((t) => (
              <div key={t.id} className={`em-task${t.urgent ? ' urgent' : ''}`}>
                <div className="em-task-main">
                  <b>{t.title}</b>
                  <p>{t.body}</p>
                  {t.time && <span className="em-task-time">{t.time}</span>}
                </div>
                <button type="button" className="em-task-open" onClick={onOpenTasks}>
                  {ct('Abrir')} <IconExternal size={11} />
                </button>
              </div>
            ))}
          </div>
        </DashCard>
      </div>

      {/* ===== COLUNA CENTRO ===== */}
      <div className="em-col em-col-center">
        {opp && (
          <DashCard title={ct('Relatório do adversário')} className="em-opp-card">
            <button type="button" className="em-opp-head em-btn-reset clickable" onClick={() => onPickTeam(opp.id)}>
              <TeamBadge tag={opp.tag} colors={opp.colors} size={40} logoUrl={opp.logoUrl} />
              <div className="em-opp-id">
                <b>{opp.name}</b>
                <div className="em-opp-meta">
                  <span>#{oppRank || '—'} {ct('Ranking')}</span>
                  <StarRating value={Math.min(5, opp.strength / 18)} />
                  <span>{ct('Força')} {Math.round(opp.strength)}</span>
                </div>
              </div>
            </button>
            <div className="em-opp-grid">
              <div className="em-opp-col">
                <div className="em-section-label">{ct('Destaques')}</div>
                {oppTop.map((p) => {
                  const scout = oppScoutStats?.[p.id];
                  const pl: Player = {
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
                  return (
                    <PlayerLink
                      key={p.id}
                      player={pl}
                      onOpen={onPickPlayer}
                      className="em-opp-player"
                      avatarSize={36}
                    >
                      <span className="em-opp-player-info">
                        <b>{p.nick}</b>
                        <span>
                          Rating {scout ? scout.rating.toFixed(2) : '—'}
                          {' · '}
                          ADR {scout ? Math.round(scout.adr) : '—'}
                        </span>
                      </span>
                    </PlayerLink>
                  );
                })}
              </div>
              <div className="em-opp-col">
                <div className="em-section-label">{ct('Melhores mapas')}</div>
                {oppMaps.length ? oppMaps.map(([map, pref]) => (
                  <div key={map} className="em-map-row">
                    <img src={MAP_IMAGES[map]} alt="" className="em-map-thumb" />
                    <span>{MAP_LABELS[map]}</span>
                    <div className="em-map-bar"><i style={{ width: `${Math.min(100, pref * 20)}%` }} /></div>
                    <span className="em-map-pct">{Math.round(pref * 20)}%</span>
                  </div>
                )) : (
                  <p className="em-empty">{ct('Sem dados de mapas.')}</p>
                )}
              </div>
            </div>
          </DashCard>
        )}

        <div className="em-row-2">
          <DashCard title={ct('Finanças')} className="em-fin-card">
            <div className="em-fin-body">
              <div className="em-fin-balance">
                <span>{ct('Saldo geral')}</span>
                <b className="em-fin-big">{budgetLabel}</b>
              </div>
              <div className="em-fin-chart-wrap">
                <SparkLine series={balanceLine} height={64} hideLegend compact />
              </div>
              <div className="em-fin-split">
                <div className="em-fin-stat">
                  <span>{ct('Orçamento transferências')}</span>
                  <b>{budgetLabel}</b>
                </div>
                <div className="em-fin-stat">
                  <span>{ct('Folha salarial')}</span>
                  <b className="neg">{wageLabel}</b>
                </div>
                <div className="em-fin-stat">
                  <span>{ct('Química')}</span>
                  <b>{chem}</b>
                </div>
                <div className="em-fin-stat">
                  <span>{ct('Entrosamento')}</span>
                  <b>{fam}%</b>
                </div>
              </div>
            </div>
          </DashCard>

          <DashCard title={ct('Scouting')} className="em-scout-card">
            <div className="em-scout-ring">
              <svg viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--em-border)" strokeWidth="6" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--em-red)" strokeWidth="6"
                  strokeDasharray={`${(squadPlayers.length / 5) * 213} 213`} strokeLinecap="round" transform="rotate(-90 40 40)" />
              </svg>
              <div className="em-scout-val">{5 - squadPlayers.length}/5</div>
            </div>
            <div className="em-scout-label">{ct('Vagas no elenco')}</div>
            <div className="em-scout-stats">
              <div><span>{ct('OVR médio')}</span><b>{avgOvr}</b></div>
              <div><span>VRS</span><b>#{myVrsRank}</b></div>
            </div>
          </DashCard>
        </div>

        <DashCard
          title={ct('Visão do elenco')}
          flush
          actions={<button type="button" className="em-link-btn" onClick={onSquad}>{ct('Gerenciar')} <IconExternal size={11} /></button>}
        >
          <div className="em-roster-scroll">
            <table className="em-roster-table">
              <thead>
                <tr>
                  <th>{ct('Jogador')}</th>
                  <th>{ct('Idade')}</th>
                  <th>{ct('Habilidade')}</th>
                  <th>{ct('Potencial')}</th>
                  <th>{ct('Contrato')}</th>
                  <th>{ct('Humor')}</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {squadPlayers.map((p) => {
                  const oid = playerOrgId(p.id);
                  const ovr = playerOvr(p);
                  const pot = potentialMap[oid] ?? potentialMap[p.id] ?? ovr;
                  const mor = moraleMap[oid] ?? moraleMap[p.id] ?? 70;
                  const left = contracts[oid] != null ? contracts[oid]! - save.split + 1 : contracts[p.id] != null ? contracts[p.id]! - save.split + 1 : null;
                  const st = squadStats.find((x) => x.player.id === p.id || playerOrgId(x.player.id) === oid);
                  return (
                    <tr key={p.id}>
                      <td>
                        <PlayerLink
                          player={p}
                          onOpen={onPickPlayer}
                          className="em-roster-player"
                          avatarSize={28}
                        >
                          <span className="em-roster-player-info">
                            <b>{p.nick}</b>
                            <span><Flag cc={p.country} /> {p.role}</span>
                          </span>
                        </PlayerLink>
                      </td>
                      <td>{ages[oid] ?? ages[p.id] ?? '—'}</td>
                      <td><StarRating value={ovrStars(ovr)} size={10} /></td>
                      <td><StarRating value={potStars(pot)} size={10} /></td>
                      <td>{left == null ? '—' : left <= 0 ? ct('Vencido') : `${left}y`}</td>
                      <td className={mor < 45 ? 'neg' : undefined}>{moodLabel(mor)}</td>
                      <td className={(st?.rating ?? 0) >= 1 ? 'pos' : (st?.rating ?? 0) > 0 ? 'neg' : undefined}>
                        {st?.rating ? st.rating.toFixed(2) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DashCard>
      </div>

      {/* ===== COLUNA DIREITA ===== */}
      <div className="em-col em-col-right">
        <DashCard title={ct('Calendário')} className="em-cal-card">
          <div className="em-cal-month">{ct('Split')} {save.split}</div>
          <div className="em-cal-weeks">
            {weeks.map(({ w, label, current, event }) => (
              <div key={w} className={`em-cal-week${current ? ' on' : ''}`}>
                <div className="em-cal-week-h">{label}</div>
                {event && <div className="em-cal-event">{event}</div>}
              </div>
            ))}
          </div>
          <button type="button" className="em-link-btn em-cal-more" onClick={onOpenCalendar}>{ct('Ver calendário completo')}</button>
        </DashCard>

        <DashCard title={ct('Últimas partidas')} flush className="em-matches-card">
          <div className="em-matches-list">
            {recentMatches.length === 0 ? (
              <p className="em-empty">{ct('Sem partidas ainda.')}</p>
            ) : recentMatches.map((m) => (
              <button key={m.key} type="button" className="em-match-row em-btn-reset" onClick={onOpenResults}>
                <span className={`em-match-ind${m.won ? ' win' : ' loss'}`}>
                  {m.won ? <IconTriangleUp size={9} /> : <IconTriangleDown size={9} />}
                </span>
                <div className="em-match-info">
                  <span className="em-match-opp">{m.opponent}</span>
                  <span className="em-match-meta">{m.label}</span>
                  {m.maps.length > 0 && <span className="em-match-maps">{m.maps.join(' · ')}</span>}
                </div>
                <span className={`em-match-score${m.won ? ' win' : ' loss'}`}>{m.score}</span>
              </button>
            ))}
          </div>
        </DashCard>

        <DashCard
          title={ct('Ranking mundial')}
          flush
          actions={<button type="button" className="em-link-btn" onClick={onOpenVrs}>{ct('Ver tudo')} <IconExternal size={11} /></button>}
        >
          <div className="em-rank-list">
            {myTeam && myVrsRank > 0 && (
              <div className="em-rank-you">
                <div className="em-rank-you-head">
                  <span className="em-rank-you-label">{ct('VOCÊ')}</span>
                </div>
                <button type="button" className="em-rank-row me em-btn-reset clickable" onClick={() => onPickTeam(myTeam.id)}>
                  <span className="em-rank-pos">{myVrsRank}</span>
                  <TeamBadge tag={myTeam.tag} colors={myTeam.colors} size={20} logoUrl={myTeam.logoUrl} />
                  <span className="em-rank-name">{myTeam.name}</span>
                  <span className="em-rank-pts">{Math.round(myTeam.vrs)}</span>
                </button>
              </div>
            )}
            {top10Others.map((t) => {
              const pos = vrsRanking.findIndex((x) => x.id === t.id) + 1;
              return (
                <button key={t.id} type="button" className="em-rank-row em-btn-reset clickable" onClick={() => onPickTeam(t.id)}>
                  <span className="em-rank-pos">{pos}</span>
                  <TeamBadge tag={t.tag} colors={t.colors} size={20} logoUrl={t.logoUrl} />
                  <span className="em-rank-name">{t.name}</span>
                  <span className="em-rank-pts">{Math.round(t.vrs)}</span>
                </button>
              );
            })}
          </div>
          <div className="em-tier-legend">
            {[[ct('Tier 1'), 't1'], [ct('Tier 2'), 't2'], [ct('Tier 3'), 't3'], [ct('Tier 4'), 't4']].map(([lbl, cls]) => (
              <span key={cls} className={`em-tier ${cls}`}>{lbl}</span>
            ))}
          </div>
        </DashCard>

        <DashCard title={ct('Forma recente')}>
          <div className="em-form-row">
            {(form.length ? form.slice(-8) : (['-', '-', '-', '-'] as const)).map((f, i) => (
              <span key={i} className={`em-form-chip${f === 'W' ? ' win' : f === 'L' ? ' loss' : ''}`}>
                {f === 'W' ? <IconTriangleUp size={8} /> : f === 'L' ? <IconTriangleDown size={8} /> : '—'}
              </span>
            ))}
          </div>
          <div className="em-form-stats">
            <span>VRS <b>{Math.round(vrsPoints)}</b></span>
            <span>{ct('Títulos')} <b>{save.titles ?? 0}</b></span>
          </div>
        </DashCard>
      </div>
    </div>
  );
}
