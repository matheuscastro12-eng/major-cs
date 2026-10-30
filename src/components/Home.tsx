// Início (Portal) — a porta de entrada do Road to Major no shell universal.
// Uma ação principal no topo (PRÓXIMA AÇÃO, regra pura em state/homeNext.ts,
// a mesma do CONTINUAR da topbar), o bloco do PGL Major (contagem até 24/11,
// AO VIVO de 24/11 a 13/12, some depois), os modos numa grade compacta com o
// tempo de cada um, a conta, a última novidade e o apoio, nessa ordem. No
// celular a sidebar fica atrás do Menu: esta tela é o que o jogador vê.
//
// Funil (mantido do menu antigo, mesmos src de telemetria): Road to Pro com
// DEMO GRÁTIS + atalho "pular a demo" (home-rtp / home-rtp-direto), pill de
// Fundador pra conta grátis (home-pill), CTA de conta pro convidado
// (acct-chip-guest), aviso de streak em risco (streak_at_risk_seen).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Award, CalendarDays, ChevronRight, Crosshair, Flame, Heart, Layers, Newspaper, Play,
  Shuffle, Star, Swords, Trophy, UserRound, Crown, Lock, Medal, PencilRuler, type LucideIcon,
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
import { majorClock, majorPromoOn, type MajorClock } from '../data/majorWindow';
import { nextAction, readMajorLocal, type HomeAction, type MajorRunBrief, type PickemProgress } from '../state/homeNext';
import { openPatchNotes } from './PatchNotesModal';
import { BrandMark } from './brand';
import { FounderCounter } from './FounderCounter';
import { useFounders } from '../state/founders';
import { GameShell, Panel, Button, Segmented, Tag, LiveBadge, ProgressBar, type ShellNavGroup, type ShellNext, type ShellPending } from './ds/index';
import type { Account } from '../state/account';
import { priceLabel, usePrice, withPrice } from '../state/price';

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
  /** Abre o Modo Major (PGL Major Singapore); o card só aparece na janela do evento */
  onMajor?: () => void;
  /** Road to Pro sem vitalícia = demo (card continua visível, com atalho de compra) */
  premiumLocked?: boolean;
  /** Trava o card do Ultimate. Ultimate abriu pra todos → passado como false. */
  ultimateLocked?: boolean;
  onLeaderboard?: () => void;
  onCareer?: () => void;
  /** [fase 4] editor de base (jogadores, times, elencos) */
  onEditor?: () => void;
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

/** relógio da tela (contagem do Major): 1 tique a cada 30 s, só com o portal aberto */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

const majorPhaseLabel = (r: MajorRunBrief) => (r.phase === 4 ? 'Playoffs' : `Stage ${r.phase}`);
const pad2 = (n: number) => String(n).padStart(2, '0');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** o que cada ação mostra: bloco principal, linha secundária e o CONTINUAR do shell */
interface ActionView {
  icon: LucideIcon;
  kicker: string;
  title: string;
  detail: string;
  cta: string;
  /** rótulo e detalhe curtos (linha secundária) */
  short: string;
  sub: string;
  /** verbo e detalhe do CONTINUAR da topbar */
  verb: string;
  shellDetail: string;
  tag?: ReactNode;
  onGo: () => void;
}

