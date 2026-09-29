// Relatórios da CSP em modo Report-Only (O1-11/SEGU-17). O navegador manda
// { "csp-report": {...} } (Content-Type application/csp-report) pro report-uri
// do vercel.json, que é o /api/error. Aqui o relatório vira uma linha de
// client_errors (kind 'csp') pro CRM ver o que a política QUEBRARIA antes de
// ela passar a valer de verdade.
//
// Custo Neon: a mesma violação se repete em toda página de todo jogador. Por
// isso cada (diretiva, origem bloqueada) grava no máximo 1x a cada 6h por
// instância — o objetivo é descobrir QUAIS origens faltam, não contar vezes.

export interface CspError { message: string; stack: string; page: string }

const cut = (v: unknown, n: number) => String(v ?? '').slice(0, n);

// só a origem do recurso bloqueado ('inline', 'eval', 'data' ficam como vêm)
function originOf(uri: string): string {
  try { return new URL(uri).origin; } catch { return uri.split(/[?#]/)[0]; }
}

export function cspReportToError(body: Record<string, unknown>): CspError | null {
  const r = body['csp-report'];
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const rep = r as Record<string, unknown>;
  const directive = cut(rep['effective-directive'] ?? rep['violated-directive'], 60).split(' ')[0];
  const blocked = originOf(cut(rep['blocked-uri'], 300)) || 'inline';
  if (!directive) return null;
  return {
    message: `CSP ${directive} bloquearia ${blocked}`.slice(0, 500),
    stack: cut(`${cut(rep['source-file'], 200)}:${cut(rep['line-number'], 8)} · ${cut(rep['script-sample'], 80)}`, 2000),
    page: cut(rep['document-uri'], 300).split(/[?#]/)[0],
  };
}

const CSP_DEDUPE_MS = 6 * 60 * 60_000;
const CSP_DEDUPE_MAX = 500;
const seen = new Map<string, number>();

// true = já gravamos essa violação há pouco nesta instância (não grava de novo)
export function cspSeenRecently(message: string, now = Date.now()): boolean {
  const last = seen.get(message);
  if (last !== undefined && now - last < CSP_DEDUPE_MS) return true;
  if (seen.size >= CSP_DEDUPE_MAX) seen.clear(); // teto de memória: zera e recomeça
  seen.set(message, now);
  return false;
}

export function __resetCspDedupeForTests(): void { seen.clear(); }
