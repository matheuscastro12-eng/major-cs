// Rede de proteção do modo Major Singapore: se um time da lista não tiver dados
// na base bo3.gg (ou qualquer erro de render), mostra um aviso em vez de tela
// branca e deixa voltar ao menu. O modo não tem save, então não há o que resetar.
import { Component, type ReactNode } from 'react';
import { ct } from '../state/career-i18n';
import { Button } from './ds/index';

interface Props { onExit: () => void; children: ReactNode }
interface State { error: Error | null }

export class MajorErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error) { console.error('[major-singapore]', error); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const missing = /bo3Id desconhecido|na base bo3\.gg/.test(error.message);
    return (
      <div className="msg-fallback" role="alert">
        <h2 className="msg-fallback__title">{ct('O Major Singapore não carregou')}</h2>
        <p className="msg-fallback__txt">
          {missing ? ct('Algum time da lista ainda não tem dados (elenco/força) na base do bo3.gg. Assim que a base atualizar, o modo volta.') : ct('Deu um erro inesperado nesta tela.')}
        </p>
        <pre className="msg-fallback__err">{error.message.slice(0, 300)}</pre>
        <div className="msg-fallback__act">
          <Button variant="primary" onClick={() => this.setState({ error: null })}>{ct('Tentar de novo')}</Button>
          <Button variant="secondary" onClick={this.props.onExit}>{ct('Voltar ao menu')}</Button>
        </div>
      </div>
    );
  }
}
