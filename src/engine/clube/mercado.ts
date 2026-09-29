// [fase 3 · frente MERCADO] Esqueleto do contrato — a frente de mercado implementa.
import type { MarketState } from './model';

export function defaultMarket(_save?: Record<string, unknown>): MarketState {
  return { v: 1, budgets: {}, incoming: [], rumors: [], loans: [] };
}
