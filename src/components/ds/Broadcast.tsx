// Gramática de transmissão: Scoreboard (scorebug) e LowerThird (faixa de nome).
// É a assinatura visual do "Broadcast Desk": placar condensado com o chanfro,
// barra do lado (CT azul / T âmbar) e a faixa AO VIVO. Usar em Sala do RtP,
// partida da Carreira, pós-série e ranked — o mesmo placar em todo modo.
import type { ReactNode } from 'react';
import { LiveBadge } from './Tag';
import { cx } from './cx';

export interface ScoreTeam {
  name: ReactNode;
  score: number;
  /** lado atual no mapa: pinta a barra da borda e o subtítulo */
  side?: 'ct' | 't';
  /** subtítulo (padrão: o lado por extenso) */
  sub?: ReactNode;
}

export type ScoreStatus = 'live' | 'final' | 'upcoming';

const SIDE_LABEL = { ct: 'CT', t: 'T' } as const;

export function Scoreboard({ a, b, status = 'live', meta, maps, label, className }: {
  a: ScoreTeam;
  b: ScoreTeam;
  status?: ScoreStatus;
  /** linha técnica do meio: "MAPA 2 · MIRAGE", "MD3" */
  meta?: ReactNode;
  /** resultado mapa a mapa da série, do ponto de vista de A */
  maps?: Array<'me' | 'them' | null>;
  /** nome acessível (padrão: "A 13 x 9 B") */
  label?: string;
  className?: string;
}) {
  const winner = status === 'final' ? (a.score > b.score ? 'a' : b.score > a.score ? 'b' : null) : null;
  const leading = status === 'live' ? (a.score > b.score ? 'a' : b.score > a.score ? 'b' : null) : null;
  const aria = label ?? `${typeof a.name === 'string' ? a.name : 'Time A'} ${a.score} x ${b.score} ${typeof b.name === 'string' ? b.name : 'Time B'}`;
  const team = (t: ScoreTeam, key: 'a' | 'b') => (
    <div className={cx('ds-score__team', `ds-score__team--${key}`, winner === key && 'is-winner', leading === key && 'is-leading')} data-side={t.side}>
      <div className="ds-score__id">
        <span className="ds-score__name">{t.name}</span>
        {(t.sub != null || t.side) && <span className="ds-score__sub">{t.sub ?? SIDE_LABEL[t.side!]}</span>}
      </div>
      <span className="ds-score__pts">{t.score}</span>
    </div>
  );
  return (
    <div className={cx('ds-score', className)} role="group" aria-label={aria}>
      {team(a, 'a')}
      <div className="ds-score__mid">
        {status === 'live' ? <LiveBadge /> : <span className="ds-score__status">{status === 'final' ? 'Final' : 'A seguir'}</span>}
        {meta != null && <span className="ds-score__meta">{meta}</span>}
        {maps && maps.length > 0 && (
          <span className="ds-score__maps" aria-hidden>
            {maps.map((m, i) => <span key={i} className="ds-score__map" data-won={m ?? undefined} />)}
          </span>
        )}
      </div>
      {team(b, 'b')}
    </div>
  );
}

export function LowerThird({ kicker, name, sub, tone = 'accent', className }: {
  /** chip de cima: "CASTER", "MVP", "NOVO CONTRATO" */
  kicker?: ReactNode;
  name: ReactNode;
  /** linha técnica em mono: função, time, rating */
  sub?: ReactNode;
  /** achievement só pra conquista (MVP, título) */
  tone?: 'accent' | 'achievement';
  className?: string;
}) {
  return (
    <div className={cx('ds-lower', tone === 'achievement' && 'ds-lower--achievement', className)}>
      <span className="ds-lower__bar" aria-hidden />
      <div className="ds-lower__box">
        {kicker != null && <span className="ds-lower__kicker">{kicker}</span>}
        <span className="ds-lower__name">{name}</span>
        {sub != null && <span className="ds-lower__sub">{sub}</span>}
      </div>
    </div>
  );
}
