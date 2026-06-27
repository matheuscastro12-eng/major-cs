// Overlay com a lista de atalhos de teclado registrados — T2.3 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Estrutura:
//   - Monta uma vez no app (KeyboardHelpHost, igual ao ConfirmDialogHost)
//   - Registra o atalho `?` pra abrir o próprio overlay
//   - Instala useKeyboardShortcuts() pra que o listener global rode
//   - Lista os atalhos agrupados por `group`
//
// Atalho de teclado padrão: aperte `?` (Shift+/) em qualquer lugar fora de
// inputs pra abrir o overlay. ESC fecha (já é tratado pelo Modal).
import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ds';
import {
  registerShortcut,
  useKeyboardShortcuts,
  useShortcutsSnapshot,
} from '../hooks/useKeyboardShortcuts';

// Formato visual da combinação: ⌘+K, Ctrl+S, ?, Esc, etc.
function formatCombo(s: {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}): string {
  const parts: string[] = [];
  if (s.ctrl) parts.push(navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl');
  if (s.alt) parts.push(navigator.platform.toLowerCase().includes('mac') ? '⌥' : 'Alt');
  if (s.shift) parts.push('⇧');
  const k = s.key.length === 1 ? s.key.toUpperCase() : s.key.charAt(0).toUpperCase() + s.key.slice(1);
  parts.push(k);
  return parts.join('+');
}

export function KeyboardHelpHost() {
  const [open, setOpen] = useState(false);
  // Garante que o listener global está rodando enquanto este host existe.
  useKeyboardShortcuts();
  const shortcuts = useShortcutsSnapshot();

  // Registra o `?` toggle uma vez (no mount). skipWhenTyping=true por padrão
  // pra não atrapalhar caixas de texto.
  useEffect(() => {
    const off = registerShortcut({
      key: '?',
      shift: true, // `?` é Shift+/ em teclados US; em ABNT depende do layout
      label: 'Mostrar atalhos de teclado',
      group: 'Geral',
      onPress: (e) => {
        e.preventDefault();
        setOpen((v) => !v);
      },
    });
    // Variante sem Shift (alguns layouts mandam `?` direto)
    const off2 = registerShortcut({
      key: '?',
      label: 'Mostrar atalhos de teclado',
      group: 'Geral',
      onPress: (e) => {
        e.preventDefault();
        setOpen((v) => !v);
      },
    });
    return () => {
      off();
      off2();
    };
  }, []);

  // Agrupa por `group` (default 'Geral') pra exibir em seções. Resultado é
  // uma matriz mutable por group; `shortcuts` chega como readonly do snapshot
  // global, então não dá pra push direto — usa `.slice()` antes de agregar.
  type Item = (typeof shortcuts)[number];
  const groups = useMemo<[string, Item[]][]>(() => {
    const map = new Map<string, Item[]>();
    // pula o `?` em si pra não poluir a lista com 2 entradas iguais
    const visible = shortcuts.filter((s) => s.key !== '?');
    for (const s of visible) {
      const g = s.group ?? 'Geral';
      const list = map.get(g);
      if (list) list.push(s);
      else map.set(g, [s]);
    }
    return Array.from(map.entries());
  }, [shortcuts]);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Atalhos de teclado"
      size="sm"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 280 }}>
        {groups.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--em-muted)', fontSize: '0.85rem' }}>
            Nenhum atalho registrado ainda. Cada tela adiciona atalhos contextuais quando você entra nela.
          </p>
        ) : (
          groups.map(([group, items]) => (
            <section key={group}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--em-muted)' }}>
                {group}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: '0.86rem' }}>
                {items.map((s) => (
                  <span key={s.id} style={{ display: 'contents' }}>
                    <span style={{ color: 'var(--em-text)' }}>{s.label}</span>
                    <kbd
                      style={{
                        fontFamily: 'inherit',
                        fontSize: '0.78rem',
                        background: 'var(--em-panel-2)',
                        border: '1px solid var(--em-border)',
                        borderRadius: 4,
                        padding: '2px 8px',
                        color: 'var(--em-text)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatCombo(s)}
                    </kbd>
                  </span>
                ))}
              </div>
            </section>
          ))
        )}
        <p style={{ margin: 0, color: 'var(--em-muted)', fontSize: '0.78rem', borderTop: '1px solid var(--em-border)', paddingTop: 10 }}>
          Aperte <kbd style={{ fontFamily: 'inherit', background: 'var(--em-panel-2)', border: '1px solid var(--em-border)', borderRadius: 4, padding: '1px 6px' }}>Esc</kbd> pra fechar.
        </p>
      </div>
    </Modal>
  );
}
