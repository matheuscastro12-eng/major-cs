export const CAREER_SPLITS_PER_YEAR = 3;

export interface YouthDebut {
  age: number;
  split: number;
}

export function careerYearsAtSplit(split: number): number {
  return Math.floor((Math.max(1, Math.floor(split)) - 1) / CAREER_SPLITS_PER_YEAR);
}

export function ageFromCareerStart(baseAge: number, split: number): number {
  return Math.max(15, Math.round(baseAge) + careerYearsAtSplit(split));
}

export function ageFromDebut(debut: YouthDebut, split: number): number {
  const elapsed = Math.max(0, Math.floor(split) - Math.max(1, Math.floor(debut.split)));
  return Math.max(15, Math.round(debut.age)) + Math.floor(elapsed / CAREER_SPLITS_PER_YEAR);
}

export function youthDebutAtPromotion(age: number, split: number): YouthDebut {
  return {
    age: Math.max(15, Math.min(30, Math.round(age))),
    split: Math.max(1, Math.floor(split)),
  };
}

export function academyAgeAfterSplit(age: number, closingSplit: number): number {
  return Math.max(15, Math.round(age))
    + (Math.max(1, Math.floor(closingSplit)) % CAREER_SPLITS_PER_YEAR === 0 ? 1 : 0);
}

export function legacyYouthBaseAgeAtPromotion(age: number, split: number): number {
  return Math.max(1, Math.round(age) - careerYearsAtSplit(split));
}
