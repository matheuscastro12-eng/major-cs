// Cartinha "Ultimate Team" compartilhada (ut-card): usada no draft do Online e no
// PackDraft (Gauntlet). Mesmo visual de carta em todos os modos.
import { playerOvr } from '../../engine/ratings';
import { Flag, PlayerAvatar } from '../ui';
import type { Player, TeamSeason } from '../../types';

export function cardTier(ovr: number): { label: string; className: string } {
  if (ovr >= 92) return { label: 'ICON', className: 'icon' };
  if (ovr >= 88) return { label: 'LEGENDARY', className: 'legendary' };
  if (ovr >= 84) return { label: 'ELITE', className: 'elite' };
  return { label: 'GOLD', className: 'gold' };
}

export function UltimatePlayerCard({
  player,
  source,
  taken,
  blocked,
  currentLabel,
  legendLabel,
  revealIndex,
  onPick,
}: {
  player: Player;
  source: TeamSeason;
  taken: boolean;
  blocked?: string | null;
  currentLabel: string;
  legendLabel: string;
  revealIndex: number;
  onPick: () => void;
}) {
  const ovr = playerOvr(player);
  const tier = cardTier(ovr);
  const current = source.game === 'CS2' && /2026/.test(source.era);
  return (
    <button type="button" title={blocked ?? undefined} style={{ animationDelay: `${revealIndex * 110}ms` }} className={`ut-card ut-pack-card ${tier.className}${taken || blocked ? ' taken' : ''}`} onClick={onPick} disabled={taken || !!blocked}>
      <div className="ut-card-top">
        <span className="ut-card-rating">{ovr}</span>
        <span className="ut-card-tier">{tier.label}</span>
        <span className={`ut-card-era ${current ? 'current' : ''}`}>{current ? currentLabel : legendLabel}</span>
      </div>
      <div className="ut-card-photo"><PlayerAvatar nick={player.nick} size={82} /></div>
      <div className="ut-card-name">{player.nick}</div>
      <div className="ut-card-origin">
        <Flag cc={player.country} /> {source.tag} · {source.era}
      </div>
      <div className="ut-card-role"><span className={`role-pill ${player.role}`}>{player.role}</span></div>
      <div className="ut-card-stats">
        <span><b>{player.aim}</b> AIM</span>
        <span><b>{player.clutch}</b> CLU</span>
        <span><b>{player.consistency}</b> CON</span>
        <span><b>{player.awp}</b> AWP</span>
        <span><b>{player.igl}</b> IGL</span>
      </div>
      <span className="ut-card-pick">{taken ? 'NO ELENCO' : blocked ?? 'CONTRATAR'}</span>
    </button>
  );
}
