// AcademyBadge — visual de time academy.
//
// Renderiza o logo do TIME PAI (MOUZ, NAVI, etc.) com a label "ACADEMY"
// embaixo — exatamente como o user pediu: "mouz nxt -> logo da mouz + escrito
// academy embaixo".
//
// Quando o parent é desconhecido (academy sem `parentId` no JSON), faz
// fallback pro TeamBadge clássico do próprio academy (sigla + cores).

import { TeamBadge } from './ui';

interface Props {
  /** Logo URL do time pai (do dataset bo3). Se ausente, usa fallback. */
  parentLogoUrl?: string;
  /** Cores [primária, secundária] do parent OU do próprio academy */
  colors: [string, string];
  /** Sigla pro fallback (quando não tem logo do parent) */
  fallbackTag: string;
  /** Cores do fallback se diferente das colors do parent */
  fallbackColors?: [string, string];
  /** Tamanho do badge (default 32) */
  size?: number;
  /** Mostra a label "ACADEMY" embaixo (default true). Set false em listas
   *  compactas onde não cabe. */
  showLabel?: boolean;
}

export function AcademyBadge({
  parentLogoUrl,
  colors,
  fallbackTag,
  fallbackColors,
  size = 32,
  showLabel = true,
}: Props) {
  const labelFontSize = Math.max(7, Math.round(size * 0.22));

  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        lineHeight: 1,
      }}
    >
      {parentLogoUrl ? (
        // Quadrado pequeno com bg de cor da org pai + logo centralizado
        <span
          style={{
            width: size,
            height: size,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(160deg, ${colors[0]} 0%, ${colors[1]}40 100%)`,
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <img
            src={parentLogoUrl}
            alt=""
            style={{
              width: size * 0.78,
              height: size * 0.78,
              objectFit: 'contain',
            }}
            loading="lazy"
          />
        </span>
      ) : (
        // Fallback: TeamBadge do próprio academy (sem parent mapeado)
        <TeamBadge tag={fallbackTag} colors={fallbackColors ?? colors} size={size} />
      )}
      {showLabel && (
        <span
          style={{
            fontSize: labelFontSize,
            fontWeight: 800,
            letterSpacing: '0.6px',
            color: 'var(--em-gold)',
            textTransform: 'uppercase',
            fontFamily: '"JetBrains Mono", monospace',
            opacity: 0.85,
            marginTop: 1,
          }}
        >
          Academy
        </span>
      )}
    </span>
  );
}
