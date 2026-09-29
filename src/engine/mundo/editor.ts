// [fase 4 · frente EDITOR] Editor de base de dados estilo FM.
//
// A base OFICIAL da Carreira é o dataset real (bo3-2026 materializado com os
// atributos da fase 1) + as edições globais do admin (bo3_edits). Uma base
// CUSTOMIZADA (`CustomDatabase`, contrato em model.ts) é um conjunto de
// diferenças aplicado POR CIMA da oficial: edições de jogador (nick, país,
// função, idade, os 28 atributos, os 8 ocultos, PA), edições de time (nome,
// tag, país/região, cores, entrosamento, técnico, elenco por ids), jogadores e
// times novos.
//
// Regras (a base inválida nunca quebra a Carreira):
//   - tudo que entra passa por `validateDatabase`: faixas 1–20 (atributos e
//     ocultos), 1–200 (PA), 15–45 (idade), CA SEMPRE recalculado com
//     caFromAttrs (o CA informado é ignorado), PA ≥ CA, ids únicos e no formato
//     `cdb_p_*`/`cdb_t_*`, elenco editado/novo com 5 a 10 jogadores, nenhum
//     jogador em dois elencos, limites de quantidade e de tamanho;
//   - JSON importado: texto acima de DB_LIMITS.importBytes é recusado antes do
//     parse; chaves como `__proto__` nunca viram propriedade (lookups por Map);
//   - a Carreira só usa base com `ok = true`; senão segue na oficial com aviso.
//
// Este módulo é PURO (sem DOM, sem storage, sem o dataset): quem chama passa a
// lista oficial de times. Assim ele pode entrar no bundle inicial (a migração
// do save v30 chama `defaultDatabaseId`) sem arrastar o JSON da base.
import type { Coach, CoachStyle, Player, Role, TeamSeason } from '../../types';
import type { CustomDatabase, CustomPlayerEdit, CustomTeamEdit, MundoState } from './model';
import { ALL_ATTRS, type AttrKey } from '../attributes';
import { HIDDEN_KEYS, caFromAttrs, withAttrs, type HiddenKey, type PlayerAttrs } from '../attrs/model';

// ─── Limites ───────────────────────────────────────────────────────────────
export const DB_LIMITS = {
  /** texto JSON aceito na importação (caracteres) — recusado antes do parse */
  importBytes: 1_000_000,
  /** base serializada: vai inteira no storage do editor e congelada no save da Carreira */
  storedBytes: 256_000,
  /** bases guardadas no aparelho */
  databases: 5,
  addedPlayers: 300,
  addedTeams: 48,
  playerEdits: 2000,
  teamEdits: 400,
  rosterMin: 5,
  rosterMax: 10,
  nickLen: 24,
  nameLen: 48,
  teamNameLen: 32,
  tagLen: 5,
  dbNameLen: 40,
} as const;

export const CUSTOM_PLAYER_PREFIX = 'cdb_p_';
export const CUSTOM_TEAM_PREFIX = 'cdb_t_';
export const FREE_TEAM_ID = '__free__';
export const RETIRED_TEAM_ID = '__retired__';
export const ROLES: Role[] = ['AWP', 'IGL', 'Entry', 'Rifler', 'Support', 'Lurker'];
export const COACH_STYLES: CoachStyle[] = ['tactical', 'aggressive', 'discipline'];

const PLAYER_ID_RE = /^cdb_p_[a-z0-9_]{1,40}$/;
const TEAM_ID_RE = /^cdb_t_[a-z0-9_]{1,40}$/;
const DB_ID_RE = /^cdb_[a-z0-9_]{1,40}$/;
const CC_RE = /^[a-z]{2}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// A base customizada vive fora do save; a Carreira guarda qual base usou.
// Save migrado (v29 → v30) nasce na oficial.
export function defaultDatabaseId(_save?: Record<string, unknown>): string | null {
  return null;
}

// ─── Diagnóstico ───────────────────────────────────────────────────────────
// `text` é uma frase FIXA em PT (a interface traduz com ct); `ref` diz onde.
export interface DbIssue {
  level: 'error' | 'warning';
  code: string;
  text: string;
  ref?: string;
}
export interface DbValidation {
  ok: boolean;
  db: CustomDatabase | null;
  errors: DbIssue[];
  warnings: DbIssue[];
  bytes: number;
}

class Issues {
  errors: DbIssue[] = [];
  warnings: DbIssue[] = [];
  err(code: string, text: string, ref?: string) { if (this.errors.length < 200) this.errors.push({ level: 'error', code, text, ref }); }
  warn(code: string, text: string, ref?: string) { if (this.warnings.length < 200) this.warnings.push({ level: 'warning', code, text, ref }); }
}

