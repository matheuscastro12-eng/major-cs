import { useState } from 'react';
import { ct } from '../../state/career-i18n';
import { RtpIcon } from './RtpIcon';
import { RtpShell, type RtpTab } from './RtpShell';
import { RtpOverview, type RtpNotice } from './RtpOverview';
import { RtpTraining } from './RtpTraining';
import { RtpLeague } from './RtpLeague';
import { RtpTeam } from './RtpTeam';
import { RtpMarket } from './RtpMarket';
import { RtpProfile } from './RtpProfile';
import { LifeEventModal } from './LifeEventModal';
import type { RoadToProSave } from '../../engine/rtp/types';

type RtpTabId = 'overview' | 'training' | 'league' | 'team' | 'market' | 'profile';
const money = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;

// Hub do Road to Pro — dispatcher de abas (estilo dashboard da carreira). Cada
// aba é um painel próprio; o LifeEventModal vive AQUI (sobre qualquer aba) pra
// auto-abrir mesmo fora da Visão geral.
export function RTPHub({ save, onExit, onReset, onUpdate, onRetire, onPlayMatch, onAutoSim, onResolveEvent, notice, onDismissNotice }: {
  save: RoadToProSave;
  onExit: () => void;
  onReset: () => void;
  onUpdate: (next: RoadToProSave) => void;
  onRetire: () => void;
  onPlayMatch: () => void;
  onAutoSim: () => void;
  onResolveEvent: (eventId: string, optionId: string) => void;
  notice: RtpNotice | null;
  onDismissNotice: () => void;
}) {
  const { life, world } = save;
  const [tab, setTab] = useState<RtpTabId>('overview');
  const pendingEvent = save.inbox.find((e) => !e.resolved);

  const tabs: RtpTab[] = [
    { id: 'overview', label: ct('Visão geral'), icon: 'grid', alert: !!life.flags.injured },
    { id: 'training', label: ct('Treino'), icon: 'gym', alert: world.actionsLeft > 0 },
    { id: 'league', label: ct('Liga'), icon: 'trophy' },
    { id: 'team', label: ct('Time'), icon: 'team' },
    { id: 'market', label: ct('Mercado'), icon: 'trade', alert: (world.pendingOffers ?? []).length > 0 },
    { id: 'profile', label: ct('Perfil'), icon: 'users', alert: (save.player.progression?.perkPoints ?? 0) > 0 },
  ];

  return (
    <RtpShell
      active={tab}
      onTab={(id) => setTab(id as RtpTabId)}
      tabs={tabs}
      onExit={onExit}
      right={<span className="rtp-moneychip"><RtpIcon name="money" size={13} /> {money(life.money)}</span>}
    >
      {tab === 'overview' && (
        <RtpOverview save={save} notice={notice} onDismissNotice={onDismissNotice} onPlayMatch={onPlayMatch} onAutoSim={onAutoSim} onGoTab={(id) => setTab(id)} />
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
