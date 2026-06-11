import { iglProfile, playerTraits, type Trait } from '../engine/ratings';
import { useLang } from '../state/i18n';
import { PLAYSTYLE_ICONS, type TTeam } from '../types';
import { Flag, PlayerAvatar } from './ui';

const TRAIT_ICON: Record<Trait, string> = {
  sniper: '🔭',
  caller: '🧠',
  aim: '🎯',
  clutch: '🧊',
  consistency: '💪',
  entry: '🔥',
  anchor: '🛡️',
  lurker: '🌀',
};

function LineupCard({ team }: { team: TTeam }) {
  const { t } = useLang();
  const igl = iglProfile(team.players);
  return (
    <div className="lineup-card">
      <div className="lineup-head">
        <span className="lh-name">
          <Flag cc={team.country} /> {team.name}
        </span>
        {igl && (
          <span className="lh-igl" title={t('veto.iglStyleHint')}>
            🧠 IGL {igl.nick} · {PLAYSTYLE_ICONS[igl.style]} {t(`playstyle.${igl.style}`)}
          </span>
        )}
      </div>
      <div className="lineup-players">
        {team.players.map((p) => {
          const ps = p.playstyle ?? 'balanced';
          const traits = playerTraits(p);
          return (
            <div key={p.id} className="lp">
              <PlayerAvatar nick={p.nick} size={42} />
              <div className="lp-info">
                <div className="lp-nick">
                  <Flag cc={p.country} /> <b>{p.nick}</b> <span className="lp-ovr">{p.ovr}</span>
                </div>
                <div className="lp-tags">
                  <span className={`role-pill ${p.role}`}>{p.role}</span>
                  <span className="lp-ps" title={t(`playstyle.${ps}`)}>
                    {PLAYSTYLE_ICONS[ps]} {t(`playstyle.${ps}`)}
                  </span>
                  {traits.map((tr) => (
                    <span key={tr} className="lp-trait" title={t(`trait.${tr}`)}>
                      {TRAIT_ICON[tr]} {t(`trait.${tr}`)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Lineups dos dois times lado a lado, com fotos e características de cada jogador
export function TeamLineups({ teams }: { teams: [TTeam, TTeam] }) {
  const { t } = useLang();
  return (
    <div className="panel lineups-panel">
      <div className="panel-head">{t('veto.lineups')}</div>
      <div className="panel-body lineups-grid">
        <LineupCard team={teams[0]} />
        <LineupCard team={teams[1]} />
      </div>
    </div>
  );
}