// ─── Sanitizadores ─────────────────────────────────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** entradas próprias de um objeto vindo de JSON, sem chaves perigosas */
function entries(v: unknown): [string, unknown][] {
  if (!isObj(v)) return [];
  return Object.keys(v).filter((k) => !BAD_KEYS.has(k)).map((k) => [k, v[k]]);
}
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u001f\u007f]/g;
function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(CTRL, '').trim();
  return s.length >= 1 && s.length <= max ? s : null;
}
function intIn(v: unknown, lo: number, hi: number): { v: number; ok: boolean } | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return { v: Math.max(lo, Math.min(hi, r)), ok: r >= lo && r <= hi };
}
const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as string[]).includes(v);
const cleanCc = (v: unknown): string | null => (typeof v === 'string' && CC_RE.test(v.toLowerCase()) ? v.toLowerCase() : null);
const isHex = (v: unknown): v is string => typeof v === 'string' && HEX_RE.test(v);

/** CA recalculado dos atributos; PA ≥ CA. É o único construtor de atributos do editor. */
export function makeAttrs(a: Partial<Record<AttrKey, number>>, h: Partial<Record<HiddenKey, number>>, pa: number, role: Role): PlayerAttrs {
  const aa = {} as Record<AttrKey, number>;
  for (const k of ALL_ATTRS) aa[k] = Math.max(1, Math.min(20, Math.round(a[k] ?? 10)));
  const hh = {} as Record<HiddenKey, number>;
  for (const k of HIDDEN_KEYS) hh[k] = Math.max(1, Math.min(20, Math.round(h[k] ?? 10)));
  const ca = caFromAttrs(aa, role);
  const p = Math.max(1, Math.min(200, Math.round(Number.isFinite(pa) ? pa : ca)));
  return { v: 1, a: aa, h: hh, ca, pa: Math.max(ca, p) };
}

function cleanAttrs(raw: unknown, role: Role, ref: string, is: Issues): PlayerAttrs | null {
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.a) || !isObj(raw.h)) { is.err('attrs-shape', 'Atributos incompletos ou em formato inválido', ref); return null; }
  const a = {} as Record<AttrKey, number>;
  const h = {} as Record<HiddenKey, number>;
  let missing = false;
  for (const k of ALL_ATTRS) {
    const n = intIn(raw.a[k], 1, 20);
    if (!n) { is.err('attr-missing', 'Atributo ausente ou não numérico', `${ref} · ${k}`); missing = true; continue; }
    if (!n.ok) is.err('attr-range', 'Atributo fora da faixa 1–20', `${ref} · ${k}`);
    a[k] = n.v;
  }
  for (const k of HIDDEN_KEYS) {
    const n = intIn(raw.h[k], 1, 20);
    if (!n) { is.err('hidden-missing', 'Atributo oculto ausente ou não numérico', `${ref} · ${k}`); missing = true; continue; }
    if (!n.ok) is.err('hidden-range', 'Atributo oculto fora da faixa 1–20', `${ref} · ${k}`);
    h[k] = n.v;
  }
  if (missing) return null;
  const pa = intIn(raw.pa, 1, 200);
  if (!pa) is.err('pa-missing', 'PA ausente ou não numérico', ref);
  else if (!pa.ok) is.err('pa-range', 'PA fora da faixa 1–200', ref);
  const x = makeAttrs(a, h, pa?.v ?? 1, role);
  const caIn = intIn(raw.ca, 1, 200);
  if (caIn && caIn.v !== x.ca) is.warn('ca-recalc', 'CA recalculado a partir dos atributos', ref);
  if (pa && pa.v < x.ca) is.warn('pa-raised', 'PA abaixo do CA: subiu para o CA', ref);
  return x;
}

function cleanCoach(raw: unknown, ref: string, is: Issues): Coach | null {
  if (!isObj(raw)) { is.err('coach-shape', 'Técnico em formato inválido', ref); return null; }
  const nick = cleanStr(raw.nick, DB_LIMITS.nickLen);
  const rating = intIn(raw.rating, 50, 99);
  const style = COACH_STYLES.includes(raw.style as CoachStyle) ? (raw.style as CoachStyle) : null;
  if (!nick) is.err('coach-nick', 'Técnico sem nick', ref);
  if (!rating) is.err('coach-rating', 'Nota do técnico ausente', ref);
  else if (!rating.ok) is.err('coach-rating-range', 'Nota do técnico fora da faixa 50–99', ref);
  if (!style) is.err('coach-style', 'Estilo do técnico inválido', ref);
  if (!nick || !rating || !style) return null;
  return {
    nick,
    name: cleanStr(raw.name, DB_LIMITS.nameLen) ?? nick,
    country: cleanCc(raw.country) ?? '',
    rating: rating.v,
    style,
  };
}

