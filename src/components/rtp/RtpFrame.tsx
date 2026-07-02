import type { ReactNode } from 'react';
import { IconChevronLeft } from '../career/DashIcons';
import { ct } from '../../state/career-i18n';

// Shell base do Road to Pro — "THE DESK". Identidade broadcast/HUD própria,
// root `.rtp` (tokens --rtp-*, sempre-dark, desacoplado da Carreira). Top bar com
// channel-bug (REC/LIVE), back e um slot direito. Telas simples (create/transfer/
// match/lifeevent) usam isto; o hub tem layout próprio mais rico por cima.
export function RtpFrame({
  onExit,
  right,
  kicker,
  children,
}: {
  onExit: () => void;
  right?: ReactNode;
  kicker?: string;      // texto pequeno à direita do wordmark (ex.: "MATCHDAY")
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
          {kicker && <span className="rtp-bug-kicker">{kicker}</span>}
        </span>
        <span className="rtp-bar-spacer" />
        {right}
      </header>
      <div className="rtp-signal" aria-hidden />
      <div className="rtp-body">{children}</div>
    </div>
  );
}
