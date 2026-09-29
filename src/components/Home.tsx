// Início (Portal) — a porta de entrada do Road to Major no shell universal.
// Estilo FM: painéis com o que está em andamento em cada modo (carreira, Road
// to Pro, Major rápido, Diário), os modos de jogo, a conta e as novidades.
// O CONTINUAR da topbar leva à coisa mais relevante agora (streak em risco,
// campeonato em andamento, carreira salva…).
//
// Funil (mantido do menu antigo, mesmos src de telemetria): card do Road to
// Pro com DEMO GRÁTIS + atalho "pular a demo" (home-rtp / home-rtp-direto),
// pill de Fundador pra conta grátis (home-pill), CTA de conta pro convidado
// (acct-chip-guest), aviso de streak em risco (streak_at_risk_seen).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CalendarDays, ChevronRight, Crosshair, Flame, Heart, Layers, LayoutDashboard, Newspaper, Play,
  Shuffle, Sparkles, Star, Swords, Trophy, TriangleAlert, UserRound, Crown, Globe, Lock, Medal,
} from 'lucide-react';
import { type Difficulty, type TournamentPool } from '../types';
import { setCheckoutSrc, trackPaywallView, trackUltFunnel } from '../state/track';
import { useSectionHistory } from '../state/app-history';
import { loadStreakState } from '../state/dailyStreak'; // [URG-4]
import { streakStatus } from '../engine/daily/streak'; // [URG-4]
import { DAILY_GAMES, dateKeyOf, dayNumberOf } from '../engine/daily/lines';
import { dailyDayStatus } from '../state/daily';
import { useLang } from '../state/i18n';
import { getManager } from '../state/manager';
import { ct } from '../state/career-i18n';
import { readSlot, getActiveSlot } from '../state/careerSaves';
import { PATCHES } from '../data/patchNotes';
import { BrandMark } from './brand';
import { FounderCounter } from './FounderCounter';
import { useFounders } from '../state/founders';
import { TeamBadge } from './ui';
import { GameShell, Panel, Button, Segmented, type ShellNavGroup, type ShellNext, type ShellPending } from './ds/index';
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
  onUltimate?: () => void;
  onRoadToPro?: () => void;
  /** Abre o DIÁRIO (minigames diários — grátis, sem conta) */
  onDaily?: () => void;
  /** Road to Pro sem vitalícia = demo (card continua visível, com atalho de compra) */
  premiumLocked?: boolean;
  /** Trava o card do Ultimate. Ultimate abriu pra todos → passado como false. */
  ultimateLocked?: boolean;
  onLeaderboard?: () => void;
  onCareer?: () => void;
  account?: Account | null;
  accountReady?: boolean;
  onAccount?: () => void;
  onCreateAccount?: () => void;
  onUpgrade?: () => void;
  onLogout?: () => void;
  onAdmin?: () => void;
  /** seções do Início (sidebar do shell) */
  shellNav: ShellNavGroup[];
  onShellNav: (id: string) => void;
  /** pedido de visão vindo do shell (o modo Draft abre o setup do Major) */
  viewReq?: { view: 'menu' | 'draft'; n: number };
  onOpenRanking?: () => void;
}

const DIFFICULTIES: Difficulty[] = ['normal', 'hard', 'legend'];

/** resumo leve do save do Road to Pro (sem importar o motor do modo) */
function rtpBrief(): { nick?: string; ovr?: number; team?: string; week?: number } | null {
  try {
    const raw = localStorage.getItem('rtm-rtp-v1');
    if (!raw) return null;
    const s = JSON.parse(raw) as { player?: { nick?: string; ovr?: number }; team?: { teamName?: string }; world?: { week?: number } };
    return { nick: s.player?.nick, ovr: s.player?.ovr, team: s.team?.teamName, week: s.world?.week };
  } catch { return null; }
}