function cleanTeamFields(re: Record<string, unknown>, ref: string, is: Issues, required: boolean): CustomTeamEdit | null {
  const out: CustomTeamEdit = {};
  let bad = false;
  if (re.team !== undefined || required) {
    const v = cleanStr(re.team, DB_LIMITS.teamNameLen);
    if (v) out.team = v; else { is.err('team-name', 'Nome do time vazio ou longo demais', ref); bad = true; }
  }
  if (re.tag !== undefined || required) {
    const v = cleanStr(re.tag, DB_LIMITS.tagLen);
    if (v) out.tag = v.toUpperCase(); else { is.err('team-tag', 'Tag vazia ou com mais de 5 letras', ref); bad = true; }
  }
  if (re.country !== undefined || required) {
    const v = cleanCc(re.country);
    if (v) out.country = v; else { is.err('team-country', 'País inválido (código de 2 letras)', ref); bad = true; }
  }
  if (re.colors !== undefined || required) {
    if (Array.isArray(re.colors) && re.colors.length === 2 && isHex(re.colors[0]) && isHex(re.colors[1])) out.colors = [re.colors[0], re.colors[1]];
    else { is.err('team-colors', 'Cores inválidas (duas cores #RRGGBB)', ref); bad = true; }
  }
  if (re.teamwork !== undefined) {
    const v = intIn(re.teamwork, 40, 95);
    if (!v) { is.err('team-teamwork', 'Entrosamento inválido', ref); bad = true; }
    else { if (!v.ok) is.err('team-teamwork-range', 'Entrosamento fora da faixa 40–95', ref); out.teamwork = v.v; }
  }
  if (re.coach !== undefined || required) {
    const c = cleanCoach(re.coach, ref, is);
    if (c) out.coach = c; else bad = true;
  }
  return bad && required ? null : out;
}

// ─── Base oficial indexada ─────────────────────────────────────────────────
export interface OfficialIndex {
  teams: TeamSeason[];
  teamById: Map<string, TeamSeason>;
  playerById: Map<string, Player>;
  teamOfPlayer: Map<string, string>;
}
const indexCache = new WeakMap<TeamSeason[], OfficialIndex>();
export function indexOfficial(teams: TeamSeason[]): OfficialIndex {
  const hit = indexCache.get(teams);
  if (hit) return hit;
  const teamById = new Map<string, TeamSeason>();
  const playerById = new Map<string, Player>();
  const teamOfPlayer = new Map<string, string>();
  for (const t of teams) {
    teamById.set(t.id, t);
    for (const p of t.players) {
      if (playerById.has(p.id)) continue;
      playerById.set(p.id, p);
      teamOfPlayer.set(p.id, t.id);
    }
  }
  const idx = { teams, teamById, playerById, teamOfPlayer };
  indexCache.set(teams, idx);
  return idx;
}
/** time fora do mundo jogável: não exige elenco mínimo */
export const isSpecialTeam = (t: Pick<TeamSeason, 'id' | 'defunct'>): boolean =>
  t.id === FREE_TEAM_ID || t.id === RETIRED_TEAM_ID || !!t.defunct;

// ─── Elencos resolvidos ────────────────────────────────────────────────────
// Elenco editado vence; quem foi tirado de um elenco e não entrou em outro vira
// free agent (`__free__`); jogador novo sem time também.
export interface RosterResolution {
  rosters: Map<string, string[]>;
  teamOf: Map<string, string>;
}
export function resolveRosters(
  official: TeamSeason[],
  db: Pick<CustomDatabase, 'teamEdits' | 'addedPlayers' | 'addedTeams'>,
  is?: Issues,
): RosterResolution {
  const idx = indexOfficial(official);
  const added = new Map<string, Player>();
  for (const p of db.addedPlayers) added.set(p.id, p);
  const exists = (id: string) => idx.playerById.has(id) || added.has(id);
  const teamIds = [...official.map((t) => t.id), ...db.addedTeams.map((t) => t.id)];
  const editMap = new Map<string, CustomTeamEdit>(entries(db.teamEdits) as [string, CustomTeamEdit][]);
  const claimed = new Map<string, string>();
  const rosters = new Map<string, string[]>();
  // 1) elencos editados (e dos times novos) reivindicam os jogadores
  for (const tid of teamIds) {
    const r = editMap.get(tid)?.roster;
    if (!r || rosters.has(tid)) continue;
    const out: string[] = [];
    for (const pid of r) {
      if (!exists(pid)) { is?.warn('roster-unknown', 'Jogador do elenco não existe na base: ignorado', `${tid} · ${pid}`); continue; }
      const other = claimed.get(pid);
      if (other) { if (other !== tid) is?.err('roster-dup', 'Jogador em dois elencos', `${pid} · ${other} · ${tid}`); continue; }
      claimed.set(pid, tid);
      out.push(pid);
    }
    rosters.set(tid, out);
  }
  // 2) elencos oficiais sem edição perdem quem foi reivindicado
  for (const t of official) {
    if (rosters.has(t.id)) continue;
    const out: string[] = [];
    for (const p of t.players) {
      if (claimed.has(p.id)) continue;
      claimed.set(p.id, t.id);
      out.push(p.id);
    }
    rosters.set(t.id, out);
  }
  for (const t of db.addedTeams) if (!rosters.has(t.id)) rosters.set(t.id, []);
  // 3) sem time → free agent
  const free = rosters.get(FREE_TEAM_ID);
  if (free) {
    for (const p of [...idx.playerById.values(), ...added.values()]) {
      if (claimed.has(p.id)) continue;
      claimed.set(p.id, FREE_TEAM_ID);
      free.push(p.id);
    }
  }
  return { rosters, teamOf: claimed };
}

