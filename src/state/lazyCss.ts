// Folha de CSS sob demanda numa posição fixa da cascata. O Vite anexa o CSS de um
// chunk lazy no FIM do <head>, depois de qualquer CSS lazy que já tenha chegado
// (o major.css do /major-singapore, por exemplo); aqui a folha entra logo depois
// do CSS global, onde as regras dela estavam antes de sair da carga inicial.

// o que interessa do document (o teste passa um falso)
export interface DocLike {
  head: { querySelectorAll(sel: string): ArrayLike<ElLike>; appendChild(el: ElLike): unknown };
  createElement(tag: 'link'): LinkLike;
}
export interface ElLike { after?(el: ElLike): void; isConnected?: boolean }
export interface LinkLike extends ElLike {
  rel: string;
  href: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove(): void;
  setAttribute(k: string, v: string): void;
}

const GLOBAL_SHEETS = 'link[rel="stylesheet"], style';

export interface SheetLoader {
  /** guarda o último CSS do <head>: chamar no boot, antes de qualquer chunk lazy */
  markGlobalEnd(): void;
  /** insere a folha (uma vez só) e resolve quando ela carregou; numa falha, a próxima chamada tenta de novo */
  load(): Promise<void>;
}

export function createSheetLoader(href: string, name: string, doc: () => DocLike | undefined = () => (typeof document === 'undefined' ? undefined : document as unknown as DocLike)): SheetLoader {
  let anchor: ElLike | null = null;
  let pending: Promise<void> | null = null;
  return {
    markGlobalEnd() {
      const d = doc();
      if (!d) return;
      const all = d.head.querySelectorAll(GLOBAL_SHEETS);
      anchor = all.length ? all[all.length - 1] : null;
    },
    load() {
      if (pending) return pending;
      const d = doc();
      if (!d) return Promise.resolve();
      pending = new Promise<void>((resolve, reject) => {
        const link = d.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.setAttribute('data-sheet', name);
        link.onload = () => resolve();
        link.onerror = () => {
          link.remove();
          pending = null;
          reject(new Error(`css_load_failed: ${name}`));
        };
        // sem âncora (boot sem CSS global?): no fim do <head>, como o Vite faria
        if (anchor?.isConnected && anchor.after) anchor.after(link);
        else d.head.appendChild(link);
      });
      return pending;
    },
  };
}
