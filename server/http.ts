// Utilitários de request das rotas (O0-36).

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

// 500 sem vazar mensagem interna: server/internalError.ts (mesmo helper do lobby/ranking).