// ─── Validação ─────────────────────────────────────────────────────────────
export function databaseBytes(db: CustomDatabase): number {
  return JSON.stringify(db).length;
}

/**
 * Valida (e normaliza) uma base vinda de qualquer lugar: storage, save,
 * arquivo importado. `db` volta normalizado (valores cortados às faixas,
 * entradas quebradas descartadas) para o editor mostrar; só `ok` libera o uso
 * na Carreira.
 */
export function validateDatabase(raw: unknown, official: TeamSeason[]): DbValidation {
  const is = new Issues();
  const fail = (code: string, text: string): DbValidation => {
    is.err(code, text);
    return { ok: false, db: null, errors: is.errors, warnings: is.warnings, bytes: 0 };
  };
  if (!isObj(raw)) return fail('shape', 'Arquivo não é uma base do Road to Major');
  if (raw.v !== 1) return fail('version', 'Versão da base não suportada');
  if (raw.basedOn !== undefined && raw.basedOn !== 'official') return fail('based-on', 'Base de origem desconhecida');
  const idx = indexOfficial(official);

  const id = typeof raw.id === 'string' && DB_ID_RE.test(raw.id) ? raw.id : null;
  if (!id) return fail('db-id', 'Identificador da base inválido');
  const name = cleanStr(raw.name, DB_LIMITS.dbNameLen);
  if (!name) is.err('db-name', 'Nome da base vazio ou longo demais');
  const createdAt = typeof raw.createdAt === 'string' && raw.createdAt.length <= 40 ? raw.createdAt : new Date(0).toISOString();
  const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt.length <= 40 ? raw.updatedAt : undefined;

  const rawAddedPlayers = Array.isArray(raw.addedPlayers) ? raw.addedPlayers : raw.addedPlayers === undefined ? [] : null;
  const rawAddedTeams = Array.isArray(raw.addedTeams) ? raw.addedTeams : raw.addedTeams === undefined ? [] : null;
  if (!rawAddedPlayers) is.err('added-players-shape', 'Lista de jogadores novos inválida');
  if (!rawAddedTeams) is.err('added-teams-shape', 'Lista de times novos inválida');
  if (raw.playerEdits !== undefined && !isObj(raw.playerEdits)) is.err('player-edits-shape', 'Edições de jogadores inválidas');
  if (raw.teamEdits !== undefined && !isObj(raw.teamEdits)) is.err('team-edits-shape', 'Edições de times inválidas');
  const pe = entries(raw.playerEdits);
  const te = entries(raw.teamEdits);
  if ((rawAddedPlayers?.length ?? 0) > DB_LIMITS.addedPlayers) return fail('too-many-players', 'Jogadores novos acima do limite');
  if ((rawAddedTeams?.length ?? 0) > DB_LIMITS.addedTeams) return fail('too-many-teams', 'Times novos acima do limite');
  if (pe.length > DB_LIMITS.playerEdits) return fail('too-many-player-edits', 'Edições de jogadores acima do limite');
  if (te.length > DB_LIMITS.teamEdits) return fail('too-many-team-edits', 'Edições de times acima do limite');

  // jogadores novos
  const addedPlayers: Player[] = [];
  const seen = new Set<string>();
  for (const rp of rawAddedPlayers ?? []) {
    if (!isObj(rp)) { is.err('player-shape', 'Jogador novo em formato inválido'); continue; }
    const pid = typeof rp.id === 'string' ? rp.id : '';
    const ref = pid.slice(0, 48) || '?';
    if (!PLAYER_ID_RE.test(pid)) { is.err('player-id', 'Id de jogador novo inválido (use cdb_p_…)', ref); continue; }
    if (seen.has(pid) || idx.playerById.has(pid)) { is.err('player-id-dup', 'Id de jogador repetido', ref); continue; }
    seen.add(pid);
    const nick = cleanStr(rp.nick, DB_LIMITS.nickLen);
    if (!nick) is.err('player-nick', 'Jogador sem nick (ou longo demais)', ref);
    const role = isRole(rp.role) ? rp.role : null;
    if (!role) is.err('player-role', 'Função inválida', ref);
    const age = intIn(rp.age, 15, 45);
    if (!age) is.err('player-age', 'Idade ausente', ref);
    else if (!age.ok) is.err('player-age-range', 'Idade fora da faixa 15–45', ref);
    const country = cleanCc(rp.country);
    if (!country) is.err('player-country', 'País inválido (código de 2 letras)', ref);
    const attrs = cleanAttrs(rp.attrs, role ?? 'Rifler', ref, is);
    if (!nick || !role || !age || !country || !attrs) continue;
    const role2 = isRole(rp.role2) && rp.role2 !== role ? rp.role2 : undefined;
    const base: Player = {
      id: pid, nick, name: cleanStr(rp.name, DB_LIMITS.nameLen) ?? nick, country, role, age: age.v,
      aim: 50, clutch: 50, consistency: 50, awp: 50, igl: 50,
    };
    if (role2) base.role2 = role2;
    addedPlayers.push(withAttrs(base, attrs));
  }
  const addedById = new Map(addedPlayers.map((p) => [p.id, p] as const));

  // times novos
  const addedTeams: TeamSeason[] = [];
  const seenT = new Set<string>();
  for (const rt of rawAddedTeams ?? []) {
    if (!isObj(rt)) { is.err('team-shape', 'Time novo em formato inválido'); continue; }
    const tid = typeof rt.id === 'string' ? rt.id : '';
    const ref = tid.slice(0, 48) || '?';
    if (!TEAM_ID_RE.test(tid)) { is.err('team-id', 'Id de time novo inválido (use cdb_t_…)', ref); continue; }
    if (seenT.has(tid) || idx.teamById.has(tid)) { is.err('team-id-dup', 'Id de time repetido', ref); continue; }
    seenT.add(tid);
    const t = cleanTeamFields(rt, ref, is, true);
    if (!t) continue;
    addedTeams.push({
      id: tid, team: t.team!, tag: t.tag!, country: t.country!, colors: t.colors!, teamwork: t.teamwork ?? 70,
      coach: t.coach!, era: '2026', game: 'CS2', honors: '', mapPrefs: {}, players: [],
    });
  }
  const addedTeamIds = new Set(addedTeams.map((t) => t.id));

  // edições de jogador
  const playerEdits: Record<string, CustomPlayerEdit> = {};
  for (const [pid, re] of pe) {
    const orig = idx.playerById.get(pid) ?? addedById.get(pid);
    if (!orig) { is.warn('edit-unknown-player', 'Edição de jogador que não existe na base: ignorada', pid.slice(0, 48)); continue; }
    if (!isObj(re)) { is.err('player-edit-shape', 'Edição de jogador inválida', pid); continue; }
    const e: CustomPlayerEdit = {};
    if (re.nick !== undefined) { const v = cleanStr(re.nick, DB_LIMITS.nickLen); if (v) e.nick = v; else is.err('player-nick', 'Jogador sem nick (ou longo demais)', pid); }
    if (re.name !== undefined) { const v = cleanStr(re.name, DB_LIMITS.nameLen); if (v) e.name = v; else is.err('player-name', 'Nome inválido', pid); }
    if (re.country !== undefined) { const v = cleanCc(re.country); if (v) e.country = v; else is.err('player-country', 'País inválido (código de 2 letras)', pid); }
    if (re.role !== undefined) { if (isRole(re.role)) e.role = re.role; else is.err('player-role', 'Função inválida', pid); }
    if (re.role2 !== undefined) { if (re.role2 === null || isRole(re.role2)) e.role2 = re.role2 as Role | null; else is.err('player-role2', 'Função secundária inválida', pid); }
    if (re.age !== undefined) {
      const v = intIn(re.age, 15, 45);
      if (!v) is.err('player-age', 'Idade ausente', pid);
      else { if (!v.ok) is.err('player-age-range', 'Idade fora da faixa 15–45', pid); e.age = v.v; }
    }
    if (re.attrs !== undefined) {
      const x = cleanAttrs(re.attrs, e.role ?? orig.role, pid, is);
      if (x) e.attrs = x;
    }
    if (Object.keys(e).length) playerEdits[pid] = e;
  }

  // edições de time
  const teamEdits: Record<string, CustomTeamEdit> = {};
  for (const [tid, re] of te) {
    const orig = idx.teamById.get(tid);
    if (!orig && !addedTeamIds.has(tid)) { is.warn('edit-unknown-team', 'Edição de time que não existe na base: ignorada', tid.slice(0, 48)); continue; }
    if (tid === RETIRED_TEAM_ID) { is.warn('edit-special-team', 'Aposentados não são editáveis: ignorado', tid); continue; }
    if (!isObj(re)) { is.err('team-edit-shape', 'Edição de time inválida', tid); continue; }
    const t = cleanTeamFields(re, tid, is, false);
    if (!t) continue;
    const e: CustomTeamEdit = { ...t };
    if (re.roster !== undefined) {
      if (!Array.isArray(re.roster) || re.roster.length > 2000 || !re.roster.every((x) => typeof x === 'string')) is.err('roster-shape', 'Elenco em formato inválido', tid);
      else e.roster = [...new Set(re.roster as string[])];
    }
    if (Object.keys(e).length) teamEdits[tid] = e;
  }

  const db: CustomDatabase = {
    v: 1, id, name: name ?? 'Base', createdAt, basedOn: 'official',
    playerEdits, teamEdits, addedPlayers, addedTeams,
  };
  if (updatedAt) db.updatedAt = updatedAt;

  // elencos: 5 a 10 nos times editados e novos; ninguém em dois elencos
  const { rosters } = resolveRosters(official, db, is);
  for (const t of [...official, ...addedTeams]) {
    if (isSpecialTeam(t)) continue;
    const r = rosters.get(t.id) ?? [];
    const changed = addedTeamIds.has(t.id) || !!teamEdits[t.id]?.roster || r.length !== t.players.length;
    if (!changed) continue;
    if (r.length < DB_LIMITS.rosterMin) is.err('roster-min', 'Elenco com menos de 5 jogadores', t.id);
    if (r.length > DB_LIMITS.rosterMax) is.err('roster-max', 'Elenco com mais de 10 jogadores', t.id);
  }
  for (const t of addedTeams) if (!teamEdits[t.id]?.roster) is.err('roster-missing', 'Time novo sem elenco', t.id);

  const bytes = databaseBytes(db);
  if (bytes > DB_LIMITS.storedBytes) is.err('too-big', 'Base grande demais (limite de 256 KB)');
  return { ok: is.errors.length === 0, db, errors: is.errors, warnings: is.warnings, bytes };
}

