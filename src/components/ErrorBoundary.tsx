// Rede de seguranca: se um componente quebrar no render, em vez de tela branca o
// jogador ve um aviso e um botao de recarregar. O erro vai pro monitoramento.
import { Component, type ReactNode } from 'react';
import { captureError } from '../state/errlog';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    captureError(error, 'react');
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 460, margin: '14vh auto', padding: 24, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', color: '#dfe5ec' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🛠️</div>
          <h2 style={{ fontFamily: 'Oswald, sans-serif', marginBottom: 8 }}>Ops, algo quebrou aqui</h2>
          <p style={{ color: '#97a3b2', marginBottom: 16 }}>
            Recarregue a página. Seu progresso fica salvo no navegador, então você não perde a carreira.
          </p>
          <button
            onClick={() => location.reload()}
            style={{ background: 'linear-gradient(150deg,#e8c170,#b08a3e)', color: '#1a1408', border: 'none', borderRadius: 10, padding: '10px 22px', fontWeight: 800, cursor: 'pointer' }}
          >
            Recarregar
          </button>
          <div style={{ marginTop: 16, fontSize: 12, color: '#5e6975', wordBreak: 'break-word' }}>{this.state.error.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
