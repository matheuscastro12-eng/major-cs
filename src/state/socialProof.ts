// [paywall v2] Prova social do paywall — SÓ números reais do GET /api/account
// (founders, limit, managers; cache de 60s no servidor). Regra dura: sem dado,
// dado inválido ou zero → a linha some. Nunca número fixo nem "fallback".
import type { FounderStats } from './founders';

export interface SocialProofLines {
  /** "{n} managers já liberaram a vitalícia" (null = esconder) */
  managers: string | null;
  /** "As {limit} vagas de Fundador esgotaram" — só quando founders >= limit */
  soldOut: string | null;
}

const fmtInt = (n: number) => n.toLocaleString('pt-BR');

export function socialProofLines(stats: FounderStats | null | undefined, t: (s: string) => string = (s) => s): SocialProofLines {
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (!stats) return { managers: null, soldOut: null };
  const m = ok(stats.managers) && stats.managers > 0 ? Math.floor(stats.managers) : 0;
  const managers = m > 0
    ? `${fmtInt(m)} ${m === 1 ? t('manager já liberou a vitalícia') : t('managers já liberaram a vitalícia')}`
    : null;
  const soldOut = ok(stats.limit) && stats.limit > 0 && ok(stats.founders) && stats.founders >= stats.limit
    ? `${t('As')} ${fmtInt(stats.limit)} ${t('vagas de Fundador esgotaram')}`
    : null;
  return { managers, soldOut };
}
