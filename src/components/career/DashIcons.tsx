import type { SVGProps } from 'react';

type IProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 16) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export function IconChevronLeft({ size = 16, ...p }: IProps) {
  return <svg {...base(size)} {...p}><path d="M15 18l-6-6 6-6" /></svg>;
}
export function IconChevronRight({ size = 16, ...p }: IProps) {
  return <svg {...base(size)} {...p}><path d="M9 18l6-6-6-6" /></svg>;
}
export function IconChevronDown({ size = 12, ...p }: IProps) {
  return <svg {...base(size)} {...p}><path d="M6 9l6 6 6-6" /></svg>;
}
export function IconChevronsRight({ size = 16, ...p }: IProps) {
  return <svg {...base(size)} {...p}><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>;
}
export function IconSearch({ size = 18, ...p }: IProps) {
  return <svg {...base(size)} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" /></svg>;
}
export function IconEdit({ size = 18, ...p }: IProps) {
  return <svg {...base(size)} {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>;
}
export function IconSettings({ size = 18, ...p }: IProps) {
  return <svg {...base(size)} {...p}><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>;
}
export function IconSun({ size = 18, ...p }: IProps) {
  return <svg {...base(size)} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>;
}
export function IconMoon({ size = 18, ...p }: IProps) {
  return <svg {...base(size)} {...p}><path d="M21 14.5A8.5 8.5 0 1112.5 3a7 7 0 108.5 11.5z" /></svg>;
}
export function IconRefresh({ size = 16, ...p }: IProps) {
  return <svg {...base(size)} {...p}><path d="M3 12a9 9 0 0115.5-6.5L21 3v6h-6M21 12a9 9 0 01-15.5 6.5L3 21v-6h6" /></svg>;
}
export function IconHelp({ size = 16, ...p }: IProps) {
  return <svg {...base(size)} {...p}><circle cx="12" cy="12" r="10" /><path d="M9.5 9a2.5 2.5 0 014.8 1c0 2-3 2-3 4M12 17h.01" /></svg>;
}
export function IconPlay({ size = 14, ...p }: IProps) {
  return <svg {...base(size)} {...p} fill="currentColor" stroke="none"><path d="M8 5v14l11-7z" /></svg>;
}
export function IconFastForward({ size = 14, ...p }: IProps) {
  return <svg {...base(size)} {...p} fill="currentColor" stroke="none"><path d="M4 4v16l8-8-8-8zm10 0v16l8-8-8-8z" /></svg>;
}
export function IconCheck({ size = 14, ...p }: IProps) {
  return <svg {...base(size)} {...p}><path d="M20 6L9 17l-5-5" /></svg>;
}
export function IconSwords({ size = 14, ...p }: IProps) {
  return <svg {...base(size)} {...p}><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M6.5 3.5L3 7M21 3l-7 7M3 21l7-7" /></svg>;
}
export function IconTrophy({ size = 14, ...p }: IProps) {
  return <svg {...base(size)} {...p}><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4zM5 4H3v1a3 3 0 003 3M19 4h2v1a3 3 0 01-3 3" /></svg>;
}
export function IconTriangleUp({ size = 10, ...p }: IProps) {
  return <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor" {...p}><path d="M5 1L9 9H1z" /></svg>;
}
export function IconTriangleDown({ size = 10, ...p }: IProps) {
  return <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor" {...p}><path d="M5 9L1 1h8z" /></svg>;
}
export function IconStar({ size = 12, filled = true, ...p }: IProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z" />
    </svg>
  );
}
export function IconExternal({ size = 12, ...p }: IProps) {
  return <svg {...base(size)} {...p}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>;
}

export function StarRating({ value, max = 5, size = 11 }: { value: number; max?: number; size?: number }) {
  const full = Math.round(Math.max(0, Math.min(max, value)));
  return (
    <span className="dash-stars" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <IconStar key={i} size={size} filled={i < full} />
      ))}
    </span>
  );
}
