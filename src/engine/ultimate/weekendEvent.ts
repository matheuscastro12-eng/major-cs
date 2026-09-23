// [URG-2] EVENTO DE FIM DE SEMANA — evento AUTOMÁTICO semanal, sem agendamento.
// Toda semana ISO, de sexta 00:00 UTC até domingo 23:59:59 UTC, existe um evento
// determinístico (id `wknd-YYYY-WW`) com regra rotativa (ciclo fixo de 4, por
// `semana % 4`), faixas de coins crescentes e UMA carta exclusiva (Elite/Lendário
// do catálogo, sorteada com o seed da semana) que só sai ali e nunca volta.
//
// Puro: tempo entra por parâmetro (`now` em ms UTC), aleatoriedade via makeRng.
// O catálogo NÃO é importado aqui (o servidor usa o snapshot mensal, o cliente o
// catálogo vivo): quem chama passa os candidatos `{ key, rarity }` e a função
// escolhe sempre a mesma carta pra mesma semana, independente da ordem da lista.
// O servidor mescla este evento nos itens de live-ops quando não existe um item
// manual com o mesmo id (server/weekendEvent.ts) — o dono customiza se quiser.
import { makeRng } from '../rng.js'; // [O0-01] .js obrigatório: o servidor carrega este arquivo em Node ESM puro
import type { EventRule, EventWinTier } from './events.js';

export const WEEKEND_EVENT_PREFIX = 'wknd-';
export const WEEKEND_EVENT_VERSION = 1;
export const WEEKEND_EVENT_MAX_MATCHES = 20;
// faixas crescentes — a MAIOR alcançada paga (padrão do Major da Semana)
export const WEEKEND_EVENT_WIN_TIERS: EventWinTier[] = [
  { wins: 3, credits: 3_000 },
  { wins: 6, credits: 8_000 },
  { wins: 10, credits: 15_000 },
];
// vitórias necessárias pra levar a carta exclusiva (= faixa mais alta)
export const WEEKEND_EVENT_CARD_AT_WINS = 10;
// raridades elegíveis pra carta exclusiva (Ícone fica de fora de propósito)
export const WEEKEND_EXCLUSIVE_RARITIES = ['elite', 'legendary'] as const;

// ciclo fixo de 4 regras, escolhida por `semana ISO % 4`
export interface WeekendRuleSpec { rule: EventRule; name: string; desc: string }
export const WEEKEND_EVENT_RULES: readonly WeekendRuleSpec[] = [
  { rule: { kind: 'ovrcap', max: 82 }, name: 'Fim de Semana 82', desc: 'Só cartas até 82 OVR: o elenco de quem começou agora vale tanto quanto o seu.' },
  { rule: { kind: 'country', country: 'br' }, name: 'Fim de Semana Verde e Amarelo', desc: 'Cinco brasileiros no squad. Nada de gringo neste fim de semana.' },
  { rule: { kind: 'roles', roles: ['IGL', 'AWP'] }, name: 'Fim de Semana Capitão e AWP', desc: 'Squad obrigado a ter um IGL e um AWP de verdade — sem improviso.' },
  { rule: { kind: 'rarity-max', maxTier: 4 }, name: 'Fim de Semana Ouro', desc: 'Raridade até Ouro Raro: sem Elite, sem Lendário, sem Ícone.' },
];

export interface WeekendCardLike { key: string; rarity: string }

export interface ScheduledWeekendEvent {
  id: string;                 // wknd-YYYY-WW (ano e semana ISO)
  isoYear: number;
  isoWeek: number;
  startsAt: number;           // sexta 00:00:00.000 UTC (ms)
  endsAt: number;             // segunda 00:00 UTC (exclusivo) = domingo 23:59:59.999
  version: number;
  name: string;
  desc: string;
  rule: EventRule;
  winTiers: EventWinTier[];
  maxMatches: number;
  cardAtWins: number;
  exclusiveCardKey: string | null; // null quando a lista de candidatos veio vazia
}

const DAY = 86_400_000;
const WEEK = 7 * DAY;

// segunda-feira 00:00 UTC da semana ISO que contém `ms`
function mondayOf(ms: number): number {
  const d = new Date(ms);
  const dayMon0 = (d.getUTCDay() + 6) % 7; // seg=0 … dom=6
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dayMon0 * DAY;
}

// segunda da semana ISO 1 do ano (a semana que contém 4 de janeiro)
function week1MondayOf(isoYear: number): number {
  return mondayOf(Date.UTC(isoYear, 0, 4));
}

// ano/semana ISO da semana cuja segunda é `monday`
function isoWeekOfMonday(monday: number): { isoYear: number; isoWeek: number } {
  const isoYear = new Date(monday + 3 * DAY).getUTCFullYear(); // a quinta decide o ano
  const isoWeek = Math.round((monday - week1MondayOf(isoYear)) / WEEK) + 1;
  return { isoYear, isoWeek };
}

