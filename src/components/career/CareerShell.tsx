import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LangSwitcher } from '../social';
import { TeamBadge } from '../ui';
import { ct } from '../../state/career-i18n';
import { careerDashClass, useCareerTheme } from '../../state/career-theme';
import {
  IconChevronDown, IconChevronLeft, IconChevronRight, IconChevronsRight,
  IconEdit, IconHelp, IconMoon, IconSearch, IconSun,
} from './DashIcons';
import { CareerIcon } from './CareerIcon';
import { StreakBadge } from '../StreakBadge';

export type DashNavGroup = { id: string; label: string; tabs: string[] };

const MAIN_NAV_IDS = ['dashboard', 'team', 'ingame', 'transfers', 'news', 'stats'] as const;

export function CareerShell({
  groups,
  activeGroupId,
  activeTab,
  tabLabel,
  tabAlert,
  onGroupChange,
  onTabChange,
  orgTag,
  orgColors,
  orgLogo,
  onExit,
  onReset,
  onContinue,
  dateLabel,
  showOnboarding,
  onSearch,
  onBeforeNav,
  onHistoryBack,
  onHistoryForward,
  canGoBack = false,
  budgetLabel,
  unreadCount = 0,
  onOpenInbox,
  onHowToPlay,
  onOpenMeta,
  onOpenInfrastructure,
  onOpenLockerRoom,
  onOpenLogoBuilder,
  formStreak,
  children,
}: {
  groups: DashNavGroup[];
  activeGroupId: string;
  activeTab: string;
  tabLabel: (id: string) => string;
  tabAlert: (id: string) => boolean;
  onGroupChange: (_groupId: string, firstTab: string) => void;
  onTabChange: (id: string) => void;
  orgTag: string;
  orgColors: [string, string];
  orgLogo?: string;
  onExit: () => void;
  onReset: () => void;
  onContinue?: () => void;
  dateLabel: string;
  showOnboarding?: () => void;
  onSearch?: () => void;
  onBeforeNav?: () => void;
  onHistoryBack?: () => void;
  onHistoryForward?: () => void;
  canGoBack?: boolean;
  /** T2.1: rótulo do saldo (já formatado, ex.: '$1.2M'). Não exibe se ausente. */
  budgetLabel?: string;
  /** T2.1: contador de manchetes não lidas. >0 mostra badge no bell. */
  unreadCount?: number;
  /** T2.1: handler do bell. Tipicamente onTabChange('inbox'). */
  onOpenInbox?: () => void;
  /** T8.1: abre o tutorial HowToPlay. Distinto do `showOnboarding` (que abre
   *  o tour first-time). HowToPlay é referência consultável. */
  onHowToPlay?: () => void;
  /** T9.2: abre MetaPage (snapshot agregado da temporada) */
  onOpenMeta?: () => void;
  /** T10.1: abre InfrastructurePage (investimentos em facilities) */
  onOpenInfrastructure?: () => void;
  /** T10.2: abre LockerRoomPage (snapshot pre-match). Só ofereça se há
   *  próxima partida agendada — o caller decide. */
  onOpenLockerRoom?: () => void;
  /** T7.2: abre LogoBuilder pra editar a logo da org após fundação */
  onOpenLogoBuilder?: () => void;
  /** T7.3: histórico W/L ordenado (mais antigo primeiro) pra StreakBadge.
   *  Vazio = não mostra. */
  formStreak?: ('W' | 'L')[];
  children: ReactNode;
}) {
  const [theme, , toggleTheme] = useCareerTheme();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openDropdown = useCallback((id: string) => {
    clearCloseTimer();
    setOpenMenu(id);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpenMenu(null), 160);
  }, [clearCloseTimer]);

  const pickTab = useCallback((groupId: string, tabId: string) => {
    setOpenMenu(null);
    clearCloseTimer();
    onBeforeNav?.();
    if (activeTab === tabId && activeGroupId === groupId) return;
    onGroupChange(groupId, tabId);
    onTabChange(tabId);
  }, [activeTab, activeGroupId, onGroupChange, onTabChange, onBeforeNav, clearCloseTimer]);

  useEffect(() => {
    if (!openMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    // BUG MOBILE: antes verificava `.em-nav-item.open` — mas em touch o mesmo
    // tap que ABRE o menu dispara este listener ANTES do React aplicar a classe
    // `.open`, fechando o menu na hora. Agora verifica só `.em-nav-item` (sem
    // .open): se clicou DENTRO de qualquer nav-item, não fecha (o próprio
    // handler do botão decide trocar de item ou alternar dropdown). Só fecha
    // se clicou de fato FORA do nav.
    const onPointer = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.em-nav-item')) setOpenMenu(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [openMenu]);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];
  const orderedGroups = MAIN_NAV_IDS
    .map((id) => groups.find((g) => g.id === id))
    .filter(Boolean) as DashNavGroup[];

  return (
    <div className={careerDashClass(theme)}>
      <header className="em-header">
        <div className="em-header-row">
          <div className="em-header-left">
            <div className="em-nav-pill">
              <button
                type="button"
                className="em-nav-arrow"
                onClick={onHistoryBack}
                disabled={!canGoBack}
                title={ct('Voltar')}
              >
                <IconChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="em-nav-arrow"
                onClick={onHistoryForward}
                title={ct('Avançar')}
              >
                <IconChevronRight size={15} />
              </button>
            </div>
            <button type="button" className="em-org-logo" onClick={onExit} title={ct('Voltar ao menu')}>
              <TeamBadge tag={orgTag} colors={orgColors} size={36} logoUrl={orgLogo} />
            </button>
          </div>

          <nav className="em-main-nav" aria-label={ct('Navegação principal')}>
            {orderedGroups.map((g) => {
              const hasMenu = g.tabs.length > 1;
              const isOpen = openMenu === g.id;
              return (
                <div
                  key={g.id}
                  className={`em-nav-item${activeGroupId === g.id ? ' active' : ''}${isOpen ? ' open' : ''}`}
                  onPointerEnter={(e) => { if (hasMenu && e.pointerType === 'mouse') openDropdown(g.id); }}
                  onPointerLeave={(e) => { if (hasMenu && e.pointerType === 'mouse') scheduleClose(); }}
                >
                  <button
                    type="button"
                    className={`em-main-tab${activeGroupId === g.id ? ' on' : ''}${g.tabs.some(tabAlert) ? ' alert' : ''}`}
                    aria-expanded={hasMenu ? isOpen : undefined}
                    aria-haspopup={hasMenu ? 'menu' : undefined}
                    onClick={() => {
                      if (hasMenu) {
                        // (any-hover: hover) é false em dispositivos puramente touch
                        // — mais confiável do que (hover: none) no Android/Chrome
                        const hasPointerHover = window.matchMedia('(any-hover: hover)').matches;
                        if (!hasPointerHover || isOpen) {
                          setOpenMenu(isOpen ? null : g.id);
                        } else {
                          pickTab(g.id, g.tabs[0]);
                        }
                      } else {
                        pickTab(g.id, g.tabs[0]);
                      }
                    }}
                  >
                    {g.label}
                    {hasMenu && <IconChevronDown size={11} className="em-main-tab-chevron" />}
                  </button>
                  {hasMenu && isOpen && (
                    <div className="em-nav-dropdown" role="menu">
                      {g.tabs.map((id) => (
                        <button
                          key={id}
                          type="button"
                          role="menuitem"
                          className={`em-nav-drop-item${activeTab === id ? ' on' : ''}${tabAlert(id) ? ' alert' : ''}`}
                          onClick={() => pickTab(g.id, id)}
                        >
                          {tabLabel(id)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="em-header-right">
            <div className="em-tool-group">
              <button type="button" className="em-tool-btn em-tool-search" onClick={() => { onBeforeNav?.(); onSearch?.(); }} title={ct('Buscar')}>
                <IconSearch size={17} />
              </button>
              <button type="button" className="em-tool-btn em-tool-reset" onClick={onReset} title={ct('Recomeçar carreira')}>
                <IconEdit size={17} />
              </button>
              {showOnboarding && (
                <button type="button" className="em-tool-btn em-tool-help" onClick={showOnboarding} title={ct('Tutorial')}>
                  <IconHelp size={17} />
                </button>
              )}
              {/* T8.1/T9.2/T10.1/T10.2: ferramentas extras agrupadas num único
                  menu dropdown pra não lotar a header. O botão "⋯ Ferramentas"
                  só aparece se pelo menos um handler foi passado. */}
              <ToolsMenu
                onHowToPlay={onHowToPlay}
                onOpenMeta={onOpenMeta}
                onOpenInfrastructure={onOpenInfrastructure}
                onOpenLockerRoom={onOpenLockerRoom}
                onOpenLogoBuilder={onOpenLogoBuilder}
              />
              <button
                type="button"
                className="em-tool-btn em-tool-theme"
                onClick={toggleTheme}
                title={theme === 'dark' ? ct('Modo claro') : ct('Modo escuro')}
                aria-label={theme === 'dark' ? ct('Modo claro') : ct('Modo escuro')}
              >
                {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
              </button>
            </div>
            {/* T2.1: bell de notificações (lê unread do save). Clica = abre inbox. */}
            {onOpenInbox && (
              <button
                type="button"
                className="em-tool-btn"
                onClick={onOpenInbox}
                title={unreadCount > 0 ? `${unreadCount} ${ct('manchete(s) não lida(s)')}` : ct('Caixa de entrada')}
                style={{ position: 'relative' }}
              >
                <CareerIcon name="news" size={17} />
                {unreadCount > 0 && (
                  <span
                    aria-label={`${unreadCount} ${ct('não lida(s)')}`}
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      minWidth: 14,
                      height: 14,
                      padding: '0 4px',
                      borderRadius: 7,
                      background: 'var(--em-gold)',
                      color: '#1a1205',
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      lineHeight: '14px',
                      textAlign: 'center',
                      boxShadow: '0 0 0 2px var(--em-panel)',
                    }}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            )}
            {/* T7.3: streak de vitórias/derrotas — chip de fogo/gelo */}
            {formStreak && formStreak.length > 0 && (
              <StreakBadge results={formStreak} size="sm" />
            )}
            {/* T2.1: saldo da org (estilo HUD broadcast) */}
            {budgetLabel && (
              <span
                className="em-budget"
                title={ct('Saldo em caixa')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 10px',
                  background: 'var(--em-panel-2)',
                  border: '1px solid var(--em-border)',
                  borderRadius: 3,
                  color: 'var(--em-text)',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                <CareerIcon name="coin" size={11} />
                {budgetLabel}
              </span>
            )}
            <span className="em-lang-wrap"><LangSwitcher compact /></span>
            <span className="em-date">{dateLabel}</span>
            <button
              type="button"
              className="em-continue-btn"
              disabled={!onContinue}
              onClick={onContinue}
            >
              <span className="em-continue-text">{ct('Continuar')}</span>
              <IconChevronsRight size={16} />
            </button>
          </div>
        </div>

        {activeGroup.tabs.length > 1 && (
          <div className="em-subnav-row">
            <div className="em-subnav-spacer" aria-hidden />
            <div className="em-subnav">
              {activeGroup.tabs.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`em-subtab${activeTab === id ? ' on' : ''}${tabAlert(id) ? ' alert' : ''}`}
                  onClick={() => {
                    onBeforeNav?.();
                    onTabChange(id);
                  }}
                >
                  {tabLabel(id)}
                </button>
              ))}
            </div>
            <div className="em-subnav-spacer" aria-hidden />
          </div>
        )}
      </header>

      <div className="em-body tab-fade" key={activeTab}>
        {children}
      </div>
    </div>
  );
}

// Menu dropdown que agrupa Howto / Meta / Infra / Vestiário (T8.1 + T9.2 + T10.1 + T10.2).
// Antes eram 4 botões soltos na em-tool-group — lotavam a header e empurravam
// o "Continuar" pra fora. Agora viram itens de um único ⋯ Ferramentas.
function ToolsMenu({
  onHowToPlay,
  onOpenMeta,
  onOpenInfrastructure,
  onOpenLockerRoom,
  onOpenLogoBuilder,
}: {
  onHowToPlay?: () => void;
  onOpenMeta?: () => void;
  onOpenInfrastructure?: () => void;
  onOpenLockerRoom?: () => void;
  onOpenLogoBuilder?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  type Item = { label: string; icon: 'document' | 'chart' | 'dumbbell' | 'target' | 'star'; handler: () => void };
  const items: Item[] = [];
  if (onHowToPlay) items.push({ label: ct('Como jogar'), icon: 'document', handler: onHowToPlay });
  if (onOpenMeta) items.push({ label: ct('Meta da temporada'), icon: 'chart', handler: onOpenMeta });
  if (onOpenInfrastructure) items.push({ label: ct('Infraestrutura'), icon: 'dumbbell', handler: onOpenInfrastructure });
  if (onOpenLockerRoom) items.push({ label: ct('Vestiário'), icon: 'target', handler: onOpenLockerRoom });
  if (onOpenLogoBuilder) items.push({ label: ct('Editar logo'), icon: 'star', handler: onOpenLogoBuilder });

  if (items.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="em-tool-btn"
        onClick={() => setOpen((v) => !v)}
        title={ct('Ferramentas')}
        aria-label={ct('Ferramentas')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {/* Três pontos verticais — sinônimo universal de "mais opções" */}
        <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="1.2" fill="currentColor" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          <circle cx="12" cy="19" r="1.2" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 200,
            padding: 4,
            background: 'var(--em-panel)',
            border: '1px solid var(--em-border)',
            borderRadius: 6,
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            zIndex: 200,
          }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); it.handler(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 10px',
                background: 'transparent',
                color: 'var(--em-text)',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.84rem',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--em-panel-2)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <CareerIcon name={it.icon} size={15} />
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CareerDashFrame({ title, onExit, children }: { title?: string; onExit: () => void; children: ReactNode }) {
  const [theme, , toggleTheme] = useCareerTheme();
  return (
    <div className={careerDashClass(theme)}>
      <header className="em-header em-header-min">
        <div className="em-header-row">
          <div className="em-header-left">
            <div className="em-nav-pill">
              <button type="button" className="em-nav-arrow" onClick={onExit}>
                <IconChevronLeft size={15} />
              </button>
            </div>
            <span className="em-brand">ROAD TO MAJOR</span>
          </div>
          {title && <span className="em-frame-title">{title}</span>}
          <div className="em-header-right">
            <button
              type="button"
              className="em-tool-btn em-frame-theme"
              onClick={toggleTheme}
              title={theme === 'dark' ? ct('Modo claro') : ct('Modo escuro')}
              aria-label={theme === 'dark' ? ct('Modo claro') : ct('Modo escuro')}
            >
              {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
            </button>
            <LangSwitcher compact />
          </div>
        </div>
      </header>
      <div className="em-body">{children}</div>
    </div>
  );
}