// ─── Aplicação ─────────────────────────────────────────────────────────────
/** Aplica a edição de UM jogador (os 5 números passam a sair dos atributos editados). */
export function applyPlayerEdit(p: Player, e: CustomPlayerEdit | undefined): Player {
  if (!e) return p;
  const np: Player = { ...p };
  if (e.nick) np.nick = e.nick;
  if (e.name) np.name = e.name;
  if (e.country) np.country = e.country;
  if (e.role) np.role = e.role;
  if (e.role2 === null) delete np.role2;
  else if (e.role2) np.role2 = e.role2;
  if (np.role2 === np.role) delete np.role2;
  if (e.age != null) np.age = e.age;
  return e.attrs ? withAttrs(np, e.attrs) : np;
}

const own = <T,>(rec: Record<string, T>, id: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(rec, id) ? rec[id] : undefined;

/**
 * Um jogador da base com a base customizada por cima. A Carreira reaplica
 * depois das edições do admin (applyBo3PlayerEdit) para a customizada vencer.
 */
export function applyCustomPlayer(p: Player, db: CustomDatabase | null | undefined): Player {
  if (!db) return p;
  return applyPlayerEdit(p, own(db.playerEdits, p.id));
}

/**
 * A base customizada por cima de uma lista de times (a oficial, já com as
 * edições do admin). Devolve a lista completa: times oficiais editados, times
 * novos e elencos resolvidos (quem sai de um elenco sem destino vira free agent).
 */
export function applyCustomDatabase(teams: TeamSeason[], db: CustomDatabase | null | undefined): TeamSeason[] {
  if (!db) return teams;
  const pool = new Map<string, Player>();
  for (const t of teams) for (const p of t.players) if (!pool.has(p.id)) pool.set(p.id, applyCustomPlayer(p, db));
  for (const p of db.addedPlayers) pool.set(p.id, applyCustomPlayer(p, db));
  const { rosters } = resolveRosters(teams, db);
  const decorate = (t: TeamSeason): TeamSeason => {
    const e = own(db.teamEdits, t.id);
    const players = (rosters.get(t.id) ?? []).map((id) => pool.get(id)).filter((p): p is Player => !!p);
    if (!e) return { ...t, players };
    return {
      ...t,
      team: e.team ?? t.team,
      tag: e.tag ?? t.tag,
      country: e.country ?? t.country,
      colors: e.colors ?? t.colors,
      teamwork: e.teamwork ?? t.teamwork,
      coach: e.coach ?? t.coach,
      players,
    };
  };
  const out = teams.map(decorate);
  const extra = db.addedTeams.map(decorate);
  const free = out.findIndex((t) => t.id === FREE_TEAM_ID);
  if (free < 0) return [...out, ...extra];
  return [...out.slice(0, free), ...extra, ...out.slice(free)];
}

// ─── Arquivo (exportar/importar) ───────────────────────────────────────────
export function exportDatabaseJson(db: CustomDatabase): string {
  return JSON.stringify(db, null, 1);
}

/**
 * Importa o texto de um arquivo. Texto grande demais é recusado ANTES do
 * parse; JSON quebrado ou base inválida volta com os erros (nada é gravado
 * aqui). Id que já existe no aparelho ganha um novo (`takenIds`).
 */
export function importDatabaseJson(text: unknown, official: TeamSeason[], takenIds: Iterable<string> = [], salt = 'import', nowIso?: string): DbValidation {
  const bad = (code: string, t: string): DbValidation => ({ ok: false, db: null, errors: [{ level: 'error', code, text: t }], warnings: [], bytes: 0 });
  if (typeof text !== 'string') return bad('not-text', 'Arquivo não é texto');
  if (text.length > DB_LIMITS.importBytes) return bad('file-too-big', 'Arquivo grande demais (limite de 1 MB)');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return bad('json', 'JSON inválido'); }
  const v = validateDatabase(raw, official);
  if (!v.db) return v;
  const taken = new Set(takenIds);
  if (taken.has(v.db.id)) {
    v.db = { ...v.db, id: newDatabaseId(taken, `${v.db.id.slice(4)}${salt}`) };
    v.warnings = [...v.warnings, { level: 'warning', code: 'db-id-renamed', text: 'Já existe uma base com esse id: importada como cópia' }];
  }
  if (nowIso) v.db.updatedAt = nowIso;
  return v;
}

