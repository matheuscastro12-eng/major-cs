import { useMemo, useState } from 'react';
import { formatMoney, playerValue, refreshUserTeam, toTPlayer } from '../engine/ratings';
import type { Player, TeamSeason, TPlayer, TTeam } from '../types';
import { Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';
import { logoForTeam } from '../data/media';
import { useLang } from '../state/i18n';

export interface TransferOffer {
  player: Player;
  from: TeamSeason;
}

interface Props {
  user: TTeam;
  season: number;
  titles: number;
  budget: number;
  evolution: { nick: string; delta: number }[];
  offers: TransferOffer[];
  onConfirm: (team: TTeam, cost: number) => void;
}

const SELL_FACTOR = 0.85; // vende por 85% do valor de mercado

// Janela de transferências entre temporadas: troque até 1 jogador do elenco
// por uma das ofertas do mercado (ou mantenha a base).
export function TransferScreen({ user, season, titles, budget, evolution, offers, onConfirm }: Props) {
  const { t } = useLang();
  const [outId, setOutId] = useState<string | null>(null);
  const [inIdx, setInIdx] = useState<number | null>(null);
  const [coachIdx, setCoachIdx] = useState(0); // 0 = mantém o coach atual

  const evoOf = (nick: string) => evolution.find((e) => e.nick === nick)?.delta ?? 0;
  const outPlayer = outId ? user.players.find((p) => p.id === outId) ?? null : null;
  const sellValue = outPlayer ? Math.round(playerValue(outPlayer) * SELL_FACTOR) : 0;
  const buyFee = inIdx !== null ? playerValue(toTPlayer(offers[inIdx].player)) : 0;
  const tradeReady = outId !== null && inIdx !== null;

  // coaches disponíveis para trocar: o atual + os coaches dos times das ofertas
  const coachOptions = useMemo(() => {
    const seen = new Set([user.coach.nick.toLowerCase()]);
    const opts = [user.coach];
    for (const o of offers) {
      const c = o.from.coach;
      if (c && !seen.has(c.nick.toLowerCase())) {
        seen.add(c.nick.toLowerCase());
        opts.push(c);
      }
    }
    return opts;
  }, [user.coach, offers]);
  const newCoach = coachOptions[coachIdx] ?? user.coach;
  const coachChanged = newCoach.nick !== user.coach.nick;
  const coachFee = coachChanged ? Math.max(0, (newCoach.rating - 65) * 30000) : 0;

  const playerNet = tradeReady ? buyFee - sellValue : 0;
  const netCost = playerNet + coachFee; // pode ser negativo (lucro na venda)
  const budgetAfter = budget - netCost;
  const canAfford = budgetAfter >= 0;
  const hasChange = tradeReady || coachChanged;

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

  const previewTeam = useMemo(() => ({ ...preview, coach: newCoach }), [preview, newCoach]);

  const current = useMemo(() => refreshUserTeam(user), [user]);
  const delta = preview.strength - current.strength;

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="season-banner">
          <h2>
            🔁 {t('transfer.windowTitle')} {season}
          </h2>
          <div className="muted small">
            {titles > 0 ? `🏆 ${titles} ${t('transfer.careerTitles')} · ` : ''}
            {t('transfer.evolvedHint')}
          </div>
          <div className="budget-line">
            💰 {t('transfer.clubCash')}: <b>{formatMoney(budget)}</b>
          </div>
        </div>
        <div className="panel-body">
          <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
            {t('transfer.yourRoster')}
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
                      {evo > 0 ? `▲ +${evo}` : `▼ ${evo}`} {t('transfer.evolution')}
                    </span>
                  )}
                  <div className="price sell">{t('transfer.sellsFor')} {formatMoney(Math.round(playerValue(p) * SELL_FACTOR))}</div>
                  <div className="from">{outId === p.id ? `⚠ ${t('transfer.onTable')}` : p.fromTeam}</div>
                </button>
              );
            })}
          </div>

          <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, margin: '16px 0 6px' }}>
            {t('transfer.marketOffers')}
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
                  <div className="price buy">💰 {formatMoney(playerValue(tp))}</div>
                </button>
              );
            })}
          </div>

          <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, margin: '16px 0 6px' }}>
            {t('transfer.coachTitle')}
          </div>
          <div className="career-coaches">
            {coachOptions.map((c, i) => {
              const fee = i === 0 ? 0 : Math.max(0, (c.rating - 65) * 30000);
              return (
                <button
                  key={c.nick + i}
                  className={`call-btn${coachIdx === i ? ' armed' : ''}`}
                  title={t(`coach.${c.style}Desc`)}
                  onClick={() => setCoachIdx(i)}
                >
                  {i === 0 ? '✓ ' : ''}{c.nick} · {c.rating} · {t(`coach.${c.style}`)}
                  {i > 0 && ` · ${formatMoney(fee)}`}
                </button>
              );
            })}
          </div>

          <div className="center" style={{ marginTop: 18 }}>
            {hasChange ? (
              <div className="trade-summary">
                <div className="muted small">
                  {t('transfer.teamStrength')}: {current.strength.toFixed(1)} →{' '}
                  <b className={delta >= 0 ? 'pos' : 'neg'}>{previewTeam.strength.toFixed(1)}</b>{' '}
                  ({delta >= 0 ? '+' : ''}
                  {delta.toFixed(1)})
                  {coachChanged && <> · coach → <b>{newCoach.nick}</b></>}
                </div>
                <div className="trade-money">
                  {tradeReady && <span>{t('transfer.buy')} <b>{formatMoney(buyFee)}</b></span>}
                  {tradeReady && <span>{t('transfer.sell')} <b className="pos">+{formatMoney(sellValue)}</b></span>}
                  {coachChanged && <span>coach <b>{formatMoney(coachFee)}</b></span>}
                  <span>
                    {t('transfer.tradeBalance')}{' '}
                    <b className={netCost > 0 ? 'neg' : 'pos'}>
                      {netCost > 0 ? '-' : '+'}
                      {formatMoney(Math.abs(netCost))}
                    </b>
                  </span>
                  <span>
                    {t('transfer.cashAfter')}{' '}
                    <b className={canAfford ? 'pos' : 'neg'}>{formatMoney(budgetAfter)}</b>
                  </span>
                </div>
                {!canAfford && <div className="neg small">{t('transfer.insufficientCash')}</div>}
              </div>
            ) : (
              <div className="muted small" style={{ marginBottom: 10 }}>
                {t('transfer.selectHint')}
              </div>
            )}
            <button
              className="btn gold big"
              disabled={!canAfford}
              onClick={() => onConfirm(previewTeam, netCost)}
            >
              ✔ {t('transfer.confirmStart')} {season}
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
