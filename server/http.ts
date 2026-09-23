// Utilitários de resposta das rotas (O0-43/SEGU-16 e O0-36).
import { randomBytes } from 'node:crypto';

type Res = { status: (code: number) => { json: (b: unknown) => void } };

// Corpo JSON do request, ou null se vier inválido. Antes várias rotas faziam
// JSON.parse fora de try: body quebrado virava 500 (e mensagem do runtime).
export function parseJsonBody(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch { return null; }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}

// 500 sem vazar nada interno: o erro completo (mensagem do Postgres, nome de
// tabela, trecho de query) vai só pro log, com um id de correlação curto que o
// jogador pode mandar pro suporte e o dono acha no log da Vercel.
export function internalError(res: Res, error: unknown, scope: string, extra: Record<string, unknown> = {}): void {
  const id = randomBytes(4).toString('hex');
  console.error(`${scope}_failed`, id, error instanceof Error ? (error.stack ?? error.message) : error);
  res.status(500).json({ ...extra, error: 'Erro interno. Tente de novo em instantes.', id });
}
