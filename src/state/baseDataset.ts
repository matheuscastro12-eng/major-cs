import type * as Crm from './crm';

// Base histórica de elencos (teams.json + atributos reais do player-attrs-2026.json,
// ~95 KB gzip) fora da carga inicial. Ela chega junto com o state/crm.ts, que é
// quem a lê (loadDataset, cache local por BASE_REV, merge com o /api/teams).
// A landing e o /major-singapore não usam a base: renderizam sem esperar. As telas
// de jogo pedem a base no boot (App.tsx) e mostram o Loader até ela chegar.

export type BaseModule = typeof Crm;

export interface BaseLoader<M> {
  /** começa (ou reaproveita) o download; rejeita se a rede falhar (a próxima chamada tenta de novo) */
  load(): Promise<M>;
  /** resolve na primeira carga bem-sucedida; nunca rejeita e não dispara o download sozinho */
  ready: Promise<M>;
  /** o módulo, se já chegou */
  peek(): M | null;
}

export function createBaseLoader<M>(importer: () => Promise<M | undefined>): BaseLoader<M> {
  let mod: M | null = null;
  let inflight: Promise<M> | null = null;
  let resolveReady!: (m: M) => void;
  const ready = new Promise<M>((r) => { resolveReady = r; });
  const load = (): Promise<M> => {
    if (mod) return Promise.resolve(mod);
    inflight ??= importer().then(
      (m) => {
        // undefined: o chunk falhou e o vite:preloadError do App já pediu o
        // reload da página (preventDefault faz o import resolver vazio). Segura
        // aqui até o reload, em vez de montar a tela com a base faltando.
        if (!m) return new Promise<M>(() => {});
        mod = m;
        resolveReady(m);
        return m;
      },
      (err: unknown) => {
        inflight = null; // falha de rede: deixa a próxima tela tentar de novo
        throw err;
      },
    );
    return inflight;
  };
  return { load, ready, peek: () => mod };
}

export const baseDataset: BaseLoader<BaseModule> = createBaseLoader(() => import('./crm'));
