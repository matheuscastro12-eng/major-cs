// Tradução do MODO CARREIRA. O carreira foi construído em PT; em vez de criar
// centenas de chaves, usa a própria string PT como chave: ct('texto PT') devolve
// a versão no idioma atual. O idioma vive a nível de módulo (setCareerLang é
// chamado no render do CareerScreen), então ct() funciona em qualquer
// subcomponente sem precisar passar o idioma por props.
//
// O dicionário en/es (career-strings.ts, ~150 KB com gzip) vem SOB DEMANDA: em
// português ct() devolve o próprio texto e nunca precisa dele, então ele não
// entra na primeira carga. Quando o idioma vira en/es, o import começa (o
// main.tsx já começa no boot se o idioma salvo não for pt); até chegar, ct()
// devolve o PT e, quando chega, os ouvintes do useLang re-renderizam o app.
import { refreshLang, type Lang } from './i18n';

type CareerDict = Record<string, { en: string; es: string }>;

let _lang: Lang = 'pt';
let STR: CareerDict | null = null;
let loading: Promise<void> | null = null;

/** Carrega o dicionário en/es (uma vez). Seguro chamar várias vezes. */
export function loadCareerStrings(): Promise<void> {
  if (STR) return Promise.resolve();
  loading ??= import('./career-strings').then(
    (m) => { STR = m.CAREER_STR; refreshLang(); },
    () => { loading = null; /* sem o chunk: segue em PT e tenta de novo na próxima troca */ },
  );
  return loading;
}

export function setCareerLang(l: Lang): void {
  _lang = l;
  if (l !== 'pt' && !STR) void loadCareerStrings();
}
export function careerLang(): Lang { return _lang; }
/** o dicionário en/es já chegou? (testes e diagnóstico) */
export function careerStringsReady(): boolean { return STR !== null; }

export function ct(pt: string): string {
  if (_lang === 'pt') return pt;
  const e = STR?.[pt];
  return e ? e[_lang] : pt; // sem tradução (ou dicionário ainda chegando): cai no PT (nunca quebra)
}
