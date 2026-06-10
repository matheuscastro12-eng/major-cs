import { useEffect, useMemo, useRef, useState } from 'react';
import type { CareerState, PickemState } from '../App';
import { computeDisplay, mergeLines } from '../engine/match';
import { getTeam } from '../engine/swiss';
import { downloadShareCard } from '../state/share';
import type { Tournament, TournamentPool } from '../types';
import { Flag, TeamBadge } from './ui';

interface Props {
  t: Tournament;
  career: CareerState;
  pickem: PickemState;
  pool: TournamentPool;
  onRestart: () => void;
  onStats: () => void;
  onHall: () => void;
  onNextSeason: () => void;
  onDonate: () => void;
}

function userCampaign(t: Tournament): { label: string; placement: string; placementCode: string } {
  const user = getTeam(t, 'user');
  const isChampion = t.championId === 'user';
  if (isChampion) return { label: 'CAMPEÃO DO MAJOR', placement: '1º lugar', placementCode: '1' };

  const userMatches = t.history.filter((h) => h.pairing.a === 'user' || h.pairing.b === 'user');
  const last = userMatches[userMatches.length - 1];
  if (!last) return { label: 'ELIMINADO', placement: '—', placementCode: '16' };
  if (last.phase.includes('FINAL')) return { label: 'VICE-CAMPEÃO', placement: '2º lugar', placementCode: '2' };
  if (last.phase.includes('Semifinal')) return { label: 'ELIMINADO NA SEMI', placement: '3º-4º lugar', placementCode: '3-4' };
  if (last.phase.includes('Quartas')) return { label: 'ELIMINADO NAS QUARTAS', placement: '5º-8º lugar', placementCode: '5-8' };
  return { label: 'ELIMINADO NA FASE SUÍÇA', placement: `campanha ${user.wins}-${user.losses}`, placementCode: '9-16' };
}

// recordes da campanha do usuário (para o Hall da Fama)
function userRecords(t: Tournament, pickem: PickemState) {
  const user = getTeam(t, 'user');
  let bestRating = 0;
  let bestRatingPlayer = '';
  let biggestFrag = 0;
  let biggestFragPlayer = '';
  for (const p of user.players) {
    const lines = [];
    for (const h of t.history) {
      const res = h.pairing.result;
      if (!res) continue;
      for (const m of res.maps) {
        const st = m.stats[p.id];
        if (!st) continue;
        lines.push(st.both);
        if (st.both.kills > biggestFrag) {
          biggestFrag = st.both.kills;
          biggestFragPlayer = p.nick;
        }
      }
    }
    if (lines.length > 0) {
      const r = computeDisplay(mergeLines(lines)).rating;
      if (r > bestRating) {
        bestRating = r;
        bestRatingPlayer = p.nick;
      }
    }
  }
  return {
    bestRating: Number(bestRating.toFixed(2)),
    bestRatingPlayer,
    biggestFrag,
    biggestFragPlayer,
    pickemScore: pickem.total > 0 ? `${pickem.score}/${pickem.total}` : '',
  };
}

export function FinalScreen({ t, career, pickem, pool, onRestart, onStats, onHall, onNextSeason, onDonate }: Props) {
  const champion = t.championId ? getTeam(t, t.championId) : undefined;
  const isChampion = t.championId === 'user';
  const user = getTeam(t, 'user');
  const campaign = useMemo(() => userCampaign(t), [t]);
  const [copied, setCopied] = useState(false);
  const [hallStatus, setHallStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const postedRef = useRef(false);

  const mvp = useMemo(() => {
    if (!t.mvpId || !champion) return undefined;
    return champion.players.find((p) => p.id === t.mvpId);
  }, [t, champion]);

  // registra a campanha no Hall da Fama (no máximo uma vez por torneio:
  // a chave é gravada ANTES do fetch para nunca duplicar registro)
  useEffect(() => {
    if (postedRef.current) return;
    const hallKey = `major-hall-posted-${user.name}-${career.season}-${campaign.placementCode}-${t.history.length}`;
    if (localStorage.getItem(hallKey)) return;
    postedRef.current = true;
    localStorage.setItem(hallKey, '1');
    setHallStatus('saving');
    fetch('/api/hall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamName: user.name,
        pool,
        placement: campaign.placementCode,
        champion: champion?.name ?? '?',
        mvp: mvp?.nick ?? '',
        season: career.season,
        roster: user.players.map((p) => ({ nick: p.nick, country: p.country, ovr: p.ovr })),
        records: userRecords(t, pickem),
      }),
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => setHallStatus(r.ok ? 'saved' : 'error'))
      .catch(() => setHallStatus('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    const lines = [
      `🏆 MAJOR//CS — ${campaign.label}`,
      `Time: ${user.name} (${campaign.placement})${career.season > 1 ? ` · temporada ${career.season}` : ''}`,
      `Elenco: ${user.players.map((p) => p.nick).join(', ')} · coach ${user.coach.nick}`,
      champion && !isChampion ? `Campeão: ${champion.name}` : '',
      mvp ? `MVP do torneio: ${mvp.nick}` : '',
      pickem.total > 0 ? `Pick'Em: ${pickem.score}/${pickem.total}` : '',
      'Monte o seu: https://major-cs-pi.vercel.app',
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
                <b>{user.name}</b> venceu o {t.name}. {campaign.placement}
                {career.titles > 1 ? ` — ${career.titles}º título da carreira!` : '.'}
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
            {pickem.total > 0 && (
              <>
                {' '}
                🎯 Pick'Em: <b>
                  {pickem.score}/{pickem.total}
                </b>{' '}
                palpites certos.
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
            <button className="btn gold big" onClick={onNextSeason}>
              🔁 Próxima temporada (transferências)
            </button>
            <button className="btn" onClick={onStats}>
              📊 Stats
            </button>
            <button className="btn" onClick={onHall}>
              🏛 Hall da Fama
            </button>
            <button className="btn" onClick={() => downloadShareCard(t, user, campaign.label, mvp?.nick)}>
              🖼 Baixar card
            </button>
            <button className="btn ghost" onClick={share}>
              {copied ? '✔ Copiado!' : '📋 Copiar texto'}
            </button>
            <button className="btn ghost" onClick={onRestart}>
              Novo draft
            </button>
          </div>

          <div className="muted small" style={{ marginTop: 14 }}>
            {hallStatus === 'saved' && '✔ Campanha registrada no Hall da Fama.'}
            {hallStatus === 'saving' && 'Registrando campanha no Hall da Fama…'}
            {hallStatus === 'error' && 'Hall da Fama indisponível agora — o resultado segue salvo localmente.'}
          </div>

          <div style={{ marginTop: 18 }}>
            <button className="donate-cta" onClick={onDonate}>
              💜 Curtiu? Apoie o projeto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
