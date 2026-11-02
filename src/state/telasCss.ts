import telasHref from '../styles/telas.css?url';
import { createSheetLoader } from './lazyCss';

// CSS das telas de jogo (index.css, carreira, Road to Pro, play-hub e o CSS global
// que vinha depois deles: ver scripts/gen-css-inicial.mts). Fora da carga inicial:
// a landing e o /major-singapore abrem só com o CSS global + carga-inicial.css.
export const telasCss = createSheetLoader(telasHref, 'telas');

/** espera o chunk E o CSS das telas: o Suspense segura o Loader até os dois (sem tela sem estilo) */
export function comCssDasTelas<T>(chunk: Promise<T>): Promise<T> {
  return Promise.all([chunk, telasCss.load()]).then(([m]) => m);
}
