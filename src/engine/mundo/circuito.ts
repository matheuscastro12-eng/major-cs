// [fase 4 · frente CIRCUITO] Esqueleto do contrato — a frente de circuito implementa.
import type { CalendarEvent, WorldEventResult, VrsEntry } from './model';

// Vazio = a Carreira segue com o circuito atual (neutro até a frente plugar).
export function defaultCalendar(_save?: Record<string, unknown>): CalendarEvent[] { return []; }
export function defaultResults(_save?: Record<string, unknown>): WorldEventResult[] { return []; }
export function defaultVrs(_save?: Record<string, unknown>): Record<string, VrsEntry> { return {}; }
