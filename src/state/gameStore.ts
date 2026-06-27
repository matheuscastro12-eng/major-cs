// Store central da carreira (T1.1 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md).
//
// Encapsula toda a lógica de load/persist/migration/cloud-sync que hoje vive
// solta dentro de CareerScreen.tsx (loadSave/persist/hydrate, ~80 linhas).
// O store é a FONTE DA VERDADE futura do save da carreira; durante a migração
// incremental (T1.4 quebra do CareerScreen em pages), cada page passa a ler
// via `useGame(s => s.save)` e atualiza via `update(patch)`.
//
// Princípios:
//   - Não duplica `emptySave()`/`hydrate()` — esses ficam no consumidor (hoje
//     CareerScreen; quando migrar, vão pra `src/state/careerDefaults.ts` ou
//     similar). O store recebe um `hydrator` no `loadFromSlot()` e aplica.
//   - Mantém a chave de localStorage legada (`rtm-career-v1` via slotKey()) —
//     a versão do schema vive DENTRO do save (`_v`), não no nome da key.
//     Save antigo abre, é migrado em runtime, re-persiste no formato novo.
//   - Espelha o backup `.bak`, o tratamento `.corrupt` e o `cloudOnLocalSave`
//     que já existem no CareerScreen.
//   - Slot ativo é compartilhado com `careerSaves.ts` (getActiveSlot/slotKey)
//     pra reaproveitar todo o sistema de 5 slots + cloud que já funciona.

import { create } from 'zustand';
import { cloudOnLocalSave, cloudEnabled, pushCloud } from './cloud';
import { cloudSlot, getActiveSlot, slotKey } from './careerSaves';
import { captureError } from './errlog';
import {
  migrateSave,
  saveVersion,
  stampVersion,
  SAVE_VERSION,
  type VersionedSave,
} from './saveMigrations';

// Tipagem genérica do save (CareerSave ainda vive em CareerScreen.tsx). Quando
// T1.4 mover o tipo pra `src/types/career.ts`, trocar `VersionedSave` por `CareerSave`.
export type GameSave = VersionedSave;

// Hidratador opcional injetado pelo consumidor (default: identity).
// O CareerScreen passa o `hydrate()` próprio dele que mergeia com `emptySave()`,
// faz `stripEraDeep`, `healProspect`, etc. Mantém a cura de saves antigos no
// lugar de origem até T1.4 quebrar o monolito.
//
// Sem constraint em T pra aceitar interfaces fechadas (ex.: `CareerSave`) que
// não declaram index signature compatível com VersionedSave. O fluxo de runtime
// trata tudo como `unknown`/`object` pra ler/escrever — typing é só pra DX.
export type Hydrator<T = GameSave> = (raw: VersionedSave) => T;
const identityHydrator: Hydrator = (s) => s;

interface GameStoreState {
  // null = nada carregado ainda (boot / sem save no slot). Diferente de
  // emptySave() que é "carregado, mas vazio". A diferença importa pra
  // decidir se mostra a tela de fundação (`org === null`) ou a Landing.
  save: GameSave | null;
  // Slot ativo carregado pelo store. -1 = nada carregado.
  loadedSlot: number;
  // True enquanto o boot inicial ainda não rodou (evita race com persist).
  ready: boolean;
  // Marca o último erro de persist pra exibir aviso (quota cheia, etc.).
  lastPersistError: string | null;

  // ---- Actions ----
  // Carrega save do slot do localStorage, aplica migrations e hidrata. Idempotente.
  loadFromSlot: (n?: number, hydrate?: Hydrator) => GameSave | null;
  // Substitui o save inteiro (após reset, novo onboarding, restore). Persiste.
  setSave: (s: GameSave | null) => void;
  // Patch parcial (estilo `setSave((s) => ({...s, ...patch}))`). Persiste.
  // Aceita função pra patches que dependem do estado atual.
  update: (patch: Partial<GameSave> | ((s: GameSave) => Partial<GameSave>)) => void;
  // Reset duro: apaga local + nuvem do slot ativo. Volta save pra null.
  wipeActiveSlot: () => void;
  // Persiste o save atual no localStorage do slot ativo. Chamado internamente
  // por setSave/update; exposto pra casos onde o consumidor quer flush manual.
  persistNow: () => void;
}

// Helper interno: lê o save cru do localStorage da slot dada. Não migra/hidrata.
function readRawSlot(n: number): string | null {
  try {
    return localStorage.getItem(slotKey(n));
  } catch {
    return null;
  }
}

