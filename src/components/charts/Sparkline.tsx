// Sparkline — gráfico de tendência compacto (sem eixos, sem labels) usando
// Recharts. T2.2 do roadmap em .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Uso típico (widget de Dashboard, célula de tabela):
//   <Sparkline data={[60, 62, 58, 70, 75, 80]} tone="pos" width={120} height={28} />
//
// Tom: 'pos' (verde) sobe é bom; 'neg' (vermelho) sobe é ruim; 'neutral' (gold).
//   Pra dados como receita/wins → 'pos'. Pra custos/derrotas → 'neg'.
//
// Cor é derivada automaticamente da TENDÊNCIA (último vs primeiro):
//   - pos + sobe       → verde
//   - pos + cai/igual  → vermelho (perda visível)
//   - neg + cai        → verde (custo caindo é bom)
//   - neg + sobe       → vermelho (custo subindo é ruim)
//   - neutral          → sempre gold
//
// Recharts é overkill pra um sparkline simples, mas economiza implementação
// e fica consistente com os outros charts do Dashboard que vamos adicionar.
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from 'recharts';

export type SparklineTone = 'pos' | 'neg' | 'neutral';

export interface SparklineProps {
  // série numérica. Pode ser vazia (renderiza placeholder cinza).
  data: number[];
  tone?: SparklineTone;
  // largura/altura. Sem isso o ResponsiveContainer ocupa o pai — preferir
  // tamanhos fixos pra evitar layout shift.
  width?: number | string;
  height?: number;
  // se true, mostra o último valor como label no fim. Util em widgets KPI.
  showLastValue?: boolean;
  // tooltip ao hover. Default: false (sparkline puro, sem interatividade).
  tooltip?: boolean;
  // label do eixo Y no tooltip (ex.: 'R$', '%'). Sem efeito se tooltip=false.
  tooltipLabel?: string;
}

function colorFor(tone: SparklineTone, data: number[]): string {
  if (tone === 'neutral' || data.length < 2) return 'var(--em-gold)';
  const first = data[0];
  const last = data[data.length - 1];
  const goingUp = last > first;
  const goodGoingUp = tone === 'pos';
  const isGood = goingUp === goodGoingUp;
  return isGood ? 'var(--em-green, #4caf50)' : 'var(--em-red, #c0392b)';
}

export function Sparkline({
  data,
  tone = 'neutral',
  width = '100%',
  height = 28,
  showLastValue = false,
  tooltip = false,
  tooltipLabel,
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <div
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          height,
          background: 'var(--em-panel-2)',
          borderRadius: 3,
          opacity: 0.4,
        }}
        aria-label="sem dados"
      />
    );
  }

  const stroke = colorFor(tone, data);
  // Recharts espera array de objetos
  const series = data.map((y, i) => ({ i, y }));
  const last = data[data.length - 1];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        width: typeof width === 'number' ? `${width}px` : width,
      }}
    >
      <span style={{ flex: 1, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <YAxis hide domain={['dataMin', 'dataMax']} />
            {tooltip && (
              <Tooltip
                // Recharts tipa value como ValueType (que inclui undefined) — aceitamos isso e formatamos.
                formatter={(v) => [String(v ?? ''), tooltipLabel ?? ''] as [string, string]}
                labelFormatter={() => ''}
              />
            )}
            <Line
              type="monotone"
              dataKey="y"
              stroke={stroke}
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </span>
      {showLastValue && (
        <b style={{ color: stroke, fontFeatureSettings: '"tnum" 1', fontSize: '0.78rem' }}>
          {last}
        </b>
      )}
    </span>
  );
}
