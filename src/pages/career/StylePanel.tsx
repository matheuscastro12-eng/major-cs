// ESTILO DE JOGO (Plano de jogo › topo): o jeito de o time jogar, por lado.
// Cada estilo mostra o ENCAIXE com o elenco (barra 0–100 + efeito em pp de
// round no lado), a familiaridade do estilo, o que ele faz, o que valoriza e a
// variância — tudo saído das MESMAS funções que o motor usa (engine/gestao/estilo.ts).
import { Swords } from 'lucide-react';
import { Bar, CardButton, InfoTip, Panel, Tag, type TagTone } from '../../components/ds/index';
import {
  STYLES_CT, STYLES_T, STYLE_DESC, STYLE_FAVORS, STYLE_LABEL, STYLE_RPS, setStyle, styleFamOf, styleFit, styleOf, styleProfile, styleVariance,
} from '../../engine/gestao/estilo';
import type { StyleCT, StyleId, StyleT, TacticsState, TeamStyle } from '../../engine/gestao/model';
import { ct } from '../../state/career-i18n';
import type { Player } from '../../types';

const fitColor = (s: number) => (s >= 58 ? 'var(--c-win)' : s >= 45 ? 'var(--c-warn)' : 'var(--c-loss)');
const famTone = (f: number): TagTone => (f >= 65 ? 'win' : f >= 40 ? 'warn' : 'loss');
const ppTxt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)} pp`;

export interface StylePanelProps {
  tactics: TacticsState;
  onChange: (next: TacticsState) => void;
  players: Player[];
  mapFam: number;
  /** estilo provável do próximo adversário (null = sem partida ou leitura fraca) */
  oppStyle?: TeamStyle | null;
}

export function StylePanel({ tactics, onChange, players, mapFam, oppStyle }: StylePanelProps) {
  const cur = styleOf(tactics);
  const prof = styleProfile(players);
  const column = <S extends StyleId>(side: 't' | 'ct', list: S[]) => (
    <div className="sty-col" data-side={side}>
      <div className="sty-col__head">
        <Tag tone={side}>{side.toUpperCase()}</Tag>
        <span>{side === 't' ? ct('Estilo no ataque') : ct('Estilo na defesa')}</span>
      </div>
      <div className="sty-cards" role="radiogroup" aria-label={side === 't' ? ct('Estilo no ataque') : ct('Estilo na defesa')}>
        {list.map((s) => {
          const on = cur[side] === s;
          const fam = styleFamOf(tactics, side, s);
          const fit = styleFit(side, s, prof, fam, mapFam);
          const ideal = styleFit(side, s, prof, 100, mapFam);
          const k = styleVariance(side, s);
          const vsOpp = oppStyle ? (side === 't' ? STYLE_RPS[oppStyle.ct][s as StyleT] : -STYLE_RPS[s as StyleCT][oppStyle.t]) : 0;
          const favors = STYLE_FAVORS[side][s];
          return (
            <CardButton
              key={s}
              role="radio"
              aria-checked={on}
              selected={on}
              className="sty-card"
              onClick={() => !on && onChange(setStyle(tactics, { [side]: s } as Partial<TeamStyle>))}
            >
              <span className="sty-card__top">
                <b>{ct(STYLE_LABEL[s])}</b>
                {s !== 'standard' && <Tag tone={famTone(fam)}>{ct('Fam.')} {Math.round(fam)}</Tag>}
              </span>
              <span className="sty-fit">
                <Bar value={fit.score} tone={fitColor(fit.score)} label={`${ct('Encaixe com o elenco')} ${fit.score}`} />
                <span className="sty-fit__num" style={{ color: fitColor(fit.score) }}>{fit.score}</span>
                <span className="sty-fit__pp">{s === 'standard' ? ct('referência') : `${ppTxt(fit.pp)} ${ct('por round')}`}</span>
              </span>
              <span className="sty-card__desc">{ct(STYLE_DESC[side][s] ?? '')}</span>
              {favors && <span className="sty-card__fav"><span className="sty-k">{ct('Valoriza')}</span> {ct(favors)}</span>}
              <span className="sty-card__tags">
                {k < 1 && <Tag tone="warn">{ct('Mais variância')}</Tag>}
                {k > 1 && <Tag tone="ct">{ct('Menos variância')}</Tag>}
                {s !== 'standard' && fam < 50 && ideal.pp > fit.pp + 0.05 && <Tag>{ct('Treinado rende')} {ppTxt(ideal.pp)}</Tag>}
                {vsOpp > 0.4 && <Tag tone="win">{ct('Bom contra o estilo deles')}</Tag>}
                {vsOpp < -0.4 && <Tag tone="loss">{ct('Ruim contra o estilo deles')}</Tag>}
              </span>
            </CardButton>
          );
        })}
      </div>
    </div>
  );
  return (
    <Panel
      icon={<Swords size={16} />}
      title={ct('Estilo de jogo')}
      actions={(
        <InfoTip label={ct('Sobre o estilo de jogo')}>
          {ct('O jeito de o time jogar em todos os mapas, por cima do plano do mapa. Muda quem entra nos duelos, o peso de cada fase do round, as trocas, o plant e a variância. O encaixe sai dos atributos do elenco; a familiaridade do estilo sobe jogando com ele (+4 por mapa) e cai parada. Padrão é o jogo de sempre. Dá pra trocar ao vivo na partida.')}
        </InfoTip>
      )}
    >
      <div className="sty-grid">
        {column('t', STYLES_T)}
        {column('ct', STYLES_CT)}
      </div>
      {oppStyle && (
        <p className="tac-hint">
          {ct('Estilo provável do adversário')}: <b>T</b> {ct(STYLE_LABEL[oppStyle.t])} · <b>CT</b> {ct(STYLE_LABEL[oppStyle.ct])}
        </p>
      )}
    </Panel>
  );
}
