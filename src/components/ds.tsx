// Entrada estável do design system: `import { Button, Panel } from './ds'`.
//
// <Panel> e <Button> mantêm a API antiga (Landing, Hall, Leaderboard,
// ManagerProfile, OnlineScreen etc. não mudam uma linha) mas agora renderizam
// os primitivos "Broadcast Desk" em CSS (src/styles/primitives.css): hover e
// foco em CSS em vez de useState (UX-10), alvo de 44px no toque, e o `gold`
// virou a variante de conquista — contorno dourado, não um clone do primary
// (UX-03). O resto do barrel ./ds/ é re-exportado abaixo.
import type { CSSProperties, ReactNode } from 'react';
import { Button as DsButton, type ButtonProps, type ButtonSize, type ButtonVariant } from './ds/Button';
import { Panel as DsPanel } from './ds/Panel';

export {
  DashCard, AppShell, AppFrame, appDashClass, useAppTheme, Modal, ToastProvider, useToast,
  Card, CardButton, Tag, Badge, LiveBadge, Tabs, TabPanel, Table, Stat, Alert, EmptyState, Sheet,
  InfoTip, Skeleton, ProgressBar, Scoreboard, LowerThird, LiveRegion, announce, cx,
  GameShell, ShellProvider, useShellGlobal, useDensity, setDensity, openPalette, PeekLayer, PeekCard,
  usePeekResolver, peekFromPlayer, CommandPalette, MODE_DATA, AttrValue, AttrLegend, attrBand,
  Segmented, Ovr, Bar, RoleChip, Chip, Avatar, roleColor,
} from './ds/index';
export type {
  ModalSize, ToastVariant, ToastItem, TagTone, TabItem, Column, AlertTone, ScoreTeam, ScoreStatus,
  GameShellProps, PeekData, ModeId, ShellMode, ShellCommand, ShellUser, ShellGlobal, ShellNavItem, ShellNavGroup,
  ShellIdentity, ShellPending, ShellNext, ShellTab, ShellCrumb, ShellTool, PaletteItem, BadgeTone,
} from './ds/index';

type LegacyVariant = ButtonVariant | 'gold';
type LegacySize = ButtonSize | 'big';

// Nomes antigos → primitivos: gold = conquista, big = lg. Padrão continua
// 'primary' (era o padrão do Button antigo).
export function Button({ variant = 'primary', size = 'md', ...rest }: Omit<ButtonProps, 'variant' | 'size'> & { variant?: LegacyVariant; size?: LegacySize }) {
  const v: ButtonVariant = variant === 'gold' ? 'achievement' : variant;
  const s: ButtonSize = size === 'big' ? 'lg' : size;
  return <DsButton variant={v} size={s} {...rest} />;
}

// Painel: wrapper do .ds-panel. accent 'gold' = painel em foco (acento do
// modo); 'blue'/'none' = neutro. `dash` mantém a classe .dash-panel que o CSS
// legado ainda estiliza em alguns lugares.
export function Panel({ title, actions = null, accent = 'blue', flush = false, children, style, dash = false, className = '' }: {
  title?: ReactNode; actions?: ReactNode; accent?: 'blue' | 'gold' | 'none'; flush?: boolean; children?: ReactNode; style?: CSSProperties; dash?: boolean; className?: string;
}) {
  return (
    <DsPanel
      title={title}
      actions={actions ?? undefined}
      tone={accent === 'gold' ? 'accent' : 'default'}
      flush={flush}
      style={style}
      className={`${dash ? 'dash-panel ' : ''}${className}`.trim() || undefined}
    >
      {children}
    </DsPanel>
  );
}
