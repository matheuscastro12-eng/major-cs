// Rede de segurança GLOBAL: pega o que escapar dos boundaries de modo
// (ModeErrorBoundary: Carreira, RtP, Ultimate, Diário) e dos hosts de modal.
// Em vez de tela branca, o jogador vê um aviso e três caminhos que NÃO apagam
// nada: recarregar, voltar ao menu (navegação completa pra /jogar, que sai do
// estado que quebrou) e baixar o backup de todos os saves. O antigo "Reiniciar
// carreira" daqui apagava o slot ativo e gravava lápide na nuvem mesmo quando o
// crash era em outro modo [O0-12/FRON-02]; o reset agora vive no boundary do
// modo que quebrou. O erro vai pro monitoramento.
import { Component, type CSSProperties, type ReactNode } from 'react';
import { captureError } from '../state/errlog';
import { getLang } from '../state/i18n';
import { downloadSaveBackup } from '../state/saveRecovery';

// guard do lazyWithReload (App.tsx): se `1`, o lazyWithReload já tentou
// recarregar uma vez e parou de retentar pra não virar loop infinito. Quando
// o user clica Recarregar manualmente, queremos LIMPAR esse guard pra dar
// nova chance ao chunk loader (ex.: cache antigo limpa após reload).
export const CHUNK_RELOAD_KEY = 'rtm-chunk-reload';

// Estilo compartilhado das telas de crash (global e por modo). Fica fora dos
// tokens --em-* de propósito: a tela precisa aparecer mesmo sem o CSS do modo
// (o crash pode ter sido antes dele carregar). Re-estilizado na fundação visual.
export const crashStyles: Record<'wrap' | 'title' | 'body' | 'row' | 'primary' | 'ghost' | 'note' | 'dangerRow' | 'danger' | 'detail', CSSProperties> = {
  wrap: { maxWidth: 480, margin: '12vh auto', padding: 24, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', color: '#dfe5ec' },
  title: { fontFamily: 'Oswald, sans-serif', marginBottom: 8 },
  body: { color: '#97a3b2', marginBottom: 16, lineHeight: 1.45 },
  row: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  primary: { background: 'linear-gradient(150deg,#e8c170,#b08a3e)', color: '#1a1408', border: 'none', borderRadius: 10, padding: '10px 22px', fontWeight: 800, cursor: 'pointer' },
  ghost: { background: 'transparent', color: '#dfe5ec', border: '1px solid #3a4350', borderRadius: 10, padding: '10px 22px', fontWeight: 700, cursor: 'pointer' },
  note: { marginTop: 10, fontSize: 13, color: '#97a3b2' },
  dangerRow: { marginTop: 22, paddingTop: 14, borderTop: '1px solid #2a313b' },
  danger: { background: 'transparent', color: '#e07a6e', border: '1px solid #5a2f2a', borderRadius: 10, padding: '8px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  detail: { marginTop: 16, fontSize: 12, color: '#5e6975', wordBreak: 'break-word' },
};

const STR = {
  title: { pt: 'Ops, algo quebrou aqui', en: 'Oops, something broke', es: 'Ups, algo se rompió' },
  body: {
    pt: 'Nada foi apagado: seus saves continuam gravados neste navegador. Recarregue a página ou volte ao menu. Se quiser, baixe antes uma cópia dos seus saves.',
    en: 'Nothing was deleted: your saves are still stored in this browser. Reload the page or go back to the menu. If you want, download a copy of your saves first.',
    es: 'No se borró nada: tus partidas siguen guardadas en este navegador. Recarga la página o vuelve al menú. Si quieres, descarga antes una copia de tus partidas.',
  },
  reload: { pt: 'Recarregar', en: 'Reload', es: 'Recargar' },
  menu: { pt: 'Voltar ao menu', en: 'Back to menu', es: 'Volver al menú' },
  backup: { pt: 'Baixar backup (JSON)', en: 'Download backup (JSON)', es: 'Descargar copia (JSON)' },
  backupOk: { pt: 'Backup baixado.', en: 'Backup downloaded.', es: 'Copia descargada.' },
  backupEmpty: { pt: 'Não há saves neste navegador.', en: 'There are no saves in this browser.', es: 'No hay partidas en este navegador.' },
} as const;

const tr = (k: keyof typeof STR): string => {
  const l = getLang();
  return STR[k][l] ?? STR[k].pt;
};

const clearChunkGuard = () => { try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* ok */ } };

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; backup: 'ok' | 'empty' | null }> {
  state: { error: Error | null; backup: 'ok' | 'empty' | null } = { error: null, backup: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    captureError(error, 'react');
  }

  render() {
    if (this.state.error) {
      const S = crashStyles;
      return (
        <div style={S.wrap} role="alert">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🛠️</div>
          <h2 style={S.title}>{tr('title')}</h2>
          <p style={S.body}>{tr('body')}</p>
          <div style={S.row}>
            <button
              type="button"
              onClick={() => {
                // limpa o guard do lazyWithReload pra dar nova chance ao
                // chunk loader (mesma sessão). Sem isso o user ficava
                // travado: reload → guard '1' → catch joga ErrorBoundary
                // imediatamente → mesmo loop.
                clearChunkGuard();
                location.reload();
              }}
              style={S.primary}
            >
              {tr('reload')}
            </button>
            {/* navegação completa: sai da rota (e do estado em memória) que quebrou */}
            <button type="button" onClick={() => { clearChunkGuard(); location.assign('/jogar'); }} style={S.ghost}>
              {tr('menu')}
            </button>
            <button type="button" onClick={() => this.setState({ backup: downloadSaveBackup('all') ? 'ok' : 'empty' })} style={S.ghost}>
              {tr('backup')}
            </button>
          </div>
          {this.state.backup && <div style={S.note}>{tr(this.state.backup === 'ok' ? 'backupOk' : 'backupEmpty')}</div>}
          <div style={S.detail}>{this.state.error.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
