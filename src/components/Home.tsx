import { useState } from 'react';
import { type Difficulty, type TournamentPool } from '../types';
import { useLang } from '../state/i18n';
import { getManager } from '../state/manager';
import { ct } from '../state/career-i18n';
import { BrandMark } from './brand';
import { PlayShaderBackground } from './PlayShaderBackground';

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
  onLeaderboard?: () => void;
  onCareer?: () => void;
}

const DIFFICULTIES: Difficulty[] = ['normal', 'hard', 'legend'];

const UI = {
  pt: { quickMatch: 'Partida rápida', quickMatchSub: 'Monte o time dos sonhos e dispute um Major completo: fase suíça, playoffs, veto e scoreboard estilo HLTV.', region: 'Cenário', gameMode: 'Modo de jogo', difficulty: 'Dificuldade', play: 'Começar', achievements: 'Conquistas' },
  en: { quickMatch: 'Quick match', quickMatchSub: 'Build a dream team and play a full Major: Swiss stage, playoffs, map veto and an HLTV-style scoreboard.', region: 'Scene', gameMode: 'Game mode', difficulty: 'Difficulty', play: 'Start', achievements: 'Achievements' },
  es: { quickMatch: 'Partida rápida', quickMatchSub: 'Arma el equipo de tus sueños y disputa un Major completo: fase suiza, playoffs, veto y scoreboard estilo HLTV.', region: 'Escenario', gameMode: 'Modo de juego', difficulty: 'Dificultad', play: 'Empezar', achievements: 'Logros' },
};

export function Home({
  onStart,
  onDonate,
  teamCount,
  onOnline,
  onCareer,
}: Props) {
  const { t, lang } = useLang();
  const L = UI[(lang as 'pt' | 'en' | 'es')] ?? UI.pt;
  const [view, setView] = useState<'menu' | 'draft'>('menu');
  const managerNick = getManager()?.nick;
  const hasBeta = true;
  const [mode, setMode] = useState<'classic' | 'almanac'>('classic');
  const [pool, setPool] = useState<TournamentPool>('world');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [name, setName] = useState('');

  const start = () => onStart(mode, name.trim() || 'DREAM FIVE', pool, difficulty);
  const DIFF_ICON: Record<Difficulty, string> = { normal: '🟢', hard: '🟠', legend: '🔴' };

  return (
    <div className="play-hub fade-in">
      <PlayShaderBackground />

      <div className="play-hub-content">
        {view === 'menu' ? (
          <div className="hero landing">
            <BrandMark size={96} className="hero-mark" />
            <h1>ROAD TO <span>MAJOR</span></h1>
            <p>{t('hero.tagline')}</p>

            <div className="rtm-modemenu">
              <button className="rtm-modecard" data-tone="gold" onClick={() => (hasBeta ? onCareer?.() : onDonate())}>
                <span className="rtm-modecard-art" style={{ backgroundImage: 'url(/maps/nuke.jpg)' }} />
                <span className="rtm-modecard-scrim" />
                <span className="rtm-modecard-bar" />
                <span className="rtm-modecard-body">
                  <span className="rtm-modecard-kicker">{ct('Destaque')}</span>
                  <span className="rtm-modecard-title">{ct('Carreira')}</span>
                  <span className="rtm-modecard-desc">{ct('Funde sua org, contrate, gerencie transferências e brigue pelo título numa temporada inteira.')}</span>
                  <span className="rtm-modecard-foot">
                    <span className="rtm-modecard-meta">{ct('1 jogador · campanha')}</span>
                    <span className="rtm-modecard-go">{hasBeta ? ct('Entrar') : ct('Acessar')} →</span>
                  </span>
                </span>
              </button>

              <button className="rtm-modecard" data-tone="blue" onClick={() => setView('draft')}>
                <span className="rtm-modecard-art" style={{ backgroundImage: 'url(/maps/mirage.jpg)' }} />
                <span className="rtm-modecard-scrim" />
                <span className="rtm-modecard-bar" />
                <span className="rtm-modecard-body">
                  <span className="rtm-modecard-kicker">{ct('Partida rápida')}</span>
                  <span className="rtm-modecard-title">Draft</span>
                  <span className="rtm-modecard-desc">{ct('Monte um cinco com lendas de cada era e dispute um Major avulso. Rápido e rejogável.')}</span>
                  <span className="rtm-modecard-foot">
                    <span className="rtm-modecard-meta">{ct('1 jogador · ~15 min')}</span>
                    <span className="rtm-modecard-go">{ct('Montar')} →</span>
                  </span>
                </span>
              </button>

              {onOnline && (
                <button className="rtm-modecard" data-tone="green" onClick={onOnline}>
                  <span className="rtm-modecard-art" style={{ backgroundImage: 'url(/maps/dust2.jpg)' }} />
                  <span className="rtm-modecard-scrim" />
                  <span className="rtm-modecard-bar" />
                  <span className="rtm-modecard-body">
                    <span className="rtm-modecard-kicker">{ct('Competitivo')}</span>
                    <span className="rtm-modecard-title">Online</span>
                    <span className="rtm-modecard-desc">{ct('Snake draft 1v1 contra outro manager. Suba no ladder ranqueado por MMR.')}</span>
                    <span className="rtm-modecard-foot">
                      <span className="rtm-modecard-meta">{ct('1v1 · ranqueada')}</span>
                      <span className="rtm-modecard-go">{ct('Jogar')} →</span>
                    </span>
                  </span>
                </button>
              )}
            </div>

            {managerNick && (
              <div className="rtm-signed">
                {ct('Logado como')} <b>{managerNick}</b> · {teamCount} {ct('times · 5 eras · scoreboards estilo HLTV')}
              </div>
            )}
          </div>
        ) : (
          <section className="setup-panel draft-screen">
            <div className="sp-head">
              <button className="btn ghost small" onClick={() => setView('menu')} style={{ alignSelf: 'flex-start', marginBottom: 6 }}>← {ct('Menu')}</button>
              <span className="sp-title">{L.quickMatch} · Draft</span>
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
                    <h4>{DIFF_ICON[d]} {t(`diff.${d}`)}</h4>
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
              <button className="btn big gold" onClick={start}>▶ {t('home.start')}</button>
            </div>
          </section>
        )}
      </div>

      <p className="play-hub-credit">
        bg · <a href="https://fragcoord.xyz/s/bp27qjk1" target="_blank" rel="noopener noreferrer">Anneal</a> @Xor
      </p>
    </div>
  );
}
