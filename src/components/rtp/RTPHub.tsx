import { useState } from 'react';
import { ct } from '../../state/career-i18n';
import { useSectionHistory } from '../../state/app-history';
import { RtpShell } from './RtpShell';
import { circuitOpponent } from '../../engine/rtp/circuit';
import { Avatar } from '../ds/Bits';
import type { ShellNavGroup, ShellPending } from '../ds/shell/types';
import { Calendar, Crosshair, House, Target, Trophy, Users, ArrowLeftRight, Zap, Wallet, Swords, Play, HeartPulse } from 'lucide-react';
import { RtpOverview, type RtpNotice } from './RtpOverview';
import { RtpTraining } from './RtpTraining';
import { RtpLeague } from './RtpLeague';
import { RtpTeam } from './RtpTeam';
import { RtpMarket } from './RtpMarket';
import { RtpProfile } from './RtpProfile';
import { LifeEventModal } from './LifeEventModal';
import { RtpEraClose } from './RtpEraClose';
import { eraOf } from '../../engine/rtp/era';
import type { RoadToProSave, EraStamp } from '../../engine/rtp/types';

type RtpTabId = 'overview' | 'training' | 'league' | 'team' | 'market' | 'profile';
const RTP_TABS: RtpTabId[] = ['overview', 'training', 'league', 'team', 'market', 'profile'];
const money = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;