// ─── Criação e edição (imutáveis) ──────────────────────────────────────────
// Engine puro: ids e datas vêm de quem chama (`salt` aleatório/tempo na UI,
// fixo nos testes). Id repetido ganha sufixo.
const saltOf = (salt: string) => salt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'x';
function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}
export function newDatabaseId(taken: Iterable<string>, salt: string): string {
  return uniqueId(`cdb_${saltOf(salt)}`, new Set(taken));
}
export function newEntityId(prefix: typeof CUSTOM_PLAYER_PREFIX | typeof CUSTOM_TEAM_PREFIX, taken: Set<string>, salt: string): string {
  return uniqueId(`${prefix}${saltOf(salt)}`, taken);
}

export function emptyDatabase(name: string, taken: Iterable<string>, nowIso: string, salt: string): CustomDatabase {
  return {
    v: 1, id: newDatabaseId(taken, salt), name: (name.replace(CTRL, '').trim() || 'Minha base').slice(0, DB_LIMITS.dbNameLen),
    createdAt: nowIso, updatedAt: nowIso, basedOn: 'official',
    playerEdits: {}, teamEdits: {}, addedPlayers: [], addedTeams: [],
  };
}

/** Grava (ou remove, com `null`) a edição de um jogador. Edição vazia é removida. */
export function withPlayerEdit(db: CustomDatabase, id: string, e: CustomPlayerEdit | null): CustomDatabase {
  const playerEdits = { ...db.playerEdits };
  if (!e || Object.keys(e).length === 0) delete playerEdits[id];
  else playerEdits[id] = e;
  return { ...db, playerEdits };
}
/** Grava (ou remove) a edição de um time. */
export function withTeamEdit(db: CustomDatabase, id: string, e: CustomTeamEdit | null): CustomDatabase {
  const teamEdits = { ...db.teamEdits };
  if (!e || Object.keys(e).length === 0) delete teamEdits[id];
  else teamEdits[id] = e;
  return { ...db, teamEdits };
}

