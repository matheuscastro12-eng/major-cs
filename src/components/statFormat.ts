export function ratingClass(r: number): string {
  if (r >= 1.05) return 'rating-good';
  if (r <= 0.92) return 'rating-bad';
  return 'rating-mid';
}

export function swingFmt(s: number): { text: string; cls: string } {
  const text = `${s >= 0 ? '+' : ''}${s.toFixed(2)}%`;
  return { text, cls: s >= 0.005 ? 'pos' : s <= -0.005 ? 'neg' : 'neutral' };
}
