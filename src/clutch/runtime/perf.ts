// Medidor de frame time (média móvel de 120 frames + p95) e qualidade adaptativa.
const N = 120;
export const RATIO_STEPS = [1.5, 1.0, 0.75];

export interface Perf {
  frame(ms: number, now: number): void;
  fps(): number; avg(): number; p95(): number;
  /** devolve um novo pixelRatio quando deve mudar, senão null */
  adapt(now: number): number | null;
  ratio(): number;
}

export function createPerf(maxRatio: number): Perf {
  const buf = new Float32Array(N);
  const sorted = new Float32Array(N);
  let i = 0, count = 0, sum = 0;
  let step = RATIO_STEPS.findIndex((r) => r <= maxRatio);
  if (step < 0) step = RATIO_STEPS.length - 1;
  let badSince = -1, goodSince = -1, lastChange = 0;
  const p95 = () => {
    if (!count) return 0;
    sorted.set(buf);
    const view = sorted.subarray(0, count).sort();
    return view[Math.min(count - 1, Math.floor(count * 0.95))];
  };
  return {
    frame(ms) {
      sum -= buf[i]; buf[i] = ms; sum += ms;
      i = (i + 1) % N; count = Math.min(N, count + 1);
    },
    avg: () => (count ? sum / count : 16.7),
    fps() { const a = count ? sum / count : 16.7; return a > 0 ? 1000 / a : 0; },
    p95,
    ratio: () => RATIO_STEPS[step],
    adapt(now) {
      if (count < N || now - lastChange < 2000) return null;
      const p = p95();
      if (p > 20) { if (badSince < 0) badSince = now; goodSince = -1; } else if (p < 12) { if (goodSince < 0) goodSince = now; badSince = -1; } else { badSince = -1; goodSince = -1; }
      if (badSince >= 0 && now - badSince > 2000 && step < RATIO_STEPS.length - 1) {
        step++; lastChange = now; badSince = -1; return RATIO_STEPS[step];
      }
      if (goodSince >= 0 && now - goodSince > 4000 && step > 0 && RATIO_STEPS[step - 1] <= maxRatio) {
        step--; lastChange = now; goodSince = -1; return RATIO_STEPS[step];
      }
      return null;
    },
  };
}
