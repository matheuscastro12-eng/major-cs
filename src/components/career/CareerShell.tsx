import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LangSwitcher } from '../social';
import { TeamBadge } from '../ui';
import { ct } from '../../state/career-i18n';
import { careerDashClass, useCareerTheme } from '../../state/career-theme';
import {
  IconChevronDown, IconChevronLeft, IconChevronRight, IconChevronsRight,
  IconEdit, IconHelp, IconMoon, IconSearch, IconSun,
} from './DashIcons';

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
    const onPointer = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.em-nav-item.open')) setOpenMenu(null);
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
