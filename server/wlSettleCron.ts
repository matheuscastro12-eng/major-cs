// [O0-22] Fecho AUTOMÁTICO do Major da Semana (Weekend League). Antes o prêmio
// por colocação dependia do dono clicar "FECHAR E PREMIAR" no CRM toda semana
// (ENGA-06) e a tela fechada prometia "prêmios pagos pro top 10". Agora um
// Vercel Cron chama api/cron.ts?job=wl-settle no domingo 00:05 de Brasília
// (03:05 UTC; São Paulo é UTC-3 fixo), 5 minutos depois do fim da janela
// (qua 00:00 → dom 00:00 -03). O wlSettle já é idempotente (op_id
// `wl:<windowId>` por e-mail no ledger): rodar de novo, ou o dono fechar pelo
// CRM antes, nunca paga em dobro.
//
// O vencedor fica sabendo no próximo login: o status do Major da Semana
// devolve `lastSettle` (colocação e coins da última janela fechada, lidos do
// ledger) e o Hub do Ultimate mostra o banner até ele coletar (settleAck).
import { weekendWindowFor, parseWindowId } from './weekend-league.js';
import { applyUltTransaction, type SqlTag } from './ultimate-economy.js';

const DAY_MS = 86_400_000;

// cron da Vercel (UTC): minuto 5, hora 3, domingo = domingo 00:05 em -03
export const WL_SETTLE_CRON = '5 3 * * 0';

// id da janela FECHADA mais recente em `now`. weekendWindowFor devolve a
// janela aberta (qua–sáb) ou a PRÓXIMA (dom–ter); nos dois casos a última
// fechada começou 7 dias antes da quarta que ele aponta.
export function lastClosedWindowId(now: Date): string {
  const cur = weekendWindowFor(now);
  const bounds = parseWindowId(cur.id)!;
  const prev = weekendWindowFor(new Date(bounds.startsAt.getTime() - 7 * DAY_MS));
  return prev.id;
}

export interface WlLastSettle { windowId: string; rank: number; prize: number; at: string }

// o settle paga no LEDGER, mas o save local ainda é a fonte da verdade do
// jogador (reconciliação "local vence", ver src/state/ultimateShadow.ts): o
// cliente precisa creditar o prêmio no save, UMA vez. O "já coletei" mora no
// próprio ledger como op de 0 coins `wlack:<windowId>` (UNIQUE email+op_id):
// trocar de aparelho ou limpar o storage não credita de novo.
const settleOp = (windowId: string) => `wl:${windowId}`;
const ackOp = (windowId: string) => `wlack:${windowId}`;

async function settleRow(sql: SqlTag, email: string, windowId: string) {
  const rows = await sql`SELECT l.credits_delta, l.meta, l.created_at,
      EXISTS (SELECT 1 FROM rtm_ult_ledger a WHERE a.email = l.email AND a.op_id = ${ackOp(windowId)}) AS acked
    FROM rtm_ult_ledger l WHERE l.email=${email} AND l.op_id=${settleOp(windowId)} LIMIT 1`;
  const r = rows[0];
  if (!r) return null;
  const meta = (typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta ?? {}) as Record<string, unknown>;
  // o claim legado por faixa usa o MESMO op_id; só o settle grava rank
  if (meta.source !== 'weekend-league-settle' || !(Number(meta.rank) > 0)) return null;
  const last: WlLastSettle = { windowId, rank: Number(meta.rank), prize: Number(r.credits_delta) || 0, at: new Date(String(r.created_at)).toISOString() };
  return { last, acked: r.acked === true || r.acked === 't' };
}

// prêmio de colocação da última janela fechada AINDA NÃO coletado no save
// (null se não ficou no top 10, se o settle não rodou ou se já coletou).
// 1 query indexada (UNIQUE email+op_id) por status.
export async function wlLastSettleFor(sql: SqlTag, email: string, now: Date): Promise<WlLastSettle | null> {
  const row = await settleRow(sql, email, lastClosedWindowId(now));
  return row && !row.acked ? row.last : null;
}

export type WlSettleAckResult =
  | { ok: true; replayed: boolean; windowId: string; rank: number; prize: number }
  | { ok: false; error: 'bad_window' | 'no_prize' };

// marca o prêmio como coletado no save. replayed=true ⇒ já coletado antes
// (em outro aparelho): o cliente NÃO credita de novo.
export async function wlSettleAck(sql: SqlTag, email: string, windowId: string, now: Date): Promise<WlSettleAckResult> {
  if (windowId !== lastClosedWindowId(now)) return { ok: false, error: 'bad_window' };
  const row = await settleRow(sql, email, windowId);
  if (!row) return { ok: false, error: 'no_prize' };
  const tx = await applyUltTransaction(sql, email, { opId: ackOp(windowId), kind: 'reward', creditsDelta: 0, cards: [], meta: { source: 'weekend-league-settle-ack', windowId, rank: row.last.rank, prize: row.last.prize } });
  return { ok: true, replayed: tx.ok ? tx.replayed : true, windowId, rank: row.last.rank, prize: row.last.prize };
}
