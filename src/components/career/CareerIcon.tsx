import type { ReactElement, SVGProps } from 'react';
import {
  IconSearch, IconSwords, IconTrophy, IconCheck,
} from './DashIcons';

export type CareerIconName =
  | 'trophy' | 'target' | 'calendar' | 'handshake' | 'chart' | 'rocket'
  | 'brain' | 'search' | 'map' | 'swords'
  | 'mood-5' | 'mood-4' | 'mood-3' | 'mood-2' | 'mood-1'
  | 'globe' | 'warning' | 'building' | 'phone' | 'document'
  | 'trend-up' | 'trend-down' | 'megaphone' | 'alert' | 'news' | 'chat'
  | 'battery' | 'focus' | 'bed' | 'trash' | 'dumbbell' | 'chart-bar' | 'heart'
  | 'medal' | 'check' | 'x' | 'lock' | 'coin' | 'pin' | 'star' | 'world'
  | 'film' | 'refresh';

type IProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 16) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

function Svg({ size = 16, children, ...p }: IProps & { children: React.ReactNode }) {
  return <svg {...base(size)} {...p}>{children}</svg>;
}

const ICONS: Record<CareerIconName, (p: IProps) => ReactElement> = {
  trophy: (p) => <IconTrophy {...p} />,
  search: (p) => <IconSearch {...p} />,
  swords: (p) => <IconSwords {...p} />,
  check: (p) => <IconCheck {...p} />,
  target: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></Svg>,
  calendar: (p) => <Svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>,
  handshake: (p) => <Svg {...p}><path d="M11 12l-2 2a2 2 0 002.8 2.8l1.2-1.2M13 12l2-2a2 2 0 00-2.8-2.8L11 8.2M8 12l-1 1M16 12l1 1" /></Svg>,
  chart: (p) => <Svg {...p}><path d="M4 19V5M4 19h16M8 17V9M12 17V7M16 17v-4" /></Svg>,
  rocket: (p) => <Svg {...p}><path d="M4.5 16.5c-1.5-1.26-2-5-2-5s3.74-.5 5-2c.71-.84 2.5-2.5 2.5-2.5s1.66 1.79 2.5 2.5c1.5 1.26 2 5 2 5s-3.74.5-5 2c-.84.71-2.5 2.5-2.5 2.5s-1.79-1.66-2.5-2.5z" /><path d="M12 15l-3-3M9 12l6 6" /></Svg>,
  brain: (p) => <Svg {...p}><path d="M9.5 2a2.5 2.5 0 00-2.5 2.5v1A2.5 2.5 0 005 8v2a2.5 2.5 0 002 2.5V14a2.5 2.5 0 002.5 2.5h1A2.5 2.5 0 0014 14v-1.5A2.5 2.5 0 0016.5 10V8a2.5 2.5 0 00-2.5-2.5v-1A2.5 2.5 0 0011.5 2h-2z" /><path d="M12 2v20" /></Svg>,
  map: (p) => <Svg {...p}><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" /><path d="M9 4v14M15 6v14" /></Svg>,
  globe: (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" /></Svg>,
  warning: (p) => <Svg {...p}><path d="M12 9v4M12 17h.01M10.3 3.6L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.6a2 2 0 00-3.4 0z" /></Svg>,
  building: (p) => <Svg {...p}><path d="M3 21h18M5 21V7l8-4v18M13 21V11l6 3v7" /></Svg>,
  phone: (p) => <Svg {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.8 19.8 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></Svg>,
  document: (p) => <Svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></Svg>,
  'trend-up': (p) => <Svg {...p}><path d="M23 6l-9.5 9.5-5-5L1 18M23 6h-6M23 6v6" /></Svg>,
  'trend-down': (p) => <Svg {...p}><path d="M23 18l-9.5-9.5-5 5L1 6M23 18h-6M23 18v-6" /></Svg>,
  megaphone: (p) => <Svg {...p}><path d="M3 11v2a4 4 0 004 4h1l6 4V3L8 7H7a4 4 0 00-4 4zM16 8a5 5 0 010 8" /></Svg>,
  alert: (p) => <Svg {...p}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" /></Svg>,
  news: (p) => <Svg {...p}><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2" /><path d="M18 14h-8M18 18h-8M10 6h8v4h-8z" /></Svg>,
  chat: (p) => <Svg {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></Svg>,
  battery: (p) => <Svg {...p}><rect x="2" y="7" width="18" height="10" rx="2" /><path d="M22 11v2" /><path d="M6 11v2M10 11v2M14 11v2" /></Svg>,
  focus: (p) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M16.9 16.9l2.1 2.1M4.9 19.1l2.1-2.1M16.9 7.1l2.1-2.1" /></Svg>,
  bed: (p) => <Svg {...p}><path d="M2 4v16M2 8h18a4 4 0 014 4v8M2 17h20M6 8v9" /></Svg>,
  trash: (p) => <Svg {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Svg>,
  dumbbell: (p) => <Svg {...p}><path d="M6.5 6.5l11 11M4 8l2-2M20 16l-2 2M4 16l2 2M20 8l-2-2M8 4l-2 2M16 20l2-2M8 20l-2-2M16 4l2 2" /><rect x="7" y="7" width="10" height="10" rx="1" /></Svg>,
  'chart-bar': (p) => <Svg {...p}><path d="M4 20V10M12 20V4M20 20v-6" /></Svg>,
  heart: (p) => <Svg {...p}><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" /></Svg>,
  medal: (p) => <Svg {...p}><circle cx="12" cy="14" r="5" /><path d="M8.2 6.2L12 2l3.8 4.2M7 6l-2 4M17 6l2 4" /></Svg>,
  x: (p) => <Svg {...p}><path d="M18 6L6 18M6 6l12 12" /></Svg>,
  lock: (p) => <Svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></Svg>,
  coin: (p) => <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9 10h4a2 2 0 010 4h-2" /></Svg>,
  pin: (p) => <Svg {...p}><path d="M12 22s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z" /><circle cx="12" cy="11" r="2" /></Svg>,
  star: (p) => <Svg {...p} fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z" /></Svg>,
  world: (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 010 20" /></Svg>,
  film: (p) => <Svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 8h20M7 4v4M17 4v4" /></Svg>,
  refresh: (p) => <Svg {...p}><path d="M3 12a9 9 0 0115.5-6.5L21 3v6h-6M21 12a9 9 0 01-15.5 6.5L3 21v-6h6" /></Svg>,
  'mood-5': (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></Svg>,
  'mood-4': (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M8 15h8M9 9h.01M15 9h.01" /></Svg>,
  'mood-3': (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M8 15h8M9 9h.01M15 9h.01" strokeDasharray="0" /></Svg>,
  'mood-2': (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M8 17c1-1.5 2.5-2 4-2s3 .5 4 2M9 9h.01M15 9h.01" /></Svg>,
  'mood-1': (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M8 17c1-1.5 2.5-2 4-2s3 .5 4 2M9 9h.01M15 15h.01" /></Svg>,
};

const LEGACY: Record<string, CareerIconName> = {
  '🏆': 'trophy', '🥇': 'medal', '🥈': 'medal', '🥉': 'medal', '★': 'star',
  '🌍': 'globe', '🌐': 'world', '⚠️': 'warning', '🏛️': 'building', '📞': 'phone',
  '📄': 'document', '📈': 'trend-up', '📉': 'trend-down', '😟': 'mood-2', '😡': 'mood-1',
  '🚨': 'alert', '📰': 'news', '📣': 'megaphone', '💬': 'chat', '🔥': 'star',
  '🎯': 'focus', '🗓️': 'calendar', '🔍': 'search', '🤝': 'handshake', '💸': 'coin',
  '👋': 'handshake', '🎬': 'film', '🔋': 'battery', '🛌': 'bed', '🗑': 'trash',
  '🏋️': 'dumbbell', '📊': 'chart-bar', '🧠': 'brain', '🗺️': 'map', '⚔️': 'swords',
  '🔁': 'refresh', '🔒': 'lock', '💰': 'coin', '📍': 'pin', '✅': 'check', '❌': 'x',
  '😄': 'mood-5', '🙂': 'mood-4', '😐': 'mood-3', '🚀': 'rocket', '❔': 'alert',
};

export function CareerIcon({ name, size = 16, className }: { name: CareerIconName; size?: number; className?: string }) {
  const C = ICONS[name] ?? ICONS.news;
  return <span className={`career-ic${className ? ` ${className}` : ''}`} aria-hidden><C size={size} /></span>;
}

export function CareerIconLegacy({ icon, size = 16, className }: { icon: string; size?: number; className?: string }) {
  const name = (LEGACY[icon] ?? (icon in ICONS ? icon : 'news')) as CareerIconName;
  return <CareerIcon name={name} size={size} className={className} />;
}

export const GAME_PLAN_ICONS: Record<string, CareerIconName> = {
  disciplined: 'brain',
  antistrat: 'search',
  mapfocus: 'map',
  aggressive: 'swords',
};
