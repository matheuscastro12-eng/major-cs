// Recoil determinístico: 30 offsets (sobe, depois oscila na horizontal).
// Valores em radianos: pitch positivo = para cima.
export const RECOVERY_S = 0.35;

export const RECOIL_PATTERN: { pitch: number; yaw: number }[] = Array.from({ length: 30 }, (_, i) => {
  const climb = Math.min(i, 9);
  const pitch = 0.0045 * climb + (i > 9 ? 0.0006 * (i - 9) : 0);
  const yaw = i < 8 ? 0.0006 * i : Math.sin((i - 8) * 0.55) * 0.022;
  return { pitch, yaw };
});

export function recoilAt(shotIndex: number, scale = 1): { pitch: number; yaw: number } {
  const i = Math.max(0, Math.min(RECOIL_PATTERN.length - 1, Math.floor(shotIndex)));
  const p = RECOIL_PATTERN[i];
  return { pitch: p.pitch * scale, yaw: p.yaw * scale };
}

/** sem atirar, o índice do spray cai até zerar em RECOVERY_S */
export function recoverShotIndex(shotIndex: number, sinceLastShot: number, dt: number, peak: number): number {
  if (sinceLastShot < 0.1 || shotIndex <= 0) return shotIndex;
  return Math.max(0, shotIndex - (Math.max(1, peak) / RECOVERY_S) * dt);
}
