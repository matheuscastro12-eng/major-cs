// [realismo FM] Habilidade atual (CA) e potencial (PA) em estrelas, como no
// relatório de olheiro do FM. O PA é uma FAIXA (incerteza do olheiro).
import { ct } from '../../state/career-i18n';
import { starsOf } from '../../engine/attrs/stars';

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 1 : 0, maximumFractionDigits: 1 });

function StarRow({ filled, band }: { filled: number; band?: [number, number] }) {
  return (
    <span className="capa-stars" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, filled - i));
        const bLo = band ? Math.max(0, Math.min(1, band[0] - i)) : 0;
        const bHi = band ? Math.max(0, Math.min(1, band[1] - i)) : 0;
        // camadas: cheia (CA ou PA garantido) → faixa incerta → vazia
        const solid = band ? bLo : fill;
        const range = band ? bHi : 0;
        return (
          <span
            key={i}
            className="capa-star"
            style={{ ['--solid' as string]: `${solid * 100}%`, ['--range' as string]: `${range * 100}%` }}
          >★</span>
        );
      })}
    </span>
  );
}

export function CaPaStars({ ca, paRange }: { ca: number; paRange: [number, number] }) {
  const caS = starsOf(ca);
  const lo = starsOf(paRange[0]);
  const hi = Math.max(lo, starsOf(paRange[1]));
  const paLabel = lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
  return (
    <div
      className="capa"
      role="img"
      aria-label={`${ct('Habilidade atual')} ${fmt(caS)} ${ct('de 5 estrelas')}; ${ct('potencial')} ${paLabel} ${ct('estrelas')}`}
    >
      <span className="capa-item">
        <span className="capa-label">{ct('Habilidade')}</span>
        <StarRow filled={caS} />
      </span>
      <span className="capa-item" title={ct('Faixa do relatório de olheiro: quanto mais você conhece o jogador, mais estreita.')}>
        <span className="capa-label">{ct('Potencial')}</span>
        <StarRow filled={hi} band={[lo, hi]} />
        <span className="capa-range">{paLabel}</span>
      </span>
    </div>
  );
}