/** Elenco atual (ids) de um time com a base aplicada. */
export function rosterOf(official: TeamSeason[], db: CustomDatabase, teamId: string): string[] {
  return resolveRosters(official, db).rosters.get(teamId) ?? [];
}

/**
 * Leva um jogador para outro time (ou para free agent com `FREE_TEAM_ID`):
 * grava o elenco dos DOIS times, como no FM.
 */
export function movePlayer(official: TeamSeason[], db: CustomDatabase, playerId: string, toTeamId: string): CustomDatabase {
  const { rosters, teamOf } = resolveRosters(official, db);
  const from = teamOf.get(playerId);
  if (from === toTeamId || !rosters.has(toTeamId)) return db;
  let next = db;
  // o mercado livre não precisa de elenco gravado: quem não está em elenco
  // nenhum já cai nele (e quem entra num elenco sai dele)
  if (from && from !== FREE_TEAM_ID) {
    const r = (rosters.get(from) ?? []).filter((id) => id !== playerId);
    next = withTeamEdit(next, from, { ...(own(next.teamEdits, from) ?? {}), roster: r });
  }
  if (toTeamId === FREE_TEAM_ID) return next;
  const to = [...(rosters.get(toTeamId) ?? []).filter((id) => id !== playerId), playerId];
  return withTeamEdit(next, toTeamId, { ...(own(next.teamEdits, toTeamId) ?? {}), roster: to });
}

