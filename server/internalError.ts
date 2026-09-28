// [O0-43] Resposta 500 sem vazar a mensagem interna (texto do Postgres, stack,
// nome de tabela). O erro completo vai pro log com um id de correlação curto;
// o cliente recebe só a mensagem genérica e o mesmo id — quem reportar o
// problema cita o id e a gente acha a linha no log da Vercel.
//
// console.error (e não console.log): o log de runtime da Vercel classifica por
// stream, e o ERR_MODULE_NOT_FOUND de set/2026 saiu como info e não alertou
// (DADO-M02).
import { randomUUID } from 'node:crypto';

export const INTERNAL_ERROR_MSG = 'Erro interno. Tente de novo em instantes.';

interface JsonRes {
  status: (code: number) => { json: (body: unknown) => void };
}

export function errorId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

// loga e responde 500 { error, id }. Devolve o id (útil em teste).
export function internalError(res: JsonRes, scope: string, e: unknown): string {
  const id = errorId();
  console.error(`[${scope}] erro ${id}:`, e);
  res.status(500).json({ error: INTERNAL_ERROR_MSG, id });
  return id;
}