export function Home(props: Props) {
  usePrice(); // re-renderiza quando o preço do servidor chega
  const {
    onStart, onDonate, teamCount, onUltimate, onRoadToPro, onDaily, premiumLocked, ultimateLocked, onCareer,
    account, accountReady, onAccount, onCreateAccount, onUpgrade, onLogout, onAdmin, savedCampaign, onResume,
    onDiscardCampaign, shellNav, onShellNav, viewReq, onAchievements, onOpenRanking, onEditor, onMajor,
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
  // pick'em e campanha do Modo Major, lidos crus do navegador (sem o JSON dos 32 times)
  const majorLocal = useMemo(() => readMajorLocal(), []);
  const now = useNow(view === 'menu');

  const start = () => onStart(mode, name.trim() || 'DREAM FIVE', pool, difficulty);

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

  // ── PRÓXIMA AÇÃO: uma só, pela regra de state/homeNext.ts ──
  const dailyTotal = DAILY_GAMES.length;
  const dailyLeft = dailyTotal - dayStatus.done;
  const majorWindow = majorPromoOn(now);
  const clock = majorClock(now);
  const { pickem, run } = majorLocal;
  const plan = nextAction({
    majorRun: run,
    draftRun: savedCampaign ?? null,
    streak: { atRisk: dStreak.atRisk, current: dStreak.current },
    majorWindow,
    pickem,
    daily: { done: dayStatus.done, total: dailyTotal },
    can: { major: !!onMajor, resume: !!onResume, daily: !!onDaily, career: !!onCareer },
  });
  const days = (n: number) => `${n} ${n === 1 ? ct('dia') : ct('dias')}`;
  const careerSub = career.exists && career.org ? `${career.org} · Split ${career.split ?? 1}` : '';

  const describe = (a: HomeAction): ActionView => {
    switch (a.id) {
      case 'major-run': {
        const r = run!;
        const sub = r.wins + r.losses > 0 ? `${majorPhaseLabel(r)} · ${r.wins}–${r.losses}` : ct('1ª série esperando');
        return {
          icon: Award, kicker: ct('Modo Major · sua campanha'), title: ct('Continuar o Major'),
          detail: r.wins + r.losses > 0 ? `${majorPhaseLabel(r)} · ${r.wins}–${r.losses} ${ct('em séries')}. ${ct('A próxima série está esperando o seu time.')}` : ct('Time escolhido. A 1ª série está esperando o seu time.'),
          cta: ct('Continuar'), short: ct('Continuar o Major'), sub, verb: ct('Continuar'), shellDetail: `${ct('Modo Major')} · ${sub}`, onGo: onMajor!,
        };
      }
      case 'draft-run': {
        const s = savedCampaign!;
        return {
          icon: Swords, kicker: ct('Draft · campeonato em andamento'), title: s.name, detail: s.phase,
          cta: ct('Continuar'), short: ct('Retomar campeonato'), sub: s.name, verb: ct('Continuar'), shellDetail: s.name, onGo: onResume!,
        };
      }
      case 'streak':
        return {
          icon: Flame, kicker: `${ct('Diário')} #${dayNo}`, title: ct('Salvar a sequência'),
          detail: cap(`${ct('você perde')} ${dStreak.current} ${ct('dias em')} ${dStreak.hoursLeft}h — ${ct('jogue qualquer um dos 4 pra manter.')}`),
          cta: ct('Jogar o Diário'), short: ct('Salvar a sequência'), sub: `${days(dStreak.current)} · ${dStreak.hoursLeft}h`,
          verb: ct('Continuar'), shellDetail: `${ct('Diário')} #${dayNo} · ${ct('salve a sequência')}`,
          tag: <Tag tone="warn" icon={<Flame size={12} aria-hidden />}>{days(dStreak.current)} · {dStreak.hoursLeft}h</Tag>,
          onGo: onDaily!,
        };
      case 'pickem':
        return {
          icon: Award, kicker: 'PGL Major Singapore', title: ct("Fazer meu pick'em do Major"),
          detail: pickem.steps > 0
            ? `${pickem.steps} ${ct('de')} ${pickem.total} ${ct('etapas feitas. Falta fechar o resto até o campeão.')}`
            : ct("Escolha quem avança em cada Stage e monte a chave até o campeão. Grátis, sem conta."),
          cta: ct("Fazer meu pick'em"), short: ct("Fazer meu pick'em"), sub: `${pickem.steps}/${pickem.total} ${ct('etapas')}`,
          verb: ct('Jogar'), shellDetail: ct("Pick'em do Major"), onGo: onMajor!,
        };
      case 'daily':
        return {
          icon: CalendarDays, kicker: `${ct('Diário')} #${dayNo}`, title: ct('Jogar o Diário'),
          detail: dayStatus.done === 0 ? ct('Quatro desafios por dia — o mesmo pra todo mundo. Grátis, sem conta.') : `${dailyLeft} ${ct('desafios esperando')}`,
          cta: ct('Jogar o de hoje'), short: ct('Jogar o Diário'), sub: `#${dayNo} · ${dayStatus.done}/${dailyTotal}`,
          verb: ct('Jogar'), shellDetail: `${ct('Diário')} #${dayNo}`, onGo: onDaily!,
        };
      case 'career':
        return career.exists ? {
          icon: Trophy, kicker: ct('Carreira'), title: career.org ?? ct('Carreira salva'),
          detail: `Split ${career.split ?? 1} · ${career.titles ?? 0} ${ct('títulos')}${career.budget != null ? ` · $ ${Math.round(career.budget / 1000)} mil` : ''}`,
          cta: ct('Continuar'), short: ct('Continuar a Carreira'), sub: careerSub || ct('campanha'),
          verb: ct('Continuar'), shellDetail: careerSub || ct('Carreira'), onGo: onCareer!,
        } : {
          icon: Trophy, kicker: ct('Carreira'), title: ct('Começar a Carreira'),
          detail: ct('Funde sua org, contrate, gerencie transferências e brigue pelo título numa temporada inteira.'),
          cta: ct('Começar'), short: ct('Começar a Carreira'), sub: ct('campanha'), verb: ct('Começar'), shellDetail: ct('Carreira'), onGo: onCareer!,
        };
      case 'draft-new':
      default:
        return {
          icon: Layers, kicker: ct('Partida rápida'), title: ct('Novo Major'),
          detail: ct('Monte um cinco com lendas de cada era e dispute um Major avulso. Rápido e rejogável.'),
          cta: ct('Montar'), short: ct('Partida rápida'), sub: 'Draft · ~15 min', verb: ct('Jogar'), shellDetail: ct('Novo Major'), onGo: () => setView('draft'),
        };
    }
  };
  const primary = describe(plan.primary);
  const secondary = plan.secondary.map((a) => ({ a, v: describe(a) }));

  // ── CONTINUAR da topbar: a mesma ação principal ──
  const pending: ShellPending[] = [];
  if (dStreak.atRisk && onDaily) pending.push({ id: 'streak', label: `${ct('Sua sequência de')} ${dStreak.current} ${ct('dias acaba em')} ${dStreak.hoursLeft}h`, tone: 'warn', icon: Flame, onGo: onDaily });
  if (accountReady && !account) pending.push({ id: 'acct', label: ct('Jogando sem conta: o progresso fica só neste navegador'), tone: 'info', icon: Lock, onGo: () => { setCheckoutSrc('acct-chip-guest'); onCreateAccount?.(); } });
  const next: ShellNext = { label: primary.verb, detail: primary.shellDetail, onGo: primary.onGo, icon: primary.icon, pending };

  const patch = PATCHES[0];
  const PrimaryIcon = primary.icon;
  const showMajor = !!onMajor && clock.phase !== 'after';

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
      <div className={`home2${showMajor ? '' : ' home2--solo'}`}>
        {/* ── 1. próxima ação ── */}
        <section className="home-next" aria-labelledby="home-next-title">
          <div className="home-next__lead">
            <p className="home-next__kicker">
              <span>{ct('Próxima ação')}</span>
              <span className="home-next__sep" aria-hidden>/</span>
              <span className="home-next__why">{primary.kicker}</span>
            </p>
            <h2 id="home-next-title" className="home-next__title">{primary.title}</h2>
            {primary.tag}
            <p className="home-next__detail">{primary.detail}</p>
            <div className="home-next__go">
              <Button variant="primary" size="lg" icon={<PrimaryIcon size={18} aria-hidden />} onClick={primary.onGo}>{primary.cta}</Button>
              {plan.primary.id === 'draft-run' && onDiscardCampaign && (
                <button type="button" className="home-discard" onClick={onDiscardCampaign}>{ct('Descartar')}</button>
              )}
            </div>
          </div>
          {secondary.length > 0 && (
            <div className="home-next__more">
              <p className="ds-kicker">{ct('Ou, se preferir')}</p>
              <ul className="home-alts">
                {secondary.map(({ a, v }) => {
                  const Icon = v.icon;
                  return (
                    <li key={a.id}>
                      <button type="button" className="home-alt" onClick={v.onGo}>
                        <Icon size={18} aria-hidden className="home-alt__ic" />
                        <span className="home-alt__txt"><b>{v.short}</b><small>{v.sub}</small></span>
                        <ChevronRight size={16} aria-hidden className="home-alt__go" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* ── 2. PGL Major Singapore ── */}
        {showMajor && <MajorBlock clock={clock} pickem={pickem} onMajor={onMajor!} />}

        {/* ── 3. modos ── */}
        <section className="home-modes2" aria-labelledby="home-modes-title">
          <h2 id="home-modes-title" className="home-h">{ct('Modos de jogo')}</h2>
          <ul className="home-tiles">
            {onMajor && majorWindow && (
              <Tile mode="major" icon={Award} title={ct('Modo Major')} time={ct('~1 min')}
                status={pickem.complete ? ct("pick'em feito") : pickem.steps > 0 ? `pick'em ${pickem.steps}/${pickem.total}` : ct('grátis')}
                onGo={onMajor} />
            )}
            {onDaily && (
              <Tile mode="diario" icon={CalendarDays} title={ct('Diário')} time={ct('2 min')}
                status={dayStatus.done >= dailyTotal ? ct('Completo · volte amanhã') : `${dayStatus.done}/${dailyTotal} ${ct('feitos hoje')}`}
                onGo={onDaily} />
            )}
            <Tile mode="major" icon={Layers} title="Draft" time="~15 min" status={savedCampaign ? ct('em andamento') : undefined} onGo={() => setView('draft')} />
            {onCareer && (
              <Tile mode="carreira" icon={Trophy} title={ct('Carreira')} time={ct('campanha')} status={careerSub || undefined} onGo={onCareer} />
            )}
            {onRoadToPro && (
              <Tile
                mode="rtp" icon={Crosshair} title="Road to Pro" wide={premiumLocked}
                time={premiumLocked ? ct('demo grátis') : ct('campanha')}
                status={rtp?.nick ? `${rtp.nick}${rtp.ovr ? ` · OVR ${rtp.ovr}` : ''}` : undefined}
                cta={premiumLocked ? ct('Jogar a demo grátis') : undefined}
                onGo={onRoadToPro}
                foot={premiumLocked ? (
                  <>
                    <small className="home-tile__price">{`${priceLabel()} · ${ct('pagamento único, acesso vitalício — sem mensalidade')}`}</small>
                    <FounderCounter />
                    <button type="button" className="home-skip" onClick={() => { setCheckoutSrc('home-rtp-direto'); if (accountReady && account) onUpgrade?.(); else onCreateAccount?.(); }}>
                      {ct('Já quero virar Fundador · pular a demo')} →
                    </button>
                  </>
                ) : undefined}
              />
            )}
            {onUltimate && (
              <Tile mode="ultimate" icon={Star} title="Ultimate" time={ct('online')}
                status={ultimateLocked ? withPrice(ct('Desbloquear · {preço}')) : ct('pacotes e ranqueada')}
                onGo={() => (ultimateLocked ? (setCheckoutSrc('home-ultimate'), onCreateAccount?.()) : onUltimate())} />
            )}
            {onEditor && (
              <Tile mode="carreira" icon={PencilRuler} title={ct('Editor de base')} status={ct('jogadores, times e elencos')} onGo={onEditor} />
            )}
          </ul>
        </section>

        {/* ── 4. conta + 5. novidade (coluna da direita no desktop largo) ── */}
        <div className="home-side">
          <Panel icon={<UserRound size={16} />} title={ct('Sua conta')}>
            {!accountReady ? (
              <p className="ds-dim">{ct('Carregando…')}</p>
            ) : !account ? (
              <div className="home-acct">
                <p>{ct('Você está jogando sem conta. Crie a sua pra salvar na nuvem e jogar no PC e no celular.')}</p>
                <Button variant="primary" block onClick={() => { setCheckoutSrc('acct-chip-guest'); onCreateAccount?.(); }}><Crown size={16} aria-hidden /> {ct('Criar conta')} · {priceLabel()}</Button>
                <small className="ds-dim">{ct('pagamento único · sem mensalidade')}</small>
                <FounderCounter />
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
                      <Crown size={16} aria-hidden /> {founderSoldOut ? ct('Conta vitalícia') : ct('Vire Fundador')} · {priceLabel()}
                    </Button>
                    <small className="ds-dim">{founderSoldOut ? ct('cloud sync, 5 carreiras e ranking real') : ct('selo #001–#500, cloud sync e 5 carreiras')}</small>
                    <FounderCounter />
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

          {/* novidades: só o patch mais recente (título + 1 linha) */}
          {patch && (
            <Panel icon={<Newspaper size={16} />} title={ct('Novidades')}
              actions={<button type="button" className="home-link" onClick={openPatchNotes}>{ct('Ver tudo')}</button>}>
              <p className="home-patch__when">{patch.date}</p>
              <h3 className="home-patch__title">{patch.title}</h3>
              {patch.items[0] && <p className="home-patch__line">{patch.items[0].text}</p>}
            </Panel>
          )}
        </div>

        {/* ── 6. apoio, pequeno, no fim ── */}
        <aside className="home-support" aria-label={ct('Apoie o projeto')}>
          <Heart size={16} aria-hidden className="home-support__ic" />
          <p>{ct('O Road to Major é independente. Cada apoio vira servidor, times novos e modos novos.')}</p>
          <Button variant="ghost" size="sm" onClick={onDonate}>{ct('Apoiar')}</Button>
        </aside>
      </div>
    </GameShell>
  );
}

/** PGL Major Singapore: contagem até 24/11, AO VIVO até 13/12 (depois o bloco nem renderiza) */
function MajorBlock({ clock, pickem, onMajor }: { clock: MajorClock; pickem: PickemProgress; onMajor: () => void }) {
  if (clock.phase === 'after') return null;
  const live = clock.phase === 'live';
  return (
    <section className="home-major" data-live={live || undefined} aria-labelledby="home-major-title">
      <div className="home-major__top">
        <p className="home-major__kicker"><Award size={14} aria-hidden /> PGL Major Singapore</p>
        {live ? <LiveBadge>{ct('Ao vivo')}</LiveBadge> : <Tag>{ct('24/11 a 13/12')}</Tag>}
      </div>
      {clock.phase === 'before' ? (
        <>
          <h2 id="home-major-title" className="home-major__title">{ct('Começa em')}</h2>
          <div className="home-clock" role="timer">
            <span className="ds-sr-only">
              {`${clock.days} ${clock.days === 1 ? ct('dia') : ct('dias')}, ${clock.hours} ${ct('horas')} ${ct('e')} ${clock.minutes} ${ct('minutos')}`}
            </span>
            <span className="home-clock__cell" aria-hidden><b>{clock.days}</b><small>{clock.days === 1 ? ct('dia') : ct('dias')}</small></span>
            <span className="home-clock__cell" aria-hidden><b>{pad2(clock.hours)}</b><small>{ct('horas')}</small></span>
            <span className="home-clock__cell" aria-hidden><b>{pad2(clock.minutes)}</b><small>{ct('min')}</small></span>
          </div>
          <p className="home-major__meta">{ct('Singapura · playoffs de 10 a 13/12')}</p>
        </>
      ) : (
        <>
          <h2 id="home-major-title" className="home-major__title">
            {clock.finalDay ? ct('Hoje é a final') : clock.playoffs ? ct('Playoffs') : ct('Fase suíça')}
          </h2>
          <p className="home-major__day"><b>{ct('Dia')} {clock.day}</b> {ct('de')} {clock.of}</p>
          <p className="home-major__meta">{clock.playoffs ? ct('Singapura · final em 13/12') : ct('Singapura · playoffs de 10 a 13/12')}</p>
        </>
      )}
      <ProgressBar
        className="home-major__pick" value={pickem.steps} max={pickem.total} label={ct("Seu pick'em")}
        valueText={pickem.complete ? ct("pick'em feito") : `${pickem.steps}/${pickem.total} ${ct('etapas')}`}
      />
      <div className="home-major__go">
        <Button variant="secondary" onClick={onMajor} iconRight={<ChevronRight size={16} aria-hidden />}>{ct('Abrir o Modo Major')}</Button>
      </div>
    </section>
  );
}

/** um modo na grade: nome, o tempo honesto que ele pede e o estado (save, progresso de hoje) */
function Tile({ mode, icon: Icon, title, time, status, cta, onGo, wide, foot }: {
  mode: string; icon: LucideIcon; title: string; time?: string; status?: string; cta?: string; onGo: () => void; wide?: boolean; foot?: ReactNode;
}) {
  return (
    <li className={`home-tile${wide ? ' home-tile--wide' : ''}`} data-mode={mode}>
      <button type="button" className="home-tile__main" onClick={onGo}>
        <span className="home-tile__top">
          <span className="home-tile__ic"><Icon size={18} aria-hidden /></span>
          {time && <span className="home-tile__time">{time}</span>}
          {cta && <span className="home-tile__cta">{cta} <ChevronRight size={14} aria-hidden /></span>}
        </span>
        <b className="home-tile__name">{title}</b>
        {status && <small className="home-tile__status">{status}</small>}
      </button>
      {foot && <div className="home-tile__foot">{foot}</div>}
    </li>
  );
}
