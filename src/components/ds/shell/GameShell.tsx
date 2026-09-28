// GameShell — a interface universal do Road to Major ("nova interface").
//
// Um shell só pro jogo inteiro (Início, Carreira, Road to Pro, Ultimate,
// Draft, Diário, Online, perfil e ranking), com o Football Manager como
// referência de UX e a identidade marinho + dourado do Road to Major:
//   - sidebar marinha com o escudo "ROAD TO MAJOR", o seletor de MODO logo
//     abaixo, as seções do modo em grupos recolhíveis (estilo FM: título em
//     caixa-alta, ícone por item, badge de pendência, item ativo em pílula
//     dourada) e o widget "próximo jogo / próxima ação" no pé;
//   - topbar grafite com o escudo do clube, breadcrumbs, busca ⌘K, sino,
//     informações do modo e o CONTINUAR dourado (o que vem a seguir e o que
//     bloqueia o avanço), com a faixa dourada embaixo;
//   - subnav de abas da tela com ícone e sublinhado dourado;
//   - no celular: topo compacto, gaveta com o menu completo, tab bar e o
//     CONTINUAR fixo.
// A paleta de comandos e os atalhos moram aqui; o peek de jogador é global
// (PeekLayer, montado uma vez no App).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Bell, ChevronLeft, ChevronRight, ChevronsRight, ChevronDown, Ellipsis, Info, CircleAlert, Keyboard,
  LayoutGrid, Menu, Moon, Rows2, Rows3, Search, Sun, TriangleAlert, X,
} from 'lucide-react';
import { BrandMark } from '../../brand';
import { registerShortcut } from '../../../hooks/useKeyboardShortcuts';
import { useAppTheme } from '../../../state/career-theme';
import { LangSwitcher } from '../../social';
import { cx } from '../cx';
import { CommandPalette } from './CommandPalette';
import { useDensity, useShellGlobal, openPalette, usePaletteOpen } from './ShellContext';
import {
  MODE_DATA, type ModeId, type PaletteItem, type ShellCommand, type ShellCrumb, type ShellIdentity,
  type ShellNavGroup, type ShellNext, type ShellTab, type ShellTool,
} from './types';