export function weekendEventId(isoYear: number, isoWeek: number): string {
  return `${WEEKEND_EVENT_PREFIX}${isoYear}-${String(isoWeek).padStart(2, '0')}`;
}

// seed da semana — estável entre cliente e servidor
export function weekendSeed(isoYear: number, isoWeek: number): number {
  return (isoYear * 100 + isoWeek) >>> 0;
}

// carta exclusiva da semana: Elite/Lendário, ordem por key (a lista pode vir em
// qualquer ordem), sorteio com o seed da semana. null se não há candidata.
export function weekendExclusiveCardKey(isoYear: number, isoWeek: number, candidates: readonly WeekendCardLike[]): string | null {
  const pool = candidates
    .filter((c) => (WEEKEND_EXCLUSIVE_RARITIES as readonly string[]).includes(c.rarity))
    .map((c) => c.key)
    .sort();
  if (!pool.length) return null;
  const rng = makeRng(weekendSeed(isoYear, isoWeek));
  return pool[Math.floor(rng() * pool.length)];
}

function eventOfMonday(monday: number, candidates: readonly WeekendCardLike[]): ScheduledWeekendEvent {
  const { isoYear, isoWeek } = isoWeekOfMonday(monday);
  const spec = WEEKEND_EVENT_RULES[isoWeek % WEEKEND_EVENT_RULES.length];
  return {
    id: weekendEventId(isoYear, isoWeek),
    isoYear,
    isoWeek,
    startsAt: monday + 4 * DAY,
    endsAt: monday + WEEK,
    version: WEEKEND_EVENT_VERSION,
    name: spec.name,
    desc: spec.desc,
    rule: spec.rule,
    winTiers: WEEKEND_EVENT_WIN_TIERS.map((t) => ({ ...t })),
    maxMatches: WEEKEND_EVENT_MAX_MATCHES,
    cardAtWins: WEEKEND_EVENT_CARD_AT_WINS,
    exclusiveCardKey: weekendExclusiveCardKey(isoYear, isoWeek, candidates),
  };
}

// dentro da janela sex–dom (UTC)?
export function weekendWindowOpen(now: number, ev: Pick<ScheduledWeekendEvent, 'startsAt' | 'endsAt'>): boolean {
  return now >= ev.startsAt && now < ev.endsAt;
}

// o evento da semana ISO corrente se `now` está na janela sex–dom, senão null
export function weekendEventFor(now: number, candidates: readonly WeekendCardLike[] = []): ScheduledWeekendEvent | null {
  const ev = eventOfMonday(mondayOf(now), candidates);
  return weekendWindowOpen(now, ev) ? ev : null;
}

// o PRÓXIMO evento (ou o corrente, se já aberto) — alimenta "começa em Xd Yh"
export function nextWeekendEvent(now: number, candidates: readonly WeekendCardLike[] = []): ScheduledWeekendEvent {
  const monday = mondayOf(now);
  const cur = eventOfMonday(monday, candidates);
  return now < cur.endsAt ? cur : eventOfMonday(monday + WEEK, candidates);
}

// reconstrói o evento pelo id (`wknd-YYYY-WW`), sem depender de `now` — o
// servidor precisa dele pra status/resgate DEPOIS que a janela fechou.
export function weekendEventById(id: string, candidates: readonly WeekendCardLike[] = []): ScheduledWeekendEvent | null {
  const m = /^wknd-(\d{4})-(\d{2})$/.exec(String(id ?? ''));
  if (!m) return null;
  const isoYear = Number(m[1]); const isoWeek = Number(m[2]);
  if (isoYear < 2000 || isoYear > 2999 || isoWeek < 1 || isoWeek > 53) return null;
  const monday = week1MondayOf(isoYear) + (isoWeek - 1) * WEEK;
  const back = isoWeekOfMonday(monday);
  if (back.isoYear !== isoYear || back.isoWeek !== isoWeek) return null; // semana 53 que não existe
  return eventOfMonday(monday, candidates);
}

export function isWeekendEventId(id: string): boolean {
  return /^wknd-\d{4}-\d{2}$/.test(String(id ?? ''));
}

// partes do contador regressivo (a UI formata: "2d 5h", "5h 12m", "12m")
export function countdownParts(ms: number): { d: number; h: number; m: number } {
  const t = Math.max(0, ms);
  return { d: Math.floor(t / DAY), h: Math.floor((t % DAY) / 3_600_000), m: Math.floor((t % 3_600_000) / 60_000) };
}

export function formatCountdown(ms: number): string {
  const { d, h, m } = countdownParts(ms);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
