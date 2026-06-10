// Silhuetas SVG simplificadas das armas para o killfeed (estilo HUD do CS).
// viewBox horizontal; preenchidas via fill herdado do CSS.

export const WEAPON_LABELS: Record<string, string> = {
  ak47: 'AK-47',
  m4: 'M4A1-S',
  awp: 'AWP',
  deagle: 'Desert Eagle',
  galil: 'Galil AR',
  usp: 'USP-S',
  glock: 'Glock-18',
  knife: 'Faca',
};

export function WeaponIcon({ weapon }: { weapon: string }) {
  switch (weapon) {
    case 'awp':
      return (
        <svg viewBox="0 0 96 24" aria-label="AWP">
          <rect x="2" y="10" width="58" height="3" rx="1.5" />
          <rect x="58" y="8" width="22" height="7" rx="2" />
          <rect x="78" y="9" width="16" height="4" rx="2" />
          <rect x="30" y="4" width="16" height="4" rx="2" />
          <rect x="33" y="2" width="3" height="4" />
          <rect x="40" y="2" width="3" height="4" />
          <path d="M62 15 L70 15 L68 23 L63 23 Z" />
          <rect x="50" y="13" width="6" height="6" rx="1" />
          <path d="M14 13 L22 13 L20 20 L16 20 Z" />
        </svg>
      );
    case 'ak47':
      return (
        <svg viewBox="0 0 96 24" aria-label="AK-47">
          <rect x="4" y="9" width="52" height="4" rx="1" />
          <rect x="54" y="7" width="20" height="6" rx="2" />
          <rect x="72" y="8" width="20" height="4" rx="2" />
          <path d="M58 13 L66 13 L63 22 L59 22 Z" />
          <path d="M38 13 L46 13 L44 21 Q39 20 38 13 Z" />
          <path d="M4 13 L14 13 L12 18 L6 17 Z" />
          <rect x="66" y="4" width="3" height="5" />
        </svg>
      );
    case 'm4':
      return (
        <svg viewBox="0 0 96 24" aria-label="M4A1-S">
          <rect x="2" y="9" width="34" height="4" rx="2" />
          <rect x="34" y="7" width="28" height="7" rx="2" />
          <rect x="60" y="8" width="24" height="5" rx="2" />
          <rect x="84" y="9" width="10" height="3" rx="1.5" />
          <rect x="40" y="3" width="14" height="4" rx="2" />
          <path d="M64 13 L72 13 L70 22 L65 22 Z" />
          <path d="M44 14 L51 14 L49 22 L45 22 Z" />
        </svg>
      );
    case 'galil':
      return (
        <svg viewBox="0 0 96 24" aria-label="Galil">
          <rect x="4" y="9" width="48" height="4" rx="1" />
          <rect x="50" y="7" width="22" height="6" rx="2" />
          <rect x="70" y="8" width="22" height="4" rx="2" />
          <path d="M54 13 L62 13 L59 22 L55 22 Z" />
          <path d="M34 13 L42 13 L40 20 L35 20 Z" />
          <rect x="60" y="3" width="3" height="5" />
        </svg>
      );
    case 'deagle':
      return (
        <svg viewBox="0 0 64 24" aria-label="Desert Eagle">
          <rect x="6" y="6" width="44" height="6" rx="2" />
          <rect x="2" y="7" width="8" height="4" rx="2" />
          <path d="M34 12 L46 12 L42 23 L35 23 Z" />
          <rect x="30" y="12" width="8" height="3" />
        </svg>
      );
    case 'usp':
      return (
        <svg viewBox="0 0 64 24" aria-label="USP-S">
          <rect x="2" y="7" width="18" height="5" rx="2" />
          <rect x="18" y="6" width="30" height="6" rx="2" />
          <path d="M34 12 L45 12 L41 23 L35 23 Z" />
        </svg>
      );
    case 'glock':
      return (
        <svg viewBox="0 0 64 24" aria-label="Glock-18">
          <rect x="8" y="6" width="40" height="6" rx="2" />
          <path d="M33 12 L44 12 L40 23 L34 23 Z" />
          <rect x="28" y="12" width="7" height="3" />
        </svg>
      );
    case 'knife':
      return (
        <svg viewBox="0 0 64 24" aria-label="Faca">
          <path d="M4 14 Q22 2 44 8 L46 11 Q26 12 8 17 Z" />
          <rect x="44" y="8" width="14" height="5" rx="2" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 64 24" aria-label={weapon}>
          <rect x="4" y="9" width="56" height="4" rx="2" />
        </svg>
      );
  }
}

export function HeadshotIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-label="headshot">
      <circle cx="10" cy="8" r="5" />
      <rect x="6" y="13" width="8" height="5" rx="2" />
      <circle cx="12" cy="7" r="1.6" fill="#12161b" />
    </svg>
  );
}
