// Aba Major — T1.4. Saiu de IIFE inline no CareerScreen (hubTab === 'major').
// Mostra banner do stage atual + caminho restante + Hub do bracket do Major.

import { CareerIcon } from '../../components/career/CareerIcon';
import { Hub } from '../../components/Hub';
import { ct } from '../../state/career-i18n';
import { getTeam } from '../../engine/swiss';
import type { Pairing, SeriesResult, Tournament, TTeam } from '../../types';

interface MajorPre {
  stage: number;
  advancers: { tag: string; name: string }[];
}

interface Props {
  majorT: Tournament;
  save: {
    majorStage?: number;
    majorUserStage?: number;
    majorPre?: MajorPre[];
    split: number;
    titles: number;
    budget: number;
  };
  playMajorMine: () => void;
  simMajorRound: () => void;
  setSelSeries: (s: { series: SeriesResult; teams: [TTeam, TTeam] }) => void;
}

export function MajorTab({ majorT, save, playMajorMine, simMajorRound, setSelSeries }: Props) {
  const st = save.majorStage ?? 1;
  const entered = save.majorUserStage ?? 1;
  // [fase 4 · circuito] stage 0 = RMR (regional classificatório pro Stage 1)
  const stLabel = st === 0 ? ct('RMR · suíço de 16 (os melhores vão ao Stage 1)') : st >= 4 ? ct('Champions Stage (playoffs)') : `Stage ${st} ${ct('de 3 · fase Suíça')}`;
  const enterTop = entered === 3 ? 8 : entered === 2 ? 16 : 24;
  const path = entered === 0 ? [0, 1, 2, 3, 4] : [1, 2, 3, 4];

  return (
    <>
      <div className="cal-major-banner now" style={{ marginBottom: 12 }}>
        <b><CareerIcon name="globe" size={14} /> {majorT.name.split(' · ')[0]}</b> ·{' '}
        <b>{st >= 4 && <CareerIcon name="trophy" size={14} />} {stLabel}</b>
        <div className="career-major-path" aria-label={ct('Seu caminho restante')}>
          {path.map((stageNumber) => {
            const auto = stageNumber < entered;
            const current = stageNumber === st;
            const done = stageNumber < st;
            return (
              <span
                key={stageNumber}
                className={`${auto ? 'auto ' : ''}${current ? 'current ' : ''}${done ? 'done' : ''}`.trim()}
              >
                <i>{done ? '✓' : stageNumber}</i>
                <b>{stageNumber === 4 ? 'Champions' : stageNumber === 0 ? 'RMR' : `Stage ${stageNumber}`}</b>
                <small>{auto ? ct('auto-simulado') : current ? ct('agora') : ct('pela frente')}</small>
              </span>
            );
          })}
        </div>
        <p className="career-major-copy">
          {entered === 0
            ? <>{ct('Você veio pelo')} <b>RMR</b> {ct('(fora do top 24 do VRS).')}{' '}</>
            : <>{ct('Você entrou direto no')} <b>Stage {entered}</b> (top {enterTop} VRS).{' '}</>}
          {st === 0 ? ct('Só os melhores pela campanha do RMR vão ao Stage 1.') : st < 4 ? ct('Top 8 avançam ao próximo stage.') : ct('Mata-mata MD3 (final MD5).')}
        </p>
        {(save.majorPre?.length ?? 0) > 0 && (
          <div className="career-major-pre">
            <b>{ct('Stages decididos antes da sua entrada')}</b>
            {save.majorPre!.map((p) => (
              <div key={p.stage}>
                Stage {p.stage}: {ct('classificados')} {p.advancers.map((a) => a.tag).join(', ')}
              </div>
            ))}
          </div>
        )}
      </div>
      <Hub
        t={majorT}
        career={{ season: save.split, titles: save.titles, budget: save.budget }}
        pickem={{ picks: {}, score: 0, total: 0 }}
        onPick={() => {}}
        onPlay={playMajorMine}
        onSimRound={simMajorRound}
        onStats={() => {}}
        onOpenSeries={(p: Pairing) =>
          p.result && setSelSeries({
            series: p.result,
            teams: [getTeam(majorT, p.a), getTeam(majorT, p.b)],
          })
        }
      />
    </>
  );
}