// Helper interno: escreve o save no localStorage + backup .bak + cloud (debounced).
// Espelha exatamente `persist()` do CareerScreen.tsx:1608 pra manter o contrato.
function writeRawSlot(n: number, json: string): { ok: boolean; error?: string } {
  const KEY = slotKey(n);
  const BAK = KEY + '.bak';
  try {
    let prev: string | null = null;
    try {
      prev = localStorage.getItem(KEY);
    } catch {
      /* segue */
    }
    localStorage.setItem(KEY, json);
    cloudOnLocalSave(cloudSlot(n), KEY, () => json);
    // backup de um passo: se o save novo ficar ilegível, dá pra voltar pro anterior
    if (prev && prev !== json) {
      try {
        localStorage.setItem(BAK, prev);
      } catch {
        /* backup é best-effort; quota não pode derrubar o save principal */
      }
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    captureError(e, 'game-store-persist');
    return { ok: false, error: msg };
  }
}

// Helper interno: apaga todos os artefatos de um slot (principal + .bak + .corrupt)
// e estampa tombstone na nuvem (quando logado). Espelha `wipeActiveSlot()` do
// CareerScreen.tsx:1599.
function wipeRawSlot(n: number): void {
  const KEY = slotKey(n);
  for (const k of [KEY, KEY + '.bak', KEY + '.corrupt']) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* sem storage */
    }
  }
  try {
    if (cloudEnabled()) void pushCloud(cloudSlot(n), '', Date.now());
  } catch {
    /* offline */
  }
}

// Salva o save corrompido em `.corrupt` pra diagnóstico (igual ao CareerScreen).
function stashCorrupt(n: number, raw: string): void {
  const CORRUPT = slotKey(n) + '.corrupt';
  try {
    localStorage.setItem(CORRUPT, raw);
  } catch {
    /* sem espaço pro diagnóstico */
  }
}

export const useGame = create<GameStoreState>((set, get) => ({
  save: null,
  loadedSlot: -1,
  ready: false,
  lastPersistError: null,

  loadFromSlot: (n, hydrate) => {
    const slot = n ?? getActiveSlot();
    const hydrator = (hydrate ?? identityHydrator) as Hydrator;
    const raw = readRawSlot(slot);

    if (raw == null) {
      set({ save: null, loadedSlot: slot, ready: true });
      return null;
    }

    let parsed: VersionedSave | null = null;
    try {
      parsed = JSON.parse(raw) as VersionedSave;
    } catch (e) {
      // save principal ilegível: preserva pra diagnóstico e tenta o backup
      captureError(e, 'game-store-load');
      stashCorrupt(slot, raw);
      const bakRaw = (() => {
        try {
          return localStorage.getItem(slotKey(slot) + '.bak');
        } catch {
          return null;
        }
      })();
      if (bakRaw) {
        try {
          parsed = JSON.parse(bakRaw) as VersionedSave;
        } catch {
          parsed = null;
        }
      }
    }

    if (!parsed) {
      set({ save: null, loadedSlot: slot, ready: true });
      return null;
    }

    const migrated = migrateSave(parsed);
    const hydrated = hydrator(migrated);

    // se a migração mudou o save (v antigo → v atual), persiste já no formato novo
    if (saveVersion(parsed) < SAVE_VERSION) {
      try {
        writeRawSlot(slot, JSON.stringify(hydrated));
      } catch {
        /* re-persist post-migrate é best-effort */
      }
    }

    set({ save: hydrated as GameSave, loadedSlot: slot, ready: true });
    return hydrated as GameSave;
  },

  setSave: (s) => {
    const slot = get().loadedSlot >= 1 ? get().loadedSlot : getActiveSlot();
    if (s == null) {
      set({ save: null, loadedSlot: slot, lastPersistError: null });
      return;
    }
    const stamped = stampVersion(s);
    const res = writeRawSlot(slot, JSON.stringify(stamped));
    set({
      save: stamped,
      loadedSlot: slot,
      lastPersistError: res.ok ? null : (res.error ?? 'persist failed'),
    });
  },

  update: (patch) => {
    const cur = get().save;
    if (!cur) return; // sem save carregado: ignora (não cria do nada)
    const delta = typeof patch === 'function' ? patch(cur) : patch;
    const next = { ...cur, ...delta } as GameSave;
    const stamped = stampVersion(next);
    const slot = get().loadedSlot >= 1 ? get().loadedSlot : getActiveSlot();
    const res = writeRawSlot(slot, JSON.stringify(stamped));
    set({
      save: stamped,
      lastPersistError: res.ok ? null : (res.error ?? 'persist failed'),
    });
  },

  wipeActiveSlot: () => {
    const slot = get().loadedSlot >= 1 ? get().loadedSlot : getActiveSlot();
    wipeRawSlot(slot);
    set({ save: null, lastPersistError: null });
  },

  persistNow: () => {
    const cur = get().save;
    if (!cur) return;
    const slot = get().loadedSlot >= 1 ? get().loadedSlot : getActiveSlot();
    const stamped = stampVersion(cur);
    const res = writeRawSlot(slot, JSON.stringify(stamped));
    set({
      save: stamped,
      lastPersistError: res.ok ? null : (res.error ?? 'persist failed'),
    });
  },
}));

// Helpers de leitura fora-de-componente (ex.: handler de cloud sync, telemetria).
export const getGameSave = (): GameSave | null => useGame.getState().save;
export const getLoadedSlot = (): number => useGame.getState().loadedSlot;
