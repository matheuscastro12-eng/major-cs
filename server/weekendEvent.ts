// [URG-2] EVENTO DE FIM DE SEMANA no servidor — mescla o evento automático da
// semana (src/engine/ultimate/weekendEvent.ts) nos itens de live-ops e resolve
// a definição por id pra status/resgate/fila SEM nada agendado no rtm_liveops.
//
// Regra da mescla: um item MANUAL com o mesmo id (`wknd-YYYY-WW`) no rtm_liveops
// sobrescreve o automático — é assim que o dono customiza (regra, prêmios, carta).
// Módulo puro: `now` e o catálogo entram por parâmetro; os wrappers do fim usam
// o snapshot mensal do servidor (serverCatalogAt) do mês da SEXTA do evento.
import {
  isWeekendEventId, weekendEventById, weekendEventFor,
  type ScheduledWeekendEvent, type WeekendCardLike,
} from '../src/engine/ultimate/weekendEvent.js';
import type { LiveopsEventPayload, LiveopsRow } from './liveops.js';
import { serverCatalogAt } from './ultimate-pack.js';

export type WeekendCatalogFor = (startsAtMs: number) => readonly WeekendCardLike[];

// payload no MESMO formato do item de live-ops kind 'event' (validado por validateEventPayload)
export function weekendEventPayload(ev: ScheduledWeekendEvent): LiveopsEventPayload {
  return {
    version: ev.version,
    name: ev.name,
    desc: ev.desc,
    rule: ev.rule,
    winTiers: ev.winTiers.map((t) => ({ ...t })),
    maxMatches: ev.maxMatches,
    cardAtWins: ev.cardAtWins,
    ...(ev.exclusiveCardKey ? { exclusiveCardKey: ev.exclusiveCardKey } : {}),
  };
}

export function weekendLiveopsRow(ev: ScheduledWeekendEvent): LiveopsRow {
  return {
    id: ev.id,
    kind: 'event',
    payload: weekendEventPayload(ev),
    startsAt: new Date(ev.startsAt).toISOString(),
    endsAt: new Date(ev.endsAt).toISOString(),
    enabled: true,
    createdBy: 'auto',
    updatedAt: new Date(ev.startsAt).toISOString(),
  };
}

// mescla: se estamos na janela sex–dom e NÃO existe item com o mesmo id, o
// automático entra no fim da lista (os manuais continuam na ordem do banco).
export function mergeWeekendEvent(rows: LiveopsRow[], now: Date, catalogFor: WeekendCatalogFor): LiveopsRow[] {
  const probe = weekendEventFor(now.getTime());
  if (!probe) return rows;
  if (rows.some((r) => r.id === probe.id)) return rows;
  const ev = weekendEventFor(now.getTime(), catalogFor(probe.startsAt));
  return ev ? [...rows, weekendLiveopsRow(ev)] : rows;
}

// definição do evento automático por id (com a carta do snapshot do mês da sexta);
// null se o id não é de fim de semana ou a semana não existe.
export function weekendEventDefById(id: string, catalogFor: WeekendCatalogFor): ScheduledWeekendEvent | null {
  if (!isWeekendEventId(id)) return null;
  const probe = weekendEventById(id);
  if (!probe) return null;
  return weekendEventById(id, catalogFor(probe.startsAt));
}

// ---------------------------------------------------------------- wrappers
// (as rotas usam estes; o catálogo é o snapshot mensal do servidor)

export const serverWeekendCatalog: WeekendCatalogFor = (startsAtMs) => serverCatalogAt(new Date(startsAtMs));

// evento automático pelo id, mesmo com a janela já fechada (status/resgate)
export function weekendEventDef(id: string): ScheduledWeekendEvent | null {
  return weekendEventDefById(id, serverWeekendCatalog);
}

// evento automático pelo id SÓ se a janela está aberta agora (fila/pick)
export function activeWeekendEventDef(id: string, now: Date = new Date()): ScheduledWeekendEvent | null {
  const ev = weekendEventDef(id);
  return ev && now.getTime() >= ev.startsAt && now.getTime() < ev.endsAt ? ev : null;
}
