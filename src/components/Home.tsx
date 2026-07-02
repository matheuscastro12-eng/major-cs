import { useState } from 'react';
import { type Difficulty, type TournamentPool } from '../types';
import { useLang } from '../state/i18n';
import { getManager } from '../state/manager';
import { ct } from '../state/career-i18n';
import { BrandMark } from './brand';
import { PlayStaticBackground } from './PlayStaticBackground';
import type { Account } from '../state/account';

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
  onUltimate?: () => void;
  onRoadToPro?: () => void;
  onLeaderboard?: () => void;
  onCareer?: () => void;
  /** Conta atual (null = não logado, undefined = carregando) */
  account?: Account | null;
  /** Carregamento da conta concluído */
  accountReady?: boolean;
  /** Abre a tela de perfil/setup */
  onAccount?: () => void;
  /** Abre a landing/checkout pra criar conta vitalícia */
  onCreateAccount?: () => void;
  /** Logout (só faz sentido se account != null) */
  onLogout?: () => void;
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
  onUltimate,
  onRoadToPro,
  onCareer,
  account,
  accountReady,
  onAccount,
  onCreateAccount,
  onLogout,
}: Props) {
  const { t, lang } = useLang();
  const L = UI[(lang as 'pt' | 'en' | 'es')] ?? UI.pt;
  const [view, setView] = useState<'menu' | 'draft'>('menu');
  const [acctOpen, setAcctOpen] = useState(false);
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
      <PlayStaticBackground />

      {/* Account chip — top-right, sempre visível. Gerencia conta facilmente. */}
      <div
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 50,
        }}
      >
        <AccountChip
          account={account}
          ready={accountReady ?? false}
          open={acctOpen}
          onToggle={() => setAcctOpen((v) => !v)}
          onClose={() => setAcctOpen(false)}
          onAccount={onAccount}
          onCreate={onCreateAccount}
          onLogout={onLogout}
        />
      </div>

      <div className="play-hub-content">
        {view === 'menu' ? (
          <div className="hero landing">
            <BrandMark size={96} className="hero-mark" />
            <h1>ROAD TO <span>MAJOR</span></h1>
            <p>{t('hero.tagline')}</p>

            {/* Pill de ativação inline: free user logado vê a oportunidade de virar
               Fundador sem precisar abrir modal. Sticky no Home, clica e cai no fluxo.
               Cosmético/conveniência — zero pay-to-win. */}
            {accountReady && account && !account.paid && (
              <button
                type="button"
                onClick={onCreateAccount}
                className="rtm-supporter-pill"
                title={ct('Apoie o projeto · selo de Fundador + cloud sync + 5 carreiras')}
              >
                <span className="rtm-supporter-pill-badge">★</span>
                <span className="rtm-supporter-pill-text">
                  <b>{ct('Vire Fundador')}</b> {ct('· selo #001–#500, cloud sync e 5 carreiras')}
                </span>
                <span className="rtm-supporter-pill-cta">R$20 →</span>
              </button>
            )}

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

              {onRoadToPro && (
                <button className="rtm-modecard" data-tone="purple" onClick={onRoadToPro}>
                  <span className="rtm-modecard-art" style={{ backgroundImage: 'url(/maps/train.jpg)' }} />
                  <span className="rtm-modecard-scrim" />
                  <span className="rtm-modecard-bar" />
                  <span className="rtm-modecard-body">
                    <span className="rtm-modecard-kicker">{ct('Novo')}</span>
                    <span className="rtm-modecard-title">Road to Pro</span>
                    <span className="rtm-modecard-desc">{ct('Você não treina o time — você É o jogador. Viva a carreira de astro do CS: treine, gerencie sua vida e brilhe nos momentos decisivos.')}</span>
                    <span className="rtm-modecard-foot">
                      <span className="rtm-modecard-meta">{ct('1 jogador · você é o atleta')}</span>
                      <span className="rtm-modecard-go">{ct('Jogar')} →</span>
                    </span>
                  </span>
                </button>
              )}

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

              {onUltimate && (
                <button className="rtm-modecard" data-tone="gold" onClick={onUltimate}>
                  <span className="rtm-modecard-art" style={{ backgroundImage: 'url(/maps/ancient.jpg)' }} />
                  <span className="rtm-modecard-scrim" />
                  <span className="rtm-modecard-bar" />
                  <span className="rtm-modecard-body">
                    <span className="rtm-modecard-kicker">{ct('Coleção')}</span>
                    <span className="rtm-modecard-title">Ultimate Squad</span>
                    <span className="rtm-modecard-desc">{ct('Abra pacotes, colecione os jogadores reais de 2026 e monte seu esquadrão dos sonhos.')}</span>
                    <span className="rtm-modecard-foot">
                      <span className="rtm-modecard-meta">{ct('1 jogador · cartas')}</span>
                      <span className="rtm-modecard-go">{ct('Abrir')} →</span>
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

// ─── AccountChip ────────────────────────────────────────────────────────────
// Pill no canto superior direito do Home. Estado:
//   - account == null && !ready  → "Carregando…"
//   - account == null && ready   → "Entrar" (não logado)
//   - account != null            → email/nick + ★ se paid; click abre dropdown
//
// Dropdown:
//   - Conta vitalícia? mostra "Meu perfil" + "Sair"
//   - Conta grátis?    mostra "Meu perfil" + "✨ Upgrade vitalício" + "Sair"
//   - Não logado?      mostra "Criar conta vitalícia"

function AccountChip({
  account,
  ready,
  open,
  onToggle,
  onClose,
  onAccount,
  onCreate,
  onLogout,
}: {
  account?: Account | null;
  ready: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onAccount?: () => void;
  onCreate?: () => void;
  onLogout?: () => void;
}) {
  // Loading state
  if (!ready) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          background: 'rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 999,
          fontSize: '0.78rem',
          color: 'rgba(255,255,255,0.55)',
          fontFamily: 'inherit',
          backdropFilter: 'blur(8px)',
        }}
      >
        ⏳ Carregando…
      </span>
    );
  }

  // Não logado
  if (!account) {
    return (
      <button
        type="button"
        onClick={onCreate}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: 'var(--em-gold)',
          color: '#1a1205',
          border: 'none',
          borderRadius: 999,
          fontFamily: 'inherit',
          fontSize: '0.82rem',
          fontWeight: 800,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(232,193,112,0.35)',
          letterSpacing: '0.3px',
        }}
      >
        ★ Criar conta
      </button>
    );
  }

  // Logado
  const isPaid = account.paid;
  const isFounder = account.founder;
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggle}
        title={
          isFounder
            ? `Fundador${account.founderNo != null ? ` #${String(account.founderNo).padStart(3, '0')}` : ''} · apoiador desde o lançamento`
            : isPaid
            ? 'Conta vitalícia · gerenciar perfil, saves e conta'
            : 'Conta grátis · ver perfil ou fazer upgrade'
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px 6px 8px',
          background: 'rgba(0,0,0,0.55)',
          border: `1px solid ${isPaid ? 'var(--em-gold)' : 'rgba(255,255,255,0.18)'}`,
          borderRadius: 999,
          fontFamily: 'inherit',
          fontSize: '0.84rem',
          fontWeight: 700,
          color: '#fff',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          boxShadow: isPaid ? '0 4px 14px rgba(232,193,112,0.2)' : '0 4px 14px rgba(0,0,0,0.4)',
        }}
      >
        {isPaid && (
          <span
            style={{
              width: 22,
              height: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--em-gold)',
              color: '#1a1205',
              borderRadius: '50%',
              fontSize: '0.74rem',
              fontWeight: 900,
            }}
          >
            ★
          </span>
        )}
        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {account.nick || account.email}
        </span>
        {isFounder && (
          <span
            style={{
              padding: '1px 6px',
              fontSize: '0.6rem',
              fontWeight: 900,
              letterSpacing: '0.5px',
              color: 'var(--em-gold)',
              background: 'rgba(232,193,112,0.18)',
              border: '1px solid rgba(232,193,112,0.45)',
              borderRadius: 3,
            }}
          >
            FUNDADOR{account.founderNo != null ? ` #${String(account.founderNo).padStart(3, '0')}` : ''}
          </span>
        )}
        <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <>
          {/* Backdrop pra fechar ao clicar fora */}
          <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          />
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              minWidth: 220,
              padding: 6,
              background: 'rgba(18, 22, 30, 0.96)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(12px)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {/* Header info */}
            <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 4 }}>
              <div style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                Status
              </div>
              <div style={{ fontSize: '0.84rem', fontWeight: 800, color: isPaid ? 'var(--em-gold)' : '#fff', marginTop: 2 }}>
                {isFounder ? '👑 Fundador' : isPaid ? '★ Conta vitalícia' : 'Conta grátis'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {account.email}
              </div>
            </div>
            <DropItem
              label="Meu perfil"
              hint="Editar nick, ver carreiras, etc."
              icon="👤"
              onClick={() => { onClose(); onAccount?.(); }}
            />
            {!isPaid && (
              <DropItem
                label="✨ Upgrade vitalício"
                hint="Até 5 saves + sincronização nuvem"
                icon=""
                accent="gold"
                onClick={() => { onClose(); onCreate?.(); }}
              />
            )}
            <DropItem
              label="Sair"
              hint="Volta pro modo grátis"
              icon="↪"
              accent="red"
              onClick={() => { onClose(); onLogout?.(); }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function DropItem({
  label,
  hint,
  icon,
  accent,
  onClick,
}: {
  label: string;
  hint?: string;
  icon?: string;
  accent?: 'gold' | 'red';
  onClick: () => void;
}) {
  const fg = accent === 'gold' ? 'var(--em-gold)' : accent === 'red' ? '#e58a8a' : '#fff';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '8px 10px',
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        color: fg,
        fontSize: '0.82rem',
        fontWeight: 700,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {icon && <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>{label}</div>
        {hint && (
          <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', fontWeight: 500, marginTop: 1 }}>
            {hint}
          </div>
        )}
      </div>
    </button>
  );
}