// Hub do Road to Pro — dispatcher de abas (estilo dashboard da carreira). Cada
// aba é um painel próprio; o LifeEventModal vive AQUI (sobre qualquer aba) pra
// auto-abrir mesmo fora da Visão geral.
export function RTPHub({ save, onExit, onReset, onUpdate, onRetire, onPlayMatch, onDaily, onAutoSim, onResolveEvent, notice, onDismissNotice }: {
  save: RoadToProSave;
  onExit: () => void;
  onReset: () => void;
  onUpdate: (next: RoadToProSave) => void;
  onRetire: () => void;
  onPlayMatch: () => void;
  onDaily?: () => void;
  onAutoSim: () => void;
  onResolveEvent: (eventId: string, optionId: string) => void;
  notice: RtpNotice | null;
  onDismissNotice: () => void;
}) {
  const { life, world, team } = save;
  const [tab, setTab] = useState<RtpTabId>('overview');
  const [eraView, setEraView] = useState<EraStamp | null>(null);   // [W6] carimbo aberto pra leitura
  // Voltar/Avançar (shell, Alt+←/→ e navegador) passam pelas abas do hub
  useSectionHistory('rtp', tab, (v) => { if (RTP_TABS.includes(v as RtpTabId)) setTab(v as RtpTabId); }, (path) => path === '/road-to-pro');
  const pendingEvent = save.inbox.find((e) => !e.resolved);
  const era = eraOf(save);

  if (eraView) return <RtpEraClose stamp={eraView} nick={save.player.nick} past onContinue={() => setEraView(null)} />;

  const next = circuitOpponent(save);
  const offers = (world.pendingOffers ?? []).length;
  const perks = save.player.progression?.perkPoints ?? 0;
  const nav: ShellNavGroup[] = [
    { id: 'principal', label: ct('Principal'), items: [
      { id: 'overview', label: ct('Visão geral'), icon: House, alert: !!life.flags.injured },
      ...(onDaily ? [{ id: 'daily', label: ct('Série do Dia'), icon: Zap }] : []),
    ] },
    { id: 'jogador', label: ct('Jogador'), items: [
      { id: 'training', label: ct('Treino'), icon: Crosshair, badge: world.actionsLeft > 0 ? world.actionsLeft : undefined },
      { id: 'profile', label: ct('Perfil e atributos'), icon: Target, badge: perks > 0 ? perks : undefined },
    ] },
    { id: 'carreira', label: ct('Carreira'), items: [
      { id: 'league', label: ct('Liga'), icon: Trophy },
      { id: 'team', label: ct('Time'), icon: Users },
      { id: 'market', label: ct('Mercado'), icon: ArrowLeftRight, badge: offers || undefined },
    ] },
  ];
  const onNav = (id: string) => { if (id === 'daily') onDaily?.(); else setTab(id as RtpTabId); };
  const pending: ShellPending[] = [
    ...(pendingEvent ? [{ id: 'life', label: pendingEvent.title ?? ct('Evento de vida pendente'), icon: HeartPulse, tone: 'warn' as const, blocking: true, onGo: () => setTab('overview') }] : []),
    ...(world.actionsLeft > 0 ? [{ id: 'train', label: `${world.actionsLeft} ${ct('ação(ões) de treino nesta semana')}`, icon: Crosshair, tone: 'info' as const, onGo: () => setTab('training') }] : []),
    ...(offers > 0 ? [{ id: 'offers', label: `${offers} ${ct('proposta(s) de clube')}`, icon: ArrowLeftRight, tone: 'info' as const, onGo: () => setTab('market') }] : []),
  ];

  return (
    <RtpShell
      identity={{ title: save.player.nick, subtitle: `${save.player.role} · ${team.teamName} · Era ${era.year}`, badge: <Avatar name={save.player.nick} role={save.player.role} size={38} />, colors: team.colors }}
      nav={nav}
      active={tab}
      onNav={onNav}
      tabs={nav.flatMap((g) => g.items).filter((it) => it.id !== 'daily').map((it) => ({ id: it.id, label: it.label, icon: it.icon, badge: it.badge, alert: it.alert }))}
      activeTab={tab}
      onTab={(id) => setTab(id as RtpTabId)}
      mobileNav={['overview', 'training', 'league', 'profile']}
      meta={(
        <>
          <span className="gs-chip gs-chip--win"><Wallet size={15} aria-hidden /> {money(life.money)}</span>
          <span className="gs-when"><b>{ct('Semana')} {world.week}</b><small>Era {era.year}</small></span>
        </>
      )}
      next={next
        ? { label: ct('Continuar'), detail: `${ct('Série vs')} ${next.team.tag || next.team.name} · MD${next.bestOf}`, icon: Play, onGo: onPlayMatch, pending }
        : { label: ct('Continuar'), detail: ct('Sem série agendada'), disabled: true, pending }}
      sideWidget={next ? (
        <button type="button" className="gs-widget" onClick={onPlayMatch}>
          <span className="gs-widget__kicker"><Swords size={13} aria-hidden /> {ct('Próxima série')}</span>
          <span className="gs-widget__main">{team.tag} <span className="gs-widget__vs">vs</span> {next.team.tag || next.team.name}</span>
          <span className="gs-widget__sub">{next.stage} · MD{next.bestOf}</span>
        </button>
      ) : (
        <div className="gs-widget">
          <span className="gs-widget__kicker"><Calendar size={13} aria-hidden /> {ct('Temporada')}</span>
          <span className="gs-widget__main">Era {era.year}</span>
          <span className="gs-widget__sub">{ct('Semana')} {world.week}</span>
        </div>
      )}
    >
      {tab === 'overview' && (
        <RtpOverview save={save} notice={notice} onDismissNotice={onDismissNotice} onPlayMatch={onPlayMatch} onDaily={onDaily} onAutoSim={onAutoSim} onGoTab={(id) => setTab(id)} onOpenEra={setEraView} />
      )}
      {tab === 'training' && <RtpTraining save={save} onUpdate={onUpdate} />}
      {tab === 'league' && <RtpLeague save={save} />}
      {tab === 'team' && <RtpTeam save={save} />}
      {tab === 'market' && <RtpMarket save={save} />}
      {tab === 'profile' && <RtpProfile save={save} onExit={onExit} onReset={onReset} onUpdate={onUpdate} onRetire={onRetire} />}

      {/* Evento de vida pendente (auto-abre sobre qualquer aba) */}
      {pendingEvent && (
        <LifeEventModal event={pendingEvent} onResolve={(optId) => onResolveEvent(pendingEvent.id, optId)} />
      )}
    </RtpShell>
  );
}
