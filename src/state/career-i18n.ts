// Tradução do MODO CARREIRA. O carreira foi construído em PT; em vez de criar
// centenas de chaves, usa a própria string PT como chave: ct('texto PT') devolve
// a versão no idioma atual. O idioma vive a nível de módulo (setCareerLang é
// chamado no render do CareerScreen), então ct() funciona em qualquer
// subcomponente sem precisar passar o idioma por props.
import type { Lang } from './i18n';
import { CAREER_STR } from './career-strings';

let _lang: Lang = 'pt';
export function setCareerLang(l: Lang): void { _lang = l; }

export function ct(pt: string): string {
  if (_lang === 'pt') return pt;
  const e = CAREER_STR[pt];
  return e ? e[_lang] : pt; // sem tradução: cai no PT (nunca quebra)
}
