import { useMemo, useRef, useState } from 'react';
import type { CareerState, PickemState } from '../App';
import { tournamentTeamRecords } from '../engine/hall';
import { formatMoney } from '../engine/ratings';
import { getTeam } from '../engine/swiss';
import { downloadShareCard } from '../state/share';
import { track } from '../state/track';
import type { Tournament, TournamentPool } from '../types';
import { Flag, PlayerAvatar, TeamBadge } from './ui';
import { useLang } from '../state/i18n';

interface Props {
  t: Tournament;
  career: CareerState;
  pickem: PickemState;
  pool: TournamentPool;
  onRestart: () => void;
  onStats: () => void;
  onHall: () => void;
  onBracket: () => void;
  onNextSeason: () => void;
  onDonate: () => void;
}

type Translate = (key: string) => string;

function userCampaign(t: Tournament, tr: Translate): { label: string; placement: string; placementCode: string } {
  const user = getTeam(t, 'user');
  const isChampion = t.championId === 'user';
  if (isChampion) return { label: tr('final.champion'), placement: tr('final.place1'), placementCode: '1' };

  const userMatches = t.history.filter((h) => h.pairing.a === 'user' || h.pairing.b === 'user');
  const last = userMatches[userMatches.length - 1];
  if (!last) return { label: tr('final.eliminated'), placement: '-', placementCode: '16' };
  if (last.phase.includes('FINAL')) return { label: tr('final.runnerUp'), placement: tr('final.place2'), placementCode: '2' };
  if (last.phase.includes('Semifinal')) return { label: tr('final.elimSemi'), placement: tr('final.place34'), placementCode: '3-4' };
  if (last.phase.includes('Quartas')) return { label: tr('final.elimQuarters'), placement: tr('final.place58'), placementCode: '5-8' };
  return { label: tr('final.elimSwiss'), placement: `${tr('final.campaign')} ${user.wins}-${user.losses}`, placementCode: '9-16' };
}

// recordes da campanha do usuário (para o Hall da Fama)
function userRecords(t: Tournament, pickem: PickemState) {
  return {
    ...tournamentTeamRecords(t),
    pickemScore: pickem.total > 0 ? `${pickem.score}/${pickem.total}` : '',
  };
}

