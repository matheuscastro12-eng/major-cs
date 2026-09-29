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
import {
  HIDDEN_KEYS, LEGACY_KEYS, LEGACY_GROUP_OF, attrsOf, caFromAttrs, fitAttrsToLegacy, legacyFromA, legacyFromAttrs, registerAttrs,
  type LegacyStats, type PlayerAttrs,
} from '../engine/attrs/model';

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

// ─────────────────────────────────────────────────────────────────────────────
// ESCALA DO JOGO (junção frente A × frente B)
//
// A frente de dados gera os 28 atributos numa escala ABSOLUTA da cena inteira
// (tier 1 a 3: base 3,5 + 13·nível, ver docs/realismo-fm-dados.md) e leva os 5
// números dos novatos à escala curada por uma regressão linear. O contrato da
// frente B diz que os 5 números SAEM dos atributos (5 × média do grupo). Lidos
// crus, os atributos reais derrubariam o OVR médio dos pros de 75 para 43 (e o
// preço das cartas em ~90%). Aqui a MESMA regressão (por número legado,
// ajustada nesta base: 5 números curados × 5 números dos atributos crus) leva
// os atributos para a escala do jogo: cada atributo pelo afim do seu grupo (fora
// dos grupos, o afim médio dos grupos gerais) e depois o ajuste exato do
// contrato (`fitAttrsToLegacy`). O nível e o perfil medidos pela frente A ficam;
// só a régua muda. Entradas "legado" já nascem na escala do jogo (derivadas dos
// 5 números) e não passam por aqui.

// awp e igl têm ajuste POR GRUPO DE FUNÇÃO: a estatística pública não enxerga
// chamada (nem AWP de quem não é AWPer) e a regressão única puxaria todo IGL
// para a média; por função, a média curada de cada grupo se mantém.
type ScaleKey = keyof LegacyStats | 'awp:AWP' | 'igl:IGL';
export interface GameScale { c0: Record<ScaleKey, number>; c1: Record<ScaleKey, number>; n: number }
const SCALE_KEYS: ScaleKey[] = [...LEGACY_KEYS, 'awp:AWP', 'igl:IGL'];
const scaleKeyOf = (k: keyof LegacyStats, role: Role): ScaleKey =>
  k === 'awp' && role === 'AWP' ? 'awp:AWP' : k === 'igl' && role === 'IGL' ? 'igl:IGL' : k;
const GENERAL: (keyof LegacyStats)[] = ['aim', 'clutch', 'consistency'];
let GAME_SCALE: GameScale | null = null;

// marcas da escala da cena no `src` da frente A (bo3.gg medido ou estimativa pelo nível)
const onDataScale = (e: PlayerAttrsEntry | undefined): e is PlayerAttrsEntry =>
  !!e && typeof e.src === 'string' && /^(bo3\.gg|estimativa)/.test(e.src);

/** Regressão linear por número legado: curado (JSON) ≈ c0 + c1 · número dos atributos crus. */
export function fitGameScale(teams: TeamSeason[], db: PlayerAttrsDb): GameScale | null {
  const acc = Object.fromEntries(SCALE_KEYS.map((k) => [k, { n: 0, sx: 0, sy: 0, sxx: 0, sxy: 0 }])) as Record<ScaleKey, { n: number; sx: number; sy: number; sxx: number; sxy: number }>;
  let n = 0;
  for (const t of teams) {
    for (const p of t.players) {
      const e = db[p.id];
      if (!onDataScale(e)) continue;
      const l = legacyFromA(e.a);
      n++;
      for (const k of LEGACY_KEYS) {
        const a = acc[scaleKeyOf(k, p.role)], x = l[k], y = p[k];
        a.n++; a.sx += x; a.sy += y; a.sxx += x * x; a.sxy += x * y;
      }
    }
  }
  if (n < 30) return null;
  const c0 = {} as Record<ScaleKey, number>, c1 = {} as Record<ScaleKey, number>;
  for (const k of SCALE_KEYS) {
    const a = acc[k];
    if (a.n < 10) { c0[k] = c0[k.split(':')[0] as ScaleKey] ?? 0; c1[k] = c1[k.split(':')[0] as ScaleKey] ?? 1; continue; }
    const vx = a.sxx - (a.sx * a.sx) / a.n;
    c1[k] = vx > 1e-9 ? (a.sxy - (a.sx * a.sy) / a.n) / vx : 0;
    c0[k] = (a.sy - c1[k] * a.sx) / a.n;
  }
  return { c0, c1, n };
}

/** Leva atributos da escala da cena para a escala do jogo (mesmo nível e perfil, outra régua). */
export function toGameScale(x: PlayerAttrs, role: Role, sc: GameScale): PlayerAttrs {
  const raw = legacyFromA(x.a);
  const target = {} as LegacyStats;
  for (const k of LEGACY_KEYS) { const sk = scaleKeyOf(k, role); target[k] = Math.max(1, Math.min(99, Math.round(sc.c0[sk] + sc.c1[sk] * raw[k]))); }
  const g0 = GENERAL.reduce((s, k) => s + sc.c0[k], 0) / GENERAL.length;
  const g1 = GENERAL.reduce((s, k) => s + sc.c1[k], 0) / GENERAL.length;
  const flavor = {} as PlayerAttrs['a'];
  for (const k of ALL_ATTRS) {
    const g = LEGACY_GROUP_OF[k];
    const sk = g ? scaleKeyOf(g, role) : null;
    flavor[k] = sk ? sc.c0[sk] / 5 + sc.c1[sk] * x.a[k] : g0 / 5 + g1 * x.a[k];
  }
  const a = fitAttrsToLegacy(flavor, target);
  const ca = caFromAttrs(a, role);
  return { v: 1, a, h: x.h, ca, pa: Math.min(200, Math.max(ca, ca + (x.pa - x.ca))) };
}

/** A régua em uso (ajustada na base de 2026 ao materializar). */
export function gameScale(): GameScale | null {
  return GAME_SCALE;
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
  // a régua é ajustada na base canônica (deriveMissing) e reusada nos históricos
  const sc = deriveMissing ? (GAME_SCALE = fitGameScale(teams, db) ?? GAME_SCALE) : GAME_SCALE;
  return teams.map((t) => ({
    ...t,
    players: t.players.map((p) => {
      const stored = dbAttrs(db, p.id);
      const real = stored && sc && onDataScale(db[p.id]) ? toGameScale(stored, p.role, sc) : stored;
      if (!real && !deriveMissing) return p;
      const age = ageOf(p);
      const x = real ?? attrsOf({ ...(p as Player & { role: Role }), age: age ?? p.age });
      registerAttrs(p.id, x);
      return real ? { ...p, ...legacyFromAttrs(x) } : p;
    }),
  }));
}
