// Shell da Carreira no GameShell universal (a "nova interface"). A Carreira
// passa as seções (sidebar estilo FM), as abas da tela, a identidade do clube
// e o CONTINUAR; o conteúdo segue embrulhado no .career-dash (tema e estilos
// legados das abas).
import type { ReactNode } from 'react';
import { GameShell, type GameShellProps } from '../ds/shell/GameShell';
import { careerDashClass, useCareerTheme } from '../../state/career-theme';
import { ct } from '../../state/career-i18n';

export type CareerShellProps = Omit<GameShellProps, 'mode' | 'children'> & { children: ReactNode };

export function CareerShell({ children, ...rest }: CareerShellProps) {
  const [theme] = useCareerTheme();
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
export function CareerDashFrame({ title, onExit, children }: { title?: string; onExit: () => void; children: ReactNode }) {
  const [theme] = useCareerTheme();
  return (
    <GameShell
      mode="carreira"
      variant="focus"
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
