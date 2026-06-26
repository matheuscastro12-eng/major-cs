import { draftSynergy } from '../engine/ratings';
import { getTeam, phaseLabelDisplay, standings, userPairing } from '../engine/swiss';
import type { Pairing, Tournament } from '../types';
import { useLang } from '../state/i18n';
import { TournamentBracket } from './Bracket';
import { Flag, PlayerAvatar, TeamBadge, TeamName } from './ui';

import type { CareerState, PickemState } from '../App';

interface Props {
  t: Tournament;
  career: CareerState;
  pickem: PickemState;
  onPick: (key: string, teamId: string) => void;
  onPlay: () => void;
  onSimRound: () => void;
  onStats: () => void;
  onOpenSeries: (p: Pairing) => void;
}

function MatchLine({
  t,
  p,
  highlight,
  pickem,
  onPick,
  onOpenSeries,
}: {
  t: Tournament;
  p: Pairing;
  highlight: boolean;
  pickem?: PickemState;
  onPick?: (key: string, teamId: string) => void;
  onOpenSeries?: (p: Pairing) => void;
}) {
  const { t: tr } = useLang();
  const a = getTeam(t, p.a);
  const b = getTeam(t, p.b);
  const r = p.result;
  const key = `${p.a}|${p.b}`;
  const myPick = pickem?.picks[key];
  const canPick = !highlight && !r && pickem && onPick;
  const clickable = !!r && !!onOpenSeries;

  return (
    <div
      className={`matchline${highlight ? ' user-match' : ''}${clickable ? ' clickable' : ''}`}
      onClick={clickable ? () => onOpenSeries!(p) : undefined}
      title={clickable ? tr('hub.viewSeriesStats') : undefined}
    >
      <TeamName team={a} dim={r ? r.winner === 1 : false} />
      <span className="score">
        {r ? (
          <>
            <span className={r.winner === 0 ? 'w' : 'l'}>{r.mapScore[0]}</span>
            {' : '}
            <span className={r.winner === 1 ? 'w' : 'l'}>{r.mapScore[1]}</span>
          </>
        ) : canPick ? (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <button className={`pick-btn${myPick === p.a ? ' on' : ''}`} onClick={() => onPick!(key, p.a)} title={`${tr('hub.betOn')} ${a.name}`}>
              {a.tag}
            </button>
            <button className={`pick-btn${myPick === p.b ? ' on' : ''}`} onClick={() => onPick!(key, p.b)} title={`${tr('hub.betOn')} ${b.name}`}>
              {b.tag}
            </button>
          </span>
        ) : (
          'vs'
        )}
      </span>
      <span className="side right">
        <span className={`tname${r && r.winner === 0 ? ' loser' : ''}`}>{b.name}</span>
        <Flag cc={b.country} />
        <TeamBadge tag={b.tag} colors={b.colors} logoUrl={b.logoUrl} />
      </span>
      <span className="muted small">{p.label}</span>
    </div>
  );
}

