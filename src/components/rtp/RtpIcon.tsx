import type { SVGProps } from 'react';
import type { RtpIconName } from '../../engine/rtp/icons';

// Ícones SVG próprios do Road to Pro (stroke, estilo dos DashIcons da carreira)
// — substituem os emojis pra tirar a "cara de vibecoding" e dar um visual
// premium e coeso. lucide-react NÃO está instalado, então são hand-rolled.
// O tipo RtpIconName vive em engine/rtp/icons.ts (sem React) pra o engine tipar.

export type { RtpIconName };

const P: Record<RtpIconName, React.ReactNode> = {
  energy: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />,
  fitness: <><path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5" /><path d="M6.5 12h11" /></>,
  morale: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.6 2.2 4 2.2 4-2.2 4-2.2" /><path d="M9 9h.01M15 9h.01" /></>,
  focus: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  fame: <path d="M12 3l2.6 5.6 6 .7-4.5 4.2 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z" />,
  money: <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.2c-.5-.9-1.5-1.2-2.5-1.2-1.4 0-2.5.7-2.5 1.8 0 2.6 5 1.3 5 4 0 1.2-1.2 1.9-2.6 1.9-1.1 0-2.1-.4-2.6-1.3M12 6.5v11" /></>,
  mech: <><circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></>,
  tactic: <><path d="M9 5a3 3 0 0 0-3 3 3 3 0 0 0-2 3.2A3 3 0 0 0 6 17a3 3 0 0 0 6 .6 3 3 0 0 0 6-.6 3 3 0 0 0 2-5.8A3 3 0 0 0 18 8a3 3 0 0 0-3-3 3 3 0 0 0-3 1.6A3 3 0 0 0 9 5z" /><path d="M12 6.6V18" /></>,
  physical: <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
  demos: <><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4M10 8.5l4 2.5-4 2.5z" /></>,
  gym: <><path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5" /><path d="M6.5 12h11" /></>,
  rest: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />,
  stream: <><path d="M4.5 11a8 8 0 0 1 8 8M4.5 5a14 14 0 0 1 14 14" /><circle cx="5" cy="19" r="1.4" fill="currentColor" /></>,
  social: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.2a4 4 0 0 1 0 7.6" /></>,
  brain: <><path d="M9 5a3 3 0 0 0-3 3 3 3 0 0 0-2 3.2A3 3 0 0 0 6 17a3 3 0 0 0 6 .6 3 3 0 0 0 6-.6 3 3 0 0 0 2-5.8A3 3 0 0 0 18 8a3 3 0 0 0-3-3 3 3 0 0 0-3 1.6A3 3 0 0 0 9 5z" /><path d="M12 6.6V18" /></>,
  crosshair: <><circle cx="12" cy="12" r="9" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>,
  bomb: <><circle cx="11" cy="14.5" r="6.5" /><path d="M15.5 9.9l2.1-2.1M17.6 7.8l1.2 1.2M18.2 4.5v3.1h3.1" /></>,
  skull: <><path d="M5 16v-3a7 7 0 1 1 14 0v3a2 2 0 0 1-2 2h-1v3H8v-3H7a2 2 0 0 1-2-2z" /><path d="M9 12h.01M15 12h.01" /></>,
  trade: <path d="M7 4l-4 4 4 4M3 8h13M17 20l4-4-4-4M21 16H8" />,
  spark: <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />,
  injury: <><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M12 8v8M8 12h8" /></>,
  fire: <path d="M12 3c1 3-1 4-1 6a3 3 0 0 0 3 3c1-1 1-2 1-3 2 2 3 4 3 6a6 6 0 0 1-12 0c0-3 3-5 3-8 0-1 1-2 3-4z" />,
  snow: <path d="M12 2v20M4 6l16 12M20 6L4 18M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M4 6l.3 4M4 6l4-.3M20 18l-.3-4M20 18l-4 .3" />,
  career: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v2h6V3M9 10h6M9 14h6M9 18h4" /></>,
  health: <path d="M20 9h-4V5a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v4H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h4v4a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-4h4a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1z" />,
  personal: <path d="M12 21s-7-4.5-9.5-9C.8 8.5 2.5 5 6 5c2 0 3.2 1.2 4 2.4C10.8 6.2 12 5 14 5c3.5 0 5.2 3.5 3.5 7-2.5 4.5-9.5 9-9.5 9z" transform="translate(2 0)" />,
  media: <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1zM15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14" />,
  team: <><rect x="2" y="6" width="20" height="12" rx="3" /><path d="M7 12h3M8.5 10.5v3M15 11h.01M18 13h.01" /></>,
  mouse: <><rect x="6" y="3" width="12" height="18" rx="6" /><path d="M12 7v4" /></>,
  keyboard: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></>,
  monitor: <><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  headset: <path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2zM20 14a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2zM17 16v1a3 3 0 0 1-3 3h-2" />,
  chair: <path d="M6 19v-3h12v3M6 16V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11M5 22l1-3M19 22l-1-3M9 9h6" />,
  pc: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h.01M8 11h.01M16 7v10" /></>,
  wifi: <path d="M2 8.5a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0M12 19h.01" />,
  pad: <><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M3 10h18" /></>,
  trophy: <path d="M7 4h10v4a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 17h6M8 21h8M12 13v4" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
  chart: <path d="M4 4v16h16M8 16v-4M12 16V8M16 16v-6" />,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.2a4 4 0 0 1 0 7.6" /></>,
  shop: <path d="M4 9l1-4h14l1 4M4 9h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9zM9 9v0a3 3 0 0 0 6 0M4 9a3 3 0 0 0 5 0M15 9a3 3 0 0 0 5 0" />,
  chevR: <path d="M9 6l6 6-6 6" />,
  chevL: <path d="M15 6l-6 6 6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M4 12.5l5 5 11-11" />,
  balance: <><path d="M12 3v18M5 21h14M7 7h10M7 7l-3.5 7a3.5 3.5 0 0 0 7 0L7 7zM17 7l-3.5 7a3.5 3.5 0 0 0 7 0L17 7z" /></>,
  party: <path d="M3 21l5.5-13 7.5 7.5L3 21zM14 3v3M19 8h3M16.5 5.5l2-2M14 11c2 0 3-1 3-3" />,
};

export function RtpIcon({ name, size = 18, className, ...rest }: { name: RtpIconName; size?: number; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden {...rest}
    >
      {P[name]}
    </svg>
  );
}
