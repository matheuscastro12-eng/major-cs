// Registry de migrations do save de carreira.
//
// SAVE_VERSION é incrementado a cada mudança de SCHEMA do save. Toda migration
// recebe um save no formato vX e devolve no vX+1. O save guarda a sua própria
// versão no campo `_v` (0/undefined = v1 legado, pré-registry).
//
// Política de saves: **backfill obrigatório**. Save antigo abre, roda em cadeia
// pelas migrations até chegar em SAVE_VERSION, persiste no formato novo. Nunca
// quebra um save existente.
//
// Como adicionar uma migration nova (passo a passo):
//   1. SAVE_VERSION += 1
//   2. MIGRATIONS[N] = (save) => ({ ...save, /* derivações */, _v: N+1 })
//   3. Comentar a migration na linha explicando O QUÊ e PORQUÊ
//   4. Testar abrindo um save criado N versões atrás → todas rodam em cascata
//
// Convenção: a migration N leva DE v(N) PARA v(N+1). MIGRATIONS[1] roda em
// save v1, devolve v2; MIGRATIONS[2] roda em save v2, devolve v3; etc.

export const SAVE_VERSION = 12;

// Save é tipado como objeto genérico aqui pra evitar dependência circular com
// CareerSave (definido inline em CareerScreen.tsx hoje). Quando o tipo migrar
// pra `src/types/career.ts` (T1.4), trocar `VersionedSave` pelo tipo real.
export interface VersionedSave {
  _v?: number;
  [key: string]: unknown;
}

type Migration = (save: VersionedSave) => VersionedSave;

const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2: estampa `_v: 2` no save. Identidade no shape — é só o marco de
  // "este save passou pelo registry". A partir de v2 toda mudança de schema
  // entra como migration formal.
  1: (save) => ({ ...save, _v: 2 }),
  // v2 → v3 (T3.5 sponsors): garante a estrutura nova do sistema de
  // patrocinadores. Saves antigos podem ter `sponsors:string[]` (legado) e
  // `sponsorUntil:Record<string,number>` (legado) — só normalizamos defaults.
  //   - sponsors: array de ids preservado se já existe; senão []
  //   - sponsorUntil: idem; senão {}
  //   - pendingSponsorOffer: null (campo NOVO; estampa nulo)
  //   - sponsorCooldown: {} (campo NOVO)
  // Backfill conservador: nada é REMOVIDO; só adiciona o que falta.
  2: (save) => ({
    ...save,
    sponsors: Array.isArray(save.sponsors) ? save.sponsors : [],
    sponsorUntil:
      save.sponsorUntil && typeof save.sponsorUntil === 'object'
        ? save.sponsorUntil
        : {},
    pendingSponsorOffer: save.pendingSponsorOffer ?? null,
    sponsorCooldown:
      save.sponsorCooldown && typeof save.sponsorCooldown === 'object'
        ? save.sponsorCooldown
        : {},
    _v: 3,
  }),
  // v3 → v4 (T3.6 team events): adiciona pendingTeamEvent e
  // resolvedTeamEvents. Saves antigos abrem normais — só estampa nulo/[].
  3: (save) => ({
    ...save,
    pendingTeamEvent: save.pendingTeamEvent ?? null,
    resolvedTeamEvents: Array.isArray(save.resolvedTeamEvents)
      ? save.resolvedTeamEvents
      : [],
    _v: 4,
  }),
  // v4 → v5 (T3.10 year-end awards): adiciona pendingYearAwards e
  // yearAwardsHistory. Backfill nulo/[].
  4: (save) => ({
    ...save,
    pendingYearAwards: save.pendingYearAwards ?? null,
    yearAwardsHistory: Array.isArray(save.yearAwardsHistory)
      ? save.yearAwardsHistory
      : [],
    _v: 5,
  }),
  // v5 → v6 (T3.7 player talks): adiciona lastTalkAt por player (cooldown
  // de conversa, 1 por player por split + 1).
  5: (save) => ({
    ...save,
    lastTalkAt:
      save.lastTalkAt && typeof save.lastTalkAt === 'object'
        ? save.lastTalkAt
        : {},
    _v: 6,
  }),
  // v6 → v7 (T3.4 chemistry): adiciona pairChem (Record<pairKey, number>).
  // Default ausência = 30 (engine trata lazy). Saves antigos abrem normais.
  6: (save) => ({
    ...save,
    pairChem:
      save.pairChem && typeof save.pairChem === 'object'
        ? save.pairChem
        : {},
    _v: 7,
  }),
  // v7 → v8 (T3.11 coach career): adiciona coachStints[]. Backfill conservador
  // = array vazio. O CareerScreen detecta "coachFromId mas sem stint ativo" e
  // estampa stint zerada no próximo split — mantém histórico daqui pra frente
  // sem inventar passado.
  7: (save) => ({
    ...save,
    coachStints: Array.isArray(save.coachStints) ? save.coachStints : [],
    _v: 8,
  }),
  // v8 → v9 (T3.9 aging): adiciona retired[] e lastRetirees[] pra news.
  // Backfill vazio. Players envelhecem dinâmicamente daqui pra frente.
  8: (save) => ({
    ...save,
    retired: Array.isArray(save.retired) ? save.retired : [],
    lastRetirees: Array.isArray(save.lastRetirees) ? save.lastRetirees : [],
    _v: 9,
  }),
  // v9 → v10 (T3.8 scrim): adiciona scrimsThisSplit (counter resetado a cada
  // virada de split). Backfill 0 = sem scrims usadas no split atual.
  9: (save) => ({
    ...save,
    scrimsThisSplit: typeof save.scrimsThisSplit === 'number' ? save.scrimsThisSplit : 0,
    _v: 10,
  }),
  // v10 → v11 (T3.12 scouting): adiciona hiredScoutId (null) + scoutReports[].
  10: (save) => ({
    ...save,
    hiredScoutId: typeof save.hiredScoutId === 'string' ? save.hiredScoutId : null,
    scoutReports: Array.isArray(save.scoutReports) ? save.scoutReports : [],
    _v: 11,
  }),
  // v11 → v12 (mercado vivo): adiciona aiDrift (teamId → delta de teamwork
  // acumulado, clampado ±6). Faz os times da IA SUBIREM/CAÍREM de força ao
  // longo dos anos conforme a forma sustentada. Backfill {} = nenhum drift
  // (mundo idêntico ao de hoje pra saves existentes; o drift começa do zero).
  11: (save) => ({
    ...save,
    aiDrift: save.aiDrift && typeof save.aiDrift === 'object' ? save.aiDrift : {},
    _v: 12,
  }),
};

