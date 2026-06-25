import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ct } from '../../state/career-i18n';
import { getCareerTheme } from '../../state/career-theme';
import { CareerIcon } from './CareerIcon';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
};

type ConfirmCtx = {
  askConfirm: (opts: ConfirmOptions) => void;
};

const ConfirmContext = createContext<ConfirmCtx | null>(null);

export function useCareerConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useCareerConfirm must be used within CareerConfirmProvider');
  return ctx;
}

export function CareerConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);

  const askConfirm = useCallback((opts: ConfirmOptions) => setPending(opts), []);
  const close = useCallback(() => setPending(null), []);

  const confirm = () => {
    const fn = pending?.onConfirm;
    close();
    fn?.();
  };

  const light = getCareerTheme() === 'light';

  return (
    <ConfirmContext.Provider value={{ askConfirm }}>
      {children}
      {pending && (
        <div className={`em-confirm-backdrop${light ? ' em-confirm-backdrop--light' : ''}`} onClick={close}>
          <div
            className={`em-confirm-modal${pending.danger ? ' danger' : ''}${light ? ' light' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="em-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="em-confirm-close" onClick={close} title={ct('Cancelar')}>
              <CareerIcon name="x" size={16} />
            </button>
            {pending.danger && (
              <div className="em-confirm-icon-wrap danger">
                <CareerIcon name="alert" size={22} />
              </div>
            )}
            {pending.danger && (
              <span className="em-confirm-kicker">{ct('Ação irreversível')}</span>
            )}
            <h2 id="em-confirm-title" className="em-confirm-title">{pending.title}</h2>
            <p className="em-confirm-message">{pending.message}</p>
            <div className="em-confirm-actions">
              <button type="button" className="em-confirm-btn em-confirm-btn-cancel" onClick={close}>
                {pending.cancelLabel ?? ct('Cancelar')}
              </button>
              <button
                type="button"
                className={`em-confirm-btn${pending.danger ? ' em-confirm-btn-danger' : ' em-confirm-btn-primary'}`}
                onClick={confirm}
              >
                {pending.confirmLabel ?? ct('Confirmar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
