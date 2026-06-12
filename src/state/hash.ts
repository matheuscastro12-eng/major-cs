// Hash FNV-1a compartilhado (determinístico): usado pelo online (sorteio por
// jogador) e pela carreira (fases/evolução/transferências). UMA implementação
// só, pra nunca divergir entre os modos.
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
