import { useCallback, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Player } from '../../types';
import { FutCard } from '../FutCard';
import { Flag, PlayerAvatar } from '../ui';

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
  const [hover, setHover] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cardW = 180;
    const cardH = 260;
    let left = r.left;
    let top = r.bottom + 8;
    if (left + cardW > window.innerWidth - 12) left = window.innerWidth - cardW - 12;
    if (top + cardH > window.innerHeight - 12) top = r.top - cardH - 8;
    setPos({ top: Math.max(8, top), left: Math.max(8, left) });
  }, []);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`player-link${className ? ` ${className}` : ''}`}
        onClick={() => onOpen(player)}
        onMouseEnter={() => { updatePos(); setHover(true); }}
        onMouseLeave={() => setHover(false)}
        onFocus={() => { updatePos(); setHover(true); }}
        onBlur={() => setHover(false)}
      >
        {avatarSize > 0 && <PlayerAvatar nick={player.nick} size={avatarSize} />}
        {children ?? (
          <>
            <Flag cc={player.country} /> {player.nick}
          </>
        )}
      </button>
      {hover && createPortal(
        <div
          className="player-link-preview"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <FutCard player={player} />
        </div>,
        document.body,
      )}
    </>
  );
}
