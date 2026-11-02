// Design system do app — barrel de re-exports.
//
// Primitivos "Broadcast Desk" (src/styles/primitives.css + tokens.css): use
// daqui em código novo. Regras de uso em docs/design-system.md e a vitrine
// viva em /design (src/pages/DesignScreen.tsx).
//
// Os blocos de layout da Carreira (CareerShell/CareerDashFrame/DashCard)
// foram promovidos a sistema do app e continuam exportados abaixo.
export { DashCard } from '../career/DashCard';
export { CareerShell as AppShell, CareerDashFrame as AppFrame } from '../career/CareerShell';
export { appDashClass, useAppTheme } from '../../state/career-theme';
export { Modal, type ModalSize } from './Modal';
export { ToastProvider, useToast, type ToastVariant, type ToastItem } from './Toast';

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Panel, Card, CardButton, type PanelProps, type CardProps } from './Panel';
export { Tag, Badge, LiveBadge, type TagTone } from './Tag';
export { Tabs, TabPanel, type TabItem } from './Tabs';
export { Table, Segmented, type Column } from './Table';
export { Ovr, Bar, RoleChip, Chip, Avatar, roleColor } from './Bits';
export { Stat } from './Stat';
export { Alert, type AlertTone } from './Alert';
export { EmptyState } from './EmptyState';
export { Sheet } from './Sheet';
export { InfoTip } from './InfoTip';
export { Skeleton } from './Skeleton';
export { ProgressBar } from './ProgressBar';
export { Scoreboard, LowerThird, type ScoreTeam, type ScoreStatus } from './Broadcast';
export { LiveRegion, announce } from './LiveRegion';
export { useOverlay } from './useOverlay';
export { cx } from './cx';

// Shell universal do Road to Major (uma interface pra todos os modos)
export { GameShell, type GameShellProps } from './shell/GameShell';
export { ShellProvider, useShellGlobal, useDensity, setDensity, openPalette } from './shell/ShellContext';
export { PeekLayer, PeekCard, usePeekResolver, peekFromPlayer, type PeekData } from './shell/PlayerPeek';
export { CommandPalette } from './shell/CommandPalette';
export { MODE_DATA } from './shell/types';
export type {
  ModeId, ShellMode, ShellCommand, ShellUser, ShellGlobal, ShellNavItem, ShellNavGroup, ShellIdentity,
  ShellPending, ShellNext, ShellTab, ShellCrumb, ShellTool, PaletteItem, BadgeTone,
} from './shell/types';
export { AttrValue, AttrLegend, attrBand } from './Attr';