export function FinalScreen({ t, career, pickem, pool, onRestart, onStats, onHall, onBracket, onNextSeason, onDonate }: Props) {
  const { t: tr } = useLang();
  const champion = t.championId ? getTeam(t, t.championId) : undefined;
  const isChampion = t.championId === 'user';
  const user = getTeam(t, 'user');
  const campaign = useMemo(() => userCampaign(t, tr), [t, tr]);
  const [copied, setCopied] = useState(false);
  const [nick, setNick] = useState(() => {
    try { return localStorage.getItem('major-nick') ?? ''; } catch { return ''; }
  });
  const [hallStatus, setHallStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const mvp = useMemo(() => {
    if (!t.mvpId || !champion) return undefined;
    return champion.players.find((p) => p.id === t.mvpId);
  }, [t, champion]);

  const hallKey = `major-hall-posted-${user.name}-${career.season}-${campaign.placementCode}-${t.history.length}`;
  const [postedKey, setPostedKey] = useState('');
  let storedAsPosted = false;
  try { storedAsPosted = !!localStorage.getItem(hallKey); } catch { /* storage indisponível */ }
  const alreadyPosted = postedKey === hallKey || storedAsPosted;
  const postingRef = useRef(false);

  // registra no Hall com o nick do jogador (manual, no máximo uma vez por torneio)
  const registerHall = () => {
    const player = nick.trim();
    if (!player || alreadyPosted || postingRef.current || hallStatus === 'saving') return;
    postingRef.current = true;
    try { localStorage.setItem('major-nick', player); } catch { /* storage indisponível */ }
    setHallStatus('saving');
    fetch('/api/hall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player,
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
      .then((r) => {
        if (!r.ok) throw new Error(`hall ${r.status}`);
        try { localStorage.setItem(hallKey, '1'); } catch { /* storage indisponível */ }
        setPostedKey(hallKey);
        setHallStatus('saved');
      })
      .catch(() => setHallStatus('error'))
      .finally(() => { postingRef.current = false; });
  };

  const share = async () => {
    const lines = [
      `🏆 ROAD TO MAJOR · ${campaign.label}`,
      `${tr('final.shareTeam')}: ${user.name} (${campaign.placement})${career.season > 1 ? ` · ${tr('final.season')} ${career.season}` : ''}`,
      `${tr('final.shareRoster')}: ${user.players.map((p) => p.nick).join(', ')} · ${tr('common.coach')} ${user.coach.nick}`,
      champion && !isChampion ? `${tr('final.championLabel')}: ${champion.name}` : '',
      mvp ? `${tr('final.tournamentMvp')}: ${mvp.nick}` : '',
      pickem.total > 0 ? `Pick'Em: ${pickem.score}/${pickem.total}` : '',
      `${tr('final.shareCta')}: https://roadtomajor.com.br`,
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
                <b>{user.name}</b> {tr('final.wonThe')} {t.name}. {campaign.placement}
                {career.titles > 1 ? ` - ${career.titles}${tr('final.careerTitleSuffix')}` : '.'}
              </>
            ) : (
              <>
                {tr('final.campaignEnded')}: <b>{campaign.placement}</b>.
                {champion && (
                  <>
                    {' '}
                    {tr('final.titleWentTo')} <b>{champion.name}</b>.
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
                {tr('final.correctGuesses')}.
              </>
            )}
          </p>

          {typeof career.lastPrize === 'number' && (
            <div className="prize-banner">
              💰 {tr('final.prize')}: <b>+{formatMoney(career.lastPrize)}</b>
              <span className="muted"> · {tr('final.clubCash')}: <b>{formatMoney(career.budget)}</b></span>
            </div>
          )}

          {champion && (
            <div style={{ marginBottom: 10 }}>
              <span className="pcell" style={{ justifyContent: 'center' }}>
                <TeamBadge tag={champion.tag} colors={champion.colors} size={34} logoUrl={champion.logoUrl} />
                <Flag cc={champion.country} />
                <b style={{ fontSize: 16 }}>{champion.name}</b>
                <span className="gold-text">- {tr('common.champion')}</span>
              </span>
            </div>
          )}

          {mvp && (
            <div className="mvp-card">
              <PlayerAvatar nick={mvp.nick} size={54} />
              <div>
                <div className="label">{tr('final.tournamentMvp')}</div>
                <div className="nick">
                  <Flag cc={mvp.country} /> {mvp.nick}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn gold big" onClick={onNextSeason}>
              🔁 {tr('final.nextSeason')}
            </button>
            <button className="btn" onClick={onStats}>
              📊 {tr('final.stats')}
            </button>
            <button className="btn" onClick={onBracket}>
              🗺 {tr('final.bracketMatches')}
            </button>
            <button className="btn" onClick={onHall}>
              🏛 {tr('final.hallOfFame')}
            </button>
            <button
              className="btn"
              onClick={() => {
                track('share_card', { champion: isChampion });
                downloadShareCard(t, user, campaign.label, mvp?.nick);
              }}
            >
              🖼 {tr('final.downloadCard')}
            </button>
            <button className="btn ghost" onClick={share}>
              {copied ? `✔ ${tr('final.copied')}` : `📋 ${tr('final.copyText')}`}
            </button>
            <button className="btn ghost" onClick={onRestart}>
              {tr('final.newDraft')}
            </button>
          </div>

          <div className="hall-register">
            {hallStatus === 'saved' ? (
              <div className="pos small">✔ {tr('final.hallSaved')} {nick}.</div>
            ) : alreadyPosted ? (
              <div className="muted small">{tr('final.hallAlready')}</div>
            ) : (
              <>
                <div className="muted small" style={{ marginBottom: 8 }}>
                  {tr('final.hallPrompt1')} <b>{tr('final.hallOfFame')}</b> {tr('final.hallPrompt2')}
                </div>
                <div className="hall-register-row">
                  <input
                    placeholder={tr('final.nickPlaceholder')}
                    value={nick}
                    maxLength={24}
                    onChange={(e) => setNick(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && registerHall()}
                  />
                  <button className="btn gold" onClick={registerHall} disabled={!nick.trim() || hallStatus === 'saving'}>
                    {hallStatus === 'saving' ? tr('final.registering') : `🏛 ${tr('final.registerHall')}`}
                  </button>
                </div>
                {hallStatus === 'error' && (
                  <div className="neg small" style={{ marginTop: 6 }}>
                    {tr('final.hallUnavailable')}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <button className="donate-cta" onClick={onDonate}>
              💜 {tr('final.supportCta')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
