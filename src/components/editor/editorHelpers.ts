// [fase 4 · frente EDITOR] Peças da interface do editor: rótulos, países,
// rascunhos das fichas (jogador/time) e a conversão rascunho → edição mínima
// (só o que difere da base oficial vai para a base customizada).
import type { Coach, CoachStyle, Player, Role, TeamSeason } from '../../types';
import type { CustomDatabase, CustomPlayerEdit, CustomTeamEdit } from '../../engine/mundo/model';
import { ALL_ATTRS, ATTR_LABEL, type AttrKey } from '../../engine/attributes';
import { HIDDEN_KEYS, attrsOf, deriveAttrs, ovrFromAttrs, withAttrs, type HiddenKey, type PlayerAttrs } from '../../engine/attrs/model';
import { makeAttrs, FREE_TEAM_ID } from '../../engine/mundo/editor';
import { baseAge } from '../../engine/career/aiWorld';
import { attrsFromOvr } from '../../state/bo3-edits';
import { macroRegionOf, MACRO_REGION_LABELS, MACRO_REGION_ORDER, type MacroRegion } from '../../data/regions';
import { ct } from '../../state/career-i18n';

export const HIDDEN_LABEL: Record<HiddenKey, string> = {
  bigMatch: 'Jogo grande',
  temperament: 'Temperamento',
  consistencyHidden: 'Regularidade real',
  professionalism: 'Profissionalismo',
  ambition: 'Ambição',
  loyalty: 'Lealdade',
  injuryProneness: 'Propensão a lesão',
  versatility: 'Versatilidade',
};
export const COACH_STYLE_PT: Record<CoachStyle, string> = { tactical: 'Tático', aggressive: 'Agressivo', discipline: 'Disciplinador' };
export const attrLabel = (k: AttrKey) => ct(ATTR_LABEL[k]);
export const hiddenLabel = (k: HiddenKey) => ct(HIDDEN_LABEL[k]);
export const regionLabel = (cc: string): string => {
  const r = macroRegionOf(cc);
  return r ? ct(MACRO_REGION_LABELS[r]) : ct('Internacional');
};

// ─── países ────────────────────────────────────────────────────────────────
let displayNames: Intl.DisplayNames | null | undefined;
export function countryName(cc: string, lang: string): string {
  if (!cc) return '—';
  if (displayNames === undefined) {
    try { displayNames = new Intl.DisplayNames([lang], { type: 'region' }); } catch { displayNames = null; }
  }
  try { return displayNames?.of(cc.toUpperCase()) ?? cc.toUpperCase(); } catch { return cc.toUpperCase(); }
}
/** países que aparecem na base (jogadores e times), agrupados por macro-região */
export function countryOptions(teams: TeamSeason[]): { region: MacroRegion | 'other'; ccs: string[] }[] {
  const set = new Set<string>();
  for (const t of teams) {
    if (/^[a-z]{2}$/.test(t.country)) set.add(t.country);
    for (const p of t.players) if (/^[a-z]{2}$/.test(p.country)) set.add(p.country);
  }
  const groups = new Map<MacroRegion | 'other', string[]>();
  for (const cc of [...set].sort()) {
    const r = macroRegionOf(cc) ?? 'other';
    groups.set(r, [...(groups.get(r) ?? []), cc]);
  }
  return [...MACRO_REGION_ORDER, 'other' as const].filter((r) => groups.has(r)).map((r) => ({ region: r, ccs: groups.get(r)! }));
}

// ─── ficha do jogador ──────────────────────────────────────────────────────
export interface PlayerDraft {
  nick: string;
  name: string;
  country: string;
  age: number;
  role: Role;
  role2: Role | '';
  teamId: string;
  a: Record<AttrKey, number>;
  h: Record<HiddenKey, number>;
  pa: number;
}
export function playerDraft(p: Player, teamId: string): PlayerDraft {
  const x = attrsOf({ ...p, age: baseAge(p) });
  return {
    nick: p.nick, name: p.name, country: p.country, age: baseAge(p), role: p.role, role2: p.role2 ?? '', teamId,
    a: { ...x.a }, h: { ...x.h }, pa: x.pa,
  };
}
export const draftAttrs = (d: PlayerDraft): PlayerAttrs => makeAttrs(d.a, d.h, d.pa, d.role);
export const draftOvr = (d: PlayerDraft): number => ovrFromAttrs(draftAttrs(d));

