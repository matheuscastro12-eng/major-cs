import { useMemo, useState } from 'react';
import { refreshUserTeam, toTPlayer } from '../engine/ratings';
import type { Player, TeamSeason, TPlayer, TTeam } from '../types';
import { Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';
import { logoForTeam } from '../data/media';

export interface TransferOffer {
  player: Player;
  from: TeamSeason;
}

interface Props {
  user: TTeam;
  season: number;
  titles: number;
  evolution: { nick: string; delta: number }[];
  offers: TransferOffer[];
  onConfirm: (team: TTeam) => void;
}

// Janela de transferências entre temporadas: troque até 1 jogador do elenco
// por uma das ofertas do mercado (ou mantenha a base).
export function TransferScreen({ user, season, titles, evolution, offers, onConfirm }: Props) {
  const [outId, setOutId] = useState<string | null>(null);
  const [inIdx, setInIdx] = useState<number | null>(null);

  const evoOf = (nick: string) => evolution.find((e) => e.nick === nick)?.delta ?? 0;

  const preview = useMemo(() => {
    if (outId === null || inIdx === null) return refreshUserTeam(user);
    const offer = offers[inIdx];
    const players = user.players.map((p) =>
      p.id === outId
        ? toTPlayer(offer.player, {
            runtimeId: `user__${offer.player.id}__s${season}`,
            fromTeam: `${offer.from.game} • ${offer.from.team} ${offer.from.era}`,
            originTeam: offer.from.team,
            originTeamId: offer.from.id,
            originEra: offer.from.era,
            originGame: offer.from.game,
          })
        : p,
    );
    return refreshUserTeam({ ...user, players });
  }, [user, outId, inIdx, offers, season]);

  const current = useMemo(() => refreshUserTeam(user), [user]);
  const delta = preview.strength - current.strength;

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="season-banner">
          <h2>
            🔁 Janela de transferências - rumo à temporada {season}
          </h2>
          <div className="muted small">
            {titles > 0 ? `🏆 ${titles} título(s) na carreira · ` : ''}
            Seus jogadores evoluíram com base no rendimento. Troque até 1 peça ou mantenha a base.
          </div>
        </div>
        <div className="panel-body">
          <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
            Seu elenco (clique para colocar na mesa)
          </div>
          <div className="roster-slots">
            {user.players.map((p) => {
              const evo = evoOf(p.nick);
              return (
                <button
                  key={p.id}
                  className={`slot filled${outId === p.id ? ' selling' : ''}`}
                  style={{ cursor: 'pointer', borderColor: outId === p.id ? 'var(--red)' : undefined }}
                  onClick={() => setOutId(outId === p.id ? null : p.id)}
                >
                  <div className="nick">
                    <Flag cc={p.country} /> {p.nick} <span className="ovr-inline">{p.ovr}</span>
                  </div>
                  <span className={`role-pill ${p.role}`}>{p.role}</span>
                  {evo !== 0 && (
                    <span className={`evo ${evo > 0 ? 'up' : 'down'}`}>
                      {evo > 0 ? `▲ +${evo}` : `▼ ${evo}`} evolução
                    </span>
                  )}
                  <div className="from">{outId === p.id ? '⚠ na mesa de negociação' : p.fromTeam}</div>
                </button>
              );
            })}
          </div>

          <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, margin: '16px 0 6px' }}>
            Mercado - ofertas desta janela
          </div>
          <div className="player-cards" style={{ padding: 0 }}>
            {offers.map((o, i) => {
              const tp = toTPlayer(o.player);
              return (
                <button
                  key={i}
                  className={`pcard${inIdx === i ? ' sel' : ''}`}
                  style={{ borderColor: inIdx === i ? 'var(--green)' : undefined }}
                  onClick={() => setInIdx(inIdx === i ? null : i)}
                >
                  <PlayerAvatar nick={o.player.nick} size={56} />
                  <OvrBadge ovr={tp.ovr} />
                  <div className="nick">{o.player.nick}</div>
                  <div className="meta">
                    <Flag cc={o.player.country} />
                    <span>{o.player.name}</span>
                  </div>
                  <div className="meta">
                    <span className={`role-pill ${o.player.role}`}>{o.player.role}</span>
                  </div>
                  <div className="meta muted small">
                    <TeamBadge tag={o.from.tag} colors={o.from.colors} size={18} logoUrl={o.from.logoUrl ?? logoForTeam(o.from)} />{' '}
                    {o.from.team} {o.from.era}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="center" style={{ marginTop: 18 }}>
            <div className="muted small" style={{ marginBottom: 10 }}>
              {outId && inIdx !== null ? (
                <>
                  Troca selecionada - força do time: {current.strength.toFixed(1)} →{' '}
                  <b className={delta >= 0 ? 'pos' : 'neg'}>{preview.strength.toFixed(1)}</b>{' '}
                  ({delta >= 0 ? '+' : ''}
                  {delta.toFixed(1)})
                </>
              ) : (
                'Nenhuma troca selecionada - você pode seguir com a mesma base.'
              )}
            </div>
            <button className="btn gold big" onClick={() => onConfirm(preview)}>
              ✔ Confirmar e começar a temporada {season}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function buildEvolution(user: TTeam): { nick: string; delta: number }[] {
  return user.players.map((p) => ({
    nick: p.nick,
    delta: Math.max(-2, Math.min(3, Math.round(((p.form ?? 1) - 1) * 22))),
  }));
}

export function applyEvolution(user: TTeam, evolution: { nick: string; delta: number }[]): TTeam {
  const players: TPlayer[] = user.players.map((p) => {
    const evo = evolution.find((e) => e.nick === p.nick)?.delta ?? 0;
    const clamp = (v: number) => Math.max(40, Math.min(99, v));
    return { ...p, aim: clamp(p.aim + evo), consistency: clamp(p.consistency + evo), form: 1 };
  });
  return refreshUserTeam({ ...user, players });
}
