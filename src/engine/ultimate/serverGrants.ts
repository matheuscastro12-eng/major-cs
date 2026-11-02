// [UT-PULL] Concessões feitas PELO SERVIDOR (heal/backfill/cortesia do admin)
// que o aparelho nunca viu. A economia do cliente é local e só EMPURRA txs pro
// ledger; a leitura do boot era só diagnóstico — então carta/crédito devolvidos
// direto no banco (sbc_bf_*, gw_*, heal:sbc-credits:*) nunca apareciam no save
// e a ranqueada seguia vendo só as cópias do aparelho.
//
// Aqui só entra o que o servidor marcou como concessão explícita (cartas com
// meta.backfill/goodwill, crédito de op_id 'heal:*' > 0) — nunca o diff inteiro
// (isso ressuscitaria carta vendida/gasta localmente). Idempotente pela marca
// `srv:<id>` em profile.objectivesClaimed (viaja com o save na nuvem).
import { grantCard, type UltimateState } from './state';

export interface ServerGrantCard { cardId: string; cardKey: string; meta?: Record<string, unknown> }
export interface ServerGrantCredit { opId: string; creditsDelta: number }

export function isServerGrantCard(c: ServerGrantCard): boolean {
  const m = c.meta ?? {};
  return m.backfill === true || m.goodwill === true;
}

export function adoptServerGrants(
  state: UltimateState,
  input: { cards: ServerGrantCard[]; credits: ServerGrantCredit[] },
  knownKey: (cardKey: string) => boolean,
): { state: UltimateState; cards: number; credits: number } {
  let s = state;
  const claimed = new Set(s.profile.objectivesClaimed);
  const marks: string[] = [];
  let nCards = 0;
  let nCredits = 0;
  const have = new Set(s.inventory.map((o) => o.id));
  for (const c of input.cards) {
    if (!c.cardId || !isServerGrantCard(c)) continue;
    const mark = `srv:card:${c.cardId}`;
    if (claimed.has(mark) || have.has(c.cardId) || !knownKey(c.cardKey)) continue;
    const via = c.meta?.acquiredVia === 'sbc' ? 'sbc' : 'reward';
    s = grantCard(s, c.cardKey, via, { id: c.cardId });
    have.add(c.cardId);
    claimed.add(mark);
    marks.push(mark);
    nCards++;
  }
  for (const g of input.credits) {
    const d = Math.trunc(Number(g.creditsDelta));
    if (!g.opId.startsWith('heal:') || !(d > 0)) continue;
    const mark = `srv:cr:${g.opId}`;
    if (claimed.has(mark)) continue;
    claimed.add(mark);
    marks.push(mark);
    nCredits += d;
  }
  if (!marks.length) return { state, cards: 0, credits: 0 };
  s = {
    ...s,
    profile: {
      ...s.profile,
      credits: Math.max(0, Math.trunc(s.profile.credits) || 0) + nCredits,
      objectivesClaimed: [...s.profile.objectivesClaimed, ...marks],
    },
  };
  return { state: s, cards: nCards, credits: nCredits };
}
