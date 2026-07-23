// Lendas geracionais (#49 do gap Brasval): reconhecimento visual/narrativo de
// craques por PICO de carreira (peakOvr). Bandas calibradas pro nosso range de
// OVR CS2 (topo real ~96: ZywOo 96, donk 95 — os GOATs do dataset). A fase
// "legacy" (OVR atual abaixo do pico) troca a copy pro passado — o veterano em
// declínio vira "foi um dos maiores" em vez de "é". Puro, sem React.

export type LegendTier = 'rising' | 'great' | 'legend' | 'goat';

export interface LegendStatus {
  tier: LegendTier;
  legacy: boolean;   // já passou do pico (ovr atual < peakOvr)
  label: string;     // PT-BR pronto pra UI
  desc: string;      // frase curta de aura (perfil)
}

// pico mínimo pra ter QUALQUER aura — abaixo disso o jogador é só um bom pro
export const LEGEND_MIN_PEAK = 80;

export function legendTier(peak: number): LegendTier | null {
  if (peak >= 95) return 'goat';
  if (peak >= 91) return 'legend';
  if (peak >= 87) return 'great';
  if (peak >= LEGEND_MIN_PEAK) return 'rising';
  return null;
}

const COPY: Record<LegendTier, { active: [string, string]; legacy: [string, string] }> = {
  rising: {
    active: ['Em ascensão', 'Nome que a cena já acompanha de perto.'],
    legacy: ['Boa geração', 'Teve seu momento entre os bons da cena.'],
  },
  great: {
    active: ['Craque da geração', 'Decide séries grandes — top do circuito.'],
    legacy: ['Foi craque', 'Já esteve entre os melhores do circuito.'],
  },
  legend: {
    active: ['LENDA', 'Um dos melhores do mundo — presença de Major.'],
    legacy: ['Lenda viva', 'Marcou época entre os melhores do mundo.'],
  },
  goat: {
    active: ['GOAT', 'O teto da era. Referência absoluta do jogo.'],
    legacy: ['GOAT de era', 'Definiu uma era inteira do CS.'],
  },
};

/** Status de lenda a partir do OVR atual e do pico. null = sem aura. */
export function legendStatus(ovr: number, peakOvr: number | undefined): LegendStatus | null {
  const peak = Math.max(peakOvr ?? 0, ovr);
  const tier = legendTier(peak);
  if (!tier) return null;
  const legacy = ovr < peak - 1; // 1 ponto de folga: oscilação normal não vira "declínio"
  const [label, desc] = legacy ? COPY[tier].legacy : COPY[tier].active;
  return { tier, legacy, label, desc };
}