export function Home(props: Props) {
  const {
    onStart, onDonate, teamCount, onUltimate, onRoadToPro, onDaily, premiumLocked, ultimateLocked, onCareer,
    account, accountReady, onAccount, onCreateAccount, onUpgrade, onLogout, onAdmin, savedCampaign, onResume,
    onDiscardCampaign, shellNav, onShellNav, viewReq, onAchievements, onOpenRanking,
  } = props;
  const { t } = useLang();
  const [view, setView] = useState<'menu' | 'draft'>(viewReq?.view ?? 'menu');
  // o shell pede a visão (trilho "Draft" → setup; "Início" → portal)
  const [lastReq, setLastReq] = useState(viewReq?.n ?? 0);
  if (viewReq && viewReq.n !== lastReq) { setLastReq(viewReq.n); setView(viewReq.view); }
  // Voltar/Avançar (shell, Alt+←/→ e navegador): Portal ↔ Montar o Major
  useSectionHistory('inicio', view, (v) => { if (v === 'menu' || v === 'draft') setView(v); }, (path) => path === '/jogar');
  const manager = getManager();
  const [mode, setMode] = useState<'classic' | 'almanac'>('classic');
  const [pool, setPool] = useState<TournamentPool>('world');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [name, setName] = useState('');

  // funil: superfícies de venda da vitalícia visíveis no portal (1x/sessão/src)
  useEffect(() => {
    if (view !== 'menu') return;
    // [O0-11] premiumLocked é true enquanto o /me carrega: sem accountReady o
    // 1º frame do pagante contava como paywall_view (dedupe grava esse frame).
    if (!accountReady) return;
    if (premiumLocked && onRoadToPro) trackPaywallView('home-rtp');       // card RtP com cadeado
    if (ultimateLocked && onUltimate) trackPaywallView('home-ultimate');   // card Ultimate com cadeado
    if (account && !account.paid) trackPaywallView('home-pill'); // pill "Vire Fundador"
    if (!account) trackPaywallView('acct-chip-guest'); // chip de conta do convidado no Início
    // funil (iter): no mobile o home-grid empilha em 1 coluna e o painel "Sua
    // conta" (acct-chip-guest) vira o ÚLTIMO bloco da página — o CTA real fica
    // abaixo de "Continue de onde parou" e "Modos de jogo". src próprio pra
    // medir esse banner do topo contra o painel de baixo (mesmo evento, novo src).
    if (!account) trackPaywallView('home-guest-top');
  }, [view, premiumLocked, ultimateLocked, onRoadToPro, onUltimate, accountReady, account]);

  // [URG-4] streak do Diário: "N dias" e, se ainda não jogou hoje, o aviso de perda
  const [dStreak] = useState(() => streakStatus(loadStreakState(), Date.now()));
  useEffect(() => {
    if (view === 'menu' && onDaily && dStreak.atRisk) trackUltFunnel('streak_at_risk_seen', { days: dStreak.current, hoursLeft: dStreak.hoursLeft });
  }, [view, onDaily, dStreak]);
  const dateKey = dateKeyOf(new Date());
  const dayNo = dayNumberOf(dateKey);
  const dayStatus = useMemo(() => dailyDayStatus(DAILY_GAMES.map((g) => g.id), dateKey), [dateKey]);

  const founders = useFounders();
  const founderSoldOut = !!founders && founders.founders >= founders.limit;
  const career = useMemo(() => readSlot(getActiveSlot()), []);
  const rtp = useMemo(() => rtpBrief(), []);

  const start = () => onStart(mode, name.trim() || 'DREAM FIVE', pool, difficulty);

  // ── CONTINUAR: a coisa mais relevante agora ──
  const pending: ShellPending[] = [];
  if (dStreak.atRisk && onDaily) pending.push({ id: 'streak', label: `${ct('Sua sequência de')} ${dStreak.current} ${ct('dias acaba em')} ${dStreak.hoursLeft}h`, tone: 'warn', icon: Flame, onGo: onDaily });
  if (accountReady && !account) pending.push({ id: 'acct', label: ct('Jogando sem conta: o progresso fica só neste navegador'), tone: 'info', icon: Lock, onGo: () => { setCheckoutSrc('acct-chip-guest'); onCreateAccount?.(); } });
  let next: ShellNext | undefined;
  if (dStreak.atRisk && onDaily) next = { label: ct('Continuar'), detail: `${ct('Diário')} #${dayNo} · ${ct('salve a sequência')}`, onGo: onDaily, pending };
  else if (savedCampaign && onResume) next = { label: ct('Continuar'), detail: `${savedCampaign.name}`, onGo: onResume, pending };
  else if (career.exists && career.org && onCareer) next = { label: ct('Continuar'), detail: `${career.org} · Split ${career.split ?? 1}`, onGo: onCareer, pending };
  else if (onDaily && dayStatus.done < DAILY_GAMES.length) next = { label: ct('Jogar'), detail: `${ct('Diário')} #${dayNo}`, onGo: onDaily, icon: Play, pending };
  else next = { label: ct('Jogar'), detail: ct('Novo Major'), onGo: () => setView('draft'), icon: Play, pending };

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const meta = (
    <span className="gs-when">
      <b>{today.charAt(0).toUpperCase() + today.slice(1)}</b>
      <small>{ct('Diário')} #{dayNo}</small>
    </span>
  );

  if (view === 'draft') {
    const diffLabel: Record<Difficulty, string> = { normal: t('diff.normal'), hard: t('diff.hard'), legend: t('diff.legend') };
    return (
      <GameShell
        mode="major"
        variant="full"
        identity={{ title: ct('Novo Major'), subtitle: ct('Draft · Major rápido') }}
        nav={[{ id: 'novo', label: ct('Torneio'), items: [
          { id: 'setup', label: ct('Montar o Major'), icon: Layers },
          ...(savedCampaign ? [{ id: 'resume', label: ct('Retomar campeonato'), icon: Play, alert: true }] : []),
        ] }, { id: 'hist', label: ct('Histórico'), items: [{ id: 'hall', label: ct('Hall da Fama'), icon: Star }] }]}
        active="setup"
        onNav={(id) => { if (id === 'resume') onResume?.(); else if (id === 'hall') onShellNav('hall'); }}
        title={ct('Montar o Major')}
        meta={meta}
        next={{ label: ct('Começar'), detail: `${pool === 'br' ? t('home.poolBr') : t('home.poolWorld')} · ${diffLabel[difficulty]}`, icon: Play, onGo: start }}
      >
        <div className="home-setup">
          <Panel icon={<Shuffle size={16} />} title={ct('Partida rápida · Draft')}>
            <p className="home-lead">{ct('Monte o time dos sonhos e dispute um Major completo: fase suíça, playoffs, veto e scoreboard estilo HLTV.')}</p>
            <div className="home-field">
              <span className="ds-kicker">{ct('Cenário')}</span>
              <Segmented label={ct('Cenário')} value={pool} onChange={setPool} items={[{ value: 'world', label: t('home.poolWorld') }, { value: 'br', label: t('home.poolBr') }]} />
              <small className="ds-dim">{pool === 'world' ? t('home.poolWorldDesc') : t('home.poolBrDesc')}</small>
            </div>
            <div className="home-field">
              <span className="ds-kicker">{ct('Modo de jogo')}</span>
              <Segmented label={ct('Modo de jogo')} value={mode} onChange={setMode} items={[{ value: 'classic', label: t('home.modeClassic') }, { value: 'almanac', label: t('home.modeAlmanac') }]} />
              <small className="ds-dim">{mode === 'classic' ? t('home.modeClassicDesc') : t('home.modeAlmanacDesc')}</small>
            </div>
            <div className="home-field">
              <span className="ds-kicker">{ct('Dificuldade')}</span>
              <Segmented label={ct('Dificuldade')} value={difficulty} onChange={setDifficulty} items={DIFFICULTIES.map((d) => ({ value: d, label: diffLabel[d] }))} />
              <small className="ds-dim">{t(`diff.${difficulty}Desc`)}</small>
            </div>
            <div className="home-field">
              <label className="ds-kicker" htmlFor="home-team-name">{ct('Nome do time')}</label>
              <div className="home-name">
                <input id="home-team-name" className="home-input" placeholder={t('home.namePlaceholder')} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
                <Button variant="primary" onClick={start}><Play size={16} aria-hidden /> {t('home.start')}</Button>
              </div>
            </div>
          </Panel>
          <Panel icon={<Trophy size={16} />} title={ct('Como funciona')}>
            <ol className="home-steps">
              <li><b>{ct('Draft')}</b><span>{ct('5 picks entre lendas de todas as eras, com 2 rerolls, e um técnico.')}</span></li>
              <li><b>{ct('Fase suíça')}</b><span>{ct('3 vitórias classificam, 3 derrotas eliminam. Pick’em das outras séries.')}</span></li>
              <li><b>{ct('Playoffs')}</b><span>{ct('Veto de mapas e partida ao vivo com timeouts táticos, em MD3.')}</span></li>
              <li><b>{ct('Temporadas')}</b><span>{ct('Campeão ou não, a janela de transferências abre a próxima.')}</span></li>
            </ol>
            <p className="ds-dim">{teamCount} {ct('times · do 1.6 ao CS2 · scoreboards estilo HLTV')}</p>
          </Panel>
        </div>
      </GameShell>
    );
  }

  const latest = PATCHES.slice(0, 2).flatMap((p) => p.items.slice(0, 3).map((it) => ({ ...it, date: p.date })));
  const dailyLeft = DAILY_GAMES.length - dayStatus.done;

  return (
    <GameShell
      mode="inicio"
      identity={{ title: manager?.nick ?? 'Road to Major', subtitle: manager?.org ?? ct('Simulador de CS de todas as eras'), badge: <BrandMark size={32} /> }}
      nav={shellNav}
      active="home"
      onNav={onShellNav}
      mobileNav={['home', 'news', 'achievements', 'leaderboard']}
      title={ct('Portal')}
      crumbs={[]}
      meta={meta}
      next={next}
      bell={{ label: ct('Novidades'), count: 0, onClick: () => onShellNav('news') }}
      sideWidget={savedCampaign ? (
        <button type="button" className="gs-widget" onClick={onResume}>
          <span className="gs-widget__kicker"><Swords size={13} aria-hidden /> {ct('Campeonato em andamento')}</span>
          <span className="gs-widget__main">{savedCampaign.name}</span>
          <span className="gs-widget__sub">{savedCampaign.phase}</span>
        </button>
      ) : onDaily ? (
        <button type="button" className="gs-widget" onClick={onDaily}>
          <span className="gs-widget__kicker"><CalendarDays size={13} aria-hidden /> {ct('Diário de hoje')}</span>
          <span className="gs-widget__main">#{dayNo} <span className="gs-widget__vs">·</span> {dayStatus.done}/{DAILY_GAMES.length}</span>
          <span className="gs-widget__sub">{dailyLeft > 0 ? `${dailyLeft} ${ct('desafios esperando')}` : ct('Completo · volte amanhã')}</span>
        </button>
      ) : undefined}
    >
      {accountReady && !account && (
        // banner só existe visualmente no mobile (ver home.css): no desktop as 3
        // colunas do home-grid já mostram "Sua conta" sem scroll, então duplicar
        // aqui só criaria ruído. src próprio (home-guest-top) mede o efeito.
        <div className="home-guest-top">
          <Crown size={18} aria-hidden className="home-guest-top__ic" />
          <span className="home-guest-top__txt">
            <b>{ct('Crie sua conta')}</b>
            <small>{ct('vitalícia por R$20 · cloud sync, 5 carreiras e ranking real')}</small>
          </span>
          <Button variant="primary" onClick={() => { setCheckoutSrc('home-guest-top'); onCreateAccount?.(); }}>{ct('Criar conta')}</Button>
        </div>
      )}
      <div className="home-grid">
        {/* ── coluna 1: continuar ── */}
        <div className="gs-stack">
          <Panel icon={<Play size={16} />} title={ct('Continue de onde parou')} flush>
            {career.exists && onCareer && (
              <ResumeRow
                icon={career.tag && career.colors ? <TeamBadge tag={career.tag} colors={career.colors} logoUrl={career.logo} size={40} /> : <Trophy size={20} />}
                kicker={ct('Carreira')}
                title={career.org ?? ct('Carreira salva')}
                sub={`Split ${career.split ?? 1} · ${career.titles ?? 0} ${ct('títulos')}${career.budget != null ? ` · $ ${Math.round(career.budget / 1000)} mil` : ''}`}
                onGo={onCareer}
              />
            )}
            {rtp?.nick && onRoadToPro && (
              <ResumeRow icon={<Crosshair size={20} />} kicker="Road to Pro" title={rtp.nick} sub={`${rtp.team ?? ''}${rtp.ovr ? ` · OVR ${rtp.ovr}` : ''}${rtp.week ? ` · ${ct('semana')} ${rtp.week}` : ''}`} onGo={onRoadToPro} />
            )}
            {savedCampaign && onResume && (
              <ResumeRow icon={<Swords size={20} />} kicker={ct('Major rápido')} title={savedCampaign.name} sub={savedCampaign.phase} onGo={onResume} extra={onDiscardCampaign && (
                <button type="button" className="home-discard" onClick={(e) => { e.stopPropagation(); onDiscardCampaign(); }}>{ct('Descartar')}</button>
              )} />
            )}
            {!career.exists && !rtp?.nick && !savedCampaign && (
              <div className="home-empty">
                <Sparkles size={22} aria-hidden />
                <p>{ct('Nada em andamento ainda. Escolha um modo — a Carreira é o coração do jogo.')}</p>
                {onCareer && <Button variant="primary" onClick={onCareer}><Trophy size={16} aria-hidden /> {ct('Começar a Carreira')}</Button>}
              </div>
            )}
          </Panel>

          {onDaily && (
            <Panel icon={<CalendarDays size={16} />} title={`${ct('Diário')} #${dayNo}`} actions={dStreak.current >= 1 ? <span className="home-streak"><Flame size={14} aria-hidden /> {dStreak.current} {dStreak.current === 1 ? ct('dia') : ct('dias')}</span> : undefined} flush>
              {dStreak.atRisk && (
                <div className="ds-row home-risk"><TriangleAlert size={16} aria-hidden /> {ct('você perde')} {dStreak.current} {ct('dias em')} {dStreak.hoursLeft}h — {ct('jogue qualquer um dos 4 pra manter.')}</div>
              )}
              {DAILY_GAMES.map((g) => {
                const p = dayStatus.perGame[g.id];
                return (
                  <button key={g.id} type="button" className="ds-row home-daily" onClick={onDaily}>
                    <span className="home-daily__state" data-s={p?.done ? (p.won ? 'won' : 'lost') : 'new'} aria-hidden />
                    <b>{g.title}</b>
                    <span className="ds-dim">{p?.done ? (p.won ? ct('completo') : ct('foi por pouco')) : ct('novo')}</span>
                    <ChevronRight size={15} aria-hidden className="home-chev" />
                  </button>
                );
              })}
            </Panel>
          )}
        </div>

        {/* ── coluna 2: modos ── */}
        <Panel icon={<LayoutDashboard size={16} />} title={ct('Modos de jogo')} flush className="home-modes">
          {onCareer && (
            <ModeRow mode="carreira" icon={<Trophy size={20} />} title={ct('Carreira')} kicker={ct('Destaque')} desc={ct('Funde sua org, contrate, gerencie transferências e brigue pelo título numa temporada inteira.')} meta={ct('1 jogador · campanha')} cta={ct('Entrar')} onGo={onCareer} />
          )}
          {onRoadToPro && (
            <ModeRow
              mode="rtp" icon={<Crosshair size={20} />} title="Road to Pro" kicker={premiumLocked ? ct('Demo grátis') : ct('Novo')}
              desc={ct('Você não treina o time — você É o jogador. Viva a carreira de astro do CS: treine, gerencie sua vida e brilhe nos momentos decisivos.')}
              meta={premiumLocked ? `R$ 20 · ${ct('pagamento único, acesso vitalício — sem mensalidade')}` : ct('1 jogador · você é o atleta')}
              cta={premiumLocked ? ct('Jogar a demo grátis') : ct('Jogar')}
              onGo={onRoadToPro}
              extra={premiumLocked ? (
                <span className="home-mode__extra">
                  <FounderCounter style={{ fontSize: '11px' }} />
                  <button type="button" className="home-skip" onClick={(e) => { e.stopPropagation(); setCheckoutSrc('home-rtp-direto'); if (accountReady && account) onUpgrade?.(); else onCreateAccount?.(); }}>
                    {ct('Já quero virar Fundador · pular a demo')} →
                  </button>
                </span>
              ) : undefined}
            />
          )}
          {onUltimate && (
            <ModeRow mode="ultimate" icon={<Star size={20} />} title="Ultimate" kicker={ct('Competitivo · Online')} desc={ct('Abra pacotes, colecione os jogadores reais de 2026 e dispute a ranqueada online contra outros managers.')} meta={ultimateLocked ? ct('Exclusivo · conta vitalícia') : ct('Online · ranqueada')} cta={ultimateLocked ? ct('Desbloquear · R$20') : ct('Jogar')} onGo={() => (ultimateLocked ? (setCheckoutSrc('home-ultimate'), onCreateAccount?.()) : onUltimate())} />
          )}
          <ModeRow mode="major" icon={<Layers size={20} />} title="Draft" kicker={ct('Partida rápida')} desc={ct('Monte um cinco com lendas de cada era e dispute um Major avulso. Rápido e rejogável.')} meta={ct('1 jogador · ~15 min')} cta={ct('Montar')} onGo={() => setView('draft')} />
          {onDaily && (
            <ModeRow mode="diario" icon={<CalendarDays size={20} />} title={ct('Diário')} kicker={ct('Todo dia')} desc={ct('Quatro desafios por dia — o mesmo pra todo mundo. Grátis, sem conta.')} meta={ct('1 jogador · 2 min')} cta={ct('Jogar o de hoje')} onGo={onDaily} />
          )}
          {onUltimate && !ultimateLocked && (
            <ModeRow mode="online" icon={<Globe size={20} />} title="Online" kicker={ct('Ranqueada')} desc={ct('Ranqueada contra outros managers, duelo privado com amigos e o Major da Semana.')} meta={ct('Com o seu squad do Ultimate')} cta={ct('Competir')} onGo={onUltimate} />
          )}
        </Panel>

        {/* ── coluna 3: conta + novidades ── */}
        <div className="gs-stack">
          <Panel icon={<UserRound size={16} />} title={ct('Sua conta')}>
            {!accountReady ? (
              <p className="ds-dim">{ct('Carregando…')}</p>
            ) : !account ? (
              <div className="home-acct">
                <p>{ct('Você está jogando sem conta. Crie a sua pra salvar na nuvem e jogar no PC e no celular.')}</p>
                <Button variant="primary" block onClick={() => { setCheckoutSrc('acct-chip-guest'); onCreateAccount?.(); }}><Crown size={16} aria-hidden /> {ct('Criar conta')} · R$20</Button>
                <small className="ds-dim">{ct('pagamento único · sem mensalidade')}</small>
                <FounderCounter style={{ fontSize: '11px' }} />
                {onAccount && <button type="button" className="home-link" onClick={onAccount}>{ct('Já tenho conta · entrar')}</button>}
              </div>
            ) : (
              <div className="home-acct">
                <div className="home-acct__who">
                  <span className="ds-avatar" style={{ '--av': '40px', '--ring': 'var(--c-brand)' } as React.CSSProperties} aria-hidden>{(account.nick || account.email).slice(0, 1).toUpperCase()}</span>
                  <span>
                    <b>{account.nick || account.email}</b>
                    <small className="ds-dim">{account.founder ? `${ct('Fundador')}${account.founderNo != null ? ` #${String(account.founderNo).padStart(3, '0')}` : ''}` : account.paid ? ct('Conta vitalícia') : ct('Conta grátis')}</small>
                  </span>
                </div>
                {!account.paid && (
                  <>
                    <Button variant="primary" block onClick={() => { setCheckoutSrc('home-pill'); onUpgrade?.(); }}>
                      <Crown size={16} aria-hidden /> {founderSoldOut ? ct('Conta vitalícia') : ct('Vire Fundador')} · R$20
                    </Button>
                    <small className="ds-dim">{founderSoldOut ? ct('cloud sync, 5 carreiras e ranking real') : ct('selo #001–#500, cloud sync e 5 carreiras')}</small>
                    <FounderCounter style={{ fontSize: '11px' }} />
                  </>
                )}
                <div className="home-acct__links">
                  {onAccount && <button type="button" className="home-link" onClick={onAccount}>{ct('Meu perfil')}</button>}
                  {onAchievements && <button type="button" className="home-link" onClick={onAchievements}><Medal size={14} aria-hidden /> {ct('Conquistas')}</button>}
                  {onOpenRanking && <button type="button" className="home-link" onClick={onOpenRanking}>{ct('Ranking')}</button>}
                  {onAdmin && <button type="button" className="home-link" onClick={onAdmin}>{ct('Painel admin')}</button>}
                  {onLogout && <button type="button" className="home-link home-link--danger" onClick={onLogout}>{ct('Sair')}</button>}
                </div>
              </div>
            )}
          </Panel>

          <Panel icon={<Newspaper size={16} />} title={ct('Novidades')} actions={<button type="button" className="home-link" onClick={() => onShellNav('news')}>{ct('Ver tudo')}</button>} flush>
            {latest.map((it, i) => (
              <div key={i} className="ds-row home-news">
                <span className="home-news__tag" data-kind={it.kind}>{it.kind === 'feature' ? ct('Novo') : it.kind === 'fix' ? 'Fix' : ct('Ajuste')}</span>
                <span className="home-news__txt"><b>{it.area}</b> {it.text}</span>
              </div>
            ))}
          </Panel>

          <Panel icon={<Heart size={16} />} title={ct('Apoie o projeto')}>
            <p className="ds-dim home-small">{ct('O Road to Major é independente. Cada apoio vira servidor, times novos e modos novos.')}</p>
            <Button variant="secondary" onClick={onDonate}><Heart size={16} aria-hidden /> {ct('Apoiar')}</Button>
          </Panel>
        </div>
      </div>
    </GameShell>
  );
}

function ResumeRow({ icon, kicker, title, sub, onGo, extra }: { icon: ReactNode; kicker: string; title: string; sub: string; onGo: () => void; extra?: ReactNode }) {
  return (
    <div className="home-resume">
      <button type="button" className="home-resume__main" onClick={onGo}>
        <span className="home-resume__ic">{icon}</span>
        <span className="home-resume__txt">
          <span className="ds-kicker">{kicker}</span>
          <b>{title}</b>
          <small>{sub}</small>
        </span>
        <Play size={18} aria-hidden className="home-resume__go" />
      </button>
      {extra}
    </div>
  );
}

function ModeRow({ mode, icon, title, kicker, desc, meta, cta, onGo, extra }: {
  mode: string; icon: ReactNode; title: string; kicker: string; desc: string; meta: string; cta: string; onGo: () => void; extra?: ReactNode;
}) {
  return (
    <div className="home-mode" data-mode={mode === 'inicio' ? undefined : mode}>
      <button type="button" className="home-mode__main" onClick={onGo}>
        <span className="home-mode__ic">{icon}</span>
        <span className="home-mode__txt">
          <span className="home-mode__kicker">{kicker}</span>
          <b>{title}</b>
          <span className="home-mode__desc">{desc}</span>
          <small>{meta}</small>
        </span>
        <span className="home-mode__cta">{cta} <ChevronRight size={14} aria-hidden /></span>
      </button>
      {extra}
    </div>
  );
}
