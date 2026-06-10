// Emblema do Road to Major — identidade visual própria (sem depender do favicon).
// Conceito: escudo de Major com mira de CS + estrela de campeão e o "caminho"
// (chevron) subindo até o topo. Usa as cores da marca (azul + dourado).

export function BrandMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const id = `bm${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={`brand-mark ${className}`}
      role="img"
      aria-label="Road to Major"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a78ad" />
          <stop offset="1" stopColor="#1b2530" />
        </linearGradient>
        <linearGradient id={`${id}-star`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3cf6b" />
          <stop offset="1" stopColor="#cf9f3a" />
        </linearGradient>
      </defs>

      {/* escudo */}
      <path
        d="M32 3 L57 12 V32 C57 47 46 56 32 61 C18 56 7 47 7 32 V12 Z"
        fill={`url(#${id}-bg)`}
        stroke="#61a8dd"
        strokeWidth="2.5"
      />

      {/* caminho (chevrons subindo) */}
      <path d="M21 45 L32 38 L43 45" fill="none" stroke="#61a8dd" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <path d="M22 37 L32 31 L42 37" fill="none" stroke="#9fd0f0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />

      {/* mira de CS ao redor da estrela */}
      <circle cx="32" cy="22" r="11" fill="none" stroke="#dfe5ec" strokeWidth="1.6" opacity="0.55" />
      <line x1="32" y1="7" x2="32" y2="12" stroke="#dfe5ec" strokeWidth="1.6" opacity="0.55" />
      <line x1="32" y1="32" x2="32" y2="36" stroke="#dfe5ec" strokeWidth="1.6" opacity="0.55" />
      <line x1="17" y1="22" x2="22" y2="22" stroke="#dfe5ec" strokeWidth="1.6" opacity="0.55" />
      <line x1="42" y1="22" x2="47" y2="22" stroke="#dfe5ec" strokeWidth="1.6" opacity="0.55" />

      {/* estrela de campeão */}
      <polygon
        points="32,13 34.7,19.6 41.8,20.1 36.3,24.7 38.1,31.6 32,27.7 25.9,31.6 27.7,24.7 22.2,20.1 29.3,19.6"
        fill={`url(#${id}-star)`}
        stroke="#7a5e1f"
        strokeWidth="0.6"
      />
    </svg>
  );
}
