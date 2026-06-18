import { useState } from 'react';
import { type Difficulty, type TournamentPool } from '../types';
import { useLang } from '../state/i18n';
import { BrandMark } from './brand';
import { DonorsPanel } from './Donate';
import { PrivacyModal } from './Legal';
import { AnnouncementTweet, TwitterLink } from './social';

interface Props {
  onStart: (mode: 'classic' | 'almanac', teamName: string, pool: TournamentPool, difficulty: Difficulty) => void;
  onDonate: () => void;
  onHall: () => void;
  onAchievements?: () => void;
  teamCount: number;
  playerCount: number;
  savedCampaign?: { name: string; phase: string } | null;
  onResume?: () => void;
  onDiscardCampaign?: () => void;
  onOnline?: () => void;
  onCareer?: () => void;
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
    haveCode: 'Já é apoiador? Entrar com código',
    codePh: 'código do beta',
    codeBtn: 'Entrar',
    codeWrong: 'Código inválido. Apoie o projeto para receber o seu.',
    enterCareer: '▶ Entrar no Modo Carreira (beta)',
    contact: 'Depois de apoiar, me chame no Twitter que eu te envio o link do beta fechado:',
    contactBtn: '𝕏 Falar com @castroomath',
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
    haveCode: 'Already a supporter? Enter with code',
    codePh: 'beta code',
    codeBtn: 'Enter',
    codeWrong: 'Invalid code. Support the project to get yours.',
    enterCareer: '▶ Enter Career Mode (beta)',
    contact: 'After supporting, message me on Twitter and I will send your closed-beta link:',
    contactBtn: '𝕏 Message @castroomath',
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
    haveCode: '¿Ya eres apoyador? Entrar con código',
    codePh: 'código de la beta',
    codeBtn: 'Entrar',
    codeWrong: 'Código inválido. Apoya el proyecto para recibir el tuyo.',
    enterCareer: '▶ Entrar al Modo Carrera (beta)',
    contact: 'Tras apoyar, escríbeme en Twitter y te envío tu enlace de la beta cerrada:',
    contactBtn: '𝕏 Escribir a @castroomath',
  },
};

const BETA_KEY = 'rtm-beta-v1';
const TWITTER_URL = 'https://x.com/castroomath';

// rótulos de seção da landing (mantém o conteúdo de hoje, só organiza melhor)
const UI = {
  pt: { quickMatch: 'Partida rápida', quickMatchSub: 'Monte o time dos sonhos e dispute um Major completo — fase suíça, playoffs, veto e scoreboard estilo HLTV.', region: 'Cenário', gameMode: 'Modo de jogo', difficulty: 'Dificuldade', play: 'Começar', achievements: 'Conquistas' },
  en: { quickMatch: 'Quick match', quickMatchSub: 'Build a dream team and play a full Major — Swiss stage, playoffs, map veto and an HLTV-style scoreboard.', region: 'Scene', gameMode: 'Game mode', difficulty: 'Difficulty', play: 'Start', achievements: 'Achievements' },
  es: { quickMatch: 'Partida rápida', quickMatchSub: 'Arma el equipo de tus sueños y disputa un Major completo — fase suiza, playoffs, veto y scoreboard estilo HLTV.', region: 'Escenario', gameMode: 'Modo de juego', difficulty: 'Dificultad', play: 'Empezar', achievements: 'Logros' },
};

