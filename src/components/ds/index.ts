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
export { Table, type Column } from './Table';
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
