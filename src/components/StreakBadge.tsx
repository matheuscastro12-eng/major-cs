// StreakBadge — T7.3 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Chip pequeno mostrando sequência atual de vitórias OU derrotas do clube.
// Hot streak (3+ wins) acende em chama. Cold streak (3+ losses) acende
// em frio. Strikes menores apenas mostram count discreto.
//
// Recebe um array de ('W' | 'L') na ORDEM CRONOLÓGICA (mais antigo primeiro).
// Calcula a sequência ATUAL (consecutivos a partir do fim).

interface Props {
  /** Histórico de resultados, ordenado do mais antigo pro mais recente. */
  results: ('W' | 'L')[];
  size?: 'sm' | 'md';
}

export function StreakBadge({ results, size = 'md' }: Props) {
  if (results.length === 0) return null;

  // Calcula streak atual a partir do final
  const last = results[results.length - 1];
  let count = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] === last) count++;
    else break;
  }

  // Hot = 3+ wins, Cold = 3+ losses, neutral = < 3
  const isHot = last === 'W' && count >= 3;
  const isCold = last === 'L' && count >= 3;

  const sizePx = size === 'sm' ? { pad: '2px 8px', font: '0.7rem', icon: 11 } : { pad: '4px 10px', font: '0.8rem', icon: 13 };

  if (isHot) {
    return (
      <span
        title={`${count} vitórias consecutivas`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: sizePx.pad,
          background: 'linear-gradient(135deg, #ff7846 0%, #ff4d2d 100%)',
          color: '#fff',
          borderRadius: 12,
          fontFamily: 'inherit',
          fontSize: sizePx.font,
          fontWeight: 800,
          letterSpacing: '0.3px',
          boxShadow: '0 0 12px rgba(255, 100, 50, 0.4)',
        }}
      >
        <span style={{ fontSize: sizePx.icon }}>🔥</span>
        {count}V
      </span>
    );
  }

  if (isCold) {
    return (
      <span
        title={`${count} derrotas consecutivas`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: sizePx.pad,
          background: 'rgba(64, 100, 160, 0.18)',
          color: '#9ab8e0',
          border: '1px solid rgba(120, 150, 200, 0.4)',
          borderRadius: 12,
          fontFamily: 'inherit',
          fontSize: sizePx.font,
          fontWeight: 700,
          letterSpacing: '0.3px',
        }}
      >
        <span style={{ fontSize: sizePx.icon }}>❄️</span>
        {count}D
      </span>
    );
  }

  // Neutral: chip discreto mostrando W/L
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: sizePx.pad,
        background: 'var(--em-panel-2)',
        color: 'var(--em-muted)',
        border: '1px solid var(--em-border)',
        borderRadius: 12,
        fontFamily: 'inherit',
        fontSize: sizePx.font,
        fontWeight: 700,
      }}
    >
      <span style={{ color: last === 'W' ? '#5ed88a' : '#e58a8a' }}>{count}{last}</span>
    </span>
  );
}
