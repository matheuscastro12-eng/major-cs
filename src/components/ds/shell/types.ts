// Tipos do shell universal do Road to Major (GameShell).
// Um shell só pra todos os modos: trilho de modos + sidebar de seções +
// topbar com identidade e CONTINUAR + paleta de comandos + peek de jogador.
// A identidade de cada modo vem pela cor ([data-mode]) e pelo conteúdo.
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type ModeId = 'inicio' | 'carreira' | 'rtp' | 'ultimate' | 'diario' | 'major' | 'online';

/** valor de data-mode (tokens.css) de cada modo; Início usa o acento base (dourado) */
export const MODE_DATA: Record<ModeId, string | undefined> = {
  inicio: undefined,
  carreira: 'carreira',
  rtp: 'rtp',
  ultimate: 'ultimate',
  diario: 'diario',
  major: 'major',
  online: 'online',
};

export interface ShellMode {
  id: ModeId;
  label: string;
  /** rótulo curto do trilho (cabe em 64px) */
  short?: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** contador de pendência no trilho (ex.: recompensa do dia, jogo de hoje) */
  badge?: number | string;
  /** texto extra do tooltip/paleta (ex.: "Demo grátis") */
  hint?: string;
  locked?: boolean;
}

export interface ShellCommand {
  id: string;
  label: string;
  group?: string;
  icon?: LucideIcon;
  hint?: string;
  /** palavras extras pra busca (sinônimos, inglês) */
  keywords?: string;
  run: () => void;
}

export interface ShellUser {
  nick: string;
  sub?: string;
  paid?: boolean;
  founder?: boolean;
  onOpen?: () => void;
}

/** O que o App entrega pro shell de qualquer tela (trilho, usuário, comandos globais). */
export interface ShellGlobal {
  modes: ShellMode[];
  user?: ShellUser;
  commands: ShellCommand[];
  /** atalhos do menu "Você" no pé do trilho (ranking, perfil…) */
  railFoot?: ShellCommand[];
  /** "Avisos" no pé do trilho (novidades do jogo) */
  alerts?: { count: number; onClick: () => void };
}

export type BadgeTone = 'accent' | 'brand' | 'warn' | 'loss' | 'win' | 'muted';

export interface ShellNavItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number | string;
  badgeTone?: BadgeTone;
  /** ponto de alerta sem número */
  alert?: boolean;
  hint?: string;
  disabled?: boolean;
}

export interface ShellNavGroup {
  id: string;
  label: string;
  icon?: LucideIcon;
  items: ShellNavItem[];
}

export interface ShellIdentity {
  title: string;
  subtitle?: string;
  /** escudo/badge do clube, da carta ou do jogador */
  badge?: ReactNode;
  /** cores do clube: pintam a topbar e a faixa embaixo dela */
  colors?: [string, string];
}

export interface ShellPending {
  id: string;
  label: string;
  icon?: LucideIcon;
  tone?: 'warn' | 'info' | 'loss';
  /** bloqueia o avanço: o CONTINUAR leva até ela em vez de avançar */
  blocking?: boolean;
  onGo: () => void;
}

export interface ShellNext {
  /** verbo do botão (padrão "Continuar") */
  label?: string;
  /** o que vem a seguir: "Partida vs MOUZ", "Abrir pack", "Série do Dia" */
  detail?: string;
  icon?: LucideIcon;
  onGo?: () => void;
  disabled?: boolean;
  pending?: ShellPending[];
}

export interface ShellTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number | string;
  alert?: boolean;
}

export interface ShellCrumb {
  label: string;
  onGo?: () => void;
}

export interface ShellTool {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

/** resultado de busca da paleta de comandos (jogador, time, carta…) */
export interface PaletteItem {
  id: string;
  label: string;
  sub?: string;
  group: string;
  icon?: LucideIcon;
  /** ref de peek (data-peek) pra mostrar o cartão ao navegar na lista */
  peek?: string;
  run: () => void;
}