export interface GameShellProps {
  mode: ModeId;
  identity: ShellIdentity;
  nav?: ShellNavGroup[];
  active?: string;
  onNav?: (id: string) => void;
  /** abas da tela (subnav) */
  tabs?: ShellTab[];
  activeTab?: string;
  onTab?: (id: string) => void;
  /** ids da tab bar do celular (até 4); padrão: 1º item de cada grupo */
  mobileNav?: string[];
  crumbs?: ShellCrumb[];
  /** nome da tela (último item do breadcrumb; padrão: rótulo do item ativo) */
  title?: string;
  meta?: ReactNode;
  /** sino da topbar (caixa de entrada, novidades) */
  bell?: { count?: number; label: string; onClick: () => void };
  next?: ShellNext;
  history?: { back?: () => void; forward?: () => void; canBack?: boolean };
  search?: (q: string) => PaletteItem[];
  searchPlaceholder?: string;
  commands?: ShellCommand[];
  tools?: ShellTool[];
  sideWidget?: ReactNode;
  /** full = sidebar + topbar; focus = sem sidebar (fluxos: criar, saves);
   *  immersive = só a topbar fina (partida ao vivo, veto, reveal) */
  variant?: 'full' | 'focus' | 'immersive';
  /** conteúdo sem padding (a tela cuida do próprio respiro) */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

export function GameShell(props: GameShellProps) {
  const {
    mode, identity, nav = [], active, onNav, tabs, activeTab, onTab, mobileNav, crumbs, title, meta, bell, next,
    history, search, searchPlaceholder, commands = [], tools = [], sideWidget, variant = 'full', flush = false,
    className, children,
  } = props;
  const global = useShellGlobal();
  const [theme, , toggleTheme] = useAppTheme();
  const [density, toggleDensity] = useDensity();
  const [paletteOpen, setPaletteOpen] = usePaletteOpen();
  const [moreOpen, setMoreOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);

  const items = useMemo(() => nav.flatMap((g) => g.items.map((it) => ({ ...it, group: g }))), [nav]);
  const activeItem = items.find((it) => it.id === active);
  const modeDef = global.modes.find((m) => m.id === mode);
  const screenTitle = title ?? activeItem?.label ?? identity.title;
  const trail: ShellCrumb[] = crumbs ?? (activeItem ? [{ label: activeItem.group.label }] : []);

  // ── atalhos: ⌘K / "/" abrem a paleta, espaço = continuar, Alt+←/→ histórico
  const nextRef = useRef(next);
  const histRef = useRef(history);
  useEffect(() => { nextRef.current = next; histRef.current = history; });
  useEffect(() => {
    const offs = [
      registerShortcut({ key: 'k', ctrl: true, group: 'Geral', label: 'Buscar jogador, time, tela ou ação', skipWhenTyping: false, onPress: (e) => { e.preventDefault(); openPalette(); } }),
      registerShortcut({ key: '/', group: 'Geral', label: 'Buscar', onPress: (e) => { e.preventDefault(); openPalette(); } }),
      registerShortcut({
        key: ' ', group: 'Geral', label: 'Continuar (a próxima ação)',
        onPress: (e) => {
          const n = nextRef.current;
          const el = document.activeElement as HTMLElement | null;
          const onControl = el && el !== document.body && el.closest('button, a, input, select, textarea, [role="button"], [role="tab"], [tabindex]');
          if (!n || n.disabled || !n.onGo || onControl || document.body.style.overflow === 'hidden') return;
          e.preventDefault();
          goNext(n, () => setPendingOpen(true));
        },
      }),
      registerShortcut({ key: 'arrowleft', alt: true, group: 'Geral', label: 'Voltar', onPress: () => histRef.current?.back?.() }),
      registerShortcut({ key: 'arrowright', alt: true, group: 'Geral', label: 'Avançar', onPress: () => histRef.current?.forward?.() }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // itens fixos da paleta: seções do modo, abas, outros modos, comandos
  const paletteBase = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];
    for (const it of items) {
      if (it.disabled || !onNav) continue;
      out.push({ id: `nav-${it.id}`, label: it.label, sub: it.group.label, group: 'Ir para', icon: it.icon, run: () => onNav(it.id) });
    }
    for (const t of tabs ?? []) {
      if (!onTab) continue;
      out.push({ id: `tab-${t.id}`, label: t.label, sub: screenTitle, group: 'Ir para', icon: t.icon, run: () => onTab(t.id) });
    }
    for (const m of global.modes) {
      if (m.id === mode) continue;
      out.push({ id: `mode-${m.id}`, label: m.label, sub: m.hint ?? 'Modo de jogo', group: 'Modos', icon: m.icon, run: m.onSelect });
    }
    for (const c of [...commands, ...global.commands]) {
      out.push({ id: `cmd-${c.id}`, label: c.label, sub: c.hint, group: c.group ?? 'Ações', icon: c.icon, run: c.run });
    }
    out.push({ id: 'cmd-density', label: density === 'compact' ? 'Densidade confortável' : 'Densidade compacta', group: 'Preferências', icon: density === 'compact' ? Rows2 : Rows3, run: toggleDensity });
    out.push({ id: 'cmd-theme', label: theme === 'dark' ? 'Tema claro' : 'Tema escuro', group: 'Preferências', icon: theme === 'dark' ? Sun : Moon, run: toggleTheme });
    return out;
  }, [items, tabs, onNav, onTab, global.modes, global.commands, commands, mode, screenTitle, density, toggleDensity, theme, toggleTheme]);

  const clubStyle = identity.colors
    ? ({ '--club-1': identity.colors[0], '--club-2': identity.colors[1] } as CSSProperties)
    : undefined;

  // tab bar do celular: ids pedidos, senão o 1º item de cada grupo
  const mobileItems = useMemo(() => {
    const ids = mobileNav ?? nav.map((g) => g.items[0]?.id).filter(Boolean);
    return ids.map((id) => items.find((it) => it.id === id)).filter(Boolean).slice(0, 4) as typeof items;
  }, [mobileNav, nav, items]);

  const go = (id: string) => { setMoreOpen(false); onNav?.(id); };

  return (
    <div
      className={cx('gs', `gs--${variant}`, flush && 'gs--flush', !!next?.onGo && 'gs--has-next', className)}
      data-mode={MODE_DATA[mode]}
      style={clubStyle}
    >
      {variant === 'full' && (
        <ModeRail mode={mode} density={density} theme={theme} onDensity={toggleDensity} onTheme={toggleTheme} />
      )}
      {variant === 'full' && (
        <aside className="gs-side" aria-label={modeDef?.label ?? 'Seções'}>
          <Brand />
          {modeDef && (
            <div className="gs-modehead">
              <span className="gs-modehead__ic"><modeDef.icon size={18} aria-hidden /></span>
              <span className="gs-modehead__txt">
                <b>{modeDef.label}</b>
                {identity.subtitle && <small>{identity.subtitle}</small>}
              </span>
            </div>
          )}
          <nav className="gs-side__nav" aria-label={`Seções · ${modeDef?.label ?? ''}`}>
            {nav.map((g) => (
              <NavGroup key={g.id} mode={mode} group={g} active={active} onNav={onNav} />
            ))}
          </nav>
          {sideWidget && <div className="gs-side__widget">{sideWidget}</div>}
        </aside>
      )}

      <div className="gs-main">
        <header className="gs-top">
          {variant === 'full' ? (
            <button type="button" className="gs-iconbtn gs-top__menu" onClick={() => setMoreOpen(true)} aria-label="Abrir menu">
              <Menu size={20} aria-hidden />
            </button>
          ) : variant === 'immersive' ? null : (
            <button type="button" className="gs-iconbtn gs-top__home" onClick={() => global.modes.find((m) => m.id === 'inicio')?.onSelect()} aria-label="Road to Major · Início">
              <BrandMark size={30} />
            </button>
          )}
          {history && variant !== 'immersive' && (
            <span className="gs-top__hist">
              <button type="button" className="gs-iconbtn" onClick={history.back} disabled={!history.back || history.canBack === false} aria-label="Voltar">
                <ChevronLeft size={18} aria-hidden />
              </button>
              <button type="button" className="gs-iconbtn" onClick={history.forward} disabled={!history.forward} aria-label="Avançar">
                <ChevronRight size={18} aria-hidden />
              </button>
            </span>
          )}
          <span className="gs-crest">
            {identity.badge ?? <span className="gs-crest__txt" aria-hidden>{initials(identity.title)}</span>}
          </span>
          <div className="gs-top__titles">
            <span className="gs-top__club">{identity.title}</span>
            <nav className="gs-crumbs" aria-label="Você está em">
              {modeDef && <span className="gs-crumbs__mode">{modeDef.label}</span>}
              {trail.map((c, i) => (
                <span key={i} className="gs-crumbs__item">
                  <ChevronRight size={11} aria-hidden />
                  {c.onGo ? <button type="button" onClick={c.onGo}>{c.label}</button> : <span>{c.label}</span>}
                </span>
              ))}
              {(!trail.length || trail[trail.length - 1].label !== screenTitle) && screenTitle !== identity.title && (
                <span className="gs-crumbs__item gs-crumbs__here" aria-current="page">
                  <ChevronRight size={11} aria-hidden />
                  <span>{screenTitle}</span>
                </span>
              )}
            </nav>
          </div>
          <span className="gs-top__spacer" />
          <button type="button" className="gs-searchpill" onClick={() => setPaletteOpen(true)} aria-label="Buscar (Ctrl+K)">
            <Search size={15} aria-hidden />
            <span className="gs-searchpill__text">{searchPlaceholder ?? 'Buscar…'}</span>
            <kbd>⌘K</kbd>
          </button>
          {bell && (
            <button type="button" className="gs-bell" onClick={bell.onClick} aria-label={bell.count ? `${bell.label} · ${bell.count} nova(s)` : bell.label}>
              <Bell size={20} aria-hidden />
              {!!bell.count && <span className="gs-bell__dot" aria-hidden />}
            </button>
          )}
          {meta && <div className="gs-top__meta">{meta}</div>}
          {tools.length > 0 && (
            <div className="gs-tools">
              <button type="button" className="gs-iconbtn" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={toolsOpen} onClick={() => setToolsOpen((v) => !v)}>
                <Ellipsis size={18} aria-hidden />
              </button>
              {toolsOpen && (
                <Popover onClose={() => setToolsOpen(false)} className="gs-menu">
                  {tools.map((t) => (
                    <button key={t.id} type="button" role="menuitem" className="gs-menu__item" onClick={() => { setToolsOpen(false); t.onClick(); }}>
                      <t.icon size={16} aria-hidden /> {t.label}
                    </button>
                  ))}
                </Popover>
              )}
            </div>
          )}
          {next && <NextButton next={next} pendingOpen={pendingOpen} setPendingOpen={setPendingOpen} />}
        </header>

        {tabs && tabs.length > 0 && (
          <div className="gs-sub" role="tablist" aria-label={screenTitle}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === activeTab}
                className="gs-tab"
                onClick={() => onTab?.(t.id)}
              >
                {t.icon && <t.icon size={15} aria-hidden />}
                {t.label}
                {t.badge != null && t.badge !== 0 ? <span className="gs-badge">{t.badge}</span> : t.alert ? <span className="gs-dot" aria-hidden /> : null}
              </button>
            ))}
          </div>
        )}

        <main className="gs-content" id="gs-content">
          {children}
        </main>
      </div>

      {/* ── celular: tab bar + CONTINUAR fixo ── */}
      {variant === 'full' && mobileItems.length > 0 && (
        <nav className="gs-tabbar" aria-label="Seções">
          {mobileItems.map((it) => {
            const Icon = it.icon ?? LayoutGrid;
            return (
              <button key={it.id} type="button" className="gs-tabbar__item" aria-current={it.id === active ? 'page' : undefined} onClick={() => onNav?.(it.id)}>
                <span className="gs-tabbar__icon"><Icon size={20} aria-hidden />{(it.badge || it.alert) ? <span className="gs-dot" aria-hidden /> : null}</span>
                <span className="gs-tabbar__label">{it.label}</span>
              </button>
            );
          })}
          <button type="button" className="gs-tabbar__item" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
            <span className="gs-tabbar__icon"><Menu size={20} aria-hidden /></span>
            <span className="gs-tabbar__label">Menu</span>
          </button>
        </nav>
      )}
      {next?.onGo && variant !== 'immersive' && (
        <div className="gs-mnext">
          <NextButton next={next} pendingOpen={pendingOpen} setPendingOpen={setPendingOpen} compact />
        </div>
      )}

      {moreOpen && (
        <MoreSheet
          onClose={() => setMoreOpen(false)}
          mode={mode}
          nav={nav}
          active={active}
          onGo={go}
          tools={tools}
          sideWidget={sideWidget}
          onDensity={toggleDensity}
          onTheme={toggleTheme}
          density={density}
          theme={theme}
        />
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} base={paletteBase} search={search} placeholder={searchPlaceholder} />
    </div>
  );
}

