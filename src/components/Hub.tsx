import { draftSynergy } from '../engine/ratings';
import { getTeam, phaseLabel, standings, userPairing } from '../engine/swiss';
import type { Pairing, Tournament } from '../types';
import { COACH_STYLE_DESC, COACH_STYLE_LABELS } from '../types';
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
      title={clickable ? 'Ver estatísticas da série' : undefined}
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
            <button className={`pick-btn${myPick === p.a ? ' on' : ''}`} onClick={() => onPick!(key, p.a)} title={`Apostar em ${a.name}`}>
              {a.tag}
            </button>
            <button className={`pick-btn${myPick === p.b ? ' on' : ''}`} onClick={() => onPick!(key, p.b)} title={`Apostar em ${b.name}`}>
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
  const up = userPairing(t);
  const user = getTeam(t, 'user');
  const inSwiss = t.phase === 'swiss';
  const synergy = draftSynergy(user.players);
  const hasPickable = t.pairings.some((p) => p.a !== 'user' && p.b !== 'user' && !p.result);

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          {t.name} - {phaseLabel(t)}
          {career.titles > 0 && <span className="gold-text small">🏆×{career.titles}</span>}
          <span className="spacer" />
          {pickem.total > 0 && (
            <span className="pickem-score" title="Acertos no Pick'Em">
              🎯 Pick'Em {pickem.score}/{pickem.total}
            </span>
          )}
          <button className="btn ghost" onClick={onStats}>
            📊 Stats
          </button>
          {up ? (
            <button className="btn gold" onClick={onPlay}>
              ▶ Jogar minha partida
            </button>
          ) : t.phase !== 'done' ? (
            <button className="btn" onClick={onSimRound}>
              ⏩ Simular rodada
            </button>
          ) : null}
        </div>
        <div className="panel-body tight">
          {hasPickable && (
            <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-soft)' }}>
              <span className="pickem-hint">🎯 Pick'Em: aposte nos vencedores das outras séries e some pontos</span>
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
          <div className="panel-head">Classificação - fase suíça</div>
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
                        <span style={{ color: team.isUser ? 'var(--blue-bright)' : undefined, fontWeight: team.isUser ? 700 : 500 }}>
                          {team.name}
                        </span>
                        <span className="muted small">{team.game === 'MIX' ? 'Dream Team' : team.game}</span>
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
                        {team.status === 'advanced' ? 'Classificado' : team.status === 'eliminated' ? 'Eliminado' : 'Na disputa'}
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
          <div className="panel-head">Playoffs</div>
          <div className="panel-body">
            <div className="muted small">
              Quartas, semis e final em MD3. Os 8 classificados da fase suíça foram chaveados pela campanha.
            </div>
          </div>
        </div>
      )}

      {t.history.length > 0 && (
        <div className="panel">
          <div className="panel-head">Resultados anteriores</div>
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
          Seu elenco - {user.name}
          <span className="spacer" />
          <span className="muted small" style={{ textTransform: 'none' }}>
            força {user.strength.toFixed(1)}
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
                <div className="label">Coach · {COACH_STYLE_LABELS[user.coach.style]} · {user.coach.rating}</div>
                <div className="nick">
                  <Flag cc={user.coach.country} /> {user.coach.nick}
                </div>
                <div className="style">{COACH_STYLE_DESC[user.coach.style]}</div>
              </div>
            </div>
            <div>
              <div className="muted small" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
                Sinergia da composição ({synergy.total >= 0 ? '+' : ''}
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
