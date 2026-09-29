/// <reference types="vite/client" />
// [realismo FM] Carregador da base de atributos reais da cena (frente "dados").
//
// A frente de dados entrega `src/data/player-attrs-2026.json` no formato
// `{ [playerId]: PlayerAttrs & { src } }`. Enquanto o arquivo não existir, o
// carregador devolve uma base vazia e todo jogador recebe atributos DERIVADOS
// (engine/attrs/model.ts), que reproduzem exatamente os 5 números atuais.
//
// Funciona nos dois ambientes do projeto:
//   - Vite (navegador e build): `import.meta.glob` resolve o arquivo em tempo de
//     build; arquivo ausente vira `{}` sem quebrar o bundle;
//   - Node (tsx: testes e scripts como o gerador do catálogo do Ultimate): lê do
//     disco se existir — cliente e snapshot do servidor enxergam a MESMA base.
import type { Player, Role, TeamSeason } from '../types';
import { ALL_ATTRS } from '../engine/attributes';
import { HIDDEN_KEYS, attrsOf, legacyFromAttrs, registerAttrs, type PlayerAttrs } from '../engine/attrs/model';

export type PlayerAttrsEntry = PlayerAttrs & { src?: unknown };
export type PlayerAttrsDb = Record<string, PlayerAttrsEntry>;

const FILE = './player-attrs-2026.json';

type FsLike = { existsSync(p: URL): boolean; readFileSync(p: URL, enc: 'utf8'): string };

/** Lê um JSON de atributos do disco (Node); ausente ou ilegível → undefined. */
export function readAttrsFile(url: URL): unknown {
  try {
    const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
    const fs = proc?.getBuiltinModule?.('node:fs') as FsLike | undefined;
    if (!fs || !fs.existsSync(url)) return undefined;
    return JSON.parse(fs.readFileSync(url, 'utf8'));
  } catch {
    return undefined;
  }
}

function loadRaw(): unknown {
  if (import.meta.env) {
    const mods = import.meta.glob('./player-attrs-2026.json', { eager: true, import: 'default' });
    return Object.values(mods)[0];
  }
  return readAttrsFile(new URL(FILE, import.meta.url));
}

const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null;

/** Valida uma entrada: tudo presente e nas escalas FM; senão, descarta (o jogador cai na derivação). */
export function normalizeAttrsEntry(raw: unknown): PlayerAttrsEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || !r.a || typeof r.a !== 'object' || !r.h || typeof r.h !== 'object') return null;
  const ra = r.a as Record<string, unknown>;
  const rh = r.h as Record<string, unknown>;
  const a = {} as PlayerAttrs['a'];
  for (const k of ALL_ATTRS) {
    const v = num(ra[k], 1, 20);
    if (v == null) return null;
    a[k] = v;
  }
  const h = {} as PlayerAttrs['h'];
  for (const k of HIDDEN_KEYS) {
    const v = num(rh[k], 1, 20);
    if (v == null) return null;
    h[k] = v;
  }
  const ca = num(r.ca, 1, 200);
  const pa = num(r.pa, 1, 200);
  if (ca == null || pa == null) return null;
  const out: PlayerAttrsEntry = { v: 1, a, h, ca, pa: Math.max(ca, pa) };
  if (r.src !== undefined) out.src = r.src;
  return out;
}

export function normalizeAttrsDb(raw: unknown): PlayerAttrsDb {
  const out: PlayerAttrsDb = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    const e = normalizeAttrsEntry(entry);
    if (e) out[id] = e;
  }
  return out;
}

/** Base real de atributos (vazia enquanto a frente de dados não entregar o arquivo). */
export const PLAYER_ATTRS_DB: PlayerAttrsDb = normalizeAttrsDb(loadRaw());

/** Atributos de um jogador da base, sem o campo `src` (o save não precisa dele). */
function dbAttrs(db: PlayerAttrsDb, id: string): PlayerAttrs | null {
  const e = db[id];
  if (!e) return null;
  return { v: 1, a: e.a, h: e.h, ca: e.ca, pa: e.pa };
}

/**
 * Materializa os elencos: cada jogador ganha atributos na BASE REGISTRADA (os da
 * base real quando houver; senão derivados com a idade) e os 5 números passam a
 * sair deles. O objeto do jogador NÃO carrega os 28 atributos (torneios e saves
 * guardam cópias dos jogadores; `attrsOf` acha os da base pelo id).
 * `deriveMissing=false` só aplica a base real (elencos históricos: a derivação
 * acontece sob demanda em `attrsOf`, com o mesmo resultado).
 */
export function materializeTeams(
  teams: TeamSeason[],
  db: PlayerAttrsDb,
  ageOf: (p: Player) => number | undefined = () => undefined,
  deriveMissing = true,
): TeamSeason[] {
  return teams.map((t) => ({
    ...t,
    players: t.players.map((p) => {
      const real = dbAttrs(db, p.id);
      if (!real && !deriveMissing) return p;
      const age = ageOf(p);
      const x = real ?? attrsOf({ ...(p as Player & { role: Role }), age: age ?? p.age });
      registerAttrs(p.id, x);
      return real ? { ...p, ...legacyFromAttrs(x) } : p;
    }),
  }));
}
