import type { ReactNode } from 'react';
import { GameShell, type GameShellProps } from '../ds/shell/GameShell';

// Hub do Road to Pro no shell universal: sidebar estilo FM com as seções do
// jogador (Principal · Jogador · Carreira · Social), topbar com o jogador e o
// CONTINUAR. O root `.rtp` mantém os tokens/estilos dos painéis do modo.
export type RtpShellProps = Omit<GameShellProps, 'mode' | 'children'> & { children: ReactNode };

export function RtpShell({ children, ...rest }: RtpShellProps) {
  return (
    <GameShell mode="rtp" {...rest}>
      <div className="rtp rtp-screen rtp-in-shell" data-fx="on">
        <div className="rtp-body">{children}</div>
      </div>
    </GameShell>
  );
}
