import { useMemo, useState } from 'react';
import { getTeam } from '../engine/swiss';
import type { Tournament } from '../types';
import { Flag, TeamBadge } from './ui';

interface Props {
  t: Tournament;
  onRestart: () => void;
  onStats: () => void;
}

function userCampaign(t: Tournament): { label: string; placement: string } {
  const user = getTeam(t, 'user');
  const isChampion = t.championId === 'user';
  if (isChampion) return { label: 'CAMPEÃO DO MAJOR', placement: '1º lugar' };

  // última fase em que o usuário jogou
  const userMatches = t.history.filter((h) => h.pairing.a === 'user' || h.pairing.b === 'user');
  const last = userMatches[userMatches.length - 1];
  if (!last) return { label: 'ELIMINADO', placement: '—' };
  if (last.phase.includes('FINAL')) return { label: 'VICE-CAMPEÃO', placement: '2º lugar' };
  if (last.phase.includes('Semifinal')) return { label: 'ELIMINADO NA SEMI', placement: '3º-4º lugar' };
  if (last.phase.includes('Quartas')) return { label: 'ELIMINADO NAS QUARTAS', placement: '5º-8º lugar' };
  return { label: 'ELIMINADO NA FASE SUÍÇA', placement: `campanha ${user.wins}-${user.losses}` };
}

export function FinalScreen({ t, onRestart, onStats }: Props) {
  const champion = t.championId ? getTeam(t, t.championId) : undefined;
  const isChampion = t.championId === 'user';
  const user = getTeam(t, 'user');
  const campaign = useMemo(() => userCampaign(t), [t]);
  const [copied, setCopied] = useState(false);

  const mvp = useMemo(() => {
    if (!t.mvpId || !champion) return undefined;
    return champion.players.find((p) => p.id === t.mvpId);
  }, [t, champion]);

  const share = async () => {
    const lines = [
      `🏆 MAJOR//CS — ${campaign.label}`,
      `Time: ${user.name} (${campaign.placement})`,
      `Elenco: ${user.players.map((p) => p.nick).join(', ')}`,
      champion && !isChampion ? `Campeão: ${champion.name}` : '',
      mvp ? `MVP do torneio: ${mvp.nick}` : '',
      'Monte o seu em MAJOR//CS!',
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponível */
    }
  };

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="finale">
          <div className="trophy">{isChampion ? '🏆' : '🥀'}</div>
          <h1 className={isChampion ? '' : 'lost'}>{campaign.label}</h1>
          <p className="sub">
            {isChampion ? (
              <>
                <b>{user.name}</b> venceu o {t.name} com lendas de todas as eras. {campaign.placement}.
              </>
            ) : (
              <>
                Sua campanha terminou: <b>{campaign.placement}</b>.
                {champion && (
                  <>
                    {' '}
                    O título ficou com <b>{champion.name}</b>.
                  </>
                )}
              </>
            )}
          </p>

          {champion && (
            <div style={{ marginBottom: 10 }}>
              <span className="pcell" style={{ justifyContent: 'center' }}>
                <TeamBadge tag={champion.tag} colors={champion.colors} size={34} logoUrl={champion.logoUrl} />
                <Flag cc={champion.country} />
                <b style={{ fontSize: 16 }}>{champion.name}</b>
                <span className="gold-text">— campeão</span>
              </span>
            </div>
          )}

          {mvp && (
            <div className="mvp-card">
              <div className="avatar">{mvp.nick.slice(0, 2).toUpperCase()}</div>
              <div>
                <div className="label">MVP do torneio</div>
                <div className="nick">
                  <Flag cc={mvp.country} /> {mvp.nick}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={onStats}>
              📊 Stats do campeonato
            </button>
            <button className="btn gold" onClick={share}>
              {copied ? '✔ Copiado!' : '📋 Copiar resultado'}
            </button>
            <button className="btn big" onClick={onRestart}>
              Jogar de novo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