// Versão atual de um save. Save legado (sem `_v`) é tratado como v1.
export function saveVersion(save: VersionedSave): number {
  return typeof save._v === 'number' && save._v > 0 ? save._v : 1;
}

// Aplica migrations em cadeia até SAVE_VERSION. Idempotente: já-migrado vira no-op.
// Fail-safe contra migration que esquece de bumpar `_v` (força bump pra não loop).
export function migrateSave(raw: VersionedSave): VersionedSave {
  let cur = raw;
  let v = saveVersion(cur);
  while (v < SAVE_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) {
      // gap no registry — não deveria acontecer; força para SAVE_VERSION pra não loop
      cur = { ...cur, _v: SAVE_VERSION };
      break;
    }
    cur = fn(cur);
    const next = saveVersion(cur);
    if (next <= v) {
      // migration não bumpou: fail-safe estampa próxima versão e segue
      cur = { ...cur, _v: v + 1 };
    }
    v = saveVersion(cur);
  }
  return cur;
}

// Helper: lê JSON cru → parse → migra. Devolve null se raw==null ou JSON inválido
// (sem throw — quem chama trata fallback). `hydrate` (opcional) aplica defaults e
// sanity específicos do consumidor (ex.: `emptySave()` merge do CareerScreen) DEPOIS
// das migrations.
export function readAndMigrate<T = VersionedSave>(
  raw: string | null,
  hydrate?: (parsed: VersionedSave) => T,
): T | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as VersionedSave;
    const migrated = migrateSave(parsed);
    return hydrate ? hydrate(migrated) : (migrated as unknown as T);
  } catch {
    return null;
  }
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