export function Home({
  onStart,
  onDonate,
  onHall,
  onAchievements,
  teamCount,
  playerCount,
  savedCampaign,
  onResume,
  onDiscardCampaign,
  onOnline,
  onCareer,
}: Props) {
  const { t, lang } = useLang();
  const N = NEWS[(lang as 'pt' | 'en' | 'es')] ?? NEWS.pt;
  const L = UI[(lang as 'pt' | 'en' | 'es')] ?? UI.pt;
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [hasBeta, setHasBeta] = useState(() => {
    try { return localStorage.getItem(BETA_KEY) === '1'; } catch { return false; }
  });

  const submitCode = async () => {
    setCodeErr('');
    try {
      const r = await fetch('/api/beta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
        signal: AbortSignal.timeout(9000),
      });
      const j = await r.json();
      if (j?.ok) {
        try { localStorage.setItem(BETA_KEY, '1'); } catch { /* sem storage */ }
        setHasBeta(true);
        onCareer?.();
      } else {
        setCodeErr(N.codeWrong);
      }
    } catch {
      setCodeErr(N.codeWrong);
    }
  };
  const [mode, setMode] = useState<'classic' | 'almanac'>('classic');
  const [pool, setPool] = useState<TournamentPool>('world');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [name, setName] = useState('');

  const start = () => onStart(mode, name.trim() || 'DREAM FIVE', pool, difficulty);
  const DIFF_ICON: Record<Difficulty, string> = { normal: '🟢', hard: '🟠', legend: '🔴' };

  return (
    <div className="fade-in">
      <div className="hero landing">
        <BrandMark size={88} className="hero-mark" />
        <h1>
          ROAD TO <span>MAJOR</span>
        </h1>
        <p>{t('hero.tagline')}</p>
        <div className="hero-stats">
          <span><b>{teamCount}</b> {t('home.teams')}</span>
          <i className="hs-dot" />
          <span><b>{playerCount}</b> {t('home.players')}</span>
          <i className="hs-dot" />
          <span className="hs-src">{t('home.curated')} HLTV · Liquipedia</span>
        </div>

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

        {/* MODO CARREIRA (beta fechado): destaque logo no topo da home */}
        <div className="career-feature">
          <span className="cf-badge">{N.badge}</span>
          <h3>🏆 {N.careerTitle}</h3>
          <p>{N.careerText}</p>
          <div className="cf-actions">
            {hasBeta ? (
              <button className="btn gold big" onClick={onCareer}>{N.enterCareer}</button>
            ) : (
              <>
                <button className="btn gold big" onClick={onDonate}>{N.careerCta}</button>
                {!showCode ? (
                  <button className="btn ghost" onClick={() => setShowCode(true)}>{N.haveCode}</button>
                ) : (
                  <span className="cf-code">
                    <input
                      value={code}
                      maxLength={24}
                      placeholder={N.codePh}
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitCode()}
                    />
                    <button className="btn" onClick={submitCode}>{N.codeBtn}</button>
                  </span>
                )}
              </>
            )}
          </div>
          {codeErr && <div className="neg small" style={{ marginTop: 8 }}>{codeErr}</div>}
          {!hasBeta && (
            <div className="cf-contact">
              <span className="muted small">{N.contact}</span>
              <a className="btn ghost small" href={TWITTER_URL} target="_blank" rel="noopener noreferrer">{N.contactBtn}</a>
            </div>
          )}
        </div>

        <section className="setup-panel">
          <div className="sp-head">
            <span className="sp-title">{L.quickMatch}</span>
            <span className="sp-sub">{L.quickMatchSub}</span>
          </div>

          <div className="sp-section">
            <span className="sp-label">{L.region}</span>
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
          </div>

          <div className="sp-section">
            <span className="sp-label">{L.gameMode}</span>
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
          </div>

          <div className="sp-section">
            <span className="sp-label">{L.difficulty}</span>
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
          </div>

          <div className="name-input">
            <input
              placeholder={t('home.namePlaceholder')}
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && start()}
            />
            <button className="btn big gold" onClick={start}>
              ▶ {t('home.start')}
            </button>
          </div>
        </section>

        <div className="social-row">
          <TwitterLink />
        </div>
        <AnnouncementTweet />

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
          {onAchievements && (
            <>
              {' · '}
              <a href="#" onClick={(e) => { e.preventDefault(); onAchievements(); }}>🏅 {lang === 'en' ? 'Achievements' : lang === 'es' ? 'Logros' : 'Conquistas'}</a>
            </>
          )}
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
          {' · '}
          <a href="#" onClick={(e) => { e.preventDefault(); setShowPrivacy(true); }}>
            {lang === 'en' ? 'Privacy' : lang === 'es' ? 'Privacidad' : 'Privacidade'}
          </a>
        </div>
      </div>
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