const sameAttrs = (x: PlayerAttrs, y: PlayerAttrs) =>
  x.pa === y.pa && ALL_ATTRS.every((k) => x.a[k] === y.a[k]) && HIDDEN_KEYS.every((k) => x.h[k] === y.h[k]);

/** Edição mínima de um jogador OFICIAL (só o que difere dele na base oficial). */
export function playerEditFromDraft(orig: Player, d: PlayerDraft): CustomPlayerEdit {
  const e: CustomPlayerEdit = {};
  const nick = d.nick.trim(), name = d.name.trim() || nick;
  if (nick !== orig.nick) e.nick = nick;
  if (name !== orig.name) e.name = name;
  if (d.country !== orig.country) e.country = d.country;
  if (d.role !== orig.role) e.role = d.role;
  if ((d.role2 || '') !== (orig.role2 ?? '')) e.role2 = d.role2 || null;
  // nick novo perde a idade da tabela por nick: a idade vai junto
  if (d.age !== baseAge(orig) || e.nick) e.age = d.age;
  const x = draftAttrs(d);
  if (!sameAttrs(x, attrsOf({ ...orig, age: baseAge(orig) }))) e.attrs = x;
  return e;
}

/** Jogador NOVO a partir do rascunho (atributos são a fonte; os 5 números saem deles). */
export function playerFromDraft(id: string, d: PlayerDraft): Player {
  const nick = d.nick.trim();
  const p: Player = {
    id, nick, name: d.name.trim() || nick, country: d.country, role: d.role, age: d.age,
    aim: 50, clutch: 50, consistency: 50, awp: 50, igl: 50,
  };
  if (d.role2 && d.role2 !== d.role) p.role2 = d.role2;
  return withAttrs(p, draftAttrs(d));
}

/** Jogador gerado (perfil coerente com a função, pela derivação calibrada da fase 1). */
export function generatedPlayer(id: string, nick: string, role: Role, ovr: number, age: number, country: string): Player {
  const p: Player = { id, nick, name: nick, country, role, age, ...attrsFromOvr(ovr, role) };
  return withAttrs(p, deriveAttrs({ ...p }));
}

// ─── ficha do time ─────────────────────────────────────────────────────────
export interface TeamDraft {
  team: string;
  tag: string;
  country: string;
  colors: [string, string];
  teamwork: number;
  coach: Coach;
  roster: string[];
}
export function teamDraft(t: TeamSeason): TeamDraft {
  return {
    team: t.team, tag: t.tag, country: t.country, colors: [t.colors[0], t.colors[1]], teamwork: t.teamwork,
    coach: { ...t.coach }, roster: t.players.map((p) => p.id),
  };
}
const sameCoach = (a: Coach, b: Coach) => a.nick === b.nick && a.name === b.name && a.country === b.country && a.rating === b.rating && a.style === b.style;
/** Campos do time (sem o elenco) que diferem do oficial. */
export function teamFieldsFromDraft(orig: TeamSeason | undefined, d: TeamDraft): CustomTeamEdit {
  const e: CustomTeamEdit = {};
  const team = d.team.trim(), tag = d.tag.trim().toUpperCase();
  const coach: Coach = { ...d.coach, nick: d.coach.nick.trim(), name: d.coach.name.trim() || d.coach.nick.trim() };
  if (!orig || team !== orig.team) e.team = team;
  if (!orig || tag !== orig.tag) e.tag = tag;
  if (!orig || d.country !== orig.country) e.country = d.country;
  if (!orig || d.colors[0] !== orig.colors[0] || d.colors[1] !== orig.colors[1]) e.colors = [d.colors[0], d.colors[1]];
  if (!orig || d.teamwork !== orig.teamwork) e.teamwork = d.teamwork;
  if (!orig || !sameCoach(coach, orig.coach)) e.coach = coach;
  return e;
}

// ─── diff de validação (só o que o rascunho piorou) ────────────────────────
export const issueKey = (i: { code: string; ref?: string }) => `${i.code}|${i.ref ?? ''}`;

export const isFree = (teamId: string) => teamId === FREE_TEAM_ID;
export const clampInt = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo);
export const hasEdits = (db: CustomDatabase, id: string) => Object.prototype.hasOwnProperty.call(db.playerEdits, id);
