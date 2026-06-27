// ConfirmDialog global — substituto type-safe e estilizado do window.confirm.
//
// API imperativa: `await confirm({ title, message, danger })` retorna boolean.
// Internamente, abre um Modal do design system em-* com o título/corpo dados
// e dois botões; resolve a Promise quando o usuário clica em um deles ou
// dispara ESC/backdrop (= cancelar).
//
// Pattern de host único: o ConfirmDialogHost deve ser montado UMA VEZ na
// árvore (main.tsx). A função `confirm()` notifica o host via listener
// module-level — não depende de Context, então pode ser chamada de funções
// puras (ex.: ErrorBoundary.resetCareer), não só de hooks.
//
// Uso (substitui window.confirm):
//   if (!(await confirm({ title: 'Apagar save?', message: 'Não tem volta.', danger: true }))) return;
//   doDangerThing();
//
// Por que substituir window.confirm:
//   - visual fora do tema (alert nativo do navegador)
//   - bloqueia thread principal
//   - i18n inconsistente (textos do navegador)
//   - não dá pra customizar labels/tom

import { useEffect, useState } from 'react';
import { Modal } from './ds';
import { Button } from './ds';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // `danger` muda o tom do botão de confirmar pra vermelho (ações destrutivas).
  danger?: boolean;
}

interface PendingDialog extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

type Listener = (next: PendingDialog | null) => void;

let seq = 1;
let current: PendingDialog | null = null;
const listeners = new Set<Listener>();

function emit(next: PendingDialog | null): void {
  current = next;
  for (const l of listeners) l(next);
}

// API pública. Devolve Promise<boolean>: true = confirmou, false = cancelou.
// Se chamada antes do host montar, o pending fica armazenado e renderiza
// assim que o host aparece (não engasga).
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    emit({ ...opts, id: seq++, resolve });
  });
}

// Host único — monta no main.tsx perto da raiz. Renderiza o Modal quando há
// um pending; ao escolher uma ação, resolve a Promise e limpa o pending.
export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingDialog | null>(current);

  useEffect(() => {
    const l: Listener = (next) => setPending(next);
    listeners.add(l);
    // se já havia algo pending antes do mount, sincroniza
    if (current && current !== pending) setPending(current);
    return () => {
      listeners.delete(l);
    };
    // intencional: só monta o listener uma vez (current é módulo-level)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!pending) return null;

  const resolveWith = (ok: boolean) => {
    pending.resolve(ok);
    emit(null);
  };

  return (
    <Modal
      open
      onClose={() => resolveWith(false)}
      title={pending.title ?? 'Confirmar'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => resolveWith(false)}>
            {pending.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button
            variant={pending.danger ? 'danger' : 'primary'}
            onClick={() => resolveWith(true)}
          >
            {pending.confirmLabel ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--em-text)', lineHeight: 1.5 }}>{pending.message}</p>
    </Modal>
  );
}
