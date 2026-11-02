// Shell da Carreira no GameShell universal (a "nova interface"). A Carreira
// passa as seções (sidebar estilo FM), as abas da tela, a identidade do clube
// e o CONTINUAR; o conteúdo segue embrulhado no .career-dash (tema e estilos
// legados das abas).
import { useLayoutEffect, type ReactNode } from 'react';
import { GameShell, type GameShellProps } from '../ds/shell/GameShell';
import { careerDashClass, useCareerTheme } from '../../state/career-theme';
import { ct } from '../../state/career-i18n';

export type CareerShellProps = Omit<GameShellProps, 'mode' | 'children'> & { children: ReactNode };

/** Volta a página ao topo quando `key` muda (e na montagem). As telas de
 *  montagem da carreira trocam de conteúdo sem trocar de rota: sem isto, a tela
 *  seguinte abria na altura do botão clicado na anterior (fim da lista). */
function useScrollTopOn(key: unknown) {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [key]);
}

export function CareerShell({ children, ...rest }: CareerShellProps) {
  const [theme] = useCareerTheme();
  // entrar no painel (vindo do fluxo de montagem, do tour ou de uma partida) abre no topo
  useScrollTopOn(null);
  return (
    <GameShell mode="carreira" {...rest}>
      <div className={`${careerDashClass(theme)} career-in-shell`}>
        <div className="em-body tab-fade">{children}</div>
      </div>
    </GameShell>
  );
}

/** Telas de fluxo da Carreira (fundar/assumir org, mercado inicial, escolher
 *  campeonato): shell sem sidebar, só a topbar com o escudo da marca. */
export function CareerDashFrame({ title, onExit, children, immersive = false }: { title?: string; onExit: () => void; children: ReactNode; immersive?: boolean }) {
  const [theme] = useCareerTheme();
  // cada tela do fluxo tem o próprio título; o React reaproveita este frame
  // entre elas, então a troca de título é o sinal de tela nova
  useScrollTopOn(title);
  return (
    <GameShell
      mode="carreira"
      variant={immersive ? 'immersive' : 'focus'}
      identity={{ title: ct('Carreira'), subtitle: title }}
      title={title}
      crumbs={[]}
      history={{ back: onExit }}
    >
      <div className={`${careerDashClass(theme)} career-in-shell`}>
        <div className="em-body">{children}</div>
      </div>
    </GameShell>
  );
}
