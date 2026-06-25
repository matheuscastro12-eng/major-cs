import type { Lang } from '../../state/i18n';

const CC: Record<Lang, string> = { pt: 'br', en: 'us', es: 'es' };

/** Bandeira SVG compacta para o seletor de idioma. */
export function LangFlag({ lang, size = 18 }: { lang: Lang; size?: number }) {
  const cc = CC[lang];
  const h = Math.round(size * 0.72);
  const w = size;

  if (cc === 'br') {
    return (
      <svg className="lang-flag-svg" width={w} height={h} viewBox="0 0 20 14" aria-hidden>
        <rect width="20" height="14" fill="#009b3a" rx="1" />
        <path d="M10 1.5L18.2 7 10 12.5 1.8 7z" fill="#ffdf00" />
        <circle cx="10" cy="7" r="3.2" fill="#002776" />
        <path d="M7.2 7.8c1.8-.9 3.8-.9 5.6 0" stroke="#fff" strokeWidth=".55" fill="none" />
      </svg>
    );
  }

  if (cc === 'us') {
    return (
      <svg className="lang-flag-svg" width={w} height={h} viewBox="0 0 20 14" aria-hidden>
        {[0, 2, 4, 6, 8, 10, 12].map((y) => (
          <rect key={y} y={y} width="20" height="1" fill="#b22234" />
        ))}
        {[1, 3, 5, 7, 9, 11, 13].map((y) => (
          <rect key={`w${y}`} y={y} width="20" height="1" fill="#fff" />
        ))}
        <rect width="8.5" height="7.5" fill="#3c3b6e" />
        {[0, 1, 2, 3, 4].flatMap((row) =>
          [0, 1, 2, 3, 4, 5].map((col) => (
            <circle
              key={`${row}-${col}`}
              cx={1.2 + col * 1.35 + (row % 2 ? 0.65 : 0)}
              cy={1 + row * 1.25}
              r=".28"
              fill="#fff"
            />
          )),
        )}
      </svg>
    );
  }

  // es
  return (
    <svg className="lang-flag-svg" width={w} height={h} viewBox="0 0 20 14" aria-hidden>
      <rect width="20" height="14" fill="#c60b1e" rx="1" />
      <rect y="3.5" width="20" height="7" fill="#ffc400" />
      <rect x="4" y="5.2" width="2.8" height="3.6" fill="#c60b1e" opacity=".85" />
    </svg>
  );
}