function initials(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N} ]/gu, '').trim();
  if (!clean) return 'RTM';
  const parts = clean.split(/\s+/);
  return (parts.length > 1 ? parts.map((p) => p[0]).join('') : clean.slice(0, 3)).slice(0, 3).toUpperCase();
}

function Brand({ mark = false }: { mark?: boolean }) {
  const home = useShellGlobal().modes.find((m) => m.id === 'inicio');
  return (
    <button type="button" className="gs-brand" onClick={home?.onSelect} aria-label="Road to Major · Início">
      {mark && <BrandMark size={32} />}
      <b>ROAD TO <span>MAJOR</span></b>
    </button>
  );
}

// ── trilho de modos (74px): escudo, modos, avisos e ajustes ─────────────────
function ModeRail({ mode, density, theme, onDensity, onTheme }: { mode: ModeId; density: string; theme: string; onDensity: () => void; onTheme: () => void }) {
  const g = useShellGlobal();
  const home = g.modes.find((m) => m.id === 'inicio');
  const [prefsOpen, setPrefsOpen] = useState(false);
  return (
    <nav className="gs-rail" aria-label="Modos de jogo">
      <button type="button" className="gs-rail__logo" onClick={home?.onSelect} aria-label="Road to Major · Início" aria-current={mode === 'inicio' ? 'true' : undefined}>
        <BrandMark size={38} />
      </button>
      {g.modes.filter((m) => m.id !== 'inicio').map((m) => (
        <button
          key={m.id}
          type="button"
          className="gs-mode"
          data-mode={MODE_DATA[m.id]}
          aria-current={m.id === mode ? 'true' : undefined}
          aria-label={m.hint ? `${m.label} · ${m.hint}` : m.label}
          onClick={m.onSelect}
        >
          <span className="gs-mode__ic">
            <m.icon size={20} aria-hidden />
            {m.badge != null && m.badge !== 0 && <span className="gs-mode__badge" aria-hidden>{m.badge}</span>}
          </span>
          <span className="gs-mode__label">{m.short ?? m.label}</span>
          {m.hint && <span className="gs-tip gs-tip--side" role="presentation">{m.label}<small>{m.hint}</small></span>}
        </button>
      ))}
      <span className="gs-rail__spacer" />
      {g.alerts && (
        <button type="button" className="gs-mode" onClick={g.alerts.onClick} aria-label={g.alerts.count ? `Avisos · ${g.alerts.count} novo(s)` : 'Avisos'}>
          <span className="gs-mode__ic"><Bell size={19} aria-hidden />{!!g.alerts.count && <span className="gs-mode__dot" aria-hidden />}</span>
          <span className="gs-mode__label">Avisos</span>
        </button>
      )}
      <div className="gs-rail__prefs">
        <button type="button" className="gs-mode" aria-label="Conta, preferências e atalhos" aria-haspopup="menu" aria-expanded={prefsOpen} onClick={() => setPrefsOpen((v) => !v)}>
          <span className="gs-mode__ic gs-mode__avatar" aria-hidden>{(g.user?.nick ?? 'R').slice(0, 1).toUpperCase()}</span>
          <span className="gs-mode__label">Você</span>
        </button>
        {prefsOpen && (
          <Popover onClose={() => setPrefsOpen(false)} className="gs-menu gs-menu--rail">
            {g.user && (
              <button type="button" role="menuitem" className="gs-menu__user" onClick={() => { setPrefsOpen(false); g.user?.onOpen?.(); }}>
                <span className="gs-user__avatar" aria-hidden>{g.user.nick.slice(0, 1).toUpperCase()}</span>
                <span className="gs-user__txt">
                  <b>{g.user.nick}{g.user.founder ? <span className="gs-user__tag">Fundador</span> : g.user.paid ? <span className="gs-user__tag">Vitalícia</span> : null}</b>
                  {g.user.sub && <small>{g.user.sub}</small>}
                </span>
              </button>
            )}
            {(g.railFoot ?? []).map((c) => (
              <button key={c.id} type="button" role="menuitem" className="gs-menu__item" onClick={() => { setPrefsOpen(false); c.run(); }}>
                {c.icon && <c.icon size={16} aria-hidden />} {c.label}
              </button>
            ))}
            <div className="gs-menu__sep" role="separator" />
            <button type="button" role="menuitem" className="gs-menu__item" onClick={onDensity}>
              {density === 'compact' ? <Rows2 size={16} aria-hidden /> : <Rows3 size={16} aria-hidden />}
              {density === 'compact' ? 'Densidade: compacta' : 'Densidade: confortável'}
            </button>
            <button type="button" role="menuitem" className="gs-menu__item" onClick={onTheme}>
              {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
              {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            </button>
            <button type="button" role="menuitem" className="gs-menu__item" onClick={() => { setPrefsOpen(false); document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true })); }}>
              <Keyboard size={16} aria-hidden /> Atalhos de teclado
            </button>
            <div className="gs-menu__lang"><LangSwitcher compact /></div>
          </Popover>
        )}
      </div>
    </nav>
  );
}

