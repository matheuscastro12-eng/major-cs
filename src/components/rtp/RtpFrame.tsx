import type { ReactNode } from 'react';
import { GameShell } from '../ds/shell/GameShell';
import { ct } from '../../state/career-i18n';

// Telas de fluxo do Road to Pro (criar jogador, partida, transferência, Major,
// fim de era) no shell universal: sem sidebar, só a topbar com o escudo da
// marca e o voltar. O root `.rtp` mantém os tokens/estilos do modo.
export function RtpFrame({
  onExit,
  right,
  kicker,
  children,
  immersive = false,
}: {
  onExit: () => void;
  right?: ReactNode;
  kicker?: string;      // contexto da tela (ex.: "MAJOR", "ERA 2026")
  children: ReactNode;
  /** partida ao vivo: topbar fina */
  immersive?: boolean;
}) {
  return (
    <GameShell
      mode="rtp"
      variant={immersive ? 'immersive' : 'focus'}
      identity={{ title: 'Road to Pro', subtitle: kicker }}
      title={kicker ?? ct('Road to Pro')}
      crumbs={[]}
      history={{ back: onExit }}
      meta={right}
    >
      <div className="rtp rtp-screen rtp-in-shell" data-fx="on">
        <div className="rtp-body">{children}</div>
      </div>
    </GameShell>
  );
}
