/**
 * Histórico do app: o Voltar/Avançar da topbar do shell, o Alt+←/→ e o
 * voltar/avançar do navegador andam pela MESMA pilha, a do `window.history`
 * que o App já usa como router (uma URL por tela).
 *
 * Cada entrada que o jogo cria carrega em `history.state`:
 *   - `rtmIdx`: a posição dela dentro do jogo (0 = primeira tela do jogo
 *     nesta aba). Voltar só é possível com `rtmIdx > 0`, então o shell nunca
 *     tira o jogador do app nem o devolve pra landing.
 *   - `rtmSec`: a seção/aba do modo naquela entrada ({ scope, value }). Trocar
 *     de seção empilha uma entrada na mesma URL; voltar restaura a seção.
 * O topo da pilha (até onde dá pra avançar) fica no sessionStorage, que
 * sobrevive ao recarregar a aba como o próprio histórico.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';

export interface AppSection { scope: string; value: string }
type AppHistoryState = Record<string, unknown> & { rtmIdx?: number; rtmSec?: AppSection };

const TOP_KEY = 'rtm-hist-top-v1';
const CHANGE_EVENT = 'rtm:history';
let memTop = 0;

function histState(): AppHistoryState {
  const s: unknown = window.history.state;
  return s && typeof s === 'object' ? (s as AppHistoryState) : {};
}
function currentUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
function readTop(): number {
  try {
    const n = Number(sessionStorage.getItem(TOP_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return memTop; }
}
function writeTop(n: number): void {
  memTop = n;
  try { sessionStorage.setItem(TOP_KEY, String(n)); } catch { /* sem storage */ }
}
function emit(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** posição da entrada atual dentro do jogo */
export function appHistoryIndex(): number {
  const i = histState().rtmIdx;
  return typeof i === 'number' && i > 0 ? i : 0;
}

/** Marca a entrada de chegada. Entrada sem `rtmIdx` é a primeira do jogo
 *  nesta aba (link direto, aba nova): nada para voltar nem avançar. */
export function initAppHistory(): void {
  if (typeof histState().rtmIdx === 'number') return;
  window.history.replaceState({ ...histState(), rtmIdx: 0 }, '', currentUrl());
  writeTop(0);
}

/** Empilha uma entrada do jogo. `reset` = começa uma pilha nova (vindo de
 *  fora do jogo: landing, termos, criar manager, admin). */
export function pushAppEntry(state: Record<string, unknown>, url: string = currentUrl(), opts: { reset?: boolean } = {}): void {
  const idx = opts.reset ? 0 : appHistoryIndex() + 1;
  window.history.pushState({ ...state, rtmIdx: idx }, '', url);
  writeTop(idx);
  emit();
}

/** Troca a entrada atual mantendo a posição dela na pilha. */
export function replaceAppEntry(state: Record<string, unknown>, url: string = currentUrl()): void {
  window.history.replaceState({ ...state, rtmIdx: appHistoryIndex() }, '', url);
  emit();
}

export function canAppGoBack(): boolean { return appHistoryIndex() > 0; }
export function canAppGoForward(): boolean { return appHistoryIndex() < readTop(); }
export function appGoBack(): void { if (canAppGoBack()) window.history.back(); }
export function appGoForward(): void { if (canAppGoForward()) window.history.forward(); }

function subscribe(fn: () => void): () => void {
  window.addEventListener('popstate', fn);
  window.addEventListener(CHANGE_EVENT, fn);
  return () => { window.removeEventListener('popstate', fn); window.removeEventListener(CHANGE_EVENT, fn); };
}
const snapshot = () => `${appHistoryIndex()}/${readTop()}`;

/** Voltar/Avançar do shell: habilitados só quando há para onde ir no jogo. */
export function useAppHistory(): { back: () => void; forward: () => void; canBack: boolean; canForward: boolean } {
  const snap = useSyncExternalStore(subscribe, snapshot, () => '0/0');
  const [idx, top] = snap.split('/').map(Number);
  return { back: appGoBack, forward: appGoForward, canBack: idx > 0, canForward: idx < top };
}

/**
 * Liga a seção/aba de um modo ao histórico do app.
 *  - a seção muda por clique → nova entrada (mesma URL) com a seção;
 *  - voltar/avançar (shell, Alt+←/→, navegador) → `apply(seção da entrada)`;
 *  - o modo monta numa entrada que já tem seção (voltou de outro modo,
 *    recarregou) → restaura a seção dela.
 * `owns(pathname)` diz se a URL atual é deste modo: o modo monta antes de o
 * App empilhar a URL dele, e só anota entradas que são suas.
 */
export function useSectionHistory(scope: string, value: string, apply: (value: string) => void, owns: (pathname: string) => boolean): void {
  const latest = useRef({ value, apply, owns });
  useEffect(() => { latest.current = { value, apply, owns }; });
  const restored = useRef(false);
  const fromPop = useRef(false);

  useEffect(() => {
    if (!latest.current.owns(window.location.pathname)) return;
    const st = histState();
    const cur = st.rtmSec?.scope === scope ? st.rtmSec.value : undefined;
    if (!restored.current) {
      restored.current = true;
      if (cur !== undefined && cur !== value) { fromPop.current = true; latest.current.apply(cur); return; }
    }
    if (cur === value) { fromPop.current = false; return; }
    // entrada sem seção (acabou de ser criada pelo App ou por um perfil) ou
    // seção que não pôde ser restaurada: anota; troca por clique: empilha
    if (cur === undefined || fromPop.current) replaceAppEntry({ ...st, rtmSec: { scope, value } });
    else pushAppEntry({ ...st, rtmSec: { scope, value } });
    fromPop.current = false;
  }, [scope, value]);

  useEffect(() => {
    const onPop = () => {
      const { owns: ownsNow, value: now, apply: applyNow } = latest.current;
      if (!ownsNow(window.location.pathname)) return;
      const sec = histState().rtmSec;
      if (!sec || sec.scope !== scope || sec.value === now) return;
      fromPop.current = true;
      applyNow(sec.value);
    };
    // o App (ou um perfil da carreira) empilhou uma entrada desta URL sem
    // seção: anota com a seção atual. Adiado um tick para o clique que empilhou
    // (ex.: sair do perfil pela sidebar) terminar de trocar a seção antes —
    // aí o efeito acima já anotou a seção nova e isto não faz nada.
    let timer = 0;
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const { owns: ownsNow, value: now } = latest.current;
        if (!ownsNow(window.location.pathname)) return;
        const st = histState();
        if (st.rtmSec?.scope === scope) return;
        restored.current = true;
        replaceAppEntry({ ...st, rtmSec: { scope, value: now } });
      }, 0);
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, [scope]);
}
