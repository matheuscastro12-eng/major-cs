// STATUS DERIVADO DO JOGADOR (#32 do gap Brasval). Puro, sem React.
//
// A UI de perfil mostrava números crus (fadiga 62, moral 48…) sem semântica.
// Aqui cada eixo vira um TIER com label+cor — legível de relance, no padrão do
// formStatus (engine/career/form.ts) que já existe. Tudo derivado de campos que
// o save já tem: nada novo pra migrar.

import { playerAttributes, type PlayerForAttrs } from '../attributes';

export interface StatusPill {
  tier: string;
  label: string;      // PT-BR pronto (callsite embrulha em ct())
  color: string;      // token CSS
  value: number;      // 0-100 normalizado (pra barra/tooltip)
}

// FÍSICO: prontidão = 100 − fadiga, adoçada pelo nível de fisio/psicólogo.
export function physicalStatus(fatigue: number, physioLevel = 0): StatusPill {
  const readiness = Math.max(0, Math.min(100, Math.round(100 - fatigue + physioLevel * 3)));
  if (readiness >= 85) return { tier: 'fresh', label: 'Descansado', color: 'var(--em-green)', value: readiness };
  if (readiness >= 65) return { tier: 'ok', label: 'Pronto', color: 'var(--em-green)', value: readiness };
  if (readiness >= 45) return { tier: 'tired', label: 'Cansado', color: 'var(--em-gold)', value: readiness };
  if (readiness >= 25) return { tier: 'heavy', label: 'Pesado', color: 'var(--em-red)', value: readiness };
  return { tier: 'burnout', label: 'À beira do burnout', color: 'var(--em-red)', value: readiness };
}

// SATISFAÇÃO (#16): a composta suavizada vira tier.
export function satisfactionStatus(satisfaction: number | undefined): StatusPill {
  const v = Math.max(0, Math.min(100, Math.round(satisfaction ?? 60)));
  if (v >= 80) return { tier: 'delighted', label: 'Muito feliz', color: 'var(--em-green)', value: v };
  if (v >= 60) return { tier: 'content', label: 'Satisfeito', color: 'var(--em-green)', value: v };
  if (v >= 45) return { tier: 'meh', label: 'Morno', color: 'var(--em-gold)', value: v };
  if (v >= 30) return { tier: 'unhappy', label: 'Insatisfeito', color: 'var(--em-red)', value: v };
  return { tier: 'critical', label: 'Zona crítica', color: 'var(--em-red)', value: v };
}

// DISCIPLINA: lê o atributo derivado 1-20 (attributes.ts) do próprio jogador.
export function disciplineStatus(p: PlayerForAttrs): StatusPill {
  const d = playerAttributes(p).discipline;             // 1-20
  const v = Math.round((d / 20) * 100);
  if (d >= 16) return { tier: 'pro', label: 'Profissional exemplar', color: 'var(--em-green)', value: v };
  if (d >= 12) return { tier: 'solid', label: 'Disciplinado', color: 'var(--em-green)', value: v };
  if (d >= 8) return { tier: 'loose', label: 'Oscila', color: 'var(--em-gold)', value: v };
  return { tier: 'wild', label: 'Pavio curto', color: 'var(--em-red)', value: v };
}

// REPUTAÇÃO: derivada de pico de OVR + títulos (#29 dá os títulos contáveis).
export function reputationStatus(peakOvr: number, titles: number): StatusPill {
  const score = peakOvr + Math.min(12, titles * 3);
  const v = Math.max(0, Math.min(100, Math.round((score - 55) * 2.4)));
  if (score >= 90) return { tier: 'world', label: 'Estrela mundial', color: 'var(--em-gold)', value: v };
  if (score >= 82) return { tier: 'continental', label: 'Nome continental', color: 'var(--em-green)', value: v };
  if (score >= 72) return { tier: 'national', label: 'Conhecido na cena', color: 'var(--em-text)', value: v };
  return { tier: 'local', label: 'Prospecto local', color: 'var(--em-muted)', value: v };
}
