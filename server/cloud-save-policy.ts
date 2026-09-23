// Regras do save na nuvem que o servidor impõe (O0-29, SEGU-12).
//
// 1) updatedAt do cliente limitado a agora+5min. Antes um push com
//    updatedAt=9e15 (relógio adiantado, lápide do futuro) vencia o LWW pra
//    sempre: toda gravação posterior, de qualquer aparelho, era descartada em
//    silêncio (a resposta dizia ok:true). Linha já envenenada (updated_at além
//    da tolerância) aceita ser sobrescrita — é assim que ela se cura.
// 2) Só slots conhecidos. slot era qualquer string até 40 chars, e cada blob tem
//    até ~2 MB: uma conta paga enchia o Neon com milhares de slots.

export const CLOUD_MAX_FUTURE_MS = 5 * 60_000;

// career (slot 1, legado) e career-2..5 (CAREER_SLOTS=5), career-1 por
// tolerância; rtp e rtp-1..9 (RtP multi-save futuro); online; ultimate.
const SLOT_RE = /^(career(-[1-5])?|rtp(-[1-9])?|online|ultimate)$/;

export function cloudSlotAllowed(slot: string): boolean {
  return SLOT_RE.test(slot);
}

export function clampUpdatedAt(raw: unknown, nowMs: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return nowMs;
  return Math.min(n, nowMs + CLOUD_MAX_FUTURE_MS);
}
