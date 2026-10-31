// Versão do save da Carreira, sem dependências. A cadeia de migrations
// (saveMigrations.ts) importa os motores da Carreira inteiros; o gameStore
// precisa só disto no boot, então a versão mora num módulo próprio.

export const SAVE_VERSION = 30;

// Save é tipado como objeto genérico aqui pra evitar dependência circular com
// CareerSave (definido inline em CareerScreen.tsx hoje). Quando o tipo migrar
// pra `src/types/career.ts` (T1.4), trocar `VersionedSave` pelo tipo real.
export interface VersionedSave {
  _v?: number;
  [key: string]: unknown;
}

// Versão atual de um save. Save legado (sem `_v`) é tratado como v1.
export function saveVersion(save: VersionedSave): number {
  return typeof save._v === 'number' && save._v > 0 ? save._v : 1;
}

// Marca um save em memória como já-versionado (usado por quem cria save NOVO via
// emptySave/setup — o save nasce no SAVE_VERSION atual, não precisa migrar).
export function stampVersion<T extends VersionedSave>(save: T): T {
  // BUG FIX (caça-bugs): usar >= em vez de ===. Um save de versão FUTURA (ex.:
  // sincronizado de um device com client mais novo) não pode ter o _v rebaixado
  // — senão, ao voltar pro client novo, migrateSave re-roda migrations já
  // aplicadas sobre dados no shape novo (dupla aplicação / corrupção).
  if (saveVersion(save) >= SAVE_VERSION) return save;
  return { ...save, _v: SAVE_VERSION };
}
