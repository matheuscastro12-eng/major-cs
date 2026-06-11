import { useState } from 'react';
import { type Difficulty, type TournamentPool } from '../types';
import { useLang } from '../state/i18n';
import { BrandMark } from './brand';
import { DonorsPanel } from './Donate';
import { AnnouncementTweet, TwitterLink } from './social';

interface Props {
  onStart: (mode: 'classic' | 'almanac', teamName: string, pool: TournamentPool, difficulty: Difficulty) => void;
  onDonate: () => void;
  onHall: () => void;
  teamCount: number;
  playerCount: number;
  savedCampaign?: { name: string; phase: string } | null;
  onResume?: () => void;
  onDiscardCampaign?: () => void;
  onOnline?: () => void;
}

const DIFFICULTIES: Difficulty[] = ['normal', 'hard', 'legend'];

export function Home({
  onStart,
  onDonate,
  onHall,
  teamCount,
  playerCount,
  savedCampaign,
  onResume,
  onDiscardCampaign,
  onOnline,
}: Props) {
  const { t } = useLang();
  const [mode, setMode] = useState<'classic' | 'almanac'>('classic');
  const [pool, setPool] = useState<TournamentPool>('world');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [name, setName] = useState('');

  const start = () => onStart(mode, name.trim() || 'DREAM FIVE', pool, difficulty);
  const DIFF_ICON: Record<Difficulty, string> = { normal: '🟢', hard: '🟠', legend: '🔴' };

  return (
    <div className="fade-in">
      <div className="hero">
        <BrandMark size={96} className="hero-mark" />
        <h1>
          ROAD TO <span>MAJOR</span>
        </h1>
        <p>{t('hero.tagline')}</p>

        {savedCampaign && (
          <div style={{ margin: '18px auto 0', maxWidth: 640, display: 'flex', gap: 10 }}>
            <button className="btn gold big" style={{ flex: 1 }} onClick={onResume}>
              {t('home.resume')} - {savedCampaign.name}
              {savedCampaign.phase === 'done' ? ` ${t('home.ended')}` : ''}
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                if (confirm(t('home.confirmDiscard'))) onDiscardCampaign?.();
              }}
            >
              {t('home.newCampaign')}
            </button>
          </div>
        )}

        {onOnline && (
          <div style={{ margin: '14px auto 0', maxWidth: 640 }}>
            <button className="btn big online-cta" style={{ width: '100%' }} onClick={onOnline}>
              {t('home.online')}
            </button>
          </div>
        )}

        <div className="pool-cards">
          <button className={`pool-card world${pool === 'world' ? ' sel' : ''}`} onClick={() => setPool('world')}>
            <h3>{t('home.poolWorld')}</h3>
            <p>{t('home.poolWorldDesc')}</p>
          </button>
          <button className={`pool-card br${pool === 'br' ? ' sel' : ''}`} onClick={() => setPool('br')}>
            <h3>{t('home.poolBr')}</h3>
            <p>{t('home.poolBrDesc')}</p>
          </button>
        </div>

        <div className="mode-cards">
          <button className={`mode-card${mode === 'classic' ? ' sel' : ''}`} onClick={() => setMode('classic')}>
            <h3>{t('home.modeClassic')}</h3>
            <p>{t('home.modeClassicDesc')}</p>
          </button>
          <button className={`mode-card${mode === 'almanac' ? ' sel' : ''}`} onClick={() => setMode('almanac')}>
            <h3>{t('home.modeAlmanac')}</h3>
            <p>{t('home.modeAlmanacDesc')}</p>
          </button>
        </div>

        <div className="diff-cards">
          {DIFFICULTIES.map((d) => (
            <button key={d} className={`diff-card ${d}${difficulty === d ? ' sel' : ''}`} onClick={() => setDifficulty(d)}>
              <h4>
                {DIFF_ICON[d]} {t(`diff.${d}`)}
              </h4>
              <p>{t(`diff.${d}Desc`)}</p>
            </button>
          ))}
        </div>

        <div className="name-input">
          <input
            placeholder={t('home.namePlaceholder')}
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
          />
          <button className="btn big" onClick={start}>
            {t('home.start')}
          </button>
        </div>

        <div className="social-row">
          <TwitterLink />
        </div>
        <AnnouncementTweet />

        <DonorsPanel onDonate={onDonate} />

        <div className="footnote">
          {teamCount} {t('home.teams')} · {playerCount} {t('home.players')} ·{' '}
          <a
            href="#hall"
            onClick={(e) => {
              e.preventDefault();
              onHall();
            }}
          >
            {t('home.hall')}
          </a>
          {' · '}
          {t('home.curated')}{' '}
          <a href="https://liquipedia.net" target="_blank" rel="noreferrer">
            Liquipedia
          </a>{' '}
          &amp;{' '}
          <a href="https://www.hltv.org" target="_blank" rel="noreferrer">
            HLTV
          </a>
          {' · '}
          {t('home.photos')}{' '}
          <a href="https://liquipedia.net" target="_blank" rel="noreferrer">
            Liquipedia
          </a>{' '}
          (CC-BY-SA 3.0)
        </div>
      </div>
    </div>
  );
}
