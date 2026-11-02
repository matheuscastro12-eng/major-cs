// [fase 4 · frente EDITOR] Bases customizadas guardadas no aparelho, FORA do
// save da Carreira: localStorage 'rtm-db-custom-v1' = { v: 1, dbs: CustomDatabase[] }.
// Toda leitura/escrita em try/catch: storage bloqueado, cheio ou adulterado
// nunca quebra o jogo (lê como vazio; escrita falha volta { ok: false }).
// Cada base é revalidada na leitura (validateDatabase) — a lista devolvida só
// tem bases estruturalmente sãs; `ok` diz se a base pode ir para a Carreira.
import type { TeamSeason } from '../types';
import type { CustomDatabase } from '../engine/mundo/model';
import { DB_LIMITS, validateDatabase, type DbValidation } from '../engine/mundo/editor';

export const CUSTOM_DB_KEY = 'rtm-db-custom-v1';

export interface StoredDb { db: CustomDatabase; check: DbValidation }

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Lê as bases do aparelho (validadas). Storage ausente/corrompido → lista vazia. */
export function loadCustomDbs(official: TeamSeason[], st: StorageLike | null = storage()): StoredDb[] {
  if (!st) return [];
  let raw: string | null;
  try { raw = st.getItem(CUSTOM_DB_KEY); } catch { return []; }
  if (!raw || raw.length > DB_LIMITS.importBytes * DB_LIMITS.databases) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const list = parsed && typeof parsed === 'object' && Array.isArray((parsed as { dbs?: unknown }).dbs) ? (parsed as { dbs: unknown[] }).dbs : [];
  const out: StoredDb[] = [];
  const ids = new Set<string>();
  for (const item of list.slice(0, DB_LIMITS.databases)) {
    const check = validateDatabase(item, official);
    if (!check.db || ids.has(check.db.id)) continue;
    ids.add(check.db.id);
    out.push({ db: check.db, check });
  }
  return out;
}

/** Só as bases (sem o diagnóstico) — para a Carreira resolver `mundo.databaseId`. */
export function loadCustomDbList(official: TeamSeason[], st: StorageLike | null = storage()): CustomDatabase[] {
  return loadCustomDbs(official, st).map((x) => x.db);
}

export type SaveDbsResult = { ok: true } | { ok: false; reason: 'no-storage' | 'too-many' | 'quota' };

/** Grava a lista inteira. Nunca lança; espaço cheio volta `quota` (o editor avisa e sugere exportar). */
export function saveCustomDbs(dbs: CustomDatabase[], st: StorageLike | null = storage()): SaveDbsResult {
  if (!st) return { ok: false, reason: 'no-storage' };
  if (dbs.length > DB_LIMITS.databases) return { ok: false, reason: 'too-many' };
  try {
    st.setItem(CUSTOM_DB_KEY, JSON.stringify({ v: 1, dbs }));
    return { ok: true };
  } catch {
    return { ok: false, reason: 'quota' };
  }
}
