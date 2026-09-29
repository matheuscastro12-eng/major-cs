// Boundary leve dos hosts de modal globais [O1-36/FRON-07]. Os hosts montam em
// main.tsx FORA do ErrorBoundary da app: um crash num deles (ex.: Sala de
// Troféus ou Recap com um save antigo sem um campo) desmontava a raiz inteira e
// deixava a tela branca, sem saída. Aqui o crash fecha o modal (onCrash limpa o
// estado de módulo do host), mostra um aviso curto e remonta o host fechado.
// Três crashes na mesma sessão desligam o host até o próximo carregamento, pra
// um modal que abre sozinho (ex.: patch notes) não virar loop.
import { Component, type ReactNode } from 'react';
import { captureError } from '../state/errlog';
import { getLang } from '../state/i18n';

const MAX_CRASHES = 3;
const TOAST_MS = 4500;
const MSG = {
  pt: 'Não consegui abrir essa janela. O erro foi registrado.',
  en: "Couldn't open this window. The error was logged.",
  es: 'No pude abrir esta ventana. El error fue registrado.',
} as const;

interface Props { name: string; onCrash?: () => void; children: ReactNode }
interface State { crashed: boolean; count: number; toast: boolean }

export class HostBoundary extends Component<Props, State> {
  state: State = { crashed: false, count: 0, toast: false };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(): Partial<State> {
    return { crashed: true };
  }

  componentDidCatch(error: Error) {
    captureError(error, `host-${this.props.name}`);
    try { this.props.onCrash?.(); } catch { /* fechar é best-effort */ }
    const count = this.state.count + 1;
    // remonta o host já fechado (o estado de módulo foi limpo pelo onCrash)
    this.setState({ count, toast: true, crashed: count >= MAX_CRASHES });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.setState({ toast: false }), TOAST_MS);
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  render() {
    const toast = this.state.toast ? (
      <div
        role="alert"
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 10000, maxWidth: 340,
          background: '#1d1414', color: '#f3e9e7', border: '1px solid #7a2f27', borderRadius: 8,
          padding: '10px 14px', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14,
          boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        }}
      >
        {MSG[getLang()] ?? MSG.pt}
      </div>
    ) : null;
    return (
      <>
        {this.state.crashed ? null : this.props.children}
        {toast}
      </>
    );
  }
}
