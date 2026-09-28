import type { ReactNode } from 'react';
import type { Player } from '../../types';
import { Flag, PlayerAvatar } from '../ui';

// Nome de jogador clicável da Carreira. O resumo rápido no hover (ou segurando
// o dedo) é o peek universal do shell (data-peek → PlayerPeek), o mesmo em
// qualquer tela; o clique abre o perfil completo.
export function PlayerLink({
  player,
  onOpen,
  children,
  avatarSize = 0,
  className = '',
}: {
  player: Player;
  onOpen: (p: Player) => void;
  children?: ReactNode;
  avatarSize?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`player-link${className ? ` ${className}` : ''}`}
      data-peek={`career:${player.id}`}
      onClick={() => onOpen(player)}
    >
      {avatarSize > 0 && <PlayerAvatar nick={player.nick} size={avatarSize} />}
      {children ?? (
        <>
          <Flag cc={player.country} /> {player.nick}
        </>
      )}
    </button>
  );
}
