// Toast global do design system em-*.
// Uso: envolva o app uma vez em <ToastProvider>, depois use o hook em
// qualquer lugar: const toast = useToast(); toast.success('Pick salvo').
//
// Características: stack top-right, auto-dismiss configurável, fecha manual,
// variantes success/error/info (cores semânticas), live-region pra leitores
// de tela.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastVariant = 'info' | 'success' | 'error';
export interface ToastItem {
  id: number;
  msg: ReactNode;
  variant: ToastVariant;
  duration: number;
}

interface ToastApi {
  show: (msg: ReactNode, opts?: { variant?: ToastVariant; duration?: number }) => number;
  success: (msg: ReactNode, duration?: number) => number;
  error: (msg: ReactNode, duration?: number) => number;
  info: (msg: ReactNode, duration?: number) => number;
  dismiss: (id: number) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

let seq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) { clearTimeout(handle); timers.current.delete(id); }
  }, []);

  const show = useCallback((msg: ReactNode, opts?: { variant?: ToastVariant; duration?: number }) => {
    const id = seq++;
    const variant: ToastVariant = opts?.variant ?? 'info';
    const duration = opts?.duration ?? (variant === 'error' ? 5200 : 3200);
    setItems((cur) => [...cur, { id, msg, variant, duration }]);
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    }
    return id;
  }, [dismiss]);

  // limpa timers ao desmontar
  useEffect(() => {
    const handles = timers.current;
    return () => { handles.forEach((h) => clearTimeout(h)); handles.clear(); };
  }, []);

  const api = useMemo<ToastApi>(() => ({
    show,
    success: (msg, duration) => show(msg, { variant: 'success', duration }),
    error: (msg, duration) => show(msg, { variant: 'error', duration }),
    info: (msg, duration) => show(msg, { variant: 'info', duration }),
    dismiss,
  }), [show, dismiss]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="em-toast-stack" role="region" aria-live="polite" aria-label="Notificações">
        {items.map((t) => (
          <div key={t.id} className={`em-toast em-toast--${t.variant}`} role={t.variant === 'error' ? 'alert' : 'status'}>
            <span className="em-toast-msg">{t.msg}</span>
            <button type="button" className="em-toast-x" onClick={() => dismiss(t.id)} aria-label="Fechar">✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // Fail-safe: se alguém chamar fora do provider, vira no-op + warn (evita
    // crash silencioso em testes/storybook).
    if (typeof console !== 'undefined') console.warn('useToast() chamado fora de ToastProvider — toasts não vão aparecer.');
    const noop = () => 0;
    return { show: noop, success: noop, error: noop, info: noop, dismiss: () => undefined };
  }
  return ctx;
}
