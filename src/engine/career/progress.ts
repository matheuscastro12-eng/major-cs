export const CAREER_VRS_DECAY = 0.6;

export function applyCareerVrsDecay(current: number, gain: number): number {
  return Math.round(current * CAREER_VRS_DECAY) + gain;
}

export function careerEventKey(split: number, eventInSplit: number | undefined): string {
  return `${Math.max(1, Math.floor(split))}:${Math.max(1, Math.floor(eventInSplit ?? 1))}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MUNDO VIVO DO VRS
//
// O ranking do jogador sempre foi "real": VRS rolante que DECAI a cada split e
// só se sustenta com resultado recente (applyCareerVrsDecay). O dos rivais, não:
// era `vrsCore(teamwork) + hash(id)` — um número CONGELADO. Na prática o mundo
// era uma tabela estática e só o jogador se mexia: passar do #12 pro #11 era
// atravessar uma placa, não ganhar de alguém.
//
// Aqui os rivais ganham o MESMO mecanismo: cada org tem um rolante próprio, que
// sobe quando ela vai bem num split e decai quando não vai. Consequências que
// fazem o ranking parecer o VRS de verdade:
//   • a elite TROCA de posição entre splits (ninguém fica #1 por inércia);
//   • uma org do miolo tem um split de explosão e some do radar depois;
//   • ficar parado te faz CAIR mesmo sem perder — porque os outros somaram;
//   • quem você ultrapassa depende de quando você ultrapassa.
//
// Determinístico e SEM ESTADO NOVO: é função pura de (id da org, split), então
// o mesmo save mostra sempre o mesmo mundo, sem migração e sem inchar o save.

/** Janela de splits que ainda pesa no rolante (0.6^5 ≈ 0.08 — além disso é ruído). */
export const AI_VRS_WINDOW = 5;

// hash determinístico 32-bit (FNV-1a) — mesma família do resto do projeto.
function h32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Quanto a org somou de VRS NAQUELE split (0..1 de qualidade × escala da força).
 *
 * A força entra como VIÉS, não como garantia: time forte vai bem com mais
 * frequência, mas o sorteio permite o split ruim da elite e a explosão do
 * azarão — que é exatamente o que faz um ranking parecer vivo. O piso 0.15
 * evita que uma org suma completamente por azar.
 */
export function aiSplitGain(teamId: string, coreVrs: number, split: number): number {
  const roll = (h32(`${teamId}|vrs|${split}`) % 1000) / 1000; // 0..1 estável
  const strength = Math.max(0, Math.min(1, coreVrs / 900)); // ~0 (fraco) .. 1 (elite)
  // mistura sorteio com força: 55% acaso, 45% qualidade
  const quality = 0.15 + 0.85 * (roll * 0.55 + strength * 0.45);
  // escala: um split excelente de um time de elite vale ~150 (mesma ordem do
  // VRS_BY_POS de um título), então o topo se mexe de verdade entre splits.
  return Math.round(quality * (60 + strength * 120));
}

/**
 * Rolante da org no split dado: soma decaída dos ganhos dos últimos splits.
 * Espelha a régua do jogador (mesmo CAREER_VRS_DECAY) — os dois lados do
 * ranking envelhecem igual, que é o ponto do VRS real.
 */
export function aiRollingVrs(teamId: string, coreVrs: number, split: number): number {
  const s = Math.max(1, Math.floor(split));
  let total = 0;
  for (let k = 0; k < AI_VRS_WINDOW; k++) {
    const past = s - k;
    if (past < 1) break;
    total += Math.pow(CAREER_VRS_DECAY, k) * aiSplitGain(teamId, coreVrs, past);
  }
  return Math.round(total);
}
