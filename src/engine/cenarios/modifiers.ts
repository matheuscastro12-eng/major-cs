// Modificadores opcionais: regras que dificultam a campanha e MULTIPLICAM a
// pontuação. Aplicados na largada (filtram elenco/caixa) e conferidos a cada
// registro do log — quebrou a regra uma vez, perde o multiplicador daquele mod.
import type { ModifierDef, ModifierId } from './types.js';

export const MODIFIERS: ModifierDef[] = [
  {
    id: 'sub21', mult: 1.4,
    title: { pt: 'Só sub-21', en: 'Under-21 only', es: 'Solo sub-21' },
    desc: { pt: 'Elenco só com jogadores de até 21 anos. Os veteranos saem na largada.', en: 'Roster with players aged 21 or younger only. Veterans leave at the start.', es: 'Plantilla solo con jugadores de hasta 21 años. Los veteranos salen al inicio.' },
  },
  {
    id: 'zeroBudget', mult: 1.5,
    title: { pt: 'Orçamento zero', en: 'Zero budget', es: 'Presupuesto cero' },
    desc: { pt: 'Começa com o caixa zerado. Cada real vem de premiação e patrocínio.', en: 'Start with an empty bank. Every coin comes from prizes and sponsors.', es: 'Empiezas con la caja vacía. Cada moneda viene de premios y patrocinios.' },
  },
  {
    id: 'national', mult: 1.3,
    title: { pt: 'Time nacional', en: 'National team', es: 'Equipo nacional' },
    desc: { pt: 'Os cinco titulares precisam ser do mesmo país.', en: 'All five starters must share the same nationality.', es: 'Los cinco titulares deben ser del mismo país.' },
  },
];
export const MODIFIER_IDS: ModifierId[] = MODIFIERS.map((m) => m.id);
export const MAX_MULT = 2.5;

export const modifierById = (id: string): ModifierDef | undefined => MODIFIERS.find((m) => m.id === id);

/** Normaliza a lista vinda do save/cliente: só ids válidos, sem repetição, em ordem canônica. */
export function normalizeMods(raw: unknown): ModifierId[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(raw.map(String));
  return MODIFIER_IDS.filter((id) => set.has(id));
}

export function multiplierOf(mods: ModifierId[]): number {
  const m = normalizeMods(mods).reduce((acc, id) => acc * (modifierById(id)?.mult ?? 1), 1);
  return Math.min(MAX_MULT, Math.round(m * 100) / 100);
}

export interface SquadMember { id: string; age: number; country: string }

/** Quais mods o elenco atual QUEBRA (registro do log). */
export function brokenMods(mods: ModifierId[], squad: SquadMember[]): ModifierId[] {
  const out: ModifierId[] = [];
  if (mods.includes('sub21') && squad.some((p) => p.age > 21)) out.push('sub21');
  if (mods.includes('national') && new Set(squad.map((p) => p.country)).size > 1) out.push('national');
  return out;
}

/** País mais comum do elenco (desempate: ordem de aparição). */
export function pluralityCountry(countries: string[]): string | null {
  const n = new Map<string, number>();
  for (const c of countries) n.set(c, (n.get(c) ?? 0) + 1);
  let best: string | null = null; let bn = 0;
  for (const c of countries) { const k = n.get(c) ?? 0; if (k > bn) { best = c; bn = k; } }
  return best;
}

/**
 * Filtra o elenco de largada pelos mods (quem fica). Na idade, a largada usa a
 * idade do split inicial; o mod de idade é conferido a cada split depois (o
 * jogador que faz 22 precisa sair). O mercado da fundação completa as vagas.
 */
export function startingSquad<T extends SquadMember>(mods: ModifierId[], squad: T[]): T[] {
  let s = squad;
  if (mods.includes('sub21')) s = s.filter((p) => p.age <= 21);
  if (mods.includes('national')) {
    const c = pluralityCountry(s.map((p) => p.country));
    s = c ? s.filter((p) => p.country === c) : s;
  }
  return s;
}
