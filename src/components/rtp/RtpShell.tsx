import type { ReactNode } from 'react';
import { IconChevronLeft } from '../career/DashIcons';
import { ct } from '../../state/career-i18n';
import { RtpIcon, type RtpIconName } from './RtpIcon';

// Shell COM ABAS do Road to Pro (estilo do dashboard da carreira, mas com a
// identidade "THE DESK"). Header broadcast + strip de abas sticky + corpo keyed
// (fade por aba). Hospeda os 5 painéis do hub (overview/training/league/market/
// profile). Telas de fluxo (create/match/transfer) seguem no RtpFrame simples.

export interface RtpTab {
  id: string;
  label: string;
  icon: RtpIconName;
  alert?: boolean;          // bolinha de aviso (ações pendentes, lesão, oferta…)
}

export function RtpShell({ active, onTab, tabs, right, onExit, children }: {
  active: string;
  onTab: (id: string) => void;
  tabs: RtpTab[];
  right?: ReactNode;
  onExit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rtp rtp-screen" data-fx="on">
      <header className="rtp-bar">
        <button type="button" className="rtp-bar-back" onClick={onExit} title={ct('Voltar')}>
          <IconChevronLeft size={16} />
        </button>
        <span className="rtp-bug">
          <span className="rtp-bug-rec" aria-hidden />
          <span className="rtp-bug-word">ROAD<i>//</i>PRO</span>
        </span>
        <span className="rtp-bar-spacer" />
        {right}
      </header>
      <div className="rtp-signal" aria-hidden />

      <nav className="rtp-tabs" role="tablist" aria-label={ct('Seções')}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            aria-label={t.label}
            className="rtp-tab"
            data-on={active === t.id ? '' : undefined}
            onClick={() => onTab(t.id)}
          >
            <RtpIcon name={t.icon} size={16} />
            <span className="rtp-tab-label">{t.label}</span>
            {t.alert && <span className="rtp-tab-alert" aria-hidden />}
          </button>
        ))}
      </nav>

      <div className="rtp-body" key={active}>{children}</div>
    </div>
  );
}
