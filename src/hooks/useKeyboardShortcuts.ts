// Atalhos de teclado globais — T2.3 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Pattern: registry module-level + hook React.
//
// 1) Telas registram atalhos imperativamente:
//      const off = registerShortcut({ key: 'n', label: 'Avançar semana', onPress: advanceWeek });
//      // off() pra desregistrar (ex.: no cleanup do useEffect).
// 2) O hook `useKeyboardShortcuts()` instala UM listener no document, despacha
//    para o callback correto baseado em key + modificadores.
// 3) `getShortcuts()` lê o registry pra o KeyboardHelpOverlay listar tudo.
//
// Não usa Context — registro funciona de qualquer lugar (módulo, hook, classe).

import { useEffect, useState } from 'react';

export interface Shortcut {
  // tecla principal (key.toLowerCase()). Ex.: 'n', 'enter', '?', 'escape'.
  key: string;
  // se true, exige Ctrl (ou Cmd no macOS). Default false.
  ctrl?: boolean;
  // se true, exige Shift. Default false.
  shift?: boolean;
  // exige Alt. Default false.
  alt?: boolean;
  // categoria pra agrupar no overlay (ex.: 'Navegação', 'Carreira', 'Geral').
  group?: string;
  // texto descritivo mostrado no overlay (ex.: 'Avançar semana').
  label: string;
  // callback ao acionar. Recebe o KeyboardEvent caso precise preventDefault.
  onPress: (e: KeyboardEvent) => void;
  // se true, não dispara enquanto o foco estiver em <input>/<textarea>/contentEditable.
  // Default true (atalhos sempre interferem em digitação se = false). Pra atalhos
  // tipo Esc que devem rodar sempre, passar false.
  skipWhenTyping?: boolean;
}

interface RegisteredShortcut extends Shortcut {
  id: number;
}

let seq = 1;
const REGISTRY: RegisteredShortcut[] = [];
type ChangeListener = () => void;
const changeListeners = new Set<ChangeListener>();

function notifyChange(): void {
  for (const l of changeListeners) l();
}

// Registra um atalho. Devolve função pra remover.
export function registerShortcut(s: Shortcut): () => void {
  const id = seq++;
  REGISTRY.push({ ...s, id });
  notifyChange();
  return () => {
    const i = REGISTRY.findIndex((x) => x.id === id);
    if (i >= 0) {
      REGISTRY.splice(i, 1);
      notifyChange();
    }
  };
}

// Snapshot dos atalhos atuais (pro overlay).
export function getShortcuts(): readonly RegisteredShortcut[] {
  return REGISTRY;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function matchShortcut(s: RegisteredShortcut, e: KeyboardEvent): boolean {
  if (s.key.toLowerCase() !== e.key.toLowerCase()) return false;
  const ctrl = e.ctrlKey || e.metaKey;
  if ((s.ctrl ?? false) !== ctrl) return false;
  if ((s.shift ?? false) !== e.shiftKey) return false;
  if ((s.alt ?? false) !== e.altKey) return false;
  return true;
}

// Hook que instala/desinstala o listener global. Chama UMA vez no app
// (no Layout/main). O hook não precisa estar dentro de provider — é stateless.
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // procura na ordem reversa: o registro mais recente vence (telas locais
      // sobreescrevem globais quando registram a mesma combinação).
      for (let i = REGISTRY.length - 1; i >= 0; i--) {
        const s = REGISTRY[i];
        if (!matchShortcut(s, e)) continue;
        if ((s.skipWhenTyping ?? true) && isTypingTarget(e.target)) return;
        s.onPress(e);
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}

// Hook auxiliar pro KeyboardHelpOverlay: rerender quando o registry muda.
export function useShortcutsSnapshot(): readonly RegisteredShortcut[] {
  const [, force] = useState(0);
  useEffect(() => {
    const l: ChangeListener = () => force((n) => n + 1);
    changeListeners.add(l);
    return () => {
      changeListeners.delete(l);
    };
  }, []);
  return REGISTRY;
}