/** Troca o elenco de um time de uma vez (quem sai vira free agent; quem entra sai do time antigo). */
export function setRoster(official: TeamSeason[], db: CustomDatabase, teamId: string, roster: string[]): CustomDatabase {
  if (teamId === FREE_TEAM_ID) return db;
  const { rosters, teamOf } = resolveRosters(official, db);
  const want = [...new Set(roster)];
  const wanted = new Set(want);
  let next = db;
  const touched = new Set<string>();
  for (const pid of want) {
    const from = teamOf.get(pid);
    if (from && from !== teamId && from !== FREE_TEAM_ID) touched.add(from);
  }
  for (const from of touched) {
    const r = (rosters.get(from) ?? []).filter((id) => !wanted.has(id));
    next = withTeamEdit(next, from, { ...(own(next.teamEdits, from) ?? {}), roster: r });
  }
  return withTeamEdit(next, teamId, { ...(own(next.teamEdits, teamId) ?? {}), roster: want });
}

export function addPlayer(official: TeamSeason[], db: CustomDatabase, p: Player, teamId: string | null): CustomDatabase {
  const next = { ...db, addedPlayers: [...db.addedPlayers.filter((x) => x.id !== p.id), p] };
  return teamId ? movePlayer(official, next, p.id, teamId) : next;
}
/** Apaga um jogador novo (sai de qualquer elenco editado). */
export function removeAddedPlayer(db: CustomDatabase, id: string): CustomDatabase {
  const teamEdits: Record<string, CustomTeamEdit> = {};
  for (const [tid, e] of entries(db.teamEdits) as [string, CustomTeamEdit][]) {
    teamEdits[tid] = e.roster && e.roster.includes(id) ? { ...e, roster: e.roster.filter((x) => x !== id) } : e;
  }
  const playerEdits = { ...db.playerEdits };
  delete playerEdits[id];
  return { ...db, addedPlayers: db.addedPlayers.filter((p) => p.id !== id), teamEdits, playerEdits };
}
export function addTeam(official: TeamSeason[], db: CustomDatabase, t: TeamSeason, roster: string[]): CustomDatabase {
  const next = { ...db, addedTeams: [...db.addedTeams.filter((x) => x.id !== t.id), { ...t, players: [] }] };
  return setRoster(official, next, t.id, roster);
}
/** Apaga um time novo: o elenco dele vira free agent. */
export function removeAddedTeam(db: CustomDatabase, id: string): CustomDatabase {
  const teamEdits = { ...db.teamEdits };
  delete teamEdits[id];
  return { ...db, addedTeams: db.addedTeams.filter((t) => t.id !== id), teamEdits };
}

export interface DatabaseSummary { playerEdits: number; teamEdits: number; addedPlayers: number; addedTeams: number }
export function databaseSummary(db: CustomDatabase): DatabaseSummary {
  return {
    playerEdits: Object.keys(db.playerEdits).length,
    teamEdits: Object.keys(db.teamEdits).length,
    addedPlayers: db.addedPlayers.length,
    addedTeams: db.addedTeams.length,
  };
}

// ─── Carreira ──────────────────────────────────────────────────────────────
// Decisão (base que some): a Carreira CONGELA a base escolhida no save
// (`mundo.database`, validada e ≤ 256 KB), como o FM carrega a base no início.
// Editar ou apagar a base no editor depois NÃO muda a Carreira. Se a cópia do
// save faltar ou não validar (save antigo/adulterado, base oficial mudou), usa
// a do storage com o mesmo id; se nenhuma servir, a Carreira continua na base
// OFICIAL e a tela avisa (status 'missing' / 'invalid').
export type CareerDbStatus = 'official' | 'snapshot' | 'storage' | 'missing' | 'invalid';
export interface CareerDbResolution {
  db: CustomDatabase | null;
  status: CareerDbStatus;
  id: string | null;
  name: string | null;
}
export function resolveCareerDatabase(
  mundo: Pick<MundoState, 'databaseId' | 'database'> | null | undefined,
  official: TeamSeason[],
  stored: CustomDatabase[] = [],
): CareerDbResolution {
  const id = mundo?.databaseId ?? null;
  if (!id) return { db: null, status: 'official', id: null, name: null };
  let invalid = false;
  const snap = mundo?.database;
  let name: string | null = snap && typeof snap.name === 'string' ? snap.name : null;
  if (snap && snap.id === id) {
    const v = validateDatabase(snap, official);
    if (v.ok && v.db) return { db: v.db, status: 'snapshot', id, name: v.db.name };
    invalid = true;
  }
  const st = stored.find((d) => d && d.id === id);
  if (st) {
    name = name ?? st.name;
    const v = validateDatabase(st, official);
    if (v.ok && v.db) return { db: v.db, status: 'storage', id, name: v.db.name };
    invalid = true;
  }
  return { db: null, status: invalid ? 'invalid' : 'missing', id, name };
}

/** Bloco `mundo` com a base escolhida (só na criação da Carreira). */
export function withCareerDatabase<M extends Pick<MundoState, 'databaseId'> & { database?: CustomDatabase | null }>(mundo: M, db: CustomDatabase | null): M {
  return { ...mundo, databaseId: db ? db.id : null, database: db ?? null };
}
