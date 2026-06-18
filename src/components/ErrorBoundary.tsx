// Rede de seguranca: se um componente quebrar no render, em vez de tela branca o
// jogador ve um aviso e dois caminhos: recarregar (mantem o save) ou reiniciar a
// carreira (limpa o save corrompido). Sem o reset, um crash ligado ao estado
// salvo vira loop permanente. O erro vai pro monitoramento.
import { Component, type ReactNode } from 'react';
import { captureError } from '../state/errlog';
import { getLang } from '../state/i18n';

const SAVE_KEYS = ['rtm-career-v1', 'rtm-career-v1.bak'];

const STR = {
  title: { pt: 'Ops, algo quebrou aqui', en: 'Oops, something broke', es: 'Ups, algo se rompió' },
  body: {
    pt: 'Recarregue a página — seu progresso fica salvo no navegador. Se o erro continuar ao recarregar, reinicie a carreira (isso apaga o save atual).',
    en: 'Reload the page — your progress is saved in the browser. If the error keeps happening after reloading, restart the career (this erases the current save).',
    es: 'Recarga la página — tu progreso se guarda en el navegador. Si el error sigue al recargar, reinicia la carrera (esto borra la partida actual).',
  },
  reload: { pt: 'Recarregar', en: 'Reload', es: 'Recargar' },
  reset: { pt: 'Reiniciar carreira', en: 'Restart career', es: 'Reiniciar carrera' },
  confirm: {
    pt: 'Isso vai apagar a carreira salva neste navegador e começar do zero. Continuar?',
    en: 'This will erase the career saved in this browser and start over. Continue?',
    es: 'Esto borrará la carrera guardada en este navegador y empezará de cero. ¿Continuar?',
  },
} as const;

const tr = (k: keyof typeof STR): string => {
  const l = getLang();
  return STR[k][l] ?? STR[k].pt;
};

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    captureError(error, 'react');
  }

  resetCareer = () => {
    if (!confirm(tr('confirm'))) return;
    try {
      for (const k of SAVE_KEYS) localStorage.removeItem(k);
    } catch {
      /* sem storage */
    }
    location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 460, margin: '14vh auto', padding: 24, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', color: '#dfe5ec' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🛠️</div>
          <h2 style={{ fontFamily: 'Oswald, sans-serif', marginBottom: 8 }}>{tr('title')}</h2>
          <p style={{ color: '#97a3b2', marginBottom: 16 }}>{tr('body')}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => location.reload()}
              style={{ background: 'linear-gradient(150deg,#e8c170,#b08a3e)', color: '#1a1408', border: 'none', borderRadius: 10, padding: '10px 22px', fontWeight: 800, cursor: 'pointer' }}
            >
              {tr('reload')}
            </button>
            <button
              onClick={this.resetCareer}
              style={{ background: 'transparent', color: '#97a3b2', border: '1px solid #3a4350', borderRadius: 10, padding: '10px 22px', fontWeight: 700, cursor: 'pointer' }}
            >
              {tr('reset')}
            </button>
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: '#5e6975', wordBreak: 'break-word' }}>{this.state.error.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
