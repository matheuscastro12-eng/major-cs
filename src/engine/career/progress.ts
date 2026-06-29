export const CAREER_VRS_DECAY = 0.6;

export function applyCareerVrsDecay(current: number, gain: number): number {
  return Math.round(current * CAREER_VRS_DECAY) + gain;
}

export function careerEventKey(split: number, eventInSplit: number | undefined): string {
  return `${Math.max(1, Math.floor(split))}:${Math.max(1, Math.floor(eventInSplit ?? 1))}`;
}
