// PÓS-JOGO COM EVIDÊNCIA — a tabela das suas chamadas, compartilhada pelos
// dois modos (A CHAMADA da Carreira e a SALA do RtP). Mostra O QUE VOCÊ
// DECIDIU, com que % na tela, e o que o dado deu — e separa, de propósito, a
// SORTE (placar ajustado: vitórias vs. Σ das odds) da DECISÃO (nota S–D pela
// qualidade da escolha frente às alternativas). Nada aqui inventa causa: só o
// que o motor de cada modo rolou.

import { useState } from 'react';
import { ct } from '../state/career-i18n';
import { MAP_LABELS } from '../types';
import {
  luckAdjusted, decisionGrade, bestCall, worstCall, luckLine,
  type DecisionEvent,
} from '../engine/roundLog';
import { shareDecisionCard } from '../state/decisionShareCard';
import '../styles/decision-review.css';

const STAKES_LABEL: Record<string, string> = {
  pistol: 'pistol', matchpoint: 'match point', clutch: 'clutch', overtime: 'OT', eco: 'eco',
};

const execVerdict = (perf: number) =>
  perf >= 0.92 ? 'PERFEITA' : perf >= 0.78 ? 'ÓTIMA' : perf >= 0.62 ? 'BOA' : perf >= 0.5 ? 'NA MÉDIA' : 'RUIM';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function DecisionReview({ events, title, nick, scoreLabel, won, mode }: {
  events: DecisionEvent[];
  title: string;              // "SUAS DECISÕES" / "SUAS CHAMADAS"
  nick: string;               // quem assina o share card
  scoreLabel: string;         // placar já formatado (fonte: o motor do modo)
  won: boolean | null;        // veredito da série (null = sem)
  mode: 'career' | 'rtp';
}) {
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'shared' | 'saved'>('idle');
  const luck = luckAdjusted(events);
  const grade = decisionGrade(events);
  const best = bestCall(events);
  const worst = worstCall(events);

  const share = async () => {
    if (shareState === 'busy') return;
    setShareState('busy');
    try {
      const r = await shareDecisionCard({ nick, mode, scoreLabel, won, events });
      setShareState(r);
    } catch { setShareState('idle'); }
    setTimeout(() => setShareState('idle'), 2200);
  };

  return (
    <section className="dr" aria-label={title}>
      <div className="dr-head">
        <div>
          <div className="dr-kicker">{ct('PÓS-JOGO COM EVIDÊNCIA')}</div>
          <div className="dr-title">{title}</div>
        </div>
        <span className="dr-spacer" />
        {events.length > 0 && (
          <button type="button" className="dr-share" onClick={share} disabled={shareState === 'busy'} title={ct('Gera o card das suas chamadas (PNG)')}>
            📸 {shareState === 'shared' ? ct('Compartilhado!') : shareState === 'saved' ? ct('Card salvo') : shareState === 'busy' ? '…' : ct('Card')}
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="dr-empty">
          {mode === 'rtp'
            ? ct('Nenhuma decisão registrada nesta série — a Sala resolveu no automático.')
            : ct('Você não deu nenhuma chamada nesta série. Ligue o Tático e comande os rounds-chave: cada golpe mostra a % antes de rolar.')}
        </div>
      ) : (
        <>
          {/* AS DUAS RÉGUAS — sorte × decisão, lado a lado e separadas */}
          <div className="dr-meters">
            <div className="dr-meter">
              <span className="dr-meter-big">{luck.actual}<i style={{ fontStyle: 'normal', fontSize: '.9rem', opacity: .6 }}>/{luck.n}</i></span>
              <span className="dr-meter-lbl">{ct('chamadas que deram')}</span>
              <span className="dr-meter-sub">{ct('o dado devia dar')} <b>{luck.expected.toFixed(1)}</b></span>
            </div>
            <div className="dr-meter">
              <span className={`dr-meter-big ${luck.deltaPct > 0 ? 'up' : luck.deltaPct < 0 ? 'down' : ''}`}>
                {luck.deltaPct > 0 ? '+' : luck.deltaPct < 0 ? '−' : ''}{Math.abs(luck.deltaPct)}%
              </span>
              <span className="dr-meter-lbl">{ct('placar ajustado pela sorte')}</span>
              <span className="dr-meter-sub">{ct(luckLine(luck))}</span>
            </div>
            <div className="dr-meter grade">
              <span className={`dr-grade g-${grade.grade}`}>{grade.grade}</span>
              <div>
                <span className="dr-meter-lbl">{ct('nota de decisão')}</span>
                <span className="dr-meter-sub">
                  {grade.edge != null
                    ? <>{ct('escolheu')} <b>{grade.edge > 0 ? '+' : ''}{grade.edge}pp</b> {ct('vs. a média do leque')}</>
                    : <>{ct('média escolhida')} <b>{pct(grade.chosenAvg)}</b></>}
                </span>
              </div>
            </div>
          </div>

          {/* A TABELA — beat/round × decisão × odds × execução × resultado */}
          <div className="dr-table-wrap">
            <table className="dr-table">
              <thead>
                <tr>
                  <th>{ct('Quando')}</th>
                  <th>{ct('Decisão')}</th>
                  <th>{ct('Odds')}</th>
                  <th>{ct('Execução')}</th>
                  <th>{ct('Deu?')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i}>
                    <td className="dr-when">
                      {MAP_LABELS[e.map] ?? e.map}{e.round != null && <> · <b>R{e.round}</b></>}
                      {e.stakes && e.stakes !== 'normal' && <span className={`dr-stakes s-${e.stakes}`}>{STAKES_LABEL[e.stakes] ?? e.stakes}</span>}
                    </td>
                    <td>
                      <span className="dr-label">{e.label}</span>
                      {e.actor && <span className="dr-actor">{e.actor}</span>}
                    </td>
                    <td className="dr-odds">
                      {e.pBase != null && Math.round(e.pBase * 100) !== Math.round(e.pWin * 100)
                        ? <><i>{pct(e.pBase)} →</i> {pct(e.pWin)}</>
                        : pct(e.pWin)}
                    </td>
                    <td>
                      {e.execPerf != null
                        ? <span className={`dr-exec e-${e.execPerf >= 0.62 ? 'good' : e.execPerf >= 0.5 ? 'mid' : 'bad'}`}>{ct(execVerdict(e.execPerf))}</span>
                        : <span className="dr-exec">—</span>}
                    </td>
                    <td>
                      {e.won
                        ? <span className="dr-res won">✓ {ct('deu')}</span>
                        : e.result === 'partial'
                          ? <span className="dr-res part">◐ {ct('parcial')}</span>
                          : <span className="dr-res lost">✗ {ct('não')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(best || worst) && (
            <div className="dr-picks">
              {best && best.pWin < 0.55 && (
                <div className="dr-pick best">
                  <span className="dr-pick-k">{ct('Maior aposta que pegou')}</span>
                  <b>{best.label}</b> · {ct('tinha')} {pct(best.pWin)}
                </div>
              )}
              {worst && worst.pWin >= 0.5 && (
                <div className="dr-pick worst">
                  <span className="dr-pick-k">{ct('Favorito que tropeçou')}</span>
                  <b>{worst.label}</b> · {ct('tinha')} {pct(worst.pWin)}
                </div>
              )}
            </div>
          )}

          <p className="dr-note">
            {ct('A % é a que estava na tela antes de rolar; o placar ajustado compara o que deu com a soma dessas %. A nota olha só a escolha — a sorte fica de fora.')}
          </p>
        </>
      )}
    </section>
  );
}