// ── grupo da sidebar (recolhível, lembra o estado por modo) ─────────────────
const COLLAPSE_KEY = 'rtm-nav-collapsed-v1';
function readCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}') as Record<string, boolean>; } catch { return {}; }
}
function NavGroup({ mode, group: g, active, onNav, big = false }: { mode: ModeId; group: ShellNavGroup; active?: string; onNav?: (id: string) => void; big?: boolean }) {
  const key = `${mode}:${g.id}`;
  const [collapsed, setCollapsed] = useState(() => !!readCollapsed()[key]);
  const hasActive = g.items.some((it) => it.id === active);
  const open = !collapsed || hasActive;
  const pendingCount = g.items.reduce((n, it) => n + (typeof it.badge === 'number' ? it.badge : it.badge ? 1 : it.alert ? 1 : 0), 0);
  const toggle = () => {
    const nextVal = !collapsed;
    setCollapsed(nextVal);
    try { const all = readCollapsed(); all[key] = nextVal; localStorage.setItem(COLLAPSE_KEY, JSON.stringify(all)); } catch { /* sem storage */ }
  };
  const listId = `gs-grp-${mode}-${g.id}${big ? '-m' : ''}`;
  return (
    <div className="gs-navgroup">
      <button type="button" className="gs-navgroup__label" aria-expanded={open} aria-controls={listId} onClick={toggle}>
        <span>{g.label}</span>
        {!open && pendingCount > 0 && <span className="gs-navgroup__count">{pendingCount}</span>}
        <ChevronDown size={12} aria-hidden className="gs-navgroup__chev" />
      </button>
      <div className="gs-navgroup__items" id={listId} hidden={!open}>
        {g.items.map((it) => {
          const on = it.id === active;
          const Icon = it.icon ?? LayoutGrid;
          return (
            <button
              key={it.id}
              type="button"
              className="gs-navitem"
              aria-current={on ? 'page' : undefined}
              disabled={it.disabled}
              onClick={() => onNav?.(it.id)}
              title={it.hint}
            >
              <Icon size={17} aria-hidden className="gs-navitem__icon" />
              <span className="gs-navitem__label">{it.label}</span>
              {it.badge != null && it.badge !== 0 && it.badge !== '' ? (
                <span className="gs-badge" data-tone={it.badgeTone ?? 'brand'}>{it.badge}</span>
              ) : it.alert ? <span className="gs-dot" aria-label="pendência" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── CONTINUAR inteligente ────────────────────────────────────────────────────
function goNext(n: ShellNext, openPending: () => void) {
  const blocking = (n.pending ?? []).filter((p) => p.blocking);
  if (blocking.length > 0) { openPending(); return; }
  n.onGo?.();
}

function NextButton({ next, pendingOpen, setPendingOpen, compact = false }: {
  next: ShellNext;
  pendingOpen: boolean;
  setPendingOpen: (v: boolean) => void;
  compact?: boolean;
}) {
  const pending = next.pending ?? [];
  const blocking = pending.filter((p) => p.blocking);
  const Icon = next.icon ?? ChevronsRight;
  const disabled = next.disabled || (!next.onGo && blocking.length === 0);
  return (
    <div className={cx('gs-next', compact && 'gs-next--compact', blocking.length > 0 && 'gs-next--blocked')}>
      <button
        type="button"
        className="gs-next__go"
        disabled={disabled}
        onClick={() => goNext(next, () => setPendingOpen(!pendingOpen))}
      >
        <span className="gs-next__text">
          <span className="gs-next__verb">{next.label ?? 'Continuar'}</span>
          {next.detail && (
            <span className="gs-next__detail">
              {blocking.length > 0 ? `${blocking.length} ${blocking.length === 1 ? 'pendência antes' : 'pendências antes'}` : next.detail}
            </span>
          )}
        </span>
        <Icon size={18} aria-hidden className="gs-next__icon" />
      </button>
      {pending.length > 0 && (
        <button
          type="button"
          className="gs-next__pend"
          aria-label={`${pending.length} pendência(s)`}
          aria-haspopup="menu"
          aria-expanded={pendingOpen}
          onClick={() => setPendingOpen(!pendingOpen)}
        >
          {pending.length}
          <ChevronDown size={12} aria-hidden />
        </button>
      )}
      {pendingOpen && pending.length > 0 && (
        <Popover onClose={() => setPendingOpen(false)} className="gs-pending">
          <p className="gs-pending__head">
            {blocking.length > 0 ? 'Resolva antes de avançar' : 'Antes de continuar, dê uma olhada'}
          </p>
          {pending.map((p) => {
            const PIcon = p.icon ?? (p.tone === 'loss' ? CircleAlert : p.tone === 'warn' ? TriangleAlert : Info);
            return (
              <button key={p.id} type="button" role="menuitem" className="gs-pending__item" data-tone={p.tone ?? 'info'} onClick={() => { setPendingOpen(false); p.onGo(); }}>
                <PIcon size={16} aria-hidden />
                <span>{p.label}</span>
                {p.blocking && <span className="gs-pending__lock">bloqueia</span>}
                <ChevronRight size={14} aria-hidden />
              </button>
            );
          })}
          {blocking.length === 0 && next.onGo && (
            <button type="button" className="gs-pending__go" onClick={() => { setPendingOpen(false); next.onGo?.(); }}>
              {next.label ?? 'Continuar'} {next.detail ? `· ${next.detail}` : ''} <ChevronsRight size={14} aria-hidden />
            </button>
          )}
        </Popover>
      )}
    </div>
  );
}

// ── popover simples (fecha em clique fora e Esc) ────────────────────────────
function Popover({ onClose, className, children }: { onClose: () => void; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const parent = ref.current?.parentElement;
      if (parent && e.target instanceof Node && !parent.contains(e.target)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);
  return <div ref={ref} className={cx('gs-pop', className)} role="menu">{children}</div>;
}

// ── menu completo (gaveta no celular) ───────────────────────────────────────
function MoreSheet({ onClose, mode, nav, active, onGo, tools, sideWidget, onDensity, onTheme, density, theme }: {
  onClose: () => void; mode: ModeId; nav: ShellNavGroup[]; active?: string; onGo: (id: string) => void;
  tools: ShellTool[]; sideWidget?: ReactNode; onDensity: () => void; onTheme: () => void; density: string; theme: string;
}) {
  const g = useShellGlobal();
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="gs-more-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gs-more" role="dialog" aria-modal="true" aria-label="Menu">
        <header className="gs-more__head">
          <Brand mark />
          <button type="button" className="gs-iconbtn" onClick={onClose} aria-label="Fechar menu"><X size={20} aria-hidden /></button>
        </header>
        <div className="gs-more__modes" role="group" aria-label="Modos de jogo">
          {g.modes.map((m) => (
            <button key={m.id} type="button" className="gs-more__mode" data-mode={MODE_DATA[m.id]} aria-current={m.id === mode ? 'true' : undefined} onClick={() => { onClose(); m.onSelect(); }}>
              <m.icon size={20} aria-hidden />
              <span>{m.short ?? m.label}</span>
              {m.badge != null && m.badge !== 0 && <span className="gs-modes__badge">{m.badge}</span>}
            </button>
          ))}
        </div>
        <nav className="gs-more__nav">
          {nav.map((grp) => (
            <NavGroup key={grp.id} mode={mode} group={grp} active={active} onNav={onGo} big />
          ))}
          {tools.length > 0 && (
            <div className="gs-navgroup">
              <div className="gs-navgroup__label"><span>Ferramentas</span></div>
              {tools.map((t) => (
                <button key={t.id} type="button" className="gs-navitem" onClick={() => { onClose(); t.onClick(); }}>
                  <t.icon size={18} aria-hidden className="gs-navitem__icon" />
                  <span className="gs-navitem__label">{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
        {sideWidget && <div className="gs-side__widget">{sideWidget}</div>}
        <footer className="gs-more__foot">
          {(g.railFoot ?? []).map((c) => (
            <button key={c.id} type="button" className="gs-chipbtn" onClick={() => { onClose(); c.run(); }}>
              {c.icon && <c.icon size={16} aria-hidden />} {c.label}
            </button>
          ))}
          <button type="button" className="gs-chipbtn" onClick={onDensity}>
            {density === 'compact' ? <Rows2 size={16} aria-hidden /> : <Rows3 size={16} aria-hidden />} {density === 'compact' ? 'Compacto' : 'Confortável'}
          </button>
          <button type="button" className="gs-chipbtn" onClick={onTheme}>
            {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />} {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </button>
          <LangSwitcher compact />
        </footer>
      </div>
    </div>
  );
}
