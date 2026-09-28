// Preferências do juice (som + háptico), compartilhadas por sfx, haptics e
// celebrate. Um store mínimo, fora do Zustand de propósito: é preferência do
// aparelho (não do save), precisa existir antes de qualquer tela montar e o
// SoundToggle assina via useSyncExternalStore.
//
// Persistência em localStorage SEMPRE em try/catch (modo privado do Safari,
// storage cheio ou bloqueado lançam). Se o storage falhar, a preferência vale
// só na sessão e o jogo segue normal.
//
// `muted` e `haptics` aceitam `null` = "segue o sistema": com
// prefers-reduced-motion ligado, o padrão é mudo e sem vibração. Uma escolha
// explícita do jogador (true/false) sempre vence o sistema.

export const JUICE_STORAGE_KEY = 'rtm-juice-v1';

export interface JuicePrefs {
  /** null = segue o sistema (mudo se reduced-motion). */
  muted: boolean | null;
  /** Volume global 0..1 (aplicado no ganho mestre do WebAudio). */
  volume: number;
  /** null = segue o sistema (desligado se reduced-motion). */
  haptics: boolean | null;
}

export const DEFAULT_JUICE_PREFS: JuicePrefs = { muted: null, volume: 0.6, haptics: null };

/** Subconjunto do Storage que usamos — facilita teste sem DOM. */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function clampVolume(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_JUICE_PREFS.volume;
  return Math.min(1, Math.max(0, n));
}

function triState(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

/** Lê e sanitiza. JSON inválido, storage que lança ou campo estranho → padrão. */
export function loadJuicePrefs(storage: KVStorage | null | undefined): JuicePrefs {
  if (!storage) return { ...DEFAULT_JUICE_PREFS };
  try {
    const raw = storage.getItem(JUICE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_JUICE_PREFS };
    const obj = JSON.parse(raw) as Partial<Record<keyof JuicePrefs, unknown>> | null;
    if (!obj || typeof obj !== 'object') return { ...DEFAULT_JUICE_PREFS };
    return {
      muted: triState(obj.muted),
      volume: clampVolume(obj.volume),
      haptics: triState(obj.haptics),
    };
  } catch {
    return { ...DEFAULT_JUICE_PREFS };
  }
}

/** Grava. Devolve false se o storage recusou (a preferência fica só em memória). */
export function saveJuicePrefs(storage: KVStorage | null | undefined, prefs: JuicePrefs): boolean {
  if (!storage) return false;
  try {
    storage.setItem(JUICE_STORAGE_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/** Som efetivamente mudo, resolvendo o "segue o sistema". Volume 0 conta como mudo. */
export function isEffectivelyMuted(prefs: JuicePrefs, reducedMotion: boolean): boolean {
  if (prefs.volume <= 0) return true;
  return prefs.muted ?? reducedMotion;
}

/** Háptico efetivamente ligado, resolvendo o "segue o sistema". */
export function isHapticsOn(prefs: JuicePrefs, reducedMotion: boolean): boolean {
  return prefs.haptics ?? !reducedMotion;
}

// ── Ambiente (browser) ─────────────────────────────────────────────────────
// Tudo protegido para rodar em SSR/Node (testes, prerender) sem window.

function browserStorage(): KVStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // acessar window.localStorage já lança com storage bloqueado
  }
}

/** prefers-reduced-motion do sistema. false fora do browser. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ── Store ──────────────────────────────────────────────────────────────────

type Listener = () => void;

export interface JuiceStore {
  get(): JuicePrefs;
  set(patch: Partial<JuicePrefs>): void;
  subscribe(fn: Listener): () => void;
}

/** Fábrica pura (storage injetado) — o singleton abaixo usa o localStorage. */
export function createJuiceStore(storage: KVStorage | null | undefined): JuiceStore {
  let prefs = loadJuicePrefs(storage);
  const listeners = new Set<Listener>();
  return {
    get: () => prefs,
    set(patch) {
      const next: JuicePrefs = {
        muted: patch.muted !== undefined ? triState(patch.muted) : prefs.muted,
        volume: patch.volume !== undefined ? clampVolume(patch.volume) : prefs.volume,
        haptics: patch.haptics !== undefined ? triState(patch.haptics) : prefs.haptics,
      };
      if (next.muted === prefs.muted && next.volume === prefs.volume && next.haptics === prefs.haptics) return;
      prefs = next; // objeto novo: useSyncExternalStore compara por referência
      saveJuicePrefs(storage, prefs);
      listeners.forEach((fn) => fn());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

export const juicePrefs: JuiceStore = createJuiceStore(browserStorage());

/** Atalhos usados pelas telas e pelo SoundToggle. */
export function soundMuted(): boolean {
  return isEffectivelyMuted(juicePrefs.get(), prefersReducedMotion());
}

export function setMuted(muted: boolean): void {
  juicePrefs.set({ muted });
}

export function toggleMuted(): boolean {
  const next = !soundMuted();
  // Desmutar com volume 0 não faria barulho nenhum: volta ao padrão.
  if (!next && juicePrefs.get().volume <= 0) juicePrefs.set({ volume: DEFAULT_JUICE_PREFS.volume });
  juicePrefs.set({ muted: next });
  return next;
}

export function setVolume(volume: number): void {
  juicePrefs.set({ volume });
}

export function setHaptics(on: boolean): void {
  juicePrefs.set({ haptics: on });
}
