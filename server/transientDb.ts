// [ULT-ON] Falha TRANSITÓRIA do banco: some sozinha se a mesma requisição for
// repetida logo depois. Hoje ela virava 500 "Erro interno" (internalError) e o
// cliente da partida PvP mostrava a mensagem no primeiro poll, antes de o poll
// seguinte passar. Casos: deadlock/serialização/lock (Postgres), statement
// cancelado, conexão do compute do Neon acordando ou caindo, fetch do driver
// HTTP que falhou.
const TRANSIENT_PG_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available
  '57014', // query_canceled (statement_timeout)
  '57P01', // admin_shutdown (compute reiniciando)
  '53300', // too_many_connections
  '08000', '08001', '08003', '08006', // conexão
]);
const TRANSIENT_MSG = /deadlock|could not serialize|concurrently updated|couldn'?t connect to compute|compute node|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|terminating connection|timeout exceeded/i;

export function isTransientDbError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const o = e as { code?: unknown; message?: unknown; cause?: unknown; name?: unknown };
  if (typeof o.code === 'string' && TRANSIENT_PG_CODES.has(o.code)) return true;
  if (o.name === 'TimeoutError' || o.name === 'AbortError') return true;
  if (typeof o.message === 'string' && TRANSIENT_MSG.test(o.message)) return true;
  return o.cause != null && o.cause !== e && isTransientDbError(o.cause);
}

/** Repete `fn` uma vez (com espera curta) quando a falha é transitória. */
export async function withTransientRetry<T>(fn: () => Promise<T>, tries = 2, waitMs = 150): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries || !isTransientDbError(e)) throw e;
      await new Promise((r) => setTimeout(r, waitMs * i));
    }
  }
}

export const BUSY_MSG = 'Servidor ocupado. Tentando de novo…';