export function Hub({ t, career, pickem, onPick, onPlay, onSimRound, onStats, onOpenSeries }: Props) {
  const { t: tr } = useLang();
  const up = userPairing(t);
  const user = getTeam(t, 'user');
  const inSwiss = t.phase === 'swiss';
  const synergy = draftSynergy(user.players);
  const hasPickable = t.pairings.some((p) => p.a !== 'user' && p.b !== 'user' && !p.result);

  return (
    <div className="fade-in">
      {/* botão flutuante: ir pra sua partida sem precisar rolar a tela toda */}
      {up && (
        <button className="hub-fab" onClick={onPlay}>
          ▶ {tr('hub.playMyMatch')}
        </button>
      )}
      <div className="panel">
        <div className="panel-head">
          {t.name} - {phaseLabelDisplay(t)}
          {career.titles > 0 && <span className="gold-text small">🏆×{career.titles}</span>}
          <span className="spacer" />
          {pickem.total > 0 && (
            <span className="pickem-score" title={tr('hub.pickemHits')}>
              🎯 Pick'Em {pickem.score}/{pickem.total}
            </span>
          )}
          <button className="btn ghost" onClick={onStats}>
            {tr('hub.stats')}
          </button>
          {up ? (
            <button className="btn gold" onClick={onPlay}>
              ▶ {tr('hub.playMyMatch')}
            </button>
          ) : t.phase !== 'done' ? (
            <button className="btn" onClick={onSimRound}>
              ⏩ {tr('hub.simRound')}
            </button>
          ) : null}
        </div>
        <div className="panel-body tight">
          {hasPickable && (
            <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-soft)' }}>
              <span className="pickem-hint">🎯 {tr('hub.pickemHint')}</span>
            </div>
          )}
          {t.pairings.map((p, i) => (
            <MatchLine key={i} t={t} p={p} highlight={p.a === 'user' || p.b === 'user'} pickem={pickem} onPick={onPick} onOpenSeries={onOpenSeries} />
          ))}
        </div>
      </div>

      <TournamentBracket t={t} onOpen={onOpenSeries} />

      {inSwiss && (
        <div className="panel">
          <div className="panel-head">{tr('hub.standings')}</div>
          <div className="panel-body tight">
            <table className="standings">
              <tbody>
                {standings(t).map((team, i) => (
                  <tr key={team.id} className={team.isUser ? 'is-user' : ''}>
                    <td className="muted" style={{ width: 28 }}>
                      {i + 1}.
                    </td>
                    <td>
                      <span className="pcell">
                        <TeamBadge tag={team.tag} colors={team.colors} size={22} logoUrl={team.logoUrl} />
                        <Flag cc={team.country} />
                        <span style={{ color: team.isUser ? 'var(--em-gold)' : undefined, fontWeight: team.isUser ? 700 : 500 }}>
                          {team.name}
                        </span>
                        <span className="muted small">{team.game === 'MIX' ? tr('hub.dreamTeam') : team.game}</span>
                      </span>
                    </td>
                    <td style={{ width: 70, textAlign: 'center' }}>
                      <span className={`rec${team.wins > team.losses ? ' good' : team.losses > team.wins ? ' bad' : ''}`}>
                        {team.wins} - {team.losses}
                      </span>
                    </td>
                    <td style={{ width: 60, textAlign: 'right' }} className="muted">
                      {team.roundDiff > 0 ? `+${team.roundDiff}` : team.roundDiff}
                    </td>
                    <td style={{ width: 110, textAlign: 'right' }}>
                      <span className={`status-tag ${team.status}`}>
                        {team.status === 'advanced' ? tr('hub.statusAdvanced') : team.status === 'eliminated' ? tr('hub.statusEliminated') : tr('hub.statusInPlay')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!inSwiss && (
        <div className="panel">
          <div className="panel-head">{tr('hub.playoffs')}</div>
          <div className="panel-body">
            <div className="muted small">
              {tr('hub.playoffsDesc')}
            </div>
          </div>
        </div>
      )}

      {t.history.length > 0 && (
        <div className="panel">
          <div className="panel-head">{tr('hub.pastResults')}</div>
          <div className="panel-body tight">
            {[...t.history].reverse().map((h, i) => (
              <div key={i}>
                <div style={{ padding: '5px 12px', background: 'var(--header)', color: 'var(--dim)', fontSize: 11 }}>
                  {h.phase}
                </div>
                <MatchLine t={t} p={h.pairing} highlight={h.pairing.a === 'user' || h.pairing.b === 'user'} onOpenSeries={onOpenSeries} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          {tr('hub.yourRoster')} - {user.name}
          <span className="spacer" />
          <span className="muted small" style={{ textTransform: 'none' }}>
            {tr('hub.strength')} {user.strength.toFixed(1)}
          </span>
        </div>
        <div className="panel-body">
          <div className="roster-slots">
            {user.players.map((p) => {
              const f = p.form ?? 1;
              const formIcon = f >= 1.04 ? ' 🔥' : f <= 0.96 ? ' 🥶' : '';
              return (
                <div key={p.id} className="slot filled">
                  <div className="nick">
                    <Flag cc={p.country} /> {p.nick} <span className="ovr-inline">{p.ovr}</span>
                    {formIcon}
                  </div>
                  <span className={`role-pill ${p.role}`}>{p.role}</span>
                  <div className="from">{p.fromTeam}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12, alignItems: 'start' }}>
            <div className="coach-card">
              <PlayerAvatar nick={user.coach.nick} size={42} coach />
              <div>
                <div className="label">{tr('common.coach')} · {tr(`coach.${user.coach.style}`)} · {user.coach.rating}</div>
                <div className="nick">
                  <Flag cc={user.coach.country} /> {user.coach.nick}
                </div>
                <div className="style">{tr(`coach.${user.coach.style}Desc`)}</div>
              </div>
            </div>
            <div>
              <div className="muted small" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
                {tr('hub.synergy')} ({synergy.total >= 0 ? '+' : ''}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
