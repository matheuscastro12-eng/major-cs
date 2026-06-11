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

// Novidades (changelog público) + teaser do modo carreira, por idioma.
const NEWS = {
  pt: {
    newsTitle: '🆕 Novidades',
    items: [
      'Modo Tático na partida: freezetime de 5s antes de cada round pra escolher sua chamada com calma.',
      'Agora dá pra ver de qual lado (CT/T) você joga e o resultado de cada chamada tática.',
      'Velocidade dos rounds reajustada (o 0.5x ficou bem mais lento e legível).',
      'No online, o sorteio agora vem diferente pra cada jogador.',
      'Visual mais limpo e animações de carregamento mais suaves.',
    ],
    careerTitle: 'Em breve: Modo Carreira',
    careerText: 'Estamos construindo um Modo Carreira completo: fundar sua organização, contratar jogadores reais, fechar patrocínios e disputar circuitos rumo ao Major. Apoie o projeto para entrar no beta fechado e testar antes de todo mundo.',
    careerCta: '💜 Apoiar e testar o beta',
    badge: 'BETA FECHADO',
  },
  en: {
    newsTitle: '🆕 What\'s new',
    items: [
      'Tactical match mode: a 5s freezetime before each round to pick your call calmly.',
      'You can now see which side (CT/T) you are on and the outcome of each tactical call.',
      'Round speed retuned (0.5x is now much slower and easier to read).',
      'In online mode, the draw now comes out different for each player.',
      'Cleaner visuals and smoother loading animations.',
    ],
    careerTitle: 'Coming soon: Career Mode',
    careerText: 'We are building a full Career Mode: found your org, sign real players, land sponsors and run circuits on the road to the Major. Support the project to join the closed beta and test it before everyone else.',
    careerCta: '💜 Support and test the beta',
    badge: 'CLOSED BETA',
  },
  es: {
    newsTitle: '🆕 Novedades',
    items: [
      'Modo Táctico en la partida: freezetime de 5s antes de cada ronda para elegir tu jugada con calma.',
      'Ahora puedes ver de qué lado (CT/T) juegas y el resultado de cada jugada táctica.',
      'Velocidad de rondas reajustada (el 0.5x quedó mucho más lento y legible).',
      'En el online, el sorteo ahora sale diferente para cada jugador.',
      'Visual más limpio y animaciones de carga más suaves.',
    ],
    careerTitle: 'Pronto: Modo Carrera',
    careerText: 'Estamos construyendo un Modo Carrera completo: funda tu organización, ficha jugadores reales, consigue patrocinios y compite en circuitos rumbo al Major. Apoya el proyecto para entrar en la beta cerrada y probarlo antes que nadie.',
    careerCta: '💜 Apoyar y probar la beta',
    badge: 'BETA CERRADA',
  },
};

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
  const { t, lang } = useLang();
  const N = NEWS[(lang as 'pt' | 'en' | 'es')] ?? NEWS.pt;
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

        {/* teaser do modo carreira (beta fechado) + novidades */}
        <div className="career-teaser">
          <span className="ct-badge">{N.badge}</span>
          <h3>{N.careerTitle}</h3>
          <p>{N.careerText}</p>
          <button className="btn gold" onClick={onDonate}>{N.careerCta}</button>
        </div>

        <div className="news-card">
          <h3>{N.newsTitle}</h3>
          <ul className="news-list">
            {N.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>

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
