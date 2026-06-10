// Silhuetas SVG das armas para o killfeed, vistas de perfil (estilo HUD do CS).
// Arsenal: AK-47, M4A1-S, AWP, Desert Eagle, USP-S, Glock-18, MAC-10 e faca.

export const WEAPON_LABELS: Record<string, string> = {
  ak47: 'AK-47',
  m4: 'M4A1-S',
  awp: 'AWP',
  deagle: 'Desert Eagle',
  usp: 'USP-S',
  glock: 'Glock-18',
  mac10: 'MAC-10',
  knife: 'Faca',
};

export function WeaponIcon({ weapon }: { weapon: string }) {
  switch (weapon) {
    case 'ak47':
      // coronha inclinada, corpo, alça de mira, cano com massa de mira e o carregador curvo característico
      return (
        <svg viewBox="0 0 132 40" aria-label="AK-47">
          <path d="M2 16 L16 13 L18 21 L6 26 Z" />
          <path d="M16 13 L70 13 L70 21 L52 21 L48 19 L18 21 Z" />
          <rect x="26" y="10" width="30" height="3" rx="1" />
          <rect x="34" y="7" width="3" height="4" />
          <path d="M70 14 L106 14 L106 17.5 L70 17.5 Z" />
          <rect x="100" y="9" width="2.5" height="6" />
          <path d="M106 14.6 L116 14.6 L116 17 L106 17 Z" />
          <path d="M40 21 L48 21 L46 27 Q42 26 40 21 Z" />
          <path d="M52 21 L62 21 Q62 32 50 35 Q46 35 45 31 Q51 28 52 21 Z" />
        </svg>
      );
    case 'm4':
      // coronha telescópica, alça/trilho reto, carregador reto e o supressor longo da A1-S
      return (
        <svg viewBox="0 0 132 40" aria-label="M4A1-S">
          <path d="M2 13 L10 13 L10 23 L2 23 Z" />
          <path d="M10 16 L20 14 L20 21 L10 21 Z" />
          <path d="M20 12 L66 12 L66 21 L20 21 Z" />
          <rect x="24" y="8.5" width="38" height="3.5" rx="1.5" />
          <rect x="30" y="5.5" width="3" height="4" />
          <rect x="52" y="5.5" width="3" height="4" />
          <path d="M44 21 L52 21 L51 27 L45 27 Z" />
          <path d="M54 21 L62 21 L61 33 L56 33 Z" />
          <path d="M66 13.5 L88 13.5 L88 17 L66 17 Z" />
          <rect x="88" y="11.5" width="28" height="7" rx="3.5" />
        </svg>
      );
    case 'awp':
      // luneta grande em cima, corpo robusto, cano longo e grosso, apoio de bochecha
      return (
        <svg viewBox="0 0 132 40" aria-label="AWP">
          <path d="M2 18 L14 15 L16 25 L6 28 Z" />
          <path d="M12 21 L18 21 L18 26 L13 26 Z" />
          <path d="M14 15 L72 15 L72 23 L16 25 Z" />
          <rect x="30" y="7" width="26" height="6" rx="3" />
          <rect x="27" y="9" width="4" height="2.5" />
          <rect x="55" y="9" width="4" height="2.5" />
          <rect x="40" y="13" width="4" height="3" />
          <path d="M48 23 L56 23 L54 30 L49 30 Z" />
          <path d="M60 21 L68 21 L67 27 L61 27 Z" />
          <path d="M72 16 L112 16 L112 20 L72 20 Z" />
          <rect x="112" y="15" width="8" height="5.5" rx="2" />
        </svg>
      );
    case 'deagle':
      // slide longo e alto, cano exposto na frente, cabo inclinado
      return (
        <svg viewBox="0 0 80 40" aria-label="Desert Eagle">
          <path d="M4 12 L58 12 L58 20 L12 20 L4 18 Z" />
          <path d="M58 13.5 L66 13.5 L66 18.5 L58 18.5 Z" />
          <rect x="6" y="9.5" width="50" height="3" rx="1" />
          <path d="M34 20 L48 20 L44 35 Q36 35 35 30 Z" />
          <path d="M26 20 L36 20 Q33 26 28 25 Z" />
        </svg>
      );
    case 'usp':
      // pistola compacta com o supressor cilíndrico na frente
      return (
        <svg viewBox="0 0 80 40" aria-label="USP-S">
          <path d="M4 14 L40 14 L40 21 L10 21 L4 19 Z" />
          <rect x="40" y="13" width="26" height="8" rx="4" />
          <path d="M22 21 L34 21 L31 34 Q24 34 23 29 Z" />
          <path d="M16 21 L24 21 Q22 26 17 25 Z" />
        </svg>
      );
    case 'glock':
      // slide quadrado, sem supressor, cabo polímero
      return (
        <svg viewBox="0 0 80 40" aria-label="Glock-18">
          <path d="M8 13 L58 13 L58 20 L14 20 L8 18 Z" />
          <rect x="10" y="10.5" width="44" height="2.5" rx="1" />
          <path d="M34 20 L48 20 L44 34 Q36 34 35 29 Z" />
          <path d="M27 20 L36 20 Q34 25 28 24 Z" />
        </svg>
      );
    case 'mac10':
      // SMG em caixote: corpo retangular, cano curto e carregador longo na frente do cabo
      return (
        <svg viewBox="0 0 90 40" aria-label="MAC-10">
          <path d="M8 10 L60 10 L60 22 L8 22 Z" />
          <path d="M60 13 L74 13 L74 17 L60 17 Z" />
          <rect x="62" y="11" width="3" height="8" />
          <path d="M30 22 L40 22 L39 38 L32 38 Z" />
          <path d="M46 22 L56 22 L52 32 Q47 31 46 27 Z" />
          <rect x="2" y="13" width="6" height="4" rx="2" />
        </svg>
      );
    case 'knife':
      return (
        <svg viewBox="0 0 80 40" aria-label="Faca">
          <path d="M4 22 Q20 8 46 12 L48 16 Q28 18 8 26 Z" />
          <path d="M46 12 L64 13 L64 19 L48 18 Z" />
          <rect x="46" y="11" width="3" height="9" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 80 24" aria-label={weapon}>
          <rect x="4" y="9" width="72" height="4" rx="2" />
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
